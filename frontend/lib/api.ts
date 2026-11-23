/* Klien API FastAPI. Semua peran (petani, tengkulak, admin) memakai token login (Authorization: Bearer). */
export type Role = "admin" | "petani" | "tengkulak";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "") + "/api";

export interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Tidak lagi dipakai server (identitas diambil dari token); dibiarkan agar pemanggil lama tetap kompatibel. */
  role?: Role;
  /** Kirim token sesi bila ada (default true). Set false untuk endpoint login/daftar. */
  auth?: boolean;
}

/** Token sesi dibaca langsung dari localStorage (lihat lib/auth.ts) agar tidak terjadi impor melingkar. */
function sessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("temutani.session");
    return raw ? (JSON.parse(raw) as { token?: string }).token || null : null;
  } catch {
    return null;
  }
}

export async function api<T = unknown>(path: string, { method = "GET", body, auth = true }: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = auth ? sessionToken() : null;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Server Temu Tani tidak dapat dihubungi. Pastikan FastAPI sedang berjalan.", 0);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* respons tanpa JSON */
  }
  if (!res.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail;
    throw new ApiError(typeof detail === "string" ? detail : `Permintaan gagal (HTTP ${res.status}).`, res.status);
  }
  return data as T;
}
