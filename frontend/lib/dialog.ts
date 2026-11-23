/* Pengganti alert()/confirm() bawaan browser: dialog bergaya Temu Tani yang bisa dipanggil
   dari mana saja (komponen React, handler, atau skrip biasa seperti simulasi chatbot).
   Ditampilkan oleh <DialogHost /> di root layout, selalu di atas modal yang sedang terbuka. */

export type DialogTone = "info" | "success" | "warning" | "danger";
export type Mascot = "ide" | "bingung" | "senang" | "panen" | "melambai" | "menunjuk" | "cek-harga" | "menyambut";

export interface DialogOptions {
  title: string;
  message?: string;
  tone?: DialogTone;
  /** Maskot di atas judul; default mengikuti tone. Isi null untuk tanpa maskot. */
  mascot?: Mascot | null;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface DialogRequest extends DialogOptions {
  id: number;
  kind: "alert" | "confirm";
  resolve: (ok: boolean) => void;
}

type Listener = (queue: DialogRequest[]) => void;
let queue: DialogRequest[] = [];
let seq = 0;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(queue));

export function subscribeDialogs(l: Listener): () => void {
  listeners.add(l);
  l(queue);
  return () => {
    listeners.delete(l);
  };
}

export function resolveDialog(id: number, ok: boolean) {
  const d = queue.find((x) => x.id === id);
  queue = queue.filter((x) => x.id !== id);
  emit();
  d?.resolve(ok);
}

function push(kind: DialogRequest["kind"], opts: DialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    queue = [...queue, { ...opts, kind, id: ++seq, resolve }];
    emit();
  });
}

/** Pemberitahuan dengan satu tombol. */
export function showAlert(opts: DialogOptions): Promise<void> {
  return push("alert", { tone: "warning", confirmLabel: "Mengerti", ...opts }).then(() => undefined);
}

/** Konfirmasi Ya/Batal; resolve true bila disetujui. */
export function showConfirm(opts: DialogOptions): Promise<boolean> {
  return push("confirm", { tone: "info", confirmLabel: "Ya, lanjutkan", cancelLabel: "Batal", ...opts });
}
