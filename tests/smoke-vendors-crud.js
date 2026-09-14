// Smoke test lanjutan: empty state filter Produksi + create/delete lewat UI.
// Menjalankan: NODE_PATH=/tmp/node_modules node tests/smoke-vendors-crud.js
const { chromium } = require('playwright');

const BASE = 'http://localhost:3012';
const NAMA = 'ZZ UI Smoke';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 200)); });

  // window.confirm/alert: confirm diterima (hapus), alert dicatat isinya.
  const alerts = [];
  page.on('dialog', async (d) => {
    if (d.type() === 'confirm') { alerts.push('confirm: ' + d.message().slice(0, 120)); await d.accept(); }
    else { alerts.push(d.type() + ': ' + d.message().slice(0, 200)); await d.dismiss(); }
  });

  const step = (n) => console.log('\n=== ' + n + ' ===');
  const rowNames = () =>
    page.locator('table tbody tr td:first-child').evaluateAll((tds) => tds.map((t) => t.textContent.trim()));

  await page.goto(BASE + '/vendors', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // ---- Empty state: filter Produksi (live DB: 0 vendor produksi) ----
  step('1. Empty state filter Produksi');
  await page.locator('button', { hasText: 'Filter' }).first().click();
  await page.waitForTimeout(500);
  await page.locator('[role=option], [role=menuitemcheckbox]').filter({ hasText: 'Produksi' }).first().click();
  await page.waitForTimeout(700);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const emptyText = (await page.locator('table tbody tr').first().textContent().catch(() => '')).trim();
  console.log('baris:', await page.locator('table tbody tr').count());
  console.log('teks empty state:', emptyText.slice(0, 80));

  // Bersihkan filter
  await page.locator('button', { hasText: 'Filter' }).first().click();
  await page.waitForTimeout(500);
  const clear = page.locator('[role=option], [role=menuitem]').filter({ hasText: 'Bersihkan semua filter' }).first();
  if (await clear.count()) { await clear.click(); await page.waitForTimeout(400); }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  console.log('setelah filter dibersihkan:', (await rowNames()).length, 'baris');

  // ---- Create lewat UI ----
  step('2. Create lewat UI');
  await page.locator('button', { hasText: 'Tambah Vendor' }).first().click();
  await page.waitForTimeout(600);
  await page.locator('#vendor-nama').fill(NAMA);
  await page.locator('#vendor-alamat').fill('Alamat UI');
  await page.locator('#vendor-kontak').fill('0800');
  // Tipe: pilih "Produksi" supaya beda dari default.
  await page.locator('[data-slot=select-trigger]').first().click();
  await page.waitForTimeout(600);
  await page.locator('[role=option]').filter({ hasText: 'Produksi' }).first().click();
  await page.waitForTimeout(500);
  await page.locator('[role=dialog] button[type=submit]').click();
  await page.waitForTimeout(1500);

  const namesAfterCreate = await rowNames();
  console.log('nama setelah create:', JSON.stringify(namesAfterCreate));
  console.log('ADA "' + NAMA + '":', namesAfterCreate.includes(NAMA));

  // Tipe harus tersimpan sebagai "Produksi", bukan default bahan_baku.
  const rowTipe = await page
    .locator('table tbody tr', { hasText: NAMA })
    .locator('td')
    .nth(3)
    .textContent()
    .catch(() => null);
  console.log('tipe tersimpan:', rowTipe && rowTipe.trim());

  // ---- Delete lewat UI ----
  step('3. Delete lewat UI');
  await page
    .locator('table tbody tr', { hasText: NAMA })
    .locator('button[aria-label^="Hapus"]')
    .click();
  await page.waitForTimeout(1500);
  const namesAfterDelete = await rowNames();
  console.log('nama setelah delete:', JSON.stringify(namesAfterDelete));
  console.log('SUDAH HILANG:', !namesAfterDelete.includes(NAMA));

  step('HASIL');
  console.log('dialog:', alerts.length ? alerts : 'tidak ada');
  console.log('error halaman:', errs.length ? errs : 'tidak ada');

  await browser.close();
})().catch((e) => {
  console.error('SMOKE GAGAL:', e.message);
  process.exit(1);
});
