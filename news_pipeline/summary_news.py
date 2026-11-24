"""Langkah 6: ringkasan per berita (hanya artikel relevan) -> 06_summary.jsonl.

method:
  idt5 : model idT5 hasil fine-tuning (notebook idT5_IndoSum_Summarization_FineTuning).
  lead : kalimat pembuka (baseline Lead-3; di test IndoSum notebook Anda ROUGE-L = 62,25).
  auto : idt5 bila model_path tersedia, selain itu lead.
Pengaman halusinasi: entitas di ringkasan idT5 harus ada di artikel (entity precision) dan SEMUA angka di ringkasan
harus ada di artikel (number precision = 1). Bila tidak, ringkasan diganti Lead dan ditandai `fallback`.
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path

from .storage import read_jsonl, write_jsonl

log = logging.getLogger("news.summary")
RX_SENT_SPLIT = re.compile(r"(?<=[.!?])[\"”']?\s+(?=[A-Z0-9\"“(])")


QUOTE_START = ('"', "“", "'", "‘")


def lead_summary(text: str, n_sent: int, max_words: int) -> str:
    """Kalimat pembuka berita, melewati kalimat kutipan langsung (sering terpotong & kehilangan konteks)."""
    paras = [p for p in text.split("\n") if p.strip()]
    sents = [s.strip() for p in paras for s in RX_SENT_SPLIT.split(p) if s.strip()]
    clean = [s for s in sents if not s.startswith(QUOTE_START) and s.count('"') % 2 == 0
             and s.count("“") == s.count("”")]
    sents = clean or sents
    out: list[str] = []
    for s in sents:
        if out and len(" ".join(out + [s]).split()) > max_words:
            break
        out.append(s)
        if len(out) >= n_sent:
            break
    summary = " ".join(out) if out else " ".join(text.split()[:max_words])
    words = summary.split()
    return summary if len(words) <= max_words + 15 else " ".join(words[:max_words]).rstrip(",;:") + "…"


class IdT5:
    def __init__(self, sc: dict):
        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        path = sc["model_path"]
        cfg_file = Path(path) / "inference_config.json"
        self.p = dict(sc)
        if cfg_file.exists():                              # parameter yang disimpan notebook fine-tuning
            self.p.update(json.loads(cfg_file.read_text()))
            if "max_target_len" in self.p:
                self.p["max_new_tokens"] = self.p["max_target_len"]
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.tok = AutoTokenizer.from_pretrained(path)
        self.model = AutoModelForSeq2SeqLM.from_pretrained(path).to(self.device).eval()
        self.torch = torch
        self.name = f"idt5:{Path(path).name or path}"
        log.info("Ringkasan memakai %s di %s", path, self.device)

    def __call__(self, texts: list[str], bs: int = 8) -> list[str]:
        out: list[str] = []
        max_in = int(self.p["max_input_len"])
        n_cut = sum(len(self.tok(self.p["prefix"] + t)["input_ids"]) > max_in for t in texts)
        if n_cut:
            log.warning("%d dari %d artikel lebih panjang dari %d token: bagian akhirnya tidak ikut diringkas",
                        n_cut, len(texts), max_in)
        for i in range(0, len(texts), bs):
            enc = self.tok([self.p["prefix"] + t for t in texts[i:i + bs]], max_length=int(self.p["max_input_len"]),
                           truncation=True, padding=True, return_tensors="pt").to(self.device)
            with self.torch.no_grad():
                gen = self.model.generate(**enc, max_new_tokens=int(self.p["max_new_tokens"]),
                                          num_beams=int(self.p["num_beams"]),
                                          no_repeat_ngram_size=int(self.p["no_repeat_ngram"]), early_stopping=True)
            out += [g.strip() for g in self.tok.batch_decode(gen, skip_special_tokens=True)]
        return out


def entity_precision(summary_ents: list[dict], article: str) -> float | None:
    """Proporsi entitas bernama di ringkasan yang juga ada di artikel (Nan et al., 2021).

    Entitas dianggap didukung bila bentuk aslinya (`text`) ATAU bentuk normalnya (`norm`) ada di artikel, sehingga
    singkatan seperti "Kementan" (norm: "Kementerian Pertanian") tidak dianggap karangan.
    """
    a = article.casefold()
    groups: dict[str, set[str]] = {}
    for e in summary_ents:
        if e["label"] in {"PER", "ORG", "NOR", "GPE", "LOC", "EVT", "PRD"}:
            groups.setdefault(e["norm"].casefold(), set()).update({e["norm"].casefold(), e.get("text", "").casefold()})
    if not groups:
        return None
    return sum(any(f and f in a for f in forms) for forms in groups.values()) / len(groups)


RX_NUM = re.compile(r"\d+(?:[.,]\d+)*")


def _numbers(text: str) -> set[str]:
    # titik = pemisah ribuan (gaya Indonesia): "6.500" dan "6500" dianggap sama
    return {m.group().replace(".", "").rstrip(",") for m in RX_NUM.finditer(text)}


def number_precision(summary: str, article: str) -> float | None:
    """Proporsi angka di ringkasan yang juga ada di artikel. Angka (harga, tonase) tidak dicek entity_precision,
    padahal halusinasi angka paling sering terjadi pada ringkasan abstraktif (Zhao et al., 2020)."""
    nums = _numbers(summary)
    if not nums:
        return None
    return len(nums & _numbers(article)) / len(nums)


def _load_summarizer(sc: dict):
    method = sc["method"]
    if method == "lead":
        return None
    if not sc.get("model_path"):
        if method == "idt5":
            raise RuntimeError("summary.method=idt5 tetapi summary.model_path kosong")
        log.warning("summary.model_path kosong: memakai Lead-%s", sc["lead_sentences"])
        return None
    try:
        return IdT5(sc)
    except Exception as e:  # noqa: BLE001
        if method == "idt5":
            raise
        log.warning("Model idT5 gagal dimuat (%s): memakai Lead", e)
        return None


def run(ctx) -> int:
    out = ctx.path("06_summary.jsonl")
    if out.exists() and not ctx.force:
        log.info("06_summary.jsonl sudah ada, dilewati")
        return len(read_jsonl(out))
    sc = ctx.cfg["summary"]
    cls = {r["id"]: r for r in read_jsonl(ctx.path("05_classified.jsonl"))}
    arts = [a for a in read_jsonl(ctx.path("03_clean.jsonl")) if cls.get(a["id"], {}).get("wilayah")]
    if not arts:
        write_jsonl(out, [])
        log.info("Tidak ada artikel relevan untuk diringkas")
        return 0
    lead_name = f"lead-{sc['lead_sentences']}"
    leads = [lead_summary(a["article_clean"], int(sc["lead_sentences"]), int(sc["max_words"])) for a in arts]
    summarizer = _load_summarizer(sc)
    rows = []
    if summarizer is None:
        rows = [{"id": a["id"], "summary": s, "summary_model": lead_name, "entity_precision": None, "fallback": False}
                for a, s in zip(arts, leads)]
    else:
        preds = summarizer([a["article_clean"] for a in arts])
        ner = ctx.extras.get("ner_model")
        if ner is None:
            from .ner_news import NerModel
            ner = NerModel(ctx.cfg["ner"])
        from .ner_news import postprocess
        spans = ner.predict(preds)
        thr = float(sc["min_entity_precision"])
        for a, p, sp, ld in zip(arts, preds, spans, leads):
            ep = entity_precision(postprocess(p, sp, ctx.cfg["ner"]), a["article_clean"])
            npr = number_precision(p, a["article_clean"])
            bad = (ep is not None and ep < thr) or (npr is not None and npr < 1.0) or len(p.split()) < 8
            rows.append({"id": a["id"], "summary": ld if bad else p, "summary_model": lead_name if bad else summarizer.name,
                         "entity_precision": ep, "number_precision": npr, "fallback": bad})
    n = write_jsonl(out, rows)
    log.info("06_summary.jsonl: %d ringkasan | fallback ke lead: %d", n, sum(r["fallback"] for r in rows))
    return n
