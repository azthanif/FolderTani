/* Bentuk snapshot GET /api/state (lihat backend/main.py snapshot()). */
export type RoleKind = "petani" | "tengkulak";

export interface Farmer { id: string; name: string; region: string; village: string; maxxiId?: string }
export interface Buyer { id: string; label: string }
export interface Stock {
  id: string; farmerId: string; region: string; type: string; volume: number; harvest: string;
  status: string; moisture?: number | null; available?: number;
}
export interface OfferHistory { at: string; actor: string; label: string; price?: number | null }
export interface Offer {
  id: string; buyerId: string; farmerId: string; stockId: string; volume: number;
  initialBid: number; currentBid: number; counter?: number | null; aiRef?: number; status: string;
  created?: string; agreedPrice?: number; history: OfferHistory[];
}
export interface Transaction {
  id: string; offerId: string; buyerId: string; farmerId: string; stockId: string; volume: number;
  price: number; date: string;
  /** Nomor HP lawan transaksi (bila terdaftar). */
  contact?: string | null;
  /** Escrow pembayaran (lihat /api/escrow). Null bila escrow belum dibuat (kesepakatan lama). */
  escrowId?: string | null;
  escrowStatus?: string | null;
  escrowLabel?: string | null;
  /** Waktu status escrow terakhir berubah (ISO, WIB). */
  escrowUpdated?: string | null;
}
/** Riwayat perubahan total stok fisik petani (terbaru dulu). */
export interface StockLog { id: string; farmerId: string; at: string; activity: string; harvest?: string | null; delta: number; total: number }
export interface Activity { id: string; at: string; title: string; note: string }
/** Sisa stok per tanggal panen milik petani yang login (stock_batches). */
export interface StockBatch { id: string; harvest: string; volume: number }

export interface RoleState {
  version: number;
  actor: { role: string; user: string };
  farmers: Farmer[];
  buyers: Buyer[];
  activities: Activity[];
  stocks: Stock[];
  stockLog?: StockLog[];
  batches?: StockBatch[];
  offers: Offer[];
  transactions: Transaction[];
  aiReference?: Record<string, number>;
}

export interface MutationResult { state: RoleState; message: string; id?: string }
