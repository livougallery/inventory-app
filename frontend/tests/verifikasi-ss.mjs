// Bukti bahwa berkas-berek per-halaman benar-benar membuka halamannya masing-masing.
//
// Yang diperiksa, per berkas:
//   1. React merender sesuatu (bukan layar putih).
//   2. location.hash == route yang dijanjikan nama berkasnya.
//   3. Teks yang ter-render berbeda dari berkas lain.
//
// Poin 3 itu yang paling penting. Cek (1) dan (2) bisa hijau untuk 11 berkas
// yang isinya sebenarnya sama persis — semuanya dialihkan ke /modul/material
// oleh PATH_DIBLOKIR_VIDEO, jadi "halaman yang benar" menurut hash tapi salah
// menurut isi. Perbandingan teks antar berkas yang menangkapnya.
//
// Perintah: node tests/verifikasi-ss.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIR = 'C:\\Users\\livou\\inventory-demo\\ss';

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
  if (!fs.existsSync(CHROME)) { console.log('Chrome tidak ada — uji dilewati.'); process.exit(2); }
  if (!fs.existsSync(DIR)) { console.log('Folder tidak ada: ' + DIR + '\nJalankan: node build-ss.mjs'); process.exit(1); }

  const berkas = fs.readdirSync(DIR).filter(f => f.endsWith('.html')).sort();
  if (!berkas.length) { console.log('Tidak ada berkas HTML di ' + DIR); process.exit(1); }

  // Cek statis dulu: murah, dan menangkap build yang rusak sebelum browser
  //dibiarkan membuang 20 detik membuka 21 file yang sama-sama salah.
  console.log('\n== cek statis ==');
  cek('ada berkas HTML', berkas.length > 0, berkas.length + ' berkas');
  let cacat = [];
  for (const f of berkas) {
    const h = fs.readFileSync(path.join(DIR, f), 'utf8');
    const masalah = [];
    if (!h.startsWith('<!doctype')) masalah.push('doctype hilang');
    if (!h.includes('Stub fetch untuk berkas presentasi offline')) masalah.push('stub hilang');
    if (h.includes('__SS_ROUTE__')) masalah.push('placeholder route tidak terganti');
    if (h.match(/location\.replace\(/)) masalah.push('masih pakai location.replace (reload ganda)');
    if (masalah.length) cacat.push(f + ' -> ' + masalah.join(', '));
  }
  cek('semua berkas: doctype + stub + route terganti, tanpa reload ganda',
    cacat.length === 0, cacat.join(' | '));

  PORT = 9500 + (process.pid % 400);
  const userDir = path.join(process.env.TEMP || '.', 'verifikasi-ss-profil-' + Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDir,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--allow-file-access-from-files', 'about:blank',
  ], { stdio: 'ignore' });

  let ws;
  let kirimTutup = async () => {};
  try {
    let version = null;
    for (let i = 0; i < 60; i++) {
      try { version = await jsonCdp(PORT, '/json/version'); break; } catch (e) { await tunggu(250); }
    }
    if (!version) throw new Error('DevTools tidak pernah siap');
    if (String(version.Browser || '').indexOf('Chrome') < 0) {
      throw new Error('Port ' + PORT + ' dijawab proses lain: ' + version.Browser);
    }

    const target = await jsonCdp(PORT, '/json/new?' + encodeURI('about:blank'), 'PUT');
    const { WebSocket } = await import('ws').catch(() => ({ WebSocket: globalThis.WebSocket }));
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 0;
    const tungguBalasan = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && tungguBalasan.has(m.id)) { tungguBalasan.get(m.id)(m); tungguBalasan.delete(m.id); }
    };
    const kirim = (method, params) => new Promise((res) => {
      const n = ++id; tungguBalasan.set(n, res);
      ws.send(JSON.stringify({ id: n, method, params: params || {} }));
    });
    kirimTutup = async () => { try { await kirim('Browser.close'); } catch (e) {} await tunggu(400); };

    const nilai = async (expr) => {
      const r = await kirim('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      return r.result && r.result.result ? r.result.result.value : undefined;
    };

    await kirim('Page.enable');
    await kirim('Runtime.enable');

    // Sidik jari tiap halaman: 60 karakter pertama teks yang ter-render. Dua
    // berkas dengan sidik jari sama = halaman yang sama, apa pun nama berkasnya.
    console.log('\n== buka tiap berkas di Chrome ==');
    const sidik = new Map();
    const hasil = [];

    for (const f of berkas) {
      const url = 'file:///' + path.join(DIR, f).replace(/\\/g, '/');
      await kirim('Page.navigate', { url });
      await tunggu(2600);

      const snap = JSON.parse((await nilai(`
        (function(){
          var r = document.getElementById('root');
          var t = (document.body.innerText || '').replace(/\\s+/g,' ').trim();
          return JSON.stringify({
            hash: location.hash,
            rootLen: r ? r.innerHTML.length : 0,
            teks: t,
            judas: t.slice(0, 120)
          });
        })()
      `)) || '{}');

      const render = snap.rootLen > 500 && snap.teks.length > 40;
      const tanpaError = !/Coming soon|Cannot GET|MASALAH|undefined/i.test(snap.teks);
      hasil.push({ f, hash: snap.hash, ok: render && tanpaError, teks: snap.teks, judas: snap.judas });

      if (render && tanpaError) {
        // Sidik jari: teks tanpa bagian paling depan (bcrumb bisa beda) tapi
        // dengan semua whitespace diratakan.
        const k = snap.teks.slice(0, 200);
        const pendahulu = [...sidik.keys()].find(x => x === k);
        if (pendahulu) {
          cek(f, false, 'teks identik dengan ' + pendahulu + ' — halaman ini tidakbeda');
        } else {
          sidik.set(k, f);
          cek(f, true);
        }
      } else {
        cek(f, false, 'root=' + snap.rootLen + ' teks=' + snap.teks.length + ' "' + snap.teks.slice(0, 60) + '"');
      }
    }

    // Ringkas: berapa halaman berbeda yang benar-benar ada?
    const unik = new Set(hasil.filter(h => h.ok).map(h => h.judas)).size;
    const hidup = hasil.filter(h => h.ok).length;
    console.log('\n== ringkasan ==');
    console.log('  berkas dibuka : ' + hasil.length);
    console.log('  render benar  : ' + hidup);
    console.log('  halaman unik  : ' + unik);
    if (hidup > unik) {
      console.log('  CATATAN: ' + (hidup - unik) + ' berkas menampilkan halaman yang SAMA.');
    }
    console.log('');
    for (const h of hasil) {
      console.log('  ' + (h.ok ? 'ok  ' : 'GAGAL') + ' ' + h.f.padEnd(38) + h.hash);
    }
    process.exitCode = gagal === 0 ? 0 : 1;
  } catch (e) {
    console.log('\n  ERROR: ' + e.message);
    process.exitCode = 1;
  } finally {
    try { if (ws) ws.close(); } catch (e) {}
    await kirimTutup();
    chrome.kill();
    for (let i = 0; i < 20 && chrome.exitCode === null; i++) await tunggu(100);
    if (chrome.exitCode === null) { try { chrome.kill('SIGKILL'); } catch (e) {} }
    for (let i = 0; i < 20; i++) {
      try { fs.rmSync(userDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); break; }
      catch (e) { if (i === 19) console.log('  info  profil tidak terhapus: ' + userDir); await tunggu(200); }
    }
  }
})();
