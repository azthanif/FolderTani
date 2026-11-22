"use client";
/* Halaman Overview admin (port overview() dari initAdmin). */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PriceChart } from "@/components/PriceChart";
import { useUI } from "@/components/UIProvider";
import { fmtNum, formatRupiah } from "@/lib/format";
import { useAdmin } from "./AdminData";
import { useDetail } from "./useDetail";
import { ALL_AREAS } from "./types";
import { AreaSelect, Badge, countFarmers, countOffers, countStocks, countTrx, Heading, Kpi, Person } from "./ui";

export function AdminOverview() {
  const { stocks, offers, transactions, events, prices, refresh } = useAdmin();
  const { toast } = useUI();
  const detail = useDetail();
  const router = useRouter();
  const [area, setArea] = useState(ALL_AREAS);
  const panelArea = area === "Sukabumi" ? "Sukabumi" : "Garut";
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
        <Kpi icon="handshake" title="Penawaran Aktif" value={fmtNum(countOffers(offers, area))} foot="Dalam proses negosiasi" theme="gold" />
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
      <div className="section-grid bottom">
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
        <section className="card section-card">
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
      </div>
    </>
  );
}
