"""Langkah 6: ringkasan per berita (hanya artikel relevan) -> 06_summary.jsonl.

method:
  idt5 : model idT5 hasil fine-tuning (notebook idT5_IndoSum_Summarization_FineTuning).
  lead : kalimat pembuka (baseline Lead-3; di test IndoSum notebook Anda ROUGE-L = 62,25).
  llm  : LLM lewat API kompatibel OpenAI (default Groq, free tier). Kunci dari env summary.llm.api_key_env.
  auto : idt5 bila model_path tersedia, lalu llm bila API key LLM tersedia, selain itu lead.
Pengaman halusinasi: entitas di ringkasan idT5 harus ada di artikel (entity precision) dan SEMUA angka di ringkasan
harus ada di artikel (number precision = 1). Bila tidak, ringkasan diganti Lead dan ditandai `fallback`.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
from pathlib import Path

import requests

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


LLM_SYSTEM = (
    "Anda editor berita pertanian Indonesia. Ringkas artikel yang diberikan dalam bahasa Indonesia baku, "
    "2-3 kalimat, maksimal {max_words} kata. Hanya gunakan fakta yang tertulis di artikel: jangan menambah nama, "
    "angka, tanggal, atau opini. Tulis angka persis seperti di artikel. Fokus pada apa yang terjadi, siapa, di mana, "
    "dan dampaknya bagi petani atau harga gabah/beras. Jawab hanya dengan teks ringkasan, tanpa judul atau poin."
)


class LlmSummarizer:
    """Ringkasan abstraktif lewat endpoint chat-completions kompatibel OpenAI (Groq secara default).

    Ramah free tier: jeda antar-permintaan (min_interval_sec), artikel dipotong ke max_chars, dan HTTP 429
    dicoba ulang sesuai header Retry-After. Kegagalan per artikel menghasilkan None (pemanggil memakai Lead).
    """

    def __init__(self, sc: dict, session: requests.Session | None = None):
        self.c = sc["llm"]
        self.key = os.getenv(self.c["api_key_env"], "").strip()
        if not self.key:
            raise RuntimeError(f"Env {self.c['api_key_env']} kosong")
        self.max_words = int(sc["max_words_llm"])
        self.s = session or requests.Session()
        self.name = f"llm:{self.c['model']}"
        self._last = 0.0
        self._extra = dict(self.c.get("extra_body") or {})   # mis. reasoning_effort untuk model gpt-oss
        log.info("Ringkasan memakai %s (%s)", self.c["model"], self.c["base_url"])

    def _wait(self) -> None:
        gap = float(self.c["min_interval_sec"]) - (time.monotonic() - self._last)
        if gap > 0:
            time.sleep(gap)
        self._last = time.monotonic()

    def _post(self, body: dict) -> requests.Response:
        return self.s.post(self.c["base_url"].rstrip("/") + "/chat/completions", json=body,
                           headers={"Authorization": f"Bearer {self.key}"}, timeout=int(self.c["timeout_sec"]))

    def one(self, title: str, article: str) -> str | None:
        body = {"model": self.c["model"], "temperature": float(self.c["temperature"]),
                "max_tokens": int(self.c["max_tokens"]),
                "messages": [{"role": "system", "content": LLM_SYSTEM.format(max_words=self.max_words)},
                             {"role": "user", "content": f"Judul: {title}\n\nArtikel:\n{article[:int(self.c['max_chars'])]}"}]}
        for attempt in range(int(self.c["max_retries"]) + 1):
            self._wait()
            try:
                r = self._post(body | self._extra)
            except requests.RequestException as e:
                log.warning("LLM gagal dihubungi (%s)", e)
                continue
            if r.status_code == 429:
                wait = min(float(r.headers.get("retry-after") or 10), 60)
                log.warning("LLM kena batas laju (429), tunggu %.0f detik", wait)
                time.sleep(wait)
                continue
            if r.status_code == 400 and self._extra:          # parameter tambahan tidak didukung model ini
                log.warning("LLM menolak parameter %s: dicoba tanpa itu", sorted(self._extra))
                self._extra = {}
                continue
            if r.status_code >= 400:
                log.warning("LLM error %s: %s", r.status_code, r.text[:200])
                return None
            try:
                text = r.json()["choices"][0]["message"]["content"] or ""
            except (ValueError, KeyError, IndexError, TypeError):
                log.warning("Respons LLM tidak terbaca")
                return None
            text = re.sub(r"\s+", " ", re.sub(r"(?s)<think>.*?</think>", "", text)).strip().strip('"')
            return text or None
        return None

    def __call__(self, items: list[tuple[str, str]]) -> list[str | None]:
        return [self.one(t, a) for t, a in items]


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
    if method == "llm" or (method == "auto" and not sc.get("model_path")):
        try:
            return LlmSummarizer(sc)
        except RuntimeError as e:
            if method == "llm":
                raise
            log.warning("%s dan summary.model_path kosong: memakai Lead-%s", e, sc["lead_sentences"])
            return None
    if not sc.get("model_path"):
        raise RuntimeError("summary.method=idt5 tetapi summary.model_path kosong")
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
        if isinstance(summarizer, LlmSummarizer):
            preds = summarizer([(a.get("title", ""), a["article_clean"]) for a in arts])
        else:
            preds = summarizer([a["article_clean"] for a in arts])
        preds = [p or "" for p in preds]                       # gagal (None) -> kosong -> fallback Lead
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
    log.info("06_summary.jsonl: %d ringkasan | model: %s | fallback ke lead: %d", n,
             summarizer.name if summarizer else lead_name, sum(r["fallback"] for r in rows))
    return n
