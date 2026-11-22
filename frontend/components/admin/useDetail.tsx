"use client";
/* Modal detail stok / penawaran / transaksi (port detail() dari initAdmin). */
import type { ReactNode } from "react";
import { useUI } from "@/components/UIProvider";
import { fmtNum, formatRupiah } from "@/lib/format";
import { useAdmin } from "./AdminData";
import { Badge } from "./ui";

function DetailsGrid({ pairs }: { pairs: [string, ReactNode][] }) {
  return (
    <div className="modal-grid">
      {pairs.map(([k, v]) => (
        <div className="modal-item" key={k}>
          <label>{k}</label>
          <strong>{v}</strong>
        </div>
      ))}
    </div>
  );
}

export type DetailType = "stock" | "offer" | "transaction";

export function useDetail() {
  const { stocks, offers, transactions } = useAdmin();
  const { openModal } = useUI();

  return function detail(type: DetailType, id: string) {
    if (type === "stock") {
      const x = stocks.find((s) => s.id === id);
      if (!x) return;
      openModal(
        `Detail Stok · ${id}`,
        "Listing stok dari petani",
        <DetailsGrid
          pairs={[
            ["NAMA PETANI", x.farmer],
            ["KABUPATEN", x.location],
            ["JENIS GABAH", x.type],
            ["VOLUME", fmtNum(x.volume) + " kg"],
            ["WAKTU PANEN", x.harvest],
            ["STATUS", <Badge key="b" status={x.status} />],
            ["PENAWARAN MASUK", String(x.offers)],
            ["SUMBER", "Chatbot WhatsApp"],
          ]}
        />,
      );
    } else if (type === "offer") {
      const x = offers.find((o) => o.id === id);
      if (!x) return;
      openModal(
        `Detail Penawaran · ${id}`,
        "Riwayat negosiasi tersimpan dari chatbot WhatsApp",
        <>
          <DetailsGrid
            pairs={[
              ["PEMBELI", x.buyer],
              ["PETANI", x.farmer],
              ["STOK / VOLUME", x.stock + " · " + fmtNum(x.volume) + " kg"],
              ["KABUPATEN", x.location],
              ["HARGA PENAWARAN", formatRupiah(x.price) + "/kg"],
              ["HARGA REFERENSI AI", formatRupiah(x.ai) + "/kg"],
              ["PENAWARAN BALIK", x.counter ? formatRupiah(x.counter) + "/kg" : "—"],
              ["STATUS", <Badge key="b" status={x.status} />],
            ]}
          />
          <div className="divider" />
          <strong style={{ fontSize: 13 }}>Jejak Negosiasi</strong>
          <div className="timeline">
            {x.history.map((y, i) => (
              <div className="timeline-item" key={i}>
                <strong>{y[0]}</strong>
                <small>
                  {y[1]} · {y[2]}
                </small>
              </div>
            ))}
          </div>
          <p className="small-muted">Persetujuan/penolakan dilakukan oleh petani lewat WhatsApp, bukan oleh admin.</p>
        </>,
      );
    } else {
      const x = transactions.find((t) => t.id === id);
      if (!x) return;
      openModal(
        `Detail Kesepakatan · ${id}`,
        "Catatan transaksi Temu Tani",
        <DetailsGrid
          pairs={[
            ["PETANI", x.farmer],
            ["PEMBELI", x.buyer],
            ["KABUPATEN", x.location],
            ["VOLUME", fmtNum(x.volume) + " kg"],
            ["HARGA AKHIR", formatRupiah(x.price) + "/kg"],
            ["TOTAL NILAI", formatRupiah(x.price * x.volume)],
            ["TANGGAL", x.date],
            ["STATUS", <Badge key="b" status={x.status} />],
          ]}
        />,
      );
    }
  };
}
