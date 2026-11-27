/* Akun pencairan petani (tujuan dana escrow). Nomor tidak pernah dikirim utuh dari server: hanya 4 digit terakhir. */
import { api } from "@/lib/api";

export interface PayoutChannel { code: string; label: string; ewallet: boolean }
export interface PayoutAccount {
  bank: string | null; bankLabel: string | null; holder: string | null; numberLast4: string | null;
  isEwallet: boolean; isDummy: boolean; updatedAt: string | null; channels?: PayoutChannel[]; message?: string;
}

/** Sama dengan PAYOUT_CHANNELS di backend (dipakai form admin yang belum memuat daftar dari server). */
export const PAYOUT_CHANNELS: PayoutChannel[] = [
  { code: "BCA", label: "BCA", ewallet: false }, { code: "BRI", label: "BRI", ewallet: false },
  { code: "BNI", label: "BNI", ewallet: false }, { code: "MANDIRI", label: "Bank Mandiri", ewallet: false },
  { code: "BSI", label: "BSI", ewallet: false }, { code: "CIMB", label: "CIMB Niaga", ewallet: false },
  { code: "PERMATA", label: "Bank Permata", ewallet: false }, { code: "DANA", label: "DANA", ewallet: true },
  { code: "OVO", label: "OVO", ewallet: true }, { code: "GOPAY", label: "GoPay", ewallet: true },
  { code: "SHOPEEPAY", label: "ShopeePay", ewallet: true },
];
/** Akun uji Xendit Test Mode (bukan rekening asli). */
export const DUMMY_PAYOUT = { bank: "BCA", number: "1234567890" };

export const getPayoutAccount = () => api<PayoutAccount>("/auth/payout-account");
export const savePayoutAccount = (body: { bank: string; holder: string; number: string }) =>
  api<PayoutAccount>("/auth/payout-account", { method: "PUT", body });
