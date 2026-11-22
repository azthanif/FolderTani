/* Data harga dari GET /api/prices (seri harian + prakiraan dihitung di server). */
import { api, type Role } from "./api";

export interface RegionPrice {
  current: number;
  previous: number;
  actualDaily: number[];
  predictedDaily: number[];
  forecast: number[];
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
