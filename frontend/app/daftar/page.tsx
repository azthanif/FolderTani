"use client";
/* Halaman Daftar: khusus tengkulak (akun petani dimasukkan admin). Data: nama/nama usaha, nomor HP,
   password + ulangi, alamat kabupaten -> kecamatan -> desa/kelurahan. Akun aktif setelah diverifikasi admin. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AddressFields, type Address } from "@/components/auth/AddressFields";
import { AuthShell, PasswordField } from "@/components/auth/AuthShell";
import { ConfirmHint, PasswordRules } from "@/components/auth/PasswordRules";
import { ApiError } from "@/lib/api";
import { dashboardPath, getSession, isStrongPassword, register } from "@/lib/auth";

export default function DaftarPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [address, setAddress] = useState<Address>({ region: "", district: "", village: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [waRegistered, setWaRegistered] = useState(false);
  const [done, setDone] = useState("");

  useEffect(() => {
    const s = getSession();
    if (s) router.replace(dashboardPath(s.user.role));
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setWaRegistered(false);
    if (!isStrongPassword(password)) return setError("Password belum memenuhi semua persyaratan.");
    if (password !== confirm) return setError("Konfirmasi password tidak sama.");
    setBusy(true);
    try {
      const r = await register({ name: name.trim(), phone, password, ...address });
      setDone(r.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Pendaftaran gagal. Coba lagi.");
      if (err instanceof ApiError && err.message.includes("Lupa Password")) setWaRegistered(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthShell title="Pendaftaran terkirim" subtitle="Terima kasih telah mendaftar sebagai tengkulak." footer={<Link href="/">Kembali ke beranda</Link>}>
        <div className="auth-success" role="status">
          <div className="auth-success-icon" aria-hidden="true">
            ✓
          </div>
          <h2>Menunggu verifikasi admin</h2>
          <p>{done}</p>
          <Link className="auth-submit" href="/masuk" style={{ textDecoration: "none", width: "100%" }}>
            Ke halaman Masuk
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Daftar sebagai Tengkulak"
      subtitle="Lengkapi data di bawah. Akun aktif setelah diverifikasi admin Temu Tani."
      footer={
        <>
          Sudah punya akun? <Link href="/masuk">Masuk</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={submit}>
        <div className="auth-field">
          <label htmlFor="name">Nama / nama usaha</label>
          <input id="name" name="name" autoComplete="organization" required minLength={3} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: UD Padi Makmur" />
        </div>

        <div className="auth-field">
          <label htmlFor="phone">Nomor HP (WhatsApp)</label>
          <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Contoh: 081234567890" />
          <small>Dipakai untuk masuk dan menerima kabar verifikasi. Nomor tidak ditampilkan ke pengguna lain.</small>
        </div>

        <div className="auth-field">
          <label htmlFor="password">Password</label>
          <PasswordField id="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />
        </div>
        <PasswordRules value={password} />
        <div className="auth-field">
          <label htmlFor="confirm">Ulangi password</label>
          <PasswordField id="confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" minLength={8} />
          <ConfirmHint password={password} confirm={confirm} />
        </div>

        <fieldset className="auth-field">
          <legend>Alamat usaha</legend>
          <div className="auth-form" style={{ gap: 12 }}>
            <AddressFields value={address} onChange={setAddress} fieldClass="auth-field" idPrefix="daftar" />
          </div>
        </fieldset>

        {error ? (
          <div className="auth-error" role="alert">
            {error}
            {waRegistered ? (
              <>
                {" "}
                <Link href={`/lupa-password?phone=${encodeURIComponent(phone)}`}>Buat password sekarang</Link>
              </>
            ) : null}
          </div>
        ) : null}
        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? "Mengirim…" : "Daftar"}
        </button>
        <small style={{ color: "var(--muted)", fontSize: 12, textAlign: "center" }}>
          Anda petani? Akun petani dibuatkan oleh admin Temu Tani. Hubungi admin atau chatbot WhatsApp kami.
        </small>
      </form>
    </AuthShell>
  );
}
