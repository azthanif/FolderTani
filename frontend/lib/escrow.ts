/* Tipe & helper escrow (respons GET /api/escrow dan /api/escrow/{id}, lihat backend/escrow.py view()). */
export type EscrowStatus =
  | "MENUNGGU_BAYAR" | "DIBAYAR" | "DIKIRIM" | "DITERIMA" | "SELESAI" | "KEDALUWARSA" | "SENGKETA" | "PENCAIRAN_GAGAL";

export type EscrowAction =
  | "bayar" | "konfirmasi-kirim" | "konfirmasi-terima" | "lapor-masalah" | "cairkan-ulang" | "selesaikan-sengketa"
  | "rekonsiliasi" | "buat-invoice";

export interface EscrowEvent { dari_status: EscrowStatus | null; ke_status: EscrowStatus; label: string; pelaku: string; kanal: string; dibuat_pada: string }

export interface Escrow {
  id: string; kode: string; offerId: string; trxId: string;
  status: EscrowStatus; statusLabel: string;
  nilai: number; harga_per_kg: number; berat_kg: number;
  petani: string; tengkulak: string; kabupaten: string;
  invoice_url?: string | null; invoice_kedaluwarsa_pada?: string | null;
  dibuat_pada: string; dibayar_pada?: string | null; dikirim_pada?: string | null; diterima_pada?: string | null; selesai_pada?: string | null;
  catatan_masalah?: string | null; kontak?: string;
  aksi_tersedia: EscrowAction[];
  riwayat?: EscrowEvent[];
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
