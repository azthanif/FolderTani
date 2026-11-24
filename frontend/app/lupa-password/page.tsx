"use client";
/* Lupa password: (1) kirim kode verifikasi ke WhatsApp, (2) masukkan kode + password baru. */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { AuthShell, PasswordField } from "@/components/auth/AuthShell";
import { ConfirmHint, PasswordRules } from "@/components/auth/PasswordRules";
import { ApiError } from "@/lib/api";
import { dashboardPath, isStrongPassword, requestOtp, resetPassword } from "@/lib/auth";

function ForgotForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState(params.get("phone") || "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [info, setInfo] = useState("");
  const [devCode, setDevCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await requestOtp("reset_password", phone);
      setInfo(r.message);
      setDevCode(r.devCode || "");
      setStep(2);
      setCooldown(60);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kode gagal dikirim. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function reset(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!isStrongPassword(password)) return setError("Password baru belum memenuhi semua persyaratan.");
    if (password !== confirm) return setError("Konfirmasi password tidak sama.");
    setBusy(true);
    try {
      const s = await resetPassword(phone, code, password);
      router.replace(dashboardPath(s.user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengatur ulang password.");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Lupa password"
      mascot="ide"
      subtitle={step === 1 ? "Masukkan nomor HP Anda. Kode verifikasi akan dikirim lewat WhatsApp." : "Masukkan kode dari WhatsApp dan buat password baru."}
      footer={
        <>
          Ingat password? <Link href="/masuk">Masuk</Link>
        </>
      }
    >
      <div className="auth-steps" aria-hidden="true">
        <span className={step === 1 ? "on" : ""}>1. Nomor HP</span>
        <span className={step === 2 ? "on" : ""}>2. Kode & password baru</span>
      </div>
      {step === 1 ? (
        <form className="auth-form" onSubmit={send}>
          <div className="auth-field">
            <label htmlFor="phone">Nomor HP (WhatsApp)</label>
            <input id="phone" type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Contoh: 081234567890" />
          </div>
          {error ? <div className="auth-error" role="alert">{error}</div> : null}
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? "Mengirim…" : "Kirim Kode via WhatsApp"}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={reset}>
          <div className="auth-info">{info}</div>
          {devCode ? <div className="auth-info">Mode pengembangan (WhatsApp belum dikonfigurasi): kode Anda <b>{devCode}</b></div> : null}
          <div className="auth-field">
            <label htmlFor="code">Kode verifikasi (6 digit)</label>
            <input id="code" className="auth-code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="auth-field">
            <label htmlFor="password">Password baru</label>
            <PasswordField id="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />
          </div>
          <PasswordRules value={password} />
          <div className="auth-field">
            <label htmlFor="confirm">Ulangi password baru</label>
            <PasswordField id="confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" minLength={8} />
            <ConfirmHint password={password} confirm={confirm} />
          </div>
          {error ? <div className="auth-error" role="alert">{error}</div> : null}
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? "Memproses…" : "Simpan Password Baru"}
          </button>
          <div className="auth-label-row">
            <button type="button" className="auth-link" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => { setStep(1); setError(""); }}>
              Ganti nomor
            </button>
            <button type="button" className="auth-link" style={{ background: "none", border: 0, padding: 0, cursor: cooldown ? "default" : "pointer", opacity: cooldown ? 0.5 : 1 }} disabled={cooldown > 0 || busy} onClick={() => send()}>
              {cooldown ? `Kirim ulang (${cooldown} dtk)` : "Kirim ulang kode"}
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}

export default function LupaPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotForm />
    </Suspense>
  );
}
