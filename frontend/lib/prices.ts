/* Data harga dari GET /api/prices (seri harian + prakiraan dihitung di server). */
import { api, type Role } from "./api";

export interface PriceMeta {
  source: string;
  runDate: string | null;
  modelVersion: string | null;
  mape: number | null;
  simulated: boolean;
  priceSource: "asli" | "simulasi" | "ffill";
  geeFilled: boolean;
}

export interface RegionPrice {
  current: number;
  previous: number;
  actualDaily: number[];
  predictedDaily: number[];
  forecast: number[];
  meta?: PriceMeta;
}

export interface RegionComparison {
  kabupaten: string;
  current: number;
  simulated: boolean;
}

export interface PricesResponse {
  regions: Record<string, RegionPrice>;
  /** Semua kabupaten layanan (juga untuk petani yang grafiknya dikunci ke kabupatennya). */
  comparison?: RegionComparison[];
  asOf: string | null;
  hpp: number;
  historyDays: number;
  forecastDays: number;
  lockedArea: string | null;
}

export async function loadPrices(role: Role): Promise<PricesResponse> {
  const res = await api<PricesResponse>("/prices", { role });
  const regions = res.regions || {};
  const comparison =
    res.comparison && res.comparison.length
      ? res.comparison
      : Object.entries(regions).map(([kabupaten, v]) => ({ kabupaten, current: v.current, simulated: v.meta?.simulated ?? true }));
  return { ...res, regions, comparison };
}
