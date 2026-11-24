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

export interface PricesResponse {
  regions: Record<string, RegionPrice>;
  asOf: string | null;
  hpp: number;
  historyDays: number;
  forecastDays: number;
  lockedArea: string | null;
}

export async function loadPrices(role: Role): Promise<PricesResponse> {
  const res = await api<PricesResponse>("/prices", { role });
  return { ...res, regions: res.regions || {} };
}
