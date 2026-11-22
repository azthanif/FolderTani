"use client";
/* Prediksi Harga AI (port initHarga + hargaPage dari app.js). Tidak lagi iframe. */
import { useEffect, useState } from "react";
import type { Role } from "@/lib/api";
import { fmtDay, formatRupiah, todayWIB } from "@/lib/format";
import { loadPrices, type PricesResponse } from "@/lib/prices";
import { ApiErrorCard } from "@/components/DashboardShell";
import { Icon } from "@/components/Icon";
import { PriceChart } from "@/components/PriceChart";

export function HargaView({ role }: { role: Role }) {
  const [prices, setPrices] = useState<PricesResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [area, setArea] = useState("Garut");

  useEffect(() => {
    let alive = true;
    loadPrices(role)
      .then((res) => {
        if (!alive) return;
        setPrices(res);
        if (res.lockedArea && res.regions[res.lockedArea]) setArea(res.lockedArea);
      })
      .catch((e: Error) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [role]);

  if (error)
    return (
      <div className="page-harga">
        <ApiErrorCard error={error} what="prediksi harga" />
      </div>
    );
  if (!prices)
    return (
      <div className="page-harga">
        <div className="empty-state">Memuat prediksi harga…</div>
      </div>
    );

  const locked = prices.lockedArea && prices.regions[prices.lockedArea] ? prices.lockedArea : null;
  const loc = locked ?? (area === "Sukabumi" ? "Sukabumi" : "Garut");
  const d = prices.regions[loc] || Object.values(prices.regions)[0];
  if (!d)
    return (
      <div className="page-harga">
        <div className="empty-state">Data harga belum tersedia.</div>
      </div>
    );

  return (
    <div className="page-harga">
      <div className="page-heading">
        <div>
          <h1>Prediksi Harga AI</h1>
          <p>Estimasi harga gabah sebagai referensi negosiasi.</p>
        </div>
        <div className="action-row">
          {locked ? (
            <span className="select select-locked" title="Prediksi dikunci sesuai wilayah Anda">
              <Icon name="lock" size={14} /> {loc}
            </span>
          ) : (
            <select className="select" value={loc} onChange={(e) => setArea(e.target.value)} aria-label="Pilih kabupaten">
              {["Garut", "Sukabumi"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="price-cards">
        <div className="card price-card">
          <span className="c-label">ESTIMASI HARGA WAJAR · {loc.toUpperCase()}</span>
          <strong>
            {formatRupiah(d.current)}
            <span className="kpi-unit">/kg</span>
          </strong>
          <small>Output AI</small>
        </div>
        <div className="card price-card">
          <span className="c-label">HARGA PASAR PEMBANDING</span>
          <strong>
            {formatRupiah(d.previous)}
            <span className="kpi-unit">/kg</span>
          </strong>
          <small>Harga historis</small>
        </div>
        <div className="card price-card">
          <span className="c-label"> HARGA ACUAN GKP </span>
          <strong>
            {formatRupiah(prices.hpp)}
            <span className="kpi-unit">/kg</span>
          </strong>
          <small>Harga Pembelian Pemerintah</small>
        </div>
      </div>

      <div className="section-grid">
        <section className="card section-card">
          <PriceChart prices={prices} area={loc} />
        </section>
        <section className="card section-card">
          <div className="section-header">
            <div>
              <h3 className="section-title">Informasi Prediksi</h3>
              <div className="section-subtitle">Metadata yang perlu tersedia saat integrasi</div>
            </div>
            <Icon name="database" size={19} />
          </div>
          <div className="modal-grid">
            {[
              ["KABUPATEN", loc],
              ["JENIS GABAH", "GKP"],
              ["TANGGAL PREDIKSI", fmtDay(todayWIB(prices.asOf), { day: "numeric", month: "short", year: "numeric" })],
              ["SUMBER", "Model AI Temu Tani"],
              ["AKURASI (MAPE)", "Belum dievaluasi"],
              ["VERSI MODEL", "Belum tersedia"],
            ].map(([k, v]) => (
              <div className="modal-item" key={k}>
                <label>{k}</label>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          <div className="divider" />
          <div className="info-strip" style={{ margin: 0 }}>
            <Icon name="info" size={16} />
            <span>
              Harga wajar adalah <strong>referensi negosiasi</strong>, bukan harga transaksi yang dijamin.
            </span>
          </div>
        </section>
      </div>

      <section className="card table-card">
        <div className="section-header">
          <div>
            <h3 className="section-title">Perbandingan Harga per Wilayah</h3>
            <div className="section-subtitle"> Output model dan selisih terhadap acuan HPP proposal · Data simulasi</div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>KABUPATEN</th>
                <th>JENIS GABAH</th>
                <th>PREDIKSI AI</th>
                <th>HPP CONTOH</th>
                <th>SELISIH</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(prices.regions)
                .filter(([city]) => !locked || city === locked)
                .map(([city, v]) => (
                  <tr key={city}>
                    <td>
                      <strong>{city}</strong>
                    </td>
                    <td>GKP</td>
                    <td>
                      <strong>{formatRupiah(v.current)}/kg</strong>
                    </td>
                    <td>{formatRupiah(prices.hpp)}/kg</td>
                    <td>
                      <span style={{ color: "#29825c", fontWeight: 800 }}>+{formatRupiah(v.current - prices.hpp)}</span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
