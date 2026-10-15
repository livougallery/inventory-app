/**
 * Smoke test browser: tab Products / Colour di halaman Register Produk.
 *
 * Kenapa ini ada
 * --------------
 * `smoke-register-produk.mjs` merender halaman lewat `renderToStaticMarkup`.
 * Radix Tabs hanya me-render panel tab yang SEDANG AKTIF saat render di server
 * — jadi tab Colour tidak pernah muncul di markup itu, dan tabelnya tidak bisa
 * diperiksa di sana sama sekali.
 *
 * Yang diperiksa di sini justru hal yang cuma ada di browser:
 *   1. Dua tab benar-benar terlihat dan bisa DIKLIK (bukan cuma ada di DOM)
 *   2. Mengklik "Colour" benar-benar menampilkan tabel warna — nama dan kode
 *   3. Baris tabnya rata kiri dan tidak membentang di tengah layar
 *   4. Kotak cari + tombol Filter MILIK tab Products saja: saat tab Colour
 *      dibuka, keduanya tidak ikut terlihat
 *   5. Tabel warnanya memakai toolbar Master Data (cari / Kolom / Export) dan
 *      kotak carinya BENAR-BENAR menyaring baris, bukan sekadar terpampang
 *   6. Tombol "Tambah Warna" membuka popup yang isinya cuma nama + kode, dan
 *      warna yang disimpan benar-benar masuk ke tabel
 *   7. Tombol bukti di baris marketplace membuka popup foto TANPA ikut
 *      membuka detail produk (dua area klik yang bertumpuk di satu kartu)
 *
 * Nomor 4 itu yang paling mudah lolos: keduanya sempat ada di baris tab, di
 * LUAR panel, dan saat itu tab Colour akan menampilkan kotak "Cari produk,
 * kode, warna…" di atas tabel warna — kotak yang menjanjikan pencarian yang
 * tidak dilakukannya. Check ini menguncinya supaya tidak kembali ke sana.
 *
 * Nomor 7 juga mudah lolos: tombol bukti ada DI DALAM kartu yang seluruh
 * badannya bisa diklik untuk membuka detail. Tanpa `stopPropagation`, satu
 * tekan membuka dua dialog sekaligus — dan karena dialog buktinya dirender
 * sesudahnya, yang terlihat cuma yang paling atas. Bug-nya jadi tak kelihatan
 * di layar tapi tetap salah.
 *
 * Cara pakai (dari folder `frontend/`):
 *   node ../tests/smoke-tab-warna.mjs
 *
 * Butuh server di http://localhost:3000 (bundle `frontend/dist/` yang sudah
 * dibangun) dan Chrome. Tidak menyentuh database.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_HALAMAN = process.env.URL_HALAMAN || 'http://localhost:3000/modul/register-produk';
const CHROME =
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

if (!existsSync(CHROME)) {
  console.error('Chrome tidak ditemukan di ' + CHROME);
  console.error('Setel CHROME_PATH ke chrome.exe kalau lokasinya berbeda.');
  process.exit(1);
}

// Porta acak: Chrome sisa eksekusi sebelumnya memegang porta tetap, dan
// eksekusi berikutnya gagal start tanpa error yang berguna.
const PORTA = 9600 + Math.floor(Math.random() * 300);
const profil = mkdtempSync(join(tmpdir(), 'cdp-warna-'));

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-debugging-port=' + PORTA,
    `--user-data-dir=${profil}`,
    URL_HALAMAN,
  ],
  { stdio: 'ignore' }
);

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

async function cariEndpoint() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://127.0.0.1:' + PORTA + '/json/list');
      const tab = (await res.json()).find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (tab) return tab.webSocketDebuggerUrl;
    } catch {
      /* chrome belum siap */
    }
    await tidur(300);
  }
  throw new Error('Chrome tidak membuka endpoint debugging');
}

let gagal = 0;
const ok = (p) => console.log('  OK   ' + p);
const salah = (p, d) => {
  gagal++;
  console.log('  GAGAL ' + p + ' — ' + d);
};

const ws = new WebSocket(await cariEndpoint());
await new Promise((r, j) => {
  ws.addEventListener('open', r);
  ws.addEventListener('error', j);
});

let idPesan = 0;
const tunggu = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && tunggu.has(m.id)) {
    tunggu.get(m.id)(m);
    tunggu.delete(m.id);
  }
});

function kirim(method, params = {}) {
  const id = ++idPesan;
  return new Promise((resolve, reject) => {
    tunggu.set(id, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
}

/** Jalankan ekspresi di halaman, kembalikan nilainya (harus JSON-serializable). */
async function evaluasi(expr) {
  const r = await kirim('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || 'gagal evaluasi');
  }
  return r.result.value;
}

// Login dulu kalau perlu — halaman dilindungi.
//
// Dijalankan lewat fetch dari dalam halaman, bukan mengisi form login: yang
// diuji di sini tabnya, bukan login, dan mengisi form menambah satu langkah
// rapuh yang bisa gagal karena sebab yang tidak ada hubungannya.
await evaluasi(`
  (async () => {
    if (!location.pathname.startsWith('/login')) return 'sudah-masuk';
    const csrf = document.querySelector('input[name="_csrf"]')?.value ?? '';
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin', _csrf: csrf }),
    });
    return 'login ' + r.status;
  })()
`);

// Pastikan kita benar-benar di halaman Register Produk, bukan halaman login.
await kirim('Page.navigate', { url: URL_HALAMAN });
await tidur(2500);

const di = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
const semua = (sel) => `Array.from(document.querySelectorAll(${JSON.stringify(sel)}))`;

/**
 * Sumber baris ISI tabel, dipakai di dalam `evaluasi`.
 *
 * Bukan sekadar `tbody tr`: reui menampilkan pesan kosongnya
 * (`DataGridTableEmpty` di `data-grid-table.tsx`) sebagai `<tr>` SUNGGUHAN di
 * dalam `<tbody>` — satu `<td colSpan=3>` berisi "Belum ada warna…". Baris itu
 * ikut terhitung, dan akibatnya tabel yang tidak menyisakan satu baris pun
 * terbaca "1 baris". Check penyaringan jadi lolos justru saat pencariannya
 * TIDAK menemukan apa-apa — kebalikan dari yang dimaksud.
 *
 * Pembeda yang dipakai: baris isi selalu punya satu `<td>` per kolom (dua kolom
 * + satu sel isian), sedangkan baris kosong cuma punya SATU `<td>` yang
 * melebar (colSpan > 1). Sama untuk baris loader dan baris "+ New".
 */
const BARIS_ISI = `
  const barisIsi = (tabel) =>
    Array.from(tabel.querySelectorAll('tbody tr'))
      .filter(tr => {
        const td = tr.querySelectorAll('td');
        return !(td.length === 1 && (td[0].colSpan || 1) > 1);
      })
      .map(tr =>
        Array.from(tr.querySelectorAll('td'))
          .filter(td => td.getAttribute('data-slot') !== 'data-grid-table-fill-body-cell')
          .map(td => td.textContent.trim())
      );
`;

// ===== 1. Dua tab ada dan bisa diklik =====

console.log('\n== Tab Products / Colour ==');

const tab = await evaluasi(`
  (() => {
    const tabs = ${semua('[role="tab"]')}.map(t => ({
      label: t.textContent.trim(),
      terpilih: t.getAttribute('aria-selected') === 'true',
      // Bisa diklik = punya ukuran nyata di layar, bukan cuma ada di DOM.
      lebar: t.getBoundingClientRect().width,
      tinggi: t.getBoundingClientRect().height,
    }));
    return tabs;
  })()
`);

const label = tab.map((t) => t.label);
label.includes('Products') && label.includes('Colour')
  ? ok('tab "Products" dan "Colour" keduanya ada')
  : salah('dua tab', `yang ditemukan: ${JSON.stringify(label)}`);

tab.every((t) => t.lebar > 0 && t.tinggi > 0)
  ? ok('kedua tab punya ukuran nyata di layar (bisa diklik)')
  : salah('ukuran tab', JSON.stringify(tab));

const awalProduk = tab.find((t) => t.label === 'Products')?.terpilih;
awalProduk
  ? ok('tab "Products" terpilih saat halaman dibuka')
  : salah('tab awal', 'yang terpilih: ' + JSON.stringify(tab.find((t) => t.terpilih)?.label));

// ===== 3. Baris tab rata kiri, bukan menggantung di tengah =====

const posisi = await evaluasi(`
  (() => {
    const list = ${di('[role="tablist"]')};
    if (!list) return null;
    const r = list.getBoundingClientRect();
    const induk = list.parentElement.getBoundingClientRect();
    const pertama = ${di('[role="tab"]')}.getBoundingClientRect();
    return {
      listKiri: Math.round(r.left),
      indukKiri: Math.round(induk.left),
      tabPertamaKiri: Math.round(pertama.left),
    };
  })()
`);

posisi
  ? ok('baris tab terukur')
  : salah('ukur baris tab', 'tablist tidak ketemu');

if (posisi) {
  // Rata kiri: tab pertama menempel ke tepi kiri barisnya (toleransi 2px untuk
  // pembulatan), bukan didorong ke tengah oleh `justify-center`.
  Math.abs(posisi.tabPertamaKiri - posisi.indukKiri) <= 2
    ? ok('tab pertama rata kiri dengan isinya (tidak menggantung di tengah)')
    : salah(
        'perataan tab',
        `tab pertama di ${posisi.tabPertamaKiri}px, isinya mulai di ${posisi.indukKiri}px`
      );
}

// ===== 4. Kotak cari + Filter tidak ikut ke tab Colour =====

const cariSaatProduk = await evaluasi(`
  (() => {
    const input = document.querySelector('input[aria-label="Cari produk"]');
    if (!input) return { ada: false };
    const r = input.getBoundingClientRect();
    return { ada: true, terlihat: r.width > 0 && r.height > 0 };
  })()
`);

cariSaatProduk.ada && cariSaatProduk.terlihat
  ? ok('kotak cari terlihat di tab "Products"')
  : salah('cari di Products', JSON.stringify(cariSaatProduk));

/**
 * Klik satu tab dengan MOUSE SUNGGUHAN lewat CDP.
 *
 * Bukan `el.click()`: Radix Tabs memindahkan tab aktif dari handler
 * `mousedown`, sedangkan `el.click()` cuma mengirim event `click` — tidak ada
 * `mousedown` sama sekali, jadi tabnya tidak berpindah dan check-nya merah
 * padahal halamannya baik-baik saja.
 *
 * Yang dipakai karena itu `Input.dispatchMouseEvent` dengan pasangan
 * mousePressed + mouseReleased di tengah elemennya, persis seperti tangan
 * menekan. Itu juga yang membuat check ini benar-benar menguji jalur yang
 * dipakai pengguna.
 */
async function klikTab(labelTab) {
  const titik = await evaluasi(`
    (() => {
      const t = ${semua('[role="tab"]')}.find(x => x.textContent.trim() === ${JSON.stringify(labelTab)});
      if (!t) return null;
      const r = t.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()
  `);
  if (!titik) throw new Error('tab tidak ditemukan: ' + labelTab);

  for (const type of ['mousePressed', 'mouseReleased']) {
    await kirim('Input.dispatchMouseEvent', {
      type,
      x: titik.x,
      y: titik.y,
      button: 'left',
      clickCount: 1,
    });
  }
  await tidur(500);
}

// ===== 2. Klik "Colour" benar-benar membuka tabel warna =====

await klikTab('Colour');

const setelahKlik = await evaluasi(`
  (() => {
    const aktif = ${semua('[role="tab"]')}.find(t => t.getAttribute('aria-selected') === 'true');
    const tabel = document.querySelector('table');

    // Sel "kolom isian" milik reui Data Grid DIBuang dari pembacaan, dengan
    // penanda yang dipakai reui sendiri (data-grid-table-dnd-rows.tsx:512).
    //
    // Sel ini ada karena tabelnya memakai columnsResizable: setiap <th>/<td>
    // mendapat satu sel kosong aria-hidden untuk menyerap sisa lebar. Membaca
    // mentah berarti tiap baris punya satu sel kosong di ujungnya, dan
    // perbandingan jumlah kolom jadi meleset satu — bukan karena tabelnya
    // salah, tapi karena sel itu memang bukan kolom.
    const kolomIsi = (sel) =>
      Array.from(document.querySelectorAll(sel))
        .filter(el => el.getAttribute('data-slot') !== 'data-grid-table-fill-head-cell');
    ${BARIS_ISI}

    const kepala = tabel
      ? kolomIsi('th').map(th => th.textContent.trim())
      : [];
    const baris = tabel ? barisIsi(tabel) : [];

    // Toolbar Master Data di atas tabelnya. Kotak cari tabel TIDAK punya
    // aria-label (lihat TabelPratinjau), jadi dikenali dari placeholder-nya —
    // yang justru lebih kuat, karena sekaligus menguji teks yang dibaca
    // pengguna.
    const cariTabel = Array.from(document.querySelectorAll('input'))
      .find(i => (i.getAttribute('placeholder') || '').includes('Cari nama atau kode warna'));

    // Dialog yang sedang terbuka, dibedakan dari JUDULNYA — bukan dari
    // hitungan "ada berapa dialog". Menghitung berapa dialog terbuka akan
    // gagal karena alasan yang tidak berhubungan: Base UI menahan dialog yang
    // baru ditutup di DOM selama animasi keluarnya.
    const judul = Array.from(document.querySelectorAll('[data-slot="dialog-title"]'))
      .map(t => t.textContent.trim());

    const input = document.querySelector('input[aria-label="Cari produk"]');
    const tombolFilter = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.trim().startsWith('Filter'));
    return {
      aktif: aktif?.textContent.trim() ?? null,
      adaTabel: !!tabel,
      kepala,
      baris,
      cariTabelAda: !!cariTabel,
      tombolKolom: Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'Kolom'),
      tombolExport: Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'Export'),
      judulDialog: judul,
      // Terlihat = punya ukuran di layar. display:none dari panel yang tidak
      // aktif menghasilkan 0, jadi ini membedakan "ada di DOM" dari "kelihatan".
      cariTerlihat: !!input && input.getBoundingClientRect().height > 0,
      filterTerlihat: !!tombolFilter && tombolFilter.getBoundingClientRect().height > 0,
    };
  })()
`);

setelahKlik.aktif === 'Colour'
  ? ok('mengklik "Colour" memindahkan tab aktif ke Colour')
  : salah('tab aktif setelah klik', `yang aktif: ${setelahKlik.aktif}`);

setelahKlik.adaTabel
  ? ok('tabel warna benar-benar tampil setelah tab Colour diklik')
  : salah('tabel warna', 'tidak ada <table> di tab Colour');

setelahKlik.kepala.join('|') === 'Nama Warna|Kode Warna'
  ? ok('kolomnya persis dua: "Nama Warna" dan "Kode Warna"')
  : salah('kolom tabel', `yang ditemukan: ${JSON.stringify(setelahKlik.kepala)}`);

setelahKlik.baris.length > 0
  ? ok(`tabel berisi ${setelahKlik.baris.length} warna`)
  : salah('isi tabel', 'tabel kosong — warna dari katalog tidak sampai ke halaman');

// Setiap baris harus punya nama DAN kode, dan kodenya huruf besar semua
// (kode dipakai apa adanya di `kodeVarian`).
const barisRusak = setelahKlik.baris.filter(
  ([nama, kode]) => !nama || !kode || kode !== kode.toUpperCase()
);
barisRusak.length === 0 && setelahKlik.baris.length > 0
  ? ok('tiap baris punya nama dan kode (kode huruf besar semua)')
  : salah('isi baris', JSON.stringify(barisRusak));

// Tabelnya harus membawa perangkat yang sama dengan halaman Master Data.
// Bukan soal gaya: yang membuat dua halaman terasa sekeluarga adalah kotak
// cari, dropdown Kolom, dan Export di sekeliling tabelnya — dan check ini yang
// menahan tabel warna supaya tidak diam-diam kembali jadi tabel polos.
setelahKlik.cariTabelAda && setelahKlik.tombolKolom && setelahKlik.tombolExport
  ? ok('tabel warna memakai toolbar Master Data (cari, Kolom, Export)')
  : salah(
      'toolbar tabel warna',
      JSON.stringify({
        cari: setelahKlik.cariTabelAda,
        kolom: setelahKlik.tombolKolom,
        export: setelahKlik.tombolExport,
      })
    );

// ===== 5. Kotak cari tabel benar-benar menyaring, bukan sekadar terpampang =====

const disaring = await evaluasi(`
  (() => {
    const input = Array.from(document.querySelectorAll('input'))
      .find(i => (i.getAttribute('placeholder') || '').includes('Cari nama atau kode warna'));
    if (!input) return null;

    // Nilai diketik lewat setter native lalu event input, bukan dengan
    // menugaskan .value begitu saja: React memasang pelacaknya sendiri di
    // properti itu, dan penugasan langsung TIDAK memicu onChange — kotaknya
    // terisi di layar padahal React tidak pernah tahu apa-apa.
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    setter.call(input, 'hitam');
    input.dispatchEvent(new Event('input', { bubbles: true }));

    return true;
  })()
`);

if (!disaring) {
  salah('cari tabel', 'kotak cari tabel tidak ketemu, penyaringan tidak bisa diuji');
} else {
  await tidur(400);
  const sesudahCari = await evaluasi(`
    (() => {
      const tabel = document.querySelector('table');
      if (!tabel) return null;
      ${BARIS_ISI}
      return barisIsi(tabel);
    })()
  `);

  sesudahCari && sesudahCari.length > 0 && sesudahCari.length < setelahKlik.baris.length
    ? ok(`mencari "hitam" menyaring tabel (${setelahKlik.baris.length} -> ${sesudahCari.length} baris)`)
    : salah(
        'penyaringan tabel warna',
        `sebelum: ${setelahKlik.baris.length} baris, sesudah: ${sesudahCari ? sesudahCari.length : 'null'}`
      );

  sesudahCari && sesudahCari.length > 0 && sesudahCari.every(([, kode]) => kode === 'HTP')
    ? ok('baris yang tersisa memang yang cocok ("hitam" -> HTP)')
    : salah('isi hasil saring', JSON.stringify(sesudahCari));

  // Kotak cari dibersihkan lagi supaya sisa check membaca tabel yang utuh.
  await evaluasi(`
    (() => {
      const input = Array.from(document.querySelectorAll('input'))
        .find(i => (i.getAttribute('placeholder') || '').includes('Cari nama atau kode warna'));
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;
      setter.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `);
  await tidur(300);
}

!setelahKlik.cariTerlihat
  ? ok('kotak cari TIDAK ikut terlihat di tab Colour')
  : salah('cari di Colour', 'kotak cari masih terlihat di tab Colour');

!setelahKlik.filterTerlihat
  ? ok('tombol Filter TIDAK ikut terlihat di tab Colour')
  : salah('filter di Colour', 'tombol Filter masih terlihat di tab Colour');

// ===== 6. Tambah Warna: popup-nya cuma nama + kode, dan isinya masuk tabel =====

console.log('\n== Tambah Warna ==');

// Tombolnya di baris toolbar tabel, bukan di luar panel — jadi ia cuma ada
// saat tab Colour terbuka, dan itu memang tempat yang benar.
const tombolTambah = await evaluasi(`
  (() => {
    const b = Array.from(document.querySelectorAll('button'))
      .find(x => x.textContent.trim() === 'Tambah Warna');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), lebar: r.width };
  })()
`);

tombolTambah && tombolTambah.lebar > 0
  ? ok('tombol "Tambah Warna" ada di toolbar tab Colour')
  : salah('tombol tambah warna', JSON.stringify(tombolTambah));

async function klikDi(titik) {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await kirim('Input.dispatchMouseEvent', {
      type,
      x: titik.x,
      y: titik.y,
      button: 'left',
      clickCount: 1,
    });
  }
  await tidur(400);
}

async function tutupDialog() {
  // Tombol tutupnya dipilih dari dalam dialog, bukan `document` — kalau
  // tidak, yang terambil bisa tombol tutup dialog LAIN yang masih tertahan di
  // DOM selama animasi keluarnya.
  const titik = await evaluasi(`
    (() => {
      const dialog = document.querySelector('[data-slot="dialog-content"]');
      const b = dialog && dialog.querySelector('[data-slot="dialog-close"]');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()
  `);
  if (titik) await klikDi(titik);
}

if (tombolTambah) {
  await klikDi(tombolTambah);

  const popup = await evaluasi(`
    (() => {
      const dialog = document.querySelector('[data-slot="dialog-content"]');
      if (!dialog) return null;
      const input = Array.from(dialog.querySelectorAll('input'));
      const label = Array.from(dialog.querySelectorAll('label')).map(l => l.textContent.trim());
      const judul = dialog.querySelector('[data-slot="dialog-title"]')?.textContent.trim() ?? null;
      return {
        judul,
        jumlahInput: input.length,
        idInput: input.map(i => i.id),
        label,
      };
    })()
  `);

  popup && popup.judul === 'Tambah Warna'
    ? ok('menekan "Tambah Warna" membuka popup berjudul "Tambah Warna"')
    : salah('popup tambah warna', JSON.stringify(popup));

  // Dua field, persis. Bukan "minimal dua": field ketiga yang menyelinap masuk
  // (mis. keterangan, contoh warna) berarti menambah kolom yang tidak dibaca
  // siapa pun — dan check ini yang menahannya.
  popup && popup.jumlahInput === 2
    ? ok('popup-nya cuma dua field (nama dan kode warna)')
    : salah('jumlah field popup', `yang ditemukan: ${popup ? popup.jumlahInput : 'popup tidak ada'}`);

  popup && popup.idInput.join('|') === 'warna-nama|warna-kode'
    ? ok('kedua field-nya persis "Nama Warna" dan "Kode Warna"')
    : salah('field popup', JSON.stringify(popup?.idInput));

  if (popup && popup.jumlahInput === 2) {
    // Isi formnya. Kode sengaja diketik huruf KECIL: yang tersimpan harus
    // huruf besar, karena kode dipakai apa adanya saat mencocokkan varian.
    await evaluasi(`
      (() => {
        const dialog = document.querySelector('[data-slot="dialog-content"]');
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        ).set;
        const isi = (id, nilai) => {
          const el = dialog.querySelector('#' + id);
          setter.call(el, nilai);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        isi('warna-nama', 'Maroon');
        isi('warna-kode', 'mrn');
      })()
    `);
    await tidur(200);

    const setelahIsi = await evaluasi(`
      (() => {
        const dialog = document.querySelector('[data-slot="dialog-content"]');
        return dialog.querySelector('#warna-kode')?.value ?? null;
      })()
    `);

    setelahIsi === 'MRN'
      ? ok('kode yang diketik huruf kecil langsung jadi huruf besar di kotaknya')
      : salah('huruf besar saat diketik', `isinya: ${JSON.stringify(setelahIsi)}`);

    const simpan = await evaluasi(`
      (() => {
        const dialog = document.querySelector('[data-slot="dialog-content"]');
        const b = Array.from(dialog.querySelectorAll('button'))
          .find(x => x.textContent.trim() === 'Simpan');
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      })()
    `);
    if (simpan) await klikDi(simpan);
    await tidur(400);

    const sesudahSimpan = await evaluasi(`
      (() => {
        const tabel = document.querySelector('table');
        ${BARIS_ISI}
        const baris = tabel ? barisIsi(tabel) : [];
        const judul = Array.from(document.querySelectorAll('[data-slot="dialog-title"]'))
          .map(t => t.textContent.trim());
        return { baris, judul };
      })()
    `);

    const warnaBaru = sesudahSimpan.baris.find(([, kode]) => kode === 'MRN');
    warnaBaru
      ? ok('warna baru benar-benar masuk ke tabel (kode MRN)')
      : salah('warna baru di tabel', JSON.stringify(sesudahSimpan.baris));

    warnaBaru && warnaBaru[0] === 'Maroon'
      ? ok('nama warna baru tersimpan apa adanya ("Maroon")')
      : salah('nama warna baru', JSON.stringify(warnaBaru));

    sesudahSimpan.baris.length === setelahKlik.baris.length + 1
      ? ok(`jumlah warna bertambah satu (${setelahKlik.baris.length} -> ${sesudahSimpan.baris.length})`)
      : salah(
          'jumlah warna',
          `sebelum ${setelahKlik.baris.length}, sesudah ${sesudahSimpan.baris.length}`
        );

    // Popup-nya harus menutup setelah Simpan. Kalau tidak, ia menutupi tabel
    // yang baru saja diisi — dan yang tampak seperti "warnanya tidak masuk"
    // sebenarnya cuma popup yang tidak pergi.
    !sesudahSimpan.judul.includes('Tambah Warna')
      ? ok('popup "Tambah Warna" menutup sendiri setelah Simpan')
      : salah('popup setelah simpan', `judul yang masih terbuka: ${JSON.stringify(sesudahSimpan.judul)}`);

    // Kode kembar harus ditolak — HTP sudah dipakai "Hitam" dari katalog.
    // Tanpa ini, satu kode bisa dipakai dua warna dan `kodeVarian` kehilangan
    // artinya sebagai pencocok.
    const tombolTambah2 = await evaluasi(`
      (() => {
        const b = Array.from(document.querySelectorAll('button'))
          .find(x => x.textContent.trim() === 'Tambah Warna');
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      })()
    `);
    if (tombolTambah2) await klikDi(tombolTambah2);

    await evaluasi(`
      (() => {
        const dialog = document.querySelector('[data-slot="dialog-content"]');
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        ).set;
        const isi = (id, nilai) => {
          const el = dialog.querySelector('#' + id);
          setter.call(el, nilai);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        isi('warna-nama', 'Hitam Pekat');
        isi('warna-kode', 'HTP');
      })()
    `);
    await tidur(200);

    const simpan2 = await evaluasi(`
      (() => {
        const dialog = document.querySelector('[data-slot="dialog-content"]');
        const b = Array.from(dialog.querySelectorAll('button'))
          .find(x => x.textContent.trim() === 'Simpan');
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      })()
    `);
    if (simpan2) await klikDi(simpan2);
    await tidur(300);

    const setelahBentrok = await evaluasi(`
      (() => {
        const dialog = document.querySelector('[data-slot="dialog-content"]');
        const tabel = document.querySelector('table');
        ${BARIS_ISI}
        return {
          galat: dialog ? (dialog.querySelector('[role="alert"]')?.textContent.trim() ?? null) : null,
          popupMasihTerbuka: !!dialog,
          jumlahBaris: tabel ? barisIsi(tabel).length : 0,
        };
      })()
    `);

    setelahBentrok.galat && setelahBentrok.galat.includes('HTP')
      ? ok('kode kembar ditolak dengan pesan yang menyebut kodenya')
      : salah('kode kembar', JSON.stringify(setelahBentrok));

    setelahBentrok.popupMasihTerbuka
      ? ok('popup tetap terbuka saat kodenya bentrok (isian tidak hilang)')
      : salah('popup saat bentrok', 'popup menutup padahal kodenya ditolak');

    await tutupDialog();
    await tidur(300);
  }
}

// ===== Kembali ke Products harus memulihkan kotak cari =====

await klikTab('Products');

const kembali = await evaluasi(`
  (() => {
    const input = document.querySelector('input[aria-label="Cari produk"]');
    return {
      cariTerlihat: !!input && input.getBoundingClientRect().height > 0,
      adaTabel: !!document.querySelector('table'),
      adaKartu: document.querySelectorAll('[data-slot="card"]').length,
    };
  })()
`);

kembali.cariTerlihat
  ? ok('kembali ke Products: kotak cari muncul lagi')
  : salah('cari setelah kembali', 'kotak cari tidak kembali terlihat');

kembali.adaKartu > 0
  ? ok(`kembali ke Products: kartu produk tampil lagi (${kembali.adaKartu} kartu)`)
  : salah('kartu setelah kembali', 'tidak ada kartu produk setelah kembali ke tab Products');

// ===== 7. Tombol bukti marketplace: buka popup foto, TANPA ikut buka detail =====

console.log('\n== Tombol bukti marketplace ==');

// Kartu pertama yang punya tombol bukti. Yang dicari tombol ber-aria-label
// "Lihat foto bukti …" — label itulah yang dibacakan pembaca layar, jadi
// sekaligus menguji namanya ada.
//
// `scrollIntoView` DULU, baru koordinatnya diukur. Baris marketplace ada di
// dasar kartu, dan di jendela headless (749px) tombol itu jatuh di bawah garis
// layar — `Input.dispatchMouseEvent` mengirim koordinat viewport, jadi menekan
// y=756 pada jendela setinggi 749 menekan ruang kosong di luar halaman, bukan
// tombolnya. Gejalanya menyesatkan: tombolnya jelas ada dan terukur, tapi
// popup-nya tidak pernah terbuka.
const tombolBukti = await evaluasi(`
  (() => {
    const b = Array.from(document.querySelectorAll('button'))
      .find(x => (x.getAttribute('aria-label') || '').startsWith('Lihat foto bukti'));
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return {
      label: b.getAttribute('aria-label'),
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
      lebar: r.width,
      // Terlihat di layar = seluruh kotaknya ada di dalam viewport. Diperiksa
      // supaya kalau suatu saat tombolnya kembali jatuh di luar layar, yang
      // gagal adalah check ini — bukan check popup-nya, yang pesannya
      // menyesatkan.
      terlihat: r.top >= 0 && r.bottom <= window.innerHeight,
    };
  })()
`);

tombolBukti && tombolBukti.lebar > 0 && tombolBukti.terlihat
  ? ok(`tombol bukti ada, bisa diklik, dan ada di layar (${tombolBukti.label})`)
  : salah('tombol bukti', JSON.stringify(tombolBukti));

if (tombolBukti) {
  await tidur(300); // beri waktu scroll-nya selesai sebelum menekan
  await klikDi(tombolBukti);

  const sesudahBukti = await evaluasi(`
    (() => {
      const judul = Array.from(document.querySelectorAll('[data-slot="dialog-title"]'))
        .map(t => t.textContent.trim());
      const dialog = document.querySelector('[data-slot="dialog-content"]');
      return {
        judul,
        // Popup bukti isinya GAMBAR (atau kotak kosong yang menjelaskan diri).
        // Yang diperiksa ada-tidaknya elemen gambar dan kotak kosongnya —
        // bukan bahwa gambarnya berhasil dimuat, karena memang belum ada
        // sumber datanya (lihat catatan di PopupBuktiPasar.tsx).
        adaGambar: !!(dialog && dialog.querySelector('img')),
        teksKosong: dialog ? dialog.textContent.includes('Belum ada foto bukti') : false,
        // Deskripsi dialog memuat nama produk dan platformnya.
        deskripsi: dialog?.querySelector('[data-slot="dialog-description"]')?.textContent.trim() ?? null,
      };
    })()
  `);

  const judulBukti = sesudahBukti.judul.find((t) => t.startsWith('Bukti Pendaftaran'));
  judulBukti
    ? ok(`popup bukti terbuka: "${judulBukti}"`)
    : salah('popup bukti', `judul dialog yang terbuka: ${JSON.stringify(sesudahBukti.judul)}`);

  // Ini inti nomor 7: kartu produk SELURUHNYA area klik untuk membuka detail,
  // dan tombol bukti ada di dalamnya. Tanpa `stopPropagation`, satu tekan
  // membuka dua dialog sekaligus.
  //
  // Check-nya BERGANTUNG pada popup buktinya benar-benar terbuka. Tanpa itu ia
  // lolos sendiri saat tidak ada dialog apa pun yang muncul — dan kegagalan
  // yang sebenarnya (popup bukti tidak terbuka) justru terbaca sebagai
  // "perambatan klik aman".
  judulBukti && sesudahBukti.judul.length === 1
    ? ok('hanya popup bukti yang terbuka (klik tidak merambat ke kartu detail)')
    : salah(
        'perambatan klik',
        `harusnya tepat satu dialog (bukti); yang terbuka: ${JSON.stringify(sesudahBukti.judul)}`
      );

  // Belum ada tabel untuk foto bukti — jadi keadaannya harus ditampilkan
  // jujur sebagai kosong, bukan gambar rusak atau popup yang diam-diam kosong.
  !sesudahBukti.adaGambar && sesudahBukti.teksKosong
    ? ok('popup-nya menyatakan belum ada foto bukti (bukan kotak kosong tanpa keterangan)')
    : salah('isi popup bukti', JSON.stringify(sesudahBukti));

  // Platform dan produk harus terbaca dari popupnya — platform di JUDUL,
  // produk di DESKRIPSI. Keduanya diperiksa terpisah karena di situlah
  // masing-masing berada: judulnya "Bukti Pendaftaran — Shopee", deskripsinya
  // "Rowe Tee · Terdaftar". Satu popup yang cuma menulis "Bukti Pendaftaran"
  // tidak menjawab pertanyaan "buktinya untuk platform mana".
  judulBukti && judulBukti.includes('Shopee')
    ? ok('judul popup menyebut platformnya (Shopee)')
    : salah('platform di judul popup', JSON.stringify(judulBukti));

  sesudahBukti.deskripsi && sesudahBukti.deskripsi.includes('Rowe Tee')
    ? ok(`deskripsi popup menyebut produknya ("${sesudahBukti.deskripsi}")`)
    : salah('deskripsi popup bukti', JSON.stringify(sesudahBukti.deskripsi));

  await tutupDialog();
  await tidur(300);

  const sesudahTutup = await evaluasi(`
    Array.from(document.querySelectorAll('[data-slot="dialog-title"]')).map(t => t.textContent.trim())
  `);
  sesudahTutup.length === 0
    ? ok('popup bukti bisa ditutup')
    : salah('tutup popup bukti', `judul yang masih ada: ${JSON.stringify(sesudahTutup)}`);
}

// Hasilnya dicetak DULU, baru profilnya dibersihkan.
//
// Urutan ini bukan selera: Chrome yang baru di-kill masih memegang berkas di
// profilnya selama beberapa ratus milidetik, dan `rmSync` yang gagal melempar
// error. Kalau pembersihan dijalankan lebih dulu, error itu membatalkan
// pencetakan hasil — dan seluruh check yang sebenarnya sudah selesai jadi
// hilang, diganti satu pesan EPERM yang tidak ada hubungannya dengan yang
// diuji.
console.log('');
if (gagal === 0) {
  console.log(
    'LULUS — tab Products/Colour, tabel warna bergaya Master Data, popup Tambah Warna, dan popup bukti marketplace.'
  );
} else {
  console.log(`GAGAL — ${gagal} check tidak lolos.`);
}

ws.close();
chrome.kill();

// Pembersihan yang tidak boleh menggagalkan test: profil sementara di temp
// boleh tertinggal (sistem yang membersihkannya nanti), tapi hasil test tidak
// boleh hilang karena itu.
try {
  rmSync(profil, { recursive: true, force: true });
} catch {
  /* Chrome masih memegang berkasnya; biarkan, itu bukan kegagalan test */
}

process.exit(gagal === 0 ? 0 : 1);
