"use client";
/* Halaman dashboard petani/tengkulak: overview, stok, penawaran, transaksi (port app.js bagian 5). */
import { Icon } from "@/components/Icon";
import { useRoleActions } from "./actions";
import { useRole } from "./RoleDataProvider";
import {
  ActivityCard, availability, Badge, Btn, DataTable, Kpi, number, PageHeader, Person, prettyDate, rupiah, selectors, totalPrice,
  type Selectors,
} from "./common";
import type { Offer, RoleState } from "./types";

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
  const statuses = page === "penawaran" ? ["Menunggu Petani", "Penawaran Balik", "Disepakati", "Ditolak"] : ["Belum Dibayar", "Menunggu Verifikasi", "Sudah Dibayar"];
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
      {page === "penawaran" || page === "transaksi" ? (
        <select className="select" aria-label="Filter status" value={ui.status} onChange={(e) => setUi({ status: e.target.value })}>
          {["Semua Status", ...statuses].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

function useFiltered() {
  const { ui } = useRole();
  return function filtered<T extends { status?: string; payment?: string }>(arr: T[], cb: (x: T) => string) {
    return arr
      .filter((x) => !ui.query || cb(x).toLowerCase().includes(ui.query.toLowerCase()))
      .filter((x) => ui.status === "Semua Status" || x.status === ui.status || x.payment === ui.status);
  };
}

/* ---------- Tabel penawaran ---------- */
function OfferTable({ rows, S, isFarmer, onDetail }: { rows: Offer[]; S: Selectors; isFarmer: boolean; onDetail: (id: string) => void }) {
  const cols = isFarmer
    ? ["Penawaran / Pembeli", "Gabah", "Penawaran Awal", "Harga Balik", "Status", "Aksi"]
    : ["Penawaran / Petani", "Gabah", "Penawaran Saya", "Harga Balik", "Status", "Aksi"];
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
                  <td>{action}</td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={6}>
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
    const o = S.myOffers(), t = S.myTransactions();
    const total = stocks.filter((s) => s.status === "Tersedia").reduce((n, s) => n + availability(s), 0);
    const waiting = o.filter((a) => a.status === "Menunggu Petani");
    return (
      <>
        <PageHeader isFarmer title={`Selamat datang, ${me?.name || "Petani"}`} desc={`Ringkasan stok dan penawaran Anda di ${me?.region || "wilayah Anda"}.`} />
        <div className="demo-strip">
          <Icon name="info" size={17} /> Stok, penawaran, dan transaksi yang tampil hanya milik akun Anda. Harga AI di sini untuk referensi keputusan petani.
        </div>
        <div className="kpi-grid">
          <Kpi icon="wheat" title="Stok Siap Dijual" val={<>{number(total)} <span className="kpi-unit">kg</span></>} foot={stocks.length + " listing gabah milik Anda"} />
          <Kpi icon="handshake" title="Penawaran Masuk" val={waiting.length} foot="Menunggu keputusan Anda" theme="gold" />
          <Kpi icon="activity" title="Sedang Dinegosiasikan" val={o.filter((a) => a.status === "Penawaran Balik").length} foot="Harga balik yang diajukan" theme="blue" />
          <Kpi icon="wallet" title="Belum Dibayar" val={t.filter((a) => a.payment !== "Sudah Dibayar").length} foot="Kesepakatan perlu ditindaklanjuti" theme="lime" />
        </div>
        <div className="page-banner card">
          <div>
            <strong>Harga gabah wajar {me?.region || ""}</strong>
            <p>
              {S.currentAI("GKP") != null
                ? "Referensi AI untuk membantu Anda mengevaluasi penawaran pembeli."
                : "Referensi harga AI belum tersedia untuk wilayah Anda (saat ini baru Garut dan Sukabumi)."}
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
                    <p>{S.buyer(a.buyerId)?.label || "Pembeli WhatsApp"} • Harga {rupiah(a.currentBid)}/kg</p>
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
                <div className="section-subtitle">Stok di {me?.region || "wilayah Anda"}</div>
              </div>
              <Btn onClick={() => A.navigate("stok")}>Kelola Stok</Btn>
            </div>
            {stocks.slice(0, 4).map((s) => (
              <div className="stock-row" key={s.id}>
                <div>
                  <strong>{s.id} • {s.type}</strong>
                  <p>Panen {prettyDate(s.harvest)} · {s.status}</p>
                </div>
                <span className="stock-meta">{number(availability(s))} kg</span>
              </div>
            ))}
          </section>
          <section className="card section-card">
            <h3 className="section-title">Status Pembayaran</h3>
            <div className="section-subtitle">Kesepakatan milik Anda</div>
            {t.length ? (
              t.slice().reverse().map((x) => (
                <div className="stock-row" key={x.id}>
                  <div>
                    <strong>{x.id}</strong>
                    <p>{totalPrice(x.volume, x.price)} · {number(x.volume)} kg</p>
                  </div>
                  <Badge s={x.payment} />
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
  const req = db.requests.filter((r) => r.buyerId === S.me);
  const all = db.stocks.filter((s) => s.status === "Tersedia").reduce((n, s) => n + availability(s), 0);
  const active = bOffers.filter((o) => ["Menunggu Petani", "Penawaran Balik"].includes(o.status)).length;
  return (
    <>
      <PageHeader isFarmer={false} title={`Selamat datang, ${S.myBuyer()?.label || "Pembeli"}`} desc="Cari gabah di berbagai wilayah dan kelola penawaran Anda." />
      <div className="demo-strip">
        <Icon name="info" size={17} /> Hanya permintaan, penawaran, dan transaksi milik akun Anda yang ditampilkan.
      </div>
      <div className="kpi-grid">
        <Kpi icon="document" title="Permintaan Saya" val={req.length} foot="Permintaan kebutuhan gabah" />
        <Kpi icon="package" title="Stok Lintas Wilayah" val={<>{number(all)} <span className="kpi-unit">kg</span></>} foot="Gabah tersedia di semua kota/kabupaten" theme="lime" />
        <Kpi icon="handshake" title="Penawaran Aktif" val={active} foot="Menunggu petani / harga balik" theme="gold" />
        <Kpi icon="check" title="Kesepakatan" val={t.length} foot="Transaksi milik Anda" theme="blue" />
      </div>
      <div className="page-banner card">
        <div>
          <strong>Butuh gabah untuk usaha Anda?</strong>
          <p>Sampaikan kebutuhan volume (kg) dan kota/kabupaten. Bandingkan stok petani lalu ajukan penawaran harga pertama.</p>
        </div>
        <div className="banner-right">
          <Btn cl="secondary" onClick={A.newRequest}>
            <Icon name="plus" size={15} /> Buat Permintaan
          </Btn>
        </div>
      </div>
      <div className="two-col">
        <section className="card section-card">
          <div className="section-header">
            <div>
              <h3 className="section-title">Permintaan Gabah Saya</h3>
              <div className="section-subtitle">Pilih permintaan untuk mencari stok yang sesuai</div>
            </div>
          </div>
          {req.slice().reverse().map((r) => (
            <div className="stock-row" key={r.id}>
              <div>
                <strong>{r.id} • {number(r.volume)} kg {r.type}</strong>
                <p>{r.region} · Dibutuhkan {prettyDate(r.needed)}</p>
              </div>
              <Btn cl="secondary" onClick={() => A.searchRequest(r.id)}>Cari Stok</Btn>
            </div>
          ))}
        </section>
        <ActivityCard db={db} />
      </div>
      <div className="card table-card">
        <div className="section-header">
          <div>
            <h3 className="section-title">Penawaran Saya</h3>
            <div className="section-subtitle">Perkembangan pengajuan harga kepada petani</div>
          </div>
          <Btn onClick={() => A.navigate("penawaran")}>Lihat Semua</Btn>
        </div>
        <OfferTable rows={bOffers.slice().reverse().slice(0, 4)} S={S} isFarmer={false} onDetail={A.offerDetail} />
      </div>
    </>
  );
}

/* ---------- Stok ---------- */
export function StocksPage() {
  const { db, S, A, isFarmer, ui } = useData();
  const my = isFarmer;
  const a = my ? S.ownStock() : db.stocks.filter((s) => s.status === "Tersedia" && availability(s) > 0);
  const b = a.filter((s) => my || ui.area === "Semua Wilayah" || s.region === ui.area);
  const list = b.filter((s) => !ui.query || [s.id, s.type, s.region, S.farmer(s.farmerId)?.name].join(" ").toLowerCase().includes(ui.query.toLowerCase()));
  return (
    <>
      <PageHeader
        isFarmer={isFarmer}
        title={my ? "Stok Gabah Saya" : "Stok Gabah"}
        desc={my ? `Kelola gabah milik Anda di ${S.myFarmer()?.region || "wilayah Anda"}.` : "Jelajahi stok gabah lintas wilayah. Harga awal ditentukan oleh pembeli saat mengajukan penawaran."}
        action={
          my ? (
            <Btn cl="primary" onClick={() => A.newStock()}>
              <Icon name="plus" size={16} /> Tambah Stok
            </Btn>
          ) : (
            <Btn cl="primary" onClick={A.newRequest}>
              <Icon name="plus" size={16} /> Buat Permintaan
            </Btn>
          )
        }
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
                <Btn onClick={() => A.newStock(s.id)}>
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
              <td><Btn cl="primary" onClick={() => A.newOffer(s.id)}>Ajukan Harga</Btn></td>
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
  const { S, A, isFarmer } = useData();
  const filtered = useFiltered();
  const mine = S.myOffers();
  const a = filtered(mine, (o) => [o.id, o.status, S.farmer(o.farmerId)?.name, S.buyer(o.buyerId)?.label, S.stock(o.stockId)?.type].join(" "));
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
      <div className="kpi-grid">
        <Kpi icon="handshake" title="Total Penawaran" val={mine.length} foot="Seluruh penawaran milik Anda" />
        <Kpi icon="clock" title={isFarmer ? "Menunggu Respons Saya" : "Menunggu Petani"} val={mine.filter((o) => o.status === "Menunggu Petani").length} foot="Belum direspons" theme="gold" />
        <Kpi icon="activity" title="Penawaran Balik" val={mine.filter((o) => o.status === "Penawaran Balik").length} foot="Proses tawar-menawar" theme="blue" />
        <Kpi icon="check" title="Disepakati" val={mine.filter((o) => o.status === "Disepakati").length} foot="Berhasil mencapai harga akhir" theme="lime" />
      </div>
      <Filters page="penawaran" />
      <div className="card table-card">
        <div className="section-header">
          <div>
            <h3 className="section-title">Daftar Penawaran</h3>
            <div className="section-subtitle">Setiap petani mempunyai penawaran dan negosiasi terpisah</div>
          </div>
        </div>
        <OfferTable rows={a} S={S} isFarmer={isFarmer} onDetail={A.offerDetail} />
        <div className="table-foot-note">Satu permintaan pembeli dapat menghasilkan beberapa penawaran ke petani berbeda. Semua nominal harga dalam Rp/kg.</div>
      </div>
    </>
  );
}

/* ---------- Transaksi ---------- */
export function TransactionsPage() {
  const { S, A, isFarmer } = useData();
  const filtered = useFiltered();
  const tx = S.myTransactions();
  const list = filtered(tx, (t) => [t.id, t.payment, S.buyer(t.buyerId)?.label, S.farmer(t.farmerId)?.name, S.stock(t.stockId)?.type].join(" "));
  return (
    <>
      <PageHeader
        isFarmer={isFarmer}
        title="Transaksi Disepakati"
        desc={isFarmer ? "Pantau transaksi dari gabah Anda, termasuk pembayaran yang sudah diterima atau masih tertunda." : "Lihat semua kesepakatan Anda dan perbarui konfirmasi pengiriman pembayaran."}
      />
      <div className="kpi-grid">
        <Kpi icon="check" title="Total Kesepakatan" val={tx.length} foot="Transaksi milik Anda" />
        <Kpi icon="wallet" title="Sudah Dibayar" val={tx.filter((t) => t.payment === "Sudah Dibayar").length} foot="Dikonfirmasi petani" theme="lime" />
        <Kpi icon="clock" title="Belum Dibayar" val={tx.filter((t) => t.payment === "Belum Dibayar").length} foot="Menunggu pembayaran" theme="gold" />
        <Kpi icon="activity" title="Menunggu Verifikasi" val={tx.filter((t) => t.payment === "Menunggu Verifikasi").length} foot="Pembeli mengaku sudah membayar" theme="blue" />
      </div>
      <div className="info-strip">
        <Icon name="info" size={17} />{" "}
        {isFarmer
          ? "Konfirmasi pembayaran diterima hanya ketika dana benar-benar masuk ke rekening Anda."
          : "Tombol “Saya Sudah Transfer” tidak memindahkan dana. Petani harus mengonfirmasi pembayaran setelah dana diterima."}
      </div>
      <Filters page="transaksi" />
      <DataTable
        columns={["ID Transaksi", isFarmer ? "Pembeli" : "Petani", "Gabah", "Volume", "Harga Sepakat", "Total Nilai", "Pembayaran", "Aksi"]}
        rows={list.map((t) => (
          <tr key={t.id}>
            <td>
              <strong>{t.id}</strong>
              <small style={{ display: "block", color: "#9ba89f" }}>{prettyDate(t.date)}</small>
            </td>
            <td>{isFarmer ? S.buyer(t.buyerId)?.label : S.farmer(t.farmerId)?.name}</td>
            <td>{S.stock(t.stockId)?.type}</td>
            <td>{number(t.volume)} kg</td>
            <td>{rupiah(t.price)}/kg</td>
            <td><strong>{totalPrice(t.volume, t.price)}</strong></td>
            <td><Badge s={t.payment} /></td>
            <td><Btn onClick={() => A.trxDetail(t.id)}>Lihat Detail</Btn></td>
          </tr>
        ))}
        footer="Status pembayaran merupakan pencatatan simulasi, bukan verifikasi bank atau bukti pembayaran otomatis."
      />
    </>
  );
}
