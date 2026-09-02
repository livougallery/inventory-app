// Verifikasi: setelah Promise.all diganti allSettled, form Buat PO tetap
// memuat vendor + material, dan tetap bisa menyimpan.
//
// Dua skenario:
//   A. Semua endpoint sehat → form terisi, PO tersimpan.
//   B. /api/currencies sengaja diputus (500) → form TETAP terisi dan TETAP bisa
//      disimpan tanpa currency. Inilah inti perubahan allSettled: dengan
//      Promise.all, skenario B akan menampilkan layar error.
//
// Tidak ada test frontend di proyek ini, jadi browser adalah satu-satunya
// jaring pengaman untuk kelas bug ini.
const { chromium } = require('playwright');

const BASE = 'http://localhost:3100';

// Popup base-ui di-portal ke body, jadi selektor global cocok dengan opsi
// milik SEMUA dropdown sekaligus — termasuk yang sudah ditutup.
const popupItems = (page) =>
  page.locator('[data-slot="select-content"]:visible [data-slot="select-item"]');

// Komponen memakai `id`, bukan data-testid (lihat CreatePoDialog.tsx).
const openAndRead = async (page, testId) => {
  await page.locator(`#${testId}`).click();
  await popupItems(page).first().waitFor({ state: 'visible', timeout: 5000 });
  const items = await popupItems(page).allTextContents();
  await page.keyboard.press('Escape');
  return items.map((s) => s.trim()).filter(Boolean);
};

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  const run = async (label, breakCurrencies) => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`[${label}] ${e.message}`));
    page.on('console', (m) => {
      // Respons 500 di skenario B memang disengaja (endpoint currency diputus),
      // jadi log konsum untuknya bukan temuan.
      if (m.type() !== 'error') return;
      if (breakCurrencies && /500|Failed to load resource/i.test(m.text())) return;
      errors.push(`[${label}] console: ${m.text()}`);
    });

    if (breakCurrencies) {
      await page.route('**/api/currencies', (route) =>
        route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false,"error":"down"}' })
      );
    }

    await page.goto(`${BASE}/pembelian-material`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Buat PO/i }).click();
    await page.getByText('Buat Purchase Order').waitFor({ timeout: 10000 });

    // Tunggu spinner selesai. Di skenario B tombol Simpan bisa saja tidak
    // pernah muncul (itulah gejala yang diuji), jadi cukup tunggu form tampil
    // ATAU layar error — mana yang lebih dulu.
    await Promise.race([
      page.locator('#po-vendor').waitFor({ timeout: 10000 }),
      page.getByText('Gagal memuat data form').waitFor({ timeout: 10000 }),
    ]).catch(() => {});

    const vendorTrigger = page.locator('#po-vendor');
    const vendorText = (await vendorTrigger.textContent())?.trim() ?? '';
    const materialTrigger = page.locator('[id^="material-"]').first();
    const materialText = (await materialTrigger.textContent())?.trim() ?? '';

    const errVisible = await page.locator('text=/Gagal memuat data form/i').count();

    console.log(`\n### ${label}`);
    console.log(`  layar error muncul : ${errVisible > 0 ? 'YA (BURUK)' : 'tidak (baik)'}`);
    console.log(`  trigger vendor     : "${vendorText}"`);
    console.log(`  trigger material   : "${materialText}"`);

    // Baca isi dropdown vendor: bukti bahwa data benar-benar termuat.
    const vendors = await openAndRead(page, 'po-vendor');
    console.log(`  opsi vendor (${vendors.length}): ${vendors.join(' | ')}`);

    await page.close();
    return { vendors, errVisible };
  };

  const a = await run('A. semua endpoint sehat', false);
  const b = await run('B. /api/currencies diputus (500)', true);

  await browser.close();

  console.log('\n=== Kesimpulan ===');
  const okA = a.vendors.length > 0 && a.errVisible === 0;
  const okB = b.vendors.length > 0 && b.errVisible === 0;
  console.log(`  A sehat          : ${okA ? 'BAIK' : 'GAGAL'} (vendor ${a.vendors.length})`);
  console.log(`  B currency mati  : ${okB ? 'BAIK — form tetap bisa dipakai' : 'GAGAL — form lumpuh'}`);
  console.log(`  error JS         : ${errors.length}`);
  errors.slice(0, 5).forEach((e) => console.log('   -', e));
  process.exit(okA && okB && errors.length === 0 ? 0 : 1);
})();
