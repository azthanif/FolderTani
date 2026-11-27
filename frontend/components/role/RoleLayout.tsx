"use client";
/* Layout bersama dashboard petani & tengkulak: DashboardRoot > RoleDataProvider > shell. */
import { useEffect, useState, type ReactNode } from "react";
import { onSeenChange, unseenDone } from "@/lib/escrowSeen";
import { ApiErrorCard, DashboardRoot, DashboardShell, type NavItem } from "@/components/DashboardShell";
import { SVG_PATHS } from "@/components/Icon";
import { useRoleActions } from "./actions";
import { RoleDataProvider, useRole } from "./RoleDataProvider";
import { initials } from "@/lib/format";
import { selectors } from "./common";
import type { RoleKind } from "./types";

const PAGE_DEFS: Record<RoleKind, [string, string, string][]> = {
  petani: [
    ["overview", "dashboard", "Overview"], ["stok", "wheat", "Stok Gabah"], ["penawaran", "handshake", "Penawaran & Negosiasi"],
    ["harga", "chart", "Prediksi Harga AI"], ["transaksi", "history", "Riwayat Kesepakatan"], ["berita", "document", "Berita & Analisis"]
  ],
  tengkulak: [
    ["overview", "dashboard", "Overview"], ["stok", "wheat", "Stok Gabah"], ["penawaran", "handshake", "Penawaran & Negosiasi"],
    ["transaksi", "history", "Riwayat Kesepakatan"]
  ],
};

function RoleShell({ children }: { children: ReactNode }) {
  const { role, isFarmer, db, base, logout } = useRole();
  const A = useRoleActions();
  const [, setSeenTick] = useState(0); // render ulang badge saat transaksi selesai ditandai sudah dilihat
  useEffect(() => onSeenChange(() => setSeenTick((n) => n + 1)), []);
  let nav: NavItem[] = [];
  let user = { name: "—", sub: "—", initials: "--" };
  if (db) {
    const S = selectors(db, isFarmer);
    const pending = S.myOffers().filter((o) => (isFarmer ? o.status === "Menunggu Petani" : o.status === "Penawaran Balik")).length;
    // Escrow yang menunggu tindakan pengguna: petani kirim gabah; tengkulak bayar atau konfirmasi terima.
    const escrowTodo = S.myTransactions().filter((t) => (isFarmer ? t.escrowStatus === "DIBAYAR" : ["MENUNGGU_BAYAR", "DIKIRIM"].includes(t.escrowStatus || ""))).length
      + unseenDone(db.actor.user, S.myTransactions().filter((t) => t.escrowStatus === "SELESAI").map((t) => t.id)).length;
    nav = PAGE_DEFS[role].map(([id, icon, label]) => ({
      href: id === "overview" ? base : `${base}/${id}`,
      icon,
      label,
      count: id === "penawaran" && pending ? pending : id === "transaksi" && escrowTodo ? escrowTodo : undefined,
    }));
    const f = S.myFarmer();
    const b = S.myBuyer();
    user = isFarmer
      ? { name: f?.name || "—", sub: f ? `${f.village}, ${f.region}` : "—", initials: f ? initials(f.name) : "--" }
      : { name: b?.label || "—", sub: "Tengkulak • Semua wilayah", initials: b ? initials(b.label) : "--" };
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
      profileHref={`${base}/profil`}
      onLogout={logout}
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
