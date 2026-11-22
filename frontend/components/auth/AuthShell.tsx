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
      <button type="button" className="auth-pass-toggle" aria-pressed={show} aria-controls={id} onClick={() => setShow((v) => !v)}>
        {show ? "Sembunyikan" : "Tampilkan"}
      </button>
    </div>
  );
}
