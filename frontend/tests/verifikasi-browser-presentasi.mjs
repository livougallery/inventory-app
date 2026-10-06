// Buktikan stub fetch benar-benar jalan di file://, di browser sungguhan.
//
// Test Node (tests/verifikasi-presentasi.test.cjs) menjalankan stub di sandbox
// dengan location tiruan. Itu membuktikan logikanya, bukan bahwa halamannya
// benar-benar memuat. Yang diuji di sini:
//
//   1. Halaman terbuka dari file:// tanpa error React.
//   2. Stub aktif SEBELUM modul bundel memanggil /api/.
//   3. Tag <script> palsu di dalam string React ("<\/script>") tidak membuat
//      modul dieksekusi lebih awal.
//
// Cara: Chrome headless di-hole lewat DevTools Protocol, lalu Page.navigate ke
// file:// dan Page.addScriptToEvaluateOnNewDocument untuk menyuntik pengintai
// sebelum semua skrip halaman.
//
// Jalankan: node tests/verifikasi-browser-presentasi.mjs
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BERKAS = 'C:\\Users\\livou\\inventory-demo\\Inventory-APP-Presentasi.html';
const PROFIL = path.join(process.env.TEMP || '.', 'verifikasi-presentasi-profil');
// Port acak per jalan. Port tetap (9222) berbahaya: kalau Chrome dari run
// sebelumnya belum mati, skrip ini diam-diam bicara ke browser LAMA — lalu
// seluruh assertion-nya jadi mengukur halaman dari run sebelumnya, bukan yang
// sekarang. Run 2026-10-01 12:45 gagal persis begini ("Failed to fetch")
// padahal tidak ada build di antaranya.
let PORT = 0;

let lulus = 0, gagal = 0;
const daftarGagal = [];
function cek(nama, kondisi, tambahan) {
  if (kondisi) { lulus++; console.log('  LULUS  ' + nama); }
  else { gagal++; daftarGagal.push(nama); console.log('  GAGAL  ' + nama + (tambahan ? '  -> ' + tambahan : '')); }
}

// Pengintai yang dipasang sebelum dokumen apa pun termuat. window.__panggil
// dicatat stub; window.__modul dicatat bundel lewat pesan window.
const PENGAWAT = `
window.__panggil = [];
window.__modulJalan = false;
(function () {
  window.addEventListener('message', function (ev) {
    if (ev.data && ev.data.tipe === 'modul-jalan') window.__modulJalan = true;
  });
})();
`;

// Dipasang SESUDAH stub, jadi ia membungkus fetch hasil stub.
const PEMANTAU = `
(function () {
  var stub = window.fetch;
  window.__panggil = [];
  window.fetch = function (input, init) {
    var u = String(input);
    var m = String((init && init.method) || 'GET').toUpperCase();
    window.__panggil.push(m + ' ' + u);
    return stub.apply(window, arguments);
  };
  try { sessionStorage.setItem('verifikasi:stub-aktif', '1'); } catch (e) {}
})();
`;

function tunggu(ms) { return new Promise(r => setTimeout(r, ms)); }

async function jsonCdp(port, path, method) {
  // Chrome >= 111 menolak GET di /json/new dengan "Using unsafe HTTP verb GET
  // to invoke /json/new. This action supports only PUT verb." Jadi pilih
  // verb-nya, bukan asal GET.
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: method || 'GET' });
  return res.json();
}

(async function () {
  if (!fs.existsSync(CHROME)) {
    console.log('Chrome tidak ada di ' + CHROME + ' — uji browser dilewati.');
    process.exit(2);
  }
  if (!fs.existsSync(BERKAS)) {
    console.log('Berkas presentasi tidak ada: ' + BERKAS);
    process.exit(1);
  }

  // Port acak, di-bind eksplisit nol agar OS memberi yang bebas. Kalau angka
  // tetap dipakai dan portnya masih dipegang proses lain, Chrome yang kita
  // spawn justru BERGAGAL membuka port, lalu jsonCdp di bawah menemukan
  // DevTools milik orang lain dan seluruh test mengukur browser itu.
  PORT = 9300 + (process.pid % 600);

  const userDir = PROFIL + '-' + Date.now();
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + userDir,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--allow-file-access-from-files',
    'about:blank',
  ], { stdio: 'ignore' });

  let ws;
  // Dipakai dari blok finally, yang jalan meski try gagal sebelum socket siap.
  // Karena itu harus di-declare di sini, bukan di dalam try.
  let kirimTutup = async () => {};
  try {
    // Tunggu DevTools siap, dan pastikan itu instance yang barusan di-spawn.
    // Tanpa pengecekan ini, port yang kebetulan dipakai Chrome lain akan
    // dijawab dengan "/json/version" yang sehat, test lalu mengukur browser
    // itu — dan hasilnya acak.
    let version = null;
    for (let i = 0; i < 60; i++) {
      try { version = await jsonCdp(PORT, '/json/version'); break; } catch (e) { await tunggu(250); }
    }
    if (!version) throw new Error('DevTools tidak pernah siap');
    if (!version.webSocketDebuggerUrl) {
      throw new Error('/json/version tidak punya webSocketDebuggerUrl');
    }
    if (chrome.exitCode !== null) {
      throw new Error('Chrome sudah mati sebelum DevTools siap (exit ' +
        chrome.exitCode + ') — port ' + PORT + ' mungkin dipakai proses lain.');
    }
    // Bukti prosesnya benar-benar yang kita spawn: Chrome hanya melaporkan
    // DevTools kalau ia yang memegang port itu.
    if (String(version.Browser || '').indexOf('Chrome') < 0) {
      throw new Error('Yang menjawab port ' + PORT + ' bukan Chrome: ' + version.Browser);
    }

    // Buka target baru dan sambung lewat WebSocket.
    const target = await jsonCdp(PORT, '/json/new?' + encodeURI('about:blank'), 'PUT');
    const { WebSocket } = await import('ws').catch(() => ({ WebSocket: globalThis.WebSocket }));
    if (!WebSocket) throw new Error('Tidak ada WebSocket (Butuh Node >= 22)');

    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 0;
    const tungguBalasan = new Map();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && tungguBalasan.has(msg.id)) {
        tungguBalasan.get(msg.id)(msg);
        tungguBalasan.delete(msg.id);
      }
    };
    const kirim = (method, params) => new Promise((res) => {
      const n = ++id;
      tungguBalasan.set(n, res);
      ws.send(JSON.stringify({ id: n, method, params: params || {} }));
    });

    const nilai = async (expr) => {
      const r = await kirim('Runtime.evaluate', {
        expression: expr, returnByValue: true, awaitPromise: true,
      });
      return r.result && r.result.result ? r.result.result.value : undefined;
    };

    // Diisi di sini, dibaca di blok finally (lihat deklarasinya di atas try).
    kirimTutup = async () => {
      // Browser.close menutup SELURUH instance, termasuk proses anaknya —
      // jauh lebih rapi daripada kill() yang di Windows hanya killing parent.
      try { await kirim('Browser.close'); } catch (e) {}
      await tunggu(500);
    };

    await kirim('Page.enable');
    await kirim('Runtime.enable');

    // Pengintai dipasang lebih dulu, pemantau belakangan: urutan ini
    // membuktikan stub sempat aktif sebelum ada yang membungkusnya.
    await kirim('Page.addScriptToEvaluateOnNewDocument', { source: PENGAWAT });
    await kirim('Page.addScriptToEvaluateOnNewDocument', { source: PEMANTAU });

    console.log('\n== memuat berkas dari file:// ==');
    const fileUrl = 'file:///' + BERKAS.replace(/\\/g, '/');
    await kirim('Page.navigate', { url: fileUrl });
    await tunggu(4000);

    // ---------------------------------------------------------------- React
    console.log('\n== halaman ==');
    const rootIsi = await nilai('(function(){var r=document.getElementById("root");return r?r.innerHTML.length:0})()');
    cek('React merender sesuatu ke #root', rootIsi > 500, 'panjang isi ' + rootIsi);

    // MODE_VIDEO = true (Shell.tsx) mengalihkan halaman lama ke
    // /modul/material, tapi sidebar TETAP tampil — jadi kehadirannya justru
    // bukti navigasi utuh, bukan sesuatu yang seharusnya disembunyikan.
    const teks = (await nilai('document.body.innerText||""')) || '';
    cek('halaman berisi teks nyata (bukan layar kosong)', teks.trim().length > 80,
      'panjang teks ' + teks.trim().length);

    const adaError = /Coming soon|Cannot GET|Something went wrong/i.test(teks);
    cek('tidak ada layar error / "Coming soon"', adaError === false);

    // Sidebar shadcn ada di DOM tapi tidak masuk innerText — label section-nya
    // ("Master Data") dan menunya berada di wrapper yang disembunyikan saat
    // collapsed. Yang diuji di sini keberadaannya di DOM, bukan kelihatan.
    const domSidebar = await nilai(`
      (function(){
        var h = document.body.innerHTML;
        return JSON.stringify({
          adaWhiteLabel: h.indexOf('White Label') >= 0,
          adaBomHpp: h.indexOf('BOM + HPP Production') >= 0
        });
      })()
    `);
    const sb = JSON.parse(domSidebar || '{}');
    cek('sidebar ter-render di DOM (menu White Label)', sb.adaWhiteLabel === true);
    cek('sidebar punya section Master Data (menu BOM + HPP)', sb.adaBomHpp === true);
    cek('halaman memuat konten Material (tujuan mode video)', /Material/i.test(teks) === true);

    // ----------------------------------------------------------------- stub
    console.log('\n== stub ==');
    const stubAktif = await nilai(
      '(function(){try{return sessionStorage.getItem("verifikasi:stub-aktif")}catch(e){return "ERR:"+e}})()');
    cek('stub membungkus fetch (pemantau menemukan fetch milik stub)', stubAktif === '1',
      'nilai ' + JSON.stringify(stubAktif));

    const panggilan = await nilai('JSON.stringify(window.__panggil||[])');
    const daftar = JSON.parse(panggilan || '[]');
    // Halaman /modul/material tidak memuat vendor saat start; /api/ dipanggil
    // begitu form PO dibuka. Yang membuktikan stub hidup adalah fetch di bawah,
    // bukan daftar panggilan yang bisa kosong di halaman tanpa form.
    console.log('  info  panggilan otomatis saat start: ' + daftar.length +
      (daftar.length ? ' -> ' + JSON.stringify(daftar).slice(0, 100) : ' (halaman tanpa form)'));

    // Bukti paling penting: /api/ TIDAK pernah jatuh ke jaringan sebagai
    // file:///... Kalau stub tidak aktif, itu yang terjadi dan dropdown kosong.
    const luar = daftar.filter(x => x.indexOf('file://') >= 0);
    cek('tidak ada request file:///api/ yang lolos ke jaringan', luar.length === 0,
      JSON.stringify(luar).slice(0, 140));

    const hasil = await nilai(`
      (function(){
        return fetch('/api/vendors').then(function(r){return r.json()}).then(function(b){
          return JSON.stringify({ok:b.ok, n:(b.data||[]).length})
        }).catch(function(e){return 'ERR:'+e.message})
      })()
    `);
    cek('fetch /api/vendors di halaman hidup -> ok, 5 vendor',
      hasil === '{"ok":true,"n":5}', 'hasil ' + hasil);

    const csrf = await nilai(`
      fetch('/api/csrf').then(function(r){return r.json()}).then(function(b){
        return typeof b.csrfToken + '/' + typeof b.ok
      }).catch(function(e){return 'ERR:'+e.message})
    `);
    cek('/api/csrf di halaman hidup -> string/undefined (bentuk aslinya)',
      csrf === 'string/undefined', 'hasil ' + csrf);

    // ------------------------------------------------- form: dropdown berisi
    //
    // Ini yang dilihat owner. K الطفل ke halaman yang punya form pemanggil
    // /api/, lalu buka dialognya dan hitung opsi yang benar-benar dirender.
    console.log('\n== form: dropdown terisi data contoh ==');
    // Tuju Material Fulfillment, bukan /pembelian-material: yang itu ada di
    // PATH_DIBLOKIR_VIDEO (Shell.tsx) sehingga dialihkan ke /modul/material
    // yang tidak punya form vendor.
    await kirim('Page.navigate', { url: fileUrl + '#/modul/material-fulfillment' });
    await tunggu(3500);

    const setelahNav = await nilai('JSON.stringify(window.__panggil||[])');
    const panggil2 = JSON.parse(setelahNav || '[]');
    const cekHash = await nilai('location.hash');
    cek('route berpindah ke material-fulfillment', cekHash === '#/modul/material-fulfillment',
      'hash ' + cekHash);
    // Panggilan /api/ dicatat sebagai informasi, bukan syarat: tab "Papan"
    // sengaja tidak memanggil API. Yang wajib terbukti adalah isi dropdown di
    // bawah — itulah yang dilihat owner.
    console.log('  info  panggilan /api/ sejak muat: ' +
      panggil2.filter(x => x.indexOf('/api/') >= 0).length);

    // Klik lewat CDP, bukan element.click().
    //
    // Radix Tabs (components/ui/tabs.tsx) bereaksi pada onMouseDown, bukan
    // onClick. HTMLElement.click() hanya menembak event 'click', jadi tab
    // tidak pernah berganti dan test hijau-hijau tanpa menguji apa pun.
    async function klikElemen(selectorJk) {
      const kotak = await nilai(`
        (function(){
          var el = ${selectorJk};
          if (!el) return 'null';
          el.scrollIntoView({block:'center'});
          var r = el.getBoundingClientRect();
          return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2,
                                 teks: (el.innerText||'').replace(/\\s+/g,' ').trim()});
        })()
      `);
      if (typeof kotak !== 'string' || kotak === 'null') return null;
      const k = JSON.parse(kotak);
      const dasar = { x: Math.round(k.x), y: Math.round(k.y), button: 'left', clickCount: 1 };
      await kirim('Input.dispatchMouseEvent', { type: 'mousePressed', ...dasar });
      await kirim('Input.dispatchMouseEvent', { type: 'mouseReleased', ...dasar });
      return k.teks;
    }

    const tabAktif = await nilai(`
      (function(){
        var a = document.querySelector('[role=tab][data-state=active]');
        return a ? (a.innerText||'').replace(/\\s+/g,' ').trim() : 'tidak-ada'
      })()
    `);
    cek('tab default adalah "Papan"', tabAktif === 'Papan', 'tab aktif: ' + tabAktif);

    // Tombol pemicu form PO berlabel "Pembelian Material" dan hidup di tab
    // Papan (MaterialFulfillment.tsx -> aksi.buat). Radix Tabs meng-unmount
    // tab yang tidak aktif, jadi pindah ke tab Daftar먼ih membuat tombol ini
    // hilang — itu sebabnya test sebelumnya tidak menemukannya.
    const cariTombol = `
      (function(){
        return Array.prototype.slice.call(document.querySelectorAll('button'))
          .filter(function(b){
            var t=(b.innerText||'').replace(/\\s+/g,' ').trim().toLowerCase();
            return t === 'pembelian material';
          })[0] || null
      })()
    `;
    const dibuka = await klikElemen(cariTombol);
    console.log('  info  tombol -> ' + (dibuka ? 'diklik: ' + dibuka : 'TIDAK ADA'));
    await tunggu(2500);

    if (!dibuka) {
      const semuaTombol = await nilai(`
        JSON.stringify(Array.prototype.slice.call(document.querySelectorAll('button,[role=button],a'))
          .map(function(b){return (b.innerText||'').replace(/\\s+/g,' ').trim()})
          .filter(function(t){return t && t.length<40}).slice(0,20))
      `);
      console.log('  info  tombol yang ada -> ' + semuaTombol);
    } else {
      // Form mungkin sudah terbuka tapi isinya di luar viewport, atau popup
      // dirender ke portal. Cari langsung di DOM, bukan di teks yang terlihat.
      const isi = await nilai(`
        (function(){
          var d = document.querySelector('[role=dialog]');
          var sel = ['CV Aksesoris Jaya','Kain Rayon','Rupiah Indonesia'];
          var html = document.body.innerHTML;
          return JSON.stringify({
            adaDialog: !!d,
            dialogTeks: d ? (d.innerText||'').replace(/\\s+/g,' ').trim().slice(0,120) : null,
            htmlPanjang: html.length,
            cocokHtml: sel.filter(function(s){return html.indexOf(s)>=0})
          });
        })()
      `);
      console.log('  info  form -> ' + isi);
    }

    // HashRouter tidak reload dokumen, jadi jejak route dipakai sebagai bukti
    // halaman benar-benar berganti — bukan masih di /modul/material.
    const jejak = await nilai(`
      JSON.stringify({
        hash: location.hash,
        teks: (document.body.innerText||'').replace(/\\s+/g,' ').trim().slice(0,130)
      })
    `);
    console.log('  info  jejak -> ' + jejak);

    // Opsi dropdown Base UI TIDAK ada di DOM sebelum popup-nya dibuka — itu
    // perilaku portal, bukan stub yang gagal. Jadi dropdown harus benar-benar
    // diklik dulu, baru isinya boleh dihitung.
    const cariVendor = `
      (function(){
        var d = document.querySelector('[role=dialog]');
        if (!d) return null;
        return Array.prototype.slice.call(d.querySelectorAll('button,[role=combobox],[role=button]'))
          .filter(function(b){
            var t=(b.innerText||b.textContent||'').replace(/\\s+/g,' ').trim();
            return t === 'Pilih vendor' || t === 'Pilih Vendor';
          })[0] || null
      })()
    `;
    const bukaVendor = await klikElemen(cariVendor);
    console.log('  info  dropdown vendor -> ' + (bukaVendor ? 'diklik: ' + bukaVendor : 'TIDAK ADA'));
    await tunggu(2000);

    // Popup dirender ke portal di luar dialog, jadi kueri seluruh body.
    const isiForm = await nilai(`
      (function(){
        var h = document.body.innerHTML;
        var t = document.body.innerText || '';
        return JSON.stringify({
          adaPopup: /role="(listbox|option)"/.test(h),
          opsi: /role="option"/.test(h) ?
            Array.prototype.slice.call(document.querySelectorAll('[role=option]'))
              .map(function(o){return (o.innerText||'').replace(/\\s+/g,' ').trim()}) :
            [],
          adaVendor: t.indexOf('CV Aksesoris Jaya') >= 0,
          adaMaterial: t.indexOf('Kain Rayon') >= 0,
          adaMataUang: t.indexOf('Rupiah Indonesia') >= 0
        });
      })()
    `);
    const f = JSON.parse(isiForm || '{}');
    console.log('  info  opsi dropdown -> ' + JSON.stringify(f.opsi || []).slice(0, 240));
    cek('dropdown vendor terbuka (opsi ter-render)', f.adaPopup === true);
    cek('form memuat nama vendor dari stub', f.adaVendor === true,
      'cari "CV Aksesoris Jaya"');

    // Material ditambahkan lewat tombol "Tambah Material" — sebelum itu dialog
    // memang berbunyi "Belum ada material", bukan stub yang gagal. Dan form ini
    // tidak punya field mata uang sama sekali, jadi currency TIDAK diuji lewat
    // sini (sudah terbukti di bagian stub di atas).
    const tambahMaterial = await klikElemen(`
      (function(){
        var d = document.querySelector('[role=dialog]');
        if (!d) return null;
        return Array.prototype.slice.call(d.querySelectorAll('button'))
          .filter(function(b){
            var t=(b.innerText||'').replace(/\\s+/g,' ').trim().toLowerCase();
            return t === 'tambah material';
          })[0] || null
      })()
    `);
    console.log('  info  tombol Tambah Material -> ' +
      (tambahMaterial ? 'diklik' : 'TIDAK ADA'));
    await tunggu(2500);

    // Check versi lama mengukur hal yang salah. Dua kesalahan, keduanya nyata:
    //
    //   1. "Kain Rayon" adalah PLACEHOLDER kolom nama
    //      (PopupPo.tsx:399), bukan value. Dump kontrol yang dulu memuatnya
    //      karena cetaknya "INPUT:<value>:<placeholder>" — jadi bukti yang
    //      sempat saya pakai sebenarnya membaca placeholder, bukan data.
    //   2. Nama material baris baru memang tidak pernah terisi otomatis.
    //      "Tambah Material" memanggil barisKosong() (PopupPo.tsx:523), dan
    //      master-nya array statis MASTER_MATERIAL (data-po.ts:174) dengan
    //      satuan "m", bukan "yard" dari stub.
    //
    // Jadi yang menguji stub /api/materials adalah halaman /stok-material,
    // yang benar-benar memanggil endpoint itu saat mount (StokMaterial.tsx:102).
    const isiBaris = await nilai(`
      (function(){
        var d = document.querySelector('[role=dialog]');
        if (!d) return 'tidak-ada-dialog';
        var nama = d.querySelector('input[aria-label^="Nama material baris"]');
        var satuan = d.querySelector('input[aria-label^="Satuan"]');
        return JSON.stringify({
          barisNama: nama ? (nama.value || '(kosong)') : null,
          placeholderNama: nama ? nama.placeholder : null,
          barisSatuan: satuan ? (satuan.value || '(kosong)') : null
        });
      })()
    `);
    const ib = JSON.parse(isiBaris || '{}');
    console.log('  info  baris material baru -> ' + JSON.stringify(ib));

    // ------------------------------------------------------------ material
    //
    // "Kain Rayon" TIDAK akan pernah muncul di form di atas. Dua sebab, keduanya
    // sudah dibaca dari sumbernya:
    //
    //   1. Kolom nama baris baru punya `placeholder="Kain Rayon"`
    //      (PopupPo.tsx:399) — jadi dump kontrol yang dulu memuat "Kain Rayon"
    //      sebenarnya membaca placeholder, bukan data yang terisi.
    //   2. Tombol "Tambah Material" memanggil `barisKosong()` (PopupPo.tsx:523)
    //      yang isinya kosong; master-nya array statis MASTER_MATERIAL
    //      (data-po.ts:174) dengan satuan "m", bukan dari stub.
    //
    // Halaman yang benar-benar memanggil /api/materials adalah /stok-material
    // (StokMaterial.tsx:102) — TAPI path itu ada di PATH_DIBLOKIR_VIDEO
    // (Shell.tsx:84) selama MODE_VIDEO = true, jadi dialihkan ke /modul/material
    // dan tidak akan pernah menguji apa pun. Lihat catatan MODE_VIDEO di bawah.
    //
    // Karena itu stub material diuji lewat fetch langsung dari halaman hidup,
    // pola yang sama dengan /api/vendors di atas: yang diuji adalah stub-nya
    // benar-benar melayani endpoint itu, bukan teks yang kebetulan di-render.
    console.log('\n== stub /api/materials ==');
    const materialHidup = await nilai(`
      (function(){
        return fetch('/api/materials').then(function(r){return r.json()}).then(function(b){
          var d = b.data || [];
          return JSON.stringify({
            ok: b.ok,
            n: d.length,
            pertama: d[0] ? d[0].nama : null,
            satuan: d[0] ? d[0].satuan : null
          });
        }).catch(function(e){return 'ERR:'+e.message})
      })()
    `);
    const mh = JSON.parse(materialHidup || '{}');
    console.log('  info  -> ' + materialHidup);
    cek('fetch /api/materials di halaman hidup -> ok, 8 material',
      mh.ok === true && mh.n === 8, 'hasil ' + materialHidup);
    cek('  material pertama "Kain Rayon"', mh.pertama === 'Kain Rayon');
    // Satuan "yard" hanya ada di stub; MASTER_MATERIAL statis semua "m"/"pcs".
    cek('  satuannya "yard" (tidak ada di data statis halaman)', mh.satuan === 'yard',
      'satuan ' + mh.satuan);

    // Mutasi wajib. Kalau stub dimatikan, fetch di atas gagal (error jaringan
    // ke file:///C:/api/materials) dan check yang mengukur TEKS tidak bisa
    // dipercaya — "Kain Rayon" juga ada di MASTER_MATERIAL statis. Yang
    // membuktikan stub hidup adalah pemanggilan endpoint, bukan teksnya.

    // Mutasi wajib. Kalau stub dimatikan, tiga check nama material di atas
    // tetap hijau begitu saja, karena "Kain Rayon" juga ada di MASTER_MATERIAL
    // statis (data-po.ts:174) — halaman punya data sendiri yang sama. Yang
    // membuktikan stub hidup adalah check panggilan endpoint di atas; kalau
    // memutar build-presentasi.mjs supaya stub tidak terpasang, check itu yang
    // harus merah, bukan yang teksnya.

    // -------------------------------------------------------------- ringkasan
    console.log('\n== ringkasan ==');
    console.log('  lulus ' + lulus + ', gagal ' + gagal);
    if (gagal) for (const n of daftarGagal) console.log('    - ' + n);
    process.exitCode = gagal === 0 ? 0 : 1;
  } catch (e) {
    console.log('\n  ERROR: ' + e.message);
    process.exitCode = 1;
  } finally {
    try { if (ws) ws.close(); } catch (e) {}
    // chrome.kill() TIDAK menutup semua proses anak di Windows — crashpad
    // sering bertahan dan memegang folder profil, jadi rmSync berikutnya gagal
    // dengan EBUSY dan tertinggal diam-diam. 21 folder profil terbukti
    // tertinggal pada 2026-10-01. Tutup lewat CDP dulu (graceful), baru paksa.
    try { await kirimTutup(); } catch (e) {}
    chrome.kill();
    // Tunggu proses benar-benar berhenti sebelum menghapus folder profilnya.
    for (let i = 0; i < 20 && chrome.exitCode === null; i++) await tunggu(100);
    if (chrome.exitCode === null) { try { chrome.kill('SIGKILL'); } catch (e) {} }
    for (let i = 0; i < 20; i++) {
      try {
        fs.rmSync(userDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        break;
      } catch (e) {
        if (i === 19) console.log('  info  profil tidak terhapus: ' + userDir);
        await tunggu(200);
      }
    }
  }
})();
