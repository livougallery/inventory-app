// Verifikasi UI tiket 07 (ubah & hapus PO).
//
// Tidak ada test frontend di repo ini, jadi browser adalah satu-satunya jaring
// pengaman. Yang diuji persis apa yang diminta tiket:
//   1. Tombol ubah/hapus HANYA muncul di PO pending.
//   2. Konfirmasi hapus menyebut nomor PO.
//   3. Penolakan server ditampilkan apa adanya (bukan pesan generik).
//   4. Form ubah terisi nilai PO yang ada.
//
// Status PO diatur lewat page.route pada /api/purchase-orders, jadi data live
// tidak disentuh.
const { chromium } = require('playwright');

const BASE = 'http://localhost:3100';

// Dua baris: satu pending, satu validated.
const ROWS = [
  { id: 1, no_po: 'PO-PENDING-01', status: 'pending', status_label: 'Pending', vendor_nama: 'PT Kain Maju', tgl_beli: '2026-09-01', total: 5000, creator_name: 'admin' },
  { id: 2, no_po: 'PO-VALIDATED-02', status: 'validated', status_label: 'Tervalidasi', vendor_nama: 'PT Kain Maju', tgl_beli: '2026-09-01', total: 8000, creator_name: 'admin' },
];

const DETAIL = {
  id: 1, no_po: 'PO-PENDING-01', status: 'pending', status_label: 'Pending',
  vendor_id: 1, currency_id: null, kurs_amount: 1,
  vendor_nama: 'PT Kain Maju', creator_name: 'admin', tgl_beli: '2026-09-01', total: 5000,
  items: [{ id: 11, qty: 5, harga_satuan: 1000, subtotal: 5000, raw_material_id: 1, variant_id: null, material_nama: 'Kain A', satuan: 'm' }],
};

const VENDORS = [{ id: 1, nama: 'PT Kain Maju', tipe: 'bahan_baku' }];
const MATERIALS = [{ id: 1, nama: 'Kain A', satuan: 'm', variants: [] }];
const CURRENCIES = [{ id: 1, kode: 'IDR', nama: 'Rupiah', simbol: 'Rp', is_active: 1 }];

const json = (route, body) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: body }) });

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  const newPage = async () => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      // Respons 409 di skenario 3 memang disengaja (server menolak hapus),
      // jadi log konsum untuknya bukan temuan.
      if (m.type() !== 'error') return;
      if (/409|Failed to load resource/i.test(m.text())) return;
      errors.push(`console: ${m.text()}`);
    });
    return page;
  };

  const stub = async (page) => {
    await page.route('**/api/purchase-orders', (r) => json(r, ROWS));
    await page.route('**/api/vendors?tipe=bahan_baku', (r) => json(r, VENDORS));
    await page.route('**/api/materials', (r) => json(r, MATERIALS));
    await page.route('**/api/currencies', (r) => json(r, CURRENCIES));
  };

  // ===== 1. Tombol aksi hanya di PO pending =====
  {
    const page = await newPage();
    await stub(page);
    await page.goto(`${BASE}/pembelian-material`, { waitUntil: 'networkidle' });
    await page.getByText('PO-PENDING-01').waitFor({ timeout: 10000 });

    const ubahPending = await page.getByLabel('Ubah PO-PENDING-01').count();
    const hapusPending = await page.getByLabel('Hapus PO-PENDING-01').count();
    const ubahValid = await page.getByLabel('Ubah PO-VALIDATED-02').count();
    const hapusValid = await page.getByLabel('Hapus PO-VALIDATED-02').count();

    console.log('=== 1. Tombol aksi per status ===');
    console.log(`  PO pending   : ubah=${ubahPending} hapus=${hapusPending}  (harap 1/1)`);
    console.log(`  PO validated : ubah=${ubahValid} hapus=${hapusValid}  (harap 0/0)`);
    const ok1 = ubahPending === 1 && hapusPending === 1 && ubahValid === 0 && hapusValid === 0;
    console.log(`  hasil: ${ok1 ? 'BAIK' : 'GAGAL'}`);
    await page.close();
    if (!ok1) { await browser.close(); process.exit(1); }
  }

  // ===== 2. Konfirmasi hapus menyebut nomor PO =====
  {
    const page = await newPage();
    await stub(page);
    await page.goto(`${BASE}/pembelian-material`, { waitUntil: 'networkidle' });
    await page.getByText('PO-PENDING-01').waitFor({ timeout: 10000 });

    await page.getByLabel('Hapus PO-PENDING-01').click();
    await page.getByText('Hapus purchase order?').waitFor({ timeout: 5000 });
    const text = await page.locator('[role="alertdialog"], [data-slot="alert-dialog-content"]').first().textContent();

    console.log('\n=== 2. Konfirmasi hapus ===');
    console.log(`  menyebut nomor PO : ${text.includes('PO-PENDING-01') ? 'YA' : 'TIDAK'}`);
    console.log(`  teks: ${text.replace(/\s+/g, ' ').trim().slice(0, 130)}`);
    const ok2 = text.includes('PO-PENDING-01');
    console.log(`  hasil: ${ok2 ? 'BAIK' : 'GAGAL'}`);
    await page.close();
    if (!ok2) { await browser.close(); process.exit(1); }
  }

  // ===== 3. Penolakan server ditampilkan apa adanya =====
  {
    const page = await newPage();
    await stub(page);
    // Server menolak penghapusan dengan pesan yang menjelaskan alasannya.
    await page.route('**/api/purchase-orders/1', (r) => {
      if (r.request().method() === 'DELETE') {
        return r.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'Purchase order tidak bisa dihapus lagi karena barangnya sudah tercatat di stok' }),
        });
      }
      return json(r, DETAIL);
    });

    await page.goto(`${BASE}/pembelian-material`, { waitUntil: 'networkidle' });
    await page.getByText('PO-PENDING-01').waitFor({ timeout: 10000 });

    await page.getByLabel('Hapus PO-PENDING-01').click();
    await page.getByText('Hapus purchase order?').waitFor({ timeout: 5000 });
    // Pakai data-slot, bukan getByRole: tombol aksi di baris tabel juga
    // mengandung kata "Hapus" di aria-label-nya, jadi pencarian berdasar nama
    // bisa cocok dengan elemen yang salah atau ragu di antara keduanya.
    await page.locator('[data-slot="alert-dialog-action"]').click();
    await page.waitForTimeout(1200);

    const body = await page.locator('body').textContent();
    const shown = body.includes('sudah tercatat di stok');

    console.log('\n=== 3. Pesan penolakan server ===');
    console.log(`  pesan server tampil : ${shown ? 'YA' : 'TIDAK'}`);
    const ok3 = shown;
    console.log(`  hasil: ${ok3 ? 'BAIK — pesan asli server, bukan generik' : 'GAGAL'}`);
    await page.close();
    if (!ok3) { await browser.close(); process.exit(1); }
  }

  // ===== 4. Form ubah terisi nilai PO yang ada =====
  {
    const page = await newPage();
    await stub(page);
    await page.route('**/api/purchase-orders/1', (r) => json(r, DETAIL));

    await page.goto(`${BASE}/pembelian-material`, { waitUntil: 'networkidle' });
    await page.getByText('PO-PENDING-01').waitFor({ timeout: 10000 });

    await page.getByLabel('Ubah PO-PENDING-01').click();
    await page.getByText('Ubah PO-PENDING-01').first().waitFor({ timeout: 8000 });

    await page.locator('#po-nomor').waitFor({ timeout: 8000 });
    const noPo = await page.locator('#po-nomor').inputValue();
    const vendor = (await page.locator('#po-vendor').textContent())?.trim() ?? '';
    await page.locator('[id^="qty-"]').first().waitFor({ timeout: 8000 });
    const qty = await page.locator('[id^="qty-"]').first().inputValue();
    const harga = await page.locator('[id^="harga-"]').first().inputValue();

    console.log('\n=== 4. Form ubah terisi ===');
    console.log(`  no_po : "${noPo}" (harap PO-PENDING-01)`);
    console.log(`  vendor: "${vendor}"`);
    console.log(`  qty   : "${qty}" (harap 5)`);
    console.log(`  harga : "${harga}" (harap 1000)`);
    const ok4 = noPo === 'PO-PENDING-01' && qty === '5' && harga === '1000' && vendor.includes('PT Kain Maju');
    console.log(`  hasil: ${ok4 ? 'BAIK' : 'GAGAL'}`);
    await page.close();
    if (!ok4) { await browser.close(); process.exit(1); }
  }

  // ===== 5. Klik Ubah tidak boleh ikut membuka dialog detail =====
  //
  // Baris tabel membuka dialog detail pada klik. Tombol Ubah/Hapus ada DI
  // DALAM baris itu, jadi tanpa stopPropagation satu klik memicu dua dialog
  // bertumpuk.
  {
    const page = await newPage();
    await stub(page);
    await page.route('**/api/purchase-orders/1', (r) => json(r, DETAIL));

    await page.goto(`${BASE}/pembelian-material`, { waitUntil: 'networkidle' });
    await page.getByText('PO-PENDING-01').waitFor({ timeout: 10000 });

    await page.getByLabel('Ubah PO-PENDING-01').click();
    await page.waitForTimeout(1000);

    const dialogs = await page.locator('[data-slot="dialog-content"]').count();
    const adaDetail = await page.getByText('Purchase order ini belum memiliki item').count();
    const adaEdit = await page.locator('#po-nomor').count();

    console.log('\n=== 5. Klik Ubah tidak membuka dialog ganda ===');
    console.log(`  jumlah dialog terbuka : ${dialogs} (harap 1)`);
    console.log(`  form ubah tampil      : ${adaEdit > 0 ? 'YA' : 'TIDAK'}`);
    console.log(`  dialog detail ikut    : ${adaDetail > 0 ? 'YA (BURUK)' : 'tidak (baik)'}`);
    const ok5 = dialogs === 1 && adaEdit > 0 && adaDetail === 0;
    console.log(`  hasil: ${ok5 ? 'BAIK' : 'GAGAL'}`);
    await page.close();
    if (!ok5) { await browser.close(); process.exit(1); }
  }

  await browser.close();
  console.log(`\n=== Error JavaScript: ${errors.length} ===`);
  errors.slice(0, 5).forEach((e) => console.log('  -', e));
  process.exit(errors.length === 0 ? 0 : 1);
})();
