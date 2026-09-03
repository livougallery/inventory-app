/**
 * Mutation test untuk tiket 09 — memastikan test benar-benar menguji sesuatu.
 *
 * Cara: rusak implementasi sedikit demi sedikit, jalankan test tiket 09, lalu
 * catat apakah ada test yang mati. Test yang tetap hijau setelah implementasi
 * dirusak berarti tidak menguji apa pun.
 *
 * Cara pakai:
 *   node tests/mutate-ticket09.js
 *
 * Menilai dari BARIS RINGKASAN jest, bukan exit code — lihat catatan di
 * `jalankan()`. File ini bukan test (namanya bukan *.test.js), jadi tidak
 * dipungut jest. Ia mengembalikan isi file seperti semula setelah tiap mutan.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

const MUTAN = [
  {
    nama: 'negara tidak diurutkan alfabetis (tanpa ORDER BY)',
    file: 'routes/purchase-imports.js',
    dari: "db.query('SELECT id, nama FROM negara ORDER BY nama')",
    menjadi: "db.query('SELECT id, nama FROM negara')",
  },
  {
    // Ini bahaya utama yang dicegah tiket: mengisi otomatis negara pertama
    // akan diam-diam mengarang asal pembelian.
    // \r?\n, bukan \n: routes/purchase-imports.js memakai baris baru CRLF
    // (terlihat dari peringatan "LF will be replaced by CRLF" saat commit).
    // Regex dengan \n polos tidak pernah cocok, mutan tidak diterapkan, dan
    // hasilnya salah terbaca sebagai "test lolos".
    nama: 'negara kosong diisi fallback ke negara pertama',
    file: 'routes/purchase-imports.js',
    pola: /    return \{ ok: true, negaraId: null \};\r?\n  \}\r?\n  const id = Number\(raw\);/,
    menjadi: `    const pertama = await db.one('SELECT id FROM negara ORDER BY id LIMIT 1');
    return { ok: true, negaraId: pertama ? pertama.id : null };
  }
  const id = Number(raw);`,
  },
  {
    nama: 'negara_id tidak divalidasi terhadap tabel negara',
    file: 'routes/purchase-imports.js',
    pola: /  const ada = await db\.one\([^\r\n]*negara[^\r\n]*\[id\]\);\r?\n  if \(!ada\) \{/,
    menjadi: `  const ada = true;
  if (!ada) {`,
  },
  {
    nama: 'negara_id tidak disimpan saat create',
    file: 'routes/purchase-imports.js',
    dari: '     req.session.userId, parsed.negaraId]);',
    menjadi: "     req.session.userId, NULL]);",
  },
  {
    nama: 'negara_id tidak disimpan saat edit',
    file: 'routes/purchase-imports.js',
    dari: `     parsed.negaraId, id]);`,
    menjadi: `     NULL, id]);`,
  },
  {
    // Dua kemunculan (daftar dan detail); ganti keduanya.
    nama: 'join nama negara dihapus dari daftar & detail',
    file: 'routes/purchase-imports.js',
    dari: 'n.nama as negara_nama',
    menjadi: 'NULL as negara_nama',
    gantiSemua: true,
  },
  {
    // Menampilkan "null" mentah adalah yang secara eksplisit dilarang AC.
    nama: 'tanpa negara ditampilkan sebagai string null',
    file: 'views/purchase-imports/index.ejs',
    dari: `<td class="p-3"><%= i.negara_nama || '—' %></td>`,
    menjadi: `<td class="p-3"><%= i.negara_nama %></td>`,
  },
  {
    nama: 'detail tanpa negara ditampilkan sebagai string null',
    file: 'views/purchase-imports/show.ejs',
    dari: `<strong><%= imp.negara_nama || '—' %></strong>`,
    menjadi: `<strong><%= imp.negara_nama %></strong>`,
  },
  {
    // Penjaga ini mencegah HPP yang sudah dipakai divergen dari datanya.
    // Penjaga ini mencegah HPP yang sudah dipakai divergen dari datanya.
    // Regex, bukan teks persis: mutan sebelumnya gagal diterapkan karena
    // indentasi di sumber berbeda, dan itu akan salah dibaca sebagai
    // "test lolos" walau sebenarnya mutannya tidak pernah dijalankan.
    nama: 'penjaga status dihilangkan pada GET edit',
    file: 'routes/purchase-imports.js',
    pola: /if \(imp\.status !== 'pending'\) \{\s*return res\.redirect\('\/purchase-imports\/' \+ imp\.id \+ '\?error=' \+[\s\S]*?imp\.status\)\);\s*\}/,
    menjadi: 'if (false) { /* mutan */ }',
  },
  {
    nama: 'HPP ikut dihitung dari negara (harusnya tidak)',
    file: 'routes/purchase-imports.js',
    dari: 'return (parseFloat(hargaProduk) * parseFloat(kurs || 1)) + (parseFloat(logistik || 0) / parseInt(qty));',
    menjadi: 'return (parseFloat(hargaProduk) * parseFloat(kurs || 1)) + (parseFloat(logistik || 0) / parseInt(qty)) + 1;',
  },
  {
    nama: 'daftar negara dikosongkan di view create',
    file: 'routes/purchase-imports.js',
    pola: /const \{ products, vendors, negara \} = await opsiForm\(\);\s*\n(\s*)res\.render\('purchase-imports\/create'/,
    menjadi: "const { products, vendors, negara } = await opsiForm();\n$1negara.length = 0;\n$1res.render('purchase-imports/create'",
  },
];

// Menilai dari KELUARAN, bukan exit code. Jest bisa gagal dijalankan
// (argumen salah, npx tidak ketemu) dengan exit code bukan nol, yang akan
// salah dibaca sebagai "mutan mati" padahal testnya tidak pernah jalan.
//
// Perhatikan: baris ringkasan HANYA menyebut "failed" kalau ada yang gagal.
// Ketidakterdapatannya justru tanda lulus.
const jalankan = () => {
  const isWin = process.platform === 'win32';
  const r = spawnSync(
    isWin ? 'npx.cmd' : 'npx',
    ['jest', 'tests/purchaseImportsNegara.test.js'],
    { cwd: ROOT, encoding: 'utf8', shell: isWin }
  );
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const m = out.match(/Tests:\s+(.*)$/m);
  if (!m) {
    console.error('  [PERINGATAN] jest tidak menghasilkan ringkasan:');
    console.error(out.slice(-400));
    return null;
  }
  return m[1].match(/(\d+)\s+failed/) ? false : true;   // true = hijau
};

const main = () => {
  console.log('Menjalankan baseline (kode asli)…');
  const baseline = jalankan();
  console.log(`Baseline: ${baseline === null ? 'TIDAK TERBACA' : baseline ? 'HIJAU' : 'MERAH'}\n`);
  if (baseline !== true) {
    console.error('Baseline tidak hijau — hentikan, mutasi tidak bisa dinilai.');
    process.exit(1);
  }

  const hasil = [];
  for (const m of MUTAN) {
    const p = path.join(ROOT, m.file);
    const asli = fs.readFileSync(p, 'utf8');

    // Mutan boleh berupa teks persis (`dari`) atau regex (`pola`). Regex
    // dipakai kalau teksnya rentan berubah indentasi — kalau mutan gagal
    // diterapkan, hasilnya dibaca "test lolos" padahal tidak pernah
    // diuji, dan itu lebih berbahaya dari tidak punya mutan sama sekali.
    let rusak;
    let berlaku;
    if (m.pola) {
      const re = new RegExp(m.pola.source, m.pola.flags);
      berlaku = re.test(asli);
      rusak = asli.replace(re, m.menjadi);
    } else {
      berlaku = asli.includes(m.dari);
      rusak = m.gantiSemua
        ? asli.split(m.dari).join(m.menjadi)
        : asli.replace(m.dari, m.menjadi);
    }

    if (!berlaku || rusak === asli) {
      hasil.push({ ...m, status: 'MUTAN TIDAK DITERAPKAN' });
      continue;
    }

    fs.writeFileSync(p, rusak, 'utf8');
    const hijau = jalankan();
    fs.writeFileSync(p, asli, 'utf8');   // pulihkan
    if (fs.readFileSync(p, 'utf8') !== asli) {
      console.error(`GAGAL memulihkan ${m.file} — hentikan.`);
      process.exit(1);
    }
    hasil.push({
      ...m,
      status: hijau === null ? 'TIDAK TERBACA' : hijau ? 'LOLOS (test lemah!)' : 'mati (bagus)',
    });
  }

  console.log('=== Hasil mutasi ===');
  for (const h of hasil) console.log(`${h.status.padEnd(22)} ${h.nama}`);
  const lemah = hasil.filter((h) => !h.status.startsWith('mati'));
  console.log(`\n${hasil.length - lemah.length}/${hasil.length} mutan mati.`);
  if (lemah.length > 0) process.exit(1);
};

main();
