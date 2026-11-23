"use client";
/* Halaman tunggu setelah tengkulak mendaftar: cek status berkala dan langsung berubah
   saat admin menyetujui atau menolak (tanpa perlu memuat ulang halaman). */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { getSignupStatus, type PendingSignup, type SignupStatus } from "@/lib/auth";

const POLL_MS = 5000;

interface Props {
  pending: PendingSignup;
  /** Dipanggil saat pendaftar ingin memperbaiki data (ditolak) atau token tidak berlaku. */
  onReset: () => void;
  /** Dipanggil saat akun disetujui, agar data pendaftaran di perangkat dihapus. */
  onDone: () => void;
}

export function SignupWaiting({ pending, onReset, onDone }: Props) {
  const [status, setStatus] = useState<SignupStatus>("pending");
  const [reason, setReason] = useState("");
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [offline, setOffline] = useState(false);
  const statusRef = useRef<SignupStatus>("pending");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;

    async function check() {
      if (!alive || statusRef.current !== "pending") return;
      if (document.visibilityState === "hidden") {
        timer = setTimeout(check, POLL_MS);
        return;
      }
      try {
        const r = await getSignupStatus(pending.token);
        if (!alive) return;
        setOffline(false);
        setCheckedAt(new Date());
        statusRef.current = r.status;
        setStatus(r.status);
        setReason(r.reason);
        if (r.status === "approved") onDone();
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 401) return onReset();
        setOffline(true);
      }
      if (alive && statusRef.current === "pending") timer = setTimeout(check, POLL_MS);
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        check();
      }
    };
    check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pending.token, onReset, onDone]);

  if (status === "approved") {
    return (
      <div className="signup-state approved" role="status" aria-live="polite">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="signup-mascot bounce" src="/assets/maskot/senang.webp" alt="" />
        <span className="signup-badge ok">Disetujui</span>
        <h2>Akun Anda sudah aktif!</h2>
        <p>
          Selamat, <b>{pending.name}</b>. Admin Temu Tani telah memverifikasi pendaftaran Anda. Silakan masuk dengan nomor HP dan password yang Anda
          daftarkan.
        </p>
        <Link className="auth-submit" href={`/masuk?phone=${encodeURIComponent(pending.phone)}`}>
          Masuk sekarang
        </Link>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="signup-state rejected" role="status" aria-live="polite">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="signup-mascot" src="/assets/maskot/bingung.webp" alt="" />
        <span className="signup-badge bad">Belum disetujui</span>
        <h2>Pendaftaran perlu diperbaiki</h2>
        {reason ? (
          <div className="signup-reason">
            <b>Catatan admin</b>
            <p>{reason}</p>
          </div>
        ) : null}
        <p>Perbaiki data sesuai catatan di atas, lalu kirim ulang pendaftaran Anda.</p>
        <button type="button" className="auth-submit" onClick={onReset}>
          Perbaiki &amp; daftar ulang
        </button>
      </div>
    );
  }

  return (
    <div className="signup-state" role="status" aria-live="polite">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="signup-mascot" src="/assets/maskot/cek-harga.webp" alt="" />
      <span className="signup-badge wait">
        <i className="signup-dot" aria-hidden="true" /> Menunggu verifikasi admin
      </span>
      <h2>Pendaftaran terkirim</h2>
      <p>
        Terima kasih, <b>{pending.name}</b>. Halaman ini akan berubah otomatis begitu admin menyetujui atau menolak pendaftaran Anda. Kabar juga dikirim ke
        WhatsApp {pending.phone}.
      </p>
      <small className="signup-check">
        {offline ? "Koneksi terputus, mencoba lagi…" : checkedAt ? `Terakhir dicek ${checkedAt.toLocaleTimeString("id-ID")}` : "Mengecek status…"}
      </small>
      <Link className="auth-submit" href="/masuk">
        Ke halaman Masuk
      </Link>
      <Link className="auth-link" href="/">
        Kembali ke beranda
      </Link>
    </div>
  );
}
