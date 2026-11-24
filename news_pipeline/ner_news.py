"""Langkah 4: NER BERT (cahya/bert-base-indonesian-NER, MIT) -> 04_ner.jsonl.

Logika diangkat dari notebook EDA_Cleaning_NER_BERT_Garut_Cianjur: chunk per kalimat dengan offset,
gabung span bertipe sama yang berdampingan, normalisasi nama, ambang skor, buang stoplist & nama media.
Offset 0-based, end eksklusif, mengacu ke article_clean (atau title untuk field='title').
"""
from __future__ import annotations

import itertools
import logging
import os
import re

from .storage import read_jsonl, write_jsonl

log = logging.getLogger("news.ner")

TIPE_NAMED = {"PER", "ORG", "GPE", "LOC", "FAC", "EVT", "PRD", "LAW", "NOR"}
RX_SENT = re.compile(r'(?<=[.!?"])\s+(?=[A-Z"(])|\n+')
HONORIFIK = re.compile(r"^(?:(?:H|Hj|Dr|dr|Ir|Drs|Dra|Prof|KH|K\.H|R|Rd|AKBP|AKP|Kombes|Kompol|Iptu|Ipda|Aiptu|Bripka|"
                       r"Brigjen|Irjen|Komjen|Jenderal|Letjen|Mayjen|Kolonel|Letkol|Mayor|Kapten|Pol|TNI)\.?\s+)+")
GELAR_BELAKANG = re.compile(r",\s*(?:[A-Z][A-Za-z]{0,4}\.?\s?){1,4}(?:,.*)?$")
ALIAS = {
    "Pemkab Cianjur": "Pemerintah Kabupaten Cianjur", "Pemkab Garut": "Pemerintah Kabupaten Garut",
    "Kabupaten Cianjur": "Cianjur", "Kab. Cianjur": "Cianjur", "Kabupaten Garut": "Garut", "Kab. Garut": "Garut",
    "Kementan": "Kementerian Pertanian", "Bapanas": "Badan Pangan Nasional", "Jabar": "Jawa Barat",
    "Provinsi Jawa Barat": "Jawa Barat",
}
STOP_ENT = {w.casefold() for w in (
    "Namun Sementara Selain Dengan Dalam Menurut Kemudian Adapun Bahkan Sedangkan Berdasarkan Saat Untuk Pada Hal "
    "Ini Itu Kami Kita Mereka Dia Ia Data Program Ada Bagi Tahun Kondisi Pemerintah Bupati Plt Pak Bu Ustaz Kepala "
    "Wakil Ketua Presiden Menteri Yayasan Forum Gerakan Satgas Poktan Pemkab Polres Polda Kementerian Dinas Kepolisian "
    "Senin Selasa Rabu Kamis Jumat Sabtu Minggu Januari Februari Maret April Mei Juni Juli Agustus "
    "September Oktober November Desember Barat Timur Utara Selatan Tengah Jalan Baru Kabupaten Kecamatan Desa").split()}
MEDIA = sorted({"antara", "antaranews", "times indonesia", "warta ekonomi", "media indonesia", "metro tv", "tribun",
                "tribunnews", "jpnn", "poskota", "liputan6", "kompas", "detikcom", "detik", "okezone", "viva",
                "koran jakarta", "katadata", "merdeka", "suara", "republika", "mediaindonesia", "timesindonesia"},
               key=len, reverse=True)
# Angka gaya Indonesia: titik = ribuan, koma = desimal, opsional diawali "Rp". Dipakai untuk menyatukan span
# MON/QTY yang terpecah oleh tokenizer BERT (mis. "Rp5" + "000" dari "Rp5.000").
TIPE_ANGKA = {"MON", "QTY"}
RX_NUMBER = re.compile(r"(?:Rp\.?\s?)?\d+(?:[.,]\d+)*")
RX_NUMWORD = re.compile(r"(?i)\b(?:satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|seratus|"
                        r"seribu|puluh|ratus|ribu|juta|miliar|triliun|setengah|separuh)\b")
RX_TAHUN = re.compile(r"(?:19|20)\d{2}")
RX_MEDIA = re.compile(r"(?i)(" + "|".join(map(re.escape, MEDIA)) + r")(\.co\.id|\.com|\.id)?( jabar| jawa barat| indonesia)?")


class NerModel:
    def __init__(self, nc: dict):
        import torch
        from transformers import AutoModelForTokenClassification, AutoTokenizer, pipeline
        dev = nc.get("device", "auto")
        device = (0 if torch.cuda.is_available() else -1) if dev == "auto" else int(dev)
        # Hindari unduhan ganda 443 MB: transformers otomatis mengambil versi safetensors di latar belakang.
        os.environ.setdefault("DISABLE_SAFETENSORS_CONVERSION", "1")
        os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
        self.tok = AutoTokenizer.from_pretrained(nc["model"])
        model = AutoModelForTokenClassification.from_pretrained(nc["model"])
        self.pipe = pipeline("token-classification", model=model, tokenizer=self.tok,
                             aggregation_strategy="first", device=device)
        self.nc = nc
        log.info("NER %s di %s", nc["model"], "GPU" if device == 0 else "CPU")

    def n_tokens(self, s: str) -> int:
        return len(self.tok.tokenize(s))

    def chunks(self, text: str) -> list[tuple[str, int]]:
        """(chunk, offset) dengan text[offset:offset+len(chunk)] == chunk."""
        max_tok = int(self.nc["max_tokens"])
        out, buf, buf_start, buf_tok, pos = [], "", 0, 0, 0
        for m in itertools.chain(RX_SENT.finditer(text), [None]):
            end = m.start() if m else len(text)
            sent = text[pos:end]
            st = self.n_tokens(sent)
            if buf and buf_tok + st > max_tok:
                out.append((buf, buf_start))
                buf, buf_tok = "", 0
            if not buf:
                buf_start, buf = pos, sent
            else:
                buf = text[buf_start:end]
            buf_tok += st
            if st > max_tok:                                 # kalimat sangat panjang: potong per kata
                acc, acc_start = [], buf_start
                for w in buf.split(" "):
                    if acc and self.n_tokens(" ".join(acc + [w])) > max_tok:
                        seg = " ".join(acc)
                        out.append((seg, acc_start))
                        acc_start += len(seg) + 1
                        acc = []
                    acc.append(w)
                buf, buf_start = " ".join(acc), acc_start
                buf_tok = self.n_tokens(buf)
            if m:
                pos = m.end()
        if buf.strip():
            out.append((buf, buf_start))
        return [(c, o) for c, o in out if c.strip()]

    def predict(self, texts: list[str]) -> list[list[dict]]:
        """NER untuk banyak teks sekaligus; mengembalikan span mentah per teks."""
        items = [(i, c, o) for i, t in enumerate(texts) for c, o in self.chunks(t or "")]
        result: list[list[dict]] = [[] for _ in texts]
        if not items:
            return result
        preds = self.pipe([c for _, c, _ in items], batch_size=int(self.nc["batch_size"]))
        for (i, chunk, off), ents in zip(items, preds):
            for e in ents:
                result[i].append({"label": e["entity_group"].split("-")[-1], "start": off + e["start"],
                                  "end": off + e["end"], "score": float(e["score"])})
        return result


def normalize(s: str, label: str) -> str:
    s = re.sub(r"\s+", " ", s).strip(" \t\"'.,;:()[]-–—")
    if label == "PER":
        s = GELAR_BELAKANG.sub("", HONORIFIK.sub("", s)).strip()
    return ALIAS.get(s, s)


def _expand_number(text: str, sp: dict) -> dict:
    """Lebarkan span MON/QTY agar mencakup angka utuh yang disentuhnya ("000" -> "Rp5.000")."""
    sp = dict(sp)
    if sp["label"] in TIPE_ANGKA:
        lo, hi = max(0, sp["start"] - 24), min(len(text), sp["end"] + 24)
        for m in RX_NUMBER.finditer(text, lo, hi):
            if m.start() < sp["end"] and m.end() > sp["start"]:
                sp["start"], sp["end"] = min(sp["start"], m.start()), max(sp["end"], m.end())
    return sp


def _valid_number(label: str, norm: str) -> bool:
    """MON/QTY wajib memuat angka atau kata bilangan; tahun polos ("2024") bukan kuantitas."""
    if label not in TIPE_ANGKA:
        return True
    if label == "QTY" and RX_TAHUN.fullmatch(norm):
        return False
    return bool(re.search(r"\d", norm) or RX_NUMWORD.search(norm))


def postprocess(text: str, spans: list[dict], nc: dict) -> list[dict]:
    """Gabung span berdampingan/tumpang tindih, normalisasi, dan filter kualitas."""
    keep = set(nc["keep_types"])
    merged: list[dict] = []
    for sp in sorted((_expand_number(text, s) for s in spans), key=lambda x: (x["start"], -x["end"])):
        cur = merged[-1] if merged else None
        if cur and sp["label"] == cur["label"] and sp["start"] - cur["end"] <= 1 \
                and text[cur["end"]:sp["start"]].strip() == "":
            cur["end"], cur["score"] = max(cur["end"], sp["end"]), min(cur["score"], sp["score"])
        else:
            merged.append(dict(sp))
    out = []
    for sp in merged:
        # rapikan tepi span dari tanda baca/spasi agar offset tepat menunjuk kata
        while sp["start"] < sp["end"] and text[sp["start"]] in " \t\n\"'.,;:()[]-–—":
            sp["start"] += 1
        while sp["end"] > sp["start"] and text[sp["end"] - 1] in " \t\n\"'.,;:()[]-–—":
            sp["end"] -= 1
        surface = text[sp["start"]:sp["end"]]
        label = sp["label"]
        norm = normalize(surface, label)
        if label not in keep or sp["score"] < float(nc["score_min"]) or len(norm) < 3 \
                or not _valid_number(label, norm):
            continue
        if label in TIPE_NAMED and (not re.search(r"[A-Z]", norm) or norm.casefold() in STOP_ENT
                                    or RX_MEDIA.fullmatch(norm)):
            continue
        out.append({"label": label, "text": surface, "norm": norm, "start": sp["start"], "end": sp["end"],
                    "score": round(sp["score"], 4)})
    return out


def _offset_ok(ents: list[dict], text: str, art_id: str) -> list[dict]:
    """Buang entitas yang offsetnya tidak menunjuk teksnya (bukan assert: satu artikel tidak boleh menggagalkan run)."""
    ok = [e for e in ents if text[e["start"]:e["end"]] == e["text"]]
    if len(ok) != len(ents):
        log.warning("Artikel %s: %d entitas dibuang karena offset tidak cocok", art_id, len(ents) - len(ok))
    return ok


def run(ctx, model: NerModel | None = None) -> int:
    out = ctx.path("04_ner.jsonl")
    if out.exists() and not ctx.force:
        log.info("04_ner.jsonl sudah ada, dilewati")
        return len(read_jsonl(out))
    arts = read_jsonl(ctx.path("03_clean.jsonl"))
    if not arts:
        write_jsonl(out, [])
        return 0
    nc = ctx.cfg["ner"]
    model = model or NerModel(nc)
    bodies = model.predict([a["article_clean"] for a in arts])
    titles = model.predict([a["title"] for a in arts])
    rows = []
    for a, b, t in zip(arts, bodies, titles):
        ents = _offset_ok(postprocess(a["article_clean"], b, nc), a["article_clean"], a["id"])
        tents = _offset_ok(postprocess(a["title"], t, nc), a["title"], a["id"])
        rows.append({"id": a["id"], "entities": ents, "title_entities": tents})
    n = write_jsonl(out, rows)
    log.info("04_ner.jsonl: %d artikel, %d entitas", n, sum(len(r["entities"]) for r in rows))
    ctx.extras["ner_model"] = model                         # dipakai ulang langkah ringkasan (cek halusinasi)
    return n