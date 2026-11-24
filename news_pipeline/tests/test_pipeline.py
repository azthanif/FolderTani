"""Tes unit pipeline (tanpa model & tanpa jaringan). Jalankan: pytest -q news_pipeline/tests"""
import json
from datetime import date

import pytest

from news_pipeline import classifier_news, digest_news, notify_news, publish_news, summary_news
from news_pipeline.config import DEFAULTS, Context, _merge
from news_pipeline.ner_news import postprocess
from news_pipeline.storage import read_jsonl, write_jsonl

CC = DEFAULTS["classifier"]
NC = DEFAULTS["ner"]


def ctx_for(tmp_path, **over):
    cfg = _merge(DEFAULTS, {"run": {"data_dir": str(tmp_path / "data")},
                            "export": {"web_csv": str(tmp_path / "web.csv")}, **over})
    return Context(cfg=cfg, run_date=date(2026, 11, 23))


# ------------------------------------------------------------------ classifier
def art(title, body):
    return {"id": "x", "title": title, "article_clean": body}


def test_garut_title_and_topic():
    r = classifier_news.classify(art("Harga Gabah di Garut Naik", "Petani padi di Garut menjual gabah saat panen."), {}, CC)
    assert r["wilayah"] == ["Garut"] and r["kategori"] == "Harga & Pasar"


def test_non_agri_local_news_excluded():
    r = classifier_news.classify(art("Konser Musik di Garut", "Ribuan warga Garut menonton konser di alun-alun Garut."), {}, CC)
    assert r["wilayah"] == []


def test_ambiguous_kecamatan_needs_kabupaten():
    # Leles ada di Garut & Cianjur: tanpa nama kabupaten tidak boleh menetapkan wilayah
    r = classifier_news.classify(art("Panen Padi di Kecamatan Leles", "Petani padi panen gabah di Kecamatan Leles."), {}, CC)
    assert r["wilayah"] == []
    r = classifier_news.classify(art("Panen Padi di Leles", "Petani padi di Kecamatan Leles, Cianjur, panen gabah. "
                                                            "Dinas pertanian Cianjur mencatat hasil naik."), {}, CC)
    assert r["wilayah"] == ["Cianjur"]


def test_national_and_other_region():
    body = ("Kementerian Pertanian menetapkan HPP gabah nasional naik. Perum Bulog menyerap gabah petani. "
            "Harga beras di pasar dipantau Bapanas. Pupuk subsidi untuk petani padi ditambah.")
    assert classifier_news.classify(art("Pemerintah Naikkan HPP Gabah", body), {}, CC)["wilayah"] == ["Nasional"]
    assert classifier_news.classify(art("Petani Indramayu Panen, HPP Gabah Naik", body), {}, CC)["wilayah"] == []


def test_ner_entities_count_as_mentions():
    ents = [{"label": "GPE", "norm": "Kabupaten Cianjur"}, {"label": "GPE", "norm": "Cianjur"}]
    r = classifier_news.classify(art("Petani Panen Raya", "Para petani panen padi dan menjual gabah ke Bulog."),
                                 {"entities": ents}, CC)
    assert r["wilayah"] == ["Cianjur"] and r["reasons"]["Cianjur"]["body"] == 2


# ------------------------------------------------------------------ NER postprocess
def test_postprocess_offsets_merge_and_filters():
    text = "Bupati Garut Abdusy Syakur Amin meninjau sawah bersama Kementan dan detikcom."
    spans = [
        {"label": "PER", "start": 13, "end": 19, "score": 0.95}, {"label": "PER", "start": 20, "end": 26, "score": 0.9},
        {"label": "PER", "start": 27, "end": 31, "score": 0.93},          # tiga potongan nama -> satu span
        {"label": "GPE", "start": 7, "end": 12, "score": 0.98},
        {"label": "ORG", "start": 55, "end": 63, "score": 0.5},           # di bawah ambang
        {"label": "ORG", "start": 68, "end": 77, "score": 0.9},           # nama media -> dibuang
    ]
    out = postprocess(text, spans, NC)
    assert [(e["label"], e["text"]) for e in out] == [("GPE", "Garut"), ("PER", "Abdusy Syakur Amin")]
    assert all(text[e["start"]:e["end"]] == e["text"] for e in out)



def _span(text, label, word, score=0.95, nth=0):
    i = -1
    for _ in range(nth + 1):
        i = text.index(word, i + 1)
    return {"label": label, "start": i, "end": i + len(word), "score": score}


def test_postprocess_joins_numbers_split_by_tokenizer():
    """Data nyata (berita_pipeline.csv): BERT memecah 'Rp5.000' jadi 'Rp5' + '000' dan '816.860 ton' jadi '816' + '860 ton'."""
    text = "Harga gabah Rp5.000 per kg, target 816.860 ton, beras medium Rp 11.550 per kg."
    spans = [_span(text, "MON", "Rp5"), _span(text, "MON", "000"), _span(text, "QTY", "816"),
             _span(text, "QTY", "860 ton"), _span(text, "MON", "550")]       # hanya ekor angka yang tertangkap
    out = postprocess(text, spans, NC)
    assert [(e["label"], e["text"]) for e in out] == [("MON", "Rp5.000"), ("QTY", "816.860 ton"), ("MON", "Rp 11.550")]
    assert all(text[e["start"]:e["end"]] == e["text"] for e in out)


def test_postprocess_drops_numeric_labels_without_number():
    text = "Di Jawa Barat target tahun ini 2 juta ton, naik dari 2024. Harga di Semarang turun."
    spans = [_span(text, "MON", "Barat"), _span(text, "QTY", "tahun"), _span(text, "QTY", "2 juta ton"),
             _span(text, "QTY", "2024"), _span(text, "MON", "Semarang")]
    assert [e["text"] for e in postprocess(text, spans, NC)] == ["2 juta ton"]


def test_offset_ok_drops_bad_entity_instead_of_crashing():
    from news_pipeline.ner_news import _offset_ok
    ents = [{"text": "Garut", "start": 0, "end": 5}, {"text": "Cianjur", "start": 0, "end": 7}]
    assert _offset_ok(ents, "Garut panen.", "x") == ents[:1]

# ------------------------------------------------------------------ ringkasan
def test_lead_summary_respects_limits():
    text = "Kalimat pertama tentang padi. Kalimat kedua tentang gabah.\nKalimat ketiga tentang pupuk. Kalimat keempat."
    assert summary_news.lead_summary(text, 3, 70) == "Kalimat pertama tentang padi. Kalimat kedua tentang gabah. Kalimat ketiga tentang pupuk."
    assert len(summary_news.lead_summary("kata " * 500, 3, 50).split()) <= 51
    # kalimat kutipan langsung dilewati
    q = 'Petani Garut panen raya. "Awalnya saya kasih job, misalnya bagian produksi. Hasil naik tahun ini.'
    assert summary_news.lead_summary(q, 2, 45) == "Petani Garut panen raya. Hasil naik tahun ini."


def test_digest_dedupes_same_story_from_two_media():
    per = [{"label": "PER", "norm": "Muhammad Saleh Mustafa"}]
    a = dict(ITEM, id="a", publish_date="2026-11-18", entities=per, title="Wamentan Sebut Petani Kunci Hadapi Krisis Pangan Dunia",
             summary="Wakil Menteri Pertanian menyebut petani dan penyuluh kunci menghadapi krisis pangan dunia.", relevance=5)
    b = dict(ITEM, id="b", publish_date="2026-11-17", entities=per, title="Krisis Pangan Dunia, Wamentan Ungkap Peran Penting Petani",
             summary="Wakil Menteri Pertanian menegaskan petani dan penyuluh menjadi kunci menghadapi krisis pangan dunia.", relevance=4)
    c = dict(ITEM, id="c", title="Harga Pupuk Subsidi Turun", summary="Pemerintah menurunkan harga pupuk subsidi bulan ini.")
    assert [x["id"] for x in digest_news.dedupe([a, b, c])] == ["a", "c"]
    # tokoh sama tetapi beda minggu = peristiwa berbeda
    assert len(digest_news.dedupe([a, dict(b, publish_date="2026-11-01")])) == 2


def test_entity_precision():
    ents = [{"label": "PER", "norm": "Budi"}, {"label": "ORG", "norm": "Bulog"}]
    assert summary_news.entity_precision(ents, "Bulog menyerap gabah.") == 0.5
    assert summary_news.entity_precision([], "x") is None
    # singkatan di ringkasan & artikel: norm "Kementerian Pertanian" tidak ada di artikel, tetapi teks aslinya ada
    kementan = [{"label": "ORG", "text": "Kementan", "norm": "Kementerian Pertanian"}]
    assert summary_news.entity_precision(kementan, "Kementan menyerap gabah di Garut.") == 1.0


def test_number_precision_flags_invented_numbers():
    art_ = "Harga gabah di Garut Rp6.500 per kg, produksi 816.860 ton."
    assert summary_news.number_precision("Harga gabah Rp 6500 per kg.", art_) == 1.0
    assert summary_news.number_precision("Harga gabah Rp7.000 per kg, produksi 816.860 ton.", art_) == 0.5
    assert summary_news.number_precision("Harga gabah naik.", art_) is None


# ------------------------------------------------------------------ digest
ITEM = {"id": "a", "url": "https://x.id/a", "title": "Harga Gabah Naik", "media_name": "x.id", "summary": "Harga gabah naik 5 persen.",
        "wilayah": ["Garut"], "relevance": 3}


def test_digest_render_trims_to_limit():
    dc = {**DEFAULTS["digest"], "max_chars": 400}
    items = [dict(ITEM, id=str(i), summary="Ringkasan " * 20) for i in range(6)]
    text = digest_news.render("Garut", date(2026, 11, 23), items, [], dc, None)
    assert len(text) <= 400 and text.startswith("*Kabar Tani Garut*") and "Senin, 23 November 2026" in text


def test_llm_sorotan_rejects_new_numbers(monkeypatch):
    class R:
        def __init__(self, t): self.t = t
        def raise_for_status(self): pass
        def json(self): return {"message": {"content": self.t}}
    lc = {**DEFAULTS["digest"]["llm"], "enabled": True}
    monkeypatch.setattr(digest_news.requests, "post", lambda *a, **k: R("Harga gabah naik 5 persen."))
    assert digest_news._llm_sorotan([ITEM], "Garut", lc) == "Harga gabah naik 5 persen."
    monkeypatch.setattr(digest_news.requests, "post", lambda *a, **k: R("Harga gabah naik 12 persen."))
    assert digest_news._llm_sorotan([ITEM], "Garut", lc) is None


# ------------------------------------------------------------------ notify
def test_normalize_phone():
    assert notify_news.normalize_phone("0812-3456-7890") == "6281234567890"
    assert notify_news.normalize_phone("+62 812 3456 7890") == "6281234567890"
    assert notify_news.normalize_phone("0812") is None
    assert notify_news.normalize_phone("+62 0812 3456 7890") == "6281234567890"
    assert notify_news.normalize_phone("021 555 1234") is None          # bukan nomor HP


def _setup_notify(tmp_path, enabled):
    rec = tmp_path / "r.csv"
    rec.write_text("user_id,phone,name,kabupaten,role\nu1,081234567801,A,Garut,petani\n"
                   "u2,081234567802,B,Garut,tengkulak\nu3,081234567803,C,Kab. Cianjur,petani\n", encoding="utf-8")
    ctx = ctx_for(tmp_path, notify={"enabled": enabled, "recipients_source": "csv", "recipients_csv": str(rec),
                                    "delay_sec": [0, 0]})
    ctx.extras["allow_backdated_send"] = True              # tanggal uji tetap (bukan hari ini)
    ctx.path("07_digest.json").write_text(json.dumps([
        {"kabupaten": "Garut", "digest_date": "2026-11-23", "status": "READY", "content": "isi", "article_ids": ["a"]},
        {"kabupaten": "Cianjur", "digest_date": "2026-11-23", "status": "SKIPPED", "content": "", "article_ids": []},
    ]), encoding="utf-8")
    return ctx


def test_notify_dry_run_only_farmers(tmp_path):
    ctx = _setup_notify(tmp_path, enabled=False)
    assert notify_news.run(ctx) == 0
    log = read_jsonl(ctx.path("08_delivery.jsonl"))
    assert [(r["user_id"], r["status"]) for r in log] == [("u1", "DRY_RUN")]   # tengkulak & digest SKIPPED tidak


def test_notify_live_is_idempotent(tmp_path, monkeypatch):
    ctx = _setup_notify(tmp_path, enabled=True)
    calls = []
    monkeypatch.setattr(notify_news, "send_waha", lambda nc, key, phone, text: calls.append(phone) or "msg1")
    assert notify_news.run(ctx) == 1 and calls == ["6281234567801"]
    assert notify_news.run(ctx) == 0 and calls == ["6281234567801"]              # tidak terkirim dua kali
    assert read_jsonl(ctx.path("08_delivery.jsonl"))[0]["status"] == "ALREADY_SENT"


# ------------------------------------------------------------------ publish -> backend
def test_web_csv_roundtrip_with_backend_loader(tmp_path):
    from backend.news import load_news
    ctx = ctx_for(tmp_path)
    it = {"id": "a", "url": "https://x.id/a", "title": "Panen di Garut", "media_name": "x.id", "publish_date": "2026-11-22",
          "article_clean": "Petani Garut panen.", "wilayah": ["Garut", "Nasional"], "kategori": "Produksi & Panen",
          "relevance": 3, "summary": "Petani Garut panen.", "summary_model": "lead-3",
          "entities": [{"label": "GPE", "text": "Garut", "norm": "Garut", "start": 7, "end": 12, "score": 0.9}],
          "title_entities": [{"label": "GPE", "text": "Garut", "norm": "Garut", "start": 9, "end": 14, "score": 0.9}]}
    write_jsonl(ctx.path("07_items.jsonl"), [it])
    ctx.path("07_digest.json").write_text("[]")
    assert publish_news.run(ctx) == 1
    items = load_news(tmp_path / "web.csv")
    n = items[0]
    assert n["wilayah"] == ["Garut", "Nasional"] and n["ringkasan"] == "Petani Garut panen."
    isi = [e for e in n["ner_results"] if e["field"] == "isi"][0]
    assert n["isi"][isi["start"]:isi["end"]] == "Garut"
    judul = [e for e in n["ner_results"] if e["field"] == "judul"][0]
    assert n["judul"][judul["start"]:judul["end"]] == "Garut"
    publish_news.run(ctx)                                                       # idempoten: tidak menggandakan
    assert len(load_news(tmp_path / "web.csv")) == 1


def test_same_story_by_org_and_specific_number():
    org = [{"label": "ORG", "norm": "Polri"}]
    a = dict(ITEM, id="a", publish_date="2026-11-20", entities=org, title="Polri Tanam Bawang Putih di 14 Daerah",
             summary="Kepolisian menanam bawang putih serentak di 14 daerah.")
    b = dict(ITEM, id="b", publish_date="2026-11-20", entities=org, title="14 Polda Garap Ratusan Hektare Lahan",
             summary="Polri mendorong swasembada bawang putih.")
    c = dict(b, id="c", title="Polri Gelar Operasi Lilin 2026", summary="Polri menyiagakan personel akhir tahun 2026.")
    assert digest_news.is_same_story(a, b) and not digest_news.is_same_story(a, c)   # tahun tidak dihitung


# ------------------------------------------------------------------ jalur Supabase (klien tiruan)
class FakeSB:
    def __init__(self):
        self.tables = {"news_articles": [], "news_digests": [], "news_deliveries": []}

    def upsert(self, table, rows, on_conflict, chunk=200):
        keys = on_conflict.split(",")
        out = []
        for r in rows:
            old = next((x for x in self.tables[table] if all(x.get(k) == r.get(k) for k in keys)), None)
            if old:
                old.update(r)
                out.append(old)
            else:
                r = dict(r, id=len(self.tables[table]) + 1)
                self.tables[table].append(r)
                out.append(r)
        return out

    def select(self, table, params):
        if table == "v_news_recipients":
            return [{"user_id": "u1", "phone": "081234567801", "name": "A", "kabupaten": "Garut"}]
        rows = self.tables[table]
        for k, v in params.items():
            if k != "select" and v.startswith("eq."):
                rows = [r for r in rows if str(r.get(k)) == v[3:]]
        return rows


def test_supabase_publish_then_notify(tmp_path, monkeypatch):
    sb = FakeSB()
    monkeypatch.setattr(publish_news, "supabase_from_ctx", lambda ctx: sb)
    monkeypatch.setattr(notify_news, "supabase_from_ctx", lambda ctx: sb)
    monkeypatch.setattr(notify_news, "send_waha", lambda *a: "m1")
    ctx = ctx_for(tmp_path, notify={"enabled": True, "recipients_source": "supabase", "delay_sec": [0, 0]})
    ctx.extras["allow_backdated_send"] = True
    write_jsonl(ctx.path("07_items.jsonl"), [dict(ITEM, publish_date="2026-11-22", article_clean="x", kategori="Lainnya",
                                                  summary_model="lead-2", entities=[], title_entities=[])])
    ctx.path("07_digest.json").write_text(json.dumps([{"kabupaten": "Garut", "digest_date": "2026-11-23",
                                                       "status": "READY", "content": "isi", "article_ids": ["a"]}]))
    publish_news.run(ctx)
    assert sb.tables["news_articles"][0]["wilayah"] == ["Garut"]
    assert json.loads(ctx.path("07_digest.json").read_text())[0]["db_id"] == 1
    assert notify_news.run(ctx) == 1
    assert sb.tables["news_deliveries"] == [{"digest_id": 1, "user_id": "u1", "status": "SENT", "id": 1}]
    sent_path = ctx.state_dir / "sent.jsonl"
    sent_path.unlink()                                   # state lokal hilang: DB tetap mencegah kirim ganda
    assert notify_news.run(ctx) == 0


# ------------------------------------------------------------------ temuan review independen
def test_notify_one_message_per_phone_and_blank_role_excluded(tmp_path, monkeypatch):
    ctx = _setup_notify(tmp_path, enabled=True)
    (tmp_path / "r.csv").write_text(
        "user_id,phone,name,kabupaten,role\nu1,081234567801,A,Garut,petani\nu1,081234567801,A,Garut,petani\n"
        "u9,+62 812-3456-7801,A2,Garut,petani\nu5,081234567805,X,Garut,\n", encoding="utf-8")
    calls = []
    monkeypatch.setattr(notify_news, "send_waha", lambda nc, key, phone, text: calls.append(phone) or "m")
    notify_news.run(ctx)
    assert calls == ["6281234567801"]                                    # akun ganda/nomor sama: sekali; role kosong: tidak


def test_notify_csv_without_role_column_rejected(tmp_path):
    ctx = _setup_notify(tmp_path, enabled=False)
    (tmp_path / "r.csv").write_text("user_id,phone,name,kabupaten\nu1,081234567801,A,Garut\n", encoding="utf-8")
    with pytest.raises(ValueError):
        notify_news.run(ctx)


def test_notify_refuses_backdated_live_send(tmp_path, monkeypatch):
    ctx = _setup_notify(tmp_path, enabled=True)
    ctx.extras["allow_backdated_send"] = False
    monkeypatch.setattr(notify_news, "today_wib", lambda: date(2026, 12, 1))
    with pytest.raises(RuntimeError, match="bukan hari ini"):
        notify_news.run(ctx)
    assert not (ctx.state_dir / "notify.lock").exists()                 # lock selalu dilepas


def test_single_passing_mention_of_cianjur_not_enough():
    body = ("Stok cabai aman di sentra produksi Brebes, Garut, Cianjur, dan Magelang. Petani panen raya "
            "dan pasokan ke pasar lancar menurut Kementan.")
    ents = [{"label": "GPE", "norm": "Cianjur"}, {"label": "GPE", "norm": "Garut"}]
    r = classifier_news.classify(art("Stok Cabai Aman Jelang Ramadan", body), {"entities": ents}, CC)
    assert "Cianjur" not in r["wilayah"] and "Garut" not in r["wilayah"]


def test_address_pattern_counts_and_kampung_name_does_not():
    b1 = ("Petani padi menikmati harga gabah yang baik. \"Hasilnya lumayan,\" ujar Bayu di sawah Cipanas, "
          "Kabupaten Cianjur, Jawa Barat. Pasokan beras petani ke dapur MBG naik dan panen tetap lancar.")
    assert classifier_news.classify(art("Petani di Cipanas Rasakan Dampak MBG", b1), {}, CC)["wilayah"] == ["Cianjur"]
    b2 = ("Dua petani asal Kampung Babakan Cianjur, Desa Gadobangkong, Kecamatan Ngamprah, Kabupaten Bandung Barat "
          "kehilangan gabah hasil panen karena dicuri. Petani padi itu kini harus berutang.")
    assert classifier_news.classify(art("Gabah Petani Digasak Maling", b2), {}, CC)["wilayah"] == []


def test_summary_run_falls_back_to_lead_on_invented_number(tmp_path, monkeypatch):
    class FakeT5:
        name = "idt5:fake"

        def __call__(self, texts):
            return ["Harga gabah di Garut naik menjadi Rp9.000 per kilogram menurut dinas pertanian setempat.",
                    "Harga gabah di Garut naik menjadi Rp6.500 per kilogram menurut dinas pertanian setempat."]

    class FakeNer:
        def predict(self, texts):
            return [[] for _ in texts]

    ctx = ctx_for(tmp_path)
    body = "Harga gabah di Garut naik menjadi Rp6.500 per kilogram. Dinas pertanian memantau panen."
    write_jsonl(ctx.path("03_clean.jsonl"), [{"id": i, "title": "Harga Gabah", "article_clean": body} for i in ("a", "b")])
    write_jsonl(ctx.path("05_classified.jsonl"), [{"id": i, "wilayah": ["Garut"]} for i in ("a", "b")])
    monkeypatch.setattr(summary_news, "_load_summarizer", lambda sc: FakeT5())
    ctx.extras["ner_model"] = FakeNer()
    assert summary_news.run(ctx) == 2
    a, b = read_jsonl(ctx.path("06_summary.jsonl"))
    assert a["fallback"] and a["summary_model"].startswith("lead") and a["number_precision"] == 0.0
    assert not b["fallback"] and b["summary_model"] == "idt5:fake" and b["number_precision"] == 1.0


def test_ci_config_and_collection_ids_from_env(tmp_path, monkeypatch):
    """config.ci.yaml (GitHub Actions) valid, dan collection_ids kosong diambil dari env MEDIACLOUD_COLLECTION_IDS."""
    import sys
    import types
    from pathlib import Path

    from news_pipeline import geturl_news
    from news_pipeline.config import load_config

    cfg = load_config(str(Path(geturl_news.__file__).parent / "config.ci.yaml"))
    assert cfg["storage"]["supabase"]["enabled"] and not cfg["notify"]["enabled"]
    assert set(cfg["mediacloud"]["queries"]) == {"Garut", "Cianjur", "Nasional"}

    seen = []

    class FakeApi:
        def __init__(self, key):
            pass

        def story_list(self, query, start, end, collection_ids, pagination_token):
            seen.append(collection_ids)
            return [{"id": f"s{len(seen)}", "url": f"https://x.id/{len(seen)}", "title": "Harga gabah"}], None

    mc = types.ModuleType("mediacloud")
    mc.api = types.SimpleNamespace(SearchApi=FakeApi)
    monkeypatch.setitem(sys.modules, "mediacloud", mc)
    monkeypatch.setitem(sys.modules, "mediacloud.api", mc.api)
    monkeypatch.setenv("MEDIACLOUD_API_KEY", "x")
    monkeypatch.setenv("MEDIACLOUD_COLLECTION_IDS", "111, 222")
    assert cfg["mediacloud"]["collection_ids"] == [34412392]
    cfg["mediacloud"]["collection_ids"] = []              # kosong -> ambil dari env
    ctx = Context(cfg=_merge(cfg, {"run": {"data_dir": str(tmp_path)}}), run_date=date(2026, 11, 24))
    assert geturl_news.run(ctx) == 3
    assert seen == [[111, 222]] * 3


# ------------------------------------------------------------------ ringkasan LLM (Groq), tanpa jaringan
class _Resp:
    def __init__(self, status, payload=None, headers=None):
        self.status_code, self._p, self.headers, self.text = status, payload, headers or {}, json.dumps(payload or {})

    def json(self):
        return self._p


class _FakeSession:
    def __init__(self, responses):
        self.responses, self.bodies = list(responses), []

    def post(self, url, json=None, headers=None, timeout=None):
        assert url.endswith("/chat/completions") and headers["Authorization"] == "Bearer k"
        self.bodies.append(json)
        return self.responses.pop(0)


def _llm(monkeypatch, responses, **over):
    monkeypatch.setenv("GROQ_API_KEY", "k")
    monkeypatch.setattr(summary_news.time, "sleep", lambda s: None)
    sc = _merge(DEFAULTS["summary"], {"llm": {"min_interval_sec": 0, **over}})
    sess = _FakeSession(responses)
    return summary_news.LlmSummarizer(sc, session=sess), sess


def _ok(text):
    return _Resp(200, {"choices": [{"message": {"content": text}}]})


def test_llm_summarizer_retries_429_and_drops_unsupported_param(monkeypatch):
    llm, sess = _llm(monkeypatch, [_Resp(429, {}, {"retry-after": "1"}), _Resp(400, {"error": "reasoning_effort"}),
                                   _ok("  <think>x</think> Harga gabah  naik. ")])
    assert llm.one("Judul", "Isi artikel") == "Harga gabah naik."
    assert "reasoning_effort" in sess.bodies[0] and "reasoning_effort" not in sess.bodies[2]
    assert sess.bodies[0]["model"] == "openai/gpt-oss-20b" and "Judul: Judul" in sess.bodies[0]["messages"][1]["content"]


def test_llm_summarizer_gives_none_on_error(monkeypatch):
    llm, _ = _llm(monkeypatch, [_Resp(500, {"error": "x"})])
    assert llm.one("J", "isi") is None


def test_llm_requires_key_and_auto_falls_back_to_lead(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    sc = DEFAULTS["summary"]
    assert summary_news._load_summarizer(dict(sc, method="auto")) is None        # tanpa key: Lead
    with pytest.raises(RuntimeError):
        summary_news._load_summarizer(dict(sc, method="llm"))
    monkeypatch.setenv("GROQ_API_KEY", "k")
    assert isinstance(summary_news._load_summarizer(dict(sc, method="auto")), summary_news.LlmSummarizer)


def test_summary_run_with_llm_guards_numbers(tmp_path, monkeypatch):
    class FakeNer:
        def predict(self, texts):
            return [[] for _ in texts]

    llm, _ = _llm(monkeypatch, [_ok("Harga gabah di Garut naik menjadi Rp9.000 per kilogram menurut dinas pertanian setempat."),
                                _ok("Harga gabah di Garut naik menjadi Rp6.500 per kilogram menurut dinas pertanian setempat."),
                                _Resp(500, {})])
    ctx = ctx_for(tmp_path)
    body = "Harga gabah di Garut naik menjadi Rp6.500 per kilogram. Dinas pertanian memantau panen di Garut."
    ids = ("a", "b", "c")
    write_jsonl(ctx.path("03_clean.jsonl"), [{"id": i, "title": "Harga Gabah", "article_clean": body} for i in ids])
    write_jsonl(ctx.path("05_classified.jsonl"), [{"id": i, "wilayah": ["Garut"]} for i in ids])
    monkeypatch.setattr(summary_news, "_load_summarizer", lambda sc: llm)
    ctx.extras["ner_model"] = FakeNer()
    assert summary_news.run(ctx) == 3
    a, b, c = read_jsonl(ctx.path("06_summary.jsonl"))
    assert a["fallback"] and a["summary_model"] == "lead-2"                      # angka karangan
    assert not b["fallback"] and b["summary_model"] == "llm:openai/gpt-oss-20b"
    assert c["fallback"] and c["summary"].startswith("Harga gabah")              # API gagal -> Lead


def test_non_rice_farmer_news_excluded():
    """Kasus nyata: berita kopi lolos karena judul memuat "Petani" + "Garut"."""
    t = "Cerita TinaKopi Indonesia Angkat Kopi Garut dan Berdayakan Petani bersama Pertamina"
    b = ("TinaKopi Indonesia bersama Pertamina memberdayakan petani kopi di Garut. Program ini melatih petani kopi "
         "arabika di Garut agar mutu panen kopi meningkat. Kelompok tani kopi mendapat bantuan alat pengolahan.")
    assert classifier_news.classify(art(t, b), {}, CC)["wilayah"] == []
    # sayur: kata umum petani/panen/pupuk banyak, tetapi tanpa kata khas padi
    b2 = "Petani sayur di Garut panen kentang dan kubis. Harga pupuk naik, petani berharap bantuan dinas pertanian."
    assert classifier_news.classify(art("Petani Sayur Garut Panen Raya", b2), {}, CC)["wilayah"] == []
    # padi tetap lolos walau menyebut komoditas lain sekali
    b3 = "Petani padi di Garut panen gabah 6 ton per hektare. Sebagian sawah juga ditanami jagung saat kemarau."
    assert classifier_news.classify(art("Panen Padi di Garut Melimpah", b3), {}, CC)["wilayah"] == ["Garut"]
