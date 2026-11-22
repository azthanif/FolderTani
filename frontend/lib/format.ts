export const formatRupiah = (n: number) => "Rp" + new Intl.NumberFormat("id-ID").format(n);
export const fmtNum = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n);
export const addDays = (date: Date, n: number) => new Date(date.getTime() + n * 86400000);
export const fmtDay = (date: Date, opts: Intl.DateTimeFormatOptions) =>
  date.toLocaleDateString("id-ID", { ...opts, timeZone: "UTC" });

/** "Hari ini" menurut WIB, dinormalkan ke 00:00 UTC. Bila asOf (dari server) ada, ikut server. */
export function todayWIB(asOf?: string | null): Date {
  if (asOf) {
    const [y, m, d] = asOf.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Inisial dua huruf dari nama, tanpa sapaan Pak/Bu. */
export const initials = (name: string) =>
  name
    .replace(/^(Pak|Bu) /, "")
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
