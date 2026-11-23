"use client";
/* Kelola Akun: petani (dari database/chatbot) + tengkulak daftar mandiri. Admin menyetujui/menolak tengkulak baru. */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiErrorCard } from "@/components/DashboardShell";
import { Icon } from "@/components/Icon";
import { useUI } from "@/components/UIProvider";
import { api, ApiError } from "@/lib/api";
import { useAdmin } from "./AdminData";
import { Badge, Heading, Kpi, Person } from "./ui";

type Status = "pending" | "active" | "rejected";
interface Account {
  id: string;
  name: string;
  phone: string;
  role: "petani" | "tengkulak" | "admin";
  region: string;
  district: string;
  village: string;
  status: Status;
  rejectionReason: string;
  hasPassword: boolean;
  createdAt: string | null;
  verifiedAt: string | null;
  verifiedBy: string;
}
interface AccountsResponse {
  items: Account[];
  counts: { pending: number; petani: number; tengkulak: number; total: number };
}

const STATUS_LABEL: Record<Status, string> = { pending: "Menunggu Verifikasi", active: "Aktif", rejected: "Ditolak" };
const ROLE_LABEL = { petani: "Petani", tengkulak: "Tengkulak", admin: "Admin" } as const;
const TABS = [
  { key: "pending", label: "Menunggu Verifikasi" },
  { key: "tengkulak", label: "Tengkulak" },
  { key: "petani", label: "Petani" },
  { key: "all", label: "Semua Akun" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }) : "-";
const address = (a: Account) => [a.village, a.district, a.region].filter(Boolean).join(", ") || "-";

export function AdminAccounts() {
  const { refresh: refreshDashboard } = useAdmin();
  const { toast, openModal, closeModal } = useUI();
  const [data, setData] = useState<AccountsResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [tab, setTab] = useState<Tab>("pending");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api<AccountsResponse>("/admin/users"));
      setError(null);
    } catch (e) {
      setError(e as Error);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Buka tab "Semua" bila tidak ada yang menunggu, agar halaman tidak tampak kosong.
  useEffect(() => {
    if (data && data.counts.pending === 0) setTab((t) => (t === "pending" ? "all" : t));
  }, [data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.items || []).filter((a) => {
      const inTab = tab === "all" || (tab === "pending" ? a.status === "pending" : a.role === tab);
      const inQuery = !q || [a.name, a.phone, a.region, a.district, a.village].join(" ").toLowerCase().includes(q);
      return inTab && inQuery;
    });
  }, [data, tab, query]);

  async function verify(a: Account, action: "approve" | "reject", reason?: string) {
    setBusyId(a.id);
    try {
      const r = await api<{ message: string }>(`/admin/users/${a.id}/verify`, { method: "POST", body: { action, reason } });
      toast(r.message);
      closeModal();
      await Promise.all([load(), refreshDashboard().catch(() => undefined)]);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Aksi gagal. Coba lagi.");
    } finally {
      setBusyId("");
    }
  }

  function askReject(a: Account) {
    openModal("Tolak pendaftaran", a.name, <RejectForm onSubmit={(reason) => verify(a, "reject", reason)} />);
  }

  function showDetail(a: Account) {
    openModal(
      a.name,
      `${ROLE_LABEL[a.role]} · ${STATUS_LABEL[a.status]}`,
      <dl className="account-detail">
        <dt>Nomor HP</dt>
        <dd>{a.phone}</dd>
        <dt>Alamat</dt>
        <dd>{address(a)}</dd>
        <dt>Terdaftar</dt>
        <dd>{fmtDate(a.createdAt)}</dd>
        <dt>Login web</dt>
        <dd>{a.hasPassword ? "Sudah punya password" : "Belum (terdaftar via WhatsApp)"}</dd>
        {a.verifiedAt ? (
          <>
            <dt>{a.status === "rejected" ? "Ditolak" : "Diverifikasi"}</dt>
            <dd>
              {fmtDate(a.verifiedAt)}
              {a.verifiedBy ? ` oleh ${a.verifiedBy}` : ""}
            </dd>
          </>
        ) : null}
        {a.rejectionReason ? (
          <>
            <dt>Alasan penolakan</dt>
            <dd>{a.rejectionReason}</dd>
          </>
        ) : null}
      </dl>,
    );
  }

  if (error) return <ApiErrorCard error={error} what="daftar akun" />;
  if (!data) return <div className="empty-state">Memuat daftar akun…</div>;
  const c = data.counts;

  return (
    <>
      <Heading title="Kelola Akun" sub="Verifikasi tengkulak yang mendaftar mandiri dan pantau akun petani dari database." />
      <div className="account-kpis">
        <Kpi icon="clock" title="MENUNGGU VERIFIKASI" value={c.pending} foot="Tengkulak baru daftar" theme={c.pending ? "gold" : "green"} />
        <Kpi icon="users" title="TENGKULAK" value={c.tengkulak} foot="Daftar mandiri via web" theme="blue" />
        <Kpi icon="sprout" title="PETANI" value={c.petani} foot="Dari database & chatbot WhatsApp" />
      </div>

      <div className="toolbar">
        <div className="account-tabs" role="tablist" aria-label="Filter akun">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`account-tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>
              {t.label}
              {t.key === "pending" && c.pending ? <span className="account-tab-count">{c.pending}</span> : null}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Icon name="search" size={16} />
          <input placeholder="Cari nama, nomor HP, atau wilayah..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <section className="card table-card wide">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>NAMA</th>
                <th>NOMOR HP</th>
                <th>ALAMAT</th>
                <th>TERDAFTAR</th>
                <th>STATUS</th>
                <th>AKSI</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Person name={a.name} subtitle={ROLE_LABEL[a.role]} />
                    </td>
                    <td>{a.phone}</td>
                    <td>{address(a)}</td>
                    <td>{fmtDate(a.createdAt)}</td>
                    <td>
                      <Badge status={STATUS_LABEL[a.status]} />
                    </td>
                    <td>
                      <div className="account-actions">
                        {a.role === "tengkulak" && a.status !== "active" ? (
                          <button type="button" className="btn primary sm" disabled={busyId === a.id} onClick={() => verify(a, "approve")}>
                            <Icon name="check" size={14} /> Setujui
                          </button>
                        ) : null}
                        {a.role === "tengkulak" && a.status === "pending" ? (
                          <button type="button" className="btn danger sm" disabled={busyId === a.id} onClick={() => askReject(a)}>
                            <Icon name="close" size={14} /> Tolak
                          </button>
                        ) : null}
                        <button type="button" className="link-btn" onClick={() => showDetail(a)}>
                          Detail
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="empty-state">
                    {tab === "pending" ? "Tidak ada pendaftaran yang menunggu verifikasi." : "Tidak ditemukan akun yang sesuai."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="rows-footer">
          <span>
            Menampilkan {rows.length} dari {data.items.length} akun
          </span>
        </div>
      </section>
    </>
  );
}

function RejectForm({ onSubmit }: { onSubmit: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await onSubmit(reason.trim());
    setBusy(false);
  }
  return (
    <form className="reject-form" onSubmit={submit}>
      <label htmlFor="reject-reason">Alasan penolakan (dikirim ke pendaftar lewat WhatsApp)</label>
      <textarea
        id="reject-reason"
        required
        minLength={5}
        maxLength={300}
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Contoh: Nama usaha tidak dapat diverifikasi. Silakan daftar ulang dengan nama usaha yang terdaftar."
      />
      <button type="submit" className="btn danger" disabled={busy || reason.trim().length < 5}>
        {busy ? "Memproses…" : "Tolak pendaftaran"}
      </button>
    </form>
  );
}
