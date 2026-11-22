"use client";
/* Modal dan toast bersama untuk dashboard (pengganti #modalBackdrop/#toast + innerHTML). */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

interface ModalState {
  title: ReactNode;
  subtitle?: ReactNode;
  body: ReactNode;
}

export interface UIContextValue {
  openModal: (title: ReactNode, subtitle: ReactNode | undefined, body: ReactNode) => void;
  closeModal: () => void;
  toast: (msg: string) => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI harus dipakai di dalam <UIProvider>");
  return ctx;
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastShow, setToastShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openModal = useCallback((title: ReactNode, subtitle: ReactNode | undefined, body: ReactNode) => {
    setModal({ title, subtitle, body });
  }, []);
  const closeModal = useCallback(() => setModal(null), []);
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastShow(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastShow(false), 3800);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <UIContext.Provider value={{ openModal, closeModal, toast }}>
      {children}
      <div
        className={`modal-backdrop${modal ? " show" : ""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
      >
        <div className="modal" role="dialog" aria-modal="true">
          {modal && (
            <>
              <div className="modal-top">
                <div>
                  <h2>{modal.title}</h2>
                  <p>{modal.subtitle}</p>
                </div>
                <button type="button" className="icon-btn" onClick={closeModal} aria-label="Tutup">
                  <Icon name="close" size={18} />
                </button>
              </div>
              <div className="modal-body">{modal.body}</div>
              <div className="modal-bottom">
                <button type="button" className="btn" onClick={closeModal}>
                  Tutup
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className={`toast${toastShow ? " show" : ""}`} role="status" aria-live="polite">
        {toastMsg && (
          <>
            <Icon name="check" size={16} />
            {toastMsg}
          </>
        )}
      </div>
    </UIContext.Provider>
  );
}
