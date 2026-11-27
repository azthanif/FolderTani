"use client";
/* Halaman Overview admin (port overview() dari initAdmin). */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EscrowDetail, EscrowPill } from "@/components/escrow/EscrowDetail";
import { Icon } from "@/components/Icon";
import { PriceChart } from "@/components/PriceChart";
import { useUI } from "@/components/UIProvider";
import { api } from "@/lib/api";
import type { Escrow } from "@/lib/escrow";
import { fmtNum, formatRupiah } from "@/lib/format";
import { adminEscrowRank, sortRows, timeOf } from "@/lib/sort";
import { lastAt, logistikGagal, when } from "./AdminEscrow";
import { useAdmin } from "./AdminData";
import { useDetail } from "./useDetail";
import { ALL_AREAS } from "./types";
import { AreaSelect, Badge, countFarmers, countOffers, countStocks, countTrx, Heading, Kpi, Person } from "./ui";

/** Status escrow yang masih berjalan (belum Selesai/Kedaluwarsa). */
const RUNNING = "MENUNGGU_BAYAR,DIBAYAR,DIKIRIM,DITERIMA,SENGKETA,PENCAIRAN_GAGAL";

/** Kartu Overview admin: transaksi escrow berjalan, yang perlu tindak lanjut admin paling atas. */
function RunningEscrowCard({ area }: { area: string }) {
  const { openModal, toast } = useUI();
  const router = useRouter();
  const [items, setItems] = useState<Escrow[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: Escrow[] }>(`/escrow?status=${RUNNING}`);
      setItems(r.items);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (!document.hidden) load();
    }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const rows = sortRows(
    (items || []).filter((e) => area === ALL_AREAS || e.kabupaten === area),
    "prioritas",
    (e) => adminEscrowRank(e.status, logistikGagal(e)),
    (e) => timeOf(lastAt(e)),
  );
  const todo = rows.filter((e) => adminEscrowRank(e.status, logistikGagal(e)) === 0).length;
  const held = rows
    .filter((e) => e.status !== "MENUNGGU_BAYAR")
    .reduce((n, e) => n + (e.total_tagihan ?? e.nilai), 0);

  function open(e: Escrow) {
    openModal(`Escrow ${e.kode}`, `${e.offerId} • ${e.kabupaten} • GKP`, <EscrowDetail key={e.id} id={e.id} role="admin" onToast={toast} onChanged={load} />);
  }

  return (
    <section className="card table-card running-escrow">
      <div className="section-header">
        <div>
          <h3 className="section-title">Transaksi Berjalan</h3>
          <div className="section-subtitle">
            {error
              ? "Data escrow belum dapat dimuat."
              : items === null
                ? "Memuat transaksi escrow…"
                : `${fmtNum(rows.length)} transaksi diproses · dana ditahan ${formatRupiah(held)}${todo ? ` · ${todo} perlu tindak lanjut admin` : ""}`}
          </div>
        </div>
        <button type="button" className="link-btn" onClick={() => router.push("/admin/escrow")}>
          Lihat semua <Icon name="chevron" size={12} />
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>KODE</th>
              <th>PETANI → TENGKULAK</th>
              <th>TAGIHAN</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.slice(0, 5).map((e) => {
                const need = adminEscrowRank(e.status, logistikGagal(e)) === 0;
                return (
                  <tr key={e.id}>
                    <td>
                      <strong>{e.kode}</strong>
                      <small className="small-muted" style={{ display: "block", marginTop: 3 }}>{when(lastAt(e))}</small>
                    </td>
                    <td>
                      {e.petani} → {e.tengkulak}
                      <small className="small-muted" style={{ display: "block", marginTop: 3 }}>
                        {e.kabupaten} · {fmtNum(e.berat_kg)} kg
                      </small>
                    </td>
                    <td>
                      <strong>{formatRupiah(e.total_tagihan ?? e.nilai)}</strong>
                    </td>
                    <td>
                      <EscrowPill status={e.status} label={e.statusLabel} />
                      {need ? <small className="escrow-todo">{logistikGagal(e) ? "Logistik tertunda" : "Perlu tindak lanjut"}</small> : null}
                      <button type="button" className="link-btn running-escrow-open" onClick={() => open(e)}>
                        {need ? "Tindak lanjut" : "Detail"} <Icon name="chevron" size={11} />
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="empty-state">
                  {items === null && !error ? "Memuat…" : "Tidak ada transaksi yang sedang berjalan pada wilayah ini."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > 5 ? <div className="table-foot-note">+{rows.length - 5} transaksi berjalan lainnya di menu Escrow &amp; Pembayaran.</div> : null}
    </section>
  );
}

export function AdminOverview() {
  const { stocks, offers, transactions, events, prices, refresh } = useAdmin();
  const { toast } = useUI();
  const detail = useDetail();
  const router = useRouter();
  const [area, setArea] = useState(ALL_AREAS);
  const panelArea = area === "Cianjur" ? "Cianjur" : "Garut";
  const areaOffers = offers.filter((o) => area === ALL_AREAS || o.location === area);
  const total = countStocks(stocks, ALL_AREAS);
  const locs = [...new Set(stocks.filter((x) => x.status !== "Terjual").map((x) => x.location))];

  async function refreshDemo() {
    try {
      await refresh();
      toast("Data diperbarui dari server.");
    } catch (e) {
      toast((e as Error).message);
    }
  }

  return (
    <>
      <Heading
        title="Selamat datang di Temu Tani"
        sub="Pantau aktivitas perdagangan gabah, mulai dari ketersediaan stok hingga kesepakatan transaksi."
        actions={
          <>
            <AreaSelect value={area} onChange={setArea} />
            <button type="button" className="btn" onClick={refreshDemo}>
              <Icon name="refresh" size={15} /> Perbarui
            </button>
          </>
        }
      />
      <div className="kpi-grid">
        <Kpi icon="users" title="Petani Terhubung" value={fmtNum(countFarmers(stocks, area))} foot="Total petani terdaftar" theme="green" />
        <Kpi
          icon="wheat"
          title="Stok Gabah Tersedia"
          value={
            <>
              {fmtNum(countStocks(stocks, area))} <span className="kpi-unit">kg</span>
            </>
          }
          foot="Volume stok saat ini"
          theme="lime"
        />
        <Kpi icon="handshake" title="Dalam Proses Penawaran" value={fmtNum(countOffers(offers, area))} foot="Dalam proses negosiasi" theme="gold" />
        <Kpi icon="receipt-text" title="Kesepakatan Tercatat" value={fmtNum(countTrx(transactions, area))} foot="Total transaksi disepakati" theme="blue" />
      </div>
      <div className="section-grid">
        <section className="card section-card">{prices ? <PriceChart prices={prices} area={panelArea} /> : null}</section>
        <section className="card section-card">
          <div className="section-header">
            <div>
              <h3 className="section-title">Distribusi Stok Gabah</h3>
              <div className="section-subtitle">Ketersediaan stok berdasarkan kabupaten</div>
            </div>
            <Icon name="package" size={18} />
          </div>
          {locs.map((loc, i) => {
            const n = countStocks(stocks, loc);
            return (
              <div className="region-item" key={loc}>
                <div className="region-line">
                  <span>{loc}</span>
                  <span>{fmtNum(n)} kg</span>
                </div>
                <div className="progress">
                  <div className={`progress-bar${i ? " alt" : ""}`} style={{ width: `${Math.round((n / total) * 100)}%` }} />
                </div>
              </div>
            );
          })}
          <div className="divider" />
          <div className="tiny-stats">
            <div>
              <strong>{fmtNum(total)} kg</strong>
              <small>Stok gabah tersedia</small>
            </div>
          </div>
        </section>
      </div>
      <div className="section-grid bottom half">
        <section className="card table-card">
          <div className="section-header">
            <div>
              <h3 className="section-title">Penawaran Terbaru</h3>
              <div className="section-subtitle">Aktivitas negosiasi dari chatbot WhatsApp</div>
            </div>
            <button type="button" className="link-btn" onClick={() => router.push("/admin/penawaran")}>
              Lihat semua <Icon name="chevron" size={12} />
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PEMBELI</th>
                  <th>LOKASI</th>
                  <th>HARGA TAWAR</th>
                  <th>STATUS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {areaOffers.length ? (
                  areaOffers.slice(0, 4).map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Person name={o.buyer} subtitle={o.id} />
                      </td>
                      <td>{o.location}</td>
                      <td>
                        <strong>{formatRupiah(o.price)}</strong>
                        <small className="small-muted"> /kg</small>
                      </td>
                      <td>
                        <Badge status={o.status} />
                      </td>
                      <td>
                        <button type="button" className="link-btn" onClick={() => detail("offer", o.id)}>
                          Detail
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="empty-state">
                      Tidak ada penawaran pada wilayah ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <RunningEscrowCard area={area} />
      </div>
      <section className="card section-card activity-wide">
          <div className="section-header">
            <div>
              <h3 className="section-title">Aktivitas WhatsApp</h3>
              <div className="section-subtitle">Interaksi terbaru yang tercatat</div>
            </div>
          </div>
          {events.slice(0, 4).map((e, i) => (
            <div className="activity" key={i}>
              <div className="activity-icon">
                <Icon name={e.icon} size={16} />
              </div>
              <div style={{ flex: 1 }}>
                <strong>{e.title}</strong>
                <p>
                  {e.note} · {e.time}
                </p>
              </div>
            </div>
          ))}
          <button type="button" className="link-btn" onClick={() => router.push("/admin/aktivitas")} style={{ marginTop: 10 }}>
            Lihat aktivitas <Icon name="chevron" size={12} />
          </button>
      </section>
    </>
  );
}
