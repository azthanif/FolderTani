"use client";
/* Kerangka dashboard (sidebar + topbar) bersama untuk admin, petani, dan tengkulak.
   Markup dan kelas CSS sama dengan admin.html / petani.html / tengkulak.html. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { getSession } from "@/lib/auth";
import { showConfirm } from "@/lib/dialog";
import { Icon, type IconName } from "./Icon";
import { UIProvider, useUI, type UIContextValue } from "./UIProvider";

export interface NavItem {
  href: string;
  icon: IconName;
  label: string;
  count?: number;
}

export interface ShellUser {
  name: string;
  sub?: string;
  initials: string;
}

const ROLE_LABEL: Record<string, string> = { petani: "Petani", tengkulak: "Tengkulak", admin: "Administrator" };

interface Props {
  variant: "admin" | "role";
  brandSmall: string;
  nav: NavItem[];
  user: ShellUser;
  /** Halaman pengaturan profil, dibuka dari menu profil di kanan atas. */
  profileHref: string;
  /** Hapus sesi dan keluar (menu profil di kanan atas). */
  onLogout: () => void;
  /** Elemen di topbar sebelum tombol notifikasi (pencarian global admin / chip peran). */
  topExtra?: ReactNode;
  /** Dipanggil saat tombol lonceng diklik; menerima API modal/toast. */
  onNotif?: (ui: UIContextValue) => void;
  children: ReactNode;
}

/** Item aktif = href terpanjang yang cocok dengan pathname (agar /admin tidak aktif di /admin/stok). */
function activeHref(pathname: string, nav: NavItem[]): string | undefined {
  const norm = pathname.replace(/\/$/, "") || "/";
  return nav
    .filter((n) => norm === n.href || norm.startsWith(n.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

/** Pembungkus terluar dashboard: scope CSS (.dash / .role-app) + modal & toast.
 *  Letakkan provider data DI DALAM komponen ini agar provider bisa memakai useUI(). */
export function DashboardRoot({ variant, children }: { variant: "admin" | "role"; children: ReactNode }) {
  return (
    <div className="dash">
      <div className={variant === "role" ? "role-app" : "admin-app"}>
        <UIProvider>{children}</UIProvider>
      </div>
    </div>
  );
}

/** Sidebar + topbar. Harus dirender di dalam <DashboardRoot>. */
export function DashboardShell(props: Props) {
  return <ShellInner {...props} />;
}

function ShellInner({ variant, brandSmall, nav, user, profileHref, onLogout, topExtra, onNotif, children }: Props) {
  const pathname = usePathname();
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const active = activeHref(pathname, nav);
  const onProfile = pathname.replace(/\/$/, "") === profileHref;
  const crumb = onProfile ? "Profil Saya" : (nav.find((n) => n.href === active)?.label ?? "Overview");
  const close = () => setOpen(false);

  return (
    <div className="app">
      <div className={`mobile-overlay${open ? " open" : ""}`} onClick={close} />

      <aside className={`sidebar${open ? " open" : ""}`}>
        <div className="brand">
          <div className="brand-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/logo-temutani-bg-white.png" alt="Logo TemuTani" />
          </div>
          <div>
            <div className="brand-name">TemuTani</div>
            <div className="brand-small">{brandSmall}</div>
          </div>
        </div>

        <div className="nav-label">MENU UTAMA</div>
        <nav className="nav-items">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`nav-link${n.href === active ? " active" : ""}`}
              onClick={() => {
                close();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <Icon name={n.icon} size={18} />
              <span>{n.label}</span>
              {n.count ? <span className="nav-count">{n.count}</span> : null}
            </Link>
          ))}
        </nav>

      </aside>

      <div className="main">
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
            <button className="icon-btn hamburger" type="button" title="Buka menu" aria-label="Buka menu" onClick={() => setOpen((v) => !v)}>
              <Icon name="menu" size={variant === "admin" ? 20 : 19} />
            </button>
            <div className="breadcrumbs">
              <span>Dashboard Temu Tani</span>
              <span>/</span>
              <span className="current">{crumb}</span>
            </div>
          </div>

          <div className="topactions">
            {topExtra}
            <button className="icon-btn" type="button" title="Notifikasi" aria-label="Notifikasi" onClick={() => onNotif?.(ui)}>
              <Icon name="bell" size={17} />
              <span className="notification-dot" />
            </button>
            <div className="top-separator" />
            <ProfileMenu variant={variant} user={user} profileHref={profileHref} onLogout={onLogout} active={onProfile} />
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}

/** Tombol profil di kanan atas + dropdown: ringkasan akun, Pengaturan Profil, Keluar. */
function ProfileMenu({
  variant,
  user,
  profileHref,
  onLogout,
  active,
}: {
  variant: Props["variant"];
  user: ShellUser;
  profileHref: string;
  onLogout: () => void;
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<{ phone: string; role: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Nomor HP & peran dari sesi (hanya tersedia di browser).
  useEffect(() => {
    const s = getSession();
    if (s) setAccount({ phone: s.user.phone, role: ROLE_LABEL[s.user.role] || s.user.role });
  }, [open]);

  // Tutup saat pindah halaman, klik di luar, atau tekan Escape.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="profile-menu" ref={ref}>
      <button
        type="button"
        className={`top-profile${open || active ? " open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="avatar" style={variant === "admin" ? { height: 33, width: 33 } : undefined}>
          {user.initials}
        </div>
        <div>
          <strong>{user.name}</strong>
          {user.sub ? <small>{user.sub}</small> : null}
        </div>
        <svg className="profile-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div className="profile-dropdown" role="menu">
          <div className="profile-summary">
            <div className="avatar lg">{user.initials}</div>
            <div>
              <strong>{user.name}</strong>
              {account?.phone ? <small>{account.phone}</small> : null}
              {account?.role ? <span className="profile-role">{account.role}</span> : null}
            </div>
          </div>
          <div className="profile-divider" />
          <Link href={profileHref} className="profile-item" role="menuitem" onClick={() => setOpen(false)}>
            <Icon name="user" size={16} />
            <span>Pengaturan Profil</span>
          </Link>
          <button
            type="button"
            className="profile-item danger"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              const ok = await showConfirm({
                title: "Keluar dari akun ini?",
                message: "Anda perlu masuk lagi dengan nomor HP dan password untuk membuka dashboard.",
                confirmLabel: "Keluar",
                tone: "danger",
                mascot: "melambai",
              });
              if (ok) onLogout();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 17l5-5-5-5M20 12H9M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7" />
            </svg>
            <span>Keluar</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Kartu galat API (pengganti apiErrorHTML). */
export function ApiErrorCard({ error, what = "data" }: { error: Error; what?: string }) {
  return (
    <div className="card section-card">
      <div className="empty-state">
        <div>
          <strong>Gagal memuat {what}</strong>
          {error.message}
          <br />
          <small>
            Jalankan server dengan <code>uvicorn backend.main:app --reload</code>, lalu jalankan frontend dengan <code>npm run dev</code>.
          </small>
        </div>
      </div>
    </div>
  );
}
