/* Pengurutan tabel penawaran & transaksi: "prioritas" (perlu tindakan dulu) atau "terbaru" (aktivitas terakhir).
 *
 * Mode prioritas: peringkat kecil = lebih mendesak; peringkat sama diurutkan dari tanggal terbaru.
 * Mode terbaru: tanggal aktivitas terakhir menurun; tanggal sama diurutkan menurut prioritas.
 */
export type SortMode = "prioritas" | "terbaru";

export const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "prioritas", label: "Urutkan: Prioritas" },
  { value: "terbaru", label: "Urutkan: Tanggal terbaru" },
];

const ID_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** Milidetik epoch dari ISO datetime ("2026-11-27T10:00:00+07:00") atau tanggal saja ("2026-11-27", dianggap 00:00 WIB). */
export function timeOf(v?: string | null): number {
  if (!v) return 0;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00+07:00` : v);
  return Number.isNaN(t) ? 0 : t;
}

/** Milidetik epoch dari format tampilan backend: "31 Okt 2026" (+ "10:42" opsional), WIB. */
export function timeOfId(date?: string | null, time?: string | null): number {
  const m = /^(\d{1,2}) (\w{3}) (\d{4})$/.exec((date || "").trim());
  if (!m) return 0;
  const month = ID_MONTHS.indexOf(m[2]);
  if (month < 0) return 0;
  const [hh, mm] = /^\d{1,2}:\d{2}$/.test(time || "") ? (time as string).split(":").map(Number) : [0, 0];
  return Date.UTC(Number(m[3]), month, Number(m[1]), hh - 7, mm);
}

/** Salinan terurut; tidak mengubah array asal. */
export function sortRows<T>(rows: T[], mode: SortMode, rank: (x: T) => number, time: (x: T) => number): T[] {
  return rows
    .map((x) => ({ x, r: rank(x), t: time(x) }))
    .sort((a, b) => (mode === "prioritas" ? a.r - b.r || b.t - a.t : b.t - a.t || a.r - b.r))
    .map((e) => e.x);
}

/* ---------- Peringkat prioritas ---------- */

/** Penawaran di dashboard petani/tengkulak: giliran saya merespons paling atas. */
export function offerRank(status: string, isFarmer: boolean): number {
  const myTurn = isFarmer ? "Menunggu Petani" : "Penawaran Balik";
  const theirTurn = isFarmer ? "Penawaran Balik" : "Menunggu Petani";
  if (status === myTurn) return 0;
  if (status === theirTurn) return 1;
  if (status === "Disepakati") return 2;
  return 3; // Ditolak, Dibatalkan
}

/** Penawaran di admin: admin bukan pihak tawar, jadi semua negosiasi terbuka setara. */
export function adminOfferRank(status: string): number {
  if (status === "Menunggu" || status === "Penawaran Balik") return 0;
  if (status === "Disetujui") return 1;
  return 2; // Ditolak, Dibatalkan
}

/** Status escrow yang menunggu tindakan pengguna ini (sama dengan penanda "Perlu tindakan Anda"). */
export function escrowNeedsAction(status: string | null | undefined, isFarmer: boolean): boolean {
  return isFarmer ? status === "DIBAYAR" : status === "MENUNGGU_BAYAR" || status === "DIKIRIM";
}

/** Kesepakatan + escrow di dashboard petani/tengkulak. */
export function trxRank(status: string | null | undefined, isFarmer: boolean): number {
  if (escrowNeedsAction(status, isFarmer)) return 0;
  switch (status) {
    case "SENGKETA":
    case "PENCAIRAN_GAGAL":
      return 1; // bermasalah, sedang ditangani admin
    case "MENUNGGU_BAYAR":
    case "DIBAYAR":
    case "DIKIRIM":
    case "DITERIMA":
      return 2; // berjalan, menunggu pihak lain
    case "SELESAI":
      return 4;
    case "KEDALUWARSA":
      return 5;
    default:
      return 3; // kesepakatan lama tanpa escrow
  }
}

/** Escrow di admin: sengketa & pencairan gagal (termasuk termin logistik tertunda) paling atas. */
export function adminEscrowRank(status: string, logistikGagal = false): number {
  if (status === "SENGKETA" || status === "PENCAIRAN_GAGAL" || logistikGagal) return 0;
  switch (status) {
    case "DITERIMA":
      return 1; // dana sedang dicairkan, pantau
    case "DIBAYAR":
    case "DIKIRIM":
      return 2; // dana ditahan, serah terima berjalan
    case "MENUNGGU_BAYAR":
      return 3;
    case "SELESAI":
      return 4;
    default:
      return 5; // KEDALUWARSA
  }
}

/** Riwayat kesepakatan di admin. */
export function adminTrxRank(status: string): number {
  return status === "Selesai" ? 1 : 0;
}
