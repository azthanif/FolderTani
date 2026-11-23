"use client";
/* Daftar persyaratan password yang dicentang otomatis saat terpenuhi (daftar, lupa & ubah password). */
import { PASSWORD_RULES } from "@/lib/auth";

export function PasswordRules({ value }: { value: string }) {
  return (
    <div className="pw-rules" aria-live="polite">
      <p>* Persyaratan password:</p>
      <ul>
        {PASSWORD_RULES.map((r) => {
          const ok = !!value && r.test(value);
          return (
            <li key={r.label} className={ok ? "ok" : ""}>
              {r.label}
              <span className="sr-only">{ok ? " (terpenuhi)" : " (belum)"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Pesan di bawah kolom "Ulangi password" bila isinya belum sama. */
export function ConfirmHint({ password, confirm }: { password: string; confirm: string }) {
  if (!confirm) return null;
  return password === confirm ? <small className="pw-match">Password sama.</small> : <small className="pw-mismatch">Password belum sama.</small>;
}
