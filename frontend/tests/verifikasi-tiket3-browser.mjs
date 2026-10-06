// Verifikasi browser untuk Tiket 3 — daftar temuan Finance Validate di berkas
// presentasi yang SUDAH DIBANGUN.
//
// Kenapa browser, bukan cuma smoke test SSR: smoke test merender `IsiPopup`
// langsung dan tidak pernah menyentuh papan, dialog Base UI, atau KLIK "Tutup
// temuan" yang mengubah state di `PapanFulfillment`. Justru alur itulah yang
// diminta tiket ini ("daftar temuan muncul → tutup temuan → tombol lanjut
// aktif"), dan satu-satunya tempat mengujinya adalah browser.
//
// Jalankan dari frontend/:  node tests/verifikasi-tiket3-browser.mjs
// Berkas yang diperiksa bisa dialihkan lewat env PRESENTASI_FILE (dipakai
// runner mutasi supaya berkas owner tidak pernah tersentuh build yang rusak).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BERKAS = process.env.PRESENTASI_FILE || 'C:\\Users\\livou\\inventory-demo\\Inventory-APP-Presentasi.html';
const SS_DIR = 'C:\\Users\\livou\\inventory-app\\.scratch\\tiket3-verifikasi';
// Screenshot hanya disimpan pada jalan normal (berkas owner). Saat runner
// mutasi mengarahkan PRESENTASI_FILE ke build yang sengaja dirusak, gambar
// keadaan rusak TIDAK boleh menimpa screenshot bukti — jadi dilewati.
const SIMPAN_SS = !process.env.PRESENTASI_FILE;
const PROFIL = path.join(process.env.TEMP || '.', 'verifikasi-tiket3-profil');
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
  // menggantung tanpa exit code. Watchdog mengubah hang senyap jadi kegagalan
  // keras (exit 1) yang terlihat di output.
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
    // dari `finally`, seluruh proses ikut menggantung. Jadi: kirim tanpa
    // menunggu balasan.
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

    // Pembaca status tombol "Selesaikan validasi": Finance Validate adalah
    // kolom TERAKHIR, jadi tombolnya tidak menyebut nama stage berikutnya.
    const cekTombolSelesai = () => nilai(`
      (function(){
        var b = Array.prototype.slice.call(document.querySelectorAll('[data-slot="dialog-content"] button'))
          .filter(function(x){return (x.innerText||'').replace(/\\s+/g,' ').trim().indexOf('Selesaikan validasi') === 0})[0];
        if (!b) return 'tidak-ada';
        return /\\sdisabled(\\s|=|>|\\/)/.test(b.outerHTML) ? 'disabled' : 'hidup';
      })()
    `);

    const hitungBaris = () => nilai(`
      JSON.stringify({
        baris: document.querySelectorAll('[data-slot="dialog-content"] [data-temuan]').length,
        terbuka: document.querySelectorAll('[data-slot="dialog-content"] [data-status="terbuka"]').length,
        tertutup: document.querySelectorAll('[data-slot="dialog-content"] [data-status="tertutup"]').length,
        tombolTutup: document.querySelectorAll('[data-slot="dialog-content"] button[data-tutup-temuan]').length
      })
    `);

    // Menutup temuan satu per satu LEWAT KLIK SUNGGUHAN. Ini bagian yang tidak
    // pernah tersentuh SSR: state `temuanTertutup` hidup di PapanFulfillment,
    // dan hanya klik nyata yang membuktikan sambungannya utuh.
    async function tutupSemuaTemuan(max = 12) {
      let n = 0;
      for (let i = 0; i < max; i++) {
        const masih = await nilai(`!!document.querySelector('[data-slot="dialog-content"] button[data-tutup-temuan]')`);
        if (!masih) break;
        const k = await klik(`document.querySelector('[data-slot="dialog-content"] button[data-tutup-temuan]')`);
        if (!k.ok) return { n, alasan: k.alasan };
        n++;
        await tunggu(350);
      }
      return { n };
    }

    const fileUrl = 'file:///' + BERKAS.replace(/\\/g, '/');
    console.log('\n== memuat berkas ==');
    await kirim('Page.navigate', { url: fileUrl + '#/modul/production-fulfillment' });
    await tunggu(4500);

    const hashAwal = await nilai('location.hash');
    cek('route terbuka di production-fulfillment', hashAwal === '#/modul/production-fulfillment', 'hash ' + hashAwal);

    // ------------------------------------------------- finance-validate (p-10)
    console.log('\n== finance-validate (p-10, Production) ==');
    let k = await klik(`document.querySelector('[data-kartu="p-10"]')`);
    cek('kartu p-10 ditemukan dan diklik', k.ok, k.alasan);
    await tunggu(1200);

    let td = await teksDialog();
    cek('popup terbuka dengan judul Finance Validate', td.indexOf('Finance Validate Fulfillment') >= 0, td.slice(0, 90));
    cek('seksi Finance Validate tampil (bukan SeksiBelumAda)', td.indexOf('Stage penutup. Kartu tidak pernah mundur') >= 0);
    cek('bukan layar "Belum ada isi khusus"', td.indexOf('Belum ada isi khusus') < 0);
    cek('kepala daftar menulis jumlahnya', /Daftar temuan \(\d+ terbuka dari \d+\)/.test(td), td.slice(0, 160));
    cek('badge "Kartu tertahan" tampil selama ada temuan terbuka', td.indexOf('Kartu tertahan') >= 0);

    let h = JSON.parse((await hitungBaris()) || '{}');
    cek('daftar temuan punya baris', h.baris > 0, 'baris=' + h.baris);
    cek('semua baris awalnya berstatus terbuka', h.terbuka === h.baris && h.tertutup === 0,
      `terbuka=${h.terbuka}, tertutup=${h.tertutup}, baris=${h.baris}`);
    cek('setiap baris terbuka punya tombol "Tutup temuan"', h.tombolTutup === h.baris,
      `tombol=${h.tombolTutup}, baris=${h.baris}`);

    // Temuan bukti p-10 semuanya dari stage yang dilalui papan Production.
    cek('temuan p-10 tidak menuntut bukti Invoice Logistic (papan Production)',
      td.indexOf('Bukti Invoice Logistic') < 0);

    cek('gerbang tertutup: "Selesaikan validasi" disabled selama temuan terbuka',
      (await cekTombolSelesai()) === 'disabled');
    // Geser daftar temuan ke tengah sebelum memotret: popup ini panjang
    // (identitas + tabel rencana di atas), dan screenshot yang cuma memuat dua
    // baris pertama tidak memperlihatkan "berapa" yang diminta tiket.
    await nilai(`
      (function(){
        var kepala = Array.prototype.slice.call(document.querySelectorAll('[data-slot="dialog-content"] div'))
          .filter(function(x){return (x.innerText||'').indexOf('Daftar temuan (') === 0})[0];
        if (kepala) kepala.scrollIntoView({block:'start'});
        return !!kepala;
      })()
    `);
    await tunggu(500);
    await simpanSs('01-finance-validate-temuan-terbuka.png');

    // ---- tutup semua temuan lewat klik ----
    const hasilTutup = await tutupSemuaTemuan();
    cek('semua temuan bisa ditutup lewat klik', hasilTutup.n === h.baris,
      `tertutup=${hasilTutup.n}, baris=${h.baris}${hasilTutup.alasan ? ', alasan=' + hasilTutup.alasan : ''}`);
    await tunggu(500);

    td = await teksDialog();
    h = JSON.parse((await hitungBaris()) || '{}');
    // Dua sisi sekaligus: jumlah barisnya TIDAK menyusut (riwayat, bukan
    // penghapusan) DAN seluruhnya berstatus tertutup. Yang pertama saja hijau
    // kalau status tidak pernah berubah; yang kedua saja hijau kalau daftarnya
    // justru menyusut.
    cek('riwayat: jumlah baris tetap setelah semua ditutup', h.baris === hasilTutup.n,
      `sesudah=${h.baris}, sebelum=${hasilTutup.n}`);
    cek('riwayat: semua baris berstatus tertutup', h.tertutup === h.baris && h.terbuka === 0,
      `terbuka=${h.terbuka}, tertutup=${h.tertutup}`);
    cek('tombol "Tutup temuan" hilang setelah ditutup', h.tombolTutup === 0, 'tombol=' + h.tombolTutup);
    cek('badge "Kartu tertahan" hilang setelah tidak ada temuan terbuka', td.indexOf('Kartu tertahan') < 0);
    cek('kalimat status menyebut semua temuan sudah ditutup',
      /Semua \d+ temuan sudah ditutup\. Kartu boleh lanjut\./.test(td),
      td.slice(td.indexOf('Kelengkapan'), td.indexOf('Kelengkapan') + 160));

    cek('gerbang terbuka: "Selesaikan validasi" hidup setelah semua temuan ditutup',
      (await cekTombolSelesai()) === 'hidup');
    // Sama: geser ke bawah supaya baris tertutup DAN tombolnya terlihat.
    await nilai(`
      (function(){
        var b = Array.prototype.slice.call(document.querySelectorAll('[data-slot="dialog-content"] button'))
          .filter(function(x){return (x.innerText||'').replace(/\\s+/g,' ').trim().indexOf('Selesaikan validasi') === 0})[0];
        if (b) b.scrollIntoView({block:'end'});
        return !!b;
      })()
    `);
    await tunggu(500);
    await simpanSs('02-finance-validate-temuan-tertutup.png');

    // Klik tombol yang sudah hidup: popup menutup, kartu TETAP di Finance
    // Validate (kolom terakhir — tidak ada stage berikutnya yang bisa dituju).
    const selesai = await klik(`
      Array.prototype.slice.call(document.querySelectorAll('[data-slot="dialog-content"] button'))
        .filter(function(x){return (x.innerText||'').replace(/\\s+/g,' ').trim().indexOf('Selesaikan validasi') === 0})[0] || null
    `);
    cek('klik "Selesaikan validasi"', selesai.ok, selesai.alasan);
    await tunggu(900);
    const dialogSetelah = await nilai(`!!document.querySelector('[data-slot="dialog-content"]')`);
    cek('popup tertutup setelah validasi selesai', dialogSetelah === false);
    // "Sekali jalan": Finance Validate kolom terakhir, jadi kartunya TETAP di
    // sana — tidak ada yang mundur dan tidak ada yang hilang dari papan.
    //
    // Dibaca sebagai DAFTAR KOLOM yang memuat p-10, bukan `!![...]`. Versi
    // lama menulis `!![document.querySelector(...)]` — kurung siku itu array
    // literal, dan array apa pun (termasuk `[null]`) selalu truthy: check-nya
    // hijau apa pun isi DOM, dan mutasi B8 lolos lewat check lain, bukan lewat
    // yang ini. Daftar ini sekaligus menuntut lebih banyak: tepat satu kolom,
    // dan kolomnya finance-validate.
    const kolomP10 = await nilai(`
      Array.prototype.slice.call(document.querySelectorAll('[data-slot="kanban-column"]'))
        .filter(function(c){return c.querySelector('[data-kartu="p-10"]')})
        .map(function(c){return c.getAttribute('data-value')})
    `);
    cek('kartu p-10 tetap di kolom Finance Validate (tidak mundur)',
      Array.isArray(kolomP10) && kolomP10.length === 1 && kolomP10[0] === 'finance-validate',
      'kolom=' + JSON.stringify(kolomP10));

    // ---- buka ulang: keputusan tutup bertahan ----
    //
    // Ini yang membedakan "menutup temuan" dari "menyembunyikan daftar":
    // temuan tertutup hidup di state PAPAN, jadi popup yang ditutup lalu dibuka
    // lagi harus menunjukkan keadaan yang sama.
    k = await klik(`document.querySelector('[data-kartu="p-10"]')`);
    cek('kartu p-10 bisa dibuka lagi', k.ok, k.alasan);
    await tunggu(1000);
    h = JSON.parse((await hitungBaris()) || '{}');
    cek('temuan yang sudah ditutup tetap tertutup saat popup dibuka lagi',
      h.baris === hasilTutup.n && h.tertutup === h.baris,
      `baris=${h.baris}, tertutup=${h.tertutup}`);
    await klik(`document.querySelector('[data-slot="dialog-close"]')`);
    await tunggu(600);

    // ------------------------------------------------- finance-validate (w-08)
    console.log('\n== finance-validate (w-08, White Label) ==');
    const pindahWl = await klik(`
      Array.prototype.slice.call(document.querySelectorAll('button'))
        .filter(function(b){return b.getAttribute('aria-pressed') !== null &&
          (b.innerText||'').replace(/\\s+/g,' ').trim() === 'White Label'})[0] || null
    `);
    cek('saklar White Label ditemukan dan diklik', pindahWl.ok, pindahWl.alasan);
    await tunggu(900);

    k = await klik(`document.querySelector('[data-kartu="w-08"]')`);
    cek('kartu w-08 ditemukan dan diklik', k.ok, k.alasan);
    await tunggu(1200);

    td = await teksDialog();
    cek('popup White Label juga memakai seksi Finance Validate', td.indexOf('Finance Validate Fulfillment') >= 0, td.slice(0, 90));
    h = JSON.parse((await hitungBaris()) || '{}');
    cek('daftar temuan White Label punya baris', h.baris > 0, 'baris=' + h.baris);
    // Bukti wajib mengikuti PAPAN: White Label tidak pernah melewati Cutting,
    // jadi menuntut "Laporan Potong Kain" di sini adalah temuan yang mustahil
    // ditutup siapa pun.
    cek('temuan White Label tidak menuntut bukti Cutting', td.indexOf('Laporan Potong Kain') < 0);
    cek('temuan White Label menuntut bukti Invoice Logistic', td.indexOf('Bukti Invoice Logistic') >= 0);
    await simpanSs('03-finance-validate-white-label.png');
    await klik(`document.querySelector('[data-slot="dialog-close"]')`);
    await tunggu(600);

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
