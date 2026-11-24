"use client";
/* Komponen & helper bersama dashboard petani/tengkulak (header, kpi, tabel, badge, person, dll.). */
import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { formatRupiah } from "@/lib/format";
import type { Farmer, RoleState, Stock } from "./types";

export const rupiah = (n: number | null | undefined) => formatRupiah(Number(n || 0));
export const number = (n: number | null | undefined) => Number(n || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });
/** Satuan volume = kg, harga = Rp/kg. */
export const kg = (n: number | null | undefined) => number(n) + " kg";
export const totalPrice = (volumeKg: number, perKg: number) => rupiah(Math.round(volumeKg * perKg));
export const prettyDate = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v + "T12:00:00");
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
};
export const fmtTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
export const availability = (s: Stock) => Number(s.available || 0); // dihitung server

/** Selektor data sesuai peran (port farmer/stock/buyer/myOffers/... di app.js). */
export function selectors(db: RoleState, isFarmer: boolean) {
  const farmer = (id: string) => db.farmers.find((f) => f.id === id);
  const stock = (id: string) => db.stocks.find((s) => s.id === id);
  const buyer = (id: string) => db.buyers.find((b) => b.id === id);
  const me = db.actor.user; // pengguna yang sedang login (dikirim server di snapshot)
  return {
    me,
    farmer,
    stock,
    buyer,
    myFarmer: () => farmer(me),
    myBuyer: () => buyer(me),
    myOffers: () => db.offers.filter((o) => (isFarmer ? o.farmerId === me : o.buyerId === me)),
    myTransactions: () => db.transactions.filter((t) => (isFarmer ? t.farmerId === me : t.buyerId === me)),
    ownStock: () => db.stocks.filter((s) => s.farmerId === me),
    /** Daftar kota/kabupaten yang punya stok (untuk filter & form permintaan tengkulak). */
    regions: () => Array.from(new Set(db.stocks.map((s) => s.region))).sort((a, b) => a.localeCompare(b, "id")),
    currentAI: (type: string) => db.aiReference?.[type] ?? null,
  };
}
export type Selectors = ReturnType<typeof selectors>;

const BADGE: Record<string, string> = {
  Tersedia: "green", Disepakati: "green", Aktif: "green",
  "Menunggu Petani": "gold", "Penawaran Balik": "blue",
  Ditolak: "red", Dibatalkan: "gray", "Akan Panen": "gray", Ditutup: "gray",
};
export const Badge = ({ s }: { s: string }) => <span className={`pill ${BADGE[s] || "gray"}`}>{s}</span>;

export function Person({ f }: { f?: Farmer }) {
  if (!f) return null;
  const ini = f.name.replace(/^(Pak|Bu) /, "").split(" ").slice(0, 2).map((x) => x[0]).join("");
  return (
    <span className="person-cell">
      <span className="initial-avatar">{ini}</span>
      <span>
        <strong>{f.name}</strong>
        <small>{f.village + ", " + f.region}</small>
      </span>
    </span>
  );
}

export function PageHeader({ isFarmer, title, desc, action }: { isFarmer: boolean; title: ReactNode; desc: ReactNode; action?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <div className="overline">TEMU TANI / {isFarmer ? "PETANI" : "TENGKULAK"}</div>
        <h1>{title}</h1>
        <p>{desc}</p>
      </div>
      <div className="action-row">{action}</div>
    </div>
  );
}

export function Kpi({ icon, title, val, foot, theme = "green" }: { icon: string; title: string; val: ReactNode; foot: ReactNode; theme?: string }) {
  return (
    <div className="card kpi">
      <div className="kpi-top">
        <div className={`kpi-icon ${theme}`}>
          <Icon name={icon} size={21} />
        </div>
        <span className="kpi-name">{title}</span>
      </div>
      <div className="kpi-value">{val}</div>
      <div className="kpi-foot">{foot}</div>
    </div>
  );
}

export function DataTable({ columns, rows, footer }: { columns: string[]; rows: ReactNode[]; footer?: ReactNode }) {
  return (
    <div className="card table-card">
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
              rows
            ) : (
              <tr>
                <td colSpan={columns.length}>
                  <div className="empty-state">
                    <div>
                      <strong>Tidak ada data</strong>Belum ada data yang cocok dengan filter.
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {footer ? <div className="table-foot-note">{footer}</div> : null}
    </div>
  );
}

export function Btn({ onClick, children, cl = "", type = "button" }: { onClick?: () => void; children: ReactNode; cl?: string; type?: "button" | "submit" }) {
  return (
    <button type={type} className={`btn tiny ${cl}`.trim()} onClick={onClick}>
      {children}
    </button>
  );
}

export function ActivityCard({ db }: { db: RoleState }) {
  return (
    <section className="card section-card">
      <div className="section-header">
        <div>
          <h3 className="section-title">Aktivitas Terkini</h3>
          <div className="section-subtitle">Perubahan stok dan penawaran terbaru</div>
        </div>
      </div>
      {!db.activities.length ? <div className="empty-state">Belum ada aktivitas.</div> : null}
      {/* Terbaru dulu (jangan dibalik: server sudah mengirim urutan terbaru, sort ulang agar tetap aman). */}
      {db.activities
        .slice()
        .sort((x, y) => (y.at || "").localeCompare(x.at || ""))
        .slice(0, 5)
        .map((a) => (
          <div className="activity" key={a.id}>
            <div className="activity-icon">
              <Icon name="activity" size={17} />
            </div>
            <div>
              <strong>{a.title}</strong>
              <p>
                {a.note} · {fmtTime(a.at)}
              </p>
            </div>
          </div>
        ))}
    </section>
  );
}

export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <div>
        <strong>{title}</strong>
        {text}
      </div>
    </div>
  );
}
