/**
 * Mutation runner for the Ticket 5 (invoice-logistic / invoice-product /
 * upload) checks in the smoke test.
 *
 * Every mutation below breaks ONE thing in the app code and asserts the smoke
 * test reports at least one GAGAL. A mutation that leaves the suite green means
 * the corresponding check is not actually testing anything — it passes for a
 * reason unrelated to the code it claims to cover.
 *
 * Run: node tests/zz-mutate-ticket5.mjs
 * It restores every file it touched, including on crash.
 */
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = 'C:/Users/livou/inventory-app';
const POPUP = ROOT + '/frontend/src/pages/production-fulfillment/PopupKartu.tsx';
const DATA = ROOT + '/frontend/src/pages/production-fulfillment/data-kanban.ts';

const asli = new Map();
for (const f of [POPUP, DATA]) asli.set(f, readFileSync(f, 'utf8'));

const pulihkan = () => {
  for (const [f, isi] of asli) writeFileSync(f, isi);
};
process.on('exit', pulihkan);

// [label, file, find, replace]
const MUTASI = [
  // -- Routing: tiga cabang baru.
  //
  // M1-M3 mematikan satu cabang masing-masing. Kalau routing-nya benar-benar
  // diuji lewat IsiPopup, mematikan satu cabang membuat popup tahap itu jatuh
  // ke SeksiBelumAda — dan pemeriksaan "menampilkan seksinya" harus GAGAL.
  [
    'M1 routing invoice-logistic dimatikan',
    POPUP,
    "const bisaInvoiceLogistic = stageId === 'invoice-logistic';",
    'const bisaInvoiceLogistic = false;',
  ],
  [
    'M2 routing invoice-product dimatikan',
    POPUP,
    "const bisaInvoiceProduct = stageId === 'invoice-product';",
    'const bisaInvoiceProduct = false;',
  ],
  [
    'M3 routing upload dimatikan',
    POPUP,
    "const bisaUpload = stageId === 'upload';",
    'const bisaUpload = false;',
  ],
  // M4: routing dibiarkan, tapi salah pasang — 'upload' merender seksi Invoice
  // Product. Ini yang tidak tertangkap oleh "seksinya tampil", karena sesuatu
  // memang tampil. Yang menangkapnya adalah pemeriksaan judul tertukar.
  [
    'M4 routing upload memakai seksi invoice-product',
    POPUP,
    '{bisaUpload && (\n        <SeksiUpload',
    '{bisaUpload && (\n        <SeksiInvoiceProduct',
  ],

  // -- Dua jalur Invoice Product.
  //
  // M5: jalur diabaikan, kedua kotak dirender. Persis yang dilarang owner.
  // M6: pemetaan jalurnya ditukar — livou_transfer meminta bukti reimburse.
  [
    'M5 jenisBuktiTahap: selalu kembalikan kedua jalur',
    DATA,
    'return jalur ? [...JENIS_BUKTI_INVOICE_PRODUCT, jalur] : JENIS_BUKTI_INVOICE_PRODUCT;',
    'return [...JENIS_BUKTI_INVOICE_PRODUCT, ...JENIS_BUKTI_FLOW];',
  ],
  [
    'M6 JENIS_BUKTI_FLOW: id kedua jalur ditukar',
    DATA,
    "    value: 'livou_transfer',\n    id: 'proofPaymentProduct',",
    "    value: 'livou_transfer',\n    id: 'proofReimburse',",
  ],
  // M7: tanpa jalur, diam-diam dianggap livou_transfer.
  [
    'M7 jenisBuktiTahap: tanpa jalur dianggap livou_transfer',
    DATA,
    'return jalur ? [...JENIS_BUKTI_INVOICE_PRODUCT, jalur] : JENIS_BUKTI_INVOICE_PRODUCT;',
    "return jalur ? [...JENIS_BUKTI_INVOICE_PRODUCT, jalur] : [...JENIS_BUKTI_INVOICE_PRODUCT, JENIS_BUKTI_FLOW[0]];",
  ],

  // -- Upload: angka, bukan berkas.
  [
    'M8 input jumlah upload jadi kotak berkas',
    POPUP,
    '              type="number"\n              min={0}',
    '              type="file"\n              min={0}',
  ],
  [
    'M9 label jumlah upload kehilangan satuan pcs',
    POPUP,
    'label="Jumlah Upload POS (pcs)"',
    'label="Jumlah Upload POS"',
  ],
  // M10: pembanding plan dihapus dari layar. Angka jumlah upload tetap benar,
  // tapi "98" sendirian tidak memberi tahu apa pun.
  [
    'M10 pembanding plan pcs dihapus',
    POPUP,
    'Plan kartu ini{\' \'}\n              {rencana} pcs.',
    '—',
  ],
  // M11: 0 disamakan dengan kosong.
  [
    'M11 jumlahUploadPos: 0 dianggap belum diisi',
    POPUP,
    'const terisi = jumlah !== undefined;',
    'const terisi = jumlah !== undefined && jumlah > 0;',
  ],

  // -- Terkunci total.
  //
  // M12: kunci tidak diteruskan ke SeksiInvoiceLogistic — input tetap hidup.
  // M13: kunci diteruskan, tapi KotakBukti tidak menerimanya — tombol unggah
  // dan hapus tetap ada pada kartu yang sudah lewat.
  [
    'M12 terkunci invoice-logistic tidak diteruskan',
    POPUP,
    "          terkunci={tahapLewat('invoice-logistic')}",
    '          terkunci={false}',
  ],
  [
    'M13 KotakBukti tidak menerima terkunci di SeksiInvoiceLogistic',
    POPUP,
    '            sudahAda={(bukti[j.id]?.length ?? 0) > 0}\n            berkas={bukti[j.id] ?? []}\n            terkunci={terkunci}\n            aksi={aksi}\n            kartu={kartu}\n          />\n        ))}\n      </div>\n\n      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">\n        <div className="min-w-[240px] flex-1 space-y-1">\n          <div className="text-xs font-medium">Kelengkapan stage ini</div>\n          <p className="text-xs text-muted-foreground">\n            {terkunci\n              ? \'Data ini sudah lewat tahapnya dan tidak bisa diubah lagi.\'\n              : bolehLanjut\n                ? `Invoice logistic lengkap',
    '            sudahAda={(bukti[j.id]?.length ?? 0) > 0}\n            berkas={bukti[j.id] ?? []}\n            terkunci={false}\n            aksi={aksi}\n            kartu={kartu}\n          />\n        ))}\n      </div>\n\n      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">\n        <div className="min-w-[240px] flex-1 space-y-1">\n          <div className="text-xs font-medium">Kelengkapan stage ini</div>\n          <p className="text-xs text-muted-foreground">\n            {terkunci\n              ? \'Data ini sudah lewat tahapnya dan tidak bisa diubah lagi.\'\n              : bolehLanjut\n                ? `Invoice logistic lengkap',
  ],
  // M14: tombol Lanjut tetap dirender saat terkunci.
  [
    'M14 tombol Lanjut tidak disembunyikan saat terkunci',
    POPUP,
    '        {!terkunci && (\n          <Button disabled={!bolehLanjut} onClick={() => aksi?.lanjutStage(kartu)}>\n            Lanjut ke {tujuan?.label ?? \'stage berikutnya\'}\n          </Button>\n        )}\n      </div>\n    </section>\n  );\n}\n\nfunction SeksiInvoiceProduct({',
    '        {(\n          <Button disabled={!bolehLanjut} onClick={() => aksi?.lanjutStage(kartu)}>\n            Lanjut ke {tujuan?.label ?? \'stage berikutnya\'}\n          </Button>\n        )}\n      </div>\n    </section>\n  );\n}\n\nfunction SeksiInvoiceProduct({',
  ],
  // M15: gerbang dibuka tanpa isian — tombol Lanjut hidup di kartu kosong.
  [
    'M15 gerbang invoice-logistic selalu terbuka',
    POPUP,
    '  const bolehLanjut = kurang.length === 0;\n\n  return (\n    <section className="space-y-3">\n      <JudulSeksi\n        judul="Invoice Logistic"',
    '  const bolehLanjut = true;\n\n  return (\n    <section className="space-y-3">\n      <JudulSeksi\n        judul="Invoice Logistic"',
  ],
  // M16: daftar kekurangan tidak lagi ditulis — pemilik tidak tahu apa yang
  // kurang, tapi gerbangnya tetap benar.
  [
    'M16 daftar kekurangan tidak ditulis namanya',
    POPUP,
    ': `Belum lengkap: ${kurang.join(\', \')}.`}\n          </p>\n        </div>\n        {!terkunci && (\n          <Button disabled={!bolehLanjut} onClick={() => aksi?.lanjutStage(kartu)}>\n            Lanjut ke {tujuan?.label ?? \'stage berikutnya\'}\n          </Button>\n        )}\n      </div>\n    </section>\n  );\n}\n\nfunction SeksiInvoiceProduct({',
    ': `Belum lengkap.`}\n          </p>\n        </div>\n        {!terkunci && (\n          <Button disabled={!bolehLanjut} onClick={() => aksi?.lanjutStage(kartu)}>\n            Lanjut ke {tujuan?.label ?? \'stage berikutnya\'}\n          </Button>\n        )}\n      </div>\n    </section>\n  );\n}\n\nfunction SeksiInvoiceProduct({',
  ],
  // M17: label tujuan dipatok "stage berikutnya" — kalimat yang benar secara
  // tata bahasa dan tidak berguna.
  [
    'M17 label tujuan invoice-logistic pakai kalimat cadangan',
    POPUP,
    '            Lanjut ke {tujuan?.label ?? \'stage berikutnya\'}\n          </Button>\n        )}\n      </div>\n    </section>\n  );\n}\n\nfunction SeksiInvoiceProduct({',
    '            Lanjut ke {\'stage berikutnya\'}\n          </Button>\n        )}\n      </div>\n    </section>\n  );\n}\n\nfunction SeksiInvoiceProduct({',
  ],

  // -- Papan: invoice-logistic tidak boleh ada di papan Production.
  //
  // M18 menambahkannya ke papan PRODUCTION. Ankornya menyertakan baris
  // 'cutting' di atasnya, karena blok stage kedua papan itu isinya nyaris
  // identik — tanpa pembeda itu, `replace` akan mengenai papan White Label,
  // yang justru MEMANG punya kolom tersebut, dan mutasinya tidak mengubah apa
  // pun yang diperiksa.
  [
    'M18 invoice-logistic ditambahkan ke papan Production',
    DATA,
    "  { id: 'cutting', label: 'Cutting', warna: 'bg-violet-500' },\n  { id: 'receive', label: 'Receive', warna: 'bg-blue-500' },",
    "  { id: 'cutting', label: 'Cutting', warna: 'bg-violet-500' },\n  { id: 'invoice-logistic', label: 'Invoice Logistic', warna: 'bg-cyan-500' },\n  { id: 'receive', label: 'Receive', warna: 'bg-blue-500' },",
  ],
];

let tertangkap = 0;
const lolos = [];

// Mode cepat: hanya memeriksa bahwa tiap anchor DITEMUKAN TEPAT SEKALI.
//
// `String.replace` dengan string akan mengganti kemunculan PERTAMA, jadi
// anchor yang cocok dua kali akan memutasi baris yang salah — dan mutasinya
// bisa tetap "tertangkap" karena kebetulan memutus hal lain. Itu sudah
// kejadian di repo ini. Jalankan `--check` setiap kali anchor diubah, sebelum
// menghabiskan waktu menjalankan suite belasan kali.
if (process.argv.includes('--check')) {
  let masalah = 0;
  for (const [label, file, cari] of MUTASI) {
    const isi = asli.get(file);
    const n = isi.split(cari).length - 1;
    if (n !== 1) {
      masalah++;
      console.log(`MASALAH ${label}\n        ditemukan ${n} kali di ${file.split('/').pop()} (harus 1)`);
    }
  }
  console.log('');
  console.log(
    masalah === 0
      ? `OK: ${MUTASI.length} anchor semuanya ditemukan tepat sekali.`
      : `GAGAL: ${masalah} anchor bermasalah dari ${MUTASI.length}.`
  );
  process.exit(masalah === 0 ? 0 : 1);
}

for (const [label, file, cari, ganti] of MUTASI) {
  const isi = asli.get(file);
  if (!isi.includes(cari)) {
    console.log(`LEWAT  ${label}\n       TARGET TIDAK DITEMUKAN di ${file.split('/').pop()}`);
    lolos.push(label + ' (target tidak ditemukan)');
    continue;
  }
  writeFileSync(file, isi.replace(cari, ganti));

  let gagal = '';
  try {
    const out = execFileSync('node', ['tests/smoke-kanban-fulfillment.mjs'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    void out;
  } catch (e) {
    // Non-zero exit means at least one GAGAL — that is what we want.
    gagal = (e.stdout || '') + (e.stderr || '');
  }

  // Yang dihitung BUKAN cuma "ada GAGAL". Mutasi yang membuat berkas modul
  // melempar error juga membuktikan pemeriksaan terkait bekerja — dan itulah
  // yang bisa lolos kalau harness hanya mencari kata "GAGAL".
  //
  // Syarat "hijau sejati" sengaja dibuat ketat: harus ada LULUS di output.
  // Suite yang mati tidak pernah mencetak kata itu.
  const adaGagal = /GAGAL/.test(gagal);
  const crash = /(TypeError|ReferenceError|SyntaxError|RangeError):/.test(gagal);
  const hijauSejati = /LULUS/.test(gagal) && !adaGagal && !crash;

  if (hijauSejati) {
    console.log(`LEWAT  ${label} — smoke test tetap hijau`);
    lolos.push(label);
  } else if (crash) {
    tertangkap++;
    const pesan = (gagal.match(/^\w*(?:Type|Reference|Syntax|Range)Error:.*$/m) || [
      '(tanpa pesan)',
    ])[0];
    console.log(`TANGKAP ${label}\n        suite MATI: ${pesan.slice(0, 160)}`);
  } else if (adaGagal) {
    tertangkap++;
    const ringkas = (gagal.match(/GAGAL .*/g) || []).slice(0, 3).join(' | ');
    console.log(`TANGKAP ${label}\n        ${ringkas.slice(0, 200)}`);
  } else {
    tertangkap++;
    console.log(
      `TANGKAP ${label}\n        suite berhenti tanpa LULUS/GAGAL — output ${gagal.length} karakter, TIDAK trustworthy`
    );
  }
  pulihkan();
}

console.log('');
console.log(`Tertangkap: ${tertangkap}/${MUTASI.length}`);
if (lolos.length) {
  console.log('LOLOS (check tidak efektif):');
  for (const l of lolos) console.log('  - ' + l);
  process.exit(1);
}
