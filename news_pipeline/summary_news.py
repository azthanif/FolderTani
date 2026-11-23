"""Langkah 6: ringkasan per berita (hanya artikel relevan) -> 06_summary.jsonl.

method:
  idt5 : model idT5 hasil fine-tuning (notebook idT5_IndoSum_Summarization_FineTuning).
  lead : kalimat pembuka (baseline Lead-3; di test IndoSum notebook Anda ROUGE-L = 62,25).
  auto : idt5 bila model_path tersedia, selain itu lead.
Pengaman halusinasi: entitas di ringkasan idT5 harus ada di artikel (entity precision). Bila di bawah
min_entity_precision, ringkasan diganti Lead dan ditandai `fallback`.
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
    names = {e["norm"] for e in summary_ents if e["label"] in {"PER", "ORG", "NOR", "GPE", "LOC", "EVT", "PRD"}}
    if not names:
        return None
    a = article.casefold()
    return sum(n.casefold() in a for n in names) / len(names)


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
            bad = (ep is not None and ep < thr) or len(p.split()) < 8
            rows.append({"id": a["id"], "summary": ld if bad else p, "summary_model": lead_name if bad else summarizer.name,
                         "entity_precision": ep, "fallback": bad})
    n = write_jsonl(out, rows)
    log.info("06_summary.jsonl: %d ringkasan | fallback ke lead: %d", n, sum(r["fallback"] for r in rows))
    return n
