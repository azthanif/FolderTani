/* Bentuk snapshot GET /api/state (lihat backend/main.py snapshot() dan seed.py). */
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
  /** Nomor HP lawan transaksi (bila terdaftar). Pembayaran dilakukan langsung di luar sistem. */
  contact?: string | null;
}
/** Riwayat perubahan total stok fisik petani (terbaru dulu). */
export interface StockLog { id: string; farmerId: string; at: string; activity: string; delta: number; total: number }
export interface Activity { id: string; at: string; title: string; note: string }

export interface RoleState {
  version: number;
  actor: { role: string; user: string };
  farmers: Farmer[];
  buyers: Buyer[];
  activities: Activity[];
  stocks: Stock[];
  stockLog?: StockLog[];
  offers: Offer[];
  transactions: Transaction[];
  aiReference?: Record<string, number>;
}

export interface MutationResult { state: RoleState; message: string; id?: string }
