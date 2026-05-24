# UI Redesign — Netra v1.1

Dokumen ini menjelaskan keputusan desain dan implementasi redesign frontend
Netra dari v1.0 (Bootstrap-based) ke v1.1 (custom design system).

## Tujuan

1. **Minimal & modern** — komunikasikan kredibilitas pemerintahan tanpa
   terkesan kuno atau berlebihan.
2. **Responsif penuh** — pengalaman setara di handphone, tablet, dan desktop.
3. **Performa** — first paint cepat, tidak ada layout shift, animasi 60fps.
4. **Maintainability** — desain token terpusat, mudah disesuaikan.
5. **Aksesibilitas** — kontras warna AA, focus ring, ARIA labels, keyboard nav.

## Filosofi Desain

> **"Government-grade modern"** — bersih, terstruktur, kredibel; bukan
> "startup-flashy" tapi juga bukan "1990s-government-form".

Inspirasi: dashboard fintech kelas dunia (Stripe, Linear) + design system
pemerintah modern (gov.uk, Singapore Open Government). Cocok untuk
ditayangkan di rapat strategis dengan pejabat eselon dan bupati.

## Design Tokens

Semua warna, spacing, radius, shadow, typography dideklarasikan di CSS
custom properties (`:root` di `netra.css`). Mengubah satu token akan
otomatis ter-cascade ke seluruh komponen.

### Palet warna — light theme
```
Background  #f5f7fa     surface gray
Surface     #ffffff     card background
Surface-2   #f8fafc     muted surface (table head, code bg)
Border      #e5e9f0     hairline borders
Text        #0f172a     primary text (slate-900)
Muted       #64748b     secondary text (slate-500)
Accent      #2563eb     brand blue (royal)
Success     #059669     emerald
Danger      #dc2626     red
Warning     #d97706     amber
Info        #0891b2     cyan
Sidebar BG  #0b1220     deep navy
```

### Palet warna — dark theme
Semua token di-override via `[data-theme="dark"]` selector. Background
turun ke deep navy `#0b1220`, surface naik ke `#111827`. Aksen blue tetap
sama untuk konsistensi brand.

### Tipografi
- **Sans**: Inter (400, 500, 600, 700) — sangat legible di ukuran kecil,
  desain modern, gratis via Google Fonts.
- **Monospace**: JetBrains Mono — untuk IP address, kode, hash.
- Heading scale: 1.75rem (h1) → 1rem (h5), font-weight 600, tracking -0.01em.
- Body: 15px (1rem), line-height 1.5.
- Number ticker: `font-variant-numeric: tabular-nums` agar angka tidak
  "jumping" saat update real-time.

### Spasi & ukuran
Token spacing dari 4px hingga 48px (kelipatan 4). Radius: 6/10/14px untuk
small/medium/card. Shadow 4 tingkat (sm/default/md/lg).

### Motion
- Durasi default: 150ms (terasa "snappy" tanpa lemot)
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)` (Material standard)
- Hanya properti `transform`, `opacity`, `background-color` yang
  dianimasi — properti GPU-friendly.

## Layout System

```
┌─ Desktop (≥1024px) ──────────────────────────────────────────┐
│ ┌─────────┬───────────────────────────────────────────────┐  │
│ │         │ Topbar 64px                                   │  │
│ │ Sidebar │───────────────────────────────────────────────│  │
│ │  260px  │                                               │  │
│ │         │ Content (max-width: 100%, padding 24px)       │  │
│ │         │                                               │  │
│ └─────────┴───────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

┌─ Tablet (768—1023px) ──────────────┐  ┌─ Mobile (<768px) ────┐
│ ┌────────────────────────────────┐ │  │ ☰ Topbar           │ │
│ │ ☰ Topbar                       │ │  │ ─────────────────── │ │
│ │ ─────────────────────────────  │ │  │ Content stack      │ │
│ │ Content (single column)        │ │  │ Cards full-width   │ │
│ │                                │ │  │ Tables h-scroll    │ │
│ └────────────────────────────────┘ │  │                    │ │
│       Sidebar = drawer            │  │ Drawer slide left  │ │
└────────────────────────────────────┘  └──────────────────────┘
```

### Sidebar
- Desktop: sticky, full-height, dark navy untuk kontras dengan content.
- Mobile: `position: fixed`, `transform: translateX(-100%)` saat tertutup.
  Toggle via hamburger di topbar. Klik scrim atau link auto-close.
- Brand mark: gradient blue→indigo dengan ikon network, drop shadow halus.
- Active link: solid accent blue dengan shadow halus.

### Topbar
- Sticky di scroll.
- Mobile: hamburger button + judul truncate + chip waktu (label dihilangkan
  di <1024px untuk hemat ruang).
- Theme toggle (sun/moon icon).

### Stat cards
- Auto-fit grid: minimum 220px, fleksibel sesuai lebar.
- Icon tile 44×44 dengan tone-based background-color tint.
- Number besar 2rem, font-weight 700, tabular-nums.
- Hover: lift 2px + shadow lebih dalam.

### Tables
- Header: uppercase + tracking 0.06em + warna muted untuk hierarki.
- Row hover: subtle background change.
- `font-variant-numeric: tabular-nums` di kolom angka.
- Wrapper `.table-scroll` untuk overflow-x horizontal di mobile.
- Empty state besar dengan ikon kontekstual.

## Komponen Inti

| Komponen | File CSS | Pakai |
|---|---|---|
| `.app` | bagian 3 | grid layout utama |
| `.sidebar` + `.scrim` | bagian 4, 15 | navigasi |
| `.topbar` | bagian 5 | header |
| `.section` | bagian 6 | grouping |
| `.card` | bagian 7 | container |
| `.stat-card` | bagian 8 | KPI |
| `.table` + `.table-wrap` | bagian 9 | data table |
| `.badge` + `.dot` | bagian 10 | status |
| `.btn` (variant: primary/danger/ghost) | bagian 11 | action |
| `.select` + `.input` | bagian 12 | form |
| `.alert` (variant) | bagian 13 | feedback |
| `.chart-box` | bagian 14 | chart container |
| `.skeleton` | bagian 16 | loading state |
| `.ws-badge` | bagian 17 | connection state |

## Dark Mode

- Toggle: tombol moon/sun di topbar.
- Persistensi: `localStorage` key `netra-theme`.
- No FOUC: script di `<head>` sebelum body render, baca localStorage,
  apply `data-theme` ke `<html>` synchronously.
- Chart.js: warna grid/label diadaptasi via helper `chartTheme()` di
  setiap file JS yang pakai chart.

## Aksesibilitas

- Semua tombol punya `aria-label`.
- Hamburger: `<button>` proper (bukan `<div>` clickable).
- Sidebar: `<aside>` dengan `aria-label="Navigasi utama"`.
- Theme toggle keyboard-friendly.
- Focus ring kustom via `.select:focus { box-shadow: 0 0 0 3px var(--accent-soft); }`.
- Kontras warna text/background memenuhi WCAG AA (4.5:1 untuk body text).

## Print Styles

Halaman laporan (`/rumah/laporan`) otomatis trigger `window.print()` saat load.
Print CSS:
- Sembunyikan sidebar, topbar, scrim, semua `.no-print` element.
- Grid berubah jadi single column.
- Shadow & background dihilangkan untuk hemat tinta.

## Performance

- **CSS**: 21 KB (vs Bootstrap 5: 220 KB). 90% saving.
- **No JS framework**: vanilla JS ~4.5 KB common.js + per-page modul kecil.
- **Google Fonts**: preconnect + display=swap → tidak block render.
- **Chart.js**: dimuat hanya di halaman yang butuh.
- **First paint** target: < 200ms di koneksi lokal.

## Maintainability

- Token terpusat di `:root` — ubah warna brand cukup edit 1 baris.
- BEM-ish naming (`.sidebar__brand`, `.stat-card__icon`) untuk konsistensi.
- File CSS terorganisasi dalam 22 section bernomor + heading komentar.
- Tidak ada dependency JS framework yang bisa break saat upgrade.

## Browser Support

- Chrome / Edge ≥ 90
- Firefox ≥ 88
- Safari ≥ 14
- iOS Safari ≥ 14
- Android Chrome ≥ 90

Mengandalkan: CSS custom properties, CSS Grid, Flexbox, `clip-path` (gradient
text di error page), `:has()` (tidak dipakai), modern flexbox gap.

## Migration Notes (untuk developer)

Bila Anda meng-extend Netra:
- Jangan re-introduce Bootstrap atau Tailwind CDN — sudah cukup dengan
  design system saat ini.
- Pakai design tokens (`var(--accent)`, `var(--space-4)`) — JANGAN hardcode
  warna atau px.
- Komponen baru harus konsisten dengan pattern existing (badge, card, dst).
- Test responsivitas di breakpoint 360px, 768px, 1024px, 1440px.
