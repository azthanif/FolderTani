# TemuTani Frontend (Next.js)

Migrasi tampilan dari `public/` (HTML/CSS/JS) ke Next.js 15 (App Router, TypeScript).
Backend FastAPI dan seluruh endpoint `/api/*` **tidak diubah**. Data tetap simulasi.

## Menjalankan (dev)

```bash
# terminal 1, dari root repo
uvicorn backend.main:app --reload          # http://127.0.0.1:8000

# terminal 2
cd frontend
npm install
npm run dev                                 # http://localhost:3000
```

Next.js meneruskan `/api/*` ke FastAPI (lihat `next.config.ts`). Ubah tujuan dengan `API_ORIGIN`
(lihat `.env.example`).

## Rute

| Rute | Asal |
|---|---|
| `/` | `public/index.html` |
| `/admin`, `/admin/{stok,penawaran,harga,transaksi,aktivitas,berita}` | `dashboard/admin.html` |
| `/petani`, `/petani/{stok,penawaran,harga,transaksi,berita}` | `dashboard/petani.html` |
| `/tengkulak`, `/tengkulak/{stok,penawaran,transaksi}` | `dashboard/tengkulak.html` |
| `/chatbot?from=…` | `Chatbot/chatbot.html` |

Halaman harga dan berita tidak lagi memakai iframe; keduanya menjadi komponen biasa.

## Struktur

```
app/            rute (layout per peran memuat provider data + shell)
components/     DashboardShell, UIProvider (modal/toast), Icon, PriceChart
  admin/ role/ harga/ berita/ landing/ chatbot/
lib/            api.ts (klien FastAPI), format.ts, prices.ts
styles/         CSS asli, di-scope: .dash (dashboard), .landing, .chatbot-page
```

CSS asli dipertahankan apa adanya, hanya diberi prefix scope agar gaya landing, dashboard, dan
chatbot tidak saling bentrok saat navigasi client-side.

## Belum dikerjakan (tahap berikutnya)

- Autentikasi Supabase (header `X-Demo-Role` masih simulasi).
- Realtime Supabase menggantikan polling `/api/state/version`.
- Chatbot simulasi akan diganti alur WAHA + n8n.
