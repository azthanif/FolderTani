"use client";
/* Kelola Akun: petani (dari database/chatbot) + tengkulak daftar mandiri. Admin menyetujui/menolak tengkulak baru. */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ApiErrorCard } from "@/components/DashboardShell";
import { Icon } from "@/components/Icon";
import { useUI } from "@/components/UIProvider";
import { AddressFields, type Address } from "@/components/auth/AddressFields";
import { PasswordField } from "@/components/auth/AuthShell";
import { ConfirmHint, PasswordRules } from "@/components/auth/PasswordRules";
import { api, ApiError, downloadFile } from "@/lib/api";
import { isStrongPassword } from "@/lib/auth";
import { useAdmin } from "./AdminData";
import "@/styles/auth.css";
import { Badge, Heading, Kpi, Person } from "./ui";

type Status = "pending" | "approved" | "rejected";
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
  registeredVia: "seed" | "web" | "admin";
  hasPassword: boolean;
  createdAt: string | null;
  verifiedAt: string | null;
  verifiedBy: string;
}
interface AccountsResponse {
  items: Account[];
  counts: { pending: number; petani: number; tengkulak: number; total: number };
}

const STATUS_LABEL: Record<Status, string> = { pending: "Menunggu Verifikasi", approved: "Aktif", rejected: "Ditolak" };
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
  const { refresh: refreshDashboard, session } = useAdmin();
  const { toast, openModal, closeModal } = useUI();
  const [data, setData] = useState<AccountsResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [tab, setTab] = useState<Tab>("pending");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const onDown = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [exportOpen]);

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

  async function remove(a: Account) {
    setBusyId(a.id);
    try {
      const r = await api<{ message: string }>(`/admin/users/${a.id}`, { method: "DELETE" });
      toast(r.message);
      closeModal();
      await Promise.all([load(), refreshDashboard().catch(() => undefined)]);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Akun gagal dihapus. Coba lagi.");
    } finally {
      setBusyId("");
    }
  }

  function askDelete(a: Account) {
    openModal("Hapus akun", `${a.name} · ${ROLE_LABEL[a.role]}`, <DeleteConfirm account={a} onConfirm={() => remove(a)} />);
  }

  const canDelete = (a: Account) => a.role !== "admin" && a.id !== session?.user.id;

  async function exportFile(format: "xlsx" | "csv") {
    setExportOpen(false);
    setExporting(true);
    const params = new URLSearchParams({ format });
    if (tab === "pending") params.set("status", "pending");
    else if (tab !== "all") params.set("role", tab);
    if (query.trim()) params.set("q", query.trim());
    try {
      const name = await downloadFile(`/admin/users/export?${params}`, `temutani-akun.${format}`);
      toast(`File ${name} berhasil diunduh.`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Ekspor gagal. Coba lagi.");
    } finally {
      setExporting(false);
    }
  }

  function askAddFarmer() {
    openModal(
      "Tambah Petani",
      "Akun petani langsung aktif dan terhubung dengan chatbot WhatsApp.",
      <AddFarmerForm
        onDone={async (message) => {
          toast(message);
          closeModal();
          setTab("petani");
          await Promise.all([load(), refreshDashboard().catch(() => undefined)]);
        }}
      />,
    );
  }

  function askReject(a: Account) {
    openModal("Tolak pendaftaran", a.name, <RejectForm onSubmit={(reason) => verify(a, "reject", reason)} />);
  }

  function showDetail(a: Account) {
    openModal(
      a.name,
      `${ROLE_LABEL[a.role]} · ${STATUS_LABEL[a.status]}`,
      <>
        <dl className="account-detail">
          <dt>Nomor HP</dt>
          <dd>{a.phone}</dd>
          <dt>Alamat</dt>
          <dd>{address(a)}</dd>
          <dt>Terdaftar</dt>
          <dd>
            {fmtDate(a.createdAt)} · {a.registeredVia === "web" ? "daftar mandiri via web" : a.registeredVia === "admin" ? "dibuat admin" : "data awal / chatbot"}
          </dd>
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
        </dl>
        {canDelete(a) ? (
          <div className="detail-danger">
            <button type="button" className="btn danger" disabled={busyId === a.id} onClick={() => askDelete(a)}>
              <Icon name="trash" size={14} /> Hapus akun
            </button>
          </div>
        ) : null}
      </>,
    );
  }

  if (error) return <ApiErrorCard error={error} what="daftar akun" />;
  if (!data) return <div className="empty-state">Memuat daftar akun…</div>;
  const c = data.counts;

  return (
    <>
      <Heading
        title="Kelola Akun"
        sub="Verifikasi tengkulak yang mendaftar mandiri, tambahkan petani, dan pantau seluruh akun."
        actions={
          <>
            <div className="export-menu" ref={exportRef}>
              <button type="button" className="btn" aria-haspopup="menu" aria-expanded={exportOpen} disabled={exporting} onClick={() => setExportOpen((v) => !v)}>
                <Icon name="download" size={15} /> {exporting ? "Menyiapkan…" : "Ekspor"}
              </button>
              {exportOpen ? (
                <div className="export-dropdown" role="menu">
                  <small>Sesuai tab &amp; pencarian saat ini ({rows.length} akun)</small>
                  <button type="button" role="menuitem" onClick={() => exportFile("xlsx")}>
                    <Icon name="document" size={15} /> Excel (.xlsx)
                  </button>
                  <button type="button" role="menuitem" onClick={() => exportFile("csv")}>
                    <Icon name="document" size={15} /> CSV (.csv)
                  </button>
                </div>
              ) : null}
            </div>
            <button type="button" className="btn primary" onClick={askAddFarmer}>
              <Icon name="plus" size={15} /> Tambah Petani
            </button>
          </>
        }
      />
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
                        {a.role === "tengkulak" && a.status !== "approved" ? (
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

function AddFarmerForm({ onDone }: { onDone: (message: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState<Address>({ region: "", district: "", village: "" });
  const [withPassword, setWithPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (withPassword) {
      if (!isStrongPassword(password)) return setError("Password awal belum memenuhi semua persyaratan.");
      if (password !== confirm) return setError("Konfirmasi password tidak sama.");
    }
    setBusy(true);
    try {
      const r = await api<{ message: string }>("/admin/users", {
        method: "POST",
        body: { name: name.trim(), phone, ...address, password: withPassword ? password : null },
      });
      await onDone(r.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Akun petani gagal ditambahkan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={submit}>
      <div className="admin-form-grid">
        <div className="admin-field span-2">
          <label htmlFor="af-name">Nama lengkap petani</label>
          <input id="af-name" required minLength={3} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Pak Dadang Suhendar" />
        </div>
        <div className="admin-field span-2">
          <label htmlFor="af-phone">Nomor HP (WhatsApp)</label>
          <input id="af-phone" type="tel" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Contoh: 081234567890" />
          <small>Dipakai petani untuk masuk web dan chatbot WhatsApp.</small>
        </div>
        <AddressFields value={address} onChange={setAddress} fieldClass="admin-field" idPrefix="af" />
      </div>

      <label className="admin-check">
        <input type="checkbox" checked={withPassword} onChange={(e) => setWithPassword(e.target.checked)} />
        <span>Buatkan password awal untuk login web</span>
      </label>
      {withPassword ? (
        <div className="admin-form-grid">
          <div className="admin-field span-2">
            <label htmlFor="af-pw">Password awal</label>
            <PasswordField id="af-pw" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />
          </div>
          <div className="span-2">
            <PasswordRules value={password} />
          </div>
          <div className="admin-field span-2">
            <label htmlFor="af-pw2">Ulangi password awal</label>
            <PasswordField id="af-pw2" value={confirm} onChange={setConfirm} autoComplete="new-password" minLength={8} />
            <ConfirmHint password={password} confirm={confirm} />
          </div>
        </div>
      ) : (
        <p className="admin-note">Tanpa password awal, petani membuat password sendiri lewat menu Lupa Password (kode via WhatsApp) atau langsung memakai chatbot.</p>
      )}

      {error ? <div className="admin-error" role="alert">{error}</div> : null}
      <button type="submit" className="btn primary" disabled={busy}>
        <Icon name="plus" size={15} /> {busy ? "Menyimpan…" : "Tambah Petani"}
      </button>
    </form>
  );
}

function DeleteConfirm({ account, onConfirm }: { account: Account; onConfirm: () => Promise<void> }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = typed.trim().toUpperCase() === "HAPUS";
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    await onConfirm();
    setBusy(false);
  }
  return (
    <form className="reject-form" onSubmit={submit}>
      <div className="delete-warning">
        <strong>Akun dihapus permanen dan tidak bisa dikembalikan.</strong>
        <ul>
          <li>
            {account.name} ({account.phone}) tidak bisa masuk lagi
            {account.role === "tengkulak" ? " dan harus mendaftar ulang bila ingin memakai Temu Tani." : "."}
          </li>
          {account.role === "petani" ? <li>Data stok gabah dan riwayat stok petani ini ikut terhapus.</li> : null}
          {account.role === "petani" ? <li>Bila petani mengirim pesan lagi ke chatbot WhatsApp, akunnya bisa terdaftar ulang.</li> : null}
          <li>Akun yang sudah punya riwayat penawaran/kesepakatan akan ditolak sistem agar riwayat transaksi tetap utuh.</li>
        </ul>
      </div>
      <label htmlFor="delete-confirm">
        Ketik <b>HAPUS</b> untuk mengonfirmasi
      </label>
      <input id="delete-confirm" className="delete-input" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="HAPUS" />
      <button type="submit" className="btn danger" disabled={busy || !ok}>
        <Icon name="trash" size={14} /> {busy ? "Menghapus…" : "Hapus akun permanen"}
      </button>
    </form>
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
