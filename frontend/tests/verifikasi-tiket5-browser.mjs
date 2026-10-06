// Verifikasi browser untuk Tiket 5 — tiga tahap akhir (invoice-logistic,
// invoice-product, upload) di berkas presentasi yang SUDAH DIBANGUN.
//
// Kenapa browser, bukan cuma smoke test SSR: smoke test merender `IsiPopup`
// langsung dan tidak pernah menyentuh papan, dialog Base UI, Select portal,
// atau input berkas. Yang paling mungkin rusak tanpa terlihat dari SSR justru
// jalur-jalur itu — klik kartu, pindah papan, pilih jalur lewat Select, unggah
// berkas. Semua diuji di sini dengan event mouse/klik sungguhan lewat CDP.
//
// Jalankan dari frontend/:  node tests/verifikasi-tiket5-browser.mjs
// Berkas yang diperiksa bisa dialihkan lewat env PRESENTASI_FILE (dipakai
// runner mutasi supaya berkas owner tidak pernah tersentuh build yang rusak).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BERKAS = process.env.PRESENTASI_FILE || 'C:\\Users\\livou\\inventory-demo\\Inventory-APP-Presentasi.html';
const SS_DIR = 'C:\\Users\\livou\\inventory-app\\.scratch\\tiket5-verifikasi';
// Screenshot hanya disimpan pada jalan normal (berkas owner). Saat runner
// mutasi mengarahkan PRESENTASI_FILE ke build yang sengaja dirusak, gambar
// keadaan rusak TIDAK boleh menimpa screenshot bukti — jadi dilewati.
const SIMPAN_SS = !process.env.PRESENTASI_FILE;
const PROFIL = path.join(process.env.TEMP || '.', 'verifikasi-tiket5-profil');
let PORT = 0;

let lulus = 0, gagal = 0;
const daftarGagal = [];
function cek(nama, kondisi, tambahan) {
  if (kondisi) { lulus++; console.log('  LULUS  ' + nama); }
  else { gagal++; daftarGagal.push(nama); console.log('  GAGAL  ' + nama + (tambahan ? '  -> ' + tambahan : '')); }
}
function tunggu(ms) { return new Promise(r => setTimeout(r, ms)); }

async function jsonCdp(port, p, method) {
  const res = await fetch(`http://127.0.0.1:${port}${p}`, { method: method || 'GET' });
  return res.json();
}

(async function () {
  if (!fs.existsSync(CHROME)) { console.log('Chrome tidak ada — dilewati.'); process.exit(2); }
  if (!fs.existsSync(BERKAS)) { console.log('Berkas presentasi tidak ada: ' + BERKAS); process.exit(1); }

  // Port acak: port tetap berbahaya kalau Chrome run sebelumnya belum mati —
  // skrip akan bicara ke browser LAMA dan mengukur halaman yang salah.
  PORT = 9300 + (process.pid % 600);
  const userDir = PROFIL + '-' + Date.now();

  const chrome = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + userDir,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--allow-file-access-from-files',
    '--window-size=1600,1000',
    'about:blank',
  ], { stdio: 'ignore' });

  let ws;
  let kirimTutup = async () => {};
  // Ditentukan di try/catch, DIEKSEKUSI setelah finally (pembersihan Chrome).
  // Bukan `process.exitCode`: dengan itu, satu handle yang menggantung membuat
  // proses tidak pernah keluar — runner mutasi lalu menunggu sampai timeout
  // dan membaca output parsial, yang bisa terlihat "hijau" padahal suite mati.
  let kodeKeluar = 1;

  // Jaring pengaman terhadap hang: kalau Chrome berhenti menjawab di tengah
  // jalan, `kirim()` menunggu balasan yang tidak akan datang dan proses
  // menggantung tanpa exit code. Run pertama tiket ini persis begitu. Watchdog
  // mengubah hang senyap jadi kegagalan keras (exit 1) yang terlihat di output.
  const watchdog = setTimeout(() => {
    console.log('\n  ERROR: watchdog — proses menggantung, keluar paksa (exit 1).');
    try { chrome.kill(); } catch (e) {}
    process.exit(1);
  }, 200000);

  try {
    let version = null;
    for (let i = 0; i < 60; i++) {
      try { version = await jsonCdp(PORT, '/json/version'); break; } catch (e) { await tunggu(250); }
    }
    if (!version || !version.webSocketDebuggerUrl) throw new Error('DevTools tidak pernah siap');
    if (chrome.exitCode !== null) throw new Error('Chrome mati sebelum DevTools siap');
    if (String(version.Browser || '').indexOf('Chrome') < 0) throw new Error('Bukan Chrome: ' + version.Browser);

    const target = await jsonCdp(PORT, '/json/new?' + encodeURI('about:blank'), 'PUT');
    const { WebSocket } = await import('ws').catch(() => ({ WebSocket: globalThis.WebSocket }));
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 0;
    const tungguBalasan = new Map();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && tungguBalasan.has(msg.id)) { tungguBalasan.get(msg.id)(msg); tungguBalasan.delete(msg.id); }
    };
    const kirim = (method, params) => new Promise((res) => {
      const n = ++id; tungguBalasan.set(n, res);
      ws.send(JSON.stringify({ id: n, method, params: params || {} }));
    });
    const nilai = async (expr) => {
      const r = await kirim('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.result && r.result.exceptionDetails) return 'EXC:' + JSON.stringify(r.result.exceptionDetails).slice(0, 200);
      return r.result && r.result.result ? r.result.result.value : undefined;
    };

    // `Browser.close` TIDAK membalas sebelum Chrome menutup koneksi: menunggu
    // balasannya lewat `kirim()` menggantung selamanya, dan karena ini dipanggil
    // dari `finally`, seluruh proses ikut menggantung — ringkasan tercetak tapi
    // exit code tidak pernah keluar (itu yang terjadi pada run pertama tiket
    // ini). Jadi: kirim tanpa menunggu balasan. `.catch` mencegah promise yang
    // gagal terkirim menjadi unhandled rejection (Node 24 mematikannya).
    kirimTutup = async () => {
      try { kirim('Browser.close').catch(() => {}); } catch (e) {}
      await tunggu(800);
    };

    await kirim('Page.enable');
    await kirim('Runtime.enable');
    await kirim('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

    // Klik lewat CDP (mousePressed/mouseReleased), bukan element.click():
    // komponen Base UI bereaksi pada pointer event, dan klik sintetis lewat
    // .click() tidak menghasilkan urutan pointerdown/mousedown yang sama.
    async function klik(selectorJs) {
      const kotak = await nilai(`
        (function(){
          var el = ${selectorJs};
          if (!el) return 'null';
          el.scrollIntoView({block:'center'});
          var r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return 'ZERO';
          return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2,
            teks: (el.innerText||el.getAttribute('aria-label')||'').replace(/\\s+/g,' ').trim().slice(0,80)});
        })()
      `);
      if (kotak === 'null') return { ok: false, alasan: 'elemen tidak ada' };
      if (kotak === 'ZERO') return { ok: false, alasan: 'elemen berukuran nol' };
      if (typeof kotak !== 'string' || kotak.startsWith('EXC')) return { ok: false, alasan: 'eval: ' + kotak };
      const k = JSON.parse(kotak);
      const dasar = { x: Math.round(k.x), y: Math.round(k.y), button: 'left', clickCount: 1 };
      await kirim('Input.dispatchMouseEvent', { type: 'mousePressed', ...dasar });
      await kirim('Input.dispatchMouseEvent', { type: 'mouseReleased', ...dasar });
      return { ok: true, teks: k.teks };
    }

    const teksDialog = () => nilai(
      `(function(){var d=document.querySelector('[data-slot="dialog-content"]');return d?(d.innerText||'').replace(/\\s+/g,' ').trim():''})()`
    );

    async function simpanSs(nama) {
      if (!SIMPAN_SS) { console.log('  info  ss dilewati (mode mutasi): ' + nama); return; }
      fs.mkdirSync(SS_DIR, { recursive: true });
      const r = await kirim('Page.captureScreenshot', { format: 'png' });
      const data = r.result && r.result.data;
      if (!data) { console.log('  info  screenshot gagal: ' + nama); return; }
      fs.writeFileSync(path.join(SS_DIR, nama), Buffer.from(data, 'base64'));
      console.log('  info  ss -> ' + nama);
    }

    const fileUrl = 'file:///' + BERKAS.replace(/\\/g, '/');
    console.log('\n== memuat berkas ==');
    await kirim('Page.navigate', { url: fileUrl + '#/modul/production-fulfillment' });
    await tunggu(4500);

    const hashAwal = await nilai('location.hash');
    cek('route terbuka di production-fulfillment', hashAwal === '#/modul/production-fulfillment', 'hash ' + hashAwal);

    const kolom = (v) => nilai(`
      JSON.stringify(Array.prototype.slice.call(
        document.querySelectorAll('[data-slot="kanban-column"]')
      ).map(function(c){return c.getAttribute('data-value')}))
    `);

    // ---------------------------------------------------------- papan
    console.log('\n== papan: Production vs White Label ==');
    let kp = JSON.parse((await kolom()) || '[]');
    cek('papan Production punya 8 kolom', kp.length === 8, JSON.stringify(kp));
    cek('papan Production TIDAK punya kolom Invoice Logistic', kp.indexOf('invoice-logistic') < 0, JSON.stringify(kp));
    cek('papan Production punya Prepare', kp.indexOf('prepare') >= 0);

    const pindahWl = await klik(`
      Array.prototype.slice.call(document.querySelectorAll('button'))
        .filter(function(b){return b.getAttribute('aria-pressed') !== null &&
          (b.innerText||'').replace(/\\s+/g,' ').trim() === 'White Label'})[0] || null
    `);
    cek('saklar White Label ditemukan dan diklik', pindahWl.ok, pindahWl.alasan);
    await tunggu(900);

    const kwl = JSON.parse((await kolom()) || '[]');
    cek('papan White Label punya 7 kolom', kwl.length === 7, JSON.stringify(kwl));
    cek('papan White Label PUNYA kolom Invoice Logistic', kwl.indexOf('invoice-logistic') >= 0, JSON.stringify(kwl));
    cek('papan White Label tidak punya Prepare', kwl.indexOf('prepare') < 0, JSON.stringify(kwl));

    // ------------------------------------------------- invoice-logistic
    console.log('\n== invoice-logistic (w-02) ==');
    let k = await klik(`document.querySelector('[data-kartu="w-02"]')`);
    cek('kartu w-02 ditemukan dan diklik', k.ok, k.alasan);
    await tunggu(1200);

    let td = await teksDialog();
    cek('popup terbuka dengan judul Invoice Logistic', td.indexOf('Invoice Logistic Fulfillment') >= 0, td.slice(0, 90));
    cek('popup menyebut asal papan White Label', td.indexOf('White Label proposal') >= 0, td.slice(0, 120));
    cek('seksi Invoice Logistic tampil (bukan SeksiBelumAda)', td.indexOf('Nota dan pembayaran ongkos kirim shipment ini') >= 0);
    cek('bukan layar "Belum ada isi khusus"', td.indexOf('Belum ada isi khusus') < 0);

    const isiForm = (await nilai(`
      JSON.stringify({
        kode: !!document.querySelector('input[aria-label="Kode shipment Livou"]'),
        tanggal: !!document.querySelector('input[type=date][aria-label="Tanggal invoice logistic"]'),
        unggahInv: !!document.querySelector('input[aria-label="Unggah Bukti Invoice Logistic"]'),
        unggahBayar: !!document.querySelector('input[aria-label="Unggah Bukti Pembayaran Logistic"]')
      })
    `)) || '{}';
    const f = JSON.parse(isiForm);
    cek('input Kode Shipment Livou ada', f.kode === true);
    cek('input Tanggal Invoice Logistic ada (type=date)', f.tanggal === true);
    cek('kotak bukti Invoice Logistic ada', f.unggahInv === true);
    cek('kotak bukti Pembayaran Logistic ada', f.unggahBayar === true);

    const cekTombol = (label) => nilai(`
      (function(){
        var b = Array.prototype.slice.call(document.querySelectorAll('[data-slot="dialog-content"] button'))
          .filter(function(x){return (x.innerText||'').replace(/\\s+/g,' ').trim().indexOf(${JSON.stringify(label)}) === 0})[0];
        if (!b) return 'tidak-ada';
        return /\\sdisabled(\\s|=|>|\\/)/.test(b.outerHTML) ? 'disabled' : 'hidup';
      })()
    `);

    cek('gerbang tertutup: kalimat kekurangan ditulis lengkap',
      td.indexOf('Belum lengkap: Kode shipment, Tanggal invoice logistic, Bukti Invoice Logistic, Bukti Pembayaran Logistic.') >= 0,
      td.slice(td.indexOf('Belum lengkap'), td.indexOf('Belum lengkap') + 140));
    cek('tombol "Lanjut ke Receive" ada dan disabled',
      (await cekTombol('Lanjut ke Receive')) === 'disabled');
    await simpanSs('01-invoice-logistic-belum-lengkap.png');

    // Isi kolom lewat native setter + event 'input' — cara yang React dengar.
    const isiKolom = (label, val) => nilai(`
      (function(){
        var el = document.querySelector('input[aria-label=${JSON.stringify(label)}]');
        if (!el) return 'tidak-ada';
        var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, ${JSON.stringify(val)});
        el.dispatchEvent(new Event('input', {bubbles:true}));
        return 'ok';
      })()
    `);

    cek('isi Kode Shipment', (await isiKolom('Kode shipment Livou', 'SH-CN-2609-002')) === 'ok');
    await tunggu(400);
    cek('isi Tanggal Invoice Logistic', (await isiKolom('Tanggal invoice logistic', '2026-09-02')) === 'ok');
    await tunggu(400);

    // Unggah berkas asli lewat DataTransfer — input file tidak bisa diisi
    // dengan setter nilai seperti input teks; ini satu-satunya cara yang
    // benar-benar memicu onChange React dengan objek File sungguhan.
    const unggah = (label, nama) => nilai(`
      (function(){
        var inp = document.querySelector('input[aria-label=${JSON.stringify('Unggah ' + label)}]');
        if (!inp) return 'tidak-ada';
        var dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array([37,80,68,70])], ${JSON.stringify(nama)}, {type:'application/pdf'}));
        inp.files = dt.files;
        inp.dispatchEvent(new Event('change', {bubbles:true}));
        return 'ok';
      })()
    `);

    cek('unggah Bukti Invoice Logistic', (await unggah('Bukti Invoice Logistic', 'NOTA-LOGISTIK.pdf')) === 'ok');
    await tunggu(500);
    cek('unggah Bukti Pembayaran Logistic', (await unggah('Bukti Pembayaran Logistic', 'BUKTI-BAYAR-LOGISTIK.pdf')) === 'ok');
    await tunggu(700);

    td = await teksDialog();
    cek('berkas yang diunggah terlihat namanya', td.indexOf('NOTA-LOGISTIK.pdf') >= 0 && td.indexOf('BUKTI-BAYAR-LOGISTIK.pdf') >= 0);
    cek('gerbang terbuka: kalimat lengkap muncul',
      td.indexOf('Invoice logistic lengkap (2/2 bukti). Kartu boleh masuk Receive.') >= 0,
      td.slice(td.indexOf('Kelengkapan'), td.indexOf('Kelengkapan') + 140));
    cek('tombol "Lanjut ke Receive" hidup',
      (await cekTombol('Lanjut ke Receive')) === 'hidup');
    await simpanSs('02-invoice-logistic-lengkap.png');

    // Klik lanjut → kartu pindah ke Receive, popup menutup sendiri.
    const lanjut = await klik(`
      Array.prototype.slice.call(document.querySelectorAll('[data-slot="dialog-content"] button'))
        .filter(function(x){return (x.innerText||'').replace(/\\s+/g,' ').trim().indexOf('Lanjut ke Receive') === 0})[0] || null
    `);
    cek('klik "Lanjut ke Receive"', lanjut.ok, lanjut.alasan);
    await tunggu(900);

    const dialogSetelah = await nilai(`!!document.querySelector('[data-slot="dialog-content"]')`);
    cek('popup tertutup setelah lanjut', dialogSetelah === false);

    const posisi = JSON.parse((await nilai(`
      (function(){
        var diReceive = document.querySelector('[data-slot="kanban-column"][data-value="receive"] [data-kartu="w-02"]');
        var diInvLog = document.querySelector('[data-slot="kanban-column"][data-value="invoice-logistic"] [data-kartu="w-02"]');
        return JSON.stringify({diReceive: !!diReceive, diInvLog: !!diInvLog});
      })()
    `)) || '{}');
    cek('kartu w-02 sekarang di kolom Receive', posisi.diReceive === true);
    cek('kartu w-02 tidak lagi di kolom Invoice Logistic', posisi.diInvLog === false);

    // Buka lagi kartu yang sudah pindah: isinya tidak boleh bisa diubah lagi.
    k = await klik(`document.querySelector('[data-kartu="w-02"]')`);
    cek('kartu w-02 bisa dibuka lagi di Receive', k.ok, k.alasan);
    await tunggu(1000);
    td = await teksDialog();
    const takBisaUbah = JSON.parse((await nilai(`
      JSON.stringify({
        inputKode: !!document.querySelector('[data-slot="dialog-content"] input[aria-label="Kode shipment Livou"]'),
        tombolUnggah: Array.prototype.slice.call(document.querySelectorAll('[data-slot="dialog-content"] button'))
          .some(function(b){return (b.innerText||'').indexOf('Unggah') === 0}),
        tombolHapus: !!document.querySelector('[data-slot="dialog-content"] button[aria-label^="Hapus"]'),
        tombolLanjut: Array.prototype.slice.call(document.querySelectorAll('[data-slot="dialog-content"] button'))
          .some(function(b){return (b.innerText||'').indexOf('Lanjut ke') === 0})
      })
    `)) || '{}');
    cek('kartu yang sudah lewat: tidak ada input kode shipment', takBisaUbah.inputKode === false);
    cek('kartu yang sudah lewat: tidak ada tombol Unggah', takBisaUbah.tombolUnggah === false);
    cek('kartu yang sudah lewat: tidak ada tombol Hapus bukti', takBisaUbah.tombolHapus === false);
    cek('kartu yang sudah lewat: tidak ada tombol Lanjut', takBisaUbah.tombolLanjut === false);
    await klik(`document.querySelector('[data-slot="dialog-close"]')`);
    await tunggu(600);

    // ------------------------------------------------- invoice-product
    console.log('\n== invoice-product (w-05): dua jalur ==');
    k = await klik(`document.querySelector('[data-kartu="w-05"]')`);
    cek('kartu w-05 diklik', k.ok, k.alasan);
    await tunggu(1200);

    td = await teksDialog();
    cek('popup Invoice Product tampil', td.indexOf('Invoice Product Fulfillment') >= 0, td.slice(0, 90));
    cek('seksi Invoice Product tampil (bukan SeksiBelumAda)', td.indexOf('Invoice produk, plus ke mana barangnya dibayar') >= 0);
    cek('seksi tidak menuntut kedua jalur sekaligus di awal',
      td.indexOf('Bukti Invoice Product') >= 0 && td.indexOf('Bukti Pembayaran Product') < 0 && td.indexOf('Bukti Reimburse') < 0);
    cek('kekurangan awal menuntut Flow transaksi',
      td.indexOf('Belum lengkap: Kode shipment, Tanggal invoice product, Flow transaksi, Bukti Invoice Product.') >= 0,
      td.slice(td.indexOf('Belum lengkap'), td.indexOf('Belum lengkap') + 140));

    // Pilih jalur lewat Select Base UI: klik trigger, lalu klik opsi di portal.
    async function pilihFlow(label) {
      const buka = await klik(`document.querySelector('[aria-label="Flow transaksi"]')`);
      if (!buka.ok) return 'trigger: ' + buka.alasan;
      await tunggu(700);
      const pilih = await klik(`
        Array.prototype.slice.call(document.querySelectorAll('[role=option]'))
          .filter(function(o){return (o.innerText||'').replace(/\\s+/g,' ').trim() === ${JSON.stringify(label)}})[0] || null
      `);
      await tunggu(700);
      return pilih.ok ? 'ok' : 'opsi: ' + pilih.alasan;
    }

    const p1 = await pilihFlow('Livou Transfer');
    cek('pilih jalur Livou Transfer lewat Select', p1 === 'ok', p1);
    td = await teksDialog();
    cek('jalur Livou Transfer: kotak Bukti Pembayaran Product muncul', td.indexOf('Bukti Pembayaran Product') >= 0);
    cek('jalur Livou Transfer: kotak Bukti Reimburse TIDAK muncul', td.indexOf('Bukti Reimburse') < 0);
    cek('kekurangan ikut jalur: Flow transaksi hilang dari daftar',
      td.indexOf('Belum lengkap: Kode shipment, Tanggal invoice product, Bukti Invoice Product, Bukti Pembayaran Product.') >= 0,
      td.slice(td.indexOf('Belum lengkap'), td.indexOf('Belum lengkap') + 150));

    // Unggah satu berkas di jalur Livou, lalu PINDAH jalur. Dua jalur memakai
    // field BERBEDA (`proofPaymentProduct` vs `proofReimburse`) — kalau id
    // keduanya sampai tertukar atau disamakan, berkas yang diunggah di satu
    // jalur ikut muncul di kotak jalur lain. Bocor itu TIDAK terlihat dari
    // judul kotaknya (judulnya tetap benar), jadi yang diperiksa di sini nama
    // berkasnya.
    cek('unggah bukti di jalur Livou Transfer',
      (await unggah('Bukti Pembayaran Product', 'BUKTI-LIVOU.pdf')) === 'ok');
    await tunggu(500);
    td = await teksDialog();
    cek('berkas jalur Livou terlihat di kotaknya', td.indexOf('BUKTI-LIVOU.pdf') >= 0);
    await simpanSs('03-invoice-product-jalur-livou.png');

    const p2 = await pilihFlow('Reimbursement');
    cek('ganti jalur ke Reimbursement lewat Select', p2 === 'ok', p2);
    td = await teksDialog();
    cek('jalur Reimbursement: kotak Bukti Reimburse muncul', td.indexOf('Bukti Reimburse') >= 0);
    cek('jalur Reimbursement: kotak Bukti Pembayaran Product TIDAK muncul', td.indexOf('Bukti Pembayaran Product') < 0);
    cek('berkas jalur Livou TIDAK bocor ke kotak Reimburse', td.indexOf('BUKTI-LIVOU.pdf') < 0,
      td.slice(0, 220));
    cek('kekurangan jalur Reimbursement tetap menuntut Bukti Reimburse',
      td.indexOf('Belum lengkap: Kode shipment, Tanggal invoice product, Bukti Invoice Product, Bukti Reimburse.') >= 0,
      td.slice(td.indexOf('Belum lengkap'), td.indexOf('Belum lengkap') + 150));
    await simpanSs('04-invoice-product-jalur-reimburse.png');
    await klik(`document.querySelector('[data-slot="dialog-close"]')`);
    await tunggu(600);

    // ------------------------------------------------- upload
    console.log('\n== upload (w-07) ==');
    k = await klik(`document.querySelector('[data-kartu="w-07"]')`);
    cek('kartu w-07 diklik', k.ok, k.alasan);
    await tunggu(1200);

    td = await teksDialog();
    cek('popup Upload tampil', td.indexOf('Upload Fulfillment') >= 0, td.slice(0, 90));
    cek('seksi Upload tampil (bukan SeksiBelumAda)', td.indexOf('Produk sudah tayang di marketplace dan sudah masuk POS') >= 0);
    cek('label kolom menyebut satuan pcs', td.indexOf('Jumlah Upload POS (pcs)') >= 0);
    cek('kotak Proof Upload Ecommerce ada', td.indexOf('Proof Upload Ecommerce') >= 0);
    cek('kotak Upload POS ada', td.indexOf('Upload POS') >= 0);
    cek('pembanding plan pcs ditulis', /Plan kartu ini \d+ pcs/.test(td), td.slice(td.indexOf('Plan kartu'), td.indexOf('Plan kartu') + 60));

    const tipeInput = await nilai(`
      (function(){
        var el = document.querySelector('input[aria-label="Jumlah upload POS"]');
        return el ? el.getAttribute('type') : 'tidak-ada';
      })()
    `);
    cek('Jumlah Upload POS dirender sebagai input angka', tipeInput === 'number', 'type=' + tipeInput);

    cek('kekurangan awal menuntut Jumlah upload POS',
      td.indexOf('Belum lengkap: Jumlah upload POS, Proof Upload Ecommerce, Upload POS.') >= 0,
      td.slice(td.indexOf('Belum lengkap'), td.indexOf('Belum lengkap') + 140));

    // 0 BUKAN kosong: setelah diisi 0, "Jumlah upload POS" harus hilang dari
    // daftar kekurangan — kalau 0 dianggap kosong, ia tetap ada di daftar.
    cek('isi Jumlah Upload POS = 0', (await isiKolom('Jumlah upload POS', '0')) === 'ok');
    await tunggu(600);
    td = await teksDialog();
    cek('0 dihitung terisi: Jumlah upload POS hilang dari kekurangan',
      td.indexOf('Belum lengkap: Proof Upload Ecommerce, Upload POS.') >= 0,
      td.slice(td.indexOf('Belum lengkap'), td.indexOf('Belum lengkap') + 120));
    await simpanSs('05-upload-jumlah-pcs.png');

    // Dan sebaliknya: dikosongkan lagi harus kembali menuntut.
    cek('kosongkan lagi Jumlah Upload POS', (await isiKolom('Jumlah upload POS', '')) === 'ok');
    await tunggu(600);
    td = await teksDialog();
    cek('kosong kembali: Jumlah upload POS muncul lagi di kekurangan',
      td.indexOf('Belum lengkap: Jumlah upload POS, Proof Upload Ecommerce, Upload POS.') >= 0,
      td.slice(td.indexOf('Belum lengkap'), td.indexOf('Belum lengkap') + 140));

    // -------------------------------------------------------------- ringkasan
    console.log('\n== ringkasan ==');
    console.log('  lulus ' + lulus + ', gagal ' + gagal);
    if (gagal) for (const n of daftarGagal) console.log('    - ' + n);
    kodeKeluar = gagal === 0 ? 0 : 1;
  } catch (e) {
    console.log('\n  ERROR: ' + e.message);
    kodeKeluar = 1;
  } finally {
    // Urutan penting: Browser.close harus dikirim selagi ws masih terbuka —
    // ws.close() lebih dulu membuat send() dibuang diam-diam (readyState
    // CLOSING), Chrome tidak pernah diberi tahu. kill() tetap jaring terakhir.
    try { await kirimTutup(); } catch (e) {}
    try { if (ws) ws.close(); } catch (e) {}
    chrome.kill();
    for (let i = 0; i < 20 && chrome.exitCode === null; i++) await tunggu(100);
    if (chrome.exitCode === null) { try { chrome.kill('SIGKILL'); } catch (e) {} }
    for (let i = 0; i < 20; i++) {
      try { fs.rmSync(userDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); break; }
      catch (e) { if (i === 19) console.log('  info  profil tidak terhapus: ' + userDir); await tunggu(200); }
    }
  }

  // Keluar eksplisit SETELAH Chrome dimatikan: WebSocket yang masih terbuka
  // akan menahan event loop, dan proses yang menggantung tidak pernah memberi
  // exit code yang bisa dipercaya runner.
  process.exit(kodeKeluar);
})();
