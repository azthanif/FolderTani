/* Bentuk data GET /api/admin/dashboard (backend/seed.py: admin_data). */
import type { PricesResponse } from "@/lib/prices";

export interface AdminStock {
  id: string;
  farmer: string;
  location: string;
  type: string;
  volume: number;
  harvest: string;
  status: string;
  offers: number;
}

/** [judul, waktu, catatan] */
export type OfferHistory = [string, string, string];

export interface AdminOffer {
  id: string;
  buyer: string;
  location: string;
  farmer: string;
  stock: string;
  volume: number;
  price: number;
  ai: number;
  status: string;
  date: string;
  time: string;
  counter?: number;
  history: OfferHistory[];
}

export interface AdminTransaction {
  id: string;
  farmer: string;
  buyer: string;
  location: string;
  stock: string;
  volume: number;
  price: number;
  date: string;
  status: string;
}

export interface AdminEvent {
  icon: string;
  title: string;
  note: string;
  time: string;
  kind: string;
  status: string;
  location: string;
}

export interface AdminDashboardResponse {
  stocks: AdminStock[];
  offers: AdminOffer[];
  transactions: AdminTransaction[];
  events: AdminEvent[];
}

export interface AdminData extends AdminDashboardResponse {
  prices: PricesResponse | null;
}

export type TableKind = "stok" | "penawaran" | "transaksi" | "aktivitas";
export const ALL_AREAS = "Semua Wilayah";
