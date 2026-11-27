"use client";
/* Prediksi Harga AI (port initHarga + hargaPage dari app.js). Tidak lagi iframe. */
import { useEffect, useState } from "react";
import type { Role } from "@/lib/api";
import { addDays, fmtDay, formatRupiah, todayWIB } from "@/lib/format";
import { loadPrices, type PricesResponse } from "@/lib/prices";
import { ApiErrorCard } from "@/components/DashboardShell";
import { Icon } from "@/components/Icon";
import { PriceChart } from "@/components/PriceChart";

const fmtSource = (s: string) => (s === "asli" ? "pasar" : s === "simulasi" ? "simulasi" : "terakhir (isi maju)");

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
  const loc = locked ?? (area === "Cianjur" ? "Cianjur" : "Garut");
  const d = prices.regions[loc] || Object.values(prices.regions)[0];
  if (!d)
    return (
      <div className="page-harga">
        <div className="empty-state">
          {prices.lockedArea
            ? `Prediksi harga untuk ${prices.lockedArea} belum tersedia. Saat ini model mencakup Garut dan Cianjur.`
            : "Data harga belum tersedia."}
        </div>
      </div>
    );

  const meta = d.meta;
  const runDay = todayWIB(meta?.runDate ?? prices.asOf);
  const forecast = d.forecast.slice(0, prices.forecastDays);
  const comparison = prices.comparison ?? [];
  const anySimulated = comparison.some((c) => c.simulated);

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
              {["Garut", "Cianjur"].map((v) => (
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
          <small>{meta?.modelVersion ? "Rata-rata prakiraan AI 7 hari ke depan" : "Output AI"}</small>
        </div>
        <div className="card price-card">
          <span className="c-label">HARGA PASAR PEMBANDING</span>
          <strong>
            {formatRupiah(d.previous)}
            <span className="kpi-unit">/kg</span>
          </strong>
          <small>{meta?.modelVersion ? `Harga ${fmtSource(meta.priceSource)} per ${fmtDay(todayWIB(meta.runDate), { day: "numeric", month: "short" })}` : "Harga historis"}</small>
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
        <section className="card section-card info-card">
          <div className="section-header">
            <div>
              <h3 className="section-title">Informasi Prediksi</h3>
              <div className="section-subtitle">
                {loc} · GKP · prakiraan harian {forecast.length} hari ke depan
              </div>
            </div>
            <Icon name="database" size={19} />
          </div>
          <div className="modal-grid info-meta">
            {[
              ["TANGGAL PREDIKSI", fmtDay(runDay, { day: "numeric", month: "short", year: "numeric" })],
              ["SUMBER", meta?.source ?? "Model AI Temu Tani"],
            ].map(([k, v]) => (
              <div className="modal-item" key={k}>
                <label>{k}</label>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          {forecast.length ? (
            <>
              <div className="forecast-head" aria-hidden="true">
                <span>HARI</span>
                <span>PRAKIRAAN</span>
                <span>VS HARI INI</span>
              </div>
              <ol className="forecast-list" aria-label="Prakiraan harga harian">
                {forecast.map((v, k) => {
                  const diff = v - d.previous;
                  return (
                    <li key={k}>
                      <span className="fc-day">
                        <b>H+{k + 1}</b> {fmtDay(addDays(runDay, k + 1), { weekday: "short", day: "numeric", month: "short" })}
                      </span>
                      <strong>{formatRupiah(v)}</strong>
                      <span className={`fc-diff ${diff > 0 ? "up" : diff < 0 ? "down" : ""}`}>
                        {diff > 0 ? "+" : diff < 0 ? "−" : "±"}
                        {formatRupiah(Math.abs(diff))}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <div className="forecast-range">
                <span>Rentang prakiraan</span>
                <strong>
                  {formatRupiah(Math.min(...forecast))} – {formatRupiah(Math.max(...forecast))}
                </strong>
              </div>
            </>
          ) : null}
        </section>
      </div>

      <section className="card table-card">
        <div className="section-header">
          <div>
            <h3 className="section-title">Perbandingan Harga per Wilayah</h3>
            <div className="section-subtitle">
              Output model dan selisih terhadap HPP GKP{anySimulated ? " · Sebagian data simulasi" : ""}
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>KABUPATEN</th>
                <th>JENIS GABAH</th>
                <th>PREDIKSI AI</th>
                <th>HPP GKP</th>
                <th>SELISIH</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map(({ kabupaten: city, current }) => (
                <tr key={city}>
                  <td>
                    <strong>{city}</strong>
                  </td>
                  <td>GKP</td>
                  <td>
                    <strong>{formatRupiah(current)}/kg</strong>
                  </td>
                  <td>{formatRupiah(prices.hpp)}/kg</td>
                  <td>
                    <span style={{ color: current >= prices.hpp ? "#29825c" : "#c0392b", fontWeight: 800 }}>
                      {current >= prices.hpp ? "+" : "−"}
                      {formatRupiah(Math.abs(current - prices.hpp))}
                    </span>
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
