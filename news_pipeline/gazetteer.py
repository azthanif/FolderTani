"""Kamus wilayah & topik untuk classifier.

Sumber daftar kecamatan:
  - Garut  : UU No. 110 Tahun 2024 tentang Kabupaten Garut, Pasal 3 (42 kecamatan).
  - Cianjur: UU No. 97 Tahun 2024 tentang Kabupaten Cianjur, Pasal 3 (32 kecamatan).
"""
from __future__ import annotations

import re

KECAMATAN = {
    "Garut": [
        "Garut Kota", "Karangpawitan", "Wanaraja", "Tarogong Kaler", "Tarogong Kidul", "Banyuresmi", "Samarang",
        "Pasirwangi", "Leles", "Kadungora", "Leuwigoong", "Cibatu", "Kersamanah", "Malangbong", "Sukawening",
        "Karangtengah", "Bayongbong", "Cigedug", "Cilawu", "Cisurupan", "Sukaresmi", "Cikajang", "Banjarwangi",
        "Singajaya", "Cihurip", "Peundeuy", "Pameungpeuk", "Cisompet", "Cibalong", "Cikelet", "Bungbulang",
        "Mekarmukti", "Pakenjeng", "Pamulihan", "Cisewu", "Caringin", "Talegong", "Limbangan", "Selaawi",
        "Cibiuk", "Pangatikan", "Sucinaraja",
    ],
    "Cianjur": [
        "Cianjur", "Warungkondang", "Cibeber", "Cilaku", "Ciranjang", "Bojongpicung", "Karangtengah", "Mande",
        "Sukaluyu", "Pacet", "Cugenang", "Cikalongkulon", "Sukaresmi", "Sukanagara", "Campaka", "Takokak",
        "Kadupandak", "Pagelaran", "Tanggeung", "Cibinong", "Sindangbarang", "Agrabinta", "Cidaun", "Naringgul",
        "Campakamulya", "Cikadu", "Gekbrong", "Cipanas", "Cijati", "Leles", "Haurwangi", "Pasirkuda",
    ],
}

# Nama kecamatan yang juga dipakai di tempat lain: hanya dihitung bila nama kabupatennya ikut disebut.
_ALL = [k for v in KECAMATAN.values() for k in v]
AMBIGUOUS = {k for k in _ALL if _ALL.count(k) > 1} | {
    "Cibinong", "Cibatu", "Pacet", "Cipanas", "Caringin", "Pamulihan", "Samarang", "Cibalong", "Cibeber",
    "Mande", "Campaka", "Pagelaran", "Leles", "Limbangan",
}

# Kabupaten/kota lain di Jawa Barat: penanda berita regional non-target.
OTHER_REGIONS = [
    "Bandung Barat", "Bandung", "Bekasi", "Bogor", "Ciamis", "Cirebon", "Indramayu", "Karawang", "Kuningan",
    "Majalengka", "Pangandaran", "Purwakarta", "Subang", "Sukabumi", "Sumedang", "Tasikmalaya", "Banjar",
    "Cimahi", "Depok",
]

# Topik pertanian pangan (relevan untuk petani padi/gabah).
TOPIC_TERMS = [
    "padi", "gabah", "beras", "petani", "pertanian", "sawah", "panen", "tanam", "pupuk", "benih", "irigasi",
    "bulog", "hpp", "het", "pangan", "hama", "wereng", "alsintan", "traktor", "penggilingan", "lumbung",
    "kementan", "kementerian pertanian", "bapanas", "badan pangan", "dinas pertanian", "distan", "kelompok tani",
    "gapoktan", "poktan", "ktna", "harga gabah", "harga beras", "serap gabah", "penyerapan", "swasembada",
    "kekeringan", "gagal panen", "musim tanam", "luas tanam", "produktivitas", "subsidi", "kartu tani",
]

# Kata inti padi/gabah: wajib ada agar berita dianggap relevan untuk petani (menyaring berita "pangan" umum, MBG, dsb).
CORE_TERMS = [
    "padi", "gabah", "beras", "petani", "pertanian", "sawah", "panen", "pupuk", "benih", "irigasi", "bulog", "hpp",
    "gapoktan", "kelompok tani", "poktan", "alsintan", "hama", "wereng", "musim tanam", "dinas pertanian", "distan",
    "kementan", "penggilingan",
]

# Kata khas padi/gabah/beras. Kata umum seperti "petani", "panen", "pupuk" juga dipakai berita kopi, sayur,
# atau ternak, jadi topik baru dianggap relevan bila ada kata di daftar ini.
RICE_TERMS = [
    "padi", "gabah", "beras", "sawah", "penggilingan", "bulog", "hpp", "wereng", "gkp", "gkg", "musim tanam",
    "harga gabah", "harga beras", "serap gabah", "lumbung padi", "irigasi",
]

# Komoditas selain padi. Bila lebih sering disebut daripada kata padi/gabah, berita dianggap bukan topik padi.
OTHER_COMMODITY_TERMS = [
    "kopi", "teh", "kakao", "cokelat", "tembakau", "sayur", "sayuran", "cabai", "cabe", "bawang", "tomat", "kentang",
    "kubis", "wortel", "jeruk", "stroberi", "alpukat", "pisang", "domba", "kambing", "sapi", "ayam", "ikan", "susu",
    "sawit", "karet", "tebu", "akar wangi", "jagung", "kedelai", "singkong", "porang", "anggrek", "tanaman hias",
]

# Penanda cakupan nasional ("indonesia" sengaja tidak dimasukkan: terlalu umum).
NATIONAL_TERMS = [
    "nasional", "kementan", "kementerian pertanian", "menteri pertanian", "mentan", "bapanas", "badan pangan nasional",
    "perum bulog", "presiden", "pemerintah pusat", "dpr", "impor beras", "hpp", "het", "cadangan beras pemerintah",
    "cbp", "swasembada",
]

# Penanda berita level provinsi/daerah lain (bukan nasional).
PROVINCES = [
    "Jawa Barat", "Jabar", "Jawa Tengah", "Jateng", "Jawa Timur", "Jatim", "Banten", "DKI Jakarta", "Yogyakarta",
    "Sumatera", "Sulawesi", "Kalimantan", "Bali", "NTB", "NTT", "Papua", "Maluku", "Aceh", "Lampung", "Riau",
    "Bengkulu", "Jambi", "Gorontalo", "Bangka Belitung", "Babel",
]

# Kategori topik untuk tampilan web & pengelompokan digest (urutan = prioritas).
CATEGORIES = [
    ("Harga & Pasar", ["harga gabah", "harga beras", "hpp", "het", "harga", "pasar", "inflasi"]),
    ("Serapan & Stok", ["bulog", "serap", "penyerapan", "stok", "cadangan", "gudang", "spha", "sphp"]),
    ("Pupuk & Sarana", ["pupuk", "benih", "alsintan", "traktor", "subsidi", "kartu tani", "irigasi"]),
    ("Cuaca & Bencana", ["kekeringan", "banjir", "longsor", "el nino", "la nina", "cuaca", "gagal panen", "puso"]),
    ("Produksi & Panen", ["panen", "produksi", "produktivitas", "luas tanam", "musim tanam", "tanam"]),
    ("Kebijakan", ["kebijakan", "regulasi", "peraturan", "program", "anggaran", "menteri", "bupati"]),
]


def _rx(terms: list[str]) -> re.Pattern:
    return re.compile(r"\b(" + "|".join(sorted(map(re.escape, terms), key=len, reverse=True)) + r")\b", re.I)


RX_TOPIC = _rx(TOPIC_TERMS)
RX_CORE = _rx(CORE_TERMS)
RX_RICE = _rx(RICE_TERMS)
RX_OTHER_COMMODITY = _rx(OTHER_COMMODITY_TERMS)
RX_PROVINCE = _rx(PROVINCES)
RX_ANY_REGION_TITLE = re.compile(r"\b(kabupaten|kab\.|kota|kecamatan|desa|provinsi)\s+[A-Z]", re.I)
RX_NATIONAL = _rx(NATIONAL_TERMS)
RX_OTHER = _rx(OTHER_REGIONS)
RX_KAB = {k: re.compile(rf"\b(?:kabupaten|kab\.?|pemkab)?\s*{k}\b", re.I) for k in KECAMATAN}
RX_KEC = {k: _rx([x for x in v if x != k and x not in AMBIGUOUS]) for k, v in KECAMATAN.items()}
RX_KEC_AMBIG = {k: re.compile(r"\bkecamatan\s+(" + "|".join(map(re.escape, [x for x in v if x in AMBIGUOUS])) + r")\b", re.I)
                for k, v in KECAMATAN.items()}
# Pola alamat "Cipanas, Kabupaten Cianjur": kecamatan bernama ganda dipastikan oleh nama kabupaten sesudahnya
RX_KEC_ADDR = {k: re.compile(r"\b(" + "|".join(map(re.escape, [x for x in v if x != k])) + rf")\s*,\s*(?:kabupaten|kab\.?)\s+{k}\b", re.I)
               for k, v in KECAMATAN.items()}
CATEGORY_RX = [(name, _rx(terms)) for name, terms in CATEGORIES]


def category_of(text: str) -> str:
    best, best_n = "Lainnya", 0
    for name, rx in CATEGORY_RX:
        n = len(rx.findall(text))
        if n > best_n:
            best, best_n = name, n
    return best
