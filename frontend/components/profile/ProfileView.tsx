"use client";
/* Halaman Profil Saya (petani, tengkulak, admin). Tata letak satu kolom: kartu identitas,
   form data diri, lalu ubah password (password lama + password baru). Lupa password lama
   diarahkan ke /lupa-password (kode WhatsApp). */
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { AddressFields, type Address } from "@/components/auth/AddressFields";
import { PasswordField } from "@/components/auth/AuthShell";
import { ConfirmHint, PasswordRules } from "@/components/auth/PasswordRules";
import { Icon } from "@/components/Icon";
import { useUI } from "@/components/UIProvider";
import { api, ApiError } from "@/lib/api";
import { initials } from "@/lib/format";
import { changePassword, getSession, isStrongPassword, REGIONS, setSession, updateProfile, type SessionUser } from "@/lib/auth";
import "@/styles/auth.css";
import "@/styles/profile.css";

const ROLE_LABEL = { petani: "Petani", tengkulak: "Tengkulak", admin: "Administrator" } as const;
/** Event agar dashboard memuat ulang data setelah profil berubah. */
export const PROFILE_EVENT = "temutani:profile";

export function ProfileView() {
  const { toast } = useUI();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [district, setDistrict] = useState("");
  const [address, setAddress] = useState<Address>({ region: "", district: "", village: "" });
  const [saving, setSaving] = useState(false);
  const [profileErr, setProfileErr] = useState("");

  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState("");

  function fill(u: SessionUser) {
    setUser(u);
    setName(u.name);
    setRegion(u.region || "");
    setDistrict(u.district || "");
    setAddress({ region: u.region || "", district: u.district || "", village: u.village || "" });
  }

  useEffect(() => {
    const s = getSession();
    if (s) fill(s.user);
    // Ambil data terbaru dari server (mis. diubah dari perangkat lain).
    api<SessionUser>("/auth/me")
      .then((u) => {
        fill(u);
        const cur = getSession();
        if (cur) setSession({ token: cur.token, user: u });
      })
      .catch(() => undefined);
  }, []);

  if (!user) return <div className="empty-state">Memuat profil…</div>;
  const isFarmer = user.role === "petani";
  const isBuyer = user.role === "tengkulak";

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileErr("");
    setSaving(true);
    try {
      // shareContact dikirim apa adanya agar pengaturan lama tidak berubah.
      const r = await updateProfile(
        isFarmer ? { name, region, district, shareContact: !!user?.shareContact } : isBuyer ? { name, ...address } : { name },
      );
      fill(r.user);
      window.dispatchEvent(new Event(PROFILE_EVENT));
      toast(r.message);
    } catch (err) {
      setProfileErr(err instanceof ApiError ? err.message : "Profil gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setPwErr("");
    if (!isStrongPassword(pw)) return setPwErr("Password baru belum memenuhi semua persyaratan.");
    if (pw === current) return setPwErr("Password baru harus berbeda dari password saat ini.");
    if (pw !== pw2) return setPwErr("Konfirmasi password baru tidak sama.");
    setPwBusy(true);
    try {
      const r = await changePassword(current, pw);
      toast(r.message + " Sesi di perangkat lain otomatis keluar.");
      setCurrent("");
      setPw("");
      setPw2("");
    } catch (err) {
      setPwErr(err instanceof ApiError ? err.message : "Password gagal diubah.");
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="profile-page">
      <section className="card pf-card">
        <div className="pf-identity">
          <div className="pf-avatar" aria-hidden="true">
            {initials(user.name)}
          </div>
          <div className="pf-identity-text">
            <strong>{user.name}</strong>
            <span>{user.phone}</span>
            <em className="pf-role">{ROLE_LABEL[user.role]}</em>
          </div>
        </div>

        <form className="pf-form" onSubmit={saveProfile}>
          <label className="pf-field">
            <span>{user.role === "tengkulak" ? "Nama / Nama Usaha" : "Nama Lengkap"}</span>
            <div className="pf-input-icon">
              <input className="pf-input" required minLength={3} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
              <Icon name="edit" size={16} />
            </div>
          </label>
          {isFarmer ? (
            <div className="pf-row">
              <label className="pf-field">
                <span>Kabupaten</span>
                <select className="pf-input" required value={region} onChange={(e) => setRegion(e.target.value)}>
                  {REGIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pf-field">
                <span>Kecamatan</span>
                <input className="pf-input" required minLength={2} maxLength={60} value={district} onChange={(e) => setDistrict(e.target.value)} />
              </label>
            </div>
          ) : null}
          {isBuyer ? (
            <div className="pf-row pf-row-3">
              <AddressFields value={address} onChange={setAddress} fieldClass="pf-field" selectClass="pf-input" idPrefix="profil" />
            </div>
          ) : null}
          {profileErr ? <div className="auth-error" role="alert">{profileErr}</div> : null}
          <div>
            <button className="pf-btn" type="submit" disabled={saving}>
              {saving ? "Menyimpan…" : "Perbarui profil"}
            </button>
          </div>
        </form>

        <h2 className="pf-heading">Ubah Password</h2>
        <form className="pf-form" onSubmit={savePassword}>
          <div className="pf-field">
            <div className="pf-label-row">
              <span>Password Saat Ini</span>
              <Link href={`/lupa-password?phone=${encodeURIComponent(user.phone)}`} className="pf-link">
                Lupa password?
              </Link>
            </div>
            <PasswordField id="currentPassword" value={current} onChange={setCurrent} autoComplete="current-password" />
          </div>
          <div className="pf-field">
            <span>Password Baru</span>
            <PasswordField id="newPassword" value={pw} onChange={setPw} autoComplete="new-password" minLength={8} />
          </div>
          <PasswordRules value={pw} />
          <div className="pf-field">
            <span>Ulangi Password Baru</span>
            <PasswordField id="newPassword2" value={pw2} onChange={setPw2} autoComplete="new-password" minLength={8} />
            <ConfirmHint password={pw} confirm={pw2} />
          </div>
          {pwErr ? <div className="auth-error" role="alert">{pwErr}</div> : null}
          <div>
            <button className="pf-btn" type="submit" disabled={pwBusy}>
              {pwBusy ? "Menyimpan…" : "Ubah password"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
