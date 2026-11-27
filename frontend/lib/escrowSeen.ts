/* Penanda "transaksi selesai sudah dilihat" per pengguna per browser (localStorage, kenyamanan tampilan saja).
   Dipakai untuk badge menu Riwayat Kesepakatan dan popup ucapan saat dana escrow cair. */
const EVENT = "temutani:escrow-seen";
const key = (user: string) => `temutani.escrowSeen.${user}`;

function read(user: string): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(key(user));
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function write(user: string, ids: Set<string>) {
  try {
    window.localStorage.setItem(key(user), JSON.stringify([...ids].slice(-300)));
  } catch {
    /* storage penuh / diblokir: abaikan */
  }
}

/** Escrow SELESAI yang belum dilihat. Pertama kali dipakai di browser ini: semua yang sudah selesai dianggap sudah dilihat
 *  (agar riwayat lama tidak memunculkan badge/popup sekaligus). */
export function unseenDone(user: string, doneIds: string[]): string[] {
  if (typeof window === "undefined") return [];
  const seen = read(user);
  if (!seen) {
    write(user, new Set(doneIds));
    return [];
  }
  return doneIds.filter((id) => !seen.has(id));
}

export function markSeen(user: string, id: string) {
  if (typeof window === "undefined") return;
  const seen = read(user) || new Set<string>();
  seen.add(id);
  write(user, seen);
  window.dispatchEvent(new Event(EVENT));
}

export function onSeenChange(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
