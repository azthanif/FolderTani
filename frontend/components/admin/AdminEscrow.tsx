"use client";
/* Admin: semua transaksi escrow, filter status, tindak lanjut SENGKETA dan PENCAIRAN_GAGAL (GET /api/escrow). */
import { useCallback, useEffect, useState } from "react";
import { EscrowDetail, EscrowPill } from "@/components/escrow/EscrowDetail";
import { Icon } from "@/components/Icon";
import { useUI } from "@/components/UIProvider";
import { api, ApiError } from "@/lib/api";
import type { Escrow, EscrowStatus } from "@/lib/escrow";
import { fmtNum, formatRupiah } from "@/lib/format";
import { adminEscrowRank, sortRows, timeOf, type SortMode } from "@/lib/sort";
import { SortSelect } from "@/components/SortSelect";
import { Heading, Kpi } from "./ui";

const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Semua Status" },
  { value: "SENGKETA,PENCAIRAN_GAGAL", label: "Perlu tindak lanjut admin" },
  { value: "MENUNGGU_BAYAR", label: "Menunggu Pembayaran" },
  { value: "DIBAYAR", label: "Dana di Escrow" },
  { value: "DIKIRIM", label: "Gabah Dikirim" },
  { value: "DITERIMA", label: "Dana Dicairkan" },
  { value: "SELESAI", label: "Selesai" },
  { value: "KEDALUWARSA", label: "Kedaluwarsa" },
];

/** Waktu perubahan terakhir escrow (diperbarui_pada; fallback ke cap waktu status terakhir). */
export const lastAt = (e: Escrow) => e.diperbarui_pada || e.selesai_pada || e.diterima_pada || e.dikirim_pada || e.dibayar_pada || e.dibuat_pada;
export const logistikGagal = (e: Escrow) => !!e.termin_petani?.some((t) => t.jenis === "logistik" && t.status === "GAGAL");

export const when = (v?: string | null) =>
  v ? new Date(v).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "—";

export function AdminEscrow() {
  const { openModal, toast } = useUI();
  const [status, setStatus] = useState("");
  const [items, setItems] = useState<Escrow[]>([]);
  const [counts, setCounts] = useState<Partial<Record<EscrowStatus, number>>>({});
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("prioritas");

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: Escrow[]; counts: Partial<Record<EscrowStatus, number>> }>(`/escrow${status ? `?status=${status}` : ""}`);
      setItems(r.items);
      setCounts(r.counts);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }, [status]);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (!document.hidden) load();
    }, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const c = (s: EscrowStatus) => counts[s] || 0;
  const held = items.filter((e) => ["DIBAYAR", "DIKIRIM", "DITERIMA", "SENGKETA", "PENCAIRAN_GAGAL"].includes(e.status)).reduce((n, e) => n + (e.total_tagihan ?? e.nilai), 0);
  const q = query.trim().toLowerCase();
  const rows = sortRows(
    items.filter((e) => !q || [e.kode, e.offerId, e.petani, e.tengkulak, e.kabupaten].join(" ").toLowerCase().includes(q)),
    sort,
    (e) => adminEscrowRank(e.status, logistikGagal(e)),
    (e) => timeOf(lastAt(e)),
  );

  function open(e: Escrow) {
    openModal(`Escrow ${e.kode}`, `${e.offerId} • ${e.kabupaten} • GKP`, <EscrowDetail key={e.id} id={e.id} role="admin" onToast={toast} onChanged={load} />);
  }

  return (
    <>
      <Heading title="Escrow & Pembayaran" sub="Pantau pembayaran tengkulak, konfirmasi serah terima, dan pencairan ke petani." />
      <div className="kpi-grid">
        <Kpi icon="clock" title="Menunggu Pembayaran" value={fmtNum(c("MENUNGGU_BAYAR"))} foot="Invoice belum dibayar" theme="gold" />
        <Kpi icon="truck" title="Dalam Proses Serah Terima" value={fmtNum(c("DIBAYAR") + c("DIKIRIM"))} foot="Dana ditahan di escrow" theme="blue" />
        <Kpi icon="info" title="Perlu Tindak Lanjut" value={fmtNum(c("SENGKETA") + c("PENCAIRAN_GAGAL"))} foot="Sengketa & pencairan gagal" theme="red" />
        <Kpi icon="check" title="Selesai" value={fmtNum(c("SELESAI"))} foot="Dana sudah diterima petani" />
      </div>
      <div className="toolbar">
        <label className="search-box">
          <Icon name="search" size={16} />
          <input placeholder="Cari kode escrow, petani, tengkulak..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <select className="select" aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <SortSelect value={sort} onChange={setSort} />
        <button type="button" className="btn" onClick={load}>
          <Icon name="refresh" size={15} /> Muat ulang
        </button>
      </div>
      {error ? <div className="notice-card">{error}</div> : null}
      <section className="card table-card wide">
        <div className="section-header">
          <div>
            <h3 className="section-title">Transaksi Escrow</h3>
            <div className="section-subtitle">Dana ditahan pada daftar ini: {formatRupiah(held)}</div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {["KODE", "PETANI", "TENGKULAK", "KABUPATEN", "BERAT", "TAGIHAN", "STATUS", "DIPERBARUI", "AKSI"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((e) => (
                  <tr key={e.id}>
                    <td><strong>{e.kode}</strong><small className="small-muted" style={{ display: "block", marginTop: 3 }}>{e.offerId}</small></td>
                    <td>{e.petani}</td>
                    <td>{e.tengkulak}</td>
                    <td>{e.kabupaten}</td>
                    <td>{fmtNum(e.berat_kg)} kg</td>
                    <td>
                      <strong>{formatRupiah(e.total_tagihan ?? e.nilai)}</strong>
                      <small className="small-muted" style={{ display: "block", marginTop: 3 }}>
                        {e.pengambilanLabel ? `${e.pengambilanLabel}${logistikGagal(e) ? " · logistik tertunda" : ""}` : "Belum pilih pengambilan"}
                      </small>
                    </td>
                    <td><EscrowPill status={e.status} label={e.statusLabel} /></td>
                    <td>{when(lastAt(e))}</td>
                    <td>
                      <button type="button" className="link-btn" onClick={() => open(e)}>
                        {e.aksi_tersedia.some((a) => a === "cairkan-ulang" || a === "selesaikan-sengketa") ? "Tindak lanjut" : "Detail"}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="empty-state">Belum ada transaksi escrow yang sesuai filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
