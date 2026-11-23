"use client";
/* Menampilkan dialog dari lib/dialog (pengganti alert/confirm bawaan browser). */
import { useEffect, useRef, useState } from "react";
import { resolveDialog, subscribeDialogs, type DialogRequest, type DialogTone, type Mascot } from "@/lib/dialog";
import "@/styles/dialog.css";

const DEFAULT_MASCOT: Record<DialogTone, Mascot> = { info: "ide", success: "senang", warning: "bingung", danger: "bingung" };

export function DialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const current = queue[0];

  useEffect(() => subscribeDialogs(setQueue), []);

  useEffect(() => {
    if (!current) return;
    lastFocus.current = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Jangan sampai Escape ikut menutup modal di bawahnya.
        e.stopImmediatePropagation();
        e.preventDefault();
        resolveDialog(current.id, false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      lastFocus.current?.focus?.();
    };
  }, [current]);

  if (!current) return null;
  const tone = current.tone || "info";
  const mascot = current.mascot === undefined ? DEFAULT_MASCOT[tone] : current.mascot;
  const close = (ok: boolean) => resolveDialog(current.id, ok);

  return (
    <div
      className="tt-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close(false);
      }}
    >
      <div
        className={`tt-dialog tone-${tone}`}
        role={current.kind === "confirm" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={`tt-dialog-title-${current.id}`}
        aria-describedby={current.message ? `tt-dialog-msg-${current.id}` : undefined}
      >
        {mascot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="tt-dialog-mascot" src={`/assets/maskot/${mascot}.webp`} alt="" />
        ) : null}
        <h2 id={`tt-dialog-title-${current.id}`}>{current.title}</h2>
        {current.message ? (
          <p id={`tt-dialog-msg-${current.id}`} className="tt-dialog-msg">
            {current.message}
          </p>
        ) : null}
        <div className="tt-dialog-actions">
          {current.kind === "confirm" ? (
            <button type="button" className="tt-btn ghost" onClick={() => close(false)}>
              {current.cancelLabel}
            </button>
          ) : null}
          <button ref={confirmRef} type="button" className={`tt-btn ${tone === "danger" ? "danger" : "primary"}`} onClick={() => close(true)}>
            {current.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
