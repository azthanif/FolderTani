"""Langkah 5: tentukan wilayah (Garut / Cianjur / Nasional) & kategori topik -> 05_classified.jsonl.

Aturan (transparan, bisa diaudit lewat kolom `reasons`):
  Topik pertanian terpenuhi bila judul memuat kata inti padi/gabah, ATAU badan memuat >= 2 kata inti
    dan >= topic_min_hits kata topik.
  Target T relevan bila topik pertanian terpenuhi DAN salah satu:
    - T atau kecamatannya disebut di judul;
    - T disebut >= min_body_mentions kali di badan (regex + entitas GPE/LOC hasil NER, ambil maksimum);
    - T disebut >= 1 kali dan muncul di paragraf pembuka atau bersama nama kecamatannya.
  Bila judul menyebut wilayah lain (mis. Sukabumi) tanpa menyebut T, T wajib disebut >= 3 kali di badan.
  Nasional bila kata inti >= national_min_hits, penanda cakupan nasional >= 2, dan judul tidak menyebut
    kabupaten/kota/provinsi tertentu (target maupun wilayah lain).
Kecamatan bernama ganda (mis. Leles, Sukaresmi, Karangtengah ada di Garut & Cianjur) hanya dihitung
bila ditulis "Kecamatan X" dan nama kabupatennya ikut disebut.
"""
from __future__ import annotations

import logging
import re

from . import gazetteer as gz
from .storage import read_jsonl, write_jsonl

log = logging.getLogger("news.classifier")
LOC_LABELS = {"GPE", "LOC"}


def _only_in_lists(t: str, text: str) -> bool:
    """True bila setiap sebutan T berada di dalam daftar wilayah, mis. 'Brebes, Garut, Cianjur, dan Magelang'."""
    hits = list(re.finditer(rf"\b{re.escape(t)}\b", text, re.I))
    if not hits:
        return False
    # "Kabupaten T" / "Kab. T" adalah sebutan lokatif eksplisit (alamat), tidak pernah dianggap daftar
    enum = re.compile(rf"([A-Z][\w.]+\s*,\s*(?<!kabupaten )(?<!kab\. ){re.escape(t)}\b)|(\b{re.escape(t)}\s*,\s*(?:dan\s+)?[A-Z])"
                      rf"|(\b(?:dan|serta)\s+{re.escape(t)}\b)")
    spans = [m.span() for m in enum.finditer(text)]
    return all(any(a <= h.start() < b for a, b in spans) for h in hits)


def _ner_count(ents: list[dict], names: set[str]) -> int:
    n = 0
    for e in ents:
        if e["label"] in LOC_LABELS:
            key = re.sub(r"^(kabupaten|kab\.?|pemkab|kecamatan|kota)\s+", "", e["norm"], flags=re.I).casefold()
            n += key in names
    return n


def classify(article: dict, ner: dict, cc: dict) -> dict:
    title, body = article["title"], article["article_clean"]
    text = f"{title}\n{body}"
    ents, tents = ner.get("entities", []), ner.get("title_entities", [])
    topic_hits = len(gz.RX_TOPIC.findall(text))
    core_found = [m.casefold() for m in gz.RX_CORE.findall(text)]
    core_hits, core_distinct = len(core_found), len(set(core_found))
    title_topic = bool(gz.RX_CORE.search(title))
    topic_ok = (not cc["require_topic"]) or title_topic or (core_distinct >= 2 and topic_hits >= int(cc["topic_min_hits"]))
    lead = body[:400]
    title_other = bool(gz.RX_OTHER.search(title)) or any(
        e["label"] in LOC_LABELS and gz.RX_OTHER.search(e["norm"]) for e in tents)

    wilayah, score = [], 0.0
    reasons = {"topic_hits": topic_hits, "core_hits": core_hits, "core_distinct": core_distinct, "title_topic": title_topic,
               "title_other_region": title_other}
    any_title_target = False
    for t in cc["targets"]:
        rx_kab, rx_kec, rx_amb = gz.RX_KAB[t], gz.RX_KEC[t], gz.RX_KEC_AMBIG[t]
        kec_names = {k.casefold() for k in gz.KECAMATAN[t] if k not in gz.AMBIGUOUS and k != t}  # "Cianjur" = kab, bukan kec
        title_hit = bool(rx_kab.search(title) or rx_kec.search(title) or _ner_count(tents, {t.casefold()}))
        any_title_target |= title_hit
        body_kab = max(len(rx_kab.findall(body)), _ner_count(ents, {t.casefold()}))
        kec = len(rx_kec.findall(body)) + max(0, _ner_count(ents, kec_names) - len(rx_kec.findall(body)))
        if body_kab >= 1:
            kec += len(rx_amb.findall(body)) + len(gz.RX_KEC_ADDR[t].findall(text))
        lead_hit = bool(rx_kab.search(lead)) and not _only_in_lists(t, lead)   # sebutan dalam daftar wilayah = sekilas
        relevant = title_hit or body_kab >= int(cc["min_body_mentions"]) or (body_kab >= 1 and (lead_hit or kec >= 1))
        if title_other and not title_hit:                    # berita wilayah lain yang menyebut T sekilas
            relevant = body_kab >= 3
        s = 3 * title_hit + body_kab + 0.5 * kec + lead_hit
        reasons[t] = {"title": title_hit, "body": body_kab, "kecamatan": kec, "lead": lead_hit, "score": s}
        if relevant and topic_ok:
            wilayah.append(t)
            score = max(score, s)

    national_hits = len(gz.RX_NATIONAL.findall(text))
    title_regional = title_other or bool(gz.RX_PROVINCE.search(title) or gz.RX_ANY_REGION_TITLE.search(title))
    lead_regional = bool(gz.RX_OTHER.search(lead))           # mis. "Bendungan X di Tasikmalaya ..." = berita daerah
    national = (core_hits >= int(cc["national_min_hits"]) and core_distinct >= 3 and not title_regional
                and not any_title_target and (national_hits >= 3 or (national_hits >= 2 and not lead_regional)))
    reasons.update({"national_hits": national_hits, "title_regional": title_regional, "lead_regional": lead_regional})
    if national:
        wilayah.append("Nasional")
        score = max(score, 1 + national_hits / 2)
    return {"id": article["id"], "wilayah": wilayah, "kategori": gz.category_of(title + " " + body[:1500]),
            "relevance": round(score + topic_hits / 5, 2), "reasons": reasons}


def run(ctx) -> int:
    out = ctx.path("05_classified.jsonl")
    if out.exists() and not ctx.force:
        log.info("05_classified.jsonl sudah ada, dilewati")
        return len(read_jsonl(out))
    unknown = set(ctx.cfg["classifier"]["targets"]) - set(gz.KECAMATAN)
    if unknown:
        raise ValueError(f"classifier.targets {sorted(unknown)} belum ada di gazetteer.KECAMATAN; tambahkan daftar kecamatannya")
    arts = read_jsonl(ctx.path("03_clean.jsonl"))
    ner = {r["id"]: r for r in read_jsonl(ctx.path("04_ner.jsonl"))}
    rows = [classify(a, ner.get(a["id"], {}), ctx.cfg["classifier"]) for a in arts]
    n = write_jsonl(out, rows)
    from collections import Counter
    dist = Counter("+".join(r["wilayah"]) or "(tidak relevan)" for r in rows)
    log.info("05_classified.jsonl: %d artikel | %s", n, dict(dist))
    return n
