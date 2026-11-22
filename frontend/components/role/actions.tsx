"use client";
/* Aksi & modal dashboard petani/tengkulak (port newStock, newRequest, newOffer, offerDetail, trxDetail,
   counterOffer, actions() dan handleForm() dari app.js). Isi modal dirender oleh UIProvider (di luar
   RoleDataProvider), jadi semua data/aksi diteruskan lewat props/closure, bukan context. */
import type { FormEvent } from "react";
import { Icon } from "@/components/Icon";
import { useUI } from "@/components/UIProvider";
import { useRole } from "./RoleDataProvider";
import { availability, Badge, Btn, fmtTime, number, prettyDate, rupiah, selectors, totalPrice } from "./common";
import type { Offer, RoleState, Stock } from "./types";

export function useRoleActions() {
  const { isFarmer, getDb, mutate, ui, setUi, navigate, base } = useRole();
  const { openModal, closeModal, toast } = useUI();
  const sel = () => selectors(getDb() as RoleState, isFarmer);
  const me = () => (getDb() as RoleState).actor.user; // ID pengguna yang sedang login
  const enc = encodeURIComponent;

  /* ---------- Stok (petani) ---------- */
  function newStock(id = "") {
    if (!isFarmer) return;
    const s = id ? sel().stock(id) ?? null : null;
    if (s && s.farmerId !== me()) return;
    const committed = s ? s.volume - availability(s) : 0;
    const submit = (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      const cur = s ? sel().stock(s.id) ?? s : null;
      const volume = Number(data.get("volume"));
      const comm = cur ? cur.volume - availability(cur) : 0;
      if (!Number.isFinite(volume) || volume <= 0 || volume + 1e-8 < comm)
        return toast("Volume harus positif dan tidak kurang dari volume yang telah disepakati.");
      if (cur && cur.farmerId !== me()) return;
      const body = {
        type: "GKP",
        volume,
        harvest: String(data.get("harvest")),
        status: String(data.get("status")),
        moisture: Number(data.get("moisture")) || null,
      };
      mutate(cur ? `/stocks/${enc(cur.id)}` : "/stocks", { method: cur ? "PUT" : "POST", body });
    };
    openModal(
      s ? "Perbarui Stok Gabah" : "Tambah Stok Gabah",
      (() => {
        const f = sel().myFarmer();
        return f ? `Semua stok otomatis terkait ${f.name} • ${f.village}, ${f.region}` : "Stok otomatis terkait akun Anda";
      })(),
      <form key={"stock-" + (s?.id || "new")} onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="stockType">Jenis gabah</label>
            {/* Hanya GKP (Gabah Kering Panen) yang didukung. */}
            <input id="stockType" value="GKP (Gabah Kering Panen)" readOnly disabled />
            <input type="hidden" name="type" value="GKP" />
          </div>
          <div className="field">
            <label htmlFor="stockVolume">Volume stok total (kg)</label>
            <input id="stockVolume" type="number" name="volume" min={Math.max(committed, 1)} step="1" defaultValue={s?.volume || ""} placeholder="Contoh: 2500" required />
          </div>
          <div className="field">
            <label htmlFor="stockDate">Tanggal panen / tersedia</label>
            <input id="stockDate" name="harvest" type="date" defaultValue={s?.harvest || "2026-11-12"} required />
          </div>
          <div className="field">
            <label htmlFor="stockStatus">Status stok</label>
            <select id="stockStatus" name="status" defaultValue={s?.status || "Tersedia"}>
              <option>Tersedia</option>
              <option>Akan Panen</option>
              <option>Ditutup</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="stockMoisture">Kadar air (%) — opsional</label>
            <input id="stockMoisture" type="number" min="0" max="100" step="0.1" name="moisture" defaultValue={s?.moisture || ""} placeholder="Contoh: 24" />
          </div>
          <div className="span-2 field-note">Stok yang sudah disepakati: {number(committed)} kg. Volume total tidak boleh lebih kecil dari jumlah ini.</div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={closeModal}>Batal</button>
          <button className="btn primary" type="submit">{s ? "Simpan Perubahan" : "Tambah Stok"}</button>
        </div>
      </form>,
    );
  }

  /* ---------- Permintaan (tengkulak) ---------- */
  function newRequest() {
    if (isFarmer) return;
    const submit = (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      const volume = Number(data.get("volume"));
      if (!Number.isFinite(volume) || volume <= 0) return toast("Volume tidak valid.");
      const region = String(data.get("region") || "").trim();
      if (region.length < 2) return toast("Kota/kabupaten tujuan wajib diisi.");
      const body = { type: "GKP", region, volume, needed: String(data.get("needed")) };
      mutate("/requests", {
        body,
        before: (res) => {
          setUi({ area: body.region, type: body.type, requested: res.id || "", query: "" });
          navigate("stok");
        },
      });
    };
    openModal(
      "Ajukan Kebutuhan Gabah",
      "Permintaan digunakan untuk mencari stok yang sesuai tanpa menampilkan harga petani.",
      <form key="request" onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>Jenis gabah</label>
            <input value="GKP (Gabah Kering Panen)" readOnly disabled />
          </div>
          <div className="field">
            <label>Jumlah yang dibutuhkan (kg)</label>
            <input type="number" min="1" step="1" name="volume" required placeholder="Contoh: 8000" />
          </div>
          <div className="field">
            <label>Kota/kabupaten tujuan</label>
            {/* Pilihan diambil dari wilayah yang punya stok; boleh juga mengetik wilayah lain. */}
            <input name="region" list="requestRegions" required minLength={2} maxLength={60} placeholder="Contoh: Garut" />
            <datalist id="requestRegions">
              {sel().regions().map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label>Batas kebutuhan</label>
            <input type="date" name="needed" defaultValue="2026-11-15" required />
          </div>
          <div className="span-2 field-note">
            Setelah menyimpan, Anda akan diarahkan ke daftar stok yang sesuai. Penawaran dikirim per petani, dan Anda menentukan harganya terlebih dahulu.
          </div>
        </div>
        <div className="form-actions">
          <button className="btn" type="button" onClick={closeModal}>Batal</button>
          <button className="btn primary" type="submit">Simpan &amp; Cari Stok</button>
        </div>
      </form>,
    );
  }

  /* ---------- Penawaran baru (tengkulak) ---------- */
  function newOffer(id: string) {
    if (isFarmer) return;
    const db = getDb() as RoleState;
    const S = sel();
    const s = S.stock(id);
    if (!s || s.status !== "Tersedia" || availability(s) <= 0) return toast("Stok tidak lagi tersedia.");
    const f = S.farmer(s.farmerId);
    const requests = db.requests.filter((r) => r.buyerId === me() && r.region === s.region && r.type === s.type);
    const submit = (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      const cur = sel();
      const st: Stock | undefined = cur.stock(s.id);
      const qty = Number(data.get("volume"));
      const price = Number(data.get("price"));
      if (st && st.status === "Tersedia" && qty > 0 && availability(st) + 1e-8 < qty) {
        alert(`Volume yang Anda tawarkan (${number(qty)} kg) melebihi stok tersedia (${number(availability(st))} kg ${st.type}).\n\nKurangi volume penawaran Anda.`);
        return;
      }
      if (!st || st.status !== "Tersedia" || availability(st) + 1e-8 < qty || qty <= 0 || !Number.isFinite(price) || price <= 0)
        return toast("Data penawaran tidak valid atau stok tidak mencukupi.");
      const reqId = String(data.get("requestId") || "");
      const req = (getDb() as RoleState).requests.find((r) => r.id === reqId && r.buyerId === me());
      if (req && (req.region !== st.region || req.type !== st.type)) return toast("Permintaan tidak sesuai lokasi atau jenis gabah.");
      mutate("/offers", {
        body: { stockId: st.id, volume: qty, price: Math.round(price), requestId: req ? req.id : null },
        before: () => navigate("penawaran"),
        onError: (er) => {
          if (er.status === 409 && er.message.startsWith("Volume yang Anda tawarkan")) {
            alert(er.message + "\n\nKurangi volume penawaran Anda.");
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
            <div className="field span-2">
              <label>Permintaan kebutuhan (opsional)</label>
              <select name="requestId" defaultValue={requests.some((r) => r.id === ui.requested) ? ui.requested : ""}>
                <option value="">Buat permintaan baru otomatis</option>
                {requests.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id} • {number(r.volume)} kg {r.type} • {r.region}
                  </option>
                ))}
              </select>
            </div>
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
          alert(`Harga balik harus lebih tinggi dari harga yang diajukan pembeli (${rupiah(cur.currentBid)}/kg).`);
          return;
        }
      } else {
        if (cur.buyerId !== me() || cur.status !== "Penawaran Balik") return toast("Penawaran tidak bisa diubah.");
        if (p < cur.initialBid) {
          alert(`Harga Anda tidak boleh lebih rendah dari penawaran pertama Anda (${rupiah(cur.initialBid)}/kg).`);
          return;
        }
        if (p > (cur.counter || 0) && !confirm(`Petani memberi harga ${rupiah(cur.counter)}/kg, apakah Anda yakin memberi harga balik ${rupiah(p)}/kg?`)) return;
      }
      mutate(`/offers/${enc(cur.id)}/counter`, {
        body: { price: Math.round(p) },
        onError: (er) => {
          if (er.status === 400) {
            alert(er.message);
            return true;
          }
          return false;
        },
      });
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
    if (o && confirm("Terima harga " + rupiah(o.currentBid) + "/kg untuk " + number(o.volume) + " kg?")) mutate(`/offers/${enc(id)}/accept`);
  }
  function rejectOffer(id: string) {
    if (!isFarmer) return;
    const o = (getDb() as RoleState).offers.find((x) => x.id === id && x.farmerId === me() && x.status === "Menunggu Petani");
    if (o && confirm("Tolak penawaran ini?")) mutate(`/offers/${enc(id)}/reject`);
  }
  function acceptCounter(id: string) {
    if (isFarmer) return;
    const o = (getDb() as RoleState).offers.find((x) => x.id === id && x.buyerId === me() && x.status === "Penawaran Balik");
    if (o && confirm("Setujui harga balik " + rupiah(o.counter) + "/kg?")) mutate(`/offers/${enc(id)}/accept-counter`);
  }
  function markPaid(id: string) {
    if (isFarmer) return;
    const t = (getDb() as RoleState).transactions.find((x) => x.id === id && x.buyerId === me() && x.payment === "Belum Dibayar");
    if (t && confirm("Anda sudah benar-benar melakukan transfer di luar aplikasi?")) mutate(`/transactions/${enc(id)}/mark-paid`);
  }
  function verifyPayment(id: string) {
    if (!isFarmer) return;
    const t = (getDb() as RoleState).transactions.find((x) => x.id === id && x.farmerId === me() && x.payment === "Menunggu Verifikasi");
    if (t && confirm("Apakah dana benar-benar sudah masuk ke rekening Anda?")) mutate(`/transactions/${enc(id)}/verify`);
  }
  function searchRequest(id: string) {
    if (isFarmer) return;
    const r = (getDb() as RoleState).requests.find((x) => x.id === id && x.buyerId === me());
    if (!r) return;
    setUi({ requested: r.id, area: r.region, type: r.type, query: "", status: "Semua Status" });
    navigate("stok");
    toast("Menampilkan stok yang sesuai " + r.id);
  }
  function resetDemo() {
    if (confirm("Kembalikan seluruh data simulasi seperti semula di server?")) mutate("/demo/reset", { success: "Data simulasi dikembalikan." });
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
    let actions = null;
    if (isFarmer && t.payment === "Menunggu Verifikasi")
      actions = (
        <>
          <div className="notice-positive">Pembeli menyatakan telah melakukan transfer. Pastikan dana benar-benar diterima sebelum mengonfirmasi.</div>
          <div className="form-actions">
            <Btn cl="primary" onClick={() => verifyPayment(t.id)}>Konfirmasi Dana Diterima</Btn>
          </div>
        </>
      );
    if (!isFarmer && t.payment === "Belum Dibayar")
      actions = (
        <>
          <div className="notice-card">Setelah mengirim uang melalui metode yang disepakati di luar aplikasi, Anda dapat melaporkan bahwa transfer telah dilakukan.</div>
          <div className="form-actions">
            <Btn cl="primary" onClick={() => markPaid(t.id)}>Saya Sudah Transfer</Btn>
          </div>
        </>
      );
    openModal(
      "Detail Transaksi " + t.id,
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
          <div className="modal-item"><label>Status Pembayaran</label><Badge s={t.payment} /></div>
          <div className="modal-item"><label>Tanggal Kesepakatan</label><strong>{prettyDate(t.date)}</strong></div>
          <div className="modal-item"><label>Lokasi</label><strong>{s?.region}</strong></div>
        </div>
        <div className="divider" />
        {actions || <div className="notice-card">Tidak ada tindakan pembayaran yang diperlukan pada status ini.</div>}
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
            <div className="notice-card">{S.myTransactions().filter((t) => t.payment === "Menunggu Verifikasi").length} pembayaran menunggu konfirmasi.</div>
          </>
        ) : (
          <>
            <div className="notice-card">{S.myOffers().filter((o) => o.status === "Penawaran Balik").length} harga balik petani menunggu respons.</div>
            <div className="notice-card">{S.myTransactions().filter((t) => t.payment === "Belum Dibayar").length} transaksi belum ditandai transfer.</div>
          </>
        )}
        <button className="btn" type="button" onClick={resetDemo}>
          <Icon name="refresh" size={16} /> Reset data simulasi
        </button>
      </div>,
    );
  }

  return { newStock, newRequest, newOffer, offerDetail, trxDetail, counterOffer, searchRequest, notifications, navigate, base };
}
