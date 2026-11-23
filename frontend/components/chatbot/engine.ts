/* eslint-disable */
// @ts-nocheck
/*
 * Mesin simulasi chatbot WhatsApp Temu Tani (diporting apa adanya dari Chatbot/chatbot.html).
 * Sementara: nantinya digantikan alur nyata WAHA + n8n.
 * - Lookup DOM di-scope ke `root`.
 * - Listener elemen statis memakai AbortController; timer dilacak dan dibersihkan.
 * - Fungsi cleanup aman dipanggil sebelum boot asinkron selesai (React StrictMode).
 */
export function startChatbot(root: HTMLElement): () => void {
  let disposed = false;
  const controller = new AbortController();
  const signal = controller.signal;
  const timers = new Set<number>();
  const $id = (id: string) => root.querySelector('#' + id) as HTMLElement;
  const setTimeout = (fn: () => void, ms?: number) => {
    const t = window.setTimeout(() => { timers.delete(t); if (!disposed) fn(); }, ms);
    timers.add(t);
    return t;
  };
  const clearTimeout = (t: number) => { window.clearTimeout(t); timers.delete(t); };

  (async () => {
    
    // Ikon SVG untuk header, menu, dan balon percakapan.
    const ICONS = {
        back: '<path d="m15 18-6-6 6-6"/>',
        leaf: '<path d="M20 4c-8 0-14 4-14 11a5 5 0 0 0 5 5c7 0 11-6 9-16Z"/><path d="M4 21c2-6 5-9 11-12"/>',
        verified: '<path d="m12 2 2.3 1.5 2.8-.1.9 2.5 2.5 1 .1 2.8L22 12l-1.4 2.3-.1 2.8-2.5 1-.9 2.5-2.8-.1L12 22l-2.3-1.5-2.8.1-.9-2.5-2.5-1-.1-2.8L2 12l1.4-2.3.1-2.8 2.5-1 .9-2.5 2.8.1Z" fill="currentColor" stroke="none"/><path d="m8 12 2.7 2.7L16.5 9" stroke="#fff" stroke-width="2.2"/>',
        more: '<circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none"/>',
        menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
        chevron: '<path d="m7 10 5 5 5-5"/>',
        reply: '<path d="M8 10 4 6l4-4"/><path d="M4 6h8a7 7 0 0 1 7 7v3"/>',
        send: '<path d="m2 21 21-9L2 3l3 7 11 2-11 2z"/>',
        smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/>',
        attach: '<path d="m19 12-7.5 7.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3L14 7"/>',
        user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
        cart: '<circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M2 3h3l3 12h11l3-9H6"/>',
        lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
        check: '<path d="m5 12 4 4L19 6"/>',
        wheat: '<path d="M12 22V3M12 18c-4 0-7-2-7-5 4 0 7 2 7 5Zm0-6c-4 0-7-2-7-5 4 0 7 2 7 5Zm0 6c4 0 7-2 7-5-4 0-7 2-7 5Zm0-6c4 0 7-2 7-5-4 0-7 2-7 5Z"/>',
        chart: '<path d="M3 17h4l4-7 4 3 6-9"/><path d="M3 21h18"/>',
        info: '<circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7h.01"/>'
    };
    const svg = (name, cls = 'icon') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.info}</svg>`;
    // --- Penyimpanan dan data awal ---
    const FKEY = 'temutani_chat_wa_mobile_v8_flowchart';
    // Data simulasi.
    const defaultData = () => ({
        v: 8,
        role: 'farmer',
        currentFarmerId: 'F001',
        counter: 1,
        chatCounter: 1,
        farmerProfiles: [
            { id: 'F001', name: 'Petani A · Pak Budi', short: 'Petani A', region: 'Garut', district: 'Cisurupan' },
            { id: 'F002', name: 'Petani C · Bu Siti', short: 'Petani C', region: 'Garut', district: 'Tarogong Kidul' },
            { id: 'F003', name: 'Petani D · Pak Rahmat', short: 'Petani D', region: 'Cianjur', district: 'Cugenang' },
            { id: 'F004', name: 'Petani E · Bu Dewi', short: 'Petani E', region: 'Cianjur', district: 'Ciranjang' },
            { id: 'F005', name: 'Petani F · Pak Dede', short: 'Petani F', region: 'Cianjur', district: 'Ciranjang' }
        ],
        stocks: [
            { id: 'STK-101', farmerId: 'F001', type: 'GKP', quantityKg: 5000, date: '2026-11-10' },
            { id: 'STK-102', farmerId: 'F002', type: 'GKP', quantityKg: 3000, date: '2026-11-11' },
            { id: 'STK-103', farmerId: 'F003', type: 'GKP', quantityKg: 4000, date: '2026-11-13' },
            { id: 'STK-104', farmerId: 'F004', type: 'GKP', quantityKg: 6000, date: '2026-11-17' },
            { id: 'STK-105', farmerId: 'F005', type: 'GKP', quantityKg: 8500, date: '2026-11-20' }
        ],
        requests: [],
        offers: [],
        chats: { buyer: [], farmer: {} },
        flows: { buyer: { step: null }, farmer: {} },
        seen: { buyer: 0, farmer: {} },
        notifications: [],
        stockLedgerVersion: 2,
        lastUpdate: Date.now()
    });
    // --- Sinkronisasi dengan server FastAPI (GET/PUT /api/chatbot/state) ---
    // Server menjadi sumber data utama; localStorage hanya cadangan bila server tidak terjangkau.
    const CHAT_API = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '') + '/api/chatbot/state';
    async function loadRemoteState() {
        try {
            const res = await fetch(CHAT_API, { cache: 'no-store' });
            if (!res.ok) return null;
            const body = await res.json();
            return body && body.state ? body.state : null;
        } catch { return null; }
    }
    let remoteTimer = null;
    function pushRemoteState() {
        clearTimeout(remoteTimer);
        remoteTimer = setTimeout(() => {
            fetch(CHAT_API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) }).catch(() => {});
        }, 250);
    }
    function persist() {
        try { localStorage.setItem(FKEY, JSON.stringify(state)); } catch {}
        pushRemoteState();
    }
    let state;
    try {
        // Pakai salinan paling baru (server vs cadangan lokal) agar percakapan tidak mundur.
        let local = null;
        try { local = JSON.parse(localStorage.getItem(FKEY)); } catch {}
        const remote = await loadRemoteState();
        if (disposed) return;
        const saved = (remote && local) ? ((Number(local.lastUpdate) || 0) > (Number(remote.lastUpdate) || 0) ? local : remote) : (remote || local);
        state = saved?.v === 8 ? saved : defaultData();
        // Hanya GKP yang didukung: state lama yang masih berisi GKG dikonversi.
        (state.stocks || []).forEach(st => { st.type = 'GKP'; });
    }
    catch {
        state = defaultData();
    }
    // Upgrade data simulasi lama (stok sebelumnya adalah saldo sebelum alokasi).
    // Konversi dilakukan sekali, tanpa mengubah penawaran / kesepakatan yang sudah ada.
    if (state.stockLedgerVersion !== 2) {
        for (const stock of state.stocks) {
            const committedKg = state.offers
                .filter(offer => offer.stockId === stock.id && offer.status === 'AGREED')
                .reduce((sum, offer) => sum + offer.qtyKg, 0);
            stock.quantityKg = Math.max(0, stock.quantityKg - committedKg);
        }
        state.stockLedgerVersion = 2;
        persist();
    }
    // Bersihkan tombol lama yang sudah tidak dipakai dari riwayat tersimpan.
    // Perbarui juga pilihan menu pada percakapan lama yang tersimpan di browser.
    // Dengan begitu, "Lihat Penawaran" tersedia tanpa perlu reset data simulasi.
    const existingChatGroups = [
        { role: 'buyer', messages: state.chats?.buyer || [] },
        { role: 'farmer', messages: Object.values(state.chats?.farmer || {}).flat() }
    ];
    for (const { role, messages } of existingChatGroups) {
        for (const message of messages) {
            if (!message.answered && ['MENU LAYANAN', 'MENU UTAMA', 'PILIH MENU'].includes(message.tag)) {
                message.buttons = menuButtons(role);
            } else if (message.tag === 'STATUS PENAWARAN') {
                message.buttons = [{ label: 'Menu Utama', action: 'home', data: {}, kind: 'secondary' }];
            } else if (message.buttons?.length) {
                message.buttons = message.buttons.filter(option => option.label !== 'Lihat Stok Saya');
            }
        }
    }
    persist();
    const refs = { chat: $id('chatroom'), input: $id('chatInput'), role: $id('roleDisplay'), sheet: $id('sheetContainer'), toast: $id('toast') };
    const now = () => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    const money = n => 'Rp' + Number(n).toLocaleString('id-ID');
    const kg = n => Number(n).toLocaleString('id-ID') + ' kg';
    const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const rich = s => escapeHTML(s).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    const getFarmer = id => state.farmerProfiles.find(x => x.id === id);
    const getStock = id => state.stocks.find(x => x.id === id);
    const offerById = id => state.offers.find(x => x.id === id);
    const myId = () => state.currentFarmerId;
    const roleKey = (role = state.role, farmerId = myId()) => role === 'buyer' ? 'buyer' : farmerId;
    // --- State percakapan per peran ---
    function chatFor(role = state.role, farmerId = myId()) { if (role === 'buyer')
        return state.chats.buyer; if (!state.chats.farmer[farmerId])
        state.chats.farmer[farmerId] = []; return state.chats.farmer[farmerId]; }
    function flowFor(role = state.role, farmerId = myId()) { if (role === 'buyer')
        return state.flows.buyer; if (!state.flows.farmer[farmerId])
        state.flows.farmer[farmerId] = { step: null }; return state.flows.farmer[farmerId]; }
    function setFlow(p, role = state.role, farmerId = myId()) { if (role === 'buyer')
        state.flows.buyer = p;
    else
        state.flows.farmer[farmerId] = p; }
    function addMessage(role, from, text, buttons = [], meta = {}) { const farmerId = meta.farmerId || myId(); const arr = chatFor(role, farmerId); const msg = { id: 'M' + state.chatCounter++, from, text, buttons, at: now(), tag: meta.tag || '', answered: false }; arr.push(msg); save(); return msg; }
    const bot = (text, buttons = [], role = state.role, meta = {}) => addMessage(role, 'bot', text, buttons, meta);
    const say = (text, role = state.role, meta = {}) => addMessage(role, 'user', text, [], meta);
    function save() { state.lastUpdate = Date.now(); persist(); }
    // --- Tombol balasan dan menu awal ---
    function btn(label, action, data = {}, kind = 'normal') { return { label, action, data, kind }; }
    function menuButtons(role = state.role) {
        return role === 'farmer'
            ? [btn('Update Stok Gabah', 'farmer_stock'), btn('Lihat Prediksi Harga Wajar Gabah', 'farmer_ai'), btn('Lihat Penawaran', 'farmer_view_offers')]
            : [btn('Lihat Stok Gabah', 'buyer_view_region'), btn('Ajukan Penawaran', 'buyer_offer_start'), btn('Lihat Penawaran', 'buyer_open_requests')];
    }
    function showWelcome(role = state.role, farmerId = myId(), greeting = false) { const who = role === 'farmer' ? getFarmer(farmerId) : null; const title = greeting ? (role === 'farmer' ? `Halo, ${who?.name?.split(' · ')[1] || 'Bapak/Ibu'}! 🌾\nSelamat datang di **TemuTani**.\n\n` : 'Halo! Selamat datang di **TemuTani**. 🌾\n\n') : ''; bot(title + 'Silakan pilih layanan yang ingin digunakan melalui tombol di bawah. Jika pesan Anda tidak dikenali, ketik **MENU** untuk menampilkan pilihan kembali.', menuButtons(role), role, { farmerId, tag: 'MENU LAYANAN' }); }
    function ensureWelcome(role = state.role, farmerId = myId()) { if (!chatFor(role, farmerId).length)
        showWelcome(role, farmerId, true); }
    function formatDate(s) { if (!s)
        return '-'; const d = new Date(s + 'T12:00:00'); return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); }
    // quantityKg adalah stok yang kini tersedia, bukan total historis sebelum transaksi.
    // Kesepakatan lama tidak boleh dikurangi ulang saat petani memperbarui stok.
    function stockAvailable(stock) { return Math.max(0, Number(stock?.quantityKg || 0)); }
    const DEMO_FARMER_CONTACTS = {
        F001: '08XX-XXXX-1001', F002: '08XX-XXXX-1002',
        F003: '08XX-XXXX-1003', F004: '08XX-XXXX-1004', F005: '08XX-XXXX-1005'
    };
    function contactForFarmer(farmerId) {
        const profile = getFarmer(farmerId);
        return profile?.whatsapp && profile?.contactSharingConsent === true
            ? { label: profile.whatsapp, demo: false }
            : { label: DEMO_FARMER_CONTACTS[farmerId] || 'Nomor contoh belum tersedia', demo: true };
    }
    const pred = (region) => ({ Garut: 6900, Cianjur: 6950 }[region] || 6900); // GKP saja
    const REGIONS = ['Garut', 'Cianjur'];
    function offerTitle(o) { const s = getStock(o.stockId); return `**${o.id} • ${getFarmer(o.farmerId).short}**\n${o.region} • ${s?.type || 'GKP'} • ${kg(o.qtyKg)}`; }
    // --- Rendering antarmuka chat ---
    function render() {
        ensureWelcome();
        const role = state.role;
        const farmerId = myId();
        refs.role.textContent = role === 'farmer' ? `Petani • ${getFarmer(farmerId).short} (${getFarmer(farmerId).region})` : 'Tengkulak • tanpa registrasi';
        $id('roleSmallIcon').innerHTML = svg(role === 'farmer' ? 'wheat' : 'cart');
        const messages = chatFor(role, farmerId);
        let html = `<div class="daypill">HARI INI</div><div class="encrypted">${svg('lock')} Pesan ini hanyalah simulasi dan tidak dikirim ke WhatsApp.</div>`;
        for (const m of messages) {
            const isUser = m.from === 'user';
            html += `<div class="bubble-row ${isUser ? 'user' : ''}" data-mid="${m.id}"><div class="bubble">${m.tag ? `<div class="bubble-kicker">${svg('leaf')}${escapeHTML(m.tag)}</div>` : ''}<div class="bubble-text">${rich(m.text)}</div><div class="msg-foot">${m.at}${isUser ? '<span class="ticks">✓✓</span>' : ''}</div>${m.buttons?.length ? `<div class="reply-list">${m.buttons.map((b, i) => `<button type="button" class="reply-option ${m.answered ? 'off' : ''} ${b.kind === 'danger' ? 'danger' : b.kind === 'secondary' ? 'secondary' : ''}" data-mid="${m.id}" data-bidx="${i}" ${m.answered ? 'disabled' : ''}>${svg('reply')}${escapeHTML(b.label)}</button>`).join('')}</div>` : ''}</div></div>`;
        }
        refs.chat.innerHTML = html;
        refs.chat.querySelectorAll('.reply-option:not(:disabled)').forEach(el => el.addEventListener('click', () => onOption(el.dataset.mid, Number(el.dataset.bidx))));
        const hints = { farmer_counter: 'Ketik harga balik, contoh: 6950', buyer_counter: 'Ketik penawaran baru, contoh: 6850', buyer_qty: 'Ketik kebutuhan dalam kg, contoh: 8000', buyer_price: 'Ketik harga Rp/kg, contoh: 6800', farmer_stock_qty: 'Ketik jumlah stok terbaru (kg)' };
        refs.input.placeholder = hints[flowFor().step] || 'Ketik pesan atau pilih menu...';
        $id('phoneTime').textContent = now();
        setTimeout(() => { refs.chat.scrollTop = refs.chat.scrollHeight; }, 20);
    }
    function toast(text) { refs.toast.textContent = text; refs.toast.classList.add('on'); clearTimeout(toast.timer); toast.timer = setTimeout(() => refs.toast.classList.remove('on'), 2500); }
    // --- Router aksi dari tombol menu ---
    function respond(roleMessage, action, data = {}) {
        switch (action) {
            case 'home':
                setFlow({ step: null });
                bot('Berikut menu utama Temu Tani.', menuButtons(), state.role, { tag: 'MENU LAYANAN' });
                break;
            case 'farmer_stock':
                startFarmerStock();
                break;
            case 'farmer_ai':
                startFarmerAI();
                break;
            case 'buyer_view_region':
                chooseRegion('view');
                break;
            case 'buyer_offer_start':
                // Kedua jalur bertemu di pertanyaan jumlah (kg).
                // Dari Lihat Stok, wilayah sebelumnya langsung digunakan.
                if (data.region && REGIONS.includes(data.region)) {
                    startBuyerOffer(data.region);
                } else {
                    chooseRegion('offer');
                }
                break;
            case 'buyer_region':
                if (data.mode === 'view')
                    showRegionStocks(data.region);
                else
                    startBuyerOffer(data.region);
                break;
            case 'buyer_pick_farmer':
                sendOfferToFarmer(data.stockId, data.requestId);
                break;
            case 'farmer_accept':
                farmerAccept(data.offerId);
                break;
            case 'farmer_counter':
                farmerCounterStart(data.offerId);
                break;
            case 'buyer_accept':
                buyerAccept(data.offerId);
                break;
            case 'buyer_counter':
                buyerCounterStart(data.offerId);
                break;
            case 'buyer_open_requests':
                showMyOffers();
                break;
            case 'farmer_view_offers':
            case 'farmer_pending': // Kompatibilitas dengan tombol dari riwayat lama.
                showFarmerOffers();
                break;
            case 'buyer_more_candidates':
                showCandidateList(data.requestId);
                break;
            default: toast('Pilihan tidak tersedia.');
        }
    }
    function onOption(mid, bidx) { const chat = chatFor(); const m = chat.find(x => x.id === mid); if (!m || m.answered)
        return; const b = m.buttons?.[bidx]; if (!b)
        return; m.answered = true; say(b.label); save(); respond(m, b.action, b.data || {}); render(); }
    // --- Fitur stok per petani dan harga AI ---
    // Saldo stok yang dimasukkan petani merupakan jumlah terkini dan boleh nol.
    function farmerInventory(farmerId) {
        const groups = new Map();
        for (const stock of state.stocks.filter(item => item.farmerId === farmerId)) {
            if (!groups.has(stock.type)) {
                groups.set(stock.type, { type: stock.type, total: 0, items: [] });
            }
            const group = groups.get(stock.type);
            group.total += stockAvailable(stock);
            group.items.push(stock);
        }
        return [...groups.values()];
    }

    function startFarmerStock() {
        const farmer = getFarmer(myId());
        const groups = farmerInventory(myId());
        let message = `**Stok Gabah Anda Saat Ini**\nWilayah: Kabupaten ${farmer.region}\n\n`;
        if (groups.length === 0) {
            message += '**Stok tersedia: 0 kg**\n\n';
        } else {
            for (const group of groups) {
                message += `**${group.type}: ${kg(group.total)}**\n`;
            }
            message += '\n';
        }
        if (groups.length > 1) {
            message += 'Ketik **jenis gabah dan jumlah stok terkini**, misalnya **GKP 4500**.';
        } else {
            message += 'Berapa **jumlah stok terbaru** Anda sekarang?\nKetik angka dalam **kg**, misalnya **4500** atau **0** jika habis.';
        }
        message += '\n\nAngka baru akan **menggantikan saldo stok sebelumnya**, bukan menambahnya. Kesepakatan yang sudah terjadi tetap tersimpan dan tidak membatasi perubahan stok.';
        setFlow({
            step: 'farmer_stock_qty', farmerId: myId(),
            type: groups.length === 1 ? groups[0].type : groups.length === 0 ? 'GKP' : null,
            needsType: groups.length > 1
        });
        bot(message, [], 'farmer', { tag: 'UPDATE STOK GABAH' });
    }

    function updateFarmerStock(type, newTotal) {
        const group = farmerInventory(myId()).find(item => item.type === type);
        if (group?.items.length) {
            // Satukan saldo untuk tiap jenis petani. StockId lama tetap ada untuk histori.
            group.items.forEach((stock, i) => { stock.quantityKg = i === 0 ? newTotal : 0; });
        } else {
            state.stocks.push({
                id: 'STK-' + String(201 + state.counter++),
                farmerId: myId(), type, quantityKg: newTotal,
                date: new Date().toISOString().slice(0, 10)
            });
        }
        save();
        return { success: true };
    }

    function startFarmerAI() { setFlow({ step: null }); const f = getFarmer(myId()); const value = pred(f.region, 'GKP'); bot(`📊 **Prediksi Harga Wajar Gabah**\n\nWilayah: **Kabupaten ${f.region}**\nJenis: GKP\nEstimasi AI: **${money(value)}/kg**\nPeriode contoh: November 2026\n\nHarga ini menjadi **referensi untuk petani**, bukan harga wajib atau harga jual otomatis. Pertimbangkan juga kualitas gabah, transportasi, dan kondisi penjualan.\n\n⚠️ Angka **simulasi**, bukan prediksi model AI yang sudah dijalankan.`, [btn('Menu Utama', 'home', {}, 'secondary')], 'farmer', { tag: 'HARGA WAJAR AI' }); }
    // --- Pencarian stok dan penawaran pembeli ---
    function chooseRegion(mode) { setFlow({ step: null }); const text = mode === 'view' ? 'Silakan pilih **kabupaten** untuk melihat stok gabah yang tersedia.' : 'Di **kabupaten mana** Anda ingin mengajukan penawaran?'; bot(text, [...REGIONS.map(region => btn('Kabupaten ' + region, 'buyer_region', { region, mode })), btn('Menu Utama', 'home', {}, 'secondary')], 'buyer', { tag: mode === 'view' ? 'CARI STOK' : 'MULAI PENAWARAN' }); }
    function showRegionStocks(region) {
        setFlow({ step: null });
        const stocks = state.stocks.filter(stock =>
            getFarmer(stock.farmerId)?.region === region && stockAvailable(stock) > 0
        );
        let message = `🌾 **Stok Gabah di Kabupaten ${region}**\n\n`;
        for (const stock of stocks) {
            const farmer = getFarmer(stock.farmerId);
            message += `**${farmer.short}**\n` +
                `Lokasi: ${farmer.district}\n` +
                `Jenis: ${stock.type}\n` +
                `Stok tersedia: ${kg(stockAvailable(stock))}\n` +
                `Tersedia: ${formatDate(stock.date)}\n\n`;
        }
        if (!stocks.length) {
            message += 'Belum ada stok yang tersedia di kabupaten ini.\n\n';
        }
        message += 'Harga jual petani **tidak ditampilkan**. Tengkulak yang mengajukan harga pertama.';

        // Dari Lihat Stok, hanya lanjut ke alur penawaran yang sama atau Menu Utama.
        const buttons = stocks.length
            ? [
                btn('Ajukan Penawaran', 'buyer_offer_start', { region }),
                btn('Menu Utama', 'home', {}, 'secondary')
            ]
            : [btn('Menu Utama', 'home', {}, 'secondary')];
        bot(message, buttons, 'buyer', { tag: 'DAFTAR STOK' });
    }
    function startBuyerOffer(region) { setFlow({ step: 'buyer_qty', region }); bot(`Kabupaten **${region}** dipilih.\n\nBerapa kebutuhan gabah Anda dalam **kg**? Contoh: 8000.`, [], 'buyer'); }
    function showCandidateList(requestId) {
        const request = state.requests.find(item => item.id === requestId);
        if (!request) return;

        const remaining = request.qtyKg - request.offeredKg;
        if (remaining <= 0) {
            setFlow({ step: null });
            bot(`Seluruh kebutuhan **${kg(request.qtyKg)}** telah diajukan kepada petani.\n\nSilakan menunggu respons.`, [
                btn('Lihat Status Penawaran', 'buyer_open_requests'),
                btn('Menu Utama', 'home', {}, 'secondary')
            ], 'buyer', { tag: 'PENAWARAN TERCATAT' });
            return;
        }

        const candidates = state.stocks
            .filter(stock =>
                getFarmer(stock.farmerId)?.region === request.region &&
                !request.selectedStockIds.includes(stock.id) &&
                stockAvailable(stock) > 0
            )
            .sort((a, b) => stockAvailable(b) - stockAvailable(a));

        let message = `**Pilih petani tujuan penawaran**\n` +
            `Kabupaten: ${request.region}\n` +
            `Kebutuhan total: ${kg(request.qtyKg)}\n` +
            `Harga penawaran pertama: **${money(request.initialPrice)}/kg**\n` +
            `Belum diajukan: **${kg(remaining)}**\n\n`;
        for (const stock of candidates) {
            const farmer = getFarmer(stock.farmerId);
            message += `• **${farmer.short}** (${farmer.district}) — ${stock.type}, tersedia ${kg(stockAvailable(stock))}\n`;
        }
        if (!candidates.length) {
            message += 'Tidak ada kandidat lain dengan stok tersedia di wilayah ini.\n';
        } else {
            message += '\nPilih petani. Bila kebutuhan lebih besar dari stoknya, Anda dapat mengajukan sisanya ke petani lain.';
        }

        // Tombol Lihat Status baru muncul setelah minimal satu penawaran dikirim.
        const buttons = candidates.slice(0, 8).map(stock =>
            btn(`Pilih ${getFarmer(stock.farmerId).short}`, 'buyer_pick_farmer', {
                stockId: stock.id, requestId
            })
        );
        if (request.offeredKg > 0) {
            buttons.push(btn('Lihat Status Penawaran', 'buyer_open_requests', {}, 'secondary'));
        }
        buttons.push(btn('Menu Utama', 'home', {}, 'secondary'));
        bot(message, buttons, 'buyer', { tag: 'PILIH KANDIDAT' });
    }
    function sendOfferToFarmer(stockId, requestId) {
        const request = state.requests.find(item => item.id === requestId);
        const stock = getStock(stockId);
        if (!request || !stock || request.selectedStockIds.includes(stockId)) {
            bot('Pilihan petani ini sudah diproses.', [btn('Menu Utama', 'home', {}, 'secondary')]);
            return;
        }
        const remaining = request.qtyKg - request.offeredKg;
        const qty = Math.min(remaining, stockAvailable(stock));
        if (qty <= 0) {
            bot('Stok petani sudah tidak tersedia. Silakan kembali ke menu utama.', [
                btn('Menu Utama', 'home', {}, 'secondary')
            ], 'buyer');
            return;
        }

        request.selectedStockIds.push(stockId);
        request.offeredKg += qty;
        const farmer = getFarmer(stock.farmerId);
        const offer = {
            id: 'OFF-' + String(100 + state.counter++),
            requestId,
            stockId,
            farmerId: stock.farmerId,
            region: farmer.region,
            qtyKg: qty,
            initialPrice: request.initialPrice,
            currentPrice: request.initialPrice,
            currentBy: 'buyer',
            lastFarmerPrice: null,
            status: 'FARMER_TURN',
            agreedPrice: null,
            history: [{ actor: 'buyer', action: 'initial', price: request.initialPrice, at: now() }]
        };
        state.offers.push(offer);

        // Petani baru menerima pesan setelah penawaran dibuat; AI hanya terlihat oleh petani.
        bot(`📩 **Penawaran baru dari tengkulak**\n\n${offerTitle(offer)}\n` +
            `Harga penawaran: **${money(offer.currentPrice)}/kg**\n\n` +
            `📊 **Referensi harga wajar AI: ${money(pred(farmer.region, stock.type))}/kg**\n\n` +
            'Harga AI merupakan referensi, bukan harga jual wajib. ' +
            'Silakan pilih **Setuju** atau **Tawar Balik**.', [
                btn('Setuju', 'farmer_accept', { offerId: offer.id }),
                btn('Tawar Balik', 'farmer_counter', { offerId: offer.id })
            ], 'farmer', { farmerId: farmer.id, tag: 'PENAWARAN MASUK' });

        const stillNeeded = request.qtyKg - request.offeredKg;
        const buttons = [];
        if (stillNeeded > 0) {
            // Opsional untuk memenuhi permintaan gabah melalui beberapa petani.
            // Tidak memunculkan daftar kandidat secara otomatis setelah penawaran dikirim.
            buttons.push(btn(`Pilih Petani untuk Sisa ${kg(stillNeeded)}`, 'buyer_more_candidates', { requestId }));
        }
        buttons.push(btn('Lihat Status Penawaran', 'buyer_open_requests'));
        buttons.push(btn('Menu Utama', 'home', {}, 'secondary'));
        bot(`✅ **Penawaran tercatat dan terkirim!**\n\n` +
            `${offerTitle(offer)}\nHarga yang diajukan: **${money(offer.initialPrice)}/kg**\n\n` +
            `Status: **Menunggu respons petani**.` +
            (stillNeeded > 0 ? `\nKebutuhan belum diajukan: ${kg(stillNeeded)}.` : ''),
            buttons, 'buyer', { tag: 'STATUS DAPAT DILIHAT' });
        save();
    }
    function showMyOffers() {
        setFlow({ step: null });
        let msg = '**Daftar Penawaran Anda**\n\n';
        const buttons = [];
        if (!state.offers.length) {
            msg += 'Belum ada penawaran yang dikirim.\n';
        }
        for (const offer of state.offers) {
            const status = {
                FARMER_TURN: 'Menunggu respons petani',
                BUYER_TURN: 'Ada harga balik dari petani',
                AGREED: 'Harga telah disepakati — lanjutkan janji temu langsung'
            }[offer.status] || offer.status;
            msg += `**${offer.id}** • ${getFarmer(offer.farmerId).short}\n` +
                `${kg(offer.qtyKg)} • Harga terakhir: ${money(offer.currentPrice)}/kg\n` +
                `Status: ${status}\n`;
            if (offer.status === 'BUYER_TURN') {
                buttons.push(btn(`Setuju ${offer.id}`, 'buyer_accept', { offerId: offer.id }));
                buttons.push(btn(`Tawar Balik ${offer.id}`, 'buyer_counter', { offerId: offer.id }));
            }
            if (offer.status === 'AGREED') {
                const contact = contactForFarmer(offer.farmerId);
                msg += `Kontak WA petani${contact.demo ? ' (contoh)' : ''}: **${contact.label}**\n`;
            }
            msg += '\n';
        }
        buttons.push(btn('Menu Utama', 'home', {}, 'secondary'));
        bot(msg, buttons, 'buyer', { tag: 'DAFTAR PENAWARAN' });
    }
    function showFarmerOffers() {
        setFlow({ step: null });
        const offers = state.offers.filter(o => o.farmerId === myId());
        let msg = '**Daftar Penawaran Masuk**\n\n';
        const buttons = [];
        if (!offers.length) {
            msg += 'Belum ada penawaran yang masuk.\n';
        }
        for (const offer of offers) {
            const status = {
                FARMER_TURN: 'Menunggu respons Anda',
                BUYER_TURN: 'Menunggu respons tengkulak',
                AGREED: 'Harga telah disepakati'
            }[offer.status] || offer.status;
            const jenis = getStock(offer.stockId)?.type || 'GKP';
            msg += `**${offer.id}** • ${jenis} • ${kg(offer.qtyKg)}\n` +
                `Harga terakhir: ${money(offer.currentPrice)}/kg\n` +
                `Status: ${status}\n`;
            if (offer.status === 'FARMER_TURN') {
                msg += `Referensi harga wajar AI (simulasi): ${money(pred(offer.region, jenis))}/kg\n`;
                buttons.push(btn(`Setuju ${offer.id}`, 'farmer_accept', { offerId: offer.id }));
                buttons.push(btn(`Tawar Balik ${offer.id}`, 'farmer_counter', { offerId: offer.id }));
            }
            msg += '\n';
        }
        buttons.push(btn('Menu Utama', 'home', {}, 'secondary'));
        bot(msg, buttons, 'farmer', { tag: 'DAFTAR PENAWARAN' });
    }
    function completeAgreement(offer, actor) {
        const stock = getStock(offer.stockId);
        if (!stock || stockAvailable(stock) < offer.qtyKg) {
            bot('Stok saat ini tidak mencukupi untuk menyepakati penawaran ini. Periksa stok dan lakukan penawaran ulang.');
            return;
        }
        offer.status = 'AGREED';
        offer.agreedPrice = offer.currentPrice;
        offer.history.push({ actor, action: 'accept', price: offer.currentPrice, at: now() });
        // Stok kini tersedia dikurangi SATU KALI saat kesepakatan dibuat.
        // Petani tetap bebas mengisi ulang stok menjadi jumlah apa pun, termasuk 0.
        stock.quantityKg -= offer.qtyKg;
        const farmer = getFarmer(offer.farmerId);
        const contact = contactForFarmer(offer.farmerId);
        const totalValue = money(offer.agreedPrice * offer.qtyKg);
        // Hapus input negosiasi yang belum terkirim di kedua sisi.
        setFlow({ step: null }, 'buyer');
        setFlow({ step: null }, 'farmer', offer.farmerId);
        bot(`✅ **Harga disepakati!**\n\n${offerTitle(offer)}\nHarga akhir: **${money(offer.agreedPrice)}/kg**\nNilai kesepakatan: **${totalValue}**\n\n📱 **Kontak WhatsApp petani${contact.demo ? ' (simulasi)' : ''}: ${contact.label}**\n\nSilakan hubungi ${farmer.short} secara langsung melalui WhatsApp untuk mengatur waktu, lokasi pengambilan, dan pembayaran.\n\nStatus: **Harga Disepakati** (belum berarti pembayaran atau serah terima selesai).\nProses chatbot untuk penawaran ini selesai; silakan lanjutkan komunikasi langsung.` + (contact.demo ? '\nNomor di atas hanya contoh; bukan kontak aktif.' : ''),
            [btn('Menu Utama', 'home', {}, 'secondary')], 'buyer', { tag: 'KONTAK PETANI' });
        bot(`✅ **Harga sudah disepakati!**\n\n${offerTitle(offer)}\nHarga akhir: **${money(offer.agreedPrice)}/kg**\nNilai kesepakatan: **${totalValue}**\n\n📩 **Tengkulak akan menghubungi Anda langsung melalui WhatsApp** untuk mengatur janji temu, pengambilan gabah, dan pembayaran.\n\nStatus: **Menunggu komunikasi langsung dengan pembeli.**\nProses chatbot untuk penawaran ini selesai.`,
            [btn('Menu Utama', 'home', {}, 'secondary')], 'farmer', { farmerId: offer.farmerId, tag: 'KESEPAKATAN BARU' });
        save();
    }
    function farmerAccept(offerId) {
        const offer = offerById(offerId);
        if (!offer || offer.farmerId !== myId() || offer.status !== 'FARMER_TURN') {
            return bot('Penawaran tersebut sudah diproses. Silakan cek pesan terbaru.');
        }
        completeAgreement(offer, 'farmer');
    }
    function farmerCounterStart(offerId) { const o = offerById(offerId); if (!o || o.farmerId !== myId() || o.status !== 'FARMER_TURN')
        return bot('Penawaran tidak lagi menunggu respons Anda.'); setFlow({ step: 'farmer_counter', offerId }); bot(`Anda memilih **Tawar Balik** untuk ${o.id}.\n\nPenawaran terakhir pembeli: ${money(o.currentPrice)}/kg\nReferensi harga AI: ${money(pred(o.region, getStock(o.stockId).type))}/kg\n\nKetik harga balik Anda **dalam Rp/kg** (contoh: 6950).`, [btn('Menu Utama', 'home', {}, 'secondary')], 'farmer', { tag: 'AJUKAN HARGA BALIK' }); }
    function buyerCounterStart(offerId) { const o = offerById(offerId); if (!o || o.status !== 'BUYER_TURN')
        return bot('Penawaran sudah berubah atau disepakati.'); setFlow({ step: 'buyer_counter', offerId }); bot(`Anda memilih **Tawar Balik** untuk ${o.id}.\n\nHarga balik petani: ${money(o.currentPrice)}/kg\n\nMasukkan harga penawaran baru Anda **dalam Rp/kg** (contoh: 6850).`, [btn('Menu Utama', 'home', {}, 'secondary')], 'buyer', { tag: 'AJUKAN PENAWARAN BALIK' }); }
    function buyerAccept(offerId) {
        const offer = offerById(offerId);
        if (!offer || offer.status !== 'BUYER_TURN') {
            return bot('Penawaran tidak lagi menunggu respons pembeli.');
        }
        completeAgreement(offer, 'buyer');
    }
    // --- Validasi input dari pengguna ---
    function parseIntLocale(raw) { const clean = raw.trim().replace(/\s|Rp|kg/gi, ''); if (!/^[0-9][0-9.,]*$/.test(clean))
        return NaN; return Number(clean.replace(/[.,]/g, '')); }
    function submitText(raw) {
        const value = raw.trim();
        if (!value)
            return;
        refs.input.value = '';
        say(value);
        const f = flowFor();
        if (/^(menu|halo|hai|hi|help|bantuan|mulai)$/i.test(value)) {
            setFlow({ step: null });
            bot('Silakan pilih layanan dari menu berikut.', menuButtons(), state.role, { tag: 'MENU LAYANAN' });
            render();
            return;
        }
        const n = parseIntLocale(value);
        switch (f.step) {
            case 'farmer_stock_qty': {
                if (f.farmerId !== myId()) {
                    setFlow({ step: null });
                    bot('Identitas petani berubah. Buka menu stok lagi untuk melanjutkan.');
                    break;
                }
                const typed = value.match(/^(GKP)\s+(.+)$/i);
                const type = typed ? typed[1].toUpperCase() : f.type;
                const latestQty = parseIntLocale(typed ? typed[2] : value);
                if (!type || f.needsType && !typed) {
                    bot('Agar tidak tertukar, tuliskan **jenis gabah dan jumlah terbaru**, contoh: **GKP 4500**.');
                    break;
                }
                if (!Number.isInteger(latestQty) || latestQty < 0 || latestQty > 1e8) {
                    bot('Masukkan jumlah stok terbaru yang valid dalam **kg**, misalnya **4500**. Ketik **0** jika stok habis.');
                    break;
                }
                updateFarmerStock(type, latestQty);
                setFlow({ step: null });
                bot(`✅ **Stok berhasil diperbarui!**\n\nJenis: **${type}**\nStok tersedia saat ini: **${kg(latestQty)}**` +
                    (latestQty === 0 ? '\nStok habis dan tidak akan muncul di pencarian pembeli sampai diperbarui.' : '') +
                    '\n\nKesepakatan lama tetap tercatat. Stok terbaru ini akan digunakan untuk pencarian dan penawaran berikutnya.',
                    [btn('Menu Utama', 'home', {}, 'secondary')], 'farmer', { tag: 'STOK DIPERBARUI' });
                break;
            }
            case 'buyer_qty': {
                if (!Number.isInteger(n) || n <= 0 || n > 1e8) {
                    bot('Masukkan jumlah kebutuhan gabah yang valid dalam **kg**, contohnya **5000**.');
                    break;
                }
                setFlow({ ...f, step: 'buyer_price', qtyKg: n });
                bot(`Kebutuhan **${kg(n)}** di Kabupaten **${f.region}** tercatat.\n\n` +
                    'Berapa **harga penawaran pertama per kg**? Contoh: 7000.\n\n' +
                    'Harga petani tidak ditampilkan sebelum penawaran diajukan.',
                    [], 'buyer', { tag: 'HARGA PENAWARAN' });
                break;
            }
            case 'buyer_price': {
                if (!Number.isInteger(n) || n <= 0 || n > 1e8) {
                    bot('Masukkan harga penawaran dalam **Rp/kg**, contohnya **7000**.');
                    break;
                }
                const requestId = 'REQ-' + String(100 + state.counter++);
                state.requests.push({
                    id: requestId,
                    region: f.region,
                    qtyKg: f.qtyKg,
                    initialPrice: n,
                    offeredKg: 0,
                    selectedStockIds: []
                });
                setFlow({ step: null });
                showCandidateList(requestId);
                break;
            }
            
    case 'farmer_counter': {
                const o = offerById(f.offerId);
                if (!o || o.status !== 'FARMER_TURN' || o.farmerId !== myId()) {
                    bot('Penawaran sudah berubah.');
                    setFlow({ step: null });
                    break;
                }
                if (!Number.isInteger(n) || n <= 0 || n > 1e8) {
                    bot('Masukkan harga balik yang valid dalam Rp/kg, contoh **6950**.');
                    break;
                }
                o.currentPrice = n;
                o.lastFarmerPrice = n;
                o.currentBy = 'farmer';
                o.status = 'BUYER_TURN';
                o.history.push({ actor: 'farmer', action: 'counter', price: n, at: now() });
                setFlow({ step: null });
                bot(`✅ Harga balik **${money(n)}/kg** untuk **${o.id}** sudah diteruskan kepada pembeli.\n\nMenunggu respons tengkulak.`, [btn('Menu Utama', 'home', {}, 'secondary')], 'farmer', { tag: 'HARGA BALIK TERKIRIM' });
                bot(`📩 **Ada harga balik dari ${getFarmer(o.farmerId).short}**\n\n${offerTitle(o)}\nHarga balik petani: **${money(n)}/kg**\n\nSilakan pilih **Setuju** atau **Tawar Balik**.`, [btn('Setuju', 'buyer_accept', { offerId: o.id }), btn('Tawar Balik', 'buyer_counter', { offerId: o.id })], 'buyer', { tag: 'RESPONS PETANI' });
                save();
                break;
            }
            case 'buyer_counter': {
                const o = offerById(f.offerId);
                if (!o || o.status !== 'BUYER_TURN') {
                    bot('Penawaran tidak lagi menunggu respons Anda.');
                    setFlow({ step: null });
                    break;
                }
                if (!Number.isInteger(n) || n <= 0 || n > 1e8) {
                    bot('Ketik harga penawaran yang valid dalam Rp/kg, contoh **6850**.');
                    break;
                }
                o.currentPrice = n;
                o.currentBy = 'buyer';
                o.status = 'FARMER_TURN';
                o.history.push({ actor: 'buyer', action: 'counter', price: n, at: now() });
                setFlow({ step: null });
                bot(`✅ Penawaran balik **${money(n)}/kg** sudah dikirim kepada ${getFarmer(o.farmerId).short}.`, [btn('Lihat Status Penawaran', 'buyer_open_requests')], 'buyer', { tag: 'PENAWARAN BALIK TERKIRIM' });
                bot(`📩 **Penawaran baru dari tengkulak**\n\n${offerTitle(o)}\nHarga terbaru: **${money(n)}/kg**\nReferensi harga wajar AI: **${money(pred(o.region, getStock(o.stockId).type))}/kg**\n\nApakah Anda setuju atau ingin menawar balik lagi?`, [btn('Setuju', 'farmer_accept', { offerId: o.id }), btn('Tawar Balik', 'farmer_counter', { offerId: o.id })], 'farmer', { farmerId: o.farmerId, tag: 'NEGOSIASI BERLANJUT' });
                save();
                break;
            }
            default:
                bot('Maaf, pesan tersebut belum dapat saya pahami. 🙂\n\nAgar lebih mudah, gunakan **pilihan menu** berikut:', menuButtons(), state.role, { tag: 'PILIH MENU' });
                break;
        }
        render();
    }
    // --- Peralihan akun untuk pengujian dan event UI ---
    function changeRole(role, farmerId) { state.role = role; if (farmerId)
        state.currentFarmerId = farmerId; save(); refs.sheet.innerHTML = ''; ensureWelcome(role, myId()); render(); }
    function showSwitchSheet() { const allFarm = state.farmerProfiles.map(f => `<button class="sheet-choice ${state.role === 'farmer' && myId() === f.id ? 'active' : ''}" data-role="farmer" data-farmer="${f.id}"><span class="circ">${svg('wheat')}</span><span class="text"><strong>${escapeHTML(f.name)}</strong><small>Kabupaten ${escapeHTML(f.region)} • data simulasi</small></span>${state.offers.some(o => o.farmerId === f.id && o.status === 'FARMER_TURN') ? '<span class="unread">Penawaran</span>' : ''}</button>`).join(''); refs.sheet.innerHTML = `<div class="sheet-overlay"><div class="sheet" role="dialog" aria-modal="true" aria-label="Pilih pengguna"><div class="sheet-head"><h3>Ganti tampilan pengguna</h3><button class="closebtn" type="button" id="closeSheet" aria-label="Tutup">×</button></div><p class="sheet-sub">Mode simulasi: pindah peran untuk melihat penawaran dan balasan di dua sisi percakapan.</p><button class="sheet-choice ${state.role === 'buyer' ? 'active' : ''}" data-role="buyer"><span class="circ">${svg('cart')}</span><span class="text"><strong>Tengkulak • Tanpa Registrasi</strong><small>Mencari stok, mengirim harga awal, dan negosiasi</small></span>${state.offers.some(o => o.status === 'BUYER_TURN') ? '<span class="unread">Respons baru</span>' : ''}</button>${allFarm}<div class="sheet-info">Dalam implementasi sebenarnya, hanya petani atau tengkulak yang bisa membuka akunnya sendiri.</div><button class="sheet-choice sheet-danger" id="resetSheet"><span class="circ">↻</span><span class="text"><strong>Reset seluruh simulasi</strong><small>Hapus penawaran dan mulai kembali dari awal</small></span></button></div></div>`; refs.sheet.querySelector('.sheet-overlay').addEventListener('click', e => { if (e.target.classList.contains('sheet-overlay'))
        refs.sheet.innerHTML = ''; }); $id('closeSheet').onclick = () => refs.sheet.innerHTML = ''; refs.sheet.querySelectorAll('[data-role]').forEach(el => el.addEventListener('click', () => changeRole(el.dataset.role, el.dataset.farmer))); $id('resetSheet').onclick = resetDemo; }
    function resetDemo() { if (!confirm('Reset semua percakapan, stok tambahan, dan penawaran simulasi?'))
        return; state = defaultData(); save(); refs.sheet.innerHTML = ''; render(); toast('Simulasi berhasil direset'); }
    function openMenu() { setFlow({ step: null }); bot('Silakan pilih layanan TemuTani yang dibutuhkan.', menuButtons(), state.role, { tag: 'MENU UTAMA' }); render(); }
    const el = (id, fn) => $id(id).addEventListener('click', fn, { signal });
    el('sendButton', () => submitText(refs.input.value));
    refs.input.addEventListener('keydown', e => { if (e.key === 'Enter') {
        e.preventDefault();
        submitText(refs.input.value);
    } }, { signal });
    ['avatarSwitch', 'identitySwitch']
    .forEach(id => el(id, showSwitchSheet));
    ['headerBack', 'shortcutMenu']
        .forEach(id => el(id, openMenu));
    el('attachHelp', () => toast('Pilih menu, atau ketik MENU kapan saja.'));
    for (const [id, name] of [['headBackIcon', 'back'], ['verifyIcon', 'verified'], ['arrowSmall', 'chevron'], ['smileIcon', 'smile'], ['attachIcon', 'attach'], ['sendIcon', 'send']])
        $id(id).innerHTML = svg(name);
    render();
  })().catch((e) => { if (!disposed) console.error('[chatbot]', e); });

  return () => {
    disposed = true;
    controller.abort();
    timers.forEach((t) => window.clearTimeout(t));
    timers.clear();
    for (const id of ['chatroom', 'sheetContainer']) { const n = $id(id); if (n) n.innerHTML = ''; }
  };
}
