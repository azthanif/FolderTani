"use client";
/* Berita & Isu Pertanian (port initBerita + berita.html). Tidak lagi iframe. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { showAlert } from "@/lib/dialog";

interface NerEntity {
  word?: string;
  entity?: string;
  score?: number;
  /** Offset 0-based (end eksklusif) ke teks pada `field`. Ada pada data hasil news_pipeline. */
  start?: number;
  end?: number;
  field?: "judul" | "isi";
}

interface NewsItem {
  id: string;
  tanggal: string;
  kabupaten: string;
  sumber: string;
  kategori: string;
  judul: string;
  isi: string;
  ringkasan?: string;
  url?: string;
  summary_model?: string;
  wilayah?: string[];
  ner_results: NerEntity[];
}

const WILAYAH = ["Semua", "Garut", "Cianjur", "Nasional"] as const;
type Wilayah = (typeof WILAYAH)[number];
/** Isi berita di atas panjang ini dilipat dulu (tombol "Lihat selengkapnya"). */
const COLLAPSE_CHARS = 700;

const PAGE_SIZE = 6; // kelipatan 2 & 3: kartu tetap rapi di grid 2 atau 3 kolom
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (s: string) =>
  new Date(s + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

const NER_CLASS: Record<string, string> = {
  PER: "per", GPE: "loc", LOC: "loc", FAC: "loc", ORG: "org", NOR: "org", LAW: "org", PRD: "com", EVT: "act", QTY: "qty", MON: "qty",
};

const STOP = new Set(
  "yang dan di ke dari untuk pada dengan dalam sebagai atau agar ini itu oleh akan dapat lebih juga menjadi terhadap saat setelah sebelum karena jika serta para suatu tidak perlu secara dapat bahwa adalah mulai sejumlah wilayah hasil kondisi informasi artikel berita petani padi kabupaten kecamatan".split(
    " ",
  ),
);
const CLOUD_COLORS = ["#287b55", "#568cba", "#b47b35", "#8b69b0", "#4c9a8b", "#c16c63"];

type Match = { start: number; end: number; type: string; score?: number };

/** Sorot entitas NER. Pakai offset bila tersedia (akurat), selain itu cocokkan kata (data lama). */
function highlight(text: string, entities: NerEntity[], field: "judul" | "isi"): ReactNode[] {
  const source = String(text ?? "");
  const withOffset = (entities || []).filter((e) => Number.isInteger(e.start) && Number.isInteger(e.end) && e.field);
  const matches: Match[] = [];
  if (withOffset.length) {
    withOffset
      .filter((e) => e.field === field)
      .forEach((e) => {
        const start = e.start as number;
        const end = e.end as number;
        // abaikan offset yang tidak cocok dengan teks (mis. teks berubah setelah NER)
        if (start >= 0 && end <= source.length && end > start && source.slice(start, end) === (e.word ?? source.slice(start, end)))
          matches.push({ start, end, type: NER_CLASS[e.entity || ""] || "other", score: e.score });
      });
  } else {
    (entities || []).forEach((entity) => {
      const word = String(entity.word || "").trim();
      const type = NER_CLASS[entity.entity || ""] || "other";
      if (!word) return;
      const re = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      let m: RegExpExecArray | null;
      while ((m = re.exec(source)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length, type, score: entity.score });
        if (m[0].length === 0) re.lastIndex++;
      }
    });
  }
  matches.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const out: ReactNode[] = [];
  let pos = 0;
  matches.forEach((m, i) => {
    if (m.start < pos) return;
    out.push(source.slice(pos, m.start));
    const title = Number.isFinite(Number(m.score)) ? `NER: ${m.type.toUpperCase()} · confidence ${Number(m.score).toFixed(2)}` : undefined;
    out.push(
      <mark key={i} className={`ner ${m.type}`} title={title}>
        {source.slice(m.start, m.end)}
      </mark>,
    );
    pos = m.end;
  });
  out.push(source.slice(pos));
  return out;
}

/** Kabupaten petani yang login (Garut/Cianjur), atau null untuk admin/tengkulak/tamu. */
function farmerRegion(): Wilayah | null {
  const user = getSession()?.user;
  if (user?.role !== "petani") return null;
  const region = (user.region || "").replace(/^(kabupaten|kab\.?)\s+/i, "").trim().toLowerCase();
  const w = WILAYAH.find((x) => x !== "Semua" && x !== "Nasional" && x.toLowerCase() === region);
  return w ?? null;
}

/** Pilihan wilayah: petani hanya kabupatennya + Nasional (kabupaten lain tidak ditampilkan). */
function wilayahOptions(region: Wilayah | null): Wilayah[] {
  return region ? [region, "Nasional"] : [...WILAYAH];
}

/** Wilayah berita: kolom `wilayah` (pipeline) atau `kabupaten` (data lama). */
const wilayahOf = (n: NewsItem) => (n.wilayah?.length ? n.wilayah : [n.kabupaten]).map((x) => x.toLowerCase());

/** Default: kabupaten petani bila ada beritanya dalam 7 hari terakhir, selain itu Nasional. */
function defaultWilayah(news: NewsItem[], region: Wilayah | null, [f, t]: [string, string]): Wilayah {
  if (!region) return "Semua";
  const w = region.toLowerCase();
  return news.some((n) => n.tanggal >= f && n.tanggal <= t && wilayahOf(n).includes(w)) ? region : "Nasional";
}

/** Nomor halaman dengan elipsis: 1 … 4 5 6 … 20. `siblings` = jumlah halaman di kiri/kanan halaman aktif. */
export function pageList(current: number, total: number, siblings: number): (number | "…")[] {
  const keep = new Set([1, total]);
  for (let i = current - siblings; i <= current + siblings; i++) if (i >= 1 && i <= total) keep.add(i);
  const pages = [...keep].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  pages.forEach((p, i) => {
    const prev = pages[i - 1];
    if (prev !== undefined && p - prev === 2) out.push(prev + 1); // celah satu halaman: tampilkan angkanya
    else if (prev !== undefined && p - prev > 2) out.push("…");
    out.push(p);
  });
  return out;
}

/** true bila layar sempit (ponsel): pagination dipadatkan. */
function useNarrow(query = "(max-width: 480px)") {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return narrow;
}

/** Tanggal hari ini di WIB (YYYY-MM-DD), bukan UTC, agar pagi hari tidak mundur sehari. */
const todayWIB = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const shift = (ymd: string, days: number) => {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** "7 Hari Terakhir" = 6 hari lalu s.d. hari ini (WIB), bukan relatif ke berita terakhir di data. */
function last7Days(): [string, string] {
  const t = todayWIB();
  return [shift(t, -6), t];
}

/** 7 hari s.d. berita terbaru di data (dipakai tombol bila 7 hari terakhir kosong). */
function latestRange(news: NewsItem[]): [string, string] | null {
  const max = news.map((n) => n.tanggal).filter(Boolean).sort().pop();
  return max ? [shift(max, -6), max] : null;
}

export function BeritaView() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [range, setRange] = useState<[string, string] | null>(null); // rentang yang sudah diterapkan
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [wilayah, setWilayah] = useState<Wilayah>("Semua");
  const [region, setRegion] = useState<Wilayah | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [autoNational, setAutoNational] = useState(false); // petani dialihkan ke Nasional karena kabupatennya kosong
  const latestRef = useRef<HTMLElement>(null);
  const narrow = useNarrow();

  useEffect(() => {
    let alive = true;
    api<{ items?: Partial<NewsItem>[] }>("/berita")
      .then((res) => {
        const items = (res.items || [])
          .map(
            (n, i) =>
              ({
                ...n,
                id: n.id || String(i + 1),
                wilayah: Array.isArray(n.wilayah) ? n.wilayah : [],
                ner_results: Array.isArray(n.ner_results) ? n.ner_results : [],
              }) as NewsItem,
          )
          .filter((n) => n.tanggal && n.judul);
        if (!items.length) throw new Error("Server tidak mengirim berita yang valid.");
        if (!alive) return;
        const r = farmerRegion();
        const [f, t] = last7Days(); // default selalu 7 hari terakhir
        setNews(items);
        setRegion(r);
        const w = defaultWilayah(items, r, [f, t]);
        setWilayah(w);
        setAutoNational(!!r && w === "Nasional");
        setFrom(f);
        setTo(t);
        setRange([f, t]);
      })
      .catch((e: Error) => {
        console.error(e);
        if (alive) setError(e);
      });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!range) return [];
    const w = wilayah.toLowerCase();
    return news
      .filter((n) => n.tanggal >= range[0] && n.tanggal <= range[1])
      .filter((n) => wilayah === "Semua" || wilayahOf(n).includes(w))
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.id.localeCompare(a.id));
  }, [news, range, wilayah]);

  function apply(f: string, t: string) {
    if (!f || !t) {
      void showAlert({ title: "Tanggal belum lengkap", message: "Pilih tanggal awal dan akhir terlebih dahulu.", tone: "info" });
      return;
    }
    if (f > t) {
      void showAlert({ title: "Rentang tanggal tidak valid", message: "Tanggal awal tidak boleh melebihi tanggal akhir." });
      return;
    }
    setRange([f, t]);
    setSelectedId(null);
    setPage(1);
  }

  const picked = filtered.find((n) => n.id === selectedId); // pilihan yang keluar dari filter otomatis diabaikan
  useEffect(() => {
    if (selectedId && range && !picked) setSelectedId(null);
  }, [selectedId, range, picked]);
  const featured = picked || filtered[0];
  useEffect(() => setExpanded(false), [featured?.id]); // berita baru selalu mulai terlipat
  const longText = (featured?.isi.length ?? 0) > COLLAPSE_CHARS;
  const isLatest = !picked || picked.id === filtered[0]?.id;
  const others = filtered.filter((n) => n.id !== featured?.id);
  const totalPages = Math.max(1, Math.ceil(others.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const start = (current - 1) * PAGE_SIZE;
  const pageItems = others.slice(start, start + PAGE_SIZE);
  const pages = pageList(current, totalPages, narrow ? 0 : 1);
  const goPage = (p: number) => setPage(Math.min(Math.max(1, p), totalPages));
  const latest = latestRange(news);

  const cloud = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach((n) =>
      (n.judul + " " + n.isi)
        .toLowerCase()
        .match(/[a-zA-ZÀ-ÿ]{3,}/g)
        ?.forEach((w) => {
          if (!STOP.has(w)) counts[w] = (counts[w] || 0) + 1;
        }),
    );
    const top = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 34);
    return { top, unique: Object.keys(counts).length };
  }, [filtered]);
  const cMax = cloud.top[0]?.[1] || 1;
  const cMin = cloud.top[cloud.top.length - 1]?.[1] || 1;

  const rangeInfo = error
    ? "Gagal memuat data berita dari server"
    : range
      ? `${fmt(range[0])} – ${fmt(range[1])} · ${filtered.length} berita`
      : "";

  return (
    <div className="page-berita">
      <header className="heading">
        <div>
          <div className="eyebrow">Pusat Informasi Temu Tani</div>
          <h1>Berita &amp; Isu Pertanian</h1>
          <p>Pantau perkembangan informasi pertanian dan topik yang banyak dibicarakan.</p>
        </div>
        <span className="live-pill">● PEMANTAUAN BERITA</span>
      </header>

      <section className="panel filter" aria-label="Filter rentang tanggal">
        <div className="field">
          <label htmlFor="dateFrom">DARI TANGGAL</label>
          <input type="date" id="dateFrom" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="dateTo">SAMPAI TANGGAL</label>
          <input type="date" id="dateTo" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="button" className="btn primary" onClick={() => apply(from, to)}>
          Terapkan Filter
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const [f, t] = last7Days();
            setFrom(f);
            setTo(t);
            apply(f, t);
          }}
        >
          7 Hari Terakhir
        </button>
        <div className="field">
          <label htmlFor="wilayah">WILAYAH</label>
          <select
            id="wilayah"
            value={wilayah}
            onChange={(e) => {
              setWilayah(e.target.value as Wilayah);
              setAutoNational(false);
              setSelectedId(null);
              setPage(1);
            }}
          >
            {wilayahOptions(region).map((w) => (
              <option key={w} value={w}>
                {w === "Semua" ? "Semua wilayah" : w}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-note">
          {rangeInfo}
          {autoNational && region ? <span className="fallback-note">Belum ada berita {region} dalam 7 hari terakhir, menampilkan berita Nasional.</span> : null}
        </div>
      </section>

      <div className="layout">
        <div className="maincol">
          <section className="panel latest" ref={latestRef}>
            <div className="latest-top">
              <span className={`tag${isLatest ? "" : " tag-picked"}`}>{isLatest ? "BERITA TERKINI" : "BERITA TERPILIH"}</span>
              <span className="latest-right">
                {featured ? <span className="latest-date">◷ {fmt(featured.tanggal)}</span> : null}
                {!isLatest ? (
                  <button type="button" className="back-latest" onClick={() => setSelectedId(null)}>
                    ← Kembali ke berita terkini
                  </button>
                ) : null}
              </span>
            </div>
            <div className="latest-body">
              {error ? (
                <div className="empty">
                  <b>Data berita belum dapat dimuat.</b>
                  <br />
                  {error.message}
                  <br />
                </div>
              ) : featured ? (
                <>
                  <h2>{highlight(featured.judul, featured.ner_results, "judul")}</h2>
                  <div className="meta">
                    <span>◷ {fmt(featured.tanggal)}</span>
                    <span>⌖ {featured.kabupaten}</span>
                    <span>▤ {featured.kategori}</span>
                    <span>✦ {featured.sumber}</span>
                    {featured.url ? (
                      <a href={featured.url} target="_blank" rel="noopener noreferrer">
                        ↗ Baca berita asli
                      </a>
                    ) : null}
                  </div>
                  {featured.ringkasan ? (
                    <div className="summary-box">
                      <b>Ringkasan</b>
                      <p>{featured.ringkasan}</p>
                      <small>
                        {featured.summary_model?.startsWith("llm:")
                          ? "Ringkasan dibuat AI dan dicek otomatis terhadap nama & angka di berita. Periksa berita asli untuk detail."
                          : featured.summary_model?.startsWith("idt5")
                            ? "Ringkasan otomatis (model idT5). Periksa berita asli untuk detail."
                            : "Ringkasan otomatis dari kalimat pembuka berita."}
                      </small>
                    </div>
                  ) : null}
                  <div className={`article-wrap${longText && !expanded ? " collapsed" : ""}`}>
                    <p className="article-text" id="article-text">
                      {highlight(featured.isi, featured.ner_results, "isi")}
                    </p>
                  </div>
                  {longText ? (
                    <button
                      type="button"
                      className="read-more"
                      aria-expanded={expanded}
                      aria-controls="article-text"
                      onClick={() => setExpanded((v) => !v)}
                    >
                      {expanded ? "Sembunyikan ▴" : "Lihat selengkapnya ▾"}
                    </button>
                  ) : null}
                  <div className="legend">
                    <span>
                      <i className="swatch" style={{ background: "#e58a8a" }} />
                      Orang (PER)
                    </span>
                    <span>
                      <i className="swatch" style={{ background: "#78a4e8" }} />
                      Lokasi (GPE/LOC)
                    </span>
                    <span>
                      <i className="swatch" style={{ background: "#b294df" }} />
                      Organisasi/Tokoh (ORG/NOR)
                    </span>
                    <span>
                      <i className="swatch" style={{ background: "#e5b65e" }} />
                      Produk (PRD)
                    </span>
                    <span>
                      <i className="swatch" style={{ background: "#81c69a" }} />
                      Peristiwa (EVT)
                    </span>
                    <span>
                      <i className="swatch" style={{ background: "#79bdb6" }} />
                      Jumlah &amp; Harga (QTY/MON)
                    </span>
                  </div>
                </>
              ) : range ? (
                <div className="empty">
                  Tidak ada berita {wilayah === "Semua" ? "" : `${wilayah} `}pada rentang tanggal ini.
                  {latest && latest[1] < range[0] ? (
                    <>
                      <br />
                      <button
                        type="button"
                        className="read-more"
                        onClick={() => {
                          setFrom(latest[0]);
                          setTo(latest[1]);
                          apply(latest[0], latest[1]);
                        }}
                      >
                        Lihat berita terbaru ({fmt(latest[1])})
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="sidecol">
          <section className="panel cloud-card">
            <div className="cloud-head">
              <div>
                <h2 className="section-title">Wordcloud Berita</h2>
                <p className="section-sub">Kata yang sering muncul pada berita terpilih</p>
              </div>
              <span className="tag">TOPIK</span>
            </div>
            <div className="cloud-stage">
              {error ? (
                <div className="cloud-empty">Wordcloud akan tampil setelah CSV berhasil dimuat.</div>
              ) : cloud.top.length ? (
                cloud.top.map(([w, c], i) => (
                  <span
                    key={w}
                    className="word"
                    title={`${c} kali`}
                    style={{ fontSize: Math.round(12 + ((c - cMin) / (cMax - cMin || 1)) * 19), color: CLOUD_COLORS[i % CLOUD_COLORS.length] }}
                  >
                    {w}
                  </span>
                ))
              ) : range ? (
                <div className="cloud-empty">Tidak ada kata untuk ditampilkan.</div>
              ) : null}
            </div>
            <div className="cloud-foot">
              Ukuran kata menunjukkan frekuensi kemunculan pada judul dan isi berita dalam rentang tanggal yang dipilih.
            </div>
            <div className="stats">
              <div className="stat">
                <b>{filtered.length}</b>
                <small>Berita</small>
              </div>
              <div className="stat">
                <b>{cloud.unique}</b>
                <small>Kata unik</small>
              </div>
            </div>
          </section>
        </aside>
        <section className="panel list-card full">
          <div className="list-inner">
            <div className="section-head">
              <div>
                <h2 className="section-title">Berita Lainnya</h2>
                <p className="section-sub">
                  {range ? `${others.length} berita lain dalam rentang tanggal terpilih` : "Daftar berita berdasarkan rentang tanggal"}
                </p>
              </div>
              <span className="tag">{others.length} BERITA</span>
            </div>
            <div className="news-list">
              {error ? null : pageItems.length ? (
                pageItems.map((n) => {
                  const d = new Date(n.tanggal + "T00:00:00");
                  return (
                    <article className="news-item" key={n.id}>
                      <div className="news-date">
                        <b>{pad(d.getDate())}</b>
                        <small>{d.toLocaleDateString("id-ID", { month: "short" })}</small>
                      </div>
                      <div className="news-info">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(n.id);
                            setPage(1);
                            latestRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }}
                        >
                          {n.judul}
                        </button>
                        {n.ringkasan ? <p className="news-snippet">{n.ringkasan}</p> : null}
                        <small>
                          {n.kabupaten} · {n.kategori} · {n.sumber}
                        </small>
                      </div>
                    </article>
                  );
                })
              ) : range ? (
                <div className="empty">Belum ada berita lainnya pada periode ini.</div>
              ) : null}
            </div>
          </div>
          <div className="pagination">
            <span>
              {others.length
                ? `Menampilkan ${start + 1}–${Math.min(start + PAGE_SIZE, others.length)} dari ${others.length} berita`
                : range
                  ? "Tidak ada berita lainnya"
                  : ""}
            </span>
            {range && totalPages > 1 ? (
              <nav className="pages" aria-label="Halaman berita lainnya">
                <button
                  type="button"
                  className="page-btn"
                  aria-label="Halaman sebelumnya"
                  disabled={current === 1}
                  onClick={() => goPage(current - 1)}
                >
                  ‹
                </button>
                {pages.map((p, i) =>
                  p === "…" ? (
                    <span key={`gap${i}`} className="page-gap" aria-hidden="true">
                      …
                    </span>
                  ) : (
                    <button
                      type="button"
                      key={p}
                      className={`page-btn${current === p ? " active" : ""}`}
                      aria-label={`Halaman ${p}`}
                      aria-current={current === p ? "page" : undefined}
                      onClick={() => goPage(p)}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  className="page-btn"
                  aria-label="Halaman berikutnya"
                  disabled={current === totalPages}
                  onClick={() => goPage(current + 1)}
                >
                  ›
                </button>
              </nav>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
