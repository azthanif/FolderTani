"use client";
/* Grafik pergerakan harga gabah (port generatePlot + priceChart dari app.js). */
import { useId, useState } from "react";
import { addDays, fmtDay, fmtNum, formatRupiah, todayWIB } from "@/lib/format";
import type { PricesResponse } from "@/lib/prices";
import { Icon } from "./Icon";

interface PlotProps {
  actual: number[];
  forecast: number[];
  dates: Date[];
}

/** actual: harga pasar s.d. hari ini; forecast: prakiraan AI h+1 s.d. h+7 (hanya di zona prakiraan). */
function PricePlot({ actual, forecast, dates }: PlotProps) {
  const gradId = "priceFill" + useId().replace(/:/g, "");
  const arr = [...actual, ...forecast];
  const min = Math.floor(Math.min(...arr) / 100) * 100 - 100;
  const max = Math.ceil(Math.max(...arr) / 100) * 100 + 100;
  const W = 650, H = 220;
  const pad = { t: 13, l: 43, r: 10, b: 29 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const n = actual.length + forecast.length, today = actual.length - 1;
  const xy = (i: number, v: number): [number, number] => [pad.l + (i * pw) / (n - 1), pad.t + ((max - v) * ph) / (max - min)];
  const pts = (a: number[]) => a.map((v, i) => xy(i, v).map((c) => c.toFixed(1)).join(",")).join(" ");

  // Label tanggal berjarak tetap dihitung dari hari ini, sehingga tanggal hari ini selalu tampil.
  const gap = Math.ceil((n - 1) / 6);
  const ticks: number[] = [];
  for (let i = today % gap; i < n; i += gap) ticks.push(i);
  const tx = xy(today, min)[0];
  const fill = pts(actual) + ` ${tx},${pad.t + ph} ${pad.l},${pad.t + ph}`;
  const step = actual.length > 7 ? 5 : 3;
  // Garis prakiraan disambung dari titik harga pasar hari ini agar tidak terputus, lalu h+1 s.d. h+7.
  const forecastPts = [actual[today], ...forecast]
    .map((v, k) => xy(today + k, v).map((c) => c.toFixed(1)).join(","))
    .join(" ");

  return (
    <svg
      className="line-chart"
      role="img"
      aria-label={`Grafik harga gabah ${fmtDay(dates[0], { day: "numeric", month: "short" })} sampai ${fmtDay(dates[n - 1], { day: "numeric", month: "short", year: "numeric" })}`}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#84cfa0" stopOpacity=".23" />
          <stop offset="1" stopColor="#84cfa0" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect className="forecast-zone" x={tx} y={pad.t} width={W - pad.r - tx} height={ph} />
      {[0, 0.25, 0.5, 0.75, 1].map((r) => {
        const y = pad.t + ph * r;
        return (
          <g key={r}>
            <line className="gridline" x1={pad.l} x2={W - pad.r} y1={y} y2={y} />
            <text x={pad.l - 9} y={y + 4} textAnchor="end">
              {fmtNum(Math.round((max - (max - min) * r) / 100) * 100)}
            </text>
          </g>
        );
      })}
      <line className="today-line" x1={tx} x2={tx} y1={pad.t} y2={pad.t + ph} />
      <text className="today-label" x={tx + 5} y={pad.t + 11}>
        Hari ini
      </text>
      <polygon points={fill} fill={`url(#${gradId})`} />
      <polyline className="curve" points={pts(actual)} stroke="#2c8a61" />
      <polyline className="curve" points={forecastPts} stroke="#e7b363" strokeDasharray="6 7" />
      {actual.map((v, i) =>
        i % step === 0 || i === today ? (
          <circle key={i} className="dot" cx={xy(i, v)[0]} cy={xy(i, v)[1]} r={4.7} fill="#2c8a61">
            <title>{`${fmtDay(dates[i], { day: "numeric", month: "short" })} · ${fmtNum(v)} rupiah/kg`}</title>
          </circle>
        ) : null,
      )}
      {forecast.map((v, k) => (
        <circle key={"f" + k} className="dot" cx={xy(today + 1 + k, v)[0]} cy={xy(today + 1 + k, v)[1]} r={3.6} fill="#e7b363">
          <title>{`H+${k + 1} · ${fmtDay(dates[today + 1 + k], { day: "numeric", month: "short" })} · ${fmtNum(v)} rupiah/kg`}</title>
        </circle>
      ))}
      {ticks.map((i) => (
        <text key={"t" + i} x={xy(i, min)[0]} y={H - 2} textAnchor="middle">
          {fmtDay(dates[i], { day: "2-digit", month: "short" })}
        </text>
      ))}
    </svg>
  );
}

/** Isi kartu "Pergerakan Harga Gabah". Dibungkus <section className="card section-card"> oleh pemanggil. */
export function PriceChart({ prices, area = "Garut" }: { prices: PricesResponse; area?: string }) {
  const [period, setPeriod] = useState<"7H" | "30H">("30H");
  const d = prices.regions[area] || prices.regions.Garut || Object.values(prices.regions)[0];
  if (!d) return <div className="empty-state">Data harga belum tersedia.</div>;
  const days = period === "7H" ? 7 : prices.historyDays;
  const start = addDays(todayWIB(d.meta?.runDate ?? prices.asOf), 1 - days);
  const change = ((d.current - d.previous) / d.previous) * 100;
  const dates = Array.from({ length: days + prices.forecastDays }, (_, i) => addDays(start, i));

  return (
    <>
      <div className="section-header">
        <div>
          <h3 className="section-title">Pergerakan Harga Gabah</h3>
          <div className="section-subtitle">Harga pasar dan estimasi AI{d.meta?.simulated === false ? "" : " · Data simulasi"}</div>
        </div>
        <div className="area-selector">
          <button type="button" className={`seg${period === "7H" ? " active" : ""}`} onClick={() => setPeriod("7H")}>
            7H
          </button>
          <button type="button" className={`seg${period === "30H" ? " active" : ""}`} onClick={() => setPeriod("30H")}>
            30H
          </button>
        </div>
      </div>
      <div className="price-summary">
        <span className="big-price">{formatRupiah(d.current)}</span>
        <span className="delta">
          <Icon name="trending" size={12} /> {change >= 0 ? "+" : ""}
          {fmtNum(change)}%
        </span>
        <span className="hint">/kg · {area}</span>
      </div>
      <PricePlot actual={d.actualDaily.slice(-days)} forecast={d.forecast.slice(0, prices.forecastDays)} dates={dates} />
      <div className="legend">
        <span className="legend-item">
          <i className="legend-line" style={{ background: "#2c8a61" }} /> Harga pasar
        </span>
        <span className="legend-item">
          <i className="legend-line" style={{ background: "#e7b363" }} /> Prediksi AI (H+1 s.d. H+{prices.forecastDays})
        </span>
        <span className="legend-item">
          <i className="legend-zone" /> Prakiraan {prices.forecastDays} hari
        </span>
      </div>
    </>
  );
}
