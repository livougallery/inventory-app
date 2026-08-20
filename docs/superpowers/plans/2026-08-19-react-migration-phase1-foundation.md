# React Migration Phase 1 — Foundation (shadcn-first) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mendirikan fondasi migrasi React (frontend Vite+shadcn + JSON API + toggle per route) dengan urutan **frontend/shadcn dulu, backend API belakangan**, dan mengakhiri Phase 1 dengan `/login` sudah di-serve oleh SPA React sebagai bukti konsep end-to-end.

**Architecture:** Express yang ada direfaktor jadi `createApp()` supaya bisa dites dengan supertest; toggle middleware baru melayani path di daftar `MIGRATED` dengan `frontend/dist/index.html`; empat endpoint JSON baru (`/api/csrf`, `/api/me`, `/api/login`, `/api/logout`) memakai mekanisme session + CSRF yang sudah ada tanpa diubah. Frontend adalah Vite+React+TS+shadcn yang build ke `frontend/dist`.

**Tech Stack:** Express 5, supertest, Jest, Vite, React 18/19, TypeScript, React Router, shadcn/ui + Tailwind, lucide-react.

**Spec:** `docs/superpowers/specs/2026-08-19-react-migration-design.md`

## Global Constraints

- **Tidak mengubah mekanisme keamanan yang sudah ada** — session cookie, CSRF satu-kali-pakai (`middleware/csrf.js`), role gating. Hanya menambah lapisan JSON di atasnya.
- **Tidak mengubah Supabase / skema DB** — tidak ada migrasi tabel.
- **URL tidak berubah** — toggle adalah satu-satunya sumber kebenaran path mana yang serve SPA.
- **`CLAUDE.md` dan `.mcp.json` tetap untracked** — jangan pernah `git add CLAUDE.md .mcp.json`.
- **Commit hanya path spesifik** yang disebut di tiap task; jangan `git add -A` (working tree bisa berisi perubahan dari sesi lain).
- **Bahasa UI & pesan error tetap Indonesia** (mengikuti `views/auth/login.ejs`).
- Test dijalankan dengan `npm test` (Jest, `maxWorkers: 1`, schema `test`).

---

### Task 1: Refactor `createApp()` + smoke test supertest

**Files:**
- Modify: `index.js`
- Create: `tests/api.test.js`
- Modify: `package.json` (devDependencies)

**Interfaces:**
- Consumes: `db` dari `db.js` (untuk session store test).
- Produces: `createApp(options)` — mengembalikan instance Express yang sama persis dengan perilaku `app` sekarang; `module.exports = { createApp, app }`. `app` tetap di-export supaya boot tidak berubah.

- [ ] **Step 1: Install supertest**

Run: `npm i -D supertest`
Expected: `supertest` masuk `devDependencies` di `package.json`.

- [ ] **Step 2: Tulis test yang gagal**

Buat `tests/api.test.js`:

```js
require('dotenv').config();
process.env.NODE_ENV = 'test';

const bcrypt = require('bcryptjs');
const db = require('../db');
const { createApp } = require('../index');

const app = createApp({ store: db.pool });

async function seedUser() {
  const hash = bcrypt.hashSync('admin123', 10);
  return db.run(
    "INSERT INTO users (username, password, nama_lengkap, role) VALUES ($1, $2, $3, $4) RETURNING id",
    ['admin', hash, 'Admin Utama', 'admin']
  );
}

describe('createApp smoke', () => {
  it('GET /login masih render EJS (belum ada di MIGRATED)', async () => {
    const request = require('supertest');
    const res = await request(app).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Inventory System');
  });
});
```

- [ ] **Step 3: Jalankan test untuk memastikan gagal**

Run: `npx jest tests/api.test.js --runInBand`
Expected: FAIL — `createApp` belum ada (`require('../index')` hanya mengembalikan instance app atau `module.exports = app`).

- [ ] **Step 4: Implementasi `createApp()` di index.js**

Refaktor `index.js` — bungkus semua setup middleware + route dalam fungsi `createApp`, biarkan boot/seed/listen tetap di module scope:

```js
// index.js
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const methodOverride = require('method-override');
const path = require('path');
const bcrypt = require('bcryptjs');
const expressLayouts = require('express-ejs-layouts');

const db = require('./db');

function createApp(options = {}) {
  const app = express();
  // Session store: pakai pool yang di-inject saat test (search_path sudah
  // ter-pin ke schema `test` oleh tests/setup.js), buat PgSession baru
  // untuk runtime.
  const store = options.store || new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'session'
  });

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(methodOverride('_method'));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  app.use(session({
    store,
    secret: 'inventory-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
  }));

  // res.locals (user, currentPath, modePresentasi) — TIDAK diubah, tetap di sini.
  app.use((req, res, next) => {
    res.locals.user = req.session.userId ? {
      id: req.session.userId,
      username: req.session.username,
      role: req.session.role,
      nama_lengkap: req.session.namaLengkap || req.session.username
    } : null;
    res.locals.currentPath = req.path;
    res.locals.modePresentasi = true;
    next();
  });

  const { generateToken } = require('./middleware/csrf');
  app.use(generateToken);

  // EJS setup — TIDAK diubah.
  app.use(expressLayouts);
  app.set('layout', 'layout');
  app.set('layout extractScripts', true);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // Semua router halaman — TIDAK diubah (isi `app.use('/', require(...))` dst).
  app.use('/', require('./routes/auth'));
  app.get('/', (req, res) => res.redirect('/production-batches'));
  app.use('/dashboard', require('./routes/dashboard'));
  app.use('/vendors', require('./routes/vendors'));
  app.use('/products', require('./routes/products'));
  app.use('/raw-materials', require('./routes/raw-materials'));
  app.use('/purchase-orders', require('./routes/purchase-orders'));
  app.use('/production-batches', require('./routes/production-batches'));
  app.use('/purchase-imports', require('./routes/purchase-imports'));
  app.use('/hpp', require('./routes/hpp'));
  app.use('/validation', require('./routes/validation'));
  app.use('/reports', require('./routes/reports'));
  app.use('/admin/currencies', require('./routes/currencies'));
  app.use('/cek-data', require('./routes/cek-data'));

  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Terjadi kesalahan: ' + err.message);
  });

  return app;
}

const app = createApp();

// seedDefaults() — TIDAK diubah (isi sama persis dengan sekarang).

// Boot HANYA saat dijalankan langsung (`npm start` / `node index.js`).
// Saat di-require oleh test: JANGAN bootstrap/seed/listen — tests/setup.js
// sudah bootstrap schema `test`, dan side effect ke DB runtime tidak boleh
// terjadi saat test.
if (require.main === module) {
  (async () => {
    try {
      await db.bootstrapSchema();
      await seedDefaults();
      app.listen(process.env.PORT || 3000, () => {
        console.log(`Server running at http://localhost:${process.env.PORT || 3000}`);
      });
    } catch (err) {
      console.error('[FATAL] Boot failed:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = { createApp, app };
```

Catatan penting: **jangan mengubah isi `seedDefaults()`** dan jangan mengubah urutan middleware yang sudah ada; hanya membungkusnya. Guard `if (require.main === module)` WAJIB — tanpa itu `require('../index')` dari test ikut menjalankan boot.

- [ ] **Step 5: Jalankan test untuk memastikan lulus**

Run: `npx jest tests/api.test.js --runInBand`
Expected: PASS.

- [ ] **Step 6: Verifikasi boot manual tidak berubah**

Run: `node index.js` (lalu Ctrl+C setelah lihat `Server running at http://localhost:3000`).
Expected: Boot sukses, seed jalan, `GET /login` masih render halaman EJS.

- [ ] **Step 7: Commit**

```bash
git add index.js tests/api.test.js package.json package-lock.json
git commit -m "refactor: ekstrak createApp() dari index.js supaya bisa dites supertest"
```

---

### Task 2: Scaffold `frontend/` (Vite + React + TS + Tailwind + shadcn)

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/index.css`, `frontend/components.json`, `frontend/src/lib/utils.ts`, `frontend/tailwind.config.ts` (bila dipakai versi Tailwind yang butuh config), `frontend/.gitignore`
- Modify: `.gitignore` (root)

**Interfaces:**
- Consumes: Node 20+, npm.
- Produces: `frontend/` yang bisa `npm run build` menghasilkan `frontend/dist/index.html`; `frontend/src/index.css` memuat token CSS shadcn (HSL) + token `--sidebar-*` dari `views/layout.ejs`.

- [ ] **Step 1: Buat project Vite**

Run:
```bash
cd frontend 2>/dev/null || true
npm create vite@latest frontend -- --template react-ts
cd frontend && npm install
```

Bila `npm create vite` menolak mode non-interaktif, buat file secara manual sesuai template `react-ts` Vite 5/6 (lihat `vite.config.ts` di bawah).

- [ ] **Step 2: Install Tailwind + inisialisasi shadcn**

Ikuti panduan resmi shadcn untuk Vite: https://ui.shadcn.com/docs/installation/vite
Ringkasnya:

```bash
npm install tailwindcss @tailwindcss/vite   # Tailwind v4; atau ikuti versi yang diarahkan docs
npx shadcn@latest init                       # pilih base color "neutral", CSS variables: yes
```

`shadcn init` akan menulis `frontend/components.json` dan token CSS di `frontend/src/index.css`. **Jangan ubah pilihan default kecuali yang disebut di bawah.**

- [ ] **Step 3: Set token `--sidebar-*` di `frontend/src/index.css`**

Tambahkan (atau ganti blok yang dibuat shadcn) token berikut persis sama dengan nilai HSL di `views/layout.ejs:34-41`:

```css
:root {
  --sidebar-background: 0 0% 98%;
  --sidebar-foreground: 240 5.3% 26.1%;
  --sidebar-primary: 240 5.9% 10%;
  --sidebar-primary-foreground: 0 0% 98%;
  --sidebar-accent: 240 4.8% 95.9%;
  --sidebar-accent-foreground: 240 5.9% 10%;
  --sidebar-border: 220 13% 91%;
  --sidebar-ring: 217.2 91.2% 59.8%;
}
```

Jika shadcn/Tailwind versi yang terpasang memakai format OKLCH, konversi nilai HSL di atas ke OKLCH yang setara; nilai light-theme adalah acuan.

- [ ] **Step 4: Konfigurasi Vite (proxy + build outDir)**

`frontend/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});
```

Pastikan alias `@` juga terdaftar di `tsconfig.json` (`compilerOptions.paths`) bila belum dibuat oleh shadcn.

- [ ] **Step 5: Placeholder `App.tsx` yang bisa di-build**

`frontend/src/App.tsx`:

```tsx
export default function App() {
  return <div className="p-8 text-sm text-muted-foreground">Frontend scaffold OK</div>;
}
```

- [ ] **Step 6: Build untuk verifikasi**

Run:
```bash
cd frontend && npm run build
```
Expected: sukses, menghasilkan `frontend/dist/index.html`.

- [ ] **Step 7: Tambah `frontend/dist` ke `.gitignore` root**

Append ke `.gitignore`:

```
frontend/dist/
```

- [ ] **Step 8: Commit**

```bash
git add frontend .gitignore
git commit -m "feat(frontend): scaffold Vite+React+TS+shadcn dengan token sidebar"
```

---

### Task 3: Halaman Login React (shadcn Card/Input/Button/Alert)

**Files:**
- Create: `frontend/src/pages/Login.tsx`, `frontend/src/lib/api.ts`, `frontend/src/components/ui/{button,input,label,card,alert}.tsx` (via shadcn CLI)
- Modify: `frontend/src/App.tsx` (routing), `frontend/package.json` (deps react-router, lucide)

**Interfaces:**
- Consumes: endpoint `GET /api/csrf` dan `POST /api/login` dari Task 4 & 5 (belum ada saat task ini berjalan — halaman tetap ditulis sesuai kontrak).
- Produces: `LoginPage` yang submit ke `/api/login` dengan header `x-csrf-token`; redirect ke `/dashboard` (EJS) saat sukses.

- [ ] **Step 1: Install dependency routing & ikon**

Run:
```bash
cd frontend && npm install react-router-dom lucide-react
```

- [ ] **Step 2: Tambah komponen shadcn**

Run:
```bash
cd frontend && npx shadcn@latest add button input label card alert
```
Expected: file `frontend/src/components/ui/*.tsx` dibuat.

- [ ] **Step 3: Tulis `frontend/src/lib/api.ts`**

```ts
let csrfToken: string | null = null;

export async function getCsrf(): Promise<string> {
  const res = await fetch('/api/csrf');
  const data = await res.json();
  csrfToken = data.csrfToken;
  return csrfToken;
}

export async function apiPost(path: string, body: unknown): Promise<Response> {
  if (!csrfToken) await getCsrf();
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken! },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  // Token sekali-pakai: server rotasi tiap validasi; bila response mutasi
  // menyertakan csrfToken baru, pakai itu untuk request berikutnya.
  try {
    const clone = res.clone();
    const data = await clone.json();
    if (data?.csrfToken) csrfToken = data.csrfToken;
  } catch { /* response non-JSON — abaikan */ }
  return res;
}
```

- [ ] **Step 4: Tulis `frontend/src/pages/Login.tsx`**

Replikasi `views/auth/login.ejs` dengan komponen shadcn (card max-w-md, judul "Inventory System" + ikon Package, subjudul "Fashion UMKM", alert error, input username/password, tombol Login full-width, link Register ke `/register`):

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCsrf, apiPost } from '@/lib/api';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { document.title = 'Login - Inventory'; getCsrf(); }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await apiPost('/api/login', { username, password });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error || 'Terjadi kesalahan');
      setLoading(false);
      return;
    }
    window.location.href = '/dashboard'; // dashboard masih EJS — full load
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-1">
          <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
            <Package className="h-6 w-6" /> Inventory System
          </h1>
          <p className="text-sm text-muted-foreground">Fashion UMKM</p>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={username} required
                onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} required
                onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Memproses…' : 'Login'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Belum punya akun?{' '}
            <a href="/register" className="text-primary underline hover:opacity-80">Register</a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Pasang routing di `frontend/src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/Login';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

Halaman yang **belum** migrasi tidak boleh punya route di SPA — `*` redirect ke `/login` satu-satunya fallback yang aman.

- [ ] **Step 6: Build untuk verifikasi**

Run: `cd frontend && npm run build`
Expected: sukses tanpa error TS.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src frontend/components.json
git commit -m "feat(frontend): halaman Login React dengan komponen shadcn"
```

---

### Task 4: `GET /api/csrf`

**Files:**
- Create: `routes/api.js`
- Modify: `index.js` (mount router)
- Modify: `tests/api.test.js`

**Interfaces:**
- Consumes: `generateToken` dari `middleware/csrf.js` (sudah terpasang global di `createApp`).
- Produces: `GET /api/csrf` → `200 { csrfToken: string }`, PUBLIK (tidak butuh login).

- [ ] **Step 1: Tulis test yang gagal**

Append ke `tests/api.test.js`:

```js
describe('GET /api/csrf', () => {
  it('return csrfToken untuk guest (publik)', async () => {
    const request = require('supertest');
    const res = await request(app).get('/api/csrf');
    expect(res.status).toBe(200);
    expect(typeof res.body.csrfToken).toBe('string');
    expect(res.body.csrfToken.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx jest tests/api.test.js --runInBand -t "csrf"`
Expected: FAIL — 404 karena route belum ada.

- [ ] **Step 3: Implementasi `routes/api.js`**

```js
const express = require('express');
const router = express.Router();

// PUBLIK (tidak butuh login): login butuh token CSRF sebelum terautentikasi;
// /api/me 401 untuk guest, jadi endpoint terpisah ini dibutuhkan.
router.get('/csrf', (req, res) => {
  res.json({ csrfToken: req.session.csrfToken });
});

module.exports = router;
```

- [ ] **Step 4: Mount di `createApp()` sebelum semua router halaman**

Di `index.js`, tepat sebelum `app.use('/', require('./routes/auth'))`:

```js
app.use('/api', require('./routes/api'));
```

- [ ] **Step 5: Jalankan test untuk memastikan lulus**

Run: `npx jest tests/api.test.js --runInBand`
Expected: PASS (semua test di file ini).

- [ ] **Step 6: Commit**

```bash
git add routes/api.js index.js tests/api.test.js
git commit -m "feat(api): GET /api/csrf publik untuk kebutuhan login SPA"
```

---

### Task 5: `POST /api/login` (validasi CSRF, set session, rotasi token)

**Files:**
- Modify: `routes/api.js`
- Modify: `tests/api.test.js`

**Interfaces:**
- Consumes: `validateToken` dari `middleware/csrf.js`; `bcryptjs`; `db.one` dari `db.js`.
- Produces: `POST /api/login` body `{ username, password }` + header `x-csrf-token`; `200 { ok:true, csrfToken }` bila sukses; `401 { error }` bila kredensial salah / field kosong; `403` bila CSRF tidak valid.

- [ ] **Step 1: Tulis test yang gagal**

Append ke `tests/api.test.js`:

```js
describe('POST /api/login', () => {
  it('200 + csrfToken baru bila kredensial benar', async () => {
    const request = require('supertest');
    await seedUser();
    const csrf = (await request(app).get('/api/csrf')).body.csrfToken;
    const res = await request(app).post('/api/login')
      .set('x-csrf-token', csrf)
      .send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.csrfToken).toBe('string');
  });

  it('401 bila password salah', async () => {
    const request = require('supertest');
    await seedUser();
    const csrf = (await request(app).get('/api/csrf')).body.csrfToken;
    const res = await request(app).post('/api/login')
      .set('x-csrf-token', csrf)
      .send({ username: 'admin', password: 'salah' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });

  it('401 bila field kosong', async () => {
    const request = require('supertest');
    await seedUser();
    const csrf = (await request(app).get('/api/csrf')).body.csrfToken;
    const res = await request(app).post('/api/login')
      .set('x-csrf-token', csrf)
      .send({ username: '', password: '' });
    expect(res.status).toBe(401);
  });

  it('403 bila header CSRF tidak valid', async () => {
    const request = require('supertest');
    await seedUser();
    const res = await request(app).post('/api/login')
      .set('x-csrf-token', 'token-palsu')
      .send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx jest tests/api.test.js --runInBand -t "api/login"`
Expected: FAIL — 404 karena route belum ada.

- [ ] **Step 3: Implementasi di `routes/api.js`**

```js
const bcrypt = require('bcryptjs');
const db = require('../db');
const { validateToken } = require('../middleware/csrf');

router.post('/login', validateToken, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(401).json({ error: 'Username dan password harus diisi' });
  }
  const user = await db.one('SELECT * FROM users WHERE username = $1', [username]);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Username atau password salah' });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  req.session.namaLengkap = user.nama_lengkap;
  // Mutasi response menyertakan csrfToken baru (token sekali-pakai sudah
  // dirotasi oleh validateToken di atas).
  res.json({ ok: true, csrfToken: req.session.csrfToken });
});
```

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

Run: `npx jest tests/api.test.js --runInBand`
Expected: semua PASS (termasuk test `GET /api/me` yang login).

- [ ] **Step 5: Commit**

```bash
git add routes/api.js tests/api.test.js
git commit -m "feat(api): POST /api/login dengan CSRF + rotasi token"
```

---

### Task 6: `GET /api/me` + export `autoLogin`

**Files:**
- Modify: `middleware/auth.js` (export `autoLogin`)
- Modify: `routes/api.js`
- Modify: `tests/api.test.js`

**Interfaces:**
- Consumes: `autoLogin` dari `middleware/auth.js` (untuk AUTO_LOGIN); `res.locals.modePresentasi` dari middleware `createApp`; `POST /api/login` dari Task 5 (untuk test).
- Produces: `GET /api/me` → `200 { user:{id,username,nama_lengkap,role}, modePresentasi, csrfToken }`; `401` bila belum login (bukan redirect).

- [ ] **Step 1: Tulis test yang gagal**

Append ke `tests/api.test.js`:

```js
describe('GET /api/me', () => {
  it('401 untuk guest', async () => {
    const request = require('supertest');
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
  });

  it('return user + modePresentasi + csrfToken setelah login', async () => {
    const request = require('supertest');
    await seedUser();
    const csrf = (await request(app).get('/api/csrf')).body.csrfToken;
    const agent = request.agent(app);
    await agent.post('/api/login')
      .set('x-csrf-token', csrf)
      .send({ username: 'admin', password: 'admin123' });
    const res = await agent.get('/api/me');
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('admin');
    expect(res.body.modePresentasi).toBe(true);
    expect(typeof res.body.csrfToken).toBe('string');
  });
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx jest tests/api.test.js --runInBand -t "api/me"`
Expected: FAIL — 404 karena route belum ada.

- [ ] **Step 3: Export `autoLogin` dari `middleware/auth.js`**

Ubah `module.exports` di `middleware/auth.js`:

```js
module.exports = {
  isAuthenticated: /* ...tidak diubah... */,
  isGuest: /* ...tidak diubah... */,
  autoLogin, // untuk AUTO_LOGIN di endpoint API
};
```

- [ ] **Step 4: Implementasi `GET /api/me` di `routes/api.js`**

```js
const { autoLogin } = require('../middleware/auth');

// isAuthenticated versi halaman me-redirect ke /login — untuk JSON API kita
// butuh 401, jadi buat guard khusus di sini tanpa mengubah middleware halaman.
async function apiAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  if (process.env.AUTO_LOGIN === 'true') {
    try {
      if (await autoLogin(req, res)) return next();
    } catch { /* DB gagal — jatuh ke 401 */ }
  }
  res.status(401).json({ error: 'Belum login' });
}

router.get('/me', apiAuth, (req, res) => {
  res.json({
    user: {
      id: req.session.userId,
      username: req.session.username,
      nama_lengkap: req.session.namaLengkap || req.session.username,
      role: req.session.role,
    },
    modePresentasi: !!res.locals.modePresentasi,
    csrfToken: req.session.csrfToken,
  });
});
```

- [ ] **Step 5: Jalankan test untuk memastikan lulus**

Run: `npx jest tests/api.test.js --runInBand`
Expected: semua PASS.

- [ ] **Step 6: Commit**

```bash
git add middleware/auth.js routes/api.js tests/api.test.js
git commit -m "feat(api): GET /api/me dengan autoLogin + guard JSON 401"
```

---

### Task 7: `GET /api/logout`

**Files:**
- Modify: `routes/api.js`
- Modify: `tests/api.test.js`

**Interfaces:**
- Consumes: session dari `createApp`.
- Produces: `GET /api/logout` → destroy session, `200 { ok:true }`.

- [ ] **Step 1: Tulis test yang gagal**

Append ke `tests/api.test.js`:

```js
describe('GET /api/logout', () => {
  it('destroy session, /api/me jadi 401 lagi', async () => {
    const request = require('supertest');
    await seedUser();
    const csrf = (await request(app).get('/api/csrf')).body.csrfToken;
    const agent = request.agent(app);
    await agent.post('/api/login')
      .set('x-csrf-token', csrf)
      .send({ username: 'admin', password: 'admin123' });
    const out = await agent.get('/api/logout');
    expect(out.status).toBe(200);
    expect(out.body.ok).toBe(true);
    const me = await agent.get('/api/me');
    expect(me.status).toBe(401);
  });
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx jest tests/api.test.js --runInBand -t "logout"`
Expected: FAIL — 404.

- [ ] **Step 3: Implementasi**

Append ke `routes/api.js`:

```js
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});
```

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

Run: `npx jest tests/api.test.js --runInBand`
Expected: semua PASS.

- [ ] **Step 5: Commit**

```bash
git add routes/api.js tests/api.test.js
git commit -m "feat(api): GET /api/logout"
```

---

### Task 8: Toggle MIGRATED + aktifkan `/login`

**Files:**
- Modify: `index.js`

**Interfaces:**
- Consumes: `frontend/dist/index.html` hasil build Task 2/3.
- Produces: `GET /login` serve SPA; path lain masih EJS; `frontend/dist/assets/*` ter-serve.

- [ ] **Step 1: Pasang toggle di `createApp()` SEBELUM semua router halaman**

Di `index.js`, di dalam `createApp()`, tepat sebelum `app.use('/api', ...)`:

```js
// Toggle per route: path di MIGRATED serve SPA dari frontend/dist.
// Hanya GET — navigasi SPA selalu GET; mutasi pergi ke /api/*.
const MIGRATED = ['/login'];
const DIST_INDEX = path.join(__dirname, 'frontend/dist/index.html');
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/assets/')) return next();
  const done = MIGRATED.some(p => req.path === p || req.path.startsWith(p + '/'));
  // Fallback EJS bila frontend/dist belum di-build (mis. fresh clone / test).
  if (done && fs.existsSync(DIST_INDEX)) {
    return res.sendFile(DIST_INDEX);
  }
  next();
});
app.use('/assets', express.static(path.join(__dirname, 'frontend/dist/assets')));
```

Tambahkan `const fs = require('fs');` di daftar require teratas `index.js`. Pastikan `MIGRATED` di atas semua `app.use('/…', require('./routes/…'))`.

- [ ] **Step 2: Tambah smoke test toggle**

Append ke `tests/api.test.js` (toggle belum aktif saat test — `createApp({ store })` tanpa build dist; test ini hanya memastikan toggle tidak mengganggu route EJS lain):

```js
describe('toggle MIGRATED', () => {
  it('GET /dashboard masih redirect (belum dimigrasi)', async () => {
    const request = require('supertest');
    const res = await request(app).get('/dashboard');
    expect([302, 200]).toContain(res.status);
  });
});
```

- [ ] **Step 3: Jalankan test + build + verifikasi manual**

Run:
```bash
npx jest tests/api.test.js --runInBand
cd frontend && npm run build && cd ..
node index.js
```
Verifikasi manual di browser:
1. `http://localhost:3000/login` → halaman React (bukan EJS).
2. Login salah password → alert merah "Username atau password salah".
3. Login benar (admin/admin123) → redirect ke `/dashboard` (EJS).
4. Logout dari sidebar dashboard → kembali ke `/login` (React).
5. Mode presentasi + AUTO_LOGIN: tanpa login manual, `/login` langsung redirect ke `/dashboard` karena `isGuest` → `autoLogin` di EJS router — **catatan:** karena toggle serve SPA sebelum router EJS, AUTO_LOGIN pada `/login` tidak lagi terjadi otomatis di SPA. Ini expected untuk Phase 1; halaman Login React tetap bisa dipakai manual. (Bila owner ingin AUTO_LOGIN di SPA, itu pekerjaan Phase 2.)

- [ ] **Step 4: Commit**

```bash
git add index.js tests/api.test.js
git commit -m "feat: toggle MIGRATED aktifkan /login sebagai SPA React"
```

---

### Task 9: Verifikasi end-to-end + checkpoint commit

**Files:**
- Modify: `tests/api.test.js` (bila ada temuan)

- [ ] **Step 1: Jalankan seluruh test suite**

Run: `npm test`
Expected: semua test hijau (termasuk `fifoService`, `productionBatches`, dan `api.test.js` baru).

- [ ] **Step 2: Verifikasi anti-regresi CRUD EJS**

Buka browser, cek halaman EJS yang belum migrasi masih berfungsi:
- `/vendors`, `/products`, `/raw-materials`: buka daftar + coba tambah/edit/hapus satu item.
- `/production-batches` (kanban): pindah satu kartu antar kolom.
- `/cek-data`: tab Material & Pembelian Material render.

Bila ada regresi, perbaiki dan commit terpisah sebelum lanjut.

- [ ] **Step 3: Verifikasi mode presentasi**

Dengan `res.locals.modePresentasi = true` (hardcoded di `index.js`) dan `AUTO_LOGIN=true` di `.env`: sidebar EJS menampilkan hanya Produksi + Material tanpa logout; halaman Login React tetap muncul saat mengakses `/login` langsung.

- [ ] **Step 4: Commit checkpoint bila ada perubahan tambahan**

```bash
git add tests/api.test.js
git commit -m "test: verifikasi end-to-end Phase 1 fondasi React"
```

(Bila tidak ada perubahan, lewati.)

---

## Self-Review

**Spec coverage:**
- Fondasi login + shell → Task 1–8 (shell layout sidebar-07 Phase 2; plan ini hanya fondasi + login sesuai spec Phase 1).
- Toggle per route + `MIGRATED` → Task 8.
- `/api/me`, `/api/login`, `/api/logout` → Task 6, 5, 7; `/api/csrf` (tambahan yang dibutuhkan, Task 4).
- CSRF rotasi + header `x-csrf-token` → Task 5 (`validateToken` + `csrfToken` baru di response) dan `frontend/src/lib/api.ts` (Task 3).
- Frontend Vite+shadcn+Tailwind → Task 2; halaman Login React → Task 3.
- Anti-regresi CRUD → Task 9 Step 2.
- Mode presentasi + AUTO_LOGIN → Task 9 Step 3; AUTO_LOGIN di `/api/me` via `apiAuth` → Task 5.

**Placeholder scan:** tidak ada "TBD/TODO/implement later"; semua langkah punya kode atau perintah konkret.

**Type consistency:** `createApp({ store })` dipakai konsisten; nama `csrfToken`, `modePresentasi`, `MIGRATED`, `apiAuth`, `validateToken`, `autoLogin` konsisten antar task.
