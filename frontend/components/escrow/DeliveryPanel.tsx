"use client";
/* Delivery di detail escrow (PRD "Fitur Delivery: Estimasi Jarak & Biaya Angkut"):
   - PengambilanPicker: tengkulak memilih Ambil sendiri / Diantar, melihat pratinjau tagihan dari server, lalu mengunci.
   - RincianTagihan: rincian terkunci (nilai gabah, logistik, fee, total) dan termin pencairan ke petani.
   Semua angka berasal dari backend (dihitung ulang di server saat dikunci); frontend tidak menghitung biaya. */
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { showConfirm } from "@/lib/dialog";
import { formatRupiah } from "@/lib/format";
import { PENGAMBILAN_LABEL, TERMIN_LABEL, type Armada, type DeliveryQuote, type Escrow, type Pengambilan, type Rincian, type Termin } from "@/lib/escrow";

const km = (n: number | null | undefined) => `${Number(n || 0).toLocaleString("id-ID", { maximumFractionDigits: 1 })} km`;
const armadaText = (a: Armada[]) => a.map((x) => `${x.jumlah} ${x.nama}`).join(" + ");
const TERMIN_TONE: Record<string, string> = { MENUNGGU: "gray", DIPROSES: "gold", CAIR: "green", GAGAL: "red" };

const OPTIONS: { value: Pengambilan; title: string; desc: string }[] = [
  { value: "ambil_sendiri", title: "Ambil sendiri", desc: "Anda menjemput gabah dengan truk sendiri. Tanpa biaya logistik." },
  { value: "diantar", title: "Diantar", desc: "Petani menyewa truk dengan uang logistik. Biaya dari jarak garis lurus antar kantor desa." },
];

function BillRows({ rincian, total, pengambilan, jarak, armada, feePersen }: {
  rincian: Rincian; total: number; pengambilan: Pengambilan; jarak: number | null; armada: Armada[]; feePersen?: number;
}) {
  return (
    <table className="bill-table">
      <tbody>
        <tr><td>Nilai gabah</td><td>{formatRupiah(rincian.nilai_gabah)}</td></tr>
        {pengambilan === "diantar" ? (
          <tr>
            <td>Biaya logistik <small>perkiraan · {armadaText(armada)} · {km(jarak)}</small></td>
            <td>{formatRupiah(rincian.biaya_logistik)}</td>
          </tr>
        ) : null}
        <tr><td>Fee aplikasi{feePersen != null ? ` (${feePersen.toLocaleString("id-ID")}%)` : ""}</td><td>{formatRupiah(rincian.fee)}</td></tr>
        <tr className="total"><td>Total tagihan</td><td>{formatRupiah(total)}</td></tr>
      </tbody>
    </table>
  );
}

function ArmadaDetail({ armada, jarak }: { armada: Armada[]; jarak: number | null }) {
  if (!armada.length) return null;
  return (
    <ul className="bill-armada">
      {armada.map((a) => (
        <li key={a.kode}>
          <strong>{a.jumlah} × {a.nama}</strong> (maks {a.kapasitas_ton.toLocaleString("id-ID")} t):{" "}
          {a.jumlah} × ({formatRupiah(a.tarif_harian)} + {formatRupiah(a.tarif_per_km)}/km × {km(jarak)}) = {formatRupiah(a.biaya)}
        </li>
      ))}
    </ul>
  );
}

function CentroidNote({ peringatan }: { peringatan: string[] }) {
  if (!peringatan.some((p) => p.endsWith("_centroid"))) return null;
  return (
    <p className="bill-note">
      Koordinat desa memakai titik tengah wilayah desa (belum titik kantor desa), jadi estimasi jarak kurang presisi.
    </p>
  );
}

export function PengambilanPicker({ e, onLocked, onToast }: { e: Escrow; onLocked: (d: Escrow) => void; onToast: (m: string) => void }) {
  const [pick, setPick] = useState<Pengambilan | null>(null);
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose(p: Pengambilan) {
    setPick(p);
    setQuote(null);
    setErr(null);
    setBusy(true);
    try {
      setQuote(await api<DeliveryQuote>(`/escrow/${encodeURIComponent(e.id)}/quote`, { method: "POST", body: { pengambilan: p } }));
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  }

  async function lock() {
    if (!quote || !pick) return;
    const ok = await showConfirm({
      title: `Buat tagihan ${formatRupiah(quote.total_tagihan)}?`,
      message: `Pengambilan: ${PENGAMBILAN_LABEL[pick]}. Rincian biaya dikunci dan tidak bisa diganti setelah tagihan dibuat.`,
      confirmLabel: "Ya, buat tagihan", tone: "info",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const d = await api<Escrow>(`/escrow/${encodeURIComponent(e.id)}/pengambilan`, { method: "POST", body: { pengambilan: pick } });
      onToast(d.message || "Tagihan dibuat.");
      onLocked(d);
    } catch (x) {
      onToast(x instanceof ApiError ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="delivery-picker">
      <strong className="delivery-title">Pilih cara pengambilan gabah</strong>
      <div className="delivery-options" role="radiogroup" aria-label="Cara pengambilan">
        {OPTIONS.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={pick === o.value}
            className={`delivery-option${pick === o.value ? " active" : ""}`} disabled={busy} onClick={() => choose(o.value)}>
            <strong>{o.title}</strong>
            <small>{o.desc}</small>
          </button>
        ))}
      </div>
      {busy && !quote ? <div className="bill-note">Menghitung tagihan…</div> : null}
      {err ? <div className="notice-card escrow-exception red">{err}</div> : null}
      {quote ? (
        <div className="bill-card">
          {quote.pengambilan === "diantar" ? (
            <p className="bill-route">
              {quote.desa_asal} → {quote.desa_tujuan}<br />
              <small>Jarak garis lurus {km(quote.jarak_km)}</small>
            </p>
          ) : null}
          <BillRows rincian={quote.rincian} total={quote.total_tagihan} pengambilan={quote.pengambilan}
            jarak={quote.jarak_km} armada={quote.armada} feePersen={quote.fee_persen} />
          <ArmadaDetail armada={quote.armada} jarak={quote.jarak_km} />
          <CentroidNote peringatan={quote.peringatan} />
          <div className="form-actions">
            <button type="button" className="btn primary" disabled={busy} onClick={lock}>Buat tagihan {formatRupiah(quote.total_tagihan)}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TerminList({ termin, role }: { termin: Termin[]; role: string }) {
  return (
    <div className="bill-termin">
      <small>{role === "petani" ? "Pencairan ke Anda" : "Pencairan ke petani"}</small>
      {termin.map((t) => (
        <div key={t.ke} className="bill-termin-row">
          <span>Termin {t.ke}: {t.jenis === "logistik" ? "biaya logistik (saat dana masuk escrow)" : "nilai gabah (setelah gabah diterima)"}</span>
          <span><strong>{formatRupiah(t.nilai)}</strong> {t.status ? <span className={`pill ${TERMIN_TONE[t.status] || "gray"}`}>{TERMIN_LABEL[t.status] || t.status}</span> : null}</span>
        </div>
      ))}
    </div>
  );
}

export function RincianTagihan({ e, role }: { e: Escrow; role: string }) {
  if (!e.dikunci || !e.pengambilan || e.total_tagihan == null) return null;
  return (
    <div className="bill-card">
      <div className="bill-head">
        <strong>Rincian tagihan</strong>
        <span className="pill blue">{PENGAMBILAN_LABEL[e.pengambilan]}</span>
      </div>
      {e.pengambilan === "diantar" ? (
        <p className="bill-route">
          {e.desa_asal || "Desa petani"} → {e.desa_tujuan || "Desa tengkulak"}<br />
          <small>Jarak garis lurus {km(e.jarak_km)}</small>
        </p>
      ) : null}
      <BillRows rincian={e.rincian} total={e.total_tagihan} pengambilan={e.pengambilan} jarak={e.jarak_km} armada={e.armada} />
      {role !== "petani" ? <ArmadaDetail armada={e.armada} jarak={e.jarak_km} /> : null}
      <TerminList termin={e.termin_petani} role={role} />
      <CentroidNote peringatan={e.peringatan} />
    </div>
  );
}
