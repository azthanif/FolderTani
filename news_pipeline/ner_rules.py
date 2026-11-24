"""Lapisan aturan di atas NER BERT: kamus entitas domain pangan, pola wilayah administratif & regulasi,
propagasi sebutan berulang, dan konsistensi label per artikel.

Alasan: model umum (cahya/bert-base-indonesian-NER) melewatkan akronim domain (HPP, SPHP, Bulog) dan sering
hanya memberi label pada sebagian sebutan nama yang sama di satu artikel. Kamus/aturan menutup istilah yang
daftarnya tertutup dan diketahui; propagasi menutup sebutan ulang dari nama yang sudah dikenali model.

Label PRG (program/instrumen kebijakan bernama: HPP, HET, SPHP, MBG, ...) ditambahkan karena skema
OntoNotes yang dipakai model tidak punya kelas yang cocok untuknya (LAW khusus dokumen hukum bernama).
"""
from __future__ import annotations

import re
from collections import defaultdict

# (pola regex, label, bentuk normal). Pola peka huruf besar agar "bulog" di URL/kata biasa tidak ikut.
_DOMAIN: list[tuple[str, str, str]] = [
    # Lembaga
    (r"(?:Perum\s+)?(?:Bulog|BULOG)", "ORG", "Perum Bulog"),
    (r"Badan\s+Pangan\s+Nasional|Bapanas|NFA", "ORG", "Badan Pangan Nasional"),
    (r"Kementerian\s+Pertanian(?:\s+Republik\s+Indonesia)?|Kementan", "ORG", "Kementerian Pertanian"),
    (r"Kementerian\s+Perdagangan|Kemendag", "ORG", "Kementerian Perdagangan"),
    (r"Kementerian\s+Dalam\s+Negeri|Kemendagri", "ORG", "Kementerian Dalam Negeri"),
    (r"Kementerian\s+Keuangan|Kemenkeu", "ORG", "Kementerian Keuangan"),
    (r"Kementerian\s+Koordinator\s+Bidang\s+Pangan|Kemenko\s+Pangan", "ORG", "Kementerian Koordinator Bidang Pangan"),
    (r"Badan\s+Pusat\s+Statistik|BPS", "ORG", "Badan Pusat Statistik"),
    (r"Bank\s+Indonesia|BI", "ORG", "Bank Indonesia"),
    (r"(?:PT\s+)?Pupuk\s+Indonesia(?:\s+\(Persero\))?", "ORG", "Pupuk Indonesia"),
    (r"(?:PT\s+)?ID\s+FOOD|ID\s+Food", "ORG", "ID FOOD"),
    (r"Dewan\s+Ekonomi\s+Nasional", "ORG", "Dewan Ekonomi Nasional"),
    (r"Majelis\s+Permusyawaratan\s+Rakyat|MPR(?:\s+RI)?", "ORG", "MPR"),
    (r"Dewan\s+Perwakilan\s+Rakyat\s+Daerah|DPRD", "ORG", "DPRD"),
    (r"Dewan\s+Perwakilan\s+Rakyat(?:\s+Republik\s+Indonesia)?|DPR(?:\s+RI)?", "ORG", "DPR"),
    (r"Komisi\s+[IVX]+\s+DPR(?:\s+RI)?", "ORG", "Komisi DPR"),
    (r"(?:Partai\s+)?Gerindra", "ORG", "Partai Gerindra"),
    (r"Satgas\s+Pangan(?:\s+Polri)?", "ORG", "Satgas Pangan"),
    (r"Perpadi", "ORG", "Perpadi"),
    (r"Forkopimda", "ORG", "Forkopimda"),
    (r"Dinas\s+(?:Pertanian|Ketahanan\s+Pangan|Perdagangan)(?:\s+(?:dan|&)\s+[A-Z][a-z]+)*"
     r"(?:\s+(?:Kabupaten|Kota|Provinsi)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)?", "ORG", None),
    (r"Koperasi\s+(?:Desa/Kelurahan|Desa|Kelurahan)\s+Merah\s+Putih|Kopdes(?:\s+Merah\s+Putih)?|KDK?MP", "ORG", "Koperasi Desa Merah Putih"),
    # Negara & provinsi (daftar tertutup 38 provinsi; nama tak ambigu dengan kata umum)
    (r"Indonesia(?!\s+[A-Z])", "GPE", "Indonesia"),
    (r"DKI\s+Jakarta|Jakarta", "GPE", "Jakarta"),
    (r"(?:Aceh|Sumatera\s+(?:Utara|Barat|Selatan)|Riau|Kepulauan\s+Riau|Jambi|Bengkulu|Lampung|"
     r"Kepulauan\s+Bangka\s+Belitung|Bangka\s+Belitung|Banten|Jawa\s+(?:Barat|Tengah|Timur)|"
     r"(?:Daerah\s+Istimewa\s+)?Yogyakarta|DIY|Bali|Nusa\s+Tenggara\s+(?:Barat|Timur)|NTB|NTT|"
     r"Kalimantan\s+(?:Barat|Tengah|Selatan|Timur|Utara)|Sulawesi\s+(?:Utara|Tengah|Selatan|Tenggara|Barat)|"
     r"Gorontalo|Maluku(?:\s+Utara)?|Papua(?:\s+(?:Barat(?:\s+Daya)?|Selatan|Tengah|Pegunungan))?)", "GPE", None),
    # Program / instrumen kebijakan bernama
    (r"Harga\s+Pembelian\s+Pemerintah|HPP", "PRG", "HPP"),
    (r"Harga\s+Eceran\s+Tertinggi|HET", "PRG", "HET"),
    (r"Harga\s+Acuan\s+Pembelian|HAP", "PRG", "HAP"),
    (r"Stabilisasi\s+Pasokan\s+dan\s+Harga\s+Pangan|SPHP", "PRG", "SPHP"),
    (r"(?:Program\s+)?Bantuan\s+Pangan(?:\s+Beras)?|PBP", "PRG", "Bantuan Pangan"),
    (r"Makan\s+Bergizi\s+Gratis|MBG", "PRG", "Makan Bergizi Gratis"),
    (r"Cadangan\s+Beras\s+Pemerintah|CBP", "PRG", "Cadangan Beras Pemerintah"),
    (r"Gerakan\s+Pangan\s+Murah|GPM", "PRG", "Gerakan Pangan Murah"),
    (r"Rencana\s+Definitif\s+Kebutuhan\s+Kelompok|RDKK", "PRG", "RDKK"),
    (r"Nilai\s+Tukar\s+Petani|NTP", "PRG", "Nilai Tukar Petani"),
    # Peristiwa / fenomena bernama
    (r"El[\s-]Ni[nñ]o", "EVT", "El Nino"),
    (r"La[\s-]Ni[nñ]a", "EVT", "La Nina"),
    (r"Natal\s+dan\s+Tahun\s+Baru|Nataru", "EVT", "Nataru"),
]
RX_DOMAIN = [(re.compile(rf"(?<![\w-])(?:{p})(?![\w-])"), lab, norm) for p, lab, norm in _DOMAIN]
# Lembaga inti perberasan muncul di hampir setiap berita; tidak membedakan satu peristiwa dari yang lain
# (dipakai digest_news.is_same_story agar dua berita Bulog berbeda tidak dianggap duplikat).
DOMAIN_ORG_NORMS = {n.casefold() for _, lab, n in _DOMAIN if lab == "ORG" and n}
# Nama geografis umum: aturan "lemah" yang mengalah pada span model yang bertumpuk ("Universitas Indonesia",
# "Dinas Pertanian Jawa Barat") dan hanya mengisi sebutan yang sama sekali tidak dikenali model.
WEAK_NORMS = {"Indonesia", "Jakarta", None}

_KATA = r"[A-Z][a-z]+(?:-[A-Z]?[a-z]+)?"
_ANGKA_ROMAWI = r"(?:Satu|Dua|Tiga|Empat|Lima|I{1,3}|IV|V|VI{0,3})"
# "Kecamatan Bojongpicung", "Kelurahan Paniki Dua", "Kabupaten Bolaang Mongondow", "Provinsi Jawa Barat"
RX_WILAYAH = re.compile(rf"(?<![\w-])(?:Kecamatan|Kelurahan|Desa|Kampung|Kabupaten|Kota|Provinsi)\s+"
                        rf"({_KATA}(?:\s+{_KATA}){{0,2}})(?:\s+({_ANGKA_ROMAWI}))?(?![\w-])")
# "Peraturan Badan Pangan Nasional Nomor 2 Tahun 2025", "Keputusan Kepala Bapanas Nomor 14 Tahun 2025", "Inpres Nomor 6"
RX_REGULASI = re.compile(
    r"(?<![\w-])(?:Undang-Undang|UU|Peraturan|Keputusan|Surat\s+Edaran|Instruksi|Inpres|Perpres|Keppres|PP|Permentan|"
    r"Permendag|Perbadan|Perda)(?:\s+(?:[A-Z][A-Za-z]+|dan))*\s+(?:Nomor|No\.)\s*\d+[A-Z]?(?:/[\w.]+)*"
    r"(?:\s+Tahun\s+\d{4})?")


# Arah mata angin & kata lazim nama wilayah tidak boleh dibuang dari ekor nama ("Sulawesi Utara", "Kota Baru").
_WILAYAH_OK = {"barat", "timur", "utara", "selatan", "tengah", "baru", "daerah", "istimewa", "raya"}
# Kata jabatan: surface yang diawali kata ini tidak dipropagasi (jabatan bukan entitas bernama; model kadang
# memberinya NOR/PER, dan propagasi hanya akan melipatgandakan galat itu).
RX_JABATAN = re.compile(
    r"^(?:Menteri|Mentan|Wamentan|Menko|Wakil|Deputi|Direktur|Dirut|Kepala|Ketua|Sekretaris|Sestama|Bupati|Wabup|"
    r"Gubernur|Wagub|Wali|Walikota|Camat|Kades|Lurah|Presiden|Wapres|Pemda|Pemkab|Pemkot|Pemprov|Letnan|Jenderal|"
    r"Kapolres|Kapolda|Dandim|Danrem|Kadis|Plt|Pj)\b")
# Gelar akademik yang terlepas jadi span sendiri ("S.Sos.,", "M.Sc").
RX_GELAR = re.compile(r"(?:[A-Z][a-zA-Z]{0,3}\.\s?)+[A-Za-z]{0,4}[.,]*")


def rule_spans(text: str, stop: set[str]) -> list[dict]:
    """Span hasil aturan (score 1.0, src='rule'), tanpa tumpang tindih; span terpanjang menang."""
    cands = []
    weak = []
    for rx, lab, norm in RX_DOMAIN:
        for m in rx.finditer(text):
            cands.append((m.start(), m.end(), lab, norm or re.sub(r"\s+", " ", m.group())))
            if lab == "GPE" and norm in WEAK_NORMS:
                weak.append((m.start(), m.end()))
    for m in RX_WILAYAH.finditer(text):
        words = m.group(1).split()
        while words and words[-1].casefold() in stop and words[-1].casefold() not in _WILAYAH_OK:      # "Kabupaten Garut Senin" -> "Kabupaten Garut"
            words.pop()
        if not words:
            continue
        end = m.start(1) + len(" ".join(words))
        if m.group(2) and end == m.start(1) + len(m.group(1)):
            end = m.end()
        cands.append((m.start(), end, "GPE", None))
    for m in RX_REGULASI.finditer(text):
        cands.append((m.start(), m.end(), "LAW", re.sub(r"\s+", " ", m.group())))
    out, taken = [], []
    for s, e, lab, norm in sorted(cands, key=lambda c: (-(c[1] - c[0]), c[0])):
        if any(s < te and e > ts for ts, te in taken):
            continue
        taken.append((s, e))
        out.append({"label": lab, "start": s, "end": e, "score": 1.0, "norm": norm, "src": "rule",
                    "weak": (s, e) in weak})
    return sorted(out, key=lambda x: x["start"])


def overlaps(a: dict, b: dict) -> bool:
    return a["start"] < b["end"] and a["end"] > b["start"]


def trim_against(text: str, e: dict, rules: list[dict]) -> dict | None:
    """Potong span model yang bertumpuk dengan span aturan; sisa terpanjang dipertahankan bila masih bernama.

    Contoh: model memberi PER "BULOG Ahmad Rizal Ramdhani"; aturan mengambil "BULOG" -> sisa PER "Ahmad Rizal Ramdhani".
    """
    pieces = [(e["start"], e["end"])]
    for r in rules:
        nxt = []
        for s, t in pieces:
            if r["start"] < t and r["end"] > s:
                nxt += [(s, r["start"]), (r["end"], t)]
            else:
                nxt.append((s, t))
        pieces = nxt
    best = None
    for s, t in pieces:
        while s < t and not text[s].isalnum():
            s += 1
        while t > s and not text[t - 1].isalnum():
            t -= 1
        seg = text[s:t]
        if len(seg) >= 3 and seg[0].isupper() and (best is None or t - s > best[1] - best[0]):
            best = (s, t)
    if best is None:
        return None
    if best == (e["start"], e["end"]):
        return e
    return {**e, "start": best[0], "end": best[1], "text": text[best[0]:best[1]], "norm": None}


def _propagatable(s: str, stop: set[str], min_len: int) -> bool:
    return (len(s) >= min_len and s.casefold() not in stop and not RX_JABATAN.match(s)
            and not RX_GELAR.fullmatch(s) and not s.endswith(","))


def propagate(text: str, ents: list[dict], types: set[str], stop: set[str], min_len: int = 3) -> list[dict]:
    """Beri label pada sebutan ulang nama yang sudah dikenali di artikel yang sama (src='prop').

    Hanya permukaan (surface) bertipe nama, panjang >= min_len, dan pencocokan utuh per kata yang peka huruf.
    Dasar: label yang konsisten untuk token yang sama dalam satu dokumen terbukti menaikkan F1 NER
    (Finkel et al., 2005; Krishnan & Manning, 2006). Nama satu kata diwariskan juga dari nama lengkap PER
    ("Andi Amran Sulaiman" -> "Amran") karena berita lazim menyebut nama lengkap sekali lalu nama pendek.
    """
    surf: dict[str, dict] = {}
    for e in ents:
        if e["label"] in types and _propagatable(e["text"], stop, min_len):
            surf.setdefault(e["text"], e)
            if e["label"] == "PER":
                for w in e["text"].split():
                    if re.fullmatch(r"[A-Z][a-z]{3,}", w) and w.casefold() not in stop and w not in surf:
                        surf[w] = {**e, "text": w, "norm": e["norm"]}
    added: list[dict] = []
    occupied = list(ents)
    for s in sorted(surf, key=len, reverse=True):
        src = surf[s]
        for m in re.finditer(rf"(?<![\w-]){re.escape(s)}(?![\w-])", text):
            cand = {"label": src["label"], "text": s, "norm": src["norm"], "start": m.start(), "end": m.end(),
                    "score": src["score"], "src": "prop"}
            if any(overlaps(cand, o) for o in occupied):
                continue
            occupied.append(cand)
            added.append(cand)
    return sorted(ents + added, key=lambda x: x["start"])


def harmonize(ents: list[dict]) -> list[dict]:
    """Satu bentuk normal = satu label per artikel; label aturan menang, selain itu bobot skor terbesar."""
    vote: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for e in ents:
        vote[e["norm"]][e["label"]] += 100.0 if e.get("src") == "rule" else e["score"]
    best = {n: max(v.items(), key=lambda kv: kv[1])[0] for n, v in vote.items()}
    return [{**e, "label": best[e["norm"]]} if e["label"] not in ("MON", "QTY") and best[e["norm"]] not in ("MON", "QTY")
            else e for e in ents]
