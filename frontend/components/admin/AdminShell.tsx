"use client";
/* Sidebar/topbar admin + pencarian global + notifikasi. */
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { usePathname, useRouter } from "next/navigation";
import { ApiErrorCard, DashboardShell, type NavItem } from "@/components/DashboardShell";
import { Icon } from "@/components/Icon";
import { useAdmin } from "./AdminData";
import { ALL_AREAS } from "./types";
import { countOffers } from "./ui";
import { initials } from "@/lib/format";

const TABLE_PATHS = ["/admin/stok", "/admin/penawaran", "/admin/transaksi", "/admin/aktivitas"];

export function AdminShell({ children }: { children: ReactNode }) {
  const { offers, pendingAccounts, setQuery, queueQuery, session, logout } = useAdmin();
  const adminName = session?.user.name || "Admin";
  const pathname = usePathname();
  const router = useRouter();
  const active = countOffers(offers, ALL_AREAS);
  // Escrow yang perlu tindak lanjut admin (sengketa & pencairan gagal), diperbarui berkala.
  const [escrowTodo, setEscrowTodo] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ items: unknown[] }>("/escrow?status=SENGKETA,PENCAIRAN_GAGAL")
        .then((r) => alive && setEscrowTodo(r.items.length))
        .catch(() => undefined);
    load();
    const t = setInterval(() => !document.hidden && load(), 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const nav: NavItem[] = [
    { href: "/admin", icon: "layout-dashboard", label: "Overview" },
    { href: "/admin/stok", icon: "wheat", label: "Stok Gabah" },
    { href: "/admin/penawaran", icon: "handshake", label: "Penawaran & Negosiasi", count: active },
    { href: "/admin/harga", icon: "chart-no-axes-combined", label: "Prediksi Harga AI" },
    { href: "/admin/transaksi", icon: "receipt-text", label: "Riwayat Kesepakatan" },
    { href: "/admin/escrow", icon: "wallet", label: "Escrow & Pembayaran", count: escrowTodo || undefined },
    { href: "/admin/aktivitas", icon: "messages-square", label: "Aktivitas Chatbot" },
    { href: "/admin/berita", icon: "newspaper", label: "Berita & Analisis" },
    { href: "/admin/akun", icon: "users", label: "Kelola Akun", count: pendingAccounts },
  ];

  function globalQuery(q: string) {
    const path = pathname.replace(/\/$/, "");
    if (TABLE_PATHS.includes(path)) setQuery(q);
    else if (q.trim()) {
      queueQuery(q);
      router.push("/admin/penawaran");
    }
  }

  return (
    <DashboardShell
      variant="admin"
      brandSmall="Administrator"
      user={{ name: adminName, initials: initials(adminName) }}
      profileHref="/admin/profil"
      onLogout={logout}
      nav={nav}
      topExtra={
        <label className="global-search">
          <Icon name="search" size={16} />
          <input placeholder="Cari stok, pembeli, penawaran..." aria-label="Cari di halaman" onChange={(e) => globalQuery(e.target.value)} />
        </label>
      }
      onNotif={(ui) =>
        ui.openModal(
          "Notifikasi",
          "Informasi terbaru",
          <>
            {[
              ...(pendingAccounts ? [pendingAccounts + " tengkulak baru menunggu verifikasi di menu Kelola Akun."] : []),
              "Ada " + active + " penawaran yang menunggu respons atau penawaran balik.",
              "Data stok, penawaran, dan kesepakatan dibaca langsung dari database Temu Tani (web & chatbot WhatsApp).",
            ].map((t) => (
              <div className="activity" key={t}>
                <div className="activity-icon">
                  <Icon name="bell" size={16} />
                </div>
                <div>
                  <strong>{t}</strong>
                </div>
              </div>
            ))}
          </>,
        )
      }
    >
      {children}
    </DashboardShell>
  );
}

/** Tampilkan anak hanya bila data admin sudah siap (loading/galat ditangani di sini). */
export function AdminGate({ children, what = "dashboard admin" }: { children: ReactNode; what?: string }) {
  const { loading, error } = useAdmin();
  if (loading) return <div className="empty-state">Memuat data dari server…</div>;
  if (error) return <ApiErrorCard error={error} what={what} />;
  return <>{children}</>;
}

