"use client";
/* Simulasi chatbot WhatsApp: markup dari Chatbot/chatbot.html, logika dijalankan oleh engine.ts. */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { startChatbot } from "./engine";

const BACK: Record<string, [string, string]> = {
  petani: ["/petani", "Dashboard Petani"],
  tengkulak: ["/tengkulak", "Dashboard Tengkulak"],
  admin: ["/admin", "Dashboard Admin"],
};
const FROM_KEY = "temutani_chat_from";

/** Tujuan tombol kembali: ?from=… , lalu cadangan sessionStorage (sama seperti versi HTML). */
function useBackTarget(): [string, string] {
  const params = useSearchParams();
  const fromParam = params.get("from") || "";
  const [stored, setStored] = useState<string | null>(null);
  useEffect(() => {
    try {
      if (BACK[fromParam]) sessionStorage.setItem(FROM_KEY, fromParam);
      else setStored(sessionStorage.getItem(FROM_KEY));
    } catch {
      /* sessionStorage tidak tersedia */
    }
  }, [fromParam]);
  const from = BACK[fromParam] ? fromParam : stored || "";
  return BACK[from] ?? ["/", "Beranda"];
}

export function ChatbotApp() {
  const rootRef = useRef<HTMLElement>(null);
  const [backHref, backLabel] = useBackTarget();

  useEffect(() => {
    if (!rootRef.current) return;
    return startChatbot(rootRef.current);
  }, []);

  return (
    <>
      <Link className="back-dash" id="backDash" href={backHref}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
        <span id="backDashLabel">Kembali ke {backLabel}</span>
      </Link>
      <div className="app">
        <main ref={rootRef} aria-label="Simulasi chatbot WhatsApp TemuTani" className="phone">
          <div className="statusbar">
            <span id="phoneTime">09:41</span>
            <div className="status-icons">
              <span>4G</span>
              <svg viewBox="0 0 20 20">
                <path d="M2 16v-4h3v4zm4 0V9h3v7zm4 0V6h3v10zm4 0V3h4v13z" />
              </svg>
              <svg viewBox="0 0 20 20">
                <path d="M3 6h14v11H3z" opacity=".5" />
                <path d="M17 9h2v5h-2z" />
                <path d="M4 7h10v9H4z" />
              </svg>
            </div>
          </div>
          <header className="chathead">
            <button aria-label="Kembali ke menu" className="head-back" id="headerBack" type="button">
              <span id="headBackIcon" />
            </button>
            <button type="button" aria-label="Ganti peran" className="head-logo" id="avatarSwitch">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/logo-temutani-bg-white.png" alt="Logo Temu Tani" className="profile-logo" />
            </button>
            <div className="head-name">
              <strong>
                Temu Tani <span className="verify" id="verifyIcon" />
              </strong>
            </div>
          </header>
          <div className="identitybar">
            <button className="identity" id="identitySwitch" type="button">
              <span id="roleSmallIcon" />
              <span className="role-lbl" id="roleDisplay" />
              <span id="arrowSmall" />
            </button>
            <span className="label-demo">SIMULASI PROTOTIPE</span>
          </div>
          <div aria-live="polite" aria-relevant="additions" className="chatroom" id="chatroom" role="log" />
          <div className="composer">
            <div className="composer-inner">
              <button aria-label="Tampilkan menu pilihan" className="emoji-btn" id="shortcutMenu" title="Tampilkan menu" type="button">
                <span id="smileIcon" />
              </button>
              <input aria-label="Ketik pesan ke chatbot" autoComplete="off" enterKeyHint="send" id="chatInput" placeholder="Ketik pesan atau pilih menu..." type="text" />
              <button aria-label="Petunjuk" className="attach-btn" id="attachHelp" title="Petunjuk" type="button">
                <span id="attachIcon" />
              </button>
            </div>
            <button aria-label="Kirim pesan" className="sendbtn" id="sendButton" type="button">
              <span id="sendIcon" />
            </button>
          </div>
          <div className="toast" id="toast" />
          <div id="sheetContainer" />
        </main>
      </div>
    </>
  );
}
