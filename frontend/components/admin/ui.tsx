"use client";
/* Potongan UI admin (port badge/person/heading/kpi/areaSelect dari initAdmin). */
import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { initials } from "@/lib/format";
import { ALL_AREAS, type AdminOffer, type AdminStock, type AdminTransaction } from "./types";

const BADGE: Record<string, string> = {
  Tersedia: "green",
  "Dalam Negosiasi": "gold",
  Terjual: "blue",
  Menunggu: "gold",
  "Penawaran Balik": "blue",
  Disetujui: "green",
  Ditolak: "red",
  Selesai: "green",
  Berhasil: "green",
  "Perlu Tinjauan": "red",
};

export function Badge({ status }: { status: string }) {
  return <span className={`pill ${BADGE[status] || "gray"}`}>{status}</span>;
}

export function Person({ name, subtitle }: { name: string; subtitle?: string }) {
  return (
    <div className="person-cell">
      <div className="initial-avatar">{initials(name)}</div>
      <div>
        <strong>{name}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </div>
    </div>
  );
}

export function Heading({ title, sub, actions }: { title: string; sub: string; actions?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      <div className="action-row">{actions}</div>
    </div>
  );
}

export function Kpi({ icon, title, value, foot, theme = "green" }: { icon: string; title: string; value: ReactNode; foot: string; theme?: string }) {
  return (
    <div className="card kpi">
      <div className="kpi-top">
        <div className={`kpi-icon ${theme}`}>
          <Icon name={icon} size={20} />
        </div>
        <div className="kpi-name">{title}</div>
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-foot">{foot}</div>
    </div>
  );
}

export function Options({ values }: { values: string[] }) {
  return (
    <>
      {values.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </>
  );
}

export function AreaSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className="select" aria-label="Filter kabupaten" value={value} onChange={(e) => onChange(e.target.value)}>
      <Options values={[ALL_AREAS, "Garut", "Sukabumi"]} />
    </select>
  );
}

const inArea = (area: string, loc: string) => area === ALL_AREAS || loc === area;

export const countStocks = (stocks: AdminStock[], area: string) =>
  stocks.filter((x) => inArea(area, x.location) && x.status !== "Terjual").reduce((n, x) => n + x.volume, 0);
export const countFarmers = (stocks: AdminStock[], area: string) => new Set(stocks.filter((x) => inArea(area, x.location)).map((x) => x.farmer)).size;
export const countOffers = (offers: AdminOffer[], area: string) =>
  offers.filter((x) => inArea(area, x.location) && ["Menunggu", "Penawaran Balik"].includes(x.status)).length;
export const countTrx = (transactions: AdminTransaction[], area: string) => transactions.filter((x) => inArea(area, x.location)).length;
