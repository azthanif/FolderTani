"use client";
/* Detail transaksi escrow + aksi sesuai peran (petani, tengkulak, admin). Dirender di dalam modal UIProvider.
   Status selalu dari server (aksi_tersedia dihitung backend) dan diperbarui tiap 10 detik selama modal terbuka,
   sehingga konfirmasi dari WhatsApp langsung terlihat di web. */
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { api, ApiError } from "@/lib/api";
import { showConfirm } from "@/lib/dialog";
import { formatRupiah } from "@/lib/format";
import { ESCROW_STEPS, ESCROW_TONE, KANAL_LABEL, PELAKU_LABEL, type Escrow, type EscrowAction } from "@/lib/escrow";
import { PengambilanPicker, RincianTagihan } from "./DeliveryPanel";

const POLL_MS = 10_000;
const num = (n: number) => Number(n || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });
const when = (v?: string | null) =>
  v ? new Date(v).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "—";

export function EscrowPill({ status, label }: { status?: string | null; label?: string | null }) {
  if (!status) return <span className="pill gray">Belum ada escrow</span>;
  return <span className={`pill ${ESCROW_TONE[status as keyof typeof ESCROW_TONE] || "gray"}`}>{label || status}</span>;
}

type Role = "petani" | "tengkulak" | "admin";

const CONFIRM: Partial<Record<EscrowAction, { title: string; message: string; label: string; tone?: "warning" | "danger" | "info" }>> = {
  "konfirmasi-kirim": {
    title: "Konfirmasi gabah sudah dikirim?",
    message: "Tengkulak akan diminta mengonfirmasi penerimaan. Langkah ini tidak bisa dibatalkan.",
    label: "Ya, sudah dikirim", tone: "warning",
  },
  "konfirmasi-terima": {
    title: "Konfirmasi gabah sudah diterima?",
    message: "Dana escrow akan langsung dicairkan ke petani. Pastikan berat dan mutu gabah sudah Anda cek. Langkah ini tidak bisa dibatalkan.",
    label: "Ya, sudah diterima", tone: "warning",
  },
  "cairkan-ulang": { title: "Coba cairkan ulang?", message: "Pencairan baru akan dibuat ke akun pencairan petani.", label: "Cairkan ulang" },
  "cairkan-ulang-logistik": {
    title: "Coba cairkan ulang biaya logistik?", message: "Pencairan termin 1 (biaya logistik) baru akan dibuat ke akun pencairan petani.",
    label: "Cairkan ulang logistik",
  },
  "selesaikan-sengketa": {
    title: "Teruskan dana ke petani?",
    message: "Gunakan setelah laporan tengkulak selesai ditinjau dan diputuskan dana tetap dibayarkan. Refund tidak diproses otomatis.",
    label: "Ya, cairkan ke petani", tone: "warning",
  },
};

export function EscrowDetail({ id, role, onChanged, onToast }: { id: string; role: Role; onChanged?: () => void; onToast: (m: string) => void }) {
  const [e, setE] = useState<Escrow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string | null>(null); // isi form lapor masalah (null = tertutup)
  const last = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<Escrow>(`/escrow/${encodeURIComponent(id)}`);
      setE(d);
      setErr(null);
      if (last.current && last.current !== d.status) onChanged?.();
      last.current = d.status;
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : String(x));
    }
  }, [id, onChanged]);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (!document.hidden) load();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  async function run(a: EscrowAction, body?: unknown) {
    if (a === "bayar") {
      if (e?.invoice_url) window.open(e.invoice_url, "_blank", "noopener,noreferrer");
      return;
    }
    const c = CONFIRM[a];
    if (c && !(await showConfirm({ title: c.title, message: c.message, confirmLabel: c.label, tone: c.tone || "info" }))) return;
    setBusy(true);
    try {
      const d = await api<Escrow>(`/escrow/${encodeURIComponent(id)}/${a}`, { method: "POST", body });
      setE(d);
      last.current = d.status;
      setReport(null);
      onToast(d.message || "Status transaksi diperbarui.");
      onChanged?.();
    } catch (x) {
      onToast(x instanceof ApiError ? x.message : String(x));
      load();
    } finally {
      setBusy(false);
    }
  }

  if (err && !e) return <div className="notice-card">{err}</div>;
  if (!e) return <div className="notice-card">Memuat status escrow…</div>;

  const exception = !ESCROW_STEPS.some((s) => s.status === e.status);
  // Status pengecualian: tampilkan langkah normal terakhir yang sempat dicapai sebagai selesai.
  const reached = Math.max(0, ...(e.riwayat || []).map((r) => ESCROW_STEPS.findIndex((s) => s.status === r.ke_status)));
  const stepIdx = exception ? reached + 1 : e.status === "SELESAI" ? ESCROW_STEPS.length : ESCROW_STEPS.findIndex((s) => s.status === e.status);
  const contactWa = e.kontak ? "https://wa.me/62" + e.kontak.replace(/^0/, "") : null;
  const other = role === "petani" ? "tengkulak" : "petani";

  return (
    <div className="escrow-detail">
      <div className="metric-row">
        {role === "petani" ? (
          <div className="metric-small"><small>Nilai gabah</small><strong>{formatRupiah(e.nilai)}</strong></div>
        ) : (
          <div className="metric-small">
            <small>{e.dikunci ? "Total tagihan" : "Nilai gabah (tagihan belum final)"}</small>
            <strong>{formatRupiah(e.total_tagihan ?? e.nilai)}</strong>
          </div>
        )}
        <div className="metric-small"><small>Harga</small><strong>{formatRupiah(e.harga_per_kg)}/kg</strong></div>
        <div className="metric-small"><small>Berat sepakat</small><strong>{num(e.berat_kg)} kg</strong></div>
      </div>

      <div className="escrow-steps" aria-label="Progres escrow">
        {ESCROW_STEPS.map((s, i) => (
          <div key={s.status} className={`escrow-step${i < stepIdx ? " done" : ""}${!exception && i === stepIdx ? " current" : ""}`}>
            <span className="dot">{i < stepIdx ? <Icon name="check" size={11} /> : i + 1}</span>
            <small>{s.label}</small>
          </div>
        ))}
      </div>
      {exception ? (
        <div className={`notice-card escrow-exception ${ESCROW_TONE[e.status]}`}>
          <strong>{e.statusLabel}.</strong>{" "}
          {e.status === "KEDALUWARSA" && "Tagihan tidak dibayar sampai batas waktu. Kesepakatan ini tidak dilanjutkan."}
          {e.status === "SENGKETA" && <>Tengkulak melaporkan masalah; dana tetap ditahan sampai admin selesai meninjau.{e.catatan_masalah ? <><br />Catatan: <em>{e.catatan_masalah}</em></> : null}</>}
          {e.status === "PENCAIRAN_GAGAL" && <>Pencairan ke petani tertunda{e.pencairan_gagal_kode && role === "admin" ? ` (${e.pencairan_gagal_kode})` : ""}. Admin akan mencoba ulang; dana tetap aman.</>}
        </div>
      ) : null}

      {e.aksi_tersedia.includes("pilih-diantar") ? (
        <PengambilanPicker e={e} onToast={onToast} onLocked={(d) => { setE(d); last.current = d.status; onChanged?.(); }} />
      ) : null}

      {/* Aksi ditaruh di atas agar langsung terlihat tanpa scroll */}
      <div className="escrow-actions">
      {report !== null ? (
          <form
            className="escrow-report"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (report.trim().length < 3) return onToast("Tuliskan masalahnya minimal 3 karakter.");
              run("lapor-masalah", { catatan: report });
            }}
          >
            <div className="field">
              <label htmlFor="escrowIssue">Apa masalahnya?</label>
              <textarea id="escrowIssue" rows={3} maxLength={500} value={report} onChange={(x) => setReport(x.target.value)}
                placeholder="Contoh: berat kurang 300 kg dari kesepakatan" required />
            </div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setReport(null)}>Batal</button>
              <button type="submit" className="btn danger" disabled={busy}>Kirim laporan</button>
            </div>
          </form>
        ) : (
          <div className="form-actions">
            {contactWa && role !== "admin" ? (
              <a className="btn" href={contactWa} target="_blank" rel="noopener noreferrer"><Icon name="phone" size={15} /> Hubungi {other}</a>
            ) : null}
            {e.aksi_tersedia.map((a) => {
              if (a === "pilih-ambil-sendiri" || a === "pilih-diantar") return null; // ditangani PengambilanPicker
              if (a === "lapor-masalah") return <button key={a} type="button" className="btn" disabled={busy} onClick={() => setReport("")}>Laporkan masalah</button>;
              const label: Record<EscrowAction, string> = {
                bayar: "Bayar sekarang", "konfirmasi-kirim": "Konfirmasi gabah dikirim", "konfirmasi-terima": "Konfirmasi gabah diterima",
                "lapor-masalah": "Laporkan masalah", "cairkan-ulang": "Cairkan ulang", "selesaikan-sengketa": "Teruskan dana ke petani",
                rekonsiliasi: "Tarik status dari Xendit", "buat-invoice": "Buat tautan pembayaran",
                "pilih-ambil-sendiri": "Ambil sendiri", "pilih-diantar": "Diantar", "cairkan-ulang-logistik": "Cairkan ulang biaya logistik",
              };
              const primary = !["rekonsiliasi"].includes(a);
              return (
                <button key={a} type="button" className={`btn${primary ? " primary" : ""}`} disabled={busy} onClick={() => run(a)}>
                  {a === "bayar" ? <Icon name="wallet" size={15} /> : null} {label[a]}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <RincianTagihan e={e} role={role} />

      <div className="divider" />
      <div className="modal-grid">
        <div className="modal-item"><label>Kode escrow</label><strong>{e.kode}</strong></div>
        <div className="modal-item"><label>Status</label><strong><EscrowPill status={e.status} label={e.statusLabel} /></strong></div>
        <div className="modal-item"><label>Petani</label><strong>{e.petani}</strong></div>
        <div className="modal-item"><label>Tengkulak</label><strong>{e.tengkulak}</strong></div>
        <div className="modal-item"><label>ID Penawaran</label><strong>{e.offerId}</strong></div>
        <div className="modal-item"><label>Kabupaten</label><strong>{e.kabupaten}</strong></div>
        {e.status === "MENUNGGU_BAYAR" ? (
          <div className="modal-item"><label>Batas pembayaran</label><strong>{when(e.invoice_kedaluwarsa_pada)}</strong></div>
        ) : null}
        {role !== "admin" ? (
          <div className="modal-item"><label>Kontak {other}</label><strong>{e.kontak || "Dibagikan setelah dana masuk escrow"}</strong></div>
        ) : (
          <>
            <div className="modal-item"><label>HP petani / tengkulak</label><strong>{e.petani_phone} / {e.tengkulak_phone}</strong></div>
            <div className="modal-item"><label>Invoice / disbursement</label><strong>{e.invoice_id || "—"} / {e.disbursement_id || "—"}</strong></div>
          </>
        )}
      </div>

      {e.riwayat?.length ? (
        <>
          <div className="divider" />
          <div className="timeline">
            {e.riwayat.map((r, i) => (
              <div className="timeline-item" key={i}>
                <strong>{r.label}</strong>
                <small>{when(r.dibuat_pada)} · {PELAKU_LABEL[r.pelaku] || r.pelaku} via {KANAL_LABEL[r.kanal] || r.kanal}</small>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div className="divider" />
      <div className="notice-card">
        {role === "tengkulak" && e.status === "MENUNGGU_BAYAR" && (e.dikunci
          ? "Dana Anda ditahan di escrow Temu Tani dan baru diteruskan ke petani setelah Anda mengonfirmasi gabah diterima."
          : "Pilih cara pengambilan dulu. Tagihan (nilai gabah, biaya logistik bila diantar, dan fee 0,5%) dibuat setelah Anda memilih.")}
        {role === "petani" && e.status === "MENUNGGU_BAYAR" && (e.dikunci
          ? "Menunggu tengkulak membayar ke escrow. Jangan kirim gabah sebelum status berubah menjadi Dana di Escrow."
          : "Menunggu tengkulak memilih cara pengambilan (ambil sendiri atau diantar) dan membayar ke escrow.")}
        {role === "petani" && e.status === "DIBAYAR" && (e.pengambilan === "diantar"
          ? "Dana sudah aman di escrow. Biaya logistik (termin 1) dicairkan ke rekening Anda untuk menyewa truk. Kirim gabah, lalu konfirmasi di sini atau lewat WhatsApp."
          : "Dana sudah aman di escrow. Tengkulak akan menjemput gabah; setelah diserahkan, konfirmasi di sini atau lewat WhatsApp.")}
        {role === "tengkulak" && e.status === "DIBAYAR" && "Pembayaran diterima dan dana aman di escrow. Tunggu petani mengirim gabah; Anda akan diberi tahu lewat WhatsApp dan web, lalu konfirmasi penerimaan di sini setelah gabah sampai."}
        {role === "tengkulak" && e.status === "DIKIRIM" && "Petani sudah mengirim gabah. Cek berat dan mutu, lalu konfirmasi penerimaan atau laporkan masalah."}
        {role === "petani" && e.status === "DIKIRIM" && "Menunggu tengkulak mengonfirmasi penerimaan gabah. Dana dicairkan otomatis setelah dikonfirmasi."}
        {e.status === "DITERIMA" && (role === "petani"
          ? "Gabah sudah diterima tengkulak. Dana sedang dicairkan ke rekening Anda; biasanya beberapa menit (bisa lebih lama di luar jam operasional bank). Anda akan diberi tahu lewat WhatsApp dan web saat dana masuk."
          : role === "tengkulak"
            ? "Penerimaan sudah dikonfirmasi. Dana sedang diteruskan ke petani; tidak ada tindakan lagi dari Anda."
            : "Payout sedang diproses Xendit (biasanya beberapa menit). Status berubah otomatis menjadi Selesai saat callback berhasil masuk.")}
        {e.status === "SELESAI" && "Transaksi selesai. Dana sudah diteruskan ke petani."}
        {role === "admin" && ["MENUNGGU_BAYAR", "DIBAYAR", "DIKIRIM"].includes(e.status) && "Status bergerak dari webhook Xendit dan konfirmasi kedua pihak."}
        {role === "admin" && e.status === "SENGKETA" && "Tinjau laporan tengkulak dan hubungi kedua pihak. Bila masalah selesai dan dana tetap dibayarkan, klik \u201cTeruskan dana ke petani\u201d."}
        {role === "admin" && e.status === "PENCAIRAN_GAGAL" && "Periksa kode gagal dan akun pencairan petani, lalu klik \u201cCairkan ulang\u201d."}
        {role === "admin" && e.status === "KEDALUWARSA" && "Tagihan kedaluwarsa. Kesepakatan ini tidak dilanjutkan."}
        {role !== "admin" && e.status === "SENGKETA" && "Admin Temu Tani sedang meninjau laporan. Anda akan dihubungi lewat WhatsApp."}
        {role !== "admin" && e.status === "PENCAIRAN_GAGAL" && "Pencairan sedang ditangani admin. Dana tetap aman."}
        {role !== "admin" && e.status === "KEDALUWARSA" && "Tagihan kedaluwarsa karena tidak dibayar sampai batas waktu."}
      </div>

    </div>
  );
}
