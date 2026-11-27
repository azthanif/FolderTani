/* Tipe & helper escrow (respons GET /api/escrow dan /api/escrow/{id}, lihat backend/escrow.py view()). */
export type EscrowStatus =
  | "MENUNGGU_BAYAR" | "DIBAYAR" | "DIKIRIM" | "DITERIMA" | "SELESAI" | "KEDALUWARSA" | "SENGKETA" | "PENCAIRAN_GAGAL";

export type EscrowAction =
  | "bayar" | "konfirmasi-kirim" | "konfirmasi-terima" | "lapor-masalah" | "cairkan-ulang" | "selesaikan-sengketa"
  | "rekonsiliasi" | "buat-invoice" | "pilih-ambil-sendiri" | "pilih-diantar" | "cairkan-ulang-logistik";

/* ---- Delivery (PRD "Fitur Delivery: Estimasi Jarak & Biaya Angkut") ---- */
export type Pengambilan = "ambil_sendiri" | "diantar";
export const PENGAMBILAN_LABEL: Record<Pengambilan, string> = { ambil_sendiri: "Ambil sendiri", diantar: "Diantar" };

export interface Armada { kode: string; nama: string; jumlah: number; kapasitas_ton: number; tarif_harian: number; tarif_per_km: number; biaya: number }
export interface Rincian { nilai_gabah: number; biaya_logistik: number; fee: number }
export interface Termin { ke: number; jenis: "logistik" | "gabah"; nilai: number; status?: "MENUNGGU" | "DIPROSES" | "CAIR" | "GAGAL"; cair_pada?: string | null }

/** Respons POST /api/escrow/{id}/quote (pratinjau, belum dikunci). */
export interface DeliveryQuote {
  pengambilan: Pengambilan; jarak_km: number | null; armada: Armada[]; rincian: Rincian; total_tagihan: number;
  termin_petani: Termin[]; peringatan: string[]; fee_persen: number; desa_asal: string | null; desa_tujuan: string | null;
}

export const TERMIN_LABEL: Record<string, string> = { MENUNGGU: "Menunggu", DIPROSES: "Diproses", CAIR: "Cair", GAGAL: "Tertunda" };

export interface EscrowEvent { dari_status: EscrowStatus | null; ke_status: EscrowStatus; label: string; pelaku: string; kanal: string; dibuat_pada: string }

export interface Escrow {
  id: string; kode: string; offerId: string; trxId: string;
  status: EscrowStatus; statusLabel: string;
  nilai: number; harga_per_kg: number; berat_kg: number;
  petani: string; tengkulak: string; kabupaten: string;
  invoice_url?: string | null; invoice_kedaluwarsa_pada?: string | null;
  dibuat_pada: string; dibayar_pada?: string | null; dikirim_pada?: string | null; diterima_pada?: string | null; selesai_pada?: string | null;
  /** Waktu baris escrow terakhir berubah (status, termin logistik, sengketa). */
  diperbarui_pada?: string | null;
  catatan_masalah?: string | null; kontak?: string;
  aksi_tersedia: EscrowAction[];
  riwayat?: EscrowEvent[];
  // delivery & tagihan (null sebelum tengkulak memilih pengambilan)
  pengambilan: Pengambilan | null; pengambilanLabel: string | null; dikunci: boolean;
  jarak_km: number | null; armada: Armada[]; desa_asal: string | null; desa_tujuan: string | null;
  rincian: Rincian; total_tagihan: number | null; termin_petani: Termin[]; peringatan: string[];
  // khusus admin
  invoice_id?: string | null; disbursement_id?: string | null; pencairan_percobaan?: number; pencairan_gagal_kode?: string | null;
  petani_phone?: string; tengkulak_phone?: string;
  /** hasil aksi */
  berubah?: boolean; message?: string;
}

export const ESCROW_TONE: Record<EscrowStatus, string> = {
  MENUNGGU_BAYAR: "gold", DIBAYAR: "blue", DIKIRIM: "blue", DITERIMA: "green", SELESAI: "green",
  KEDALUWARSA: "gray", SENGKETA: "red", PENCAIRAN_GAGAL: "red",
};

/** Urutan langkah normal untuk penanda progres di detail. */
export const ESCROW_STEPS: { status: EscrowStatus; label: string }[] = [
  { status: "MENUNGGU_BAYAR", label: "Menunggu bayar" },
  { status: "DIBAYAR", label: "Dana di escrow" },
  { status: "DIKIRIM", label: "Gabah dikirim" },
  { status: "DITERIMA", label: "Gabah diterima" },
  { status: "SELESAI", label: "Dana cair" },
];

export const PELAKU_LABEL: Record<string, string> = { petani: "Petani", tengkulak: "Tengkulak", admin: "Admin", xendit: "Xendit", sistem: "Sistem" };
export const KANAL_LABEL: Record<string, string> = { web: "Web", whatsapp: "WhatsApp", webhook: "Gateway", sistem: "Otomatis" };
