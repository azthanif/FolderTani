"use client";
/* Halaman Daftar. Petani: peran, nama, nomor HP, password, kota/kab, kecamatan.
   Tengkulak: peran, nama, nomor HP, password. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AuthShell, PasswordField } from "@/components/auth/AuthShell";
import { ApiError } from "@/lib/api";
import { dashboardPath, getSession, register, REGIONS, type SignupRole } from "@/lib/auth";

const ROLE_OPTIONS: { value: SignupRole; label: string; desc: string }[] = [
  { value: "petani", label: "Petani", desc: "Catat stok gabah dan tanggapi penawaran" },
  { value: "tengkulak", label: "Tengkulak", desc: "Cari stok gabah dan ajukan penawaran" },
];

export default function DaftarPage() {
  const router = useRouter();
  const [role, setRole] = useState<SignupRole>("petani");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [region, setRegion] = useState("");
  const [district, setDistrict] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [waRegistered, setWaRegistered] = useState(false);
  const isFarmer = role === "petani";

  useEffect(() => {
    const s = getSession();
    if (s) router.replace(dashboardPath(s.user.role));
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const s = await register({
        role,
        name: name.trim(),
        phone,
        password,
        ...(isFarmer ? { region: region.trim(), district: district.trim() } : {}),
      });
      router.replace(dashboardPath(s.user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Pendaftaran gagal. Coba lagi.");
      if (err instanceof ApiError && err.message.includes("Lupa Password")) setWaRegistered(true);
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Buat akun TemuTani"
      subtitle="Pilih peran Anda, lalu lengkapi data di bawah."
      footer={
        <>
          Sudah punya akun? <Link href="/masuk">Masuk</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={submit}>
        <fieldset className="auth-field">
          <legend>Daftar sebagai</legend>
          <div className="auth-roles" role="radiogroup">
            {ROLE_OPTIONS.map((o) => (
              <label key={o.value} className={`auth-role ${role === o.value ? "active" : ""}`}>
                <input type="radio" name="role" value={o.value} checked={role === o.value} onChange={() => setRole(o.value)} />
                <strong>{o.label}</strong>
                <span>{o.desc}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="auth-field">
          <label htmlFor="name">{isFarmer ? "Nama lengkap" : "Nama / nama usaha"}</label>
          <input id="name" name="name" autoComplete="name" required minLength={3} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder={isFarmer ? "Contoh: Asep Hidayat" : "Contoh: UD Padi Makmur"} />
        </div>

        <div className="auth-field">
          <label htmlFor="phone">Nomor HP</label>
          <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Contoh: 081234567890" />
          <small>Dipakai untuk masuk. Nomor tidak ditampilkan ke pengguna lain.</small>
        </div>

        <div className="auth-field">
          <label htmlFor="password">Password</label>
          <PasswordField id="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />
        </div>

        {isFarmer ? (
          <div className="auth-row">
            <div className="auth-field">
              <label htmlFor="region">Kabupaten</label>
              <select id="region" name="region" required value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="" disabled>
                  Pilih kabupaten
                </option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="auth-field">
              <label htmlFor="district">Kecamatan</label>
              <input id="district" name="district" autoComplete="address-level3" required minLength={2} maxLength={60} value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="Contoh: Tarogong Kidul" />
            </div>
          </div>
        ) : null}

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
          {busy ? "Memproses…" : `Daftar sebagai ${isFarmer ? "Petani" : "Tengkulak"}`}
        </button>
      </form>
    </AuthShell>
  );
}
