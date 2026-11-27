"use client";
/* Halaman tabel admin: stok, penawaran, transaksi, aktivitas (port tablePage/renderRows/exportCSV). */
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { SortSelect } from "@/components/SortSelect";
import { useUI } from "@/components/UIProvider";
import { fmtNum, formatRupiah } from "@/lib/format";
import { adminOfferRank, adminTrxRank, sortRows, timeOfId, type SortMode } from "@/lib/sort";
import { useAdmin } from "./AdminData";
import { useDetail } from "./useDetail";
import { ALL_AREAS, type AdminEvent, type AdminOffer, type AdminStock, type AdminTransaction, type TableKind } from "./types";
import { AreaSelect, Badge, countOffers, countStocks, Heading, Options, Person } from "./ui";

type Row = AdminStock | AdminOffer | AdminTransaction | AdminEvent;

const STATUSES: Record<TableKind, string[]> = {
  stok: ["Semua Status", "Tersedia", "Dalam Negosiasi", "Terjual"],
  penawaran: ["Semua Status", "Menunggu", "Penawaran Balik", "Disetujui", "Ditolak", "Dibatalkan"],
  transaksi: ["Semua Status", "Disepakati", "Selesai"],
  aktivitas: ["Semua Status", "Berhasil", "Perlu Tinjauan"],
};

/** "dd Mmm yyyy · HH:MM" aktivitas terakhir penawaran (langkah tawar terakhir, atau saat dibuat). */
const offerLast = (o: AdminOffer) => o.history.at(-1)?.[1] || `${o.date} · ${o.time}`;
const offerTime = (o: AdminOffer) => {
  const [d, t] = offerLast(o).split(" · ");
  return timeOfId(d, t) || timeOfId(o.date, o.time);
};

const PLACEHOLDER: Record<TableKind, string> = {
  stok: "petani atau ID stok",
  penawaran: "pembeli atau ID penawaran",
  transaksi: "ID transaksi atau petani",
  aktivitas: "aktivitas",
};

const COLUMNS: Record<TableKind, string> = {
  stok: "ID STOK|PETANI|KABUPATEN|JENIS|VOLUME|WAKTU PANEN|STATUS|AKSI",
  penawaran: "ID PENAWARAN|PEMBELI|PETANI|KABUPATEN|HARGA TAWAR|HARGA AI|STATUS|AKSI",
  transaksi: "ID TRANSAKSI|PETANI|PEMBELI|KABUPATEN|VOLUME|HARGA JUAL|TOTAL KESEPAKATAN|STATUS|AKSI",
  aktivitas: "WAKTU|AKTIVITAS|LOKASI|JENIS|STATUS",
};

export function AdminTablePage({ kind }: { kind: TableKind }) {
  const { stocks, offers, transactions, events, query, setQuery } = useAdmin();
  const { toast } = useUI();
  const detail = useDetail();
  const [area, setArea] = useState(ALL_AREAS);
  const [status, setStatus] = useState("Semua Status");
  const [sort, setSort] = useState<SortMode>("prioritas");
  const sortable = kind === "penawaran" || kind === "transaksi";

  const source: Row[] = kind === "stok" ? stocks : kind === "penawaran" ? offers : kind === "transaksi" ? transactions : events;

  function rowFilter(arr: Row[]) {
    return arr.filter((x) => {
      const r = x as unknown as Record<string, unknown>;
      const matchArea = area === ALL_AREAS || r.location === area;
      const matchStatus = status === "Semua Status" || r.status === status;
      const matchQuery = Object.values(r).join(" ").toLowerCase().includes(query.toLowerCase().trim());
      return matchArea && matchStatus && matchQuery;
    });
  }
  const filteredRows = rowFilter(source);
  // Urutan asal dari backend sudah terbaru dulu; sortRows stabil sehingga data bertanggal sama tetap pada urutan itu.
  const rows =
    kind === "penawaran"
      ? sortRows(filteredRows as AdminOffer[], sort, (o) => adminOfferRank(o.status), offerTime)
      : kind === "transaksi"
        ? sortRows(filteredRows as AdminTransaction[], sort, (t) => adminTrxRank(t.status), (t) => timeOfId(t.date))
        : filteredRows;

  function exportCSV() {
    if (!source.length) return;
    const keys = Object.keys(source[0]).filter((k) => k !== "history");
    const csv = [
      keys.join(","),
      ...rows.map((row) => keys.map((k) => '"' + String((row as unknown as Record<string, unknown>)[k] ?? "").replace(/"/g, '""') + '"').join(",")),
    ].join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = `temu-tani-${kind}-simulasi.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(u);
    toast("CSV simulasi berhasil disiapkan.");
  }

  const conf: Record<TableKind, [string, string, string, string, string]> = {
    stok: ["Stok Gabah", "Pantau ketersediaan dan distribusi stok gabah petani.", "STOK TERSEDIA", `${fmtNum(countStocks(stocks, area))} kg`, "Total stok belum terjual"],
    penawaran: [
      "Penawaran & Negosiasi",
      "Pantau penawaran pembeli dan proses negosiasi dengan petani.",
      "PENAWARAN AKTIF",
      `${countOffers(offers, area)}`,
      "Menunggu atau masih dinegosiasikan",
    ],
    transaksi: [
      "Riwayat Kesepakatan",
      "Pantau riwayat kesepakatan dan status transaksi.",
      "TOTAL NILAI KESEPAKATAN",
      formatRupiah(transactions.filter((x) => area === ALL_AREAS || x.location === area).reduce((a, t) => a + t.volume * t.price, 0)),
      "Bukan nilai pembayaran terkonfirmasi",
    ],
    aktivitas: ["Aktivitas Chatbot", "Pantau interaksi dan aktivitas chatbot WhatsApp.", "INTERAKSI TERCATAT", `${events.length}`, "Sebagian contoh aktivitas WhatsApp"],
  };
  const [title, sub, bannerLabel, bannerValue, bannerNote] = conf[kind];
  const columns = COLUMNS[kind].split("|");

  return (
    <>
      <Heading title={title} sub={sub} />
      <div className="card page-banner">
        <div>
          <strong>
            {bannerLabel} · {bannerValue}
          </strong>
          <p>{bannerNote}</p>
        </div>
      </div>
      <div className="toolbar">
        <label className="search-box">
          <Icon name="search" size={16} />
          <input placeholder={`Cari ${PLACEHOLDER[kind]}...`} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <AreaSelect value={area} onChange={setArea} />
        <select className="select" aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <Options values={STATUSES[kind]} />
        </select>
        {sortable ? <SortSelect value={sort} onChange={setSort} /> : null}
        <button type="button" className="btn" onClick={exportCSV}>
          <Icon name="download" size={15} /> Ekspor CSV
        </button>
      </div>
      <section className="card table-card wide">
        <div className="section-header">
          <div>
            <h3 className="section-title">Riwayat Transaksi</h3>
            <div className="section-subtitle">Data simulasi</div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((r, i) => <TableRow key={i} kind={kind} row={r} onDetail={detail} />)
              ) : (
                <tr>
                  <td colSpan={kind === "aktivitas" ? 5 : 8} className="empty-state">
                    Tidak ditemukan data yang sesuai filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="rows-footer">
          <span>
            Menampilkan {rows.length} dari {source.length} data simulasi
          </span>
        </div>
      </section>
    </>
  );
}

function TableRow({ kind, row, onDetail }: { kind: TableKind; row: Row; onDetail: ReturnType<typeof useDetail> }) {
  if (kind === "stok") {
    const s = row as AdminStock;
    return (
      <tr>
        <td>
          <strong>{s.id}</strong>
        </td>
        <td>
          <Person name={s.farmer} subtitle="Petani" />
        </td>
        <td>{s.location}</td>
        <td>{s.type}</td>
        <td>
          <strong>{fmtNum(s.volume)} kg</strong>
        </td>
        <td>{s.harvest}</td>
        <td>
          <Badge status={s.status} />
        </td>
        <td>
          <button type="button" className="link-btn" onClick={() => onDetail("stock", s.id)}>
            Lihat
          </button>
        </td>
      </tr>
    );
  }
  if (kind === "penawaran") {
    const o = row as AdminOffer;
    return (
      <tr>
        <td>
          <strong>{o.id}</strong>
          <small className="small-muted" style={{ display: "block", marginTop: 3 }} title="Aktivitas terakhir">
            {offerLast(o)}
          </small>
        </td>
        <td>
          <Person name={o.buyer} subtitle="Tanpa registrasi" />
        </td>
        <td>{o.farmer}</td>
        <td>{o.location}</td>
        <td>
          <strong>{formatRupiah(o.price)}</strong>
        </td>
        <td>{formatRupiah(o.ai)}</td>
        <td>
          <Badge status={o.status} />
        </td>
        <td>
          <button type="button" className="link-btn" onClick={() => onDetail("offer", o.id)}>
            Detail
          </button>
        </td>
      </tr>
    );
  }
  if (kind === "transaksi") {
    const t = row as AdminTransaction;
    return (
      <tr>
        <td>
          <strong>{t.id}</strong>
        </td>
        <td>{t.farmer}</td>
        <td>{t.buyer}</td>
        <td>{t.location}</td>
        <td>{fmtNum(t.volume)} kg</td>
        <td>{formatRupiah(t.price)}/kg</td>
        <td>
          <strong>{formatRupiah(t.volume * t.price)}</strong>
        </td>
        <td>
          <Badge status={t.status} />
        </td>
        <td>
          <button type="button" className="link-btn" onClick={() => onDetail("transaction", t.id)}>
            Detail
          </button>
        </td>
      </tr>
    );
  }
  const e = row as AdminEvent;
  return (
    <tr>
      <td>
        <span className="small-muted">31 Okt 2026 · {e.time}</span>
      </td>
      <td>
        <div className="person-cell">
          <div className="initial-avatar">
            <Icon name={e.icon} size={15} />
          </div>
          <strong>{e.title}</strong>
        </div>
      </td>
      <td>{e.location}</td>
      <td>{e.kind}</td>
      <td>
        <Badge status={e.status} />
      </td>
    </tr>
  );
}
