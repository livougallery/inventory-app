// Smoke test halaman /vendors di browser nyata, melawan server port 3012.
// Menjalankan: NODE_PATH=/tmp/node_modules node tests/smoke-vendors.js
//
// playwright TIDAK ada di package.json — NODE_PATH menunjuk salinan di luar
// repo. Tanpa itu require('playwright') gagal.
// Dipindahkan dari tmp/ 2026-09-14: berkas ini terabaikan git di sana, jadi
// sekali terhapus ia hilang permanen.
//
// AUTO_LOGIN=true menyebabkan requireAuth membuat session otomatis, jadi tidak
// perlu login manual lewat form.
const { chromium } = require('playwright');

const BASE = 'http://localhost:3012';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message.slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push('CONSOLE ERROR: ' + m.text().slice(0, 200));
  });
  page.on('response', (r) => {
    if (r.url().includes('/api/')) {
      console.log('  API ' + r.status() + ' ' + r.url().replace(BASE, ''));
    }
  });

  const step = (name) => console.log('\n=== ' + name + ' ===');

  // ---- 1. Daftar vendor ----
  step('1. Buka /vendors');
  await page.goto(BASE + '/vendors', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const h1 = await page.locator('h1').first().textContent().catch(() => null);
  console.log('h1:', h1);

  const rowCount = await page.locator('table tbody tr').count();
  console.log('baris tabel:', rowCount);

  const rows = await page.locator('table tbody tr').evaluateAll((trs) =>
    trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()))
  );
  rows.forEach((r) => console.log('  | ' + r.join(' | ')));

  // Kolom Tipe harus menampilkan label yang bisa dibaca.
  const headers = await page.locator('table thead th').evaluateAll((ths) => ths.map((t) => t.textContent.trim()));
  console.log('header:', JSON.stringify(headers));

  // ---- 2. Search ----
  step('2. Search "Five"');
  const search = page.locator('input[placeholder*="Cari"]').first();
  await search.fill('Five');
  await page.waitForTimeout(500);
  const afterSearch = await page.locator('table tbody tr').count();
  console.log('baris setelah search "Five":', afterSearch);

  await search.fill('ZZZ-TIDAK-ADA');
  await page.waitForTimeout(500);
  const emptyRow = await page.locator('table tbody tr').first().textContent().catch(() => '');
  console.log('pencarian kosong menampilkan:', emptyRow.trim().slice(0, 60));

  await search.fill('');
  await page.waitForTimeout(400);

  // ---- 3. Filter tipe ----
  step('3. Filter tipe');
  const filterBtn = page.locator('button', { hasText: 'Filter' }).first();
  await filterBtn.click();
  await page.waitForTimeout(600);
  const opts = await page.locator('[role=option], [role=menuitemcheckbox]').evaluateAll((els) =>
    els.map((e) => e.textContent.trim())
  );
  console.log('opsi filter:', JSON.stringify(opts));

  // Pilih "White Label" — nilainya harus cocok dengan 1 vendor (AS Studio).
  const wl = page.locator('[role=option], [role=menuitemcheckbox]').filter({ hasText: 'White Label' }).first();
  if (await wl.count()) {
    await wl.click();
    await page.waitForTimeout(600);
    console.log('baris setelah filter White Label:', await page.locator('table tbody tr').count());
    const names = await page.locator('table tbody tr td:first-child').evaluateAll((tds) => tds.map((t) => t.textContent.trim()));
    console.log('nama:', JSON.stringify(names));
  } else {
    console.log('opsi White Label TIDAK DITEMUKAN');
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ---- 4. Buka dialog tambah ----
  step('4. Dialog tambah vendor');
  await page.locator('button', { hasText: 'Tambah Vendor' }).first().click();
  await page.waitForTimeout(700);
  const dialogVisible = await page.locator('[role=dialog]').count();
  console.log('dialog terbuka:', dialogVisible > 0);

  // Pilih tipe lewat Select shadcn.
  const trigger = page.locator('[data-slot=select-trigger]').first();
  if (await trigger.count()) {
    await trigger.click();
    await page.waitForTimeout(700);
    const types = await page.locator('[role=option]').evaluateAll((els) => els.map((e) => e.textContent.trim()));
    console.log('opsi tipe di form:', JSON.stringify(types));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } else {
    console.log('select trigger TIDAK DITEMUKAN');
  }

  // Tutup dialog tanpa menyimpan.
  await page.locator('[role=dialog] button', { hasText: 'Batal' }).first().click();
  await page.waitForTimeout(500);
  console.log('dialog tertutup:', (await page.locator('[role=dialog]').count()) === 0);

  // ---- 5. Screenshot ----
  step('5. Screenshot');
  await page.screenshot({ path: 'tmp/smoke/vendors-page.png', fullPage: true });
  console.log('screenshot -> tmp/smoke/vendors-page.png');

  step('HASIL');
  console.log('error halaman:', pageErrors.length ? pageErrors : 'tidak ada');

  await browser.close();
})().catch((e) => {
  console.error('SMOKE GAGAL:', e.message);
  process.exit(1);
});
