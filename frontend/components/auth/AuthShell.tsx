"use client";
/* Kerangka halaman Masuk/Daftar: kolom brand di kiri, kartu formulir di kanan. */
import Link from "next/link";
import { useState, type ReactNode } from "react";
import "@/styles/auth.css";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-side" aria-hidden="true">
        <Link className="auth-brand" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" src="/assets/logo-temutani-bg-white.png" />
          <span>TemuTani</span>
        </Link>
        <div className="auth-side-copy">
          <h2>Terhubung lebih mudah, bertumbuh bersama.</h2>
          <p>Catat stok gabah, terima penawaran pembeli, dan bandingkan dengan referensi harga gabah berbasis AI.</p>
        </div>
        <small>© 2026 TemuTani. Prototipe oleh TemanTani</small>
      </aside>
      <main className="auth-main">
        <Link className="auth-back" href="/">
          ← Kembali ke beranda
        </Link>
        <div className="auth-card">
          <h1>{title}</h1>
          <p className="auth-sub">{subtitle}</p>
          {children}
          <div className="auth-foot">{footer}</div>
        </div>
      </main>
    </div>
  );
}

/** Input password dengan tombol tampilkan/sembunyikan. */
export function PasswordField({
  id,
  value,
  onChange,
  autoComplete,
  minLength,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="auth-pass">
      <input
        id={id}
        name="password"
        type={show ? "text" : "password"}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={minLength ? `Minimal ${minLength} karakter` : "Masukkan password"}
      />
      <button
        type="button"
        className="auth-pass-toggle"
        aria-pressed={show}
        aria-controls={id}
        aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
        title={show ? "Sembunyikan password" : "Tampilkan password"}
        onClick={() => setShow((v) => !v)}
      >
        {/* Ikon mata (terbuka = password tampil, dicoret = tersembunyi) */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {show ? (
            <>
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
            </>
          ) : (
            <>
              <path d="M10.7 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.2 3.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
