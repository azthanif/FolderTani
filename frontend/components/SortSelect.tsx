"use client";
import { SORT_OPTIONS, type SortMode } from "@/lib/sort";

/** Pilihan urutan tabel (prioritas / tanggal terbaru) untuk toolbar. */
export function SortSelect({ value, onChange }: { value: SortMode; onChange: (v: SortMode) => void }) {
  return (
    <select className="select" aria-label="Urutkan tabel" value={value} onChange={(e) => onChange(e.target.value as SortMode)}>
      {SORT_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
