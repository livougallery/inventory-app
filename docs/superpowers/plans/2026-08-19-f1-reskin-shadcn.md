# F1 Reskin EJS ke Tampilan shadcn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membuat seluruh 35 halaman EJS yang ada sekarang terlihat mengikuti design system shadcn/ui (tema default neutral/zinc) tanpa mengubah struktur markup, form action, atau logika apa pun.

**Architecture:** Reskin murni lapisan CSS. Semua design tokens shadcn didefinisikan sebagai CSS custom properties (`:root`) di `views/layout.ejs`, lalu semua component class yang ada (`.btn`, `.card`, `.sb-item`, `.cd-*`, `.kanban-*`, `.bd-*`) di-restyle memakai token tersebut. Tidak ada markup baru kecuali 2 titik kecil yang disebut eksplisit di bawah. Tailwind CDN tetap dipakai untuk utility classes (flex, spacing, dsb.) — hanya custom CSS yang diubah.

**Tech Stack:** EJS + Tailwind CDN (tetap, tidak menambah build tool) + plain CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-08-19-migrasi-shadcn-design.md` (§3 fase F1, §6 aturan testing)

## Global Constraints

- **DILARANG mengubah atribut `action`, `method`, `enctype`, atau hidden CSRF input pada form mana pun.** Riwayat regresi 2026-07-07 & 2026-07-21 terjadi karena perubahan markup form.
- **DILARANG memakai `@apply`** — Tailwind CDN tidak memprosesnya (bug 2026-07-13). Semua styling plain CSS.
- Design tokens = **tema default shadcn/ui (neutral)**: primary hampir-hitam (zinc-900), radius `0.5rem`, border zinc-200. Nilai HSL exact ada di Task 1 — pakai verbatim.
- Warna semantik dipertahankan (success hijau `#059669`, warning amber, error merah `hsl(0 84.2% 60.2%)`) — shadcn sendiri hanya punya `destructive`; hijau/amber adalah ekstensi semantik yang umum di dashboard shadcn.
- **App terhubung ke database PRODUKSI Supabase** (lihat CLAUDE.md). Verifikasi F1 = cek visual + inspeksi statis markup. JANGAN submit form dengan data palsu.
- Satu commit per task.

---

### Task 1: Token shadcn + restyle komponen inti di layout.ejs

**Files:**
- Modify: `views/layout.ejs` (blok `<style>` baris 8–104, diganti seluruhnya)

**Interfaces:**
- Produces: CSS variables `--background, --foreground, --card, --card-foreground, --primary, --primary-foreground, --secondary, --secondary-foreground, --muted, --muted-foreground, --accent, --accent-foreground, --destructive, --destructive-foreground, --border, --input, --ring, --radius` di `:root` — dipakai Task 3, 4, 5.

- [ ] **Step 1: Ganti seluruh blok `<style>` di `views/layout.ejs` (baris 8–104) dengan:**

```html
  <style>
    /* ===== Design tokens: shadcn/ui — default neutral theme ===== */
    :root {
      --background: 0 0% 100%;
      --foreground: 240 10% 3.9%;
      --card: 0 0% 100%;
      --card-foreground: 240 10% 3.9%;
      --primary: 240 5.9% 10%;
      --primary-foreground: 0 0% 98%;
      --secondary: 240 4.8% 95.9%;
      --secondary-foreground: 240 5.9% 10%;
      --muted: 240 4.8% 95.9%;
      --muted-foreground: 240 3.8% 46.1%;
      --accent: 240 4.8% 95.9%;
      --accent-foreground: 240 5.9% 10%;
      --destructive: 0 84.2% 60.2%;
      --destructive-foreground: 0 0% 98%;
      --border: 240 5.9% 90%;
      --input: 240 5.9% 90%;
      --ring: 240 10% 3.9%;
      --radius: 0.5rem;
    }
    body { background-color:hsl(var(--background)); color:hsl(var(--foreground)); font-family:ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif; }

    /* ===== Sidebar (shadcn sidebar, dark zinc) ===== */
    .sidebar-aside { width:15rem; flex-shrink:0; min-height:100vh; background:#09090b; color:#fafafa; transition:width 220ms ease; }
    .sidebar-aside.collapsed { width:4.5rem; }
    .sb-header { display:flex; align-items:center; justify-content:space-between; gap:0.5rem; padding:0.9rem 0.85rem; border-bottom:1px solid #27272a; }
    .sb-brand { display:flex; align-items:center; gap:0.5rem; font-weight:700; font-size:1.05rem; white-space:nowrap; overflow:hidden; }
    .sb-logo { font-size:1.3rem; }
    .sb-toggle { background:#27272a; border:none; color:#fafafa; width:1.9rem; height:1.9rem; border-radius:var(--radius); cursor:pointer; font-size:0.8rem; line-height:1; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background 150ms; }
    .sb-toggle:hover { background:#3f3f46; }
    .sb-user { padding:0.55rem 0.85rem; font-size:0.72rem; background:#18181b; border:1px solid #27272a; border-radius:var(--radius); margin:0.6rem 0.75rem; color:#d4d4d8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .sb-nav { padding:0.5rem 0.75rem; display:flex; flex-direction:column; gap:0.25rem; }
    .sb-group { font-size:0.65rem; color:#71717a; padding:0.9rem 0.5rem 0.2rem; text-transform:uppercase; letter-spacing:0.08em; font-weight:600; }
    .sb-item { display:flex; align-items:center; gap:0.7rem; padding:0.6rem 0.75rem; border-radius:var(--radius); color:#a1a1aa; text-decoration:none; font-size:0.875rem; font-weight:500; transition:background-color 150ms, color 150ms; white-space:nowrap; overflow:hidden; }
    .sb-item:hover { background:#18181b; color:#fafafa; }
    .sb-item.active { background:#27272a; color:#fff; }
    .sb-icon { width:1.6rem; text-align:center; font-size:1.05rem; flex-shrink:0; }
    .sb-footer { margin-top:auto; padding:0.75rem; border-top:1px solid #27272a; }
    .sidebar-aside.collapsed .sb-label, .sidebar-aside.collapsed .sb-user { display:none; }
    .sidebar-aside.collapsed .sb-header { justify-content:center; padding-left:0.4rem; padding-right:0.4rem; }
    .sidebar-aside.collapsed .sb-item { justify-content:center; padding-left:0.4rem; padding-right:0.4rem; }
    .sidebar-scroll::-webkit-scrollbar { width: 4px; }
    .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
    .sidebar-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
    .sidebar-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

    /* ===== Card ===== */
    .card { background:hsl(var(--card)); border-radius:var(--radius); border:1px solid hsl(var(--border)); box-shadow:0 1px 2px 0 rgb(0 0 0 / 0.04); }
    .card-header { padding:1rem 1.5rem; border-bottom:1px solid hsl(var(--border)); }
    .card-body { padding:1.5rem; }
    .stat-card { background:hsl(var(--card)); border-radius:var(--radius); border:1px solid hsl(var(--border)); box-shadow:0 1px 2px 0 rgb(0 0 0 / 0.04); padding:1.25rem; transition:border-color 200ms, box-shadow 200ms; }
    .stat-card:hover { box-shadow:0 4px 12px 0 rgb(0 0 0 / 0.06); border-color:hsl(var(--ring) / 0.25); }

    /* ===== Table ===== */
    .table-container { background:hsl(var(--card)); border-radius:var(--radius); border:1px solid hsl(var(--border)); box-shadow:0 1px 2px 0 rgb(0 0 0 / 0.04); overflow-x:auto; }
    .table-container table { width:100%; font-size:0.875rem; border-collapse:collapse; }
    .table-container thead { background:hsl(var(--muted)); }
    .table-container th { padding:0.875rem 1rem; text-align:left; font-size:0.75rem; font-weight:600; color:hsl(var(--muted-foreground)); text-transform:uppercase; letter-spacing:0.05em; }
    .table-container td { padding:0.875rem 1rem; font-size:0.875rem; color:hsl(var(--foreground)); }
    .table-container tbody tr { border-top:1px solid hsl(var(--border)); transition:background-color 150ms; }
    .table-container tbody tr:hover { background:hsl(var(--muted) / 0.5); }

    /* ===== Badge ===== */
    .badge { display:inline-flex; align-items:center; gap:0.25rem; padding:0.125rem 0.625rem; font-size:0.75rem; font-weight:500; border-radius:calc(var(--radius) - 2px); border:1px solid transparent; }

    /* ===== Form controls ===== */
    .input-field { width:100%; border:1px solid hsl(var(--input)); border-radius:calc(var(--radius) - 2px); padding:0.625rem 0.875rem; font-size:0.875rem; background:hsl(var(--background)); color:hsl(var(--foreground)); transition:border-color 200ms, box-shadow 200ms; outline:none; }
    .input-field:focus { border-color:hsl(var(--ring)); box-shadow:0 0 0 3px hsl(var(--ring) / 0.12); }
    .input-field::placeholder { color:hsl(var(--muted-foreground)); }
    .input-label { display:block; font-size:0.875rem; font-weight:500; color:hsl(var(--foreground)); margin-bottom:0.375rem; }

    /* ===== Buttons ===== */
    .btn { display:inline-flex; align-items:center; justify-content:center; gap:0.5rem; padding:0.625rem 1rem; font-size:0.875rem; font-weight:500; border-radius:calc(var(--radius) - 2px); transition:background-color 200ms, box-shadow 200ms; text-decoration:none; border:none; cursor:pointer; outline:none; }
    .btn:focus { box-shadow:0 0 0 3px hsl(var(--ring) / 0.25); }
    .btn-primary { background:hsl(var(--primary)); color:hsl(var(--primary-foreground)); }
    .btn-primary:hover { background:hsl(240 5.9% 10% / 0.9); }
    .btn-success { background:#059669; color:#fff; }
    .btn-success:hover { background:#047857; }
    .btn-danger { background:hsl(var(--destructive)); color:hsl(var(--destructive-foreground)); }
    .btn-danger:hover { background:hsl(0 84.2% 60.2% / 0.9); }
    .btn-ghost { color:hsl(var(--muted-foreground)); }
    .btn-ghost:hover { background:hsl(var(--accent)); color:hsl(var(--accent-foreground)); }
    .btn-sm { padding:0.375rem 0.75rem; font-size:0.75rem; }

    /* ===== Alerts ===== */
    .alert { display:flex; align-items:flex-start; gap:0.75rem; padding:0.875rem 1rem; border-radius:var(--radius); font-size:0.875rem; }
    .alert-warning { background:#fffbeb; border:1px solid #fde68a; color:#92400e; }
    .alert-info { background:#eff6ff; border:1px solid #bfdbfe; color:#1e40af; }
    .alert-success { background:#ecfdf5; border:1px solid #a7f3d0; color:#065f46; }
    .alert-error { background:#fef2f2; border:1px solid #fecaca; color:#991b1b; }

    /* ===== Progress ===== */
    .progress-bar { background:hsl(var(--muted)); border-radius:9999px; height:0.625rem; overflow:hidden; }
    .progress-fill { height:100%; border-radius:9999px; transition:all 500ms; }

    /* ===== Form card ===== */
    .form-card { background:hsl(var(--card)); border:1px solid hsl(var(--border)); border-radius:var(--radius); box-shadow:0 1px 2px 0 rgb(0 0 0 / 0.04); padding:1.5rem; max-width:42rem; }
    .form-card.max-w-xl, .form-card.max-w-2xl, .form-card.max-w-3xl { max-width:none; }
    .form-section { margin-bottom:1.5rem; }
    .form-grid { display:grid; grid-template-columns:1fr; gap:1rem; margin-bottom:1.5rem; }
    @media (min-width:640px){ .form-grid { grid-template-columns:1fr 1fr; } }

    /* ===== Page header ===== */
    .page-header { display:flex; flex-direction:column; gap:0.75rem; margin-bottom:1.5rem; }
    @media (min-width:640px){ .page-header { flex-direction:row; align-items:center; justify-content:space-between; } }
    .page-title { font-size:1.25rem; font-weight:700; color:hsl(var(--foreground)); letter-spacing:-0.025em; }
    @media (min-width:640px){ .page-title { font-size:1.5rem; } }

    @media print { .no-print { display: none !important; } }

    /* ===== Fitur 9: urgent row & banner ===== */
    .urgent-row { background:#fef3c7 !important; }
    .urgent-row-critical { background:#fee2e2 !important; }
    .dismiss-banner { float:right; background:transparent; border:none; color:inherit; cursor:pointer; font-size:1.25rem; line-height:1; }
  </style>
```

- [ ] **Step 2: Jalankan app, cek halaman login & dashboard**

Run: `npm start` lalu buka `http://localhost:3000/login`, login, buka `/dashboard`.
Expected: background putih bersih, sidebar hitam zinc (bukan gradasi ungu-pink), tombol primary hampir-hitam, card putih berborder tipis tanpa warna indigo.

- [ ] **Step 3: Commit**

```bash
git add views/layout.ejs
git commit -m "style: reskin layout.ejs ke design tokens shadcn (tema neutral)"
```

---

### Task 2: Markup chrome kecil di layout.ejs (body bg, flash message, mobile nav)

**Files:**
- Modify: `views/layout.ejs` (baris 106, 177, 189–194)

**Interfaces:**
- Consumes: class `.alert`, `.alert-success`, `.alert-error` dari Task 1.

- [ ] **Step 1: Ubah 3 titik markup ini (persis seperti tertulis):**

Baris 106 — hapus `bg-gray-100` (warna latar sudah diambil alih CSS `body` dari Task 1):
```html
<body class="min-h-screen flex">
```

Baris 177 — mobile bottom nav jadi zinc gelap:
```html
<nav class="no-print md:hidden fixed bottom-0 left-0 right-0 bg-zinc-950 text-white flex justify-around py-2 z-10 text-xs">
```

Baris 189–194 — flash message pakai class alert shadcn:
```html
    <% if (locals.success) { %>
      <div class="alert alert-success mb-4"><%= success %></div>
    <% } %>
    <% if (locals.error) { %>
      <div class="alert alert-error mb-4"><%= error %></div>
    <% } %>
```

**Jangan sentuh** elemen `<aside>`, `<nav>` sidebar, `<main>`, `<form>` apa pun, dan script collapse sidebar.

- [ ] **Step 2: Cek visual** — buka `/dashboard`, resize jendela ke lebar < md: bottom nav hitam gelap muncul di bawah; trigger flash (mis. logout → pesan di halaman login) tampil sebagai alert berborder halus.

- [ ] **Step 3: Commit**

```bash
git add views/layout.ejs
git commit -m "style: body bg + flash message + mobile nav ikut tema shadcn"
```

---

### Task 3: Reskin halaman Material — public/cek-data.css

**Files:**
- Modify: `public/cek-data.css` (ganti seluruh isi file)

**Interfaces:**
- Consumes: semua CSS variables `:root` dari Task 1 (file ini di-load di dalam layout, jadi variables tersedia).

- [ ] **Step 1: Ganti seluruh isi `public/cek-data.css` dengan:**

```css
/* ===== Gaya bersama halaman Cek Data (tabel view-only) — tema shadcn ===== */
.cd-page { background:hsl(var(--background)); margin:-1rem -1.5rem; padding:1.5rem 1.5rem 6rem; min-height:100vh; }
@media (min-width:768px){ .cd-page { padding:1.5rem 2rem 3rem; } }
.cd-title { font-size:1.5rem; font-weight:700; margin:0 0 0.25rem; color:hsl(var(--foreground)); letter-spacing:-0.025em; }
.cd-subtitle { font-size:0.85rem; color:hsl(var(--muted-foreground)); margin:0; }

.cd-tabs { display:flex; flex-wrap:wrap; gap:0.5rem; margin:1.25rem 0 0.25rem; }
.cd-tab { padding:0.45rem 1rem; border-radius:calc(var(--radius) - 2px); font-size:0.82rem; font-weight:500; color:hsl(var(--muted-foreground)); background:transparent; border:1px solid hsl(var(--border)); text-decoration:none; transition:background-color 150ms, color 150ms; white-space:nowrap; }
.cd-tab:hover { color:hsl(var(--accent-foreground)); background:hsl(var(--accent)); }
.cd-tab.active { background:hsl(var(--primary)); color:hsl(var(--primary-foreground)); border-color:transparent; }

.cd-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:0.75rem; margin:1rem 0 0.9rem; }
.cd-search { flex:1; min-width:220px; padding:0.55rem 0.9rem; border:1px solid hsl(var(--input)); border-radius:calc(var(--radius) - 2px); font-size:0.9rem; outline:none; background:hsl(var(--background)); transition:border-color 150ms, box-shadow 150ms; }
.cd-search:focus { border-color:hsl(var(--ring)); box-shadow:0 0 0 3px hsl(var(--ring) / 0.12); }
.cd-note { background:hsl(var(--secondary)); border-radius:calc(var(--radius) - 2px); padding:0.4rem 0.9rem; font-size:0.78rem; font-weight:600; color:hsl(var(--secondary-foreground)); }
.cd-note.warn { color:#b45309; background:#fffbeb; border:1px solid #fde68a; }

.cd-section { margin-top:1.75rem; }
.cd-section-title { display:flex; align-items:center; gap:0.5rem; font-size:1rem; font-weight:600; color:hsl(var(--foreground)); margin:0 0 0.75rem; }
.cd-section-sub { font-size:0.78rem; font-weight:600; color:hsl(var(--muted-foreground)); }

.cd-card { background:hsl(var(--card)); border-radius:var(--radius); border:1px solid hsl(var(--border)); box-shadow:0 1px 2px 0 rgb(0 0 0 / 0.04); overflow:hidden; }
.cd-scroll { overflow-x:auto; }
table.cd-table { width:100%; border-collapse:collapse; font-size:0.88rem; }
.cd-table thead th { background:hsl(var(--muted)); color:hsl(var(--muted-foreground)); text-align:left; padding:0.7rem 0.9rem; font-weight:600; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.03em; white-space:nowrap; cursor:pointer; user-select:none; }
.cd-table thead th:hover { background:hsl(var(--accent)); color:hsl(var(--accent-foreground)); }
.cd-sort { opacity:0.65; font-size:0.8rem; margin-left:0.3rem; }
.cd-table tbody td { padding:0.65rem 0.9rem; border-top:1px solid hsl(var(--border)); color:hsl(var(--foreground)); white-space:nowrap; }
.cd-table tbody tr:hover { background:hsl(var(--muted) / 0.5); }
.cd-num { font-family:ui-monospace, SFMono-Regular, Menlo, monospace; }
td.cd-bad { background:#fee2e2; color:#b91c1c; font-weight:600; }
td.cd-warn { background:#fef3c7; color:#b45309; font-weight:600; }
.cd-empty-msg { text-align:center; padding:2rem 1rem; color:hsl(var(--muted-foreground)); }

.cd-pager { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:0.6rem; padding:0.8rem 1rem; border-top:1px solid hsl(var(--border)); background:hsl(var(--muted) / 0.4); }
.cd-pager-info { font-size:0.8rem; color:hsl(var(--muted-foreground)); }
.cd-pager-btn { border:1px solid hsl(var(--border)); background:hsl(var(--background)); color:hsl(var(--foreground)); font-weight:600; font-size:0.8rem; padding:0.4rem 0.9rem; border-radius:calc(var(--radius) - 2px); cursor:pointer; transition:background-color 150ms; }
.cd-pager-btn:hover:not(:disabled) { background:hsl(var(--accent)); }
.cd-pager-btn:disabled { opacity:0.5; cursor:not-allowed; }

.cd-link { color:hsl(var(--foreground)); font-weight:600; text-decoration:underline; text-underline-offset:3px; }
.cd-link:hover { color:hsl(var(--muted-foreground)); }
.cd-chip { display:inline-block; padding:0.15rem 0.6rem; border-radius:calc(var(--radius) - 2px); font-size:0.75rem; font-weight:600; white-space:nowrap; border:1px solid transparent; }
.cd-chip.ok { background:#dcfce7; color:#15803d; border-color:#bbf7d0; }
.cd-chip.bad { background:#fee2e2; color:#b91c1c; border-color:#fecaca; }
.cd-chip.pending { background:#fef3c7; color:#b45309; border-color:#fde68a; }
```

- [ ] **Step 2: Cek visual** — buka `/cek-data/material`, klik tab Pembelian Material & Material Produk; coba search + klik header kolom (sorting harus tetap jalan — CSS tidak boleh menyentuh `cek-data.js`); coba pagination bila ada datanya.
Expected: halaman putih bersih tanpa gradasi pelangi, tab aktif hitam, header tabel abu-abu terang, tidak ada warna ungu/pink.

- [ ] **Step 3: Commit**

```bash
git add public/cek-data.css
git commit -m "style: reskin halaman Material (cek-data) ke tema shadcn"
```

---

### Task 4: Reskin Kanban produksi — views/production-batches/index.ejs

**Files:**
- Modify: `views/production-batches/index.ejs` (hanya bagian CSS kanban di dalam blok `<style>`; blok `@view-transition` dan CSS transisi di bawahnya **jangan diubah**)

**Interfaces:**
- Consumes: CSS variables Task 1.

- [ ] **Step 1: Ganti bagian CSS tampilan kanban (dari komentar `/* ===== Kanban warna-warni ===== */` sampai sebelum komentar View Transitions) dengan:**

```css
  /* ===== Kanban — tema shadcn ===== */
  .kanban-page { background:hsl(var(--background)); margin:-1rem -1.5rem; padding:1.5rem 1.5rem 6rem; min-height:100vh; }
  @media (min-width:768px){ .kanban-page { padding:1.5rem 2rem 3rem; } }
  .kanban-title { font-size:1.5rem; font-weight:700; margin:0 0 0.25rem; color:hsl(var(--foreground)); letter-spacing:-0.025em; }
  .kanban-subtitle { font-size:0.85rem; color:hsl(var(--muted-foreground)); margin:0; }

  .kanban-wrap { display:grid; grid-template-columns:repeat(3,1fr); gap:1.25rem; align-items:start; }
  @media (max-width:768px) { .kanban-wrap { grid-template-columns:1fr; } }

  .kanban-col { border-radius:var(--radius); padding:0.9rem; min-height:10rem; background:hsl(var(--muted) / 0.5); border:1px solid hsl(var(--border)); }

  .kanban-col-header { display:flex; align-items:center; gap:0.6rem; padding:0.4rem 0.5rem 0.9rem; font-weight:600; font-size:0.95rem; color:hsl(var(--foreground)); }
  .kanban-col-emoji { width:2rem; height:2rem; border-radius:var(--radius); display:flex; align-items:center; justify-content:center; font-size:1rem; background:hsl(var(--card)); border:1px solid hsl(var(--border)); }
  .kanban-count { margin-left:auto; border-radius:calc(var(--radius) - 2px); padding:0.15rem 0.7rem; font-size:0.75rem; font-weight:600; background:hsl(var(--secondary)); color:hsl(var(--secondary-foreground)); }

  .kanban-card { display:block; width:100%; background:hsl(var(--card)); padding:0; text-align:left; border-radius:var(--radius); overflow:hidden; text-decoration:none; border:1px solid hsl(var(--border)); box-shadow:0 1px 2px rgb(0 0 0 / 0.04); transition:box-shadow 150ms, border-color 150ms; }
  .kanban-card:hover { box-shadow:0 4px 12px rgb(0 0 0 / 0.08); border-color:hsl(var(--ring) / 0.3); }
  .kanban-card + .kanban-card { margin-top:0.85rem; }

  .kanban-foto { width:100%; aspect-ratio:1/1; object-fit:cover; display:block; background:hsl(var(--muted)); }
  .kanban-foto-placeholder { width:100%; aspect-ratio:1/1; display:flex; align-items:center; justify-content:center; font-size:3rem; background:hsl(var(--muted)); }

  .kanban-card.urgent { border-color:#ef4444; box-shadow:0 0 0 1px #ef4444; }

  .kanban-body { padding:0.8rem; }
  .kanban-kode { font-weight:600; font-size:0.9rem; color:hsl(var(--foreground)); margin:0 0 0.15rem; overflow-wrap:anywhere; line-height:1.3; }
  .kanban-produk { font-size:0.75rem; color:hsl(var(--muted-foreground)); margin:0; }
  .kanban-badge { display:inline-block; margin-top:0.6rem; border-radius:calc(var(--radius) - 2px); padding:0.2rem 0.65rem; font-size:0.75rem; font-weight:600; border:1px solid transparent; }
  .kanban-urgent { display:inline-block; margin-top:0.4rem; margin-left:0.4rem; border-radius:calc(var(--radius) - 2px); padding:0.2rem 0.65rem; font-size:0.75rem; font-weight:600; background:#fee2e2; color:#dc2626; border:1px solid #fecaca; }
  .kanban-col.planned .kanban-badge { background:hsl(var(--secondary)); color:hsl(var(--secondary-foreground)); border-color:hsl(var(--border)); }
  .kanban-col.in_progress .kanban-badge { background:#fef3c7; color:#b45309; border-color:#fde68a; }
  .kanban-col.completed .kanban-badge { background:#d1fae5; color:#047857; border-color:#a7f3d0; }
  .kanban-empty { font-size:0.85rem; text-align:center; padding:1.75rem 0.5rem; border-radius:var(--radius); border:1px dashed hsl(var(--border)); color:hsl(var(--muted-foreground)); }
```

Jangan hapus/blok `@view-transition` atau CSS View Transitions API yang ada di bawah bagian ini — hanya ganti bagian tampilan.

- [ ] **Step 2: Cek visual** — buka `/production-batches`.
Expected: background putih, 3 kolom abu-abu terang seragam (bukan gradasi warna-warni), kartu putih berborder, badge status membawa warna (abu/amber/hijau), kartu urgent bergaris merah, klik kartu → animasi transisi ke detail masih jalan.

- [ ] **Step 3: Commit**

```bash
git add views/production-batches/index.ejs
git commit -m "style: reskin kanban produksi ke tema shadcn"
```

---

### Task 5: Reskin detail batch — views/production-batches/show.ejs

**Files:**
- Modify: `views/production-batches/show.ejs` (objek `meta` baris 3–7 + blok `<style>`)

**Interfaces:**
- Consumes: CSS variables Task 1.
- Catatan penting: style lama memakai `meta.grad.split(',')[1]` — dengan warna solid tanpa koma ekspresi ini menghasilkan `undefined`. Task ini mengganti semua `meta.grad` menjadi kunci baru `meta.accent` (warna solid), termasuk dua titik interpolasi di CSS.

- [ ] **Step 1: Ganti objek `meta` (baris 3–7) dengan:**

```js
  const meta = {
    planned:     { chip: '🗓 Rencana',  accent:'#3f3f46', bg:'#fafafa', border:'#e4e4e7', text:'#3f3f46' },
    in_progress: { chip: '🔨 Berjalan', accent:'#d97706', bg:'#fffbeb', border:'#fde68a', text:'#b45309' },
    completed:   { chip: '✅ Selesai',  accent:'#059669', bg:'#ecfdf5', border:'#a7f3d0', text:'#047857' },
  }[st];
```

- [ ] **Step 2: Di dalam blok `<style>` file yang sama, ganti setiap kemunculan:**
  - `background:<%= meta.grad %>` → `background:<%= meta.accent %>`
  - `border-left:4px solid <%= meta.grad.split(',')[1] %>` → `border-left:4px solid <%= meta.accent %>`

  Lalu ganti aturan-aturan tampilan berikut menjadi:

```css
  .bd-page { background:hsl(var(--background)); margin:-1rem -1.5rem; padding:1.5rem 1.5rem 6rem; min-height:100vh; }
  @media (min-width:768px){ .bd-page { padding:1.5rem 2rem 3rem; } }
  .bd-back { display:inline-flex; align-items:center; gap:0.4rem; background:transparent; color:hsl(var(--muted-foreground)); font-weight:500; font-size:0.85rem; text-decoration:none; padding:0.5rem 0.9rem; border-radius:calc(var(--radius) - 2px); margin-bottom:1rem; transition:background-color 150ms, color 150ms; }
  .bd-back:hover { background:hsl(var(--accent)); color:hsl(var(--accent-foreground)); }
  .bd-hero { border-radius:var(--radius); overflow:hidden; box-shadow:0 1px 2px rgb(0 0 0 / 0.04); background:hsl(var(--card)); border:1px solid hsl(var(--border)); display:flex; }
  .bd-status { display:inline-block; background:<%= meta.accent %>; color:#fff; font-weight:600; font-size:0.78rem; padding:0.25rem 0.8rem; border-radius:calc(var(--radius) - 2px); margin-bottom:0.6rem; box-shadow:none; }
  .bd-section-title { font-size:1rem; font-weight:600; color:hsl(var(--foreground)); margin:0 0 0.75rem; }
  .bd-progress { background:hsl(var(--card)); border:1px solid hsl(var(--border)); border-radius:var(--radius); padding:1.1rem 1.25rem; box-shadow:0 1px 2px rgb(0 0 0 / 0.04); }
  .bd-progress-track { background:hsl(var(--muted)); border-radius:9999px; height:0.9rem; overflow:hidden; }
  .bd-tile { background:hsl(var(--card)); border:1px solid hsl(var(--border)); border-radius:var(--radius); padding:0.9rem 1rem; box-shadow:0 1px 2px rgb(0 0 0 / 0.04); border-top-width:1px; }
  .bd-tile:nth-child(3n+2) { border-top-color:hsl(var(--border)); }
  .bd-tile:nth-child(3n) { border-top-color:hsl(var(--border)); }
  .bd-var { background:hsl(var(--card)); border:1px solid hsl(var(--border)); border-radius:var(--radius); padding:0.7rem 0.95rem; box-shadow:0 1px 2px rgb(0 0 0 / 0.04); min-width:140px; }
  .bd-jahit-row { display:flex; align-items:center; gap:0.75rem; background:hsl(var(--card)); border:1px solid hsl(var(--border)); border-radius:var(--radius); padding:0.75rem 1rem; box-shadow:0 1px 2px rgb(0 0 0 / 0.04); }
  .bd-jahit-num { box-shadow:none; }
  .bd-biaya { background:hsl(var(--card)); border:1px solid hsl(var(--border)); border-radius:var(--radius); padding:1.1rem 1.25rem; box-shadow:0 1px 2px rgb(0 0 0 / 0.04); }
  .bd-biaya-value { color:hsl(var(--foreground)); }
  .bd-biaya-value.green { color:#047857; }
  .bd-empty { color:hsl(var(--muted-foreground)); font-size:0.85rem; background:hsl(var(--card)); border:1px dashed hsl(var(--border)); border-radius:var(--radius); padding:1.25rem; text-align:center; }
```

  Aturan `bd-*` lain yang tidak disebut di atas dibiarkan apa adanya selama tidak mengandung gradasi; hapus `box-shadow` besar berwarna pada `.bd-back:hover`, `.bd-jahit-num`, `.bd-status` bila masih tersisa.

- [ ] **Step 3: Cek visual** — buka `/production-batches`, klik satu kartu dari tiap kolom status (Rencana/Berjalan/Selesai, seadanya data).
Expected: halaman putih bersih, hero card putih berborder, badge & progress bar memakai warna solid status (abu/amber/hijau), tile & varian seragam border tipis, tidak ada gradasi; tombol back hover-nya abu halus.

- [ ] **Step 4: Commit**

```bash
git add views/production-batches/show.ejs
git commit -m "style: reskin detail batch produksi ke tema shadcn"
```

---

### Task 6: Verifikasi menyeluruh + penjagaan regresi form

**Files:**
- Tidak ada perubahan file; hanya verifikasi (kalau ditemukan masalah, perbaiki dulu sebelum melanjutkan — perbaikan ikut commit verifikasi atau commit tersendiri per masalah).

**Interfaces:**
- Consumes: hasil Task 1–5.

- [ ] **Step 1: Inspeksi statis form (penjagaan regresi 2026-07-07 / 2026-07-21)**

Run:
```bash
grep -rn "<form" views/ | grep -v "action="
```
Expected: **tidak ada output** (setiap form tetap punya atribut `action`). Kalau ada output → form kehilangan `action` — hentikan dan cari di commit Task 1–5 mana perubahan itu terjadi.

Run:
```bash
grep -rln "csrf" views/ | wc -l
```
Bandingkan jumlahnya dengan sebelum reskin (catat dulu sebelum mulai: `git stash list` tidak perlu — cukup jalankan perintah ini di commit `e6974d1` via `git show e6974d1:views/<file>` bila curiga). Tidak boleh ada file yang kehilangan input CSRF.

- [ ] **Step 2: Cek visual semua modul** — buka satu per satu:
  - `/login` (sebelum login): card login di tengah, tombol hitam
  - `/dashboard`: stat cards + tabel
  - `/cek-data/material` + 2 tab lainnya (sudah di Task 3, cek ulang cepat)
  - `/vendors`, `/vendors/create` (form: label, input, tombol)
  - `/products`, `/products/create`
  - `/raw-materials`, `/raw-materials/create`
  - `/admin/currencies`
  - `/purchase-orders` (list) dan satu halaman detail
  - `/purchase-imports`
  - `/production-batches` (sudah Task 4) + satu detail (sudah Task 5)
  - `/hpp`
  - `/reports/stock-card`, `/reports/monthly-expenses`
  - `/validation` (login sebagai role finance bila tersedia)

  Kriteria lulus tiap halaman: latar putih/abu sangat terang, tanpa sisa warna indigo/ungu/pink, tombol primary hitam, tabel header abu terang, badge/alert terbaca jelas, tidak ada elemen yang pecah layoutnya.

- [ ] **Step 3: Smoke test fungsi (tanpa menulis data)**
  - Sort & search di `/cek-data/material` masih jalan (klik header kolom, ketik di search box)
  - Collapse sidebar (tombol ◀/▶) masih jalan & state tersimpan
  - Modal kanban terbuka saat kartu diklik (kalau modal variasi ada)
  - Logout & login ulang sukses
  - **Jangan** submit form create/edit/delete apa pun — database ini produksi.

- [ ] **Step 4: Commit penutup (bila ada perbaikan kecil hasil verifikasi)**

```bash
git add -A
git commit -m "style: perbaikan hasil verifikasi reskin shadcn"
```
(Lewati langkah ini jika tidak ada perbaikan.)

---

## Catatan untuk plan berikutnya

- **Plan 2 (Hosting Render):** tidak bergantung pada plan ini; bisa dikerjakan kapan saja, bahkan sebelum ini selesai.
- **Plan 3 (Foundation client/ + API):** baru ditulis setelah F1 diverifikasi hijau.
- Urutan modul migrasi F4 ada di spec §2 D6; modul Material menunggu user menyelesaikan fitur WIP-nya dulu (spec §5).
