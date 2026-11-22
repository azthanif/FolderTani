/* Klien API FastAPI. Identitas demo dikirim lewat header (SIMULASI, bukan autentikasi). */
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
  role?: Role;
  user?: string;
}

export async function api<T = unknown>(path: string, { method = "GET", body, role, user }: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (role) headers["X-Demo-Role"] = role;
  if (user) headers["X-Demo-User"] = user;
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
