"""Pembersih teks berita hasil ekstraksi Media Cloud (newspaper3k / trafilatura / selenium).

Pakai:
    from news_cleaner import clean_corpus
    df_clean, report = clean_corpus(df)          # df minimal punya: id, title, + kolom full_text*
Prinsip: huruf besar-kecil & tanda baca dipertahankan (dibutuhkan NER & model ringkasan).
"""
import hashlib
import re
from collections import Counter

import pandas as pd

# Urutan prioritas sumber teks: trafilatura paling lengkap, newspaper3k sebagai cadangan.
SOURCE_PRIORITY = ["full_text_trafilatura", "full_text", "full_text_selenium"]

# Tanda halaman gagal diekstrak (blokir 403, Cloudflare, error newspaper3k).
FAIL_PATTERNS = re.compile(
    r"^Error:|security verification|Performance and Security by Cloudflare|"
    r"Maaf, Anda tidak memiliki akses|You must `download\(\)`",
    re.I,
)

# Baris boilerplate yang dibuang utuh.
DROP_LINE = re.compile(
    r"^\s*(baca juga|baca selengkapnya|simak (juga|video|berita)|lihat juga|artikel terkait|"
    r"advertisement|scroll to (continue|resume)|copyright|©|editor\s*:|penulis\s*:|reporter\s*:|"
    r"laporan wartawan|isi komentar sepenuhnya|silakan baca konten menarik|ikuti (kami|berita)|"
    r"dapatkan (update|berita)|artikel ini telah tayang|kembali ke home|redaksi \||"
    r"prev$|next$|home$|a- a\+$|temukan lebih banyak$|live$|klik\b.*channel|pastikan whatsapp|"
    r"simak breaking news|follow (us|kami)|download aplikasi)",
    re.I,
)
INLINE_BAIT = re.compile(r"\s*(Baca juga|BACA JUGA)\s*:.*$")
INLINE_CAPTION = re.compile(r"\s*\b(Foto|Ilustrasi|Sumber foto)\s*:\s*\([^)]{0,60}\)\s*", re.I)   # "Foto: (Audrey/detikcom)"

# Keterangan foto, mis. "Kepala Dinas ..., Muksin,(MI/KRISTIADI)" atau "Pelatihan kuliner(Dok YIS)".
PHOTO_CAPTION = re.compile(r"\((MI|Dok|Foto|ANTARA|Istimewa|Tribun|Kompas|Ist|Humas)[^)]*\)\s*$", re.I)

# Dateline di awal artikel, mis. "TRIBUNJABAR.ID, PURWAKARTA - " / "jabar.jpnn.com, GARUT - " / "JAKARTA – ".
DATELINE = re.compile(
    r"^(?:(?:[\w.]+\.(?:com|id|co\.id)|[A-Z][\w]+(?: [A-Z][\w]+){0,2})\s*,\s*)?"
    r"[A-Z][A-Z .]{2,30}\s*(?:\([^)]{1,30}\))?\s*[-–—]\s+",
    re.I,
)


def is_failed(text: str) -> bool:
    return not isinstance(text, str) or len(text.strip()) < 200 or bool(FAIL_PATTERNS.search(text[:600]))


def _norm_line(line: str) -> str:
    return re.sub(r"\W+", " ", line.lower()).strip()   # baris utuh: prefix sama ≠ baris sama


def build_boilerplate_set(texts, min_docs: int = 3, min_ratio: float = 0.05, max_thr: int = 10) -> set:
    """Baris yang muncul di banyak dokumen berbeda = sidebar/berita terkait/footer.
    Untuk pipeline harian, simpan & akumulasikan set ini antar-hari (batch harian kecil)."""
    cnt = Counter()
    for t in texts:
        if isinstance(t, str):
            cnt.update({_norm_line(l) for l in t.split("\n") if len(l.strip()) > 20})
    thr = max(min_docs, min(int(min_ratio * len(texts)), max_thr))   # dibatasi agar korpus besar tetap peka
    return {line for line, c in cnt.items() if c >= thr}


def clean_text(text: str, title: str = "", boilerplate: set = frozenset()) -> str:
    title_n = _norm_line(title or "")
    seen, seen_toks, out = set(), [], []
    for raw in text.replace("\r", "\n").split("\n"):
        line = re.sub(r"\s+", " ", raw).strip()
        if not line:
            continue
        n = _norm_line(line)
        if (not n or n in boilerplate or n in seen or DROP_LINE.search(line)
                or (title_n and n == title_n)
                or (PHOTO_CAPTION.search(line) and len(line.split()) < 40)):
            continue
        line = INLINE_CAPTION.sub(" ", INLINE_BAIT.sub("", line)).strip()
        if DATELINE.fullmatch(line + " "):
            continue                       # baris yang isinya hanya dateline, mis. "Warta Ekonomi, Jakarta -"
        if len(line.split()) < 4 and not line.endswith((".", "!", "?", '"', "”")):
            continue                       # sisa menu/navigasi
        toks = set(re.sub(r"\W+", " ", line.lower()).split())   # tanpa pemotongan 120 karakter
        if len(toks) >= 8 and any(len(toks & o) / len(toks | o) >= 0.7 for o in seen_toks):
            continue                       # kalimat lead yang diulang di akhir (pola JPNN)
        seen.add(n)
        seen_toks.append(toks)
        out.append(line)
    # Dateline bisa muncul di baris ke-2/3 (didahului teaser, mis. Tribun): buang teaser-nya.
    for k, line in enumerate(out[:3]):
        if DATELINE.match(line):
            out = out[k:]
            out[0] = DATELINE.sub("", out[0], count=1)
            break
    text = "\n".join(out).strip()
    return re.sub(r"\s*\((\*|[a-z]{2,4})\)\s*$", "", text)   # kode redaksi penutup, mis. (*) / (ant)


def clean_corpus(df: pd.DataFrame, min_words: int = 80, extra_boilerplate: set | None = None):
    """extra_boilerplate: baris boilerplate yang terakumulasi dari hari-hari sebelumnya (batch harian kecil)."""
    df = df.copy()
    cols = [c for c in SOURCE_PRIORITY if c in df.columns]
    batch_boiler = build_boilerplate_set([t for c in cols for t in df[c].tolist()])
    boiler = batch_boiler | set(extra_boilerplate or ())

    arts, used = [], []
    for _, r in df.iterrows():
        best, src = "", "GAGAL"
        for c in cols:
            if is_failed(r[c]):
                continue
            t = clean_text(r[c], r.get("title", ""), boiler)
            if len(t.split()) >= min_words:
                best, src = t, c
                break
        arts.append(best)
        used.append(src)
    df["article_clean"], df["source_used"] = arts, used
    df["n_words"] = df.article_clean.str.split().str.len().fillna(0).astype(int)

    # Deduplikasi: teks identik, lalu judul nyaris sama (berita sama dari beberapa media).
    df["_h"] = df.article_clean.map(lambda t: hashlib.md5(re.sub(r"\W+", "", t.lower()).encode()).hexdigest())
    ok = df.source_used != "GAGAL"
    dup_text = ok & df.duplicated("_h")
    shingles = df.title.fillna("").map(lambda t: set(zip(*[_norm_line(t).split()[i:] for i in range(3)])))
    dup_title = pd.Series(False, index=df.index)
    keep_idx = []
    for i in df.index[ok & ~dup_text]:
        if any(len(shingles[i] & shingles[j]) / max(1, len(shingles[i] | shingles[j])) >= 0.6 for j in keep_idx):
            dup_title[i] = True
        else:
            keep_idx.append(i)
    df["status"] = "OK"
    df.loc[~ok, "status"] = "GAGAL_EKSTRAKSI"
    df.loc[dup_text | dup_title, "status"] = "DUPLIKAT"

    report = {
        "total": len(df),
        "ok": int((df.status == "OK").sum()),
        "gagal_ekstraksi": int((df.status == "GAGAL_EKSTRAKSI").sum()),
        "duplikat": int((df.status == "DUPLIKAT").sum()),
        "baris_boilerplate_terdeteksi": len(batch_boiler),
        "baris_boilerplate_dipakai": len(boiler),
        "sumber_dipakai": df.source_used.value_counts().to_dict(),
    }
    report["_boilerplate_batch"] = batch_boiler
    return df.drop(columns="_h"), report
