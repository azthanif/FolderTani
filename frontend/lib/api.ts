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

/* ---------------------------------------------------------------------------
   Indikator proses untuk SEMUA aksi yang menulis ke database (POST/PUT/DELETE).
   Tombol yang terakhir diklik diberi spinner + dinonaktifkan sampai respons datang, dan bilah
   progres tipis tampil di atas layar. Terpusat di sini agar setiap tombol (petani, tengkulak,
   admin, profil, auth) otomatis ikut tanpa perlu state loading di masing-masing komponen.
   --------------------------------------------------------------------------- */
const recentClicks: { el: HTMLButtonElement; at: number }[] = [];
let pending = 0;

if (typeof window !== "undefined") {
  const remember = (ev: Event) => {
    const t = ev.target as Element | null;
    const btn = t?.closest?.("button, input[type=submit]") as HTMLButtonElement | null;
    if (!btn) return;
    recentClicks.unshift({ el: btn, at: Date.now() });
    recentClicks.length = Math.min(recentClicks.length, 4);
  };
  // capture: tercatat sebelum handler React (yang bisa langsung menutup dialog/modal).
  window.addEventListener("click", remember, true);
  window.addEventListener("submit", (ev) => {
    const sub = (ev as SubmitEvent).submitter as HTMLButtonElement | null;
    const form = ev.target as HTMLFormElement;
    const btn = sub || (form.querySelector("button[type=submit], button:not([type])") as HTMLButtonElement | null);
    if (btn) recentClicks.unshift({ el: btn, at: Date.now() });
    recentClicks.length = Math.min(recentClicks.length, 4);
  }, true);
}

/** Tombol pemicu: klik terbaru (≤60 dtk) yang masih ada di halaman. Tombol "Ya" di dialog konfirmasi sudah hilang,
 *  jadi otomatis jatuh ke tombol yang membuka konfirmasi (mis. "Terima Harga" di modal detail). */
function triggerButton(): HTMLButtonElement | null {
  const now = Date.now();
  for (const c of recentClicks) {
    if (now - c.at > 60_000) break;
    if (c.el.isConnected && !c.el.disabled) return c.el;
  }
  return null;
}

function beginBusy(): () => void {
  if (typeof document === "undefined") return () => undefined;
  pending++;
  document.documentElement.classList.add("api-busy");
  const btn = triggerButton();
  if (btn) {
    btn.classList.add("is-loading");
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
  }
  return () => {
    pending = Math.max(0, pending - 1);
    if (!pending) document.documentElement.classList.remove("api-busy");
    if (btn) {
      btn.classList.remove("is-loading");
      btn.removeAttribute("aria-busy");
      // Hanya buka kembali bila masih tombol yang kita nonaktifkan (React tidak mengubahnya selama request).
      if (btn.isConnected && btn.disabled) btn.disabled = false;
    }
  };
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  if ((opts.method || "GET") === "GET") return request<T>(path, opts);
  const done = beginBusy();
  try {
    return await request<T>(path, opts);
  } finally {
    done();
  }
}

async function request<T>(path: string, { method = "GET", body, auth = true }: ApiOptions): Promise<T> {
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

/** Unduh file dari API (mis. ekspor Excel/CSV) dengan token sesi, lalu simpan lewat browser. */
export async function downloadFile(path: string, fallbackName: string): Promise<string> {
  const token = sessionToken();
  let res: Response;
  try {
    res = await fetch(API_BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
  } catch {
    throw new ApiError("Server Temu Tani tidak dapat dihubungi. Pastikan FastAPI sedang berjalan.", 0);
  }
  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = ((await res.json()) as { detail?: unknown }).detail;
    } catch {
      /* bukan JSON */
    }
    throw new ApiError(typeof detail === "string" ? detail : `Unduhan gagal (HTTP ${res.status}).`, res.status);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
