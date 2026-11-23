"use client";
/* Aksi & modal dashboard petani/tengkulak (port newStock, updateStockRemaining, newOffer, offerDetail, trxDetail,
   counterOffer, actions() dan handleForm() dari app.js). Isi modal dirender oleh UIProvider (di luar
   RoleDataProvider), jadi semua data/aksi diteruskan lewat props/closure, bukan context. */
import type { FormEvent } from "react";
import { showAlert, showConfirm } from "@/lib/dialog";
import { Icon } from "@/components/Icon";
import { useUI } from "@/components/UIProvider";
import { useRole } from "./RoleDataProvider";
import { availability, Badge, Btn, fmtTime, number, prettyDate, rupiah, selectors, totalPrice } from "./common";
import type { Offer, RoleState, Stock } from "./types";

export function useRoleActions() {
  const { isFarmer, getDb, mutate, navigate, base } = useRole();
  const { openModal, closeModal, toast } = useUI();
  const sel = () => selectors(getDb() as RoleState, isFarmer);
  const me = () => (getDb() as RoleState).actor.user; // ID pengguna yang sedang login
  const enc = encodeURIComponent;

  /* ---------- Stok (petani) ---------- */
  const harvestLabel = (d: string) => new Date(d + "T00:00:00+07:00").toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });

  /** Tambah Stok: cukup tanggal panen dan volume. Panen di tanggal yang sama digabung oleh server. */
  function newStock() {
    if (!isFarmer) return;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    const submit = (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      const volume = Number(data.get("volume"));
      const harvest = String(data.get("harvest") || "");
      if (!harvest) return toast("Tanggal panen wajib diisi.");
      if (!Number.isFinite(volume) || volume <= 0) return toast("Volume stok harus lebih dari 0 kg.");
      mutate("/stocks", { method: "POST", body: { volume, harvest } });
    };
    openModal(
      "Tambah Stok Gabah",
      "Catat hasil panen baru Anda.",
      <form key="stock-new" onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="stockDate">Tanggal panen</label>
            <input id="stockDate" name="harvest" type="date" max={today} defaultValue={today} required />
          </div>
          <div className="field">
            <label htmlFor="stockVolume">Volume stok (kg)</label>
            <input id="stockVolume" type="number" name="volume" min="1" step="1" placeholder="Contoh: 2500" required />
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={closeModal}>Batal</button>
          <button className="btn primary" type="submit">Tambah Stok</button>
        </div>
      </form>,
    );
  }

  /** Perbarui Stok: ubah sisa stok untuk tiap tanggal panen. */
  function updateStockRemaining() {
    if (!isFarmer) return;
    // Sisa stok per tanggal panen (tabel stock_batches di server).
    const lots = ((getDb() as RoleState).batches || []).filter((x) => x.volume > 0).slice().sort((a, b) => a.harvest.localeCompare(b.harvest));
    const submit = (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      const items: { id: string; volume: number }[] = [];
      for (const lot of lots) {
        const v = Number(data.get("v_" + lot.id));
        if (!Number.isFinite(v) || v < 0) return toast(`Sisa stok panen ${harvestLabel(lot.harvest)} tidak valid.`);
        if (Math.abs(v - lot.volume) > 1e-8) items.push({ id: lot.id, volume: v });
      }
      if (!items.length) return toast("Tidak ada perubahan stok.");
      mutate("/stocks/remaining", { method: "PUT", body: { items } });
    };
    openModal(
      "Perbarui Stok Gabah",
      "Ubah sisa stok untuk setiap tanggal panen. Isi 0 bila stok panen tersebut sudah habis.",
      lots.length ? (
        <form key="stock-remaining" onSubmit={submit}>
          <div className="stock-edit-list">
            <div className="stock-edit-head">
              <span>Tanggal panen</span>
              <span>Sisa stok (kg)</span>
            </div>
            {lots.map((lot) => (
              <div className="stock-edit-row" key={lot.id}>
                <label htmlFor={"v_" + lot.id}>
                  <strong>Panen {harvestLabel(lot.harvest)}</strong>
                  <small>Tercatat {number(lot.volume)} kg</small>
                </label>
                <input id={"v_" + lot.id} name={"v_" + lot.id} type="number" min="0" step="1" defaultValue={lot.volume} required />
              </div>
            ))}
          </div>
          <div className="form-actions">
            <button type="button" className="btn" onClick={closeModal}>Batal</button>
            <button className="btn primary" type="submit">Simpan Perubahan</button>
          </div>
        </form>
      ) : (
        <div key="stock-remaining-empty">
          <div className="empty-state">Belum ada stok untuk diperbarui. Tambahkan hasil panen terlebih dahulu.</div>
          <div className="form-actions">
            <button type="button" className="btn" onClick={closeModal}>Tutup</button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                closeModal();
                newStock();
              }}
            >
              Tambah Stok
            </button>
          </div>
        </div>
      ),
    );
  }

  /* ---------- Penawaran baru (tengkulak) ---------- */
  function newOffer(id: string) {
    if (isFarmer) return;
    const S = sel();
    const s = S.stock(id);
    if (!s || s.status !== "Tersedia" || availability(s) <= 0) return toast("Stok tidak lagi tersedia.");
    const f = S.farmer(s.farmerId);
    const submit = (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      const cur = sel();
      const st: Stock | undefined = cur.stock(s.id);
      const qty = Number(data.get("volume"));
      const price = Number(data.get("price"));
      if (st && st.status === "Tersedia" && qty > 0 && availability(st) + 1e-8 < qty) {
        void showAlert({
          title: "Volume melebihi stok",
          message: `Volume yang Anda tawarkan (${number(qty)} kg) melebihi stok tersedia (${number(availability(st))} kg ${st.type}). Kurangi volume penawaran Anda.`,
        });
        return;
      }
      if (!st || st.status !== "Tersedia" || availability(st) + 1e-8 < qty || qty <= 0 || !Number.isFinite(price) || price <= 0)
        return toast("Data penawaran tidak valid atau stok tidak mencukupi.");
      mutate("/offers", {
        body: { stockId: st.id, volume: qty, price: Math.round(price) },
        before: () => navigate("penawaran"),
        onError: (er) => {
          if (er.status === 409 && er.message.startsWith("Volume yang Anda tawarkan")) {
            void showAlert({ title: "Volume melebihi stok", message: er.message + " Kurangi volume penawaran Anda." });
            return true;
          }
          return false;
        },
      });
    };
    openModal(
      "Ajukan Penawaran Harga",
      `Stok ${s.id} • ${f?.name} • ${s.region}`,
      <>
        <div className="notice-card" style={{ marginBottom: 16 }}>
          <Icon name="wheat" size={17} />{" "}
          <b>
            {number(availability(s))} kg {s.type}
          </b>{" "}
          tersedia di {s.region} · Estimasi panen {prettyDate(s.harvest)}
          <div className="detail-sub">Tidak ada harga indikatif petani. Anda menentukan harga penawaran pertama.</div>
        </div>
        <form key={"offer-" + s.id} onSubmit={submit}>
          <div className="form-grid">
            <div className="field">
              <label>Volume ditawarkan (kg)</label>
              <input name="volume" type="number" step="1" min="1" max={availability(s)} required placeholder="Contoh: 2000" />
            </div>
            <div className="field">
              <label>Harga pertama Anda (Rp/kg)</label>
              <input name="price" type="number" step="1" min="1" required placeholder="Contoh: 6800" />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn" onClick={closeModal}>Batal</button>
            <button className="btn primary" type="submit">
              <Icon name="send" size={15} /> Kirim Penawaran
            </button>
          </div>
        </form>
      </>,
    );
  }

  /* ---------- Harga balik / tawar lagi ---------- */
  function counterOffer(id: string) {
    const S = sel();
    const o = (getDb() as RoleState).offers.find((x) => x.id === id);
    if (!o || !S.myOffers().includes(o)) return;
    const expected = isFarmer ? "Menunggu Petani" : "Penawaran Balik";
    if (o.status !== expected) return toast("Status penawaran sudah berubah.");
    const submit = (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      const cur = (getDb() as RoleState).offers.find((x) => x.id === o.id);
      const p = Number(data.get("price"));
      if (!cur || !Number.isFinite(p) || p <= 0) return toast("Harga belum valid.");
      if (isFarmer) {
        if (cur.farmerId !== me() || cur.status !== "Menunggu Petani") return toast("Penawaran tidak bisa diubah.");
        if (p <= cur.currentBid) {
          void showAlert({ title: "Harga balik terlalu rendah", message: `Harga balik harus lebih tinggi dari harga yang diajukan pembeli (${rupiah(cur.currentBid)}/kg).` });
          return;
        }
      } else {
        if (cur.buyerId !== me() || cur.status !== "Penawaran Balik") return toast("Penawaran tidak bisa diubah.");
        if (p < cur.initialBid) {
          void showAlert({ title: "Harga terlalu rendah", message: `Harga Anda tidak boleh lebih rendah dari penawaran pertama Anda (${rupiah(cur.initialBid)}/kg).` });
          return;
        }
      }
      const send = () =>
        mutate(`/offers/${enc(cur.id)}/counter`, {
          body: { price: Math.round(p) },
          onError: (er) => {
            if (er.status === 400) {
              void showAlert({ title: "Harga belum bisa dikirim", message: er.message });
              return true;
            }
            return false;
          },
        });
      if (!isFarmer && p > (cur.counter || 0)) {
        showConfirm({
          title: "Harga Anda di atas harga petani",
          message: `Petani meminta ${rupiah(cur.counter)}/kg. Yakin memberi harga ${rupiah(p)}/kg? Sebaiknya terima saja harga balik petani.`,
          confirmLabel: "Tetap kirim",
          tone: "warning",
        }).then((ok) => {
      if (ok) void send();
    });
        return;
      }
      send();
    };
    openModal(
      isFarmer ? "Ajukan Harga Balik" : "Ajukan Harga Baru",
      `Penawaran ${o.id} • ${number(o.volume)} kg ${S.stock(o.stockId)?.type}`,
      <form key={"counter-" + o.id} onSubmit={submit}>
        <div className="form-grid">
          <div className="field span-2">
            <label>Harga yang Anda ajukan (Rp/kg)</label>
            <input name="price" type="number" min="1" step="1" required placeholder="Contoh: 7000" />
          </div>
          <div className="span-2 field-note">
            {isFarmer ? (
              <>
                Harga balik harus lebih tinggi dari penawaran pembeli: <b>{rupiah(o.currentBid)}/kg</b>.
              </>
            ) : (
              <>
                Harga balik petani: <b>{rupiah(o.counter)}/kg</b>. Harga Anda tidak boleh lebih rendah dari penawaran pertama Anda: <b>{rupiah(o.initialBid)}/kg</b>.
              </>
            )}
          </div>
          {isFarmer ? (
            <div className="span-2 notice-positive">
              Harga referensi AI untuk petani: <b>{rupiah(o.aiRef)}/kg</b>. Anda bebas menentukan harga balik.
            </div>
          ) : null}
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={closeModal}>Batal</button>
          <button className="btn primary" type="submit">Kirim {isFarmer ? "Harga Balik" : "Penawaran Baru"}</button>
        </div>
      </form>,
    );
  }

  /* ---------- Aksi konfirmasi ---------- */
  function acceptOffer(id: string) {
    if (!isFarmer) return;
    const o = (getDb() as RoleState).offers.find((x) => x.id === id && x.farmerId === me() && x.status === "Menunggu Petani");
    if (!o) return;
    showConfirm({
      title: "Terima penawaran ini?",
      message: `Harga ${rupiah(o.currentBid)}/kg untuk ${number(o.volume)} kg. Kesepakatan langsung tercatat dan stok Anda berkurang.`,
      confirmLabel: "Terima harga",
      tone: "success",
      mascot: "panen",
    }).then((ok) => {
      if (ok) void mutate(`/offers/${enc(id)}/accept`);
    });
  }
  function rejectOffer(id: string) {
    if (!isFarmer) return;
    const o = (getDb() as RoleState).offers.find((x) => x.id === id && x.farmerId === me() && x.status === "Menunggu Petani");
    if (!o) return;
    showConfirm({
      title: "Tolak penawaran ini?",
      message: `Penawaran ${rupiah(o.currentBid)}/kg untuk ${number(o.volume)} kg akan ditolak dan negosiasi berakhir.`,
      confirmLabel: "Tolak penawaran",
      tone: "danger",
    }).then((ok) => {
      if (ok) void mutate(`/offers/${enc(id)}/reject`);
    });
  }
  function acceptCounter(id: string) {
    if (isFarmer) return;
    const o = (getDb() as RoleState).offers.find((x) => x.id === id && x.buyerId === me() && x.status === "Penawaran Balik");
    if (!o) return;
    showConfirm({
      title: "Setujui harga balik petani?",
      message: `Harga ${rupiah(o.counter)}/kg untuk ${number(o.volume)} kg. Kesepakatan langsung tercatat.`,
      confirmLabel: "Setujui harga",
      tone: "success",
      mascot: "panen",
    }).then((ok) => {
      if (ok) void mutate(`/offers/${enc(id)}/accept-counter`);
    });
  }
  /* ---------- Detail penawaran ---------- */
  function offerDetail(id: string) {
    const S = sel();
    const o: Offer | undefined = (getDb() as RoleState).offers.find((x) => x.id === id);
    if (!o || !S.myOffers().includes(o)) return toast("Penawaran tidak ditemukan.");
    const s = S.stock(o.stockId), far = S.farmer(o.farmerId), buy = S.buyer(o.buyerId);
    const editable = (isFarmer && o.status === "Menunggu Petani") || (!isFarmer && o.status === "Penawaran Balik");
    const priceInfo = isFarmer ? (
      <div className="metric-row">
        <div className="metric-small"><small>Harga Penawaran Pembeli</small><strong>{rupiah(o.currentBid)}</strong></div>
        <div className="metric-small"><small>Harga Referensi AI</small><strong>{rupiah(o.aiRef)}</strong></div>
        <div className="metric-small"><small>Harga Balik Anda</small><strong>{o.counter ? rupiah(o.counter) : "—"}</strong></div>
      </div>
    ) : (
      <div className="metric-row">
        <div className="metric-small"><small>Penawaran Pertama Anda</small><strong>{rupiah(o.initialBid)}</strong></div>
        <div className="metric-small"><small>Harga Penawaran Terakhir</small><strong>{rupiah(o.currentBid)}</strong></div>
        <div className="metric-small"><small>Harga Balik Petani</small><strong>{o.counter ? rupiah(o.counter) : "—"}</strong></div>
      </div>
    );
    let actions = null;
    if (isFarmer && editable)
      actions = (
        <>
          <div className="divider" />
          <div className="notice-positive">
            Referensi AI: <b>{rupiah(o.aiRef)}/kg</b>. Nilai ini hanya pertimbangan, bukan harga jual wajib.
          </div>
          <div className="form-actions">
            <Btn cl="danger" onClick={() => rejectOffer(o.id)}>Tolak Penawaran</Btn>
            <Btn cl="secondary" onClick={() => counterOffer(o.id)}>Ajukan Harga Balik</Btn>
            <Btn cl="primary" onClick={() => acceptOffer(o.id)}>{"Terima Harga " + rupiah(o.currentBid)}</Btn>
          </div>
        </>
      );
    if (!isFarmer && editable)
      actions = (
        <>
          <div className="divider" />
          <div className="notice-card">
            Petani mengajukan harga balik <b>{rupiah(o.counter)}/kg</b>. Anda dapat menerima atau mengajukan harga baru.
          </div>
          <div className="form-actions">
            <Btn cl="secondary" onClick={() => counterOffer(o.id)}>Tawar Lagi</Btn>
            <Btn cl="primary" onClick={() => acceptCounter(o.id)}>{"Setujui " + rupiah(o.counter)}</Btn>
          </div>
        </>
      );
    openModal(
      "Detail " + o.id,
      `${number(o.volume)} kg ${s?.type} • ${s?.region} • ${isFarmer ? buy?.label : far?.name}`,
      <>
        <div className="price-block">
          <div>
            <small>Status negosiasi</small>
            <Badge s={o.status} />
          </div>
          <div>
            <small>Volume ditawar</small>
            <span className="quote-amount">
              {number(o.volume)} kg {s?.type}
            </span>
          </div>
        </div>
        <div className="divider" />
        {priceInfo}
        <div className="divider" />
        <h3 className="section-title">Riwayat Negosiasi</h3>
        <div className="timeline">
          {o.history.map((x, i) => (
            <div className="timeline-item" key={i}>
              <strong>{x.label}</strong>
              <small>
                {fmtTime(x.at)} · {x.actor}
                {x.price ? " · " + rupiah(x.price) + "/kg" : ""}
              </small>
            </div>
          ))}
        </div>
        {actions}
      </>,
    );
  }

  /* ---------- Detail transaksi ---------- */
  function trxDetail(id: string) {
    const S = sel();
    const t = (getDb() as RoleState).transactions.find((x) => x.id === id);
    if (!t || !S.myTransactions().includes(t)) return toast("Transaksi tidak ditemukan.");
    const s = S.stock(t.stockId), far = S.farmer(t.farmerId), buy = S.buyer(t.buyerId);
    const other = isFarmer ? buy?.label : far?.name;
    const wa = t.contact ? "https://wa.me/62" + t.contact.replace(/^0/, "") : null;
    openModal(
      "Detail Kesepakatan " + t.id,
      `${s?.type} • ${s?.region} • Kesepakatan harga`,
      <>
        <div className="metric-row">
          <div className="metric-small"><small>Volume</small><strong>{number(t.volume)} kg</strong></div>
          <div className="metric-small"><small>Harga akhir</small><strong>{rupiah(t.price)}</strong></div>
          <div className="metric-small"><small>Total disepakati</small><strong>{totalPrice(t.volume, t.price)}</strong></div>
        </div>
        <div className="divider" />
        <div className="modal-grid">
          <div className="modal-item"><label>Petani</label><strong>{far?.name}</strong></div>
          <div className="modal-item"><label>Pembeli</label><strong>{buy?.label}</strong></div>
          <div className="modal-item"><label>ID Penawaran</label><strong>{t.offerId}</strong></div>
          <div className="modal-item"><label>Kontak {isFarmer ? "Pembeli" : "Petani"}</label><strong>{t.contact || "Tidak tersedia"}</strong></div>
          <div className="modal-item"><label>Tanggal Kesepakatan</label><strong>{prettyDate(t.date)}</strong></div>
          <div className="modal-item"><label>Lokasi</label><strong>{s?.region}</strong></div>
        </div>
        <div className="divider" />
        <div className="notice-card">
          Pembayaran dan serah terima gabah dilakukan langsung antara petani dan pembeli di luar Temu Tani. Hubungi {other || "lawan transaksi"} untuk
          menyepakati cara bayar dan jadwal pengambilan.
        </div>
        {wa ? (
          <div className="form-actions">
            <a className="btn primary" href={wa} target="_blank" rel="noopener noreferrer">
              <Icon name="phone" size={15} /> Hubungi via WhatsApp
            </a>
          </div>
        ) : null}
      </>,
    );
  }

  /* ---------- Notifikasi ---------- */
  function notifications() {
    const db = getDb();
    if (!db) return;
    const S = selectors(db, isFarmer);
    openModal(
      "Notifikasi",
      "Ringkasan aktivitas yang memerlukan perhatian",
      <div className="card-stack">
        {isFarmer ? (
          <>
            <div className="notice-card">{S.myOffers().filter((o) => o.status === "Menunggu Petani").length} penawaran menunggu keputusan Anda.</div>
            <div className="notice-card">{S.myOffers().filter((o) => o.status === "Penawaran Balik").length} penawaran sedang dinegosiasikan.</div>
          </>
        ) : (
          <>
            <div className="notice-card">{S.myOffers().filter((o) => o.status === "Penawaran Balik").length} harga balik petani menunggu respons.</div>
            <div className="notice-card">{S.myOffers().filter((o) => o.status === "Menunggu Petani").length} penawaran menunggu respons petani.</div>
          </>
        )}
      </div>,
    );
  }

  return { newStock, updateStockRemaining, newOffer, offerDetail, trxDetail, counterOffer, notifications, navigate, base };
}
