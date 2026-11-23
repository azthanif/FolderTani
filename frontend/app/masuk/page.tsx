"use client";
/* Halaman Masuk: nomor HP + password. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AuthShell, PasswordField } from "@/components/auth/AuthShell";
import { ApiError } from "@/lib/api";
import { dashboardPath, getSession, login } from "@/lib/auth";

export default function MasukPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Sudah login: langsung ke dashboard.
  useEffect(() => {
    const s = getSession();
    if (s) router.replace(dashboardPath(s.user.role));
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const s = await login(phone, password);
      router.replace(dashboardPath(s.user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal masuk. Coba lagi.");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Masuk ke TemuTani"
      subtitle="Gunakan nomor HP dan password yang Anda daftarkan."
      footer={
        <>
          Belum punya akun? <Link href="/daftar">Daftar sekarang</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={submit} noValidate={false}>
        <div className="auth-field">
          <label htmlFor="phone">Nomor HP</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Contoh: 081234567890"
          />
        </div>
        <div className="auth-field">
          <div className="auth-label-row">
            <label htmlFor="password">Password</label>
            <Link href={phone ? `/lupa-password?phone=${encodeURIComponent(phone)}` : "/lupa-password"}>Lupa password?</Link>
          </div>
          <PasswordField id="password" value={password} onChange={setPassword} autoComplete="current-password" />
        </div>
        {error ? (
          <div className="auth-error" role="alert">
            {error}
          </div>
        ) : null}
        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? "Memproses…" : "Masuk"}
        </button>
      </form>
    </AuthShell>
  );
}
