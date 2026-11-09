'use strict';
/*
 * Temu Tani — skrip dashboard terpadu.
 *  - Shell dashboard (body[data-role]): admin.html, petani.html, tengkulak.html
 *  - Konten iframe (html[data-page]) : harga.html, berita.html
 * Setiap halaman hanya menjalankan init miliknya (lihat bagian 8).
 */

/* ========== 1. Utilitas bersama ========== */
const SVG = {
 dashboard:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 wheat:'<path d="M12 22V8M8 6c0 2 2 3 4 3V6c-2 0-4-2-4-4-2 0-3 1-3 3s2 4 7 4M16 6c0 2-2 3-4 3V6c2 0 4-2 4-4 2 0 3 1 3 3s-2 4-7 4M5 12c2 0 4 1 7 4M19 12c-2 0-4 1-7 4"/>',
 handshake:'<path d="M7 11 9 9l3 2 2-2m-7 2-4 3m11-5 7 5-5 5-4-2-3 2-4-4m6-4 2 2m-2 0 2 2m-7-9 3-2 4 1 3-1 3 3-4 3"/>',
 chart:'<path d="M3 3v18h18M6 16l5-5 4 3 5-8"/>',
 history:'<path d="M3 12a9 9 0 1 0 2.5-6.2L3 8m0-5v5h5M12 7v5l3 2"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
 bell:'<path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 close:'<path d="M18 6 6 18M6 6l12 12"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 edit:'<path d="m15 5 4 4M3 21l4.5-1 12-12a2.8 2.8 0 0 0-4-4l-12 12L3 21Z"/>',
 package:'<path d="m12 2 9 5-9 5-9-5 9-5ZM3 7v10l9 5 9-5V7M12 12v10"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 activity:'<path d="M3 12h3l3-8 4 16 3-8h5"/>',
 send:'<path d="m22 2-7 20-4-9-9-4 20-7ZM11 13 22 2"/>',
 location:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
 wallet:'<rect x="2" y="5" width="20" height="16" rx="2"/><path d="M2 10h20M16 16h2M5 5V3h14"/>',
 refresh:'<path d="M20 7v5h-5M4 17v-5h5M5.7 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.3-3"/>',
 users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
 document:'<path d="M5 2h10l4 4v16H5zM15 2v5h4M8 12h8M8 16h8"/>',
 sprout:'<path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 1 1.1 4c-1.9-.1-3.5-.8-4.5-1.7"/>',
 truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
 download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
 chevron: '<path d="m9 18 6-6-6-6"/>',
 database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0"/>',
 trending: '<path d="m3 17 7-7 4 4 7-7M15 7h6v6"/>',
 lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
};
SVG['layout-dashboard'] = SVG.dashboard;
SVG['chart-no-axes-combined'] = `
    <path d="M3 3v18h18"/>
    <path d="m7 16 5-5 4 3 5-7"/>
    <path d="M17 7h4v4"/>
`;
SVG['receipt-text'] = `
    <path d="M4 3h16v18l-4-2-4 2-4-2-4 2V3Z"/>
    <path d="M8 8h8"/>
    <path d="M8 12h8"/>
    <path d="M8 16h5"/>
`;
SVG['messages-square'] = `
    <path d="M16 10a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
    <path d="M22 8v10a2 2 0 0 1-2 2h-6l-4 4v-4"/>
`;
SVG['arrow-left-right'] = `
    <path d="M8 3 4 7l4 4"/>
    <path d="M4 7h16"/>
    <path d="m16 21 4-4-4-4"/>
    <path d="M20 17H4"/>
`;
SVG['refresh-cw'] = `
    <path d="M20 11a8 8 0 0 0-14.9-4"/>
    <path d="M4 4v5h5"/>
    <path d="M4 13a8 8 0 0 0 14.9 4"/>
    <path d="M20 20v-5h-5"/>
`;
SVG['message-circle-warning'] = `
    <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5
            8.5 8.5 0 0 1-4.2-1.1L3 21
            l1.8-5.2A8.5 8.5 0 1 1 21 11.5Z"/>
    <path d="M12 7v5"/>
    <path d="M12 16h.01"/>
`;
SVG['package-plus'] = `
    <path d="m12 2 9 5-9 5-9-5 9-5Z"/>
    <path d="M3 7v10l9 5 9-5V7"/>
    <path d="M12 12v10"/>
    <path d="M16 4h6"/>
    <path d="M19 1v6"/>
`;
const ico = (name, size=18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SVG[name] || SVG.info}</svg>`;
const esc = x => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatRupiah = n => 'Rp' + new Intl.NumberFormat('id-ID').format(n);
const fmtNum = n => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(n);

// Tanggal "hari ini" menurut WIB (GMT+7), dinormalkan ke 00:00 UTC agar aman dihitung per hari.
// Prototipe ini tidak memiliki server, jadi jam perangkat dikonversi ke GMT+7.
function todayWIB() {
    const d = new Date(Date.now() + 7 * 3600 * 1000);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
const addDays = (date, n) => new Date(date.getTime() + n * 86400000);
const fmtDay = (date, opts) => date.toLocaleDateString('id-ID', { ...opts, timeZone: 'UTC' });

/* ========== 2. Halaman konten dalam iframe (berita & harga) ========== */
const FRAME_PAGES = {
    berita: { id: 'beritaFrame', src: 'berita.html', title: 'Berita & Analisis' },
    harga: { id: 'hargaFrame', src: 'harga.html', title: 'Prediksi Harga AI' }
};
function frameHTML(page, query = '') {
    const f = FRAME_PAGES[page];
    return `<iframe id="${f.id}" src="${f.src}${query}" title="${f.title}" scrolling="no" style="display:block;width:100%;height:500px;overflow:hidden;border:0;background:#f5f7f5;"></iframe>`;
}
// Dipanggil shell dashboard: terima tinggi aktual konten iframe agar hanya dashboard yang scroll.
function listenFrameHeight(minHeight = 0) {
    window.addEventListener('message', function (event) {
        // file:// mengirim origin 'null'; keamanan tetap dijaga oleh pengecekan event.source di bawah.
        if (event.origin !== window.location.origin && !(window.location.protocol === 'file:' && event.origin === 'null')) return;
        for (const page in FRAME_PAGES) {
            const frame = document.getElementById(FRAME_PAGES[page].id);
            if (!frame || event.source !== frame.contentWindow) continue;
            if (event.data && event.data.type === page + '-frame-height') {
                const height = Number(event.data.height);
                if (Number.isFinite(height) && height > 0) frame.style.height = Math.max(minHeight, height) + 'px';
            }
            return;
        }
    });
}
// Dipanggil konten iframe: kirim tinggi konten ke dashboard induk.
function postFrameHeight(page, height) {
    if (window.parent === window) return;
    // Saat dibuka lewat file://, origin bersifat opaque sehingga target harus '*'.
    const target = (window.location.protocol === 'file:' || window.location.origin === 'null') ? '*' : window.location.origin;
    window.parent.postMessage({ type: page + '-frame-height', height: height }, target);
}

/* ========== 3. Prediksi harga (overview admin & harga.html) ========== */
const priceData = {
    Garut: {
        current: 7100,
        previous: 6980,
        actual: [6750, 6830, 6780, 6900, 6960, 6930, 7040, 7020, 7100, 7090, 7160, 7100],
        predicted: [6780, 6810, 6840, 6880, 6910, 6960, 6980, 7020, 7040, 7070, 7080, 7100]
    }, Sukabumi: {
        current: 7040,
        previous: 6900,
        actual: [6680, 6710, 6760, 6740, 6830, 6880, 6850, 6960, 6910, 6990, 6970, 7040],
        predicted: [6690, 6740, 6750, 6780, 6820, 6850, 6870, 6910, 6940, 6970, 7000, 7040]
    }
};
const HISTORY_DAYS = 30;   // riwayat harian sampai hari ini
const FORECAST_DAYS = 7;   // prakiraan AI setelah hari ini
// Titik acuan di atas dipadatkan menjadi seri harian (interpolasi linier) yang berakhir hari ini,
// lalu estimasi AI diperpanjang 7 hari ke depan mengikuti tren 7 hari terakhir.
function dailySeries(anchors, days) {
    return Array.from({ length: days }, (_, i) => {
        const t = i * (anchors.length - 1) / (days - 1), k = Math.floor(t), f = t - k;
        const a = anchors[k], b = anchors[Math.min(k + 1, anchors.length - 1)];
        return Math.round(a + (b - a) * f);
    });
}
for (const d of Object.values(priceData)) {
    d.actualDaily = dailySeries(d.actual, HISTORY_DAYS);
    d.predictedDaily = dailySeries(d.predicted, HISTORY_DAYS);
    const last = d.predictedDaily[HISTORY_DAYS - 1], slope = (last - d.predictedDaily[HISTORY_DAYS - 8]) / 7;
    d.forecast = Array.from({ length: FORECAST_DAYS }, (_, i) => Math.round(last + slope * (i + 1)));
}
let state = { page: 'overview', area: 'Semua Wilayah', query: '', status: 'Semua Status', type: 'Semua Jenis', period: '30 Hari', chartPeriod: '30H' };
let renderPage = () => {};
// render() juga dipanggil dari atribut onclick di markup admin & harga.
function render() {
    renderPage();
}
function setArea(area) {
    if (state.lockedArea) return;
    state.area = area;
    render()
}
function options(vals, selected) {
    return vals.map(s => `
        <option ${selected === s ? 'selected' : ''}>${s}</option>
    `).join('')
}
function heading(label, title, sub, actions = '') {
    return `
        <div class="page-heading">
            <div>
                <h1>${title}</h1>
                <p>${sub}</p>
            </div>
            <div class="action-row">${actions}</div>
        </div>
    `
}
// actual: harga pasar sampai hari ini; predicted: estimasi AI untuk rentang yang sama + prakiraan setelah hari ini;
// dates: tanggal untuk setiap titik predicted. Titik terakhir actual = hari ini.
function generatePlot(actual, predicted, dates) {
    let arr = [...actual, ...predicted], min = Math.floor(Math.min(...arr) / 100) * 100 - 100, max = Math.ceil(Math.max(...arr) / 100) * 100 + 100, W = 650, H = 220, pad = { t: 13, l: 43, r: 10, b: 29 }, pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    let n = predicted.length, today = actual.length - 1;
    let xy = (i, v) => [pad.l + i * pw / (n - 1), pad.t + (max - v) * ph / (max - min)];
    let p = a => a.map((v, i) => xy(i, v).map(v => v.toFixed(1)).join(',')).join(' ');
    let guides = [0, .25, .5, .75, 1].map(r => {
        let y = pad.t + ph * r;
        return `
            <line class="gridline" x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}"/>
            <text x="${pad.l - 9}" y="${y + 4}" text-anchor="end">${fmtNum(Math.round((max - (max - min) * r) / 100) * 100)}</text>
        `
    }).join('');
    // Label tanggal berjarak tetap dihitung dari hari ini, sehingga tanggal hari ini selalu tampil.
    let gap = Math.ceil((n - 1) / 6), ticks = [];
    for (let i = today % gap; i < n; i += gap) ticks.push(i);
    let labels = ticks.map(i => `
        <text x="${xy(i, min)[0]}" y="${H - 2}" text-anchor="middle">${fmtDay(dates[i], { day: '2-digit', month: 'short' })}</text>
    `).join('');
    let tx = xy(today, min)[0];
    let fill = p(actual) + ` ${tx},${pad.t + ph} ${pad.l},${pad.t + ph}`;
    let step = actual.length > 7 ? 5 : 3;
    return `
        <svg class="line-chart" role="img" aria-label="Grafik harga gabah ${fmtDay(dates[0], { day: 'numeric', month: 'short' })} sampai ${fmtDay(dates[n - 1], { day: 'numeric', month: 'short', year: 'numeric' })}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
            <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#84cfa0" stop-opacity=".23"/>
                    <stop offset="1" stop-color="#84cfa0" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <rect class="forecast-zone" x="${tx}" y="${pad.t}" width="${W - pad.r - tx}" height="${ph}"/>${guides}
            <line class="today-line" x1="${tx}" x2="${tx}" y1="${pad.t}" y2="${pad.t + ph}"/>
            <text class="today-label" x="${tx + 5}" y="${pad.t + 11}">Hari ini</text>
            <polygon points="${fill}" fill="url(#priceFill)"/>
            <polyline class="curve" points="${p(actual)}" stroke="#2c8a61"/>
            <polyline class="curve" points="${p(predicted)}" stroke="#e7b363" stroke-dasharray="6 7"/>${actual.map((v, i) => i % step === 0 || i === today ? `
        <circle class="dot" cx="${xy(i, v)[0]}" cy="${xy(i, v)[1]}" r="4.7" fill="#2c8a61">
        <title>${fmtDay(dates[i], { day: 'numeric', month: 'short' })} · ${fmtNum(v)} rupiah/kg</title>
        </circle>
    ` : '').join('')}${labels}</svg>
    `
}
function priceChart(panelArea = 'Garut') {
    let d = priceData[panelArea] || priceData.Garut;
    return `
        <div class="section-header">
            <div>
                <h3 class="section-title">Pergerakan Harga Gabah</h3>
                <div class="section-subtitle">Harga pasar dan estimasi AI · Data simulasi</div>
            </div>
            <div class="area-selector">
                <button class="seg ${state.chartPeriod === '7H' ? 'active' : ''}" onclick="state.chartPeriod='7H';render()">7H</button>
                <button class="seg ${state.chartPeriod === '30H' ? 'active' : ''}" onclick="state.chartPeriod='30H';render()">30H</button>
            </div>
        </div>
        <div class="price-summary">
            <span class="big-price">${formatRupiah(d.current)}</span><span class="delta">${ico('trending', 12)} +${fmtNum(((d.current - d.previous) / d.previous) * 100)}%</span><span class="hint">/kg · ${panelArea}</span>
        </div>${(() => {
            const days = state.chartPeriod === '7H' ? 7 : HISTORY_DAYS, start = addDays(todayWIB(), 1 - days);
            const dates = Array.from({ length: days + FORECAST_DAYS }, (_, i) => addDays(start, i));
            return generatePlot(d.actualDaily.slice(-days), [...d.predictedDaily.slice(-days), ...d.forecast], dates);
        })()}
        <div class="legend">
            <span class="legend-item">
                <i class="legend-line" style="background:#2c8a61"></i> Harga pasar</span><span class="legend-item">
                <i class="legend-line" style="background:#e7b363"></i> Estimasi AI</span><span class="legend-item">
                <i class="legend-zone"></i> Prakiraan ${FORECAST_DAYS} hari</span>
        </div>
    `
}
function hargaPage() {
    let loc = state.area === 'Sukabumi' ? 'Sukabumi' : 'Garut', d = priceData[loc];
    return `
        ${heading('REFERENSI HARGA', 'Prediksi Harga AI', 'Estimasi harga gabah sebagai referensi negosiasi.', `
        ${state.lockedArea
            ? `<span class="select select-locked" title="Prediksi dikunci sesuai wilayah Anda">${ico('lock', 14)} ${loc}</span>`
            : `<select class="select" onchange="setArea(this.value)">${options(['Garut', 'Sukabumi'], loc)}</select>`}
    `)}
        <div class="price-cards">
            <div class="card price-card">
                <span class="c-label">ESTIMASI HARGA WAJAR · ${loc.toUpperCase()}</span><strong>${formatRupiah(d.current)}<span class="kpi-unit">/kg</span></strong><small>Output AI</small>
            </div>
            <div class="card price-card">
                <span class="c-label">HARGA PASAR PEMBANDING</span><strong>${formatRupiah(d.previous)}<span class="kpi-unit">/kg</span></strong><small>Harga historis</small>
            </div>
            <div class="card price-card">
                <span class="c-label"> HARGA ACUAN GKP </span><strong>${formatRupiah(6500)}<span class="kpi-unit">/kg</span></strong><small>Harga Pembelian Pemerintah</small>
            </div>
        </div>
        <div class="section-grid">
            <section class="card section-card">${priceChart(loc)}</section>
            <section class="card section-card">
                <div class="section-header">
                    <div>
                        <h3 class="section-title">Informasi Prediksi</h3>
                        <div class="section-subtitle">Metadata yang perlu tersedia saat integrasi</div>
                    </div>${ico('database', 19)}</div>
                <div class="modal-grid">
                    <div class="modal-item">
                        <label>KABUPATEN</label><strong>${loc}</strong>
                    </div>
                    <div class="modal-item">
                        <label>JENIS GABAH</label><strong>GKP</strong>
                    </div>
                    <div class="modal-item">
                        <label>TANGGAL PREDIKSI</label><strong>${fmtDay(todayWIB(), { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                    </div>
                    <div class="modal-item">
                        <label>SUMBER</label><strong>Model AI Temu Tani</strong>
                    </div>
                    <div class="modal-item">
                        <label>AKURASI (MAPE)</label><strong>Belum dievaluasi</strong>
                    </div>
                    <div class="modal-item">
                        <label>VERSI MODEL</label><strong>Belum tersedia</strong>
                    </div>
                </div>
                <div class="divider">
                </div>
                <div class="info-strip" style="margin:0">${ico('info', 16)}<span>Harga wajar adalah <strong>referensi negosiasi</strong>, bukan harga transaksi yang dijamin.</span>
                </div>
            </section>
        </div>
        <section class="card table-card">
            <div class="section-header">
                <div>
                    <h3 class="section-title">Perbandingan Harga per Wilayah</h3>
                    <div class="section-subtitle"> Output model dan selisih terhadap acuan HPP proposal · Data simulasi</div>
                </div>
            </div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>KABUPATEN</th>
                            <th>JENIS GABAH</th>
                            <th>PREDIKSI AI</th>
                            <th>HPP CONTOH</th>
                            <th>SELISIH</th>
                        </tr>
                    </thead>
                    <tbody>${Object.entries(priceData).filter(([city]) => !state.lockedArea || city === state.lockedArea).map(([city, v]) => `
        <tr>
            <td>
                <strong>${city}</strong>
            </td>
            <td>GKP</td>
            <td>
                <strong>${formatRupiah(v.current)}/kg</strong>
            </td>
            <td>${formatRupiah(6500)}/kg</td>
            <td>
                <span style="color:#29825c;font-weight:800">+${formatRupiah(v.current - 6500)}</span>
            </td>
        </tr>
    `).join('')}</tbody>
                </table>
            </div>
        </section>
    `
}

/* ========== 4. Dashboard admin ========== */
function initAdmin() {
    const stocks = [
        { id: 'STK-001', farmer: 'Pak Asep Hidayat', location: 'Garut', type: 'GKP', volume: 5.0, harvest: '04 Nov 2026', status: 'Tersedia', offers: 3 },
        { id: 'STK-002', farmer: 'Bu Siti Aminah', location: 'Sukabumi', type: 'GKP', volume: 8.5, harvest: '07 Nov 2026', status: 'Dalam Negosiasi', offers: 2 },
        { id: 'STK-003', farmer: 'Pak Dedi Suhendra', location: 'Garut', type: 'GKP', volume: 3.2, harvest: '01 Nov 2026', status: 'Tersedia', offers: 1 },
        { id: 'STK-004', farmer: 'Bu Ratna Mulyani', location: 'Sukabumi', type: 'GKP', volume: 6.0, harvest: '12 Nov 2026', status: 'Tersedia', offers: 0 },
        { id: 'STK-005', farmer: 'Pak Jajang Kurnia', location: 'Garut', type: 'GKG', volume: 4.8, harvest: '27 Okt 2026', status: 'Terjual', offers: 4 },
        { id: 'STK-006', farmer: 'Bu Nia Kartika', location: 'Sukabumi', type: 'GKP', volume: 7.5, harvest: '08 Nov 2026', status: 'Dalam Negosiasi', offers: 2 },
        { id: 'STK-007', farmer: 'Pak Agus Setiawan', location: 'Garut', type: 'GKP', volume: 2.5, harvest: '11 Nov 2026', status: 'Tersedia', offers: 1 },
        { id: 'STK-008', farmer: 'Bu Lina Fitriani', location: 'Sukabumi', type: 'GKP', volume: 9.0, harvest: '09 Nov 2026', status: 'Tersedia', offers: 0 }
    ];
    const offers = [
        {
            id: 'OFF-208',
            buyer: 'Pembeli 08••91',
            location: 'Garut',
            farmer: 'Pak Asep Hidayat',
            stock: 'STK-001',
            volume: 5,
            price: 6925,
            ai: 7100,
            status: 'Menunggu',
            date: '31 Okt 2026',
            time: '10:42',
            history: [['Penawaran dikirim', '31 Okt 2026 · 10:42', 'Rp6.925/kg'], ['Diteruskan ke petani', '31 Okt 2026 · 10:43', 'Harga wajar Rp7.100/kg']]
        },
        {
            id: 'OFF-207',
            buyer: 'Pembeli 03••74',
            location: 'Sukabumi',
            farmer: 'Bu Siti Aminah',
            stock: 'STK-002',
            volume: 8.5,
            price: 6950,
            ai: 7040,
            status: 'Penawaran Balik',
            date: '31 Okt 2026',
            time: '10:15',
            counter: 7100,
            history: [['Penawaran dikirim', '31 Okt 2026 · 10:15', 'Rp6.950/kg'], ['Petani ajukan penawaran balik', '31 Okt 2026 · 10:21', 'Rp7.100/kg']]
        },
        {
            id: 'OFF-206',
            buyer: 'Pembeli 06••27',
            location: 'Garut',
            farmer: 'Pak Dedi Suhendra',
            stock: 'STK-003',
            volume: 3.2,
            price: 7050,
            ai: 7100,
            status: 'Disetujui',
            date: '30 Okt 2026',
            time: '15:32',
            history: [['Penawaran dikirim', '30 Okt 2026 · 15:32', 'Rp7.050/kg'], ['Petani menyetujui', '30 Okt 2026 · 16:04', 'Kesepakatan Rp7.050/kg']]
        },
        {
            id: 'OFF-205',
            buyer: 'Pembeli 09••63',
            location: 'Sukabumi',
            farmer: 'Bu Nia Kartika',
            stock: 'STK-006',
            volume: 7.5,
            price: 6725,
            ai: 7040,
            status: 'Menunggu',
            date: '30 Okt 2026',
            time: '13:18',
            history: [['Penawaran dikirim', '30 Okt 2026 · 13:18', 'Rp6.725/kg'], ['Diteruskan ke petani', '30 Okt 2026 · 13:19', 'Harga wajar Rp7.040/kg']]
        },
        {
            id: 'OFF-204',
            buyer: 'Pembeli 05••84',
            location: 'Garut',
            farmer: 'Pak Asep Hidayat',
            stock: 'STK-001',
            volume: 4,
            price: 6700,
            ai: 7100,
            status: 'Ditolak',
            date: '29 Okt 2026',
            time: '11:25',
            history: [['Penawaran dikirim', '29 Okt 2026 · 11:25', 'Rp6.700/kg'], ['Petani menolak', '29 Okt 2026 · 11:41', 'Penawaran ditolak']]
        },
        {
            id: 'OFF-203',
            buyer: 'Pembeli 07••16',
            location: 'Garut',
            farmer: 'Pak Jajang Kurnia',
            stock: 'STK-005',
            volume: 4.8,
            price: 7350,
            ai: 7300,
            status: 'Disetujui',
            date: '28 Okt 2026',
            time: '09:48',
            history: [['Penawaran dikirim', '28 Okt 2026 · 09:48', 'Rp7.350/kg'], ['Petani menyetujui', '28 Okt 2026 · 10:05', 'Kesepakatan Rp7.350/kg']]
        },
        {
            id: 'OFF-202',
            buyer: 'Pembeli 02••53',
            location: 'Sukabumi',
            farmer: 'Bu Siti Aminah',
            stock: 'STK-002',
            volume: 6.0,
            price: 6800,
            ai: 7040,
            status: 'Penawaran Balik',
            date: '28 Okt 2026',
            time: '08:12',
            counter: 7000,
            history: [['Penawaran dikirim', '28 Okt 2026 · 08:12', 'Rp6.800/kg'], ['Petani ajukan penawaran balik', '28 Okt 2026 · 08:33', 'Rp7.000/kg']]
        }
    ];
    const transactions = [
        { id: 'TRX-104', farmer: 'Pak Dedi Suhendra', buyer: 'Pembeli 06••27', location: 'Garut', stock: 'STK-003', volume: 3.2, price: 7050, date: '30 Okt 2026', status: 'Disepakati' },
        { id: 'TRX-103', farmer: 'Pak Jajang Kurnia', buyer: 'Pembeli 07••16', location: 'Garut', stock: 'STK-005', volume: 4.8, price: 7350, date: '28 Okt 2026', status: 'Selesai' },
        { id: 'TRX-102', farmer: 'Bu Nia Kartika', buyer: 'Pembeli 04••88', location: 'Sukabumi', stock: 'STK-006', volume: 4.0, price: 7000, date: '25 Okt 2026', status: 'Selesai' },
        { id: 'TRX-101', farmer: 'Bu Ratna Mulyani', buyer: 'Pembeli 01••35', location: 'Sukabumi', stock: 'STK-004', volume: 2.0, price: 6950, date: '23 Okt 2026', status: 'Disepakati' }
    ];
    const events = [
        { icon: 'handshake', title: 'Pembeli 08••91 mengajukan penawaran', note: 'STK-001 · Garut · Rp6.925/kg', time: '10:42', kind: 'Penawaran', status: 'Berhasil', location: 'Garut' },
        { icon: 'arrow-left-right', title: 'Bu Siti mengajukan penawaran balik', note: 'OFF-207 · Sukabumi · Rp7.100/kg', time: '10:21', kind: 'Negosiasi', status: 'Berhasil', location: 'Sukabumi' },
        { icon: 'search', title: 'Pembeli mencari gabah 5 ton', note: 'Pencarian stok · Garut', time: '09:52', kind: 'Pencarian', status: 'Berhasil', location: 'Garut' },
        { icon: 'refresh-cw', title: 'Bu Lina memperbarui stok gabah', note: 'STK-008 · Sukabumi · 9 ton', time: '09:15', kind: 'Stok', status: 'Berhasil', location: 'Sukabumi' },
        {
            icon: 'message-circle-warning',
            title: 'Pesan tidak dapat dipahami chatbot',
            note: 'Permintaan perlu diperjelas · Identitas tersamarkan',
            time: '08:47',
            kind: 'Chatbot',
            status: 'Perlu Tinjauan',
            location: 'Garut'
        },
        { icon: 'package-plus', title: 'Pak Agus mendaftarkan stok baru', note: 'STK-007 · Garut · 2,5 ton', time: '08:13', kind: 'Stok', status: 'Berhasil', location: 'Garut' }
    ];
    const pages = [
        ['overview', 'layout-dashboard', 'Overview'],
        ['stok', 'wheat', 'Stok Gabah'],
        ['penawaran', 'handshake', 'Penawaran & Negosiasi'],
        ['harga', 'chart-no-axes-combined', 'Prediksi Harga AI'],
        ['transaksi', 'receipt-text', 'Transaksi Disepakati'],
        ['aktivitas', 'messages-square', 'Aktivitas Chatbot'],
        ['berita', 'newspaper', 'Berita & Analisis']
    ];
    function badge(s) {
        let c = ({
            'Tersedia': 'green',
            'Dalam Negosiasi': 'gold',
            'Terjual': 'blue',
            'Menunggu': 'gold',
            'Penawaran Balik': 'blue',
            'Disetujui': 'green',
            'Ditolak': 'red',
            'Selesai': 'green',
            'Berhasil': 'green',
            'Perlu Tinjauan': 'red'
        }[s] || 'gray');
        return `
            <span class="pill ${c}">${s}</span>
        `
    }
    function person(name, subtitle = '') {
        return `
            <div class="person-cell">
                <div class="initial-avatar">${name.replace('Pak ', '').replace('Bu ', '').split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()}</div>
                <div>
                    <strong>${name}</strong>${subtitle ? `
            <small>${subtitle}</small>
        ` : ''}</div>
            </div>
        `
    }
    function countStocks(area = state.area) {
        return stocks.filter(x => (area === 'Semua Wilayah' || x.location === area) && x.status !== 'Terjual').reduce((n, x) => n + x.volume, 0)
    }
    function countFarmers(area = state.area) {
        return new Set(stocks.filter(x => area === 'Semua Wilayah' || x.location === area).map(x => x.farmer)).size
    }
    function countOffers(area = state.area) {
        return offers.filter(x => (area === 'Semua Wilayah' || x.location === area) && ['Menunggu', 'Penawaran Balik'].includes(x.status)).length
    }
    function countTrx(area = state.area) {
        return transactions.filter(x => area === 'Semua Wilayah' || x.location === area).length
    }
    function areaSelect() {
        return `
            <select class="select" aria-label="Filter kabupaten" onchange="setArea(this.value)">${options(['Semua Wilayah', 'Garut', 'Sukabumi'], state.area)}</select>
        `
    }
    function downloadBtn(which) {
        return `
            <button class="btn" onclick="exportCSV('${which}')">${ico('download', 15)} Ekspor CSV</button>
        `
    }
    function kpi(icon, title, value, foot, theme = 'green') {
        return `
            <div class="card kpi">
                <div class="kpi-top">
                    <div class="kpi-icon ${theme}">
                        ${ico(icon, 20)}
                    </div>

                    <div class="kpi-name">
                        ${title}
                    </div>
                </div>

                <div class="kpi-value">
                    ${value}
                </div>

                <div class="kpi-foot">
                    ${foot}
                </div>
            </div>
        `;
    }
    function overview() {
        let a = state.area, panelArea = a === 'Sukabumi' ? 'Sukabumi' : 'Garut', areaOffers = offers.filter(o => a === 'Semua Wilayah' || o.location === a);
        return `
            ${heading('Ringkasan Operaional', 'Selamat datang di Temu Tani', 'Pantau aktivitas perdagangan gabah, mulai dari ketersediaan stok hingga kesepakatan transaksi.', areaSelect() + `
            <button class="btn" onclick="refreshDemo()">${ico('refresh', 15)} Perbarui</button>
        `)}
            <div class="kpi-grid">${kpi('users', 'Petani Terhubung', fmtNum(countFarmers()), 'Total petani terdaftar', 'green')}${kpi('wheat', 'Stok Gabah Tersedia', fmtNum(countStocks()) + ' <span class="kpi-unit">ton</span>', 'Volume stok saat ini', 'lime')}${kpi('handshake', 'Penawaran Aktif', fmtNum(countOffers()), 'Dalam proses negosiasi', 'gold')}${kpi('receipt-text', 'Kesepakatan Tercatat', fmtNum(countTrx()), 'Total transaksi disepakati', 'blue')}</div>
            <div class="section-grid">
                <section class="card section-card">${priceChart(panelArea)}</section>
                <section class="card section-card">
                    <div class="section-header">
                        <div>
                            <h3 class="section-title">Distribusi Stok Gabah</h3>
                            <div class="section-subtitle">Ketersediaan stok berdasarkan kabupaten</div>
                        </div>${ico('package', 18)}</div>${[...new Set(stocks.filter(x => x.status !== 'Terjual').map(x => x.location))].map((loc, i) => {
            let n = countStocks(loc), total = countStocks('Semua Wilayah');
            return `
                <div class="region-item">
                    <div class="region-line">
                        <span>${loc}</span><span>${fmtNum(n)} ton</span>
                    </div>
                    <div class="progress">
                        <div class="progress-bar ${i ? 'alt' : ''}" style="width:${Math.round(n / total * 100)}%">
                        </div>
                    </div>
                </div>
            `
        }).join('')}
                    <div class="divider">
                    </div>
                    <div class="tiny-stats">
                        <div>
                            <strong>${fmtNum(countStocks('Semua Wilayah'))} ton</strong><small>Stok gabah tersedia</small>
                        </div>
                    </div>
                </section>
            </div>
            <div class="section-grid bottom">
                <section class="card table-card">
                    <div class="section-header">
                        <div>
                            <h3 class="section-title">Penawaran Terbaru</h3>
                            <div class="section-subtitle">Aktivitas negosiasi dari chatbot WhatsApp</div>
                        </div>
                        <button class="link-btn" onclick="go('penawaran')">Lihat semua ${ico('chevron', 12)}</button>
                    </div>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>PEMBELI</th>
                                    <th>LOKASI</th>
                                    <th>HARGA TAWAR</th>
                                    <th>STATUS</th>
                                    <th>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>${areaOffers.slice(0, 4).map(o => `
            <tr>
                <td>${person(o.buyer, o.id)}</td>
                <td>${o.location}</td>
                <td>
                    <strong>${formatRupiah(o.price)}</strong><small class="small-muted"> /kg</small>
                </td>
                <td>${badge(o.status)}</td>
                <td>
                    <button class="link-btn" onclick="detail('offer','${o.id}')">Detail</button>
                </td>
            </tr>
        `).join('') || `
            <tr>
                <td colspan="5" class="empty-state">Tidak ada penawaran pada wilayah ini.</td>
            </tr>
        `}</tbody>
                        </table>
                    </div>
                </section>
                <section class="card section-card">
                    <div class="section-header">
                        <div>
                            <h3 class="section-title">Aktivitas WhatsApp</h3>
                            <div class="section-subtitle">Interaksi terbaru yang tercatat</div>
                        </div>
                    </div>${events.slice(0, 4).map(e => `
            <div class="activity">
                <div class="activity-icon">${ico(e.icon, 16)}</div>
                <div style="flex:1">
                    <strong>${e.title}</strong>
                    <p>${e.note} · ${e.time}</p>
                </div>
            </div>
        `).join('')}
                    <button class="link-btn" onclick="go('aktivitas')" style="margin-top:10px">Lihat aktivitas ${ico('chevron', 12)}</button>
                </section>
            </div>
        `
    }
    function tablePageTools(kind) {
        let search = `
            <label class="search-box">${ico('search', 16)}
                <input id="localSearch" placeholder="Cari ${kind === 'stok' ? 'petani atau ID stok' : kind === 'penawaran' ? 'pembeli atau ID penawaran' : kind === 'transaksi' ? 'ID transaksi atau petani' : 'aktivitas'}..." value="${state.query.replace(/"/g, '&quot;')}" oninput="state.query=this.value;updateTable()" />
            </label>
        `;
        let st = kind === 'stok' ? ['Semua Status', 'Tersedia', 'Dalam Negosiasi', 'Terjual'] : kind === 'penawaran' ? ['Semua Status', 'Menunggu', 'Penawaran Balik', 'Disetujui', 'Ditolak'] : kind === 'transaksi' ? ['Semua Status', 'Disepakati', 'Selesai'] : ['Semua Status', 'Berhasil', 'Perlu Tinjauan'];
        return `
            <div class="toolbar">${search}${areaSelect()}
                <select class="select" aria-label="Filter status" onchange="state.status=this.value;updateTable()">${options(st, state.status)}</select>${kind === 'stok' ? `
            <select class="select" aria-label="Jenis gabah" onchange="state.type=this.value;updateTable()">${options(['Semua Jenis', 'GKP', 'GKG'], state.type)}</select>
        ` : ''}${downloadBtn(kind)}</div>
        `
    }
    function rowFilter(arr) {
        return arr.filter(x => {
            let matchArea = state.area === 'Semua Wilayah' || x.location === state.area;
            let matchStatus = state.status === 'Semua Status' || x.status === state.status;
            let matchType = state.type === 'Semua Jenis' || x.type === state.type;
            let matchQuery = Object.values(x).join(' ').toLowerCase().includes(state.query.toLowerCase().trim());
            return matchArea && matchStatus && matchType && matchQuery
        })
    }
    function renderRows(kind) {
        let arr = rowFilter(kind === 'stok' ? stocks : kind === 'penawaran' ? offers : kind === 'transaksi' ? transactions : events);
        let html = '';
        if (kind === 'stok')
            html = arr.map(s => `
                <tr>
                    <td>
                        <strong>${s.id}</strong>
                    </td>
                    <td>${person(s.farmer, 'Petani')}</td>
                    <td>${s.location}</td>
                    <td>${s.type}</td>
                    <td>
                        <strong>${fmtNum(s.volume)} ton</strong>
                    </td>
                    <td>${s.harvest}</td>
                    <td>${badge(s.status)}</td>
                    <td>
                        <button class="link-btn" onclick="detail('stock','${s.id}')">Lihat</button>
                    </td>
                </tr>
            `).join('');
        if (kind === 'penawaran')
            html = arr.map(o => `
                <tr>
                    <td>
                        <strong>${o.id}</strong><small class="small-muted" style="display:block;margin-top:3px">${o.date}</small>
                    </td>
                    <td>${person(o.buyer, 'Tanpa registrasi')}</td>
                    <td>${o.farmer}</td>
                    <td>${o.location}</td>
                    <td>
                        <strong>${formatRupiah(o.price)}</strong>
                    </td>
                    <td>${formatRupiah(o.ai)}</td>
                    <td>${badge(o.status)}</td>
                    <td>
                        <button class="link-btn" onclick="detail('offer','${o.id}')">Detail</button>
                    </td>
                </tr>
            `).join('');
        if (kind === 'transaksi')
            html = arr.map(t => `
                <tr>
                    <td>
                        <strong>${t.id}</strong>
                    </td>
                    <td>${t.farmer}</td>
                    <td>${t.buyer}</td>
                    <td>${t.location}</td>
                    <td>${fmtNum(t.volume)} ton</td>
                    <td>${formatRupiah(t.price)}/kg</td>
                    <td>
                        <strong>${formatRupiah(t.volume * 1000 * t.price)}</strong>
                    </td>
                    <td>${badge(t.status)}</td>
                    <td>
                        <button class="link-btn" onclick="detail('transaction','${t.id}')">Detail</button>
                    </td>
                </tr>
            `).join('');
        if (kind === 'aktivitas')
            html = arr.map(e => `
                <tr>
                    <td>
                        <span class="small-muted">31 Okt 2026 · ${e.time}</span>
                    </td>
                    <td>
                        <div class="person-cell">
                            <div class="initial-avatar">${ico(e.icon, 15)}</div><strong>${e.title}</strong>
                        </div>
                    </td>
                    <td>${e.location}</td>
                    <td>${e.kind}</td>
                    <td>${badge(e.status)}</td>
                </tr>
            `).join('');
        let colspan = kind === 'aktivitas' ? 5 : kind === 'stok' ? 8 : 8;
        let body = document.getElementById('dataRows');
        if (body)
            body.innerHTML = html || `
                <tr>
                    <td colspan="${colspan}" class="empty-state">Tidak ditemukan data yang sesuai filter.</td>
                </tr>
            `;
        let count = document.getElementById('resultCount');
        if (count)
            count.textContent = `Menampilkan ${arr.length} dari ${(kind === 'stok' ? stocks : kind === 'penawaran' ? offers : kind === 'transaksi' ? transactions : events).length} data simulasi`
    }
    function updateTable() {
        if (['stok', 'penawaran', 'transaksi', 'aktivitas'].includes(state.page))
            renderRows(state.page)
    }
    function tablePage(kind) {
        let conf = {
            stok: [
                'DATA PASOKAN',
                'Stok Gabah',
                'Pantau ketersediaan dan distribusi stok gabah petani.',
                'STOK TERSEDIA',
                `${fmtNum(countStocks())} ton`,
                'Total stok belum terjual',
                'ID STOK|PETANI|KABUPATEN|JENIS|VOLUME|WAKTU PANEN|STATUS|AKSI'
            ],
            penawaran: [
                'AKTIVITAS PASAR',
                'Penawaran & Negosiasi',
                'Pantau penawaran pembeli dan proses negosiasi dengan petanni.',
                'PENAWARAN AKTIF',
                `${countOffers()}`,
                'Menunggu atau masih dinegosiasikan',
                'ID PENAWARAN|PEMBELI|PETANI|KABUPATEN|HARGA TAWAR|HARGA AI|STATUS|AKSI'
            ],
            transaksi: [
                'RIWAYAT KESEPAKATAN',
                'Transaksi Disepakati',
                'Pantau riwayat kesepakatan dan status transaksi.',
                'TOTAL NILAI KESEPAKATAN',
                formatRupiah(transactions.filter(x => state.area === 'Semua Wilayah' || x.location === state.area).reduce((a, t) => a + t.volume * 1000 * t.price, 0)),
                'Bukan nilai pembayaran terkonfirmasi',
                'ID TRANSAKSI|PETANI|PEMBELI|KABUPATEN|VOLUME|HARGA JUAL|TOTAL KESEPAKATAN|STATUS|AKSI'
            ],
            aktivitas: [
                'LOG INTERAKSI',
                'Aktivitas Chatbot',
                'Pantau interaksi dan aktivitas chatbot WhatsApp.',
                'INTERAKSI TERCATAT',
                `${events.length}`,
                'Sebagian contoh aktivitas WhatsApp',
                'WAKTU|AKTIVITAS|LOKASI|JENIS|STATUS'
            ]
        }[kind];
        return `
            ${heading(conf[0], conf[1], conf[2])}
            <div class="card page-banner">
                <div>
                    <strong>${conf[3]} · ${conf[4]}</strong>
                    <p>${conf[5]}</p>
                </div>
            </div>${tablePageTools(kind)}
            <section class="card table-card wide">
                <div class="section-header">
                    <div>
                        <h3 class="section-title">Riwayat Transaksi</h3>
                        <div class="section-subtitle">Data simulasi</div>
                    </div>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>${conf[6].split('|').map(h => `
            <th>${h}</th>
        `).join('')}</tr>
                        </thead>
                        <tbody id="dataRows">
                        </tbody>
                    </table>
                </div>
                <div class="rows-footer">
                    <span id="resultCount"></span>
                </div>
            </section>
        `
    }
    function renderAdmin() {
        document.getElementById('crumb').textContent = pages.find(p => p[0] === state.page)?.[2] || 'Overview';
        document.getElementById('nav').innerHTML = pages.map(([id, ic, label]) => `
            <button class="nav-link ${state.page === id ? 'active' : ''}" onclick="go('${id}')">${ico(ic, 18)}<span>${label}</span>${id === 'penawaran' && countOffers('Semua Wilayah') ? `
            <span class="nav-count">${countOffers('Semua Wilayah')}</span>
        ` : ''}</button>
        `).join('');
        document.getElementById('content').innerHTML = FRAME_PAGES[state.page] ? frameHTML(state.page) : state.page === 'overview' ? overview() : tablePage(state.page);
        updateTable()
    }
    function go(page) {
        state.page = page;
        state.query = '';
        state.status = 'Semua Status';
        state.type = 'Semua Jenis';
        state.area = 'Semua Wilayah';
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        closeSide()
    }
    function refreshDemo() {
        toast('Data demo ditampilkan ulang — tidak terhubung server.')
    }
    function toggleSide() {
        document.getElementById('sidebar').classList.toggle('open');
        document.getElementById('overlay').classList.toggle('open')
    }
    function closeSide() {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('overlay').classList.remove('open')
    }
    function showNotifications() {
        showModal('Notifikasi', 'Informasi terbaru', [
            'Ada ' + countOffers('Semua Wilayah') + ' penawaran yang menunggu respons atau penawaran balik.',
            'Saat sistem aktif, peristiwa ini akan dibaca dari database Temu Tani.'
        ].map(t => `
            <div class="activity">
                <div class="activity-icon">${ico('bell', 16)}</div>
                <div>
                    <strong>${t}</strong>
                </div>
            </div>
        `).join(''))
    }
    function showModal(title, subtitle, body) {
        document.getElementById('modal').innerHTML = `
            <div class="modal-top">
                <div>
                    <h2>${title}</h2>
                    <p>${subtitle}</p>
                </div>
                <button class="icon-btn" onclick="closeModal()" aria-label="Tutup">${ico('close', 18)}</button>
            </div>
            <div class="modal-body">${body}</div>
            <div class="modal-bottom">
                <button class="btn" onclick="closeModal()">Tutup</button>
            </div>
        `;
        document.getElementById('modalBackdrop').classList.add('show')
    }
    function closeModal() {
        document.getElementById('modalBackdrop').classList.remove('show')
    }
    function detailsGrid(pairs) {
        return `
            <div class="modal-grid">${pairs.map(([k, v]) => `
            <div class="modal-item">
                <label>${k}</label><strong>${v}</strong>
            </div>
        `).join('')}</div>
        `
    }
    function detail(type, id) {
        let x;
        if (type === 'stock') {
            x = stocks.find(s => s.id === id);
            showModal(`Detail Stok · ${id}`, 'Listing stok dari petani', detailsGrid([
                ['NAMA PETANI', x.farmer],
                ['KABUPATEN', x.location],
                ['JENIS GABAH', x.type],
                ['VOLUME', fmtNum(x.volume) + ' ton'],
                ['WAKTU PANEN', x.harvest],
                ['STATUS', badge(x.status)],
                ['PENAWARAN MASUK', String(x.offers)],
                ['SUMBER', 'Chatbot WhatsApp']
            ]) 
        )
        } else if (type === 'offer') {
            x = offers.find(o => o.id === id);
            showModal(`Detail Penawaran · ${id}`, 'Riwayat negosiasi tersimpan dari chatbot WhatsApp', detailsGrid([
                ['PEMBELI', x.buyer + ' (guest)'],
                ['PETANI', x.farmer],
                ['STOK / VOLUME', x.stock + ' · ' + fmtNum(x.volume) + ' ton'],
                ['KABUPATEN', x.location],
                ['HARGA PENAWARAN', formatRupiah(x.price) + '/kg'],
                ['HARGA REFERENSI AI', formatRupiah(x.ai) + '/kg'],
                ['PENAWARAN BALIK', x.counter ? formatRupiah(x.counter) + '/kg' : '—'],
                ['STATUS', badge(x.status)]
            ]) + `
                <div class="divider">
                </div><strong style="font-size:13px">Jejak Negosiasi</strong>
                <div class="timeline">${x.history.map(y => `
                <div class="timeline-item">
                    <strong>${y[0]}</strong><small>${y[1]} · ${y[2]}</small>
                </div>
            `).join('')}</div>
                <p class="small-muted">Persetujuan/penolakan dilakukan oleh petani lewat WhatsApp, bukan oleh admin.</p>
            `)
        } else if (type === 'transaction') {
            x = transactions.find(t => t.id === id);
            showModal(`Detail Kesepakatan · ${id}`, 'Catatan transaksi Temu Tani', detailsGrid([
                ['PETANI', x.farmer],
                ['PEMBELI', x.buyer],
                ['KABUPATEN', x.location],
                ['VOLUME', fmtNum(x.volume) + ' ton'],
                ['HARGA AKHIR', formatRupiah(x.price) + '/kg'],
                ['TOTAL NILAI', formatRupiah(x.price * x.volume * 1000)],
                ['TANGGAL', x.date],
                ['STATUS', badge(x.status)]
            ])
        )
        }
    }
    let toastTimer;
    function toast(msg) {
        let el = document.getElementById('toast');
        el.innerHTML = ico('check', 16) + msg;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), 3800)
    }
    function exportCSV(which) {
        const rows = which === 'stok' ? stocks : which === 'penawaran' ? offers : which === 'transaksi' ? transactions : events;
        const data = rowFilter(rows);
        const keys = Object.keys(rows[0]).filter(k => k !== 'history');
        const csv = [keys.join(','), ...data.map(row => keys.map(k => '"' + String(row[k] ?? '').replace(/"/g, '""') + '"').join(','))].join('\r\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        const u = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = u;
        a.download = `temu-tani-${which}-simulasi.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(u);
        toast('CSV simulasi berhasil disiapkan.')
    }
    
    function globalQuery(q) {
        if (['stok', 'penawaran', 'transaksi', 'aktivitas'].includes(state.page)) {
            state.query = q;
            let s = document.getElementById('localSearch');
            if (s)
                s.value = q;
            updateTable()
        } else if (q.trim()) {
            go('penawaran');
            state.query = q;
            render()
        }
    }
    // Fungsi yang dipanggil dari atribut onclick/onchange/oninput di admin.html
    Object.assign(window, { go, detail, refreshDemo, exportCSV, closeModal, toggleSide, closeSide, showNotifications, updateTable, globalQuery });
    listenFrameHeight();
    document.getElementById('notifBtn').insertAdjacentHTML('afterbegin', ico('bell', 17));
    document.getElementById('menuToggle').innerHTML = ico('menu', 20);
    document.getElementById('globalSearch').innerHTML = ico('search', 16) + `
        <input placeholder="Cari stok, pembeli, penawaran..." aria-label="Cari di halaman" oninput="globalQuery(this.value)"/>
    `;
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape')
            closeModal()
    });
    renderPage = renderAdmin;
    render();
}

/* ========== 5. Dashboard petani & tengkulak ========== */
function initRoleDashboard() {
 const role = document.body.dataset.role;
 const IS_FARMER = role === 'petani';
 const CURRENT_FARMER = 'F-001';
 const CURRENT_BUYER = 'GUEST-001';
 const STORAGE_KEY = 'temu-tani-role-demo-v1';
 const rupiah = n => formatRupiah(Number(n||0));
 const number = n => Number(n||0).toLocaleString('id-ID',{maximumFractionDigits:2});
 const totalPrice = (ton, perKg) => rupiah(Math.round(ton*1000*perKg));
 const prettyDate = v => {if (!v)return '—'; const d=new Date(v+'T12:00:00');return Number.isNaN(d.getTime())?esc(v):d.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});};
 const fmtTime = v => v ? new Date(v).toLocaleString('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
 const now = () => new Date().toISOString();
 const uid = prefix => prefix + '-' + Math.random().toString(36).slice(2,7).toUpperCase();
 const pageDefs = IS_FARMER ? [
  ['overview','dashboard','Overview'],['stok','wheat','Stok Gabah'],['penawaran','handshake','Penawaran & Negosiasi'],['harga','chart','Prediksi Harga AI'],['transaksi','history','Transaksi Disepakati'],['berita','document','Berita & Analisis']
 ] : [
  ['overview','dashboard','Overview'],['stok','wheat','Stok Gabah'],['penawaran','handshake','Penawaran & Negosiasi'],['transaksi','history','Transaksi Disepakati']
 ];
 const initData = () => ({
  farmers:[
   {id:'F-001',name:'Pak Asep Hidayat',region:'Garut',village:'Tarogong Kidul',maxxiId:'MX-001'},
   {id:'F-002',name:'Pak Dedi Suhendra',region:'Garut',village:'Cisurupan',maxxiId:'MX-002'},
   {id:'F-003',name:'Bu Siti Aminah',region:'Sukabumi',village:'Cisaat',maxxiId:'MX-003'},
   {id:'F-004',name:'Bu Ratna Mulyani',region:'Sukabumi',village:'Cicurug',maxxiId:'MX-004'},
   {id:'F-005',name:'Pak Jajang Kurnia',region:'Garut',village:'Leles',maxxiId:'MX-005'},
   {id:'F-006',name:'Bu Nia Kartika',region:'Sukabumi',village:'Sukaraja',maxxiId:'MX-006'}
  ],
  buyers:[{id:'GUEST-001',label:'Pembeli 08••91'},{id:'GUEST-002',label:'Pembeli 06••27'}],
  stocks:[
   {id:'STK-001',farmerId:'F-001',region:'Garut',type:'GKP',volume:5,harvest:'2026-11-09',status:'Tersedia',moisture:24},
   {id:'STK-002',farmerId:'F-003',region:'Sukabumi',type:'GKP',volume:8.5,harvest:'2026-11-10',status:'Tersedia',moisture:23},
   {id:'STK-003',farmerId:'F-002',region:'Garut',type:'GKP',volume:3.2,harvest:'2026-11-08',status:'Tersedia',moisture:25},
   {id:'STK-004',farmerId:'F-004',region:'Sukabumi',type:'GKP',volume:6,harvest:'2026-11-12',status:'Tersedia',moisture:23},
   {id:'STK-005',farmerId:'F-005',region:'Garut',type:'GKP',volume:4.8,harvest:'2026-11-11',status:'Tersedia',moisture:24},
   {id:'STK-006',farmerId:'F-006',region:'Sukabumi',type:'GKG',volume:7.5,harvest:'2026-11-12',status:'Tersedia',moisture:14},
   {id:'STK-007',farmerId:'F-001',region:'Garut',type:'GKP',volume:2.2,harvest:'2026-11-04',status:'Tersedia',moisture:24},
   {id:'STK-008',farmerId:'F-001',region:'Garut',type:'GKG',volume:1.8,harvest:'2026-11-05',status:'Tersedia',moisture:14}
  ],
  requests:[
   {id:'REQ-001',buyerId:'GUEST-001',region:'Garut',type:'GKP',volume:8,needed:'2026-11-14',created:'2026-11-06T08:10:00+07:00'},
   {id:'REQ-002',buyerId:'GUEST-001',region:'Garut',type:'GKG',volume:1,needed:'2026-11-12',created:'2026-11-05T09:15:00+07:00'},
   {id:'REQ-003',buyerId:'GUEST-002',region:'Garut',type:'GKP',volume:3,needed:'2026-11-15',created:'2026-11-04T13:00:00+07:00'}
  ],
  offers:[
   {id:'OFF-001',requestId:'REQ-001',buyerId:'GUEST-001',farmerId:'F-001',stockId:'STK-001',volume:3,initialBid:6800,currentBid:6800,counter:null,aiRef:7100,status:'Menunggu Petani',created:'2026-11-06T09:10:00+07:00',history:[{at:'2026-11-06T09:10:00+07:00',actor:'Pembeli',label:'Penawaran awal dikirim',price:6800}]},
   {id:'OFF-002',requestId:'REQ-001',buyerId:'GUEST-001',farmerId:'F-002',stockId:'STK-003',volume:3,initialBid:6750,currentBid:6750,counter:7000,aiRef:7100,status:'Penawaran Balik',created:'2026-11-06T09:15:00+07:00',history:[{at:'2026-11-06T09:15:00+07:00',actor:'Pembeli',label:'Penawaran awal dikirim',price:6750},{at:'2026-11-06T09:20:00+07:00',actor:'Petani',label:'Petani mengajukan harga balik',price:7000}]},
   {id:'OFF-003',requestId:'REQ-003',buyerId:'GUEST-002',farmerId:'F-001',stockId:'STK-001',volume:2,initialBid:6700,currentBid:6700,counter:null,aiRef:7100,status:'Ditolak',created:'2026-11-04T13:05:00+07:00',history:[{at:'2026-11-04T13:05:00+07:00',actor:'Pembeli',label:'Penawaran awal dikirim',price:6700},{at:'2026-11-04T13:15:00+07:00',actor:'Petani',label:'Penawaran ditolak',price:null}]},
   {id:'OFF-004',requestId:'REQ-002',buyerId:'GUEST-001',farmerId:'F-001',stockId:'STK-008',volume:1,initialBid:7100,currentBid:7100,counter:7200,aiRef:7350,status:'Disepakati',created:'2026-11-05T09:20:00+07:00',agreedPrice:7200,history:[{at:'2026-11-05T09:20:00+07:00',actor:'Pembeli',label:'Penawaran awal dikirim',price:7100},{at:'2026-11-05T09:30:00+07:00',actor:'Petani',label:'Harga balik diajukan',price:7200},{at:'2026-11-05T09:40:00+07:00',actor:'Pembeli',label:'Harga balik disetujui',price:7200}]},
   {id:'OFF-005',requestId:'REQ-001',buyerId:'GUEST-001',farmerId:'F-001',stockId:'STK-007',volume:1.2,initialBid:7000,currentBid:7000,counter:null,aiRef:7100,status:'Disepakati',agreedPrice:7000,created:'2026-11-04T10:10:00+07:00',history:[{at:'2026-11-04T10:10:00+07:00',actor:'Pembeli',label:'Penawaran awal dikirim',price:7000},{at:'2026-11-04T11:00:00+07:00',actor:'Petani',label:'Penawaran disetujui',price:7000}]}
  ],
  transactions:[
   {id:'TRX-001',offerId:'OFF-004',buyerId:'GUEST-001',farmerId:'F-001',stockId:'STK-008',volume:1,price:7200,date:'2026-11-05',payment:'Belum Dibayar'},
   {id:'TRX-002',offerId:'OFF-005',buyerId:'GUEST-001',farmerId:'F-001',stockId:'STK-007',volume:1.2,price:7000,date:'2026-11-04',payment:'Sudah Dibayar',paidAt:'2026-11-05T11:00:00+07:00'}
  ],
  activities:[
   {id:'EVT-001',at:'2026-11-06T09:10:00+07:00',title:'Penawaran masuk untuk Pak Asep',note:'OFF-001 • 3 ton GKP • Garut'},
   {id:'EVT-002',at:'2026-11-06T09:20:00+07:00',title:'Harga balik dari Pak Dedi',note:'OFF-002 • Rp7.000/kg'},
   {id:'EVT-003',at:'2026-11-05T09:40:00+07:00',title:'Kesepakatan GKG tercatat',note:'TRX-001 • Menunggu pembayaran'},
   {id:'EVT-004',at:'2026-11-05T11:00:00+07:00',title:'Pembayaran transaksi dikonfirmasi',note:'TRX-002 • Sudah dibayar'}
  ]
 });
 let db;
 function load(){
  try {const raw=localStorage.getItem(STORAGE_KEY);const data=raw?JSON.parse(raw):null;db=data && data.farmers && data.offers && data.transactions?data:initData();}
  catch(e){db=initData();}
 }
 function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(db));}catch(e){} render();}
 const farmer = id => db.farmers.find(f=>f.id===id);
 const stock = id => db.stocks.find(s=>s.id===id);
 const buyer = id => db.buyers.find(b=>b.id===id);
 const myFarmer = () => farmer(CURRENT_FARMER);
 const myOffers = () => db.offers.filter(o=>IS_FARMER?o.farmerId===CURRENT_FARMER:o.buyerId===CURRENT_BUYER);
 const myTransactions = () => db.transactions.filter(t=>IS_FARMER?t.farmerId===CURRENT_FARMER:t.buyerId===CURRENT_BUYER);
 const ownStock = () => db.stocks.filter(s=>s.farmerId===CURRENT_FARMER);
 const availability = s => Math.max(0,Math.round((s.volume-db.transactions.filter(t=>t.stockId===s.id).reduce((n,t)=>n+t.volume,0))*100)/100);
 const currentAI = (region,type) => {const map={Garut:{GKP:7100,GKG:7350},Sukabumi:{GKP:7040,GKG:7300}};return map[region]?.[type]||null;};
 const offerStatus = o => o.status;
 const badge = str => {const map={'Tersedia':'green','Disepakati':'green','Sudah Dibayar':'green','Aktif':'green','Menunggu Petani':'gold','Belum Dibayar':'gold','Penawaran Balik':'blue','Menunggu Verifikasi':'blue','Ditolak':'red','Akan Panen':'gray','Ditutup':'gray'};return `<span class="pill ${map[str]||'gray'}">${esc(str)}</span>`;};
 const person = f => `<span class="person-cell"><span class="initial-avatar">${esc(f.name.replace(/^(Pak|Bu) /,'').split(' ').slice(0,2).map(x=>x[0]).join(''))}</span><span><strong>${esc(f.name)}</strong><small>${esc(f.village+', '+f.region)}</small></span></span>`;
 let ui = {page:'overview',query:'',area:'Semua Wilayah',type:'Semua Jenis',status:'Semua Status',requested:'',chart:'GKP'};
 function header(title,desc,action=''){return `<div class="page-heading"><div><div class="overline">TEMU TANI / ${IS_FARMER?'PETANI':'TENGKULAK'}</div><h1>${title}</h1><p>${desc}</p></div><div class="action-row">${action}</div></div>`;}
 function kpi(icon,title,val,foot,theme='green'){return `<div class="card kpi"><div class="kpi-top"><div class="kpi-icon ${theme}">${ico(icon,21)}</div><span class="kpi-name">${title}</span></div><div class="kpi-value">${val}</div><div class="kpi-foot">${foot}</div></div>`;}
 function table(columns,body,footer=''){return `<div class="card table-card"><div class="table-wrap"><table><thead><tr>${columns.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${body||`<tr><td colspan="${columns.length}"><div class="empty-state"><div><strong>Tidak ada data</strong>Belum ada data yang cocok dengan filter.</div></div></td></tr>`}</tbody></table></div>${footer?`<div class="table-foot-note">${footer}</div>`:''}</div>`;}
 function btn(act,label,id='',cl=''){return `<button type="button" class="btn tiny ${cl}" data-act="${act}" data-id="${esc(id)}">${label}</button>`;}
 function activityCard(){return `<section class="card section-card"><div class="section-header"><div><h3 class="section-title">Aktivitas Terkini</h3><div class="section-subtitle">Aktivitas simulasi yang berkaitan dengan transaksi</div></div></div>${db.activities.slice().reverse().slice(0,4).map(a=>`<div class="activity"><div class="activity-icon">${ico('activity',17)}</div><div><strong>${esc(a.title)}</strong><p>${esc(a.note)} · ${fmtTime(a.at)}</p></div></div>`).join('')}</section>`;}
 function overview(){
  if(IS_FARMER){const stocks=ownStock();const o=myOffers(),t=myTransactions();const total=stocks.filter(s=>s.status==='Tersedia').reduce((n,s)=>n+availability(s),0);return header('Selamat datang, Pak Asep','Ringkasan stok dan penawaran Anda di Kabupaten Garut.') +
  `<div class="demo-strip">${ico('info',17)} Tampilan khusus <b style="display:contents">Petani Garut</b>. Stok, penawaran, dan transaksi hanya milik Pak Asep. Harga AI di sini untuk referensi keputusan petani.</div>`+
  `<div class="kpi-grid">${kpi('wheat','Stok Siap Dijual',number(total)+' <span class="kpi-unit">ton</span>',stocks.length+' listing gabah milik Anda')}${kpi('handshake','Penawaran Masuk',o.filter(a=>a.status==='Menunggu Petani').length,'Menunggu keputusan Anda','gold')}${kpi('activity','Sedang Dinegosiasikan',o.filter(a=>a.status==='Penawaran Balik').length,'Harga balik yang diajukan','blue')}${kpi('wallet','Belum Dibayar',t.filter(a=>a.payment!=='Sudah Dibayar').length,'Kesepakatan perlu ditindaklanjuti','lime')}</div>`+
  `<div class="page-banner card"><div><strong>Harga gabah wajar Kabupaten Garut</strong><p>Referensi AI untuk membantu Anda mengevaluasi penawaran pembeli.</p></div><div class="banner-right"><span class="badge-light">GKP · ${rupiah(currentAI('Garut','GKP'))}/kg</span>${btn('navigate','Lihat Prediksi AI','harga','secondary')}</div></div>`+
  `<div class="two-col"><section class="card section-card"><div class="section-header"><div><h3 class="section-title">Penawaran yang perlu ditanggapi</h3><div class="section-subtitle">Penawaran hanya untuk stok milik Anda</div></div></div>${o.filter(a=>a.status==='Menunggu Petani').map(a=>`<div class="stock-row"><div><strong>${esc(a.id)} • ${esc(a.volume)} ton ${esc(stock(a.stockId).type)}</strong><p>${esc(buyer(a.buyerId)?.label||'Pembeli WhatsApp')} • Harga ${rupiah(a.currentBid)}/kg</p></div>${btn('offerDetail','Tanggapi',a.id,'primary')}</div>`).join('')||'<div class="empty-state">Tidak ada penawaran yang menunggu.</div>'}</section>${activityCard()}</div>`+
  `<div class="two-col"><section class="card section-card"><div class="section-header"><div><h3 class="section-title">Ringkasan Stok Saya</h3><div class="section-subtitle">Stok di Kabupaten Garut</div></div>${btn('navigate','Kelola Stok','stok')}</div>${stocks.slice(0,4).map(s=>`<div class="stock-row"><div><strong>${s.id} • ${s.type}</strong><p>Panen ${prettyDate(s.harvest)} · ${s.status}</p></div><span class="stock-meta">${number(availability(s))} ton</span></div>`).join('')}</section><section class="card section-card"><h3 class="section-title">Status Pembayaran</h3><div class="section-subtitle">Kesepakatan milik Anda</div>${t.slice().reverse().map(x=>`<div class="stock-row"><div><strong>${x.id}</strong><p>${totalPrice(x.volume,x.price)} · ${x.volume} ton</p></div>${badge(x.payment)}</div>`).join('')||'<div class="empty-state">Belum ada kesepakatan.</div>'}</section></div>`;
  }
  const bOffers=myOffers(), t=myTransactions(),req=db.requests.filter(r=>r.buyerId===CURRENT_BUYER);const all=db.stocks.filter(s=>s.status==='Tersedia').reduce((n,s)=>n+availability(s),0);const active=bOffers.filter(o=>['Menunggu Petani','Penawaran Balik'].includes(o.status)).length;
  return header('Selamat datang, Pembeli','Cari gabah di berbagai wilayah dan kelola penawaran Anda tanpa registrasi akun.')+
  `<div class="demo-strip">${ico('info',17)} Akun pembeli ini merupakan identitas guest simulasi dari WhatsApp. Hanya permintaan, penawaran, dan transaksi pembeli ini yang ditampilkan.</div>`+
  `<div class="kpi-grid">${kpi('document','Permintaan Saya',req.length,'Permintaan kebutuhan gabah')}${kpi('package','Stok Lintas Wilayah',number(all)+' <span class="kpi-unit">ton</span>','Gabah tersedia di semua kabupaten','lime')}${kpi('handshake','Penawaran Aktif',active,'Menunggu petani / harga balik','gold')}${kpi('check','Kesepakatan',t.length,'Transaksi milik Anda','blue')}</div>`+
  `<div class="page-banner card"><div><strong>Butuh gabah untuk usaha Anda?</strong><p>Sampaikan kebutuhan tonase, jenis gabah, dan kabupaten. Bandingkan stok petani lalu ajukan penawaran harga pertama.</p></div><div class="banner-right">${btn('newRequest',ico('plus',15)+' Buat Permintaan','','secondary')}</div></div>`+
  `<div class="two-col"><section class="card section-card"><div class="section-header"><div><h3 class="section-title">Permintaan Gabah Saya</h3><div class="section-subtitle">Pilih permintaan untuk mencari stok yang sesuai</div></div></div>${req.slice().reverse().map(r=>`<div class="stock-row"><div><strong>${esc(r.id)} • ${number(r.volume)} ton ${r.type}</strong><p>${esc(r.region)} · Dibutuhkan ${prettyDate(r.needed)}</p></div>${btn('searchRequest','Cari Stok',r.id,'secondary')}</div>`).join('')}</section>${activityCard()}</div>`+
  `<div class="card table-card"><div class="section-header"><div><h3 class="section-title">Penawaran Saya</h3><div class="section-subtitle">Perkembangan pengajuan harga kepada petani</div></div>${btn('navigate','Lihat Semua','penawaran')}</div>${offerTable(bOffers.slice().reverse().slice(0,4))}</div>`;
 }
 function filters(page){const showRegion=!IS_FARMER && page==='stok';return `<div class="toolbar"><label class="search-box">${ico('search',16)}<input id="tableSearch" value="${esc(ui.query)}" placeholder="Cari ID, petani, lokasi..." aria-label="Cari data"></label>${showRegion?`<select class="select" id="regionFilter" aria-label="Filter kabupaten"><option value="Semua Wilayah">Semua Wilayah</option>${['Garut','Sukabumi'].map(x=>`<option value="${x}" ${ui.area===x?'selected':''}>${x}</option>`).join('')}</select>`:''}${page==='stok'?`<select class="select" id="typeFilter" aria-label="Jenis gabah">${['Semua Jenis','GKP','GKG'].map(x=>`<option ${ui.type===x?'selected':''}>${x}</option>`).join('')}</select>`:''}${page==='penawaran'||page==='transaksi'?`<select class="select" id="statusFilter" aria-label="Filter status">${['Semua Status',...(page==='penawaran'?['Menunggu Petani','Penawaran Balik','Disepakati','Ditolak']:['Belum Dibayar','Menunggu Verifikasi','Sudah Dibayar'])].map(x=>`<option ${ui.status===x?'selected':''}>${x}</option>`).join('')}</select>`:''}</div>`;}
 function filtered(arr,cb){return arr.filter(x=>!ui.query||cb(x).toLowerCase().includes(ui.query.toLowerCase())).filter(x=>ui.status==='Semua Status'||x.status===ui.status||x.payment===ui.status);}
 function stocksPage(){const my=IS_FARMER;const a=my?ownStock():db.stocks.filter(s=>s.status==='Tersedia'&&availability(s)>0);const b=a.filter(s=>(my||ui.area==='Semua Wilayah'||s.region===ui.area)&&(ui.type==='Semua Jenis'||s.type===ui.type));const list=b.filter(s=>!ui.query||[s.id,s.type,s.region,farmer(s.farmerId)?.name].join(' ').toLowerCase().includes(ui.query.toLowerCase()));
  return header(my?'Stok Gabah Saya':'Stok Gabah',''+(my?'Kelola gabah milik Anda di Kabupaten Garut.':'Jelajahi stok gabah lintas wilayah. Harga awal ditentukan oleh pembeli saat mengajukan penawaran.'), my?btn('newStock',ico('plus',16)+' Tambah Stok','','primary'):btn('newRequest',ico('plus',16)+' Buat Permintaan','','primary'))+
  `<div class="info-strip">${ico('info',18)} ${my?'Petani hanya dapat menambah dan mengubah stok miliknya sendiri. Volume yang sudah disepakati tidak bisa dikurangi.':'Harga jual dan referensi AI tidak ditampilkan kepada pembeli sebelum penawaran. Pilih listing lalu tentukan harga Anda dalam Rp/kg.'}</div>`+filters('stok')+
  table(my?['ID Stok','Jenis','Tanggal Panen','Stok Awal','Tersedia','Status','Aksi']:['Petani','Kabupaten','Jenis','Tanggal Panen','Stok Tersedia','Aksi'],list.map(s=>my?`<tr><td><strong>${esc(s.id)}</strong></td><td>${s.type}</td><td>${prettyDate(s.harvest)}</td><td>${number(s.volume)} ton</td><td><strong>${number(availability(s))} ton</strong></td><td>${badge(s.status)}</td><td>${btn('editStock',ico('edit',13)+' Ubah',s.id)}</td></tr>`:`<tr><td>${person(farmer(s.farmerId))}</td><td>${ico('location',13)} ${esc(s.region)}</td><td>${s.type}</td><td>${prettyDate(s.harvest)}</td><td><strong>${number(availability(s))} ton</strong></td><td>${btn('newOffer','Ajukan Harga',s.id,'primary')}</td></tr>`).join(''),my?'Stok tersedia = volume tercatat − volume yang sudah dialokasikan pada kesepakatan.':'Tampilan hanya memperlihatkan stok yang masih dapat ditawarkan. Harga indikatif petani tidak tersedia.');
 }
 function offerTable(rows){return `<div class="table-wrap"><table><thead><tr>${(IS_FARMER?['Penawaran / Pembeli','Gabah','Penawaran Awal','Harga Balik','Status','Aksi']:['Penawaran / Petani','Gabah','Penawaran Saya','Harga Balik','Status','Aksi']).map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(o=>{const s=stock(o.stockId);let action=btn('offerDetail','Lihat Detail',o.id);if(IS_FARMER&&o.status==='Menunggu Petani')action=btn('offerDetail','Tanggapi',o.id,'primary');if(!IS_FARMER&&o.status==='Penawaran Balik')action=btn('offerDetail','Tanggapi Balik',o.id,'primary');return `<tr><td><strong>${o.id}</strong><small style="display:block;color:#98a49b;margin-top:4px">${IS_FARMER?esc(buyer(o.buyerId)?.label):esc(farmer(o.farmerId)?.name)}</small></td><td>${number(o.volume)} ton ${s?.type||'GKP'}</td><td>${rupiah(o.initialBid)}/kg</td><td>${o.counter?rupiah(o.counter)+'/kg':'—'}</td><td>${badge(o.status)}</td><td>${action}</td></tr>`;}).join('')||'<tr><td colspan="6"><div class="empty-state"><div><strong>Belum ada penawaran</strong>Penawaran akan tampil di sini.</div></div></td></tr>'}</tbody></table></div>`;}
 function offersPage(){let a=filtered(myOffers(),o=>[o.id,o.status,farmer(o.farmerId)?.name,buyer(o.buyerId)?.label,stock(o.stockId)?.type].join(' '));return header('Penawaran & Negosiasi',IS_FARMER?'Tanggapi penawaran yang ditujukan kepada stok Anda, dengan referensi harga wajar AI.':'Pantau penawaran harga yang Anda ajukan dan respons dari masing-masing petani.')+
  `<div class="info-strip">${ico('info',17)} ${IS_FARMER?'Harga wajar AI bersifat referensi untuk petani. Anda bebas menerima, menolak, atau mengajukan harga balik.':'Anda selalu mengajukan harga pertama. Harga referensi AI tidak ditampilkan pada halaman pembeli.'}</div>`+
  `<div class="kpi-grid">${kpi('handshake','Total Penawaran',myOffers().length,'Seluruh penawaran milik Anda')}${kpi('clock',IS_FARMER?'Menunggu Respons Saya':'Menunggu Petani',myOffers().filter(o=>o.status==='Menunggu Petani').length,'Belum direspons','gold')}${kpi('activity','Penawaran Balik',myOffers().filter(o=>o.status==='Penawaran Balik').length,'Proses tawar-menawar','blue')}${kpi('check','Disepakati',myOffers().filter(o=>o.status==='Disepakati').length,'Berhasil mencapai harga akhir','lime')}</div>`+
  filters('penawaran')+`<div class="card table-card"><div class="section-header"><div><h3 class="section-title">Daftar Penawaran</h3><div class="section-subtitle">Setiap petani mempunyai penawaran dan negosiasi terpisah</div></div></div>${offerTable(a)}<div class="table-foot-note">Satu permintaan pembeli dapat menghasilkan beberapa penawaran ke petani berbeda. Semua nominal harga dalam Rp/kg.</div></div>`;
 }
 function trxTable(list){return table(['ID Transaksi',IS_FARMER?'Pembeli':'Petani','Gabah','Volume','Harga Sepakat','Total Nilai','Pembayaran','Aksi'],list.map(t=>{const s=stock(t.stockId);return `<tr><td><strong>${t.id}</strong><small style="display:block;color:#9ba89f">${prettyDate(t.date)}</small></td><td>${IS_FARMER?esc(buyer(t.buyerId)?.label):esc(farmer(t.farmerId)?.name)}</td><td>${s.type}</td><td>${number(t.volume)} ton</td><td>${rupiah(t.price)}/kg</td><td><strong>${totalPrice(t.volume,t.price)}</strong></td><td>${badge(t.payment)}</td><td>${btn('trxDetail','Lihat Detail',t.id)}</td></tr>`;}).join(''),'Status pembayaran merupakan pencatatan simulasi, bukan verifikasi bank atau bukti pembayaran otomatis.');}
 function transactionsPage(){const tx=myTransactions();const list=filtered(tx,t=>[t.id,t.payment,buyer(t.buyerId)?.label,farmer(t.farmerId)?.name,stock(t.stockId)?.type].join(' '));return header('Transaksi Disepakati',IS_FARMER?'Pantau transaksi dari gabah Anda, termasuk pembayaran yang sudah diterima atau masih tertunda.':'Lihat semua kesepakatan Anda dan perbarui konfirmasi pengiriman pembayaran.')+
  `<div class="kpi-grid">${kpi('check','Total Kesepakatan',tx.length,'Transaksi milik Anda')}${kpi('wallet','Sudah Dibayar',tx.filter(t=>t.payment==='Sudah Dibayar').length,'Dikonfirmasi petani','lime')}${kpi('clock','Belum Dibayar',tx.filter(t=>t.payment==='Belum Dibayar').length,'Menunggu pembayaran','gold')}${kpi('activity','Menunggu Verifikasi',tx.filter(t=>t.payment==='Menunggu Verifikasi').length,'Pembeli mengaku sudah membayar','blue')}</div>`+
  `<div class="info-strip">${ico('info',17)} ${IS_FARMER?'Konfirmasi pembayaran diterima hanya ketika dana benar-benar masuk ke rekening Anda.':'Tombol “Saya Sudah Transfer” tidak memindahkan dana. Petani harus mengonfirmasi pembayaran setelah dana diterima.'}</div>`+filters('transaksi')+trxTable(list);
 }
 function render(){
  const page=pageDefs.some(p=>p[0]===ui.page)?ui.page:'overview';
  document.getElementById('crumb').textContent=pageDefs.find(p=>p[0]===page)[2];
  document.getElementById('nav').innerHTML=pageDefs.map(p=>`<button class="nav-link ${page===p[0]?'active':''}" type="button" data-act="navigate" data-id="${p[0]}">${ico(p[1],18)}${p[2]}${p[0]==='penawaran'&&myOffers().filter(o=>IS_FARMER?o.status==='Menunggu Petani':o.status==='Penawaran Balik').length?`<span class="nav-count">${myOffers().filter(o=>IS_FARMER?o.status==='Menunggu Petani':o.status==='Penawaran Balik').length}</span>`:''}</button>`).join('');
  document.getElementById('content').innerHTML=FRAME_PAGES[page]?frameHTML(page,page==='harga'&&IS_FARMER?'?wilayah='+encodeURIComponent(myFarmer().region):''):page==='overview'?overview():page==='stok'?stocksPage():page==='penawaran'?offersPage():transactionsPage();
  document.getElementById('notifBtn').innerHTML=ico('bell',17)+`<span class="notification-dot"></span>`;
  document.getElementById('menuToggle').innerHTML=ico('menu',19);
  const label=IS_FARMER?myFarmer().name:'Pembeli WhatsApp';const small=IS_FARMER?'Kabupaten Garut':'Guest • Semua wilayah';
  for(const key of ['userSide','userTop'])document.getElementById(key).textContent=label;
  for(const key of ['regionSide','regionTop'])document.getElementById(key).textContent=small;
  for(const key of ['avatarSide','avatarTop'])document.getElementById(key).textContent=IS_FARMER?'AH':'TG';
  document.getElementById('roleChip').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:0px;">${IS_FARMER ? SVG.sprout : SVG.truck}</svg>${IS_FARMER ? 'Petani' : 'Tengkulak'}`;
 }
 function modal(title,subtitle,html){document.getElementById('modal').innerHTML=`<div class="modal-top"><div><h2>${title}</h2><p>${subtitle||''}</p></div><button type="button" class="icon-btn" aria-label="Tutup" data-act="closeModal">${ico('close')}</button></div><div class="modal-body">${html}</div>`;document.getElementById('modalBackdrop').classList.add('show');}
 function closeModal(){document.getElementById('modalBackdrop').classList.remove('show');}
 let toastTimer;
 function toast(msg){const el=document.getElementById('toast');el.innerHTML=ico('check',16)+esc(msg);el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3800);}
 function newStock(id=''){
  if(!IS_FARMER)return;
  const s=id?stock(id):null;if(s&&s.farmerId!==CURRENT_FARMER)return;
  const committed=s?s.volume-availability(s):0;
  modal(s?'Perbarui Stok Gabah':'Tambah Stok Gabah','Semua stok otomatis terkait Pak Asep • Kabupaten Garut',`<form id="stockForm" data-id="${s?s.id:''}"><div class="form-grid"><div class="field"><label for="stockType">Jenis gabah</label><select id="stockType" name="type" required ${committed>0?'disabled':''}><option ${s?.type==='GKP'?'selected':''}>GKP</option><option ${s?.type==='GKG'?'selected':''}>GKG</option></select></div><div class="field"><label for="stockVolume">Volume stok total (ton)</label><input id="stockVolume" type="number" name="volume" min="${Math.max(committed,0.01)}" step="0.01" value="${s?.volume||''}" placeholder="Contoh: 2.5" required></div><div class="field"><label for="stockDate">Tanggal panen / tersedia</label><input id="stockDate" name="harvest" type="date" value="${s?.harvest||'2026-11-12'}" required></div><div class="field"><label for="stockStatus">Status stok</label><select id="stockStatus" name="status"><option ${s?.status==='Tersedia'?'selected':''}>Tersedia</option><option ${s?.status==='Akan Panen'?'selected':''}>Akan Panen</option><option ${s?.status==='Ditutup'?'selected':''}>Ditutup</option></select></div><div class="field"><label for="stockMoisture">Kadar air (%) — opsional</label><input id="stockMoisture" type="number" min="0" max="100" step="0.1" name="moisture" value="${s?.moisture||''}" placeholder="Contoh: 24"></div><div class="span-2 field-note">Stok yang sudah disepakati: ${number(committed)} ton. Volume total tidak boleh lebih kecil dari jumlah ini.</div></div><div class="form-actions"><button type="button" class="btn" data-act="closeModal">Batal</button><button class="btn primary" type="submit">${s?'Simpan Perubahan':'Tambah Stok'}</button></div></form>`);
 }
 function newRequest(){if(IS_FARMER)return;modal('Ajukan Kebutuhan Gabah','Permintaan digunakan untuk mencari stok yang sesuai tanpa menampilkan harga petani.',`<form id="requestForm"><div class="form-grid"><div class="field"><label>Jenis gabah</label><select name="type" required><option>GKP</option><option>GKG</option></select></div><div class="field"><label>Jumlah yang dibutuhkan (ton)</label><input type="number" min="0.01" step="0.01" name="volume" required placeholder="Contoh: 8"></div><div class="field"><label>Kabupaten tujuan</label><select name="region" required><option>Garut</option><option>Sukabumi</option></select></div><div class="field"><label>Batas kebutuhan</label><input type="date" name="needed" value="2026-11-15" required></div><div class="span-2 field-note">Setelah menyimpan, Anda akan diarahkan ke daftar stok yang sesuai. Penawaran dikirim per petani, dan Anda menentukan harganya terlebih dahulu.</div></div><div class="form-actions"><button class="btn" type="button" data-act="closeModal">Batal</button><button class="btn primary" type="submit">Simpan & Cari Stok</button></div></form>`);}
 function requestOptions(s){const requests=db.requests.filter(r=>r.buyerId===CURRENT_BUYER&&r.region===s.region&&r.type===s.type);return `<option value="">Buat permintaan baru otomatis</option>`+requests.map(r=>`<option value="${r.id}" ${ui.requested===r.id?'selected':''}>${r.id} • ${r.volume} ton ${r.type} • ${r.region}</option>`).join('');}
 function newOffer(id){if(IS_FARMER)return;const s=stock(id);if(!s||s.status!=='Tersedia'||availability(s)<=0)return toast('Stok tidak lagi tersedia.');const f=farmer(s.farmerId);modal('Ajukan Penawaran Harga',`Stok ${s.id} • ${f.name} • ${s.region}`,`<div class="notice-card" style="margin-bottom:16px">${ico('wheat',17)} <b>${number(availability(s))} ton ${s.type}</b> tersedia di ${esc(s.region)} · Estimasi panen ${prettyDate(s.harvest)}<div class="detail-sub">Tidak ada harga indikatif petani. Anda menentukan harga penawaran pertama.</div></div><form id="offerForm" data-id="${s.id}"><div class="form-grid"><div class="field span-2"><label>Permintaan kebutuhan (opsional)</label><select name="requestId">${requestOptions(s)}</select></div><div class="field"><label>Volume ditawarkan (ton)</label><input name="volume" type="number" step="0.01" min="0.01" required placeholder="Contoh: 2"></div><div class="field"><label>Harga pertama Anda (Rp/kg)</label><input name="price" type="number" step="1" min="1" required placeholder="Contoh: 6800"></div></div><div class="form-actions"><button type="button" class="btn" data-act="closeModal">Batal</button><button class="btn primary" type="submit">${ico('send',15)} Kirim Penawaran</button></div></form>`);}
 function offerDetail(id){const o=db.offers.find(x=>x.id===id);if(!o||!myOffers().includes(o))return toast('Penawaran tidak ditemukan.');const s=stock(o.stockId),far=farmer(o.farmerId),buy=buyer(o.buyerId);const editable=IS_FARMER&&o.status==='Menunggu Petani'||!IS_FARMER&&o.status==='Penawaran Balik';
  const priceInfo=IS_FARMER?`<div class="metric-row"><div class="metric-small"><small>Harga Penawaran Pembeli</small><strong>${rupiah(o.currentBid)}</strong></div><div class="metric-small"><small>Harga Referensi AI</small><strong>${rupiah(o.aiRef)}</strong></div><div class="metric-small"><small>Harga Balik Anda</small><strong>${o.counter?rupiah(o.counter):'—'}</strong></div></div>`:`<div class="metric-row"><div class="metric-small"><small>Penawaran Pertama Anda</small><strong>${rupiah(o.initialBid)}</strong></div><div class="metric-small"><small>Harga Penawaran Terakhir</small><strong>${rupiah(o.currentBid)}</strong></div><div class="metric-small"><small>Harga Balik Petani</small><strong>${o.counter?rupiah(o.counter):'—'}</strong></div></div>`;
  let actions='';
  if(IS_FARMER&&editable)actions=`<div class="divider"></div><div class="notice-positive">Referensi AI: <b>${rupiah(o.aiRef)}/kg</b>. Nilai ini hanya pertimbangan, bukan harga jual wajib.</div><div class="form-actions">${btn('rejectOffer','Tolak Penawaran',o.id,'danger')}${btn('counterOffer','Ajukan Harga Balik',o.id,'secondary')}${btn('acceptOffer','Terima Harga '+rupiah(o.currentBid),o.id,'primary')}</div>`;
  if(!IS_FARMER&&editable)actions=`<div class="divider"></div><div class="notice-card">Petani mengajukan harga balik <b>${rupiah(o.counter)}/kg</b>. Anda dapat menerima atau mengajukan harga baru.</div><div class="form-actions">${btn('rebidOffer','Tawar Lagi',o.id,'secondary')}${btn('acceptCounter','Setujui '+rupiah(o.counter),o.id,'primary')}</div>`;
  modal('Detail '+o.id,`${number(o.volume)} ton ${s.type} • ${esc(s.region)} • ${esc(IS_FARMER?buy.label:far.name)}`,`<div class="price-block"><div><small>Status negosiasi</small>${badge(o.status)}</div><div><small>Volume ditawar</small><span class="quote-amount">${number(o.volume)} ton ${s.type}</span></div></div><div class="divider"></div>${priceInfo}<div class="divider"></div><h3 class="section-title">Riwayat Negosiasi</h3><div class="timeline">${o.history.map(x=>`<div class="timeline-item"><strong>${esc(x.label)}</strong><small>${fmtTime(x.at)} · ${x.actor}${x.price?' · '+rupiah(x.price)+'/kg':''}</small></div>`).join('')}</div>${actions}`);
 }
 function trxDetail(id){const t=db.transactions.find(x=>x.id===id);if(!t||!myTransactions().includes(t))return toast('Transaksi tidak ditemukan.');const s=stock(t.stockId),far=farmer(t.farmerId),buy=buyer(t.buyerId);let actions='';if(IS_FARMER&&t.payment==='Menunggu Verifikasi')actions=`<div class="notice-positive">Pembeli menyatakan telah melakukan transfer. Pastikan dana benar-benar diterima sebelum mengonfirmasi.</div><div class="form-actions">${btn('verifyPayment','Konfirmasi Dana Diterima',t.id,'primary')}</div>`;if(!IS_FARMER&&t.payment==='Belum Dibayar')actions=`<div class="notice-card">Setelah mengirim uang melalui metode yang disepakati di luar aplikasi, Anda dapat melaporkan bahwa transfer telah dilakukan.</div><div class="form-actions">${btn('markPaid','Saya Sudah Transfer',t.id,'primary')}</div>`;
  modal('Detail Transaksi '+t.id,`${s.type} • ${s.region} • Kesepakatan harga`, `<div class="metric-row"><div class="metric-small"><small>Volume</small><strong>${number(t.volume)} ton</strong></div><div class="metric-small"><small>Harga akhir</small><strong>${rupiah(t.price)}</strong></div><div class="metric-small"><small>Total disepakati</small><strong>${totalPrice(t.volume,t.price)}</strong></div></div><div class="divider"></div><div class="modal-grid"><div class="modal-item"><label>Petani</label><strong>${esc(far.name)}</strong></div><div class="modal-item"><label>Pembeli</label><strong>${esc(buy.label)}</strong></div><div class="modal-item"><label>ID Penawaran</label><strong>${t.offerId}</strong></div><div class="modal-item"><label>Status Pembayaran</label>${badge(t.payment)}</div><div class="modal-item"><label>Tanggal Kesepakatan</label><strong>${prettyDate(t.date)}</strong></div><div class="modal-item"><label>Lokasi</label><strong>${s.region}</strong></div></div><div class="divider"></div>${actions||'<div class="notice-card">Tidak ada tindakan pembayaran yang diperlukan pada status ini.</div>'}`);
 }
 function counterOffer(id,mode='farmer'){const o=db.offers.find(x=>x.id===id);if(!o||!myOffers().includes(o))return;const farmerMode=IS_FARMER;const expected=farmerMode?'Menunggu Petani':'Penawaran Balik';if(o.status!==expected)return toast('Status penawaran sudah berubah.');modal(farmerMode?'Ajukan Harga Balik':'Ajukan Harga Baru',`Penawaran ${o.id} • ${number(o.volume)} ton ${stock(o.stockId).type}`,`<form id="counterForm" data-id="${o.id}"><div class="form-grid"><div class="field span-2"><label>Harga yang Anda ajukan (Rp/kg)</label><input name="price" type="number" min="1" step="1" required placeholder="Contoh: 7000"></div><div class="span-2 field-note">${farmerMode?`Harga balik harus lebih tinggi dari penawaran pembeli: <b>${rupiah(o.currentBid)}/kg</b>.`:`Harga balik petani: <b>${rupiah(o.counter)}/kg</b>. Harga Anda tidak boleh lebih rendah dari penawaran pertama Anda: <b>${rupiah(o.initialBid)}/kg</b>.`}</div>${farmerMode?`<div class="span-2 notice-positive">Harga referensi AI untuk petani: <b>${rupiah(o.aiRef)}/kg</b>. Anda bebas menentukan harga balik.</div>`:''}</div><div class="form-actions"><button type="button" class="btn" data-act="closeModal">Batal</button><button class="btn primary" type="submit">Kirim ${farmerMode?'Harga Balik':'Penawaran Baru'}</button></div></form>`);}
 function appendEvent(title,note){db.activities.unshift({id:uid('EVT'),at:now(),title,note});db.activities=db.activities.slice(0,30);}
 function addAgreement(o,agreed){if(o.status==='Disepakati')return false;const s=stock(o.stockId);if(!s||s.status!=='Tersedia'||availability(s)+1e-8<o.volume){toast('Stok sudah berkurang. Penawaran tidak dapat disetujui.');return false;}o.status='Disepakati';o.agreedPrice=agreed;o.history.push({at:now(),actor:IS_FARMER?'Petani':'Pembeli',label:'Harga disepakati',price:agreed});const tx={id:uid('TRX'),offerId:o.id,buyerId:o.buyerId,farmerId:o.farmerId,stockId:o.stockId,volume:o.volume,price:agreed,date:new Date().toISOString().slice(0,10),payment:'Belum Dibayar'};db.transactions.push(tx);appendEvent('Kesepakatan baru '+o.id,tx.id+' • '+number(o.volume)+' ton');save();return true;}
 function actions(act,id){
  if(act==='navigate'){ui.page=id;ui.query='';ui.status='Semua Status';if(IS_FARMER)ui.area='Garut';closeModal();render();closeSide();return;}
  if(act==='closeModal'){closeModal();return;}
  if(act==='newStock')return newStock();
  if(act==='editStock')return newStock(id);
  if(act==='newRequest')return newRequest();
  if(act==='newOffer')return newOffer(id);
  if(act==='offerDetail')return offerDetail(id);
  if(act==='trxDetail')return trxDetail(id);
  if(act==='counterOffer'||act==='rebidOffer')return counterOffer(id);
  if(act==='acceptOffer'&&IS_FARMER){const o=db.offers.find(x=>x.id===id&&x.farmerId===CURRENT_FARMER&&x.status==='Menunggu Petani');if(o&&confirm('Terima harga '+rupiah(o.currentBid)+'/kg untuk '+o.volume+' ton?')){if(addAgreement(o,o.currentBid)){closeModal();toast('Penawaran berhasil disepakati.');}}return;}
  if(act==='rejectOffer'&&IS_FARMER){const o=db.offers.find(x=>x.id===id&&x.farmerId===CURRENT_FARMER&&x.status==='Menunggu Petani');if(o&&confirm('Tolak penawaran ini?')){o.status='Ditolak';o.history.push({at:now(),actor:'Petani',label:'Penawaran ditolak',price:null});appendEvent('Penawaran ditolak '+id,'Petani menolak tawaran');closeModal();save();toast('Penawaran ditolak.');}return;}
  if(act==='acceptCounter'&&!IS_FARMER){const o=db.offers.find(x=>x.id===id&&x.buyerId===CURRENT_BUYER&&x.status==='Penawaran Balik');if(o&&confirm('Setujui harga balik '+rupiah(o.counter)+'/kg?')){if(addAgreement(o,o.counter)){closeModal();toast('Harga balik disepakati.');}}return;}
  if(act==='markPaid'&&!IS_FARMER){const t=db.transactions.find(x=>x.id===id&&x.buyerId===CURRENT_BUYER&&x.payment==='Belum Dibayar');if(t&&confirm('Anda sudah benar-benar melakukan transfer di luar aplikasi?')){t.payment='Menunggu Verifikasi';t.claimedPaidAt=now();appendEvent('Pembeli melaporkan transfer '+id,'Menunggu konfirmasi petani');closeModal();save();toast('Laporan transfer dicatat. Menunggu verifikasi petani.');}return;}
  if(act==='verifyPayment'&&IS_FARMER){const t=db.transactions.find(x=>x.id===id&&x.farmerId===CURRENT_FARMER&&x.payment==='Menunggu Verifikasi');if(t&&confirm('Apakah dana benar-benar sudah masuk ke rekening Anda?')){t.payment='Sudah Dibayar';t.paidAt=now();appendEvent('Pembayaran dikonfirmasi '+id,'Dana diterima petani');closeModal();save();toast('Pembayaran telah dikonfirmasi.');}return;}
  if(act==='searchRequest'&&!IS_FARMER){const r=db.requests.find(x=>x.id===id&&x.buyerId===CURRENT_BUYER);if(r){ui.requested=r.id;ui.area=r.region;ui.type=r.type;ui.page='stok';ui.query='';ui.status='Semua Status';render();toast('Menampilkan stok yang sesuai '+r.id);closeSide();}return;}
  if(act==='resetDemo'&&confirm('Kembalikan seluruh data simulasi seperti semula di browser ini?')){db=initData();save();closeModal();toast('Data simulasi dikembalikan.');}
 }
 function handleForm(e){const form=e.target;if(!['stockForm','offerForm','requestForm','counterForm'].includes(form.id))return;e.preventDefault();const data=new FormData(form);
  if(form.id==='stockForm'&&IS_FARMER){const id=form.dataset.id;const s=id?stock(id):null;const volume=Number(data.get('volume'));const committed=s?s.volume-availability(s):0;if(!Number.isFinite(volume)||volume<=0||volume+1e-8<committed)return toast('Volume harus positif dan tidak kurang dari volume yang telah disepakati.');const status=String(data.get('status'));const change={type:s&&committed>0?s.type:String(data.get('type')),volume,harvest:String(data.get('harvest')),status,moisture:Number(data.get('moisture'))||null};if(s){if(s.farmerId!==CURRENT_FARMER)return;Object.assign(s,change);}else{db.stocks.push({id:uid('STK'),farmerId:CURRENT_FARMER,region:myFarmer().region,...change});}appendEvent(s?'Stok diperbarui':'Stok baru ditambahkan',`${number(volume)} ton ${change.type} • Garut`);closeModal();save();toast(s?'Stok berhasil diperbarui.':'Stok gabah berhasil ditambahkan.');return;}
  if(form.id==='requestForm'&&!IS_FARMER){const volume=Number(data.get('volume'));if(!Number.isFinite(volume)||volume<=0)return toast('Volume tidak valid.');const r={id:uid('REQ'),buyerId:CURRENT_BUYER,type:String(data.get('type')),region:String(data.get('region')),volume,needed:String(data.get('needed')),created:now()};db.requests.push(r);appendEvent('Permintaan pembeli baru '+r.id,`${number(volume)} ton ${r.type} • ${r.region}`);ui.area=r.region;ui.type=r.type;ui.requested=r.id;ui.page='stok';ui.query='';closeModal();save();toast('Permintaan tersimpan. Pilih petani untuk menawar.');return;}
  if(form.id==='offerForm'&&!IS_FARMER){const s=stock(form.dataset.id);const qty=Number(data.get('volume'));const price=Number(data.get('price'));if(s&&s.status==='Tersedia'&&qty>0&&availability(s)+1e-8<qty){alert(`Volume yang Anda tawarkan (${number(qty)} ton) melebihi stok tersedia (${number(availability(s))} ton ${s.type}).\n\nKurangi volume penawaran Anda.`);return;}if(!s||s.status!=='Tersedia'||availability(s)+1e-8<qty||qty<=0||!Number.isFinite(price)||price<=0)return toast('Data penawaran tidak valid atau stok tidak mencukupi.');let req=db.requests.find(r=>r.id===data.get('requestId')&&r.buyerId===CURRENT_BUYER);if(req&&(req.region!==s.region||req.type!==s.type))return toast('Permintaan tidak sesuai lokasi atau jenis gabah.');if(!req){req={id:uid('REQ'),buyerId:CURRENT_BUYER,type:s.type,region:s.region,volume:qty,needed:s.harvest,created:now()};db.requests.push(req);}const o={id:uid('OFF'),requestId:req.id,buyerId:CURRENT_BUYER,farmerId:s.farmerId,stockId:s.id,volume:qty,initialBid:price,currentBid:price,counter:null,aiRef:currentAI(s.region,s.type),status:'Menunggu Petani',created:now(),history:[{at:now(),actor:'Pembeli',label:'Penawaran awal dikirim',price}]};db.offers.push(o);appendEvent('Penawaran baru '+o.id,`${qty} ton ${s.type} • ${s.region}`);ui.page='penawaran';ui.status='Semua Status';ui.query='';closeModal();save();toast('Penawaran dikirim kepada petani.');return;}
  if(form.id==='counterForm'){const o=db.offers.find(x=>x.id===form.dataset.id);const p=Number(data.get('price'));
  if(!o||!Number.isFinite(p)||p<=0)return toast('Harga belum valid.');
  if(IS_FARMER){if(o.farmerId!==CURRENT_FARMER||o.status!=='Menunggu Petani')return toast('Penawaran tidak bisa diubah.');if(p<=o.currentBid){alert(`Harga balik harus lebih tinggi dari harga yang diajukan pembeli (${rupiah(o.currentBid)}/kg).`);return;}o.counter=p;o.status='Penawaran Balik';o.history.push({at:now(),actor:'Petani',label:'Harga balik diajukan',price:p});appendEvent('Petani mengajukan harga balik '+o.id,rupiah(p)+'/kg');}
  else{if(o.buyerId!==CURRENT_BUYER||o.status!=='Penawaran Balik')return toast('Penawaran tidak bisa diubah.');if(p<o.initialBid){alert(`Harga Anda tidak boleh lebih rendah dari penawaran pertama Anda (${rupiah(o.initialBid)}/kg).`);return;}if(p>o.counter&&!confirm(`Petani memberi harga ${rupiah(o.counter)}/kg, apakah Anda yakin memberi harga balik ${rupiah(p)}/kg?`))return;o.currentBid=p;o.counter=null;o.status='Menunggu Petani';o.history.push({at:now(),actor:'Pembeli',label:'Penawaran baru diajukan',price:p});appendEvent('Pembeli mengajukan harga baru '+o.id,rupiah(p)+'/kg');}
  closeModal();save();toast(IS_FARMER?'Harga balik berhasil dikirim.':'Harga penawaran baru dikirim.');return;}
 }
 function closeSide(){document.getElementById('sidebar').classList.remove('open');document.getElementById('overlay').classList.remove('open');}
 function bindEvents(){document.addEventListener('click',e=>{const btn=e.target.closest('[data-act]');if(btn){actions(btn.dataset.act,btn.dataset.id||'');return;}});
  document.addEventListener('submit',handleForm);
  document.addEventListener('input',e=>{if(e.target.id==='tableSearch'){ui.query=e.target.value;const a=e.target.selectionStart;render();const n=document.getElementById('tableSearch');if(n){n.focus();n.setSelectionRange(a,a);}}});
  document.addEventListener('change',e=>{const el=e.target;if(el.id==='regionFilter')ui.area=el.value;else if(el.id==='typeFilter')ui.type=el.value;else if(el.id==='statusFilter')ui.status=el.value;else return;render();});
  document.getElementById('modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal();});
  document.getElementById('menuToggle').addEventListener('click',()=>{document.getElementById('sidebar').classList.toggle('open');document.getElementById('overlay').classList.toggle('open');});
  document.getElementById('overlay').addEventListener('click',closeSide);
  document.getElementById('notifBtn').addEventListener('click',()=>modal('Notifikasi','Ringkasan aktivitas yang memerlukan perhatian',`<div class="card-stack">${IS_FARMER?`<div class="notice-card">${myOffers().filter(o=>o.status==='Menunggu Petani').length} penawaran menunggu keputusan Anda.</div><div class="notice-card">${myTransactions().filter(t=>t.payment==='Menunggu Verifikasi').length} pembayaran menunggu konfirmasi.</div>`:`<div class="notice-card">${myOffers().filter(o=>o.status==='Penawaran Balik').length} harga balik petani menunggu respons.</div><div class="notice-card">${myTransactions().filter(t=>t.payment==='Belum Dibayar').length} transaksi belum ditandai transfer.</div>`}<button class="btn" type="button" data-act="resetDemo">${ico('refresh',16)} Reset data simulasi</button></div>`));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
  window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY){load();render();}});
 }
 listenFrameHeight(300);
 load();bindEvents();render();
}

/* ========== 6. Konten iframe: Prediksi Harga AI (harga.html) ========== */
function initHarga() {
    // Dashboard petani mengirim ?wilayah=<kabupaten petani>; prediksi dikunci ke wilayah itu.
    const locked = new URLSearchParams(window.location.search).get('wilayah');
    if (locked && priceData[locked]) {
        state.lockedArea = locked;
        state.area = locked;
    }
    renderPage = function () {
        document.getElementById('content').innerHTML = hargaPage();
        postHeight();
    };
    // Breakpoint mengikuti lebar jendela dashboard induk (fallback: jendela sendiri),
    // karena @media di dalam iframe membaca lebar iframe, bukan lebar dashboard.
    function viewportWidth() {
        try {
            if (window.parent && window.parent !== window) return window.parent.innerWidth;
        } catch (e) { }
        return window.innerWidth;
    }
    function applyBreakpoints() {
        const w = viewportWidth(), root = document.documentElement;
        root.classList.toggle('mq-1230', w <= 1230);
        root.classList.toggle('mq-1000', w <= 1000);
        root.classList.toggle('mq-620', w <= 620);
    }
    function postHeight() {
        postFrameHeight('harga', Math.ceil(document.getElementById('content').getBoundingClientRect().height));
    }
    applyBreakpoints();
    render();
    window.addEventListener('resize', function () {
        applyBreakpoints();
        postHeight();
    });
    window.addEventListener('load', postHeight);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(postHeight);
    if ('ResizeObserver' in window) new ResizeObserver(postHeight).observe(document.getElementById('content'));
}

/* ========== 7. Konten iframe: Berita & Analisis (berita.html) ========== */
function initBerita() {
 let NEWS = [];
 const PAGE_SIZE = 5;
 let currentPage = 1;
 let selectedId = null;
 let filtered = [];
 const $ = id => document.getElementById(id);
 const pad = n => String(n).padStart(2,'0');
 const fmt = s => { const d=new Date(s+'T00:00:00'); return d.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}); };

 function parseCSV(text){
  const rows=[]; let row=[], field='', quoted=false;
  for(let i=0;i<text.length;i++){
   const ch=text[i], next=text[i+1];
   if(quoted){
    if(ch==='"' && next==='"'){field+='"';i++;}
    else if(ch==='"'){quoted=false;}
    else field+=ch;
   }else{
    if(ch==='"' && field.length===0) quoted=true;
    else if(ch===','){row.push(field);field='';}
    else if(ch==='\n'){row.push(field);rows.push(row);row=[];field='';}
    else if(ch==='\r'){/* ignore CR; LF ends row */}
    else field+=ch;
   }
  }
  if(field.length || row.length){row.push(field);rows.push(row);}
  if(!rows.length) return [];
  const headers=rows.shift().map((v,i)=>i===0?v.replace(/^\uFEFF/,'').trim():v.trim());
  return rows.filter(r=>r.some(v=>v.trim()!=='')).map(r=>{
   const obj={}; headers.forEach((key,i)=>obj[key]=(r[i]??'').trim()); return obj;
  });
 }
 async function loadNewsCSV(){
  const response=await fetch('./berita.csv',{cache:'no-store'});
  if(!response.ok) throw new Error(`HTTP ${response.status} saat membaca berita.csv`);
  const csv=await response.text();
  const rows=parseCSV(csv);
  NEWS=rows.map((r,i)=>{
   let entities=[];
   try{entities=JSON.parse(r.ner_results||'[]');if(!Array.isArray(entities))entities=[];}catch(e){console.warn('ner_results tidak valid pada baris',i+2,e);}
   return {
    id:r.id||String(i+1),tanggal:(r.tanggal||'').slice(0,10),kabupaten:r.kabupaten||'',
    sumber:r.sumber||'',kategori:r.kategori||'',judul:r.judul||'',isi:r.isi||'',
    status_data:r.status_data||'',ner_results:entities
   };
  }).filter(n=>n.tanggal && n.judul);
  if(!NEWS.length) throw new Error('berita.csv berhasil dibaca, tetapi tidak ada baris berita yang valid.');
 }
 function setDefaultDates(){
  const dates=NEWS.map(n=>n.tanggal).filter(Boolean).sort();
  const max=dates[dates.length-1] || new Date().toISOString().slice(0,10);
  const end=new Date(max+'T00:00:00'); const start=new Date(end); start.setDate(start.getDate()-6);
  $('dateFrom').value=`${start.getFullYear()}-${pad(start.getMonth()+1)}-${pad(start.getDate())}`;
  $('dateTo').value=max;
 }
 const nerClass = {
  'GPE':'loc','LOC':'loc',
  'ORG':'org','NOR':'org',
  'PRD':'com',
  'EVT':'act',
  'QTY':'qty'
 };
 function highlight(text, entities){
  const source = String(text ?? '');
  const matches = [];
  (entities || []).forEach(entity => {
   const word = String(entity.word || '').trim();
   const type = nerClass[entity.entity] || 'other';
   if(!word) return;
   const escaped = word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   const re = new RegExp(escaped,'gi');
   let match;
   while((match=re.exec(source))!==null){
    matches.push({start:match.index,end:match.index+match[0].length,type,score:entity.score});
    if(match[0].length===0) re.lastIndex++;
   }
  });
  matches.sort((a,b)=>a.start-b.start || (b.end-b.start)-(a.end-a.start));
  let out='', pos=0;
  matches.forEach(m=>{
   if(m.start<pos) return;
   const score = Number.isFinite(Number(m.score)) ? ` title="NER: ${esc(m.type.toUpperCase())} · confidence ${Number(m.score).toFixed(2)}"` : '';
   out += esc(source.slice(pos,m.start))+`<mark class="ner ${m.type}"${score}>${esc(source.slice(m.start,m.end))}</mark>`;
   pos=m.end;
  });
  return out+esc(source.slice(pos));
 }
 function renderFeature(){
  const item=filtered.find(n=>n.id===selectedId)||filtered[0];
  if(!item){$('featured').innerHTML='<div class="empty">Tidak ada berita pada rentang tanggal ini.</div>';$('latestId').textContent='';return;}
  selectedId=item.id;
  $('latestId').textContent=item.id;
  $('featured').innerHTML=`<h2>${highlight(item.judul,item.ner_results)}</h2><div class="meta"><span>◷ ${fmt(item.tanggal)}</span><span>⌖ ${esc(item.kabupaten)}</span><span>▤ ${esc(item.kategori)}</span><span>✦ ${esc(item.sumber)}</span></div><p class="article-text">${highlight(item.isi,item.ner_results)}</p><div class="legend"><span><i class="swatch" style="background:#78a4e8"></i>Lokasi (GPE/LOC)</span><span><i class="swatch" style="background:#b294df"></i>Organisasi/Tokoh (ORG/NOR)</span><span><i class="swatch" style="background:#e5b65e"></i>Produk (PRD)</span><span><i class="swatch" style="background:#81c69a"></i>Peristiwa (EVT)</span><span><i class="swatch" style="background:#79bdb6"></i>Kuantitas (QTY)</span></div>`;
 }
 function renderList(){
  const others=filtered.filter(n=>n.id!==selectedId);
  const totalPages=Math.max(1,Math.ceil(others.length/PAGE_SIZE));currentPage=Math.min(currentPage,totalPages);
  const start=(currentPage-1)*PAGE_SIZE;const page=others.slice(start,start+PAGE_SIZE);
  $('totalTag').textContent=`${others.length} BERITA`;
  $('listSummary').textContent=`${others.length} berita lain dalam rentang tanggal terpilih`;
  $('newsList').innerHTML=page.length?page.map(n=>{const d=new Date(n.tanggal+'T00:00:00');return `<article class="news-item"><div class="news-date"><b>${pad(d.getDate())}</b><small>${d.toLocaleDateString('id-ID',{month:'short'})}</small></div><div class="news-info"><button type="button" data-id="${esc(n.id)}">${esc(n.judul)}</button><small>${esc(n.kabupaten)} · ${esc(n.kategori)} · ${fmt(n.tanggal)}</small></div></article>`}).join(''):'<div class="empty">Belum ada berita lainnya pada periode ini.</div>';
  $('pageInfo').textContent=others.length?`Menampilkan ${start+1}–${Math.min(start+PAGE_SIZE,others.length)} dari ${others.length} berita`:'Tidak ada berita lainnya';
  $('pages').innerHTML=`<button class="page-btn" data-page="${currentPage-1}" ${currentPage===1?'disabled':''}>‹</button>`+Array.from({length:totalPages},(_,i)=>`<button class="page-btn ${currentPage===i+1?'active':''}" data-page="${i+1}">${i+1}</button>`).join('')+`<button class="page-btn" data-page="${currentPage+1}" ${currentPage===totalPages?'disabled':''}>›</button>`;
 }
 function renderCloud(){
  const stop=new Set(('yang dan di ke dari untuk pada dengan dalam sebagai atau agar ini itu oleh akan dapat lebih juga menjadi terhadap saat setelah sebelum karena jika serta para suatu tidak perlu secara dapat bahwa adalah mulai sejumlah wilayah hasil kondisi informasi artikel berita petani padi kabupaten kecamatan').split(' '));
  const counts={};
  filtered.forEach(n=>(n.judul+' '+n.isi).toLowerCase().match(/[a-zA-ZÀ-ÿ]{3,}/g)?.forEach(w=>{if(!stop.has(w))counts[w]=(counts[w]||0)+1;}));
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,34);const max=top[0]?.[1]||1;const min=top[top.length-1]?.[1]||1;
  const colors=['#287b55','#568cba','#b47b35','#8b69b0','#4c9a8b','#c16c63'];
  $('wordCloud').innerHTML=top.length?top.map(([w,c],i)=>`<span class="word" title="${c} kali" style="font-size:${Math.round(12+(c-min)/(max-min||1)*19)}px;color:${colors[i%colors.length]}">${esc(w)}</span>`).join(''):'<div class="cloud-empty">Tidak ada kata untuk ditampilkan.</div>';
  $('statNews').textContent=filtered.length;$('statWords').textContent=Object.keys(counts).length;
 }
 function applyFilter(){
  const from=$('dateFrom').value,to=$('dateTo').value;
  if(!from||!to){alert('Pilih tanggal awal dan akhir terlebih dahulu.');return;}
  if(from>to){alert('Tanggal awal tidak boleh melebihi tanggal akhir.');return;}
  filtered=NEWS.filter(n=>n.tanggal>=from&&n.tanggal<=to).sort((a,b)=>b.tanggal.localeCompare(a.tanggal)||b.id.localeCompare(a.id));
  selectedId=filtered[0]?.id||null;currentPage=1;
  $('rangeInfo').textContent=`${fmt(from)} – ${fmt(to)} · ${filtered.length} berita`;
  renderFeature();renderList();renderCloud();
 }
 $('applyFilter').addEventListener('click',applyFilter);
 $('lastWeek').addEventListener('click',()=>{setDefaultDates();applyFilter();});
 $('newsList').addEventListener('click',e=>{const b=e.target.closest('button[data-id]');if(!b)return;selectedId=b.dataset.id;currentPage=1;renderFeature();renderList();});
 $('pages').addEventListener('click',e=>{const b=e.target.closest('button[data-page]');if(!b||b.disabled)return;currentPage=Number(b.dataset.page);renderList();});
 (async function init(){
  try{
   await loadNewsCSV();
   setDefaultDates();
   applyFilter();
  }catch(error){
   console.error(error);
   $('rangeInfo').textContent='Gagal memuat berita.csv';
   $('featured').innerHTML=`<div class="empty"><b>Data berita belum dapat dimuat.</b><br>${esc(error.message)}<br>`;
   $('newsList').innerHTML='';
   $('wordCloud').innerHTML='<div class="cloud-empty">Wordcloud akan tampil setelah CSV berhasil dimuat.</div>';
   $('statNews').textContent='0';$('statWords').textContent='0';
  }
 })();

 // Kirim tinggi konten ke dashboard induk agar iframe tidak memiliki scrollbar sendiri.
 (function syncFrameHeight(){
  function sendHeight(){
   if(window.parent === window) return;
   const height=Math.ceil(Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
    document.documentElement.getBoundingClientRect().height
   ));
   postFrameHeight('berita',height);
  }
  if('ResizeObserver' in window){
   const ro=new ResizeObserver(sendHeight);
   ro.observe(document.documentElement);
   ro.observe(document.body);
  }
  const mo=new MutationObserver(sendHeight);
  mo.observe(document.body,{childList:true,subtree:true,attributes:true,characterData:true});
  window.addEventListener('load',sendHeight);
  window.addEventListener('resize',sendHeight);
  requestAnimationFrame(sendHeight);
  setTimeout(sendHeight,150);
 })();
}

/* ========== 8. Boot ========== */
const PAGE = document.documentElement.dataset.page || document.body.dataset.role;
const INIT = { admin: initAdmin, petani: initRoleDashboard, tengkulak: initRoleDashboard, harga: initHarga, berita: initBerita };
if (INIT[PAGE]) INIT[PAGE]();
