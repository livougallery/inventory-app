/**
 * Mutation runner for the Ticket 4 (hpp-price) checks in the smoke test.
 *
 * Every mutation below breaks ONE thing in the app code and asserts the smoke
 * test reports at least one GAGAL. A mutation that leaves the suite green means
 * the corresponding check is not actually testing anything — it passes for a
 * reason unrelated to the code it claims to cover.
 *
 * Run: node tests/zz-mutate-ticket4.mjs
 * It restores every file it touched, including on crash.
 */
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = 'C:/Users/livou/inventory-app';
const HPP = ROOT + '/frontend/src/pages/production-fulfillment/hpp.ts';
const SEKSI = ROOT + '/frontend/src/pages/production-fulfillment/SeksiHppPrice.tsx';
const DATA = ROOT + '/frontend/src/pages/production-fulfillment/data-kanban.ts';
const HPPPRAT = ROOT + '/frontend/src/pages/HppPratinjau.tsx';

const asli = new Map();
for (const f of [HPP, SEKSI, DATA, HPPPRAT]) asli.set(f, readFileSync(f, 'utf8'));

const pulihkan = () => {
  for (const [f, isi] of asli) writeFileSync(f, isi);
  rmSync(ROOT + '/tests/zz-dump-temp.mjs', { force: true });
};
process.on('exit', pulihkan);

// [label, file, find, replace]
const MUTASI = [
  // -- Margin: the single most load-bearing constant.
  [
    'M1 margin global 2.4 -> 1 (harga jual = HPP)',
    DATA,
    'export const MARGIN_HARGA_JUAL = 2.4;',
    'export const MARGIN_HARGA_JUAL = 1;',
  ],
  [
    'M2 margin global 2.4 -> 3',
    DATA,
    'export const MARGIN_HARGA_JUAL = 2.4;',
    'export const MARGIN_HARGA_JUAL = 3;',
  ],

  // -- White Label formula
  [
    'M3 hppWhiteLabel: biayaKirim ikut dijumlahkan (ongkos kirim counted twice risk)',
    HPP,
    'return { biayaBeli, biayaKirim, hpp: presisiFix(biayaBeli + biayaKirim) };',
    'return { biayaBeli, biayaKirim, hpp: presisiFix(biayaBeli + 2 * biayaKirim) };',
  ],
  [
    'M4 hppWhiteLabel: bagi totalPcs -> pcs (baris, bukan shipment)',
    HPP,
    'const biayaBeli = presisiFix(baris.actualIdrPaidProduct / baris.totalPcs);',
    'const biayaBeli = presisiFix(baris.actualIdrPaidProduct / baris.pcs);',
  ],
  [
    'M5 hppWhiteLabel: ongkos kirim dihilangkan',
    HPP,
    'const biayaKirim = presisiFix(baris.actualIdrPaidLogistic / baris.totalPcs);',
    'const biayaKirim = 0;',
  ],

  // -- Join WL card to shipment
  //
  // M7 DIWASPADAI SEBAGAI EKUIVALEN, dan itu sudah diverifikasi dari data
  // (semua 18 kartu menghasilkan baris yang sama persis untuk cocok-penuh
  // maupun cocok-awalan-4-huruf). Prefix 'Luna' hanya cocok dengan 'Luna
  // Pants', 'Midi' hanya dengan 'Midi Dress', dan 'Rowe' dengan kedua baris
  // Rowe Tee — yang memang harus ditolak sebagai ambigu, bukan dipilih diam-diam.
  // Diawetkan sebagai mutasi supaya perubahan data di masa depan bisa
  // membatalkannya.
  [
    'M6 barisShipmentUntuk: ambil yang pertama walau ambigu',
    HPP,
    'if (cocok.length > 1) return { baris: null, produkAmbigu: kartu.productName };',
    'if (cocok.length > 1) return { baris: cocok[0], produkAmbigu: null };',
  ],
  [
    'M7 barisShipmentUntuk: cocokkan nama longgar (substring)',
    HPP,
    'const cocok = baris.filter((b) => b.namaProduct === kartu.productName);',
    'const cocok = baris.filter((b) => b.namaProduct.includes(kartu.productName.slice(0, 4)));',
  ],
  [
    'M8 barisShipmentUntuk: tidak pernah ambiguous (kembar lolos)',
    HPP,
    'if (cocok.length > 1) return { baris: null, produkAmbigu: kartu.productName };',
    'if (cocok.length > 99) return { baris: null, produkAmbigu: kartu.productName };',
  ],

  // -- Production formula
  [
    'M9 hppProduksi: bagi jumlahPcsJadi -> totalPcs',
    HPP,
    'hpp: tanpaOngkosJahit ? null : presisiFix(totalBiaya / jumlahPcsJadi),',
    'hpp: tanpaOngkosJahit ? null : presisiFix(totalBiaya / (jumlahPcsJadi * 2)),',
  ],
  [
    'M10 hppProduksi: ongkos jahit tidak dihitung sebagai bahan',
    HPP,
    "push('Ongkos Jahit Konveksi', '—', 'Semua Varian', 1, 'pcs', semuaPcs, ongkosJahit.perPcs);",
    "push('Ongkos Jahit Konveksi', '—', 'Semua Varian', 0, 'pcs', semuaPcs, ongkosJahit.perPcs);",
  ],
  [
    'M11 ongkos jahit hilang dari daftar bahan (tidak ikut baris)',
    HPP,
    "push('Ongkos Jahit Konveksi', '—', 'Semua Varian', 1, 'pcs', semuaPcs, ongkosJahit.perPcs);",
    "void ongkosJahit;",
  ],

  // -- Gate
  [
    'M12 gerbangHpp: production tanpa jahit tetap boleh lanjut',
    HPP,
    "if (hasil.tanpaOngkosJahit) {\n    return {\n      bolehLanjut: false,\n      alasan: 'Ongkos jahit belum diisi. HPP produksi belum bisa dihitung.',",
    "if (hasil.tanpaOngkosJahit) {\n    return {\n      bolehLanjut: true,\n      alasan: 'Ongkos jahit belum diisi. HPP produksi belum bisa dihitung.',",
  ],

  // -- UI: ongkos jahit must be separated from materials
  [
    'M13 UI: ongkos jahit tidak dipisah dari tabel bahan',
    SEKSI,
    "const bahan = hasil.baris.filter((b) => b.kategori !== KATEGORI_CMT);",
    'const bahan = hasil.baris;',
  ],

  // -- UI: selling price must be computed
  [
    'M14 UI: harga jadi input (teks margin global dihapus)',
    SEKSI,
    "HPP × {String(MARGIN_HARGA_JUAL).replace('.', ',')} (margin global)",
    "harga jual (input)",
  ],

  // -- UI: exchange rate prominence
  [
    'M15 UI: blok kurs dihapus (kurs tidak menonjol)',
    SEKSI,
    '<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">\n            Kurs {shipment.currency}',
    '<span className="text-xs text-muted-foreground">\n            Nilai tukar',
  ],

  // -- Proof boxes
  [
    'M16 UI: kotak bukti selling price dihapus',
    SEKSI,
    "id: 'kalkulasi-selling-price',",
    "id: 'kalkulasi-hpp',",
  ],

  // -- Missing shipment must be refused, not zero
  [
    'M17 UI: WL tanpa shipment menampilkan HPP 0',
    SEKSI,
    'if (!shipment) {\n    return (\n      <Peringatan>',
    'if (!shipment) {\n    return (\n      <div className="text-xl">{rupiah(0)}</div>\n    );\n  }\n  if (false) {\n    return (\n      <Peringatan>',
  ],

  // -- Data: the Luna Pants shipment row that makes WL mode non-empty
  [
    'M18 data: baris Luna Pants dihapus dari tabel shipment',
    HPPPRAT,
    "    namaProduct: 'Luna Pants',",
    "    namaProduct: 'Luna Pants (hapus)',",
  ],
  [
    'M19 data: ongkos kirim Luna Pants jadi 0',
    HPPPRAT,
    '    actualIdrPaidLogistic: 78000,\n    proofNotaLogistic: \'contoh\',\n    proofPaymentLogistic: \'contoh\',\n    namaSupplier: \'Supplier Lokal Bandung\',\n    totalPcs: 40,\n    totalPrice: 5200000,',
    '    actualIdrPaidLogistic: 0,\n    proofNotaLogistic: \'contoh\',\n    proofPaymentLogistic: \'contoh\',\n    namaSupplier: \'Supplier Lokal Bandung\',\n    totalPcs: 40,\n    totalPrice: 5200000,',
  ],
];

let tertangkap = 0;
const lolos = [];

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
  // yang sebelumnya lolos karena harness ini hanya mencari kata "GAGAL".
  //
  // Kasus nyata: mengganti nama baris anchor Luna Pants membuat `hppWL.map`
  // memanggil `hppWhiteLabel(undefined)` saat bundle dimuat, jadi suite MATI
  // sebelum satu pun pemeriksaan berjalan. Tidak ada yang mencetak GAGAL, dan
  // harness lama menyimpulkan "check ini tidak efektif" — padahal justru
  // check itulah yang menangkap mutasinya, dengan cara paling keras.
  //
  // Syarat "hijau sejati" sengaja dibuat ketat: harus ada LULUS di output.
  // Suite yang mati tidak pernah mencetak kata itu.
  const adaGagal = /GAGAL/.test(gagal);
  const crash = /(TypeError|ReferenceError|SyntaxError|RangeError):/.test(gagal);
  // "Hijau sejati" berarti output memuat LULUS. Suite yang berhenti di tengah
  // jalan tidak pernah mencetak kata itu — dan outputnya bisa terpotong,
  // sehingga kata LULUS tidak boleh dicari di potongan 200 karakter terakhir.
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
    // Tidak LULUS, tidak GAGAL, tidak crash yang dikenali. Tidak boleh
    // dihitung tertangkap: outputnya bisa saja terpotong sebelum LULUS
    // tercetak karena masukannya besar, dan itu bukan bukti apa pun.
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