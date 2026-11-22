"use client";
/* Layout bersama dashboard petani & tengkulak: DashboardRoot > RoleDataProvider > shell. */
import type { ReactNode } from "react";
import { ApiErrorCard, DashboardRoot, DashboardShell, type NavItem } from "@/components/DashboardShell";
import { SVG_PATHS } from "@/components/Icon";
import { useRoleActions } from "./actions";
import { CURRENT_FARMER, RoleDataProvider, useRole } from "./RoleDataProvider";
import { selectors } from "./common";
import type { RoleKind } from "./types";

const PAGE_DEFS: Record<RoleKind, [string, string, string][]> = {
  petani: [
    ["overview", "dashboard", "Overview"], ["stok", "wheat", "Stok Gabah"], ["penawaran", "handshake", "Penawaran & Negosiasi"],
    ["harga", "chart", "Prediksi Harga AI"], ["transaksi", "history", "Transaksi Disepakati"], ["berita", "document", "Berita & Analisis"],
  ],
  tengkulak: [
    ["overview", "dashboard", "Overview"], ["stok", "wheat", "Stok Gabah"], ["penawaran", "handshake", "Penawaran & Negosiasi"],
    ["transaksi", "history", "Transaksi Disepakati"],
  ],
};

function RoleShell({ children }: { children: ReactNode }) {
  const { role, isFarmer, db, base } = useRole();
  const A = useRoleActions();
  let nav: NavItem[] = [];
  let user = { name: "—", sub: "—", initials: "--" };
  if (db) {
    const S = selectors(db, isFarmer);
    const pending = S.myOffers().filter((o) => (isFarmer ? o.status === "Menunggu Petani" : o.status === "Penawaran Balik")).length;
    nav = PAGE_DEFS[role].map(([id, icon, label]) => ({
      href: id === "overview" ? base : `${base}/${id}`,
      icon,
      label,
      count: id === "penawaran" && pending ? pending : undefined,
    }));
    user = isFarmer
      ? { name: S.farmer(CURRENT_FARMER)?.name || "—", sub: "Kabupaten Garut", initials: "AH" }
      : { name: "Pembeli WhatsApp", sub: "Guest • Semua wilayah", initials: "TG" };
  }
  const chip = (
    <span className="role-chip">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", marginRight: 0 }} dangerouslySetInnerHTML={{ __html: isFarmer ? SVG_PATHS.sprout : SVG_PATHS.truck }} />
      {isFarmer ? "Petani" : "Tengkulak"}
    </span>
  );
  return (
    <DashboardShell
      variant="role"
      brandSmall={isFarmer ? "PETANI" : "Tengkulak"}
      nav={nav}
      user={user}
      chatbotFrom={role}
      switchLink={isFarmer ? { href: "/tengkulak", label: "Dashboard Tengkulak" } : { href: "/petani", label: "Dashboard Petani" }}
      topExtra={chip}
      onNotif={() => A.notifications()}
    >
      {children}
    </DashboardShell>
  );
}

/** Tampilkan halaman hanya setelah data dimuat; galat API ditampilkan sebagai kartu. */
export function RoleGate({ children }: { children: ReactNode }) {
  const { db, error } = useRole();
  if (error) return <ApiErrorCard error={error} what="dashboard" />;
  if (!db) return <div className="empty-state">Memuat data dari server…</div>;
  return <>{children}</>;
}

export function RoleLayout({ role, children }: { role: RoleKind; children: ReactNode }) {
  return (
    <DashboardRoot variant="role">
      <RoleDataProvider role={role}>
        <RoleShell>{children}</RoleShell>
      </RoleDataProvider>
    </DashboardRoot>
  );
}
