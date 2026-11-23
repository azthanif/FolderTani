/* Sesi login disimpan di localStorage (token HMAC dari backend /api/auth/*). */
import { api } from "./api";

export type AccountRole = "petani" | "tengkulak" | "admin";

/** Wilayah layanan Temu Tani (sesuai database). */
export const REGIONS = ["Garut", "Cianjur"] as const;

export interface SessionUser {
  id: string;
  role: AccountRole;
  phone: string;
  name: string;
  region?: string; // kabupaten
  district?: string; // kecamatan
  village?: string; // desa/kelurahan (tengkulak)
  /** Petani mengizinkan nomor HP dibagikan ke pembeli setelah sepakat. */
  shareContact?: boolean;
}

export interface Session {
  token: string;
  user: SessionUser;
}

const KEY = "temutani.session";

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Session) : null;
    return s && s.token && s.user?.id ? s : null;
  } catch {
    return null;
  }
}

export function setSession(s: Session) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage diblokir: sesi hanya berlaku sampai halaman ditutup */
  }
}

export function clearSession() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* abaikan */
  }
}

/** Daftar mandiri hanya untuk tengkulak; akun petani dimasukkan admin. */
export interface RegisterPayload {
  name: string;
  phone: string;
  password: string;
  region: string;
  district: string;
  village: string;
}

export interface RegisterResult {
  status: "pending";
  message: string;
}

/** Akun baru berstatus menunggu verifikasi admin, jadi belum ada sesi yang disimpan. */
export function register(payload: RegisterPayload): Promise<RegisterResult> {
  return api<RegisterResult>("/auth/register", { method: "POST", body: { ...payload, role: "tengkulak" }, auth: false });
}

/** Aturan password baru (sama dengan backend). */
export const PASSWORD_RULES = [
  { label: "Minimal 8 karakter", test: (v: string) => v.length >= 8 },
  { label: "Minimal 1 huruf kecil", test: (v: string) => /[a-z]/.test(v) },
  { label: "Minimal 1 huruf besar", test: (v: string) => /[A-Z]/.test(v) },
  { label: "Minimal 1 angka", test: (v: string) => /\d/.test(v) },
] as const;

export const isStrongPassword = (v: string) => PASSWORD_RULES.every((r) => r.test(v));

export interface Desa {
  nama: string;
  jenis: "Desa" | "Kelurahan";
}
export interface Kecamatan {
  nama: string;
  desa: Desa[];
}
export interface Kabupaten {
  nama: string;
  kecamatan: Kecamatan[];
}

let wilayahCache: Promise<Kabupaten[]> | null = null;
/** Kabupaten -> kecamatan -> desa/kelurahan wilayah layanan (Kepmendagri), dimuat sekali per sesi. */
export function loadWilayah(): Promise<Kabupaten[]> {
  wilayahCache ??= api<{ kabupaten: Kabupaten[] }>("/wilayah", { auth: false })
    .then((r) => r.kabupaten)
    .catch((e) => {
      wilayahCache = null;
      throw e;
    });
  return wilayahCache;
}

export async function login(phone: string, password: string): Promise<Session> {
  const s = await api<Session>("/auth/login", { method: "POST", body: { phone, password }, auth: false });
  setSession(s);
  return s;
}

export const dashboardPath = (role: AccountRole) => "/" + role;

/** Simpan data pengguna terbaru (mis. setelah ubah profil) tanpa mengganti token. */
function saveUser(user: SessionUser, token?: string) {
  const cur = getSession();
  if (!cur && !token) return;
  setSession({ token: token || cur!.token, user });
}

export interface ProfilePayload {
  name: string;
  region?: string;
  district?: string;
  village?: string;
  shareContact?: boolean;
}

export async function updateProfile(payload: ProfilePayload): Promise<Session & { message: string }> {
  const r = await api<Session & { message: string }>("/auth/profile", { method: "PUT", body: payload });
  saveUser(r.user, r.token);
  return r;
}

export type OtpPurpose = "reset_password" | "change_password";

export interface OtpResponse {
  message: string;
  expiresIn: number;
  /** Hanya muncul di mode pengembangan (WAHA belum dikonfigurasi & TEMUTANI_OTP_DEV=1). */
  devCode?: string;
}

export function requestOtp(purpose: OtpPurpose, phone?: string): Promise<OtpResponse> {
  return api<OtpResponse>("/auth/otp", { method: "POST", body: { purpose, phone }, auth: purpose === "change_password" });
}

export async function resetPassword(phone: string, code: string, password: string): Promise<Session> {
  const s = await api<Session>("/auth/password/reset", { method: "POST", body: { phone, code, password }, auth: false });
  setSession({ token: s.token, user: s.user });
  return s;
}

export async function changePassword(currentPassword: string, password: string): Promise<Session & { message: string }> {
  const r = await api<Session & { message: string }>("/auth/password/change", { method: "POST", body: { currentPassword, password } });
  setSession({ token: r.token, user: r.user }); // token lama tidak berlaku lagi
  return r;
}
