"use client";
/* Konteks data admin: GET /api/admin/dashboard + GET /api/prices (role admin). */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { clearSession, getSession, type Session } from "@/lib/auth";
import { loadPrices } from "@/lib/prices";
import type { AdminDashboardResponse, AdminData } from "./types";

interface AdminContextValue extends AdminData {
  session: Session | null;
  logout: () => void;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  /** Kata kunci pencarian halaman tabel (dibagi dengan pencarian global di topbar). */
  query: string;
  setQuery: (q: string) => void;
  /** Kata kunci yang dipakai setelah navigasi berikutnya (pencarian global dari halaman non-tabel). */
  queueQuery: (q: string) => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin harus dipakai di dalam <AdminDataProvider>");
  return ctx;
}

const EMPTY: AdminData = { stocks: [], offers: [], transactions: [], events: [], prices: null };

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AdminData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [query, setQuery] = useState("");
  const pending = useRef<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  // Hanya akun admin yang boleh membuka dashboard admin.
  useEffect(() => {
    const s = getSession();
    if (!s) router.replace("/masuk");
    else if (s.user.role !== "admin") router.replace("/" + s.user.role);
    else setSession(s);
  }, [router]);

  const logout = useCallback(() => {
    clearSession();
    router.replace("/masuk");
  }, [router]);

  const refresh = useCallback(async () => {
    try {
      const [d, prices] = await Promise.all([api<AdminDashboardResponse>("/admin/dashboard"), loadPrices("admin")]);
      setData({ ...d, prices });
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) logout();
      throw e;
    }
  }, [logout]);

  useEffect(() => {
    if (!session) return;
    refresh()
      .catch((e: Error) => setError(e))
      .finally(() => setLoading(false));
  }, [refresh, session]);

  useEffect(() => {
    const onProfile = () => setSession(getSession());
    window.addEventListener("temutani:profile", onProfile);
    return () => window.removeEventListener("temutani:profile", onProfile);
  }, []);

  // Pindah halaman = filter kembali ke awal (seperti go() di versi HTML).
  useEffect(() => {
    setQuery(pending.current ?? "");
    pending.current = null;
  }, [pathname]);

  const queueQuery = useCallback((q: string) => {
    pending.current = q;
  }, []);

  return (
    <AdminContext.Provider value={{ ...data, loading, error, refresh, query, setQuery, queueQuery, session, logout }}>{children}</AdminContext.Provider>
  );
}
