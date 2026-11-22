"use client";
/* Kerangka dashboard (sidebar + topbar) bersama untuk admin, petani, dan tengkulak.
   Markup dan kelas CSS sama dengan admin.html / petani.html / tengkulak.html. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
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

interface Props {
  variant: "admin" | "role";
  brandSmall: string;
  nav: NavItem[];
  user: ShellUser;
  chatbotFrom: "admin" | "petani" | "tengkulak";
  switchLink?: { href: string; label: string };
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

function ShellInner({ variant, brandSmall, nav, user, chatbotFrom, switchLink, topExtra, onNotif, children }: Props) {
  const pathname = usePathname();
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const active = activeHref(pathname, nav);
  const crumb = nav.find((n) => n.href === active)?.label ?? "Overview";
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

        <div className="side-bottom">
          <Link className="side-panel" href={`/chatbot?from=${chatbotFrom}`} title="Simulasi chatbot WhatsApp">
            <div className="panel-icon">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/logo-wa.jpg" alt="WhatsApp" />
            </div>
            <div>
              <h4>Alur WhatsApp</h4>
              <p>Simulasi chatbot Temu Tani</p>
            </div>
          </Link>

          <Link className="side-footer" href="/" title="Keluar ke halaman utama" aria-label="Keluar ke halaman utama">
            <div className="avatar">{user.initials}</div>
            <div>
              <strong>{user.name}</strong>
              {user.sub ? <small>{user.sub}</small> : null}
            </div>
            <svg className="logout-ico" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 17l5-5-5-5M20 12H9M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7" />
            </svg>
          </Link>

          {switchLink ? (
            <div className="side-switch">
              Lihat simulasi: <Link href={switchLink.href}>{switchLink.label}</Link>
            </div>
          ) : null}
        </div>
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
            <div className="top-profile">
              <div className="avatar" style={variant === "admin" ? { height: 33, width: 33 } : undefined}>
                {user.initials}
              </div>
              <div>
                <strong>{user.name}</strong>
                {user.sub ? <small>{user.sub}</small> : null}
              </div>
            </div>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
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
