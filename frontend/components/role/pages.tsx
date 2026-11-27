"use client";
/* Halaman dashboard petani/tengkulak: overview, stok, penawaran, transaksi (port app.js bagian 5). */
import { useEffect, useState } from "react";
import { EscrowPill } from "@/components/escrow/EscrowDetail";
import { showAlert } from "@/lib/dialog";
import { markSeen, unseenDone } from "@/lib/escrowSeen";
import { Icon } from "@/components/Icon";
import { SortSelect } from "@/components/SortSelect";
import { escrowNeedsAction, offerRank, sortRows, timeOf, trxRank } from "@/lib/sort";
import { useRoleActions } from "./actions";
import { useRole } from "./RoleDataProvider";
import {
  ActivityCard, availability, Badge, Btn, DataTable, fmtTime, kg, Kpi, number, PageHeader, Person, prettyDate, rupiah, selectors, totalPrice,
  type Selectors,
} from "./common";
import type { Offer, RoleState, Transaction } from "./types";

function useData() {
  const r = useRole();
  const db = r.db as RoleState;
  return { ...r, db, S: selectors(db, r.isFarmer), A: useRoleActions() };
}

/* ---------- Toolbar filter ---------- */
function Filters({ page }: { page: "stok" | "penawaran" | "transaksi" }) {
  const { isFarmer, ui, setUi, db } = useRole();
  const showRegion = !isFarmer && page === "stok";
  const regionOptions = db ? selectors(db, isFarmer).regions() : [];
  const statuses = ["Menunggu Petani", "Penawaran Balik", "Disepakati", "Ditolak", "Dibatalkan"];
  return (
    <div className="toolbar">
      <label className="search-box">
        <Icon name="search" size={16} />
        <input value={ui.query} onChange={(e) => setUi({ query: e.target.value })} placeholder="Cari ID, petani, lokasi..." aria-label="Cari data" />
      </label>
      {showRegion ? (
        <select className="select" aria-label="Filter kabupaten" value={ui.area} onChange={(e) => setUi({ area: e.target.value })}>
          <option value="Semua Wilayah">Semua Wilayah</option>
          {regionOptions.map((x) => (
            <option key={x} value={x}>{x}</option>
          ))}
        </select>
      ) : null}
      {page === "penawaran" ? (
        <select className="select" aria-label="Filter status" value={ui.status} onChange={(e) => setUi({ status: e.target.value })}>
          {["Semua Status", ...statuses].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      ) : null}
      {page !== "stok" ? <SortSelect value={ui.sort} onChange={(sort) => setUi({ sort })} /> : null}
    </div>
  );
}

/** Waktu aktivitas terakhir penawaran (langkah tawar terakhir, atau saat dibuat). */
const offerTime = (o: Offer) => Math.max(timeOf(o.created), ...o.history.map((h) => timeOf(h.at)));
/** Waktu perubahan terakhir kesepakatan: status escrow terakhir berubah, atau tanggal sepakat. */
const trxTime = (t: Transaction) => Math.max(timeOf(t.date), timeOf(t.escrowUpdated));

function useFiltered() {
  const { ui } = useRole();
  return function filtered<T extends object>(arr: T[], cb: (x: T) => string) {
    return arr
      .filter((x) => !ui.query || cb(x).toLowerCase().includes(ui.query.toLowerCase()))
      .filter((x) => ui.status === "Semua Status" || ("status" in x && x.status === ui.status));
  };
}

/* ---------- Tabel penawaran ---------- */
function OfferTable({ rows, S, isFarmer, onDetail }: { rows: Offer[]; S: Selectors; isFarmer: boolean; onDetail: (id: string) => void }) {
  const cols = isFarmer
    ? ["Penawaran / Pembeli", "Gabah", "Penawaran Awal", "Harga Balik", "Status", "Aktivitas Terakhir", "Aksi"]
    : ["Penawaran / Petani", "Gabah", "Penawaran Saya", "Harga Balik", "Status", "Aktivitas Terakhir", "Aksi"];
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{cols.map((x) => <th key={x}>{x}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((o) => {
              const s = S.stock(o.stockId);
              let action = <Btn onClick={() => onDetail(o.id)}>Lihat Detail</Btn>;
              if (isFarmer && o.status === "Menunggu Petani") action = <Btn cl="primary" onClick={() => onDetail(o.id)}>Tanggapi</Btn>;
              if (!isFarmer && o.status === "Penawaran Balik") action = <Btn cl="primary" onClick={() => onDetail(o.id)}>Tanggapi Balik</Btn>;
              return (
                <tr key={o.id}>
                  <td>
                    <strong>{o.id}</strong>
                    <small style={{ display: "block", color: "#98a49b", marginTop: 4 }}>{isFarmer ? S.buyer(o.buyerId)?.label : S.farmer(o.farmerId)?.name}</small>
                  </td>
                  <td>{number(o.volume)} kg {s?.type || "GKP"}</td>
                  <td>{rupiah(o.initialBid)}/kg</td>
                  <td>{o.counter ? rupiah(o.counter) + "/kg" : "—"}</td>
                  <td><Badge s={o.status} /></td>
                  <td style={{ whiteSpace: "nowrap" }}>{offerTime(o) ? fmtTime(new Date(offerTime(o)).toISOString()) : "—"}</td>
                  <td>{action}</td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={7}>
                <div className="empty-state">
                  <div><strong>Belum ada penawaran</strong>Penawaran akan tampil di sini.</div>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Overview ---------- */
export function OverviewPage() {
  const { db, S, A, isFarmer } = useData();
  if (isFarmer) {
    const me = S.myFarmer();
    const stocks = S.ownStock();
    // Sisa stok per tanggal panen (stock_batches), terbaru dulu. Satu baris "stocks" = total, jadi tidak dipakai untuk ringkasan.
    const lots = (db.batches || []).filter((b) => b.volume > 0).slice().sort((a, b) => b.harvest.localeCompare(a.harvest));
    const o = S.myOffers(), t = S.myTransactions();
    const total = stocks.filter((s) => s.status === "Tersedia").reduce((n, s) => n + availability(s), 0);
    const waiting = o.filter((a) => a.status === "Menunggu Petani");
    return (
      <>
        <PageHeader isFarmer title={`Selamat datang, ${me?.name || "Petani"}`} desc={`Ringkasan stok dan penawaran Anda di ${me?.region || "wilayah Anda"}.`} />
        <div className="demo-strip">
          <Icon name="info" size={17} /> Stok, penawaran, dan kesepakatan yang tampil hanya milik akun Anda. Harga AI di sini untuk referensi keputusan petani.
        </div>
        <div className="kpi-grid">
          <Kpi icon="wheat" title="Stok Siap Dijual" val={<>{number(total)} <span className="kpi-unit">kg</span></>} foot={lots.length + " tanggal panen tercatat"} />
          <Kpi icon="handshake" title="Penawaran Masuk" val={waiting.length} foot="Menunggu keputusan Anda" theme="gold" />
          <Kpi icon="activity" title="Sedang Dinegosiasikan" val={o.filter((a) => a.status === "Penawaran Balik").length} foot="Harga balik yang diajukan" theme="blue" />
          <Kpi icon="check" title="Kesepakatan" val={t.length} foot="Dibayar aman lewat escrow Temu Tani" theme="lime" />
        </div>
        <div className="page-banner card has-mascot">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="banner-mascot" src="/assets/maskot/cek-harga.webp" alt="" />
          <div>
            <strong>Harga gabah wajar {me?.region || ""}</strong>
            <p>
              {S.currentAI("GKP") != null
                ? "Referensi AI untuk membantu Anda mengevaluasi penawaran pembeli."
                : "Referensi harga AI belum tersedia untuk wilayah Anda (saat ini Garut dan Cianjur)."}
            </p>
          </div>
          <div className="banner-right">
            {S.currentAI("GKP") != null ? <span className="badge-light">GKP · {rupiah(S.currentAI("GKP"))}/kg</span> : null}
            <Btn cl="secondary" onClick={() => A.navigate("harga")}>Lihat Prediksi AI</Btn>
          </div>
        </div>
        <div className="two-col">
          <section className="card section-card">
            <div className="section-header">
              <div>
                <h3 className="section-title">Penawaran yang perlu ditanggapi</h3>
                <div className="section-subtitle">Penawaran hanya untuk stok milik Anda</div>
              </div>
            </div>
            {waiting.length ? (
              waiting.map((a) => (
                <div className="stock-row" key={a.id}>
                  <div>
                    <strong>{a.id} • {number(a.volume)} kg {S.stock(a.stockId)?.type}</strong>
                    <p>{S.buyer(a.buyerId)?.label || "Pembeli"} • Harga {rupiah(a.currentBid)}/kg</p>
                  </div>
                  <Btn cl="primary" onClick={() => A.offerDetail(a.id)}>Tanggapi</Btn>
                </div>
              ))
            ) : (
              <div className="empty-state">Tidak ada penawaran yang menunggu.</div>
            )}
          </section>
          <ActivityCard db={db} />
        </div>
        <div className="two-col">
          <section className="card section-card">
            <div className="section-header">
              <div>
                <h3 className="section-title">Ringkasan Stok Saya</h3>
                <div className="section-subtitle">
                  Total {number(total)} kg · {lots.length} tanggal panen di {me?.region || "wilayah Anda"}
                </div>
              </div>
              <Btn onClick={() => A.navigate("stok")}>Kelola Stok</Btn>
            </div>
            {lots.length ? (
              lots.slice(0, 5).map((b) => (
                <div className="stock-row" key={b.id}>
                  <div>
                    <strong>Panen {prettyDate(b.harvest)}</strong>
                    <p>GKP · Tersedia</p>
                  </div>
                  <span className="stock-meta">{number(b.volume)} kg</span>
                </div>
              ))
            ) : (
              <div className="empty-state">Belum ada stok. Tambahkan hasil panen Anda.</div>
            )}
            {lots.length > 5 ? <div className="table-foot-note">+{lots.length - 5} tanggal panen lainnya di menu Stok Gabah.</div> : null}
          </section>
          <section className="card section-card">
            <div className="section-header">
              <div>
                <h3 className="section-title">Kesepakatan Terbaru</h3>
                <div className="section-subtitle">Pembayaran dilakukan langsung dengan pembeli</div>
              </div>
              <Btn onClick={() => A.navigate("transaksi")}>Lihat Semua</Btn>
            </div>
            {t.length ? (
              t.slice().reverse().slice(0, 4).map((x) => (
                <div className="stock-row" key={x.id}>
                  <div>
                    <strong>{x.id} • {S.buyer(x.buyerId)?.label}</strong>
                    <p>{number(x.volume)} kg × {rupiah(x.price)}/kg = {totalPrice(x.volume, x.price)}</p>
                  </div>
                  <span className="stock-meta">{prettyDate(x.date)}</span>
                </div>
              ))
            ) : (
              <div className="empty-state">Belum ada kesepakatan.</div>
            )}
          </section>
        </div>
      </>
    );
  }

  const bOffers = S.myOffers(), t = S.myTransactions();
  const all = db.stocks.filter((s) => s.status === "Tersedia").reduce((n, s) => n + availability(s), 0);
  const active = bOffers.filter((o) => ["Menunggu Petani", "Penawaran Balik"].includes(o.status));
  const recent = bOffers.slice().reverse().slice(0, 5);
  return (
    <>
      <PageHeader isFarmer={false} title={`Selamat datang, ${S.myBuyer()?.label || "Pembeli"}`} desc="Cari gabah di berbagai wilayah dan kelola penawaran Anda." />
      <div className="demo-strip">
        <Icon name="info" size={17} /> Hanya penawaran dan kesepakatan milik akun Anda yang ditampilkan.
      </div>
      <div className="kpi-grid">
        <Kpi icon="handshake" title="Penawaran Saya" val={bOffers.length} foot="Seluruh penawaran yang Anda ajukan" />
        <Kpi icon="package" title="Stok Lintas Wilayah" val={<>{number(all)} <span className="kpi-unit">kg</span></>} foot="Gabah tersedia di semua kota/kabupaten" theme="lime" />
        <Kpi icon="clock" title="Dalam Proses Penawaran" val={active.length} foot="Menunggu petani / harga balik" theme="gold" />
        <Kpi icon="check" title="Kesepakatan" val={t.length} foot="Harga yang sudah disepakati" theme="blue" />
      </div>
      <div className="page-banner card has-mascot">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="banner-mascot" src="/assets/maskot/panen.webp" alt="" />
        <div>
          <strong>Butuh gabah untuk usaha Anda?</strong>
          <p>Bandingkan stok petani di berbagai kota/kabupaten, lalu ajukan harga pertama langsung dari menu Stok Gabah.</p>
        </div>
        <div className="banner-right">
          <Btn cl="secondary" onClick={() => A.navigate("stok")}>
            <Icon name="search" size={15} /> Cari Stok Gabah
          </Btn>
        </div>
      </div>
      <div className="two-col">
        <section className="card section-card">
          <div className="section-header">
            <div>
              <h3 className="section-title">Penawaran Saya</h3>
              <div className="section-subtitle">Perkembangan pengajuan harga kepada petani</div>
            </div>
            <Btn onClick={() => A.navigate("penawaran")}>Lihat Semua</Btn>
          </div>
          {recent.length ? (
            recent.map((o) => {
              const st = S.stock(o.stockId);
              const price = o.status === "Disepakati" ? o.agreedPrice ?? o.currentBid : o.status === "Penawaran Balik" ? o.counter ?? o.currentBid : o.currentBid;
              return (
                <div className="stock-row" key={o.id}>
                  <div>
                    <strong>{S.farmer(o.farmerId)?.name} • {number(o.volume)} kg {st?.type || "GKP"}</strong>
                    <p>{o.id} · {st?.region} · {rupiah(price)}/kg</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Badge s={o.status} />
                    <Btn onClick={() => A.offerDetail(o.id)}>Detail</Btn>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-state">Belum ada penawaran. Buka menu Stok Gabah untuk mengajukan harga.</div>
          )}
        </section>
        <ActivityCard db={db} />
      </div>
    </>
  );
}

/* ---------- Stok ---------- */
export function StocksPage() {
  const { isFarmer } = useData();
  return isFarmer ? <FarmerStockPage /> : <BuyerStockPage />;
}

/** Petani: ringkasan total stok fisik + riwayat perubahan (bukan daftar listing per panen). */
function FarmerStockPage() {
  const { db, S, A } = useData();
  const [showAll, setShowAll] = useState(false);
  const own = S.ownStock();
  const total = own.reduce((n, x) => n + x.volume, 0);
  const log = db.stockLog || [];
  const lots = (db.batches || []).filter((b) => b.volume > 0).slice().sort((x, y) => y.harvest.localeCompare(x.harvest));
  const rows = showAll ? log : log.slice(0, 8);
  const shortDate = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
  const harvestShort = (d: string) => new Date(d + "T00:00:00+07:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
  return (
    <>
      <PageHeader
        isFarmer
        title="Stok Gabah Saya"
        desc={`Pantau dan perbarui stok gabah Anda di ${S.myFarmer()?.region || "wilayah Anda"}.`}
        action={
          <span className="stock-head-icon" aria-hidden="true">
            <Icon name="wheat" size={24} />
          </span>
        }
      />
      <section className="card stock-panel">
        <h3 className="section-title">Ringkasan Stok Gabah</h3>
        <div className="stock-total">
          <div className="stock-total-top">
            <span>Total stok fisik saat ini</span>
            <Icon name="package" size={17} />
          </div>
          <strong>{kg(total)}</strong>
          <p>Jumlah gabah yang saat ini Anda miliki. Volume yang disepakati via Temu Tani otomatis dikurangi.</p>
        </div>
        {lots.length ? (
          <div className="stock-lots">
            <div className="stock-lots-head">
              <span>Sisa per tanggal panen</span>
              <span>{lots.length} tanggal</span>
            </div>
            {lots.map((b) => (
              <div className="stock-lot" key={b.id}>
                <span>Panen {harvestShort(b.harvest)}</span>
                <strong>{kg(b.volume)}</strong>
              </div>
            ))}
          </div>
        ) : null}
        <div className="stock-actions">
          <button type="button" className="btn primary" onClick={A.updateStockRemaining}>
            <Icon name="refresh" size={16} /> Perbarui Stok
          </button>
          <button type="button" className="btn" onClick={() => A.newStock()}>
            <Icon name="plus" size={16} /> Tambah Stok
          </button>
        </div>
        <div className="divider" />
        <div className="section-header">
          <h3 className="section-title">Riwayat Perubahan Stok</h3>
          <Icon name="history" size={18} />
        </div>
        {log.length ? (
          <div className="table-wrap">
            <table className="stock-log">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Aktivitas</th>
                  <th>Perubahan</th>
                  <th>Total Akhir</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.id}>
                    <td>{shortDate(x.at)}</td>
                    <td>
                      {x.activity}
                      {x.harvest ? <small className="stock-log-sub">Panen {harvestShort(x.harvest)}</small> : null}
                    </td>
                    <td className={x.delta >= 0 ? "delta-up" : "delta-down"}>
                      {x.delta >= 0 ? "+" : "−"}
                      {kg(Math.abs(x.delta))}
                    </td>
                    <td>{kg(x.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">Belum ada riwayat. Tambahkan stok pertama Anda.</div>
        )}
        <div className="stock-log-foot">
          <span>Riwayat ditampilkan dari yang terbaru.</span>
          {log.length > 8 ? (
            <button type="button" className="btn tiny" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Tampilkan lebih sedikit" : `Tampilkan semua (${log.length})`}
            </button>
          ) : null}
        </div>
      </section>
    </>
  );
}

/** Tengkulak: daftar stok lintas wilayah untuk diajukan harga. */
function BuyerStockPage() {
  const { db, S, A, ui } = useData();
  const my = false;
  const a = my ? S.ownStock() : db.stocks.filter((s) => s.status === "Tersedia" && availability(s) > 0);
  const b = a.filter((s) => my || ui.area === "Semua Wilayah" || s.region === ui.area);
  const list = b.filter((s) => !ui.query || [s.id, s.type, s.region, S.farmer(s.farmerId)?.name].join(" ").toLowerCase().includes(ui.query.toLowerCase()));
  return (
    <>
      <PageHeader
        isFarmer={false}
        title={my ? "Stok Gabah Saya" : "Stok Gabah"}
        desc={my ? `Kelola gabah milik Anda di ${S.myFarmer()?.region || "wilayah Anda"}.` : "Jelajahi stok gabah lintas wilayah. Harga awal ditentukan oleh pembeli saat mengajukan penawaran."}
      />
      <div className="info-strip">
        <Icon name="info" size={18} />{" "}
        {my
          ? "Petani hanya dapat menambah dan mengubah stok miliknya sendiri. Volume yang sudah disepakati tidak bisa dikurangi."
          : "Harga jual dan referensi AI tidak ditampilkan kepada pembeli sebelum penawaran. Pilih listing lalu tentukan harga Anda dalam Rp/kg."}
      </div>
      <Filters page="stok" />
      <DataTable
        columns={my ? ["ID Stok", "Jenis", "Tanggal Panen", "Stok Awal", "Tersedia", "Status", "Aksi"] : ["Petani", "Kota/Kabupaten", "Jenis", "Tanggal Panen", "Stok Tersedia", "Aksi"]}
        rows={list.map((s) =>
          my ? (
            <tr key={s.id}>
              <td><strong>{s.id}</strong></td>
              <td>{s.type}</td>
              <td>{prettyDate(s.harvest)}</td>
              <td>{number(s.volume)} kg</td>
              <td><strong>{number(availability(s))} kg</strong></td>
              <td><Badge s={s.status} /></td>
              <td>
                <Btn onClick={A.updateStockRemaining}>
                  <Icon name="edit" size={13} /> Ubah
                </Btn>
              </td>
            </tr>
          ) : (
            <tr key={s.id}>
              <td><Person f={S.farmer(s.farmerId)} /></td>
              <td><Icon name="location" size={13} /> {s.region}</td>
              <td>{s.type}</td>
              <td>{prettyDate(s.harvest)}</td>
              <td><strong>{number(availability(s))} kg</strong></td>
              <td><Btn cl="primary" onClick={() => A.newOffer(s.id)}>Ajukan Penawaran</Btn></td>
            </tr>
          ),
        )}
        footer={my ? "Stok tersedia = volume tercatat − volume yang sudah dialokasikan pada kesepakatan." : "Tampilan hanya memperlihatkan stok yang masih dapat ditawarkan. Harga indikatif petani tidak tersedia."}
      />
    </>
  );
}

/* ---------- Penawaran ---------- */
export function OffersPage() {
  const { S, A, isFarmer, ui } = useData();
  const filtered = useFiltered();
  const mine = S.myOffers();
  const a = sortRows(
    filtered(mine, (o) => [o.id, o.status, S.farmer(o.farmerId)?.name, S.buyer(o.buyerId)?.label, S.stock(o.stockId)?.type].join(" ")),
    ui.sort,
    (o) => offerRank(o.status, isFarmer),
    offerTime,
  );
  return (
    <>
      <PageHeader
        isFarmer={isFarmer}
        title="Penawaran & Negosiasi"
        desc={isFarmer ? "Tanggapi penawaran yang ditujukan kepada stok Anda, dengan referensi harga wajar AI." : "Pantau penawaran harga yang Anda ajukan dan respons dari masing-masing petani."}
      />
      <div className="info-strip">
        <Icon name="info" size={17} />{" "}
        {isFarmer
          ? "Harga wajar AI bersifat referensi untuk petani. Anda bebas menerima, menolak, atau mengajukan harga balik."
          : "Anda selalu mengajukan harga pertama. Harga referensi AI tidak ditampilkan pada halaman pembeli."}
      </div>
      <div className="kpi-grid cols-5">
        <Kpi icon="handshake" title="Total Penawaran" val={mine.length} foot="Seluruh penawaran milik Anda" />
        <Kpi icon="clock" title={isFarmer ? "Menunggu Respons Saya" : "Dalam Proses Penawaran"} val={mine.filter((o) => o.status === "Menunggu Petani").length} foot="Belum direspons" theme="gold" />
        <Kpi icon="activity" title="Penawaran Balik" val={mine.filter((o) => o.status === "Penawaran Balik").length} foot="Proses tawar-menawar" theme="blue" />
        <Kpi icon="check" title="Disepakati" val={mine.filter((o) => o.status === "Disepakati").length} foot="Berhasil mencapai harga akhir" theme="lime" />
        <Kpi icon="close" title="Dibatalkan" val={mine.filter((o) => o.status === "Dibatalkan").length} foot="Penawaran yang dibatalkan" theme="red" />
      </div>
      <Filters page="penawaran" />
      <div className="card table-card">
        <div className="section-header">
          <div>
            <h3 className="section-title">Daftar Penawaran</h3>
            <div className="section-subtitle">
              {ui.sort === "prioritas"
                ? "Yang menunggu respons Anda di atas, lalu aktivitas terbaru"
                : "Diurutkan dari aktivitas terbaru"}
            </div>
          </div>
        </div>
        <OfferTable rows={a} S={S} isFarmer={isFarmer} onDetail={A.offerDetail} />
        <div className="table-foot-note">Setiap penawaran ditujukan ke satu stok petani. Semua nominal harga dalam Rp/kg.</div>
      </div>
    </>
  );
}

/* ---------- Kesepakatan + escrow pembayaran ---------- */
export function TransactionsPage() {
  const { S, A, isFarmer, db, ui } = useData();
  // Kembali dari halaman bayar Xendit (?escrow=<id>): buka detail transaksi terkait.
  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    if (autoOpened || !db) return;
    const id = new URLSearchParams(window.location.search).get("escrow");
    const t = id ? db.transactions.find((x) => x.escrowId === id) : null;
    if (t) A.trxDetail(t.id);
    setAutoOpened(true);
  }, [A, autoOpened, db]);

  // Ucapan saat dana escrow cair (transaksi SELESAI yang belum dilihat). Satu popup per kunjungan, yang terbaru dulu.
  // Backlog: bila banyak sekaligus, ringkas dalam satu popup (lihat claude/backlog-escrow.md).
  const [celebrating, setCelebrating] = useState(false);
  useEffect(() => {
    if (!db || celebrating) return;
    const mine = S.myTransactions();
    const ids = unseenDone(db.actor.user, mine.filter((t) => t.escrowStatus === "SELESAI").map((t) => t.id));
    const t = mine.filter((x) => ids.includes(x.id)).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!t) return;
    setCelebrating(true);
    const kode = t.offerId.replace("OFF", "ESC");
    const nilai = rupiah(t.volume * t.price);
    showAlert({
      tone: "success",
      mascot: "senang",
      title: isFarmer ? "Hore, dana sudah masuk!" : "Transaksi selesai!",
      message: isFarmer
        ? `${kode} (${t.id}) • ${number(t.volume)} kg • ${nilai} sudah diteruskan ke rekening Anda. Terima kasih sudah berjualan lewat Temu Tani.`
        : `${kode} (${t.id}) • ${number(t.volume)} kg • ${nilai} sudah diteruskan ke petani. Terima kasih sudah bertransaksi lewat Temu Tani.`,
      confirmLabel: "Mantap",
    }).then(() => {
      markSeen(db.actor.user, t.id);
      setCelebrating(false);
    });
  }, [S, celebrating, db, isFarmer]);
  const filtered = useFiltered();
  const tx = S.myTransactions();
  const list = sortRows(
    filtered(tx, (t) => [t.id, S.buyer(t.buyerId)?.label, S.farmer(t.farmerId)?.name, S.stock(t.stockId)?.region].join(" ")),
    ui.sort,
    (t) => trxRank(t.escrowStatus, isFarmer),
    trxTime,
  );
  const volume = tx.reduce((n, t) => n + t.volume, 0);
  const value = tx.reduce((n, t) => n + t.volume * t.price, 0);
  const needAction = tx.filter((t) => escrowNeedsAction(t.escrowStatus, isFarmer)).length;
  return (
    <>
      <PageHeader
        isFarmer={isFarmer}
        title="Riwayat Kesepakatan"
        desc={isFarmer ? "Catatan harga dan volume gabah yang sudah Anda sepakati dengan pembeli." : "Catatan harga dan volume gabah yang sudah Anda sepakati dengan petani."}
      />
      <div className="kpi-grid">
        <Kpi icon="check" title="Total Kesepakatan" val={tx.length} foot="Kesepakatan milik Anda" />
        <Kpi icon="package" title="Total Volume" val={<>{number(volume)} <span className="kpi-unit">kg</span></>} foot="Gabah yang disepakati" theme="lime" />
        <Kpi icon="wallet" title="Nilai Kesepakatan" val={rupiah(value)} foot="Dibayar lewat escrow Temu Tani" theme="gold" />
        <Kpi icon="clock" title="Perlu Tindakan Anda" val={needAction} foot={isFarmer ? "Dana masuk, gabah perlu dikirim" : "Perlu dibayar atau dikonfirmasi"} theme="blue" />
      </div>
      <div className="info-strip">
        <Icon name="info" size={17} />{" "}
        {isFarmer
          ? "Tengkulak membayar ke escrow Temu Tani. Kirim gabah setelah status menjadi Dana di Escrow; dana cair setelah tengkulak mengonfirmasi penerimaan."
          : "Bayar ke escrow lewat tombol Bayar di detail transaksi. Dana baru diteruskan ke petani setelah Anda mengonfirmasi gabah diterima."}
      </div>
      <Filters page="transaksi" />
      <DataTable
        columns={["ID Kesepakatan", isFarmer ? "Pembeli" : "Petani", "Lokasi", "Volume", "Harga Sepakat", "Nilai Kesepakatan", "Status Pembayaran", "Tanggal Sepakat", "Aksi"]}
        rows={list.map((t) => (
          <tr key={t.id}>
            <td><strong>{t.id}</strong></td>
            <td>{isFarmer ? S.buyer(t.buyerId)?.label : S.farmer(t.farmerId)?.name}</td>
            <td>{S.stock(t.stockId)?.region}</td>
            <td>{number(t.volume)} kg</td>
            <td>{rupiah(t.price)}/kg</td>
            <td><strong>{totalPrice(t.volume, t.price)}</strong></td>
            <td>
              <EscrowPill status={t.escrowStatus} label={t.escrowLabel} />
              {escrowNeedsAction(t.escrowStatus, isFarmer) ? (
                <small className="escrow-todo">Perlu tindakan Anda</small>
              ) : null}
            </td>
            <td>
              {prettyDate(t.date)}
              {t.escrowUpdated ? <small className="small-muted" style={{ display: "block", marginTop: 3 }}>Diperbarui {fmtTime(t.escrowUpdated)}</small> : null}
            </td>
            <td><Btn cl={escrowNeedsAction(t.escrowStatus, isFarmer) ? "primary" : ""} onClick={() => A.trxDetail(t.id)}>{escrowNeedsAction(t.escrowStatus, isFarmer) ? "Tindak Lanjuti" : "Lihat Detail"}</Btn></td>
          </tr>
        ))}
        footer="Pembayaran diproses lewat escrow (payment gateway mode uji). Status juga bisa dikonfirmasi lewat chatbot WhatsApp."
      />
    </>
  );
}
