import Link from "next/link";
import "@/styles/landing.css";

export const metadata = { title: "TemuTani" };

const svgProps = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, viewBox: "0 0 24 24" } as const;

export default function Home() {
  return (
    <div className="landing">
      <header className="topbar">
        <div className="wrap nav">
          <a aria-label="TemuTani dan MaxxiTani" className="brand" href="#">
            <div className="brand-logos">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Logo MaxxiTani" src="/assets/logo-temutani.png" />
              <span className="brand-divider" />
            </div>
            <div>
              <div className="brand-name">TemuTani</div>
              <div className="brand-sub">EKOSISTEM PANGAN DIGITAL</div>
            </div>
          </a>
          <div className="nav-right">
            <div className="nav-note">Informasi lebih terbuka, keputusan lebih berdaya.</div>
            <nav aria-label="Akun" className="nav-auth">
              <Link className="nav-login" href="/masuk">
                Masuk
              </Link>
              <Link className="nav-cta" href="/daftar">
                Daftar
              </Link>
            </nav>
          </div>
        </div>
      </header>
      <main>
        <section className="hero" id="beranda">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="hero-mascot left" src="/assets/maskot/menyambut.webp" alt="" aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="hero-mascot right" src="/assets/maskot/cek-harga.webp" alt="" aria-hidden="true" />
          <div className="wrap">
            <div className="hero-inner">
              <div className="eyebrow">
                <i /> INOVASI DIGITAL UNTUK EKOSISTEM PERTANIAN
              </div>
              <h1>
                Terhubung lebih mudah,
                <br />
                <span className="accent">bertumbuh bersama.</span>
              </h1>
              <p className="hero-copy">
                TemuTani menghubungkan petani dengan pembeli dan menghadirkan referensi harga gabah berbasis AI. Tengkulak bisa
                daftar mandiri; akun petani dibuatkan oleh admin TemuTani.
              </p>
              <div className="hero-cta">
                <Link className="hero-login" href="/masuk">
                  Masuk ke TemuTani
                  <svg {...svgProps} height="20" width="20" aria-hidden="true">
                    <path d="M5 12h14" />
                    <path d="m13 6 6 6-6 6" />
                  </svg>
                </Link>
                <Link className="hero-signup" href="/daftar">
                  Daftar sebagai Tengkulak
                </Link>
              </div>
              <p className="hero-cta-note">Untuk petani dan tengkulak di Garut &amp; Cianjur</p>
              {/* Maskot versi layar sempit (maskot kiri-kanan disembunyikan di bawah 980px) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="hero-mascot-mobile" src="/assets/maskot/menyambut.webp" alt="" aria-hidden="true" />
            </div>
            <div className="trust-row" />
          </div>
        </section>

        <section className="section problem" id="tentang">
          <div className="wrap">
            <div className="section-head">
              <div className="kicker">Mengapa TemuTani?</div>
              <h2>Keputusan saat panen seharusnya didukung informasi.</h2>
              <p>Petani membutuhkan akses terhadap informasi harga dan pilihan pembeli agar dapat menilai penawaran dengan lebih percaya diri.</p>
            </div>
            <div className="problem-grid">
              <article className="problem-card">
                <div className="problem-icon">
                  <svg {...svgProps} height="23" width="23">
                    <path d="M3 3v18h18" />
                    <path d="m7 14 4-4 3 2 5-6" />
                  </svg>
                </div>
                <h3>Informasi harga terbatas</h3>
                <p>Referensi harga yang sesuai dengan lokasi, waktu panen, dan kondisi gabah tidak selalu mudah diperoleh petani.</p>
              </article>
              <article className="problem-card">
                <div className="problem-icon">
                  <svg {...svgProps} height="23" width="23">
                    <circle cx="9" cy="8" r="3" />
                    <circle cx="17" cy="9" r="2" />
                    <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 15c3.2 0 5.5 2 6 5" />
                  </svg>
                </div>
                <h3>Pilihan pembeli terbatas</h3>
                <p>Kesempatan membandingkan penawaran dari beberapa pembeli dapat terbatas, sehingga posisi tawar petani belum optimal.</p>
              </article>
              <article className="problem-card">
                <div className="problem-icon">
                  <svg {...svgProps} height="23" width="23">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </div>
                <h3>Penilaian mutu dan rafaksi</h3>
                <p>Perbedaan kondisi gabah dan penerapan rafaksi perlu didukung informasi yang jelas agar proses negosiasi lebih transparan.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="section solution" id="fitur">
          <div className="wrap solution-grid">
            <div className="solution-copy">
              <div className="kicker">Satu akses, lebih banyak informasi</div>
              <h2>Temukan pasar. Pahami harga. Tentukan pilihan.</h2>
              <p>
                Melalui chatbot WhatsApp, TemuTani membantu petani mencatat stok gabah, menerima penawaran pembeli, dan memperoleh rujukan harga
                gabah wajar dari model AI.
              </p>
              <div className="feature-list">
                {[
                  ["Referensi harga gabah wajar", "Estimasi berbasis data lokal dan faktor yang berkaitan dengan dinamika harga."],
                  ["Pencocokan stok dengan pembeli", "Informasi stok petani dapat ditemukan pembeli berdasarkan komoditas, volume, dan lokasi."],
                  ["Negosiasi lebih terinformasi", "Petani dapat menilai tawaran dan memilih untuk menyetujui, menolak, atau mengajukan harga balik."],
                ].map(([t, d]) => (
                  <div className="feature" key={t}>
                    <div className="check">✓</div>
                    <div>
                      <strong>{t}</strong>
                      <span>{d}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="phone-wrap">
              <div className="phone">
                <div className="phone-notch" />
                <div className="wa-head">
                  <div className="wa-logo">T</div>
                  <div>
                    <b>TemuTani Assistant</b>
                    <small>chatbot · ilustrasi antarmuka</small>
                  </div>
                </div>
                <div className="chat-date">HARI INI</div>
                <div className="bubble bot">Halo! Selamat datang di TemuTani. Mari catat stok gabah yang akan dipanen.</div>
                <div className="bubble user">GKP, 5.000 kg, Garut. Panen minggu depan.</div>
                <div className="bubble bot">Stok berhasil dicatat. Kamu akan menerima informasi jika ada pembeli yang sesuai.</div>
                <div className="bubble bot">Ada penawaran baru untuk stokmu:</div>
                <div className="price-bubble">
                  <small>RUJUKAN HARGA GABAH WAJAR · ILUSTRASI</small>
                  <strong>Rp 6.500/kg</strong>
                  <small>Penawaran pembeli: Rp 6.300/kg</small>
                </div>
                <div className="choice">Setuju　 ·　 Tolak　 ·　 Ajukan harga balik</div>
              </div>
            </div>
          </div>
        </section>

        <section className="section steps" id="cara-kerja">
          <div className="wrap">
            <div className="section-head">
              <div className="kicker">Alur penggunaan</div>
              <h2>Dari pencatatan stok hingga negosiasi.</h2>
              <p>Proses yang dirancang sederhana agar petani dan pembeli dapat terhubung melalui percakapan WhatsApp.</p>
            </div>
            <div className="steps-grid">
              {[
                ["01", "Petani catat stok", "Petani mengirimkan jenis gabah, lokasi, perkiraan volume, dan rencana tanggal panen melalui WhatsApp."],
                ["02", "Pembeli cari pasokan", "Pembeli mencari stok berdasarkan jenis gabah, jumlah kebutuhan, lokasi, dan waktu ketersediaan."],
                ["03", "Penawaran diteruskan", "Pembeli memilih stok yang sesuai dan mengirimkan penawaran harga kepada petani."],
                ["04", "Petani tentukan pilihan", "Petani menerima penawaran beserta referensi harga AI, lalu menyetujui, menolak, atau mengajukan harga balik."],
              ].map(([no, t, d]) => (
                <article className="step" key={no}>
                  <div className="step-no">{no}</div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section ecosystem" id="ekosistem">
          <div className="wrap ecosystem-grid">
            <div>
              <div className="kicker">Terhubung dalam ekosistem MaxxiTani</div>
              <h2>Teknologi yang mendukung keputusan dari lahan hingga pasar.</h2>
              <p>
                TemuTani dikembangkan sebagai bagian dari ekosistem MaxxiTani. Integrasi informasi pasar dengan data pertanian dan lingkungan membuka
                peluang pengambilan keputusan yang lebih menyeluruh.
              </p>
            </div>
            <div className="ecosystem-points">
              <div className="eco-point">
                <svg {...svgProps} height="22" width="22">
                  <path d="M3 3v18h18" />
                  <path d="m6 15 4-5 4 3 5-7" />
                </svg>
                <b>Informasi pasar</b>
                <span>Referensi harga dan dinamika penawaran gabah.</span>
              </div>
              <div className="eco-point">
                <svg {...svgProps} height="22" width="22">
                  <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
                <b>Data pertanian</b>
                <span>Informasi kondisi lahan dan faktor agroklimat.</span>
              </div>
              <div className="eco-point">
                <svg {...svgProps} height="22" width="22">
                  <path d="M4 19V5m0 14h16M7 15l4-5 3 3 5-7" />
                </svg>
                <b>Analisis berbasis AI</b>
                <span>Pengolahan berbagai sumber data untuk estimasi harga.</span>
              </div>
              <div className="eco-point">
                <svg {...svgProps} height="22" width="22">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <b>Jaringan kemitraan</b>
                <span>Menghubungkan petani, kelompok tani, dan pembeli.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="cta" id="mulai">
          <div className="wrap cta-box">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="cta-mascot" src="/assets/maskot/senang.webp" alt="" aria-hidden="true" />
            <div className="cta-copy">
              <h2>Bangun pasar gabah yang lebih terbuka bersama TemuTani.</h2>
              <p>Kenali inisiatif TemuTani dalam ekosistem digital MaxxiTani.</p>
            </div>
            <div className="cta-actions">
              <a className="btn btn-primary" href="#beranda">
                Kembali ke atas{" "}
                <svg className="action-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6 14 6-6 6 6" />
                </svg>
              </a>
            </div>
          </div>
        </section>
      </main>
      <footer>
        <div className="wrap footer-row">
          <div className="footer-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src="/assets/logo-temutani-bg-white.png" />
            TemuTani
          </div>
          <div className="footer-note">© 2026 TemuTani. Prototipe oleh TemanTani</div>
        </div>
      </footer>
    </div>
  );
}
