"use client";
/* Halaman Profil Saya (petani, tengkulak, admin): ubah data diri + ubah password dengan kode WhatsApp. */
import { useEffect, useState, type FormEvent } from "react";
import { PasswordField } from "@/components/auth/AuthShell";
import { Icon } from "@/components/Icon";
import { useUI } from "@/components/UIProvider";
import { api, ApiError } from "@/lib/api";
import { changePassword, getSession, REGIONS, requestOtp, setSession, updateProfile, type SessionUser } from "@/lib/auth";
import "@/styles/auth.css";

const ROLE_LABEL = { petani: "Petani", tengkulak: "Tengkulak", admin: "Administrator" } as const;
/** Event agar dashboard memuat ulang data setelah profil berubah. */
export const PROFILE_EVENT = "temutani:profile";

export function ProfileView() {
  const { toast } = useUI();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [district, setDistrict] = useState("");
  const [share, setShare] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileErr, setProfileErr] = useState("");

  const [otpSent, setOtpSent] = useState(false);
  const [otpInfo, setOtpInfo] = useState("");
  const [devCode, setDevCode] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState("");
  const [cooldown, setCooldown] = useState(0);

  function fill(u: SessionUser) {
    setUser(u);
    setName(u.name);
    setRegion(u.region || "");
    setDistrict(u.district || "");
    setShare(!!u.shareContact);
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

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (!user) return <div className="empty-state">Memuat profil…</div>;
  const isFarmer = user.role === "petani";

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileErr("");
    setSaving(true);
    try {
      const r = await updateProfile(isFarmer ? { name, region, district, shareContact: share } : { name });
      fill(r.user);
      window.dispatchEvent(new Event(PROFILE_EVENT));
      toast(r.message);
    } catch (err) {
      setProfileErr(err instanceof ApiError ? err.message : "Profil gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function sendCode() {
    setPwErr("");
    setPwBusy(true);
    try {
      const r = await requestOtp("change_password");
      setOtpSent(true);
      setOtpInfo(r.message);
      setDevCode(r.devCode || "");
      setCooldown(60);
    } catch (err) {
      setPwErr(err instanceof ApiError ? err.message : "Kode gagal dikirim.");
    } finally {
      setPwBusy(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setPwErr("");
    if (pw !== pw2) return setPwErr("Konfirmasi password tidak sama.");
    setPwBusy(true);
    try {
      const r = await changePassword(code, pw);
      toast(r.message + " Sesi di perangkat lain otomatis keluar.");
      setOtpSent(false);
      setCode("");
      setPw("");
      setPw2("");
      setDevCode("");
    } catch (err) {
      setPwErr(err instanceof ApiError ? err.message : "Password gagal diubah.");
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="profile-page">
      <div className="page-heading">
        <div>
          <div className="overline">TEMU TANI / {ROLE_LABEL[user.role].toUpperCase()}</div>
          <h1>Profil Saya</h1>
          <p>Kelola data diri dan keamanan akun Anda.</p>
        </div>
      </div>

      <div className="profile-grid">
        <section className="card profile-card">
          <h3 className="section-title">Data Diri</h3>
          <form className="profile-form" onSubmit={saveProfile}>
            <label className="profile-field">
              <span>{user.role === "tengkulak" ? "Nama / nama usaha" : "Nama lengkap"}</span>
              <input required minLength={3} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="profile-row">
              <label className="profile-field">
                <span>Nomor HP</span>
                <input value={user.phone} readOnly disabled />
              </label>
              <label className="profile-field">
                <span>Peran</span>
                <input value={ROLE_LABEL[user.role]} readOnly disabled />
              </label>
            </div>
            {isFarmer ? (
              <>
                <div className="profile-row">
                  <label className="profile-field">
                    <span>Kabupaten</span>
                    <select required value={region} onChange={(e) => setRegion(e.target.value)}>
                      {REGIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="profile-field">
                    <span>Kecamatan</span>
                    <input required minLength={2} maxLength={60} value={district} onChange={(e) => setDistrict(e.target.value)} />
                  </label>
                </div>
                <label className="profile-check">
                  <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
                  <span>Izinkan nomor HP saya ditampilkan kepada pembeli setelah harga disepakati.</span>
                </label>
              </>
            ) : null}
            <p className="profile-note">Nomor HP dipakai untuk masuk dan menerima kode verifikasi, sehingga tidak bisa diubah di sini.</p>
            {profileErr ? <div className="auth-error" role="alert">{profileErr}</div> : null}
            <div className="profile-actions">
              <button className="btn primary" type="submit" disabled={saving}>
                {saving ? "Menyimpan…" : "Simpan Profil"}
              </button>
            </div>
          </form>
        </section>

        <section className="card profile-card">
          <h3 className="section-title">Ubah Password</h3>
          <p className="profile-note">
            Untuk keamanan, kode verifikasi dikirim ke WhatsApp <b>{user.phone}</b>.
          </p>
          {!otpSent ? (
            <>
              {pwErr ? <div className="auth-error" role="alert">{pwErr}</div> : null}
              <div className="profile-actions">
                <button className="btn primary" type="button" onClick={sendCode} disabled={pwBusy}>
                  <Icon name="phone" size={15} /> {pwBusy ? "Mengirim…" : "Kirim Kode via WhatsApp"}
                </button>
              </div>
            </>
          ) : (
            <form className="profile-form" onSubmit={savePassword}>
              <div className="auth-info">{otpInfo}</div>
              {devCode ? <div className="auth-info">Mode pengembangan: kode Anda <b>{devCode}</b></div> : null}
              <label className="profile-field">
                <span>Kode verifikasi (6 digit)</span>
                <input className="auth-code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              </label>
              <div className="profile-field">
                <span>Password baru</span>
                <PasswordField id="newPassword" value={pw} onChange={setPw} autoComplete="new-password" minLength={8} />
              </div>
              <div className="profile-field">
                <span>Ulangi password baru</span>
                <PasswordField id="newPassword2" value={pw2} onChange={setPw2} autoComplete="new-password" minLength={8} />
              </div>
              {pwErr ? <div className="auth-error" role="alert">{pwErr}</div> : null}
              <div className="profile-actions">
                <button type="button" className="btn" disabled={cooldown > 0 || pwBusy} onClick={sendCode}>
                  {cooldown ? `Kirim ulang (${cooldown} dtk)` : "Kirim ulang kode"}
                </button>
                <button className="btn primary" type="submit" disabled={pwBusy}>
                  {pwBusy ? "Menyimpan…" : "Simpan Password"}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
