// Smoke: edit vendor lewat UI (ubah salah satu vendor yang TIDAK dipakai transaksi).
// Menjalankan: NODE_PATH=/tmp/node_modules node tests/smoke-vendors-edit.js
const { chromium } = require('playwright');

const BASE = 'http://localhost:3012';
const TARGET = 'Test Vendor 2026'; // vendor aman: po=0 imp=0 batch=0
const NAMA_BARU = 'Test Vendor Edited';

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 200)); });

  const rowNames = () =>
    page.locator('table tbody tr td:first-child').evaluateAll((tds) => tds.map((t) => t.textContent.trim()));

  await page.goto(BASE + '/vendors', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  console.log('sebelum:', JSON.stringify(await rowNames()));

  // Buka dialog ubah
  await page
    .locator('table tbody tr', { hasText: TARGET })
    .locator('button[aria-label^="Ubah"]')
    .click();
  await page.waitForTimeout(700);

  const judul = await page.locator('[role=dialog]').locator('h2, [id]').first().textContent().catch(() => '');
  console.log('judul dialog:', judul.trim());

  // Nilai awal harus terisi dari baris yang diklik (bukan form kosong).
  const namaAwal = await page.locator('#vendor-nama').inputValue();
  const tipeAwal = (await page.locator('[data-slot=select-trigger]').first().textContent()).trim();
  console.log('nama awal:', namaAwal, '| tipe awal:', tipeAwal);

  // Ubah nama + pindah tipe ke White Label
  await page.locator('#vendor-nama').fill(NAMA_BARU);
  await page.locator('[data-slot=select-trigger]').first().click();
  await page.waitForTimeout(700);
  await page.locator('[role=option]').filter({ hasText: 'White Label' }).first().click();
  await page.waitForTimeout(500);
  await page.locator('[role=dialog] button[type=submit]').click();
  await page.waitForTimeout(1800);

  console.log('dialog tertutup:', (await page.locator('[role=dialog]').count()) === 0);
  const names = await rowNames();
  console.log('sesudah:', JSON.stringify(names));
  console.log('NAMA BERUBAH:', names.includes(NAMA_BARU) && !names.includes(TARGET));

  const tipe = await page
    .locator('table tbody tr', { hasText: NAMA_BARU })
    .locator('td')
    .nth(3)
    .textContent()
    .catch(() => null);
  console.log('tipe setelah edit:', tipe && tipe.trim());

  // Kembalikan ke nama & tipe semula
  await page
    .locator('table tbody tr', { hasText: NAMA_BARU })
    .locator('button[aria-label^="Ubah"]')
    .click();
  await page.waitForTimeout(700);
  await page.locator('#vendor-nama').fill(TARGET);
  await page.locator('[data-slot=select-trigger]').first().click();
  await page.waitForTimeout(700);
  await page.locator('[role=option]').filter({ hasText: 'Bahan Baku' }).first().click();
  await page.waitForTimeout(500);
  await page.locator('[role=dialog] button[type=submit]').click();
  await page.waitForTimeout(1800);
  console.log('dikembalikan:', JSON.stringify(await rowNames()));

  console.log('error halaman:', errs.length ? errs : 'tidak ada');
  await browser.close();
})().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
