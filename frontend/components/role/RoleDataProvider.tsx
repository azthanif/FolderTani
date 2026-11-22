"use client";
/* Data & aksi dashboard petani/tengkulak (port initRoleDashboard: load, mutate, sinkronisasi polling). */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useUI } from "@/components/UIProvider";
import type { MutationResult, RoleKind, RoleState } from "./types";

export const CURRENT_FARMER = "F-001";
export const CURRENT_BUYER = "GUEST-001";

export interface UiFilters {
  query: string;
  area: string;
  type: string;
  status: string;
  requested: string;
}

export interface MutateOptions {
  method?: "POST" | "PUT" | "DELETE";
  body?: unknown;
  before?: (res: MutationResult) => void;
  success?: string;
  /** Kembalikan true bila error sudah ditampilkan sendiri (mis. alert). */
  onError?: (e: ApiError) => boolean;
}

interface RoleContextValue {
  role: RoleKind;
  isFarmer: boolean;
  base: string;
  db: RoleState | null;
  error: Error | null;
  getDb: () => RoleState | null;
  mutate: (path: string, opts?: MutateOptions) => Promise<MutationResult | null>;
  ui: UiFilters;
  setUi: (patch: Partial<UiFilters>) => void;
  navigate: (page: string) => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole harus dipakai di dalam <RoleDataProvider>");
  return ctx;
}

export function RoleDataProvider({ role, children }: { role: RoleKind; children: ReactNode }) {
  const isFarmer = role === "petani";
  const base = "/" + role;
  const actor = useMemo(() => ({ role, user: isFarmer ? CURRENT_FARMER : CURRENT_BUYER }), [role, isFarmer]);
  const { closeModal, toast } = useUI();
  const router = useRouter();
  const pathname = usePathname();

  const [db, setDbState] = useState<RoleState | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const dbRef = useRef<RoleState | null>(null);
  const busy = useRef(false);
  const mutationSeq = useRef(0); // naik setiap aksi; agar hasil polling lama tidak menimpa data baru
  const [ui, setUiState] = useState<UiFilters>({
    query: "",
    area: isFarmer ? "Garut" : "Semua Wilayah",
    type: "Semua Jenis",
    status: "Semua Status",
    requested: "",
  });

  const setDb = useCallback((next: RoleState) => {
    dbRef.current = next;
    setDbState(next);
  }, []);
  const getDb = useCallback(() => dbRef.current, []);
  const setUi = useCallback((patch: Partial<UiFilters>) => setUiState((u) => ({ ...u, ...patch })), []);

  const load = useCallback(async () => {
    setDb(await api<RoleState>("/state", actor));
  }, [actor, setDb]);

  // Pindah halaman: pencarian & filter status dikosongkan (seperti actions('navigate')).
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setUiState((u) => ({ ...u, query: "", status: "Semua Status", area: isFarmer ? "Garut" : u.area }));
  }, [pathname, isFarmer]);

  const navigate = useCallback(
    (page: string) => {
      closeModal();
      router.push(page === "overview" ? base : `${base}/${page}`);
    },
    [base, closeModal, router],
  );

  const mutate = useCallback(
    async (path: string, { method = "POST", body, before, success, onError }: MutateOptions = {}) => {
      if (busy.current) return null;
      busy.current = true;
      mutationSeq.current++;
      try {
        const res = await api<MutationResult>(path, { ...actor, method, body });
        setDb(res.state);
        if (before) before(res);
        closeModal();
        toast(success || res.message);
        return res;
      } catch (err) {
        const e = err instanceof ApiError ? err : new ApiError(String(err), 0);
        if (!(onError && onError(e))) toast(e.message);
        if (e.status === 404 || e.status === 409) {
          try {
            await load();
          } catch {
            /* abaikan */
          }
        }
        return null;
      } finally {
        busy.current = false;
      }
    },
    [actor, closeModal, load, setDb, toast],
  );

  // Muat awal.
  useEffect(() => {
    load().catch((e: Error) => setError(e));
  }, [load]);

  // Sinkronisasi: cek versi data di server; ambil ulang hanya bila berubah.
  useEffect(() => {
    let alive = true;
    async function syncFromServer() {
      if (busy.current || document.hidden || !dbRef.current) return;
      const seq = mutationSeq.current;
      try {
        const v = await api<{ version: number }>("/state/version");
        if (dbRef.current && v.version === dbRef.current.version) return;
        const fresh = await api<RoleState>("/state", actor);
        // Abaikan bila ada aksi pengguna selama permintaan berlangsung, atau data sudah lebih baru.
        if (!alive || busy.current || seq !== mutationSeq.current || (dbRef.current && fresh.version <= dbRef.current.version)) return;
        setDb(fresh);
      } catch {
        /* server sementara tidak terjangkau: coba lagi nanti */
      }
    }
    const timer = setInterval(syncFromServer, 4000);
    const onVis = () => {
      if (!document.hidden) syncFromServer();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", syncFromServer);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", syncFromServer);
    };
  }, [actor, setDb]);

  const value: RoleContextValue = { role, isFarmer, base, db, error, getDb, mutate, ui, setUi, navigate };
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}
