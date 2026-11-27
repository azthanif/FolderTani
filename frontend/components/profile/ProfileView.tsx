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
import { changePassword, getSession, isStrongPassword, setSession, updateProfile, type SessionUser } from "@/lib/auth";
import { getPayoutAccount, PAYOUT_CHANNELS, savePayoutAccount, type PayoutAccount } from "@/lib/payout";
import "@/styles/auth.css";
import "@/styles/profile.css";

const ROLE_LABEL = { petani: "Petani", tengkulak: "Tengkulak", admin: "Administrator" } as const;
/** Event agar dashboard memuat ulang data setelah profil berubah. */
export const PROFILE_EVENT = "temutani:profile";

export function ProfileView() {
  const { toast } = useUI();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [name, setName] = useState("");
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
        isFarmer ? { name, ...address, shareContact: !!user?.shareContact } : isBuyer ? { name, ...address } : { name },
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
          {isFarmer || isBuyer ? (
            <>
              <small className="pf-hint">
                {isFarmer
                  ? "Desa/kelurahan dipakai untuk menghitung perkiraan jarak dan biaya angkut saat pembeli memilih gabah diantar."
                  : "Desa/kelurahan dipakai untuk menghitung perkiraan jarak dan biaya angkut bila Anda memilih gabah diantar."}
              </small>
              <div className="pf-row pf-row-3">
                <AddressFields value={address} onChange={setAddress} fieldClass="pf-field" selectClass="pf-input" idPrefix="profil" />
              </div>
            </>
          ) : null}
          {profileErr ? <div className="auth-error" role="alert">{profileErr}</div> : null}
          <div>
            <button className="pf-btn" type="submit" disabled={saving}>
              {saving ? "Menyimpan…" : "Perbarui profil"}
            </button>
          </div>
        </form>

        {isFarmer ? <PayoutSection defaultHolder={user.name} /> : null}

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

/** Akun pencairan petani: tujuan dana escrow (termin logistik & nilai gabah). */
function PayoutSection({ defaultHolder }: { defaultHolder: string }) {
  const { toast } = useUI();
  const [acc, setAcc] = useState<PayoutAccount | null>(null);
  const [bank, setBank] = useState("BCA");
  const [holder, setHolder] = useState(defaultHolder);
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    getPayoutAccount()
      .then((a) => {
        setAcc(a);
        if (a.bank) setBank(a.bank);
        if (a.holder) setHolder(a.holder);
      })
      .catch(() => setAcc({ bank: null, bankLabel: null, holder: null, numberLast4: null, isEwallet: false, isDummy: false, updatedAt: null }));
  }, []);

  const channels = acc?.channels?.length ? acc.channels : PAYOUT_CHANNELS;
  const ewallet = channels.find((c) => c.code === bank)?.ewallet;

  async function save(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await savePayoutAccount({ bank, holder: holder.trim(), number });
      setAcc({ ...r, channels: acc?.channels });
      setNumber("");
      toast(r.message || "Akun pencairan disimpan.");
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Akun pencairan gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="pf-heading">Akun Pencairan</h2>
      <form className="pf-form" onSubmit={save}>
        <small className="pf-hint">
          {acc?.bank
            ? `Dana escrow dikirim ke ${acc.bankLabel} ****${acc.numberLast4} a.n. ${acc.holder}.${acc.isDummy ? " (akun uji, belum rekening asli)" : ""}`
            : "Belum ada akun pencairan. Isi agar biaya logistik dan nilai gabah bisa dicairkan ke Anda."}
          {" "}Perubahan berlaku untuk pencairan berikutnya dan dikabarkan ke WhatsApp Anda.
        </small>
        <div className="pf-row pf-row-3">
          <label className="pf-field">
            <span>Bank / e-wallet</span>
            <select className="pf-input" value={bank} onChange={(e) => setBank(e.target.value)}>
              {channels.map((c) => (
                <option key={c.code} value={c.code}>{c.label}{c.ewallet ? " (e-wallet)" : ""}</option>
              ))}
            </select>
          </label>
          <label className="pf-field">
            <span>{ewallet ? "Nomor HP e-wallet" : "Nomor rekening"}</span>
            <input className="pf-input" required inputMode="numeric" minLength={6} maxLength={25} value={number}
              onChange={(e) => setNumber(e.target.value)} placeholder={acc?.numberLast4 ? `Saat ini ****${acc.numberLast4}` : "Hanya angka"} />
          </label>
          <label className="pf-field">
            <span>Nama pemilik</span>
            <input className="pf-input" required minLength={3} maxLength={80} value={holder} onChange={(e) => setHolder(e.target.value)} />
          </label>
        </div>
        {ewallet ? <small className="pf-hint">Saldo e-wallet umumnya dibatasi (sekitar Rp10 juta); untuk nilai gabah besar gunakan rekening bank.</small> : null}
        {err ? <div className="auth-error" role="alert">{err}</div> : null}
        <div>
          <button className="pf-btn" type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan akun pencairan"}</button>
        </div>
      </form>
    </>
  );
}
