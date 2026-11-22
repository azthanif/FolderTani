/* Sesi login disimpan di localStorage (token HMAC dari backend /api/auth/*). */
import { api } from "./api";

export type AccountRole = "petani" | "tengkulak";

export interface SessionUser {
  id: string;
  role: AccountRole;
  phone: string;
  name: string;
  region?: string; // kota/kabupaten (petani)
  district?: string; // kecamatan (petani)
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
  role: AccountRole;
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
