/* Sesi login disimpan di localStorage (token HMAC dari backend /api/auth/*). */
import { api } from "./api";

export type AccountRole = "petani" | "tengkulak" | "admin";
export type SignupRole = "petani" | "tengkulak";

/** Wilayah layanan Temu Tani (sesuai database). */
export const REGIONS = ["Garut", "Cianjur"] as const;

export interface SessionUser {
  id: string;
  role: AccountRole;
  phone: string;
  name: string;
  region?: string; // kabupaten (petani)
  district?: string; // kecamatan (petani)
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

export interface RegisterPayload {
  role: SignupRole;
  name: string;
  phone: string;
  password: string;
  region?: string;
  district?: string;
}

export async function register(payload: RegisterPayload): Promise<Session> {
  const s = await api<Session>("/auth/register", { method: "POST", body: payload, auth: false });
  setSession(s);
  return s;
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

export async function changePassword(code: string, password: string): Promise<Session & { message: string }> {
  const r = await api<Session & { message: string }>("/auth/password/change", { method: "POST", body: { code, password } });
  setSession({ token: r.token, user: r.user }); // token lama tidak berlaku lagi
  return r;
}
