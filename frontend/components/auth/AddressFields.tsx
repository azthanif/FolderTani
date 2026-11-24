"use client";
/* Dropdown alamat bertingkat: kabupaten -> kecamatan -> desa/kelurahan (data Kepmendagri dari /api/wilayah). */
import { useEffect, useMemo, useState } from "react";
import { loadWilayah, type Kabupaten } from "@/lib/auth";

export interface Address {
  region: string;
  district: string;
  village: string;
}

interface Props {
  value: Address;
  onChange: (a: Address) => void;
  /** Kelas pembungkus tiap kolom & select, agar bisa dipakai di halaman auth maupun profil. */
  fieldClass: string;
  selectClass?: string;
  idPrefix?: string;
}

export function AddressFields({ value, onChange, fieldClass, selectClass, idPrefix = "addr" }: Props) {
  const [data, setData] = useState<Kabupaten[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    loadWilayah()
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  const kab = useMemo(() => data?.find((k) => k.nama === value.region), [data, value.region]);
  const kec = useMemo(() => kab?.kecamatan.find((k) => k.nama === value.district), [kab, value.district]);
  const loading = !data && !error;

  return (
    <>
      <div className={fieldClass}>
        <label htmlFor={`${idPrefix}-kab`}>Kabupaten</label>
        <select
          id={`${idPrefix}-kab`}
          className={selectClass}
          required
          disabled={loading || error}
          value={value.region}
          onChange={(e) => onChange({ region: e.target.value, district: "", village: "" })}
        >
          <option value="" disabled>
            {loading ? "Memuat wilayah…" : error ? "Data wilayah gagal dimuat" : "Pilih kabupaten"}
          </option>
          {data?.map((k) => (
            <option key={k.nama} value={k.nama}>
              {k.nama}
            </option>
          ))}
        </select>
      </div>
      <div className={fieldClass}>
        <label htmlFor={`${idPrefix}-kec`}>Kecamatan</label>
        <select
          id={`${idPrefix}-kec`}
          className={selectClass}
          required
          disabled={!kab}
          value={value.district}
          onChange={(e) => onChange({ ...value, district: e.target.value, village: "" })}
        >
          <option value="" disabled>
            {kab ? "Pilih kecamatan" : "Pilih kabupaten dulu"}
          </option>
          {kab?.kecamatan.map((k) => (
            <option key={k.nama} value={k.nama}>
              {k.nama}
            </option>
          ))}
        </select>
      </div>
      <div className={fieldClass}>
        <label htmlFor={`${idPrefix}-kel`}>Desa/Kelurahan</label>
        <select
          id={`${idPrefix}-kel`}
          className={selectClass}
          required
          disabled={!kec}
          value={value.village}
          onChange={(e) => onChange({ ...value, village: e.target.value })}
        >
          <option value="" disabled>
            {kec ? "Pilih desa/kelurahan" : "Pilih kecamatan dulu"}
          </option>
          {kec?.desa.map((d) => (
            <option key={d.nama} value={d.nama}>
              {d.jenis === "Kelurahan" ? `${d.nama} (Kelurahan)` : d.nama}
            </option>
          ))}
        </select>
      </div>
      {error ? <small className="addr-error">Data wilayah gagal dimuat. Muat ulang halaman untuk mencoba lagi.</small> : null}
    </>
  );
}
