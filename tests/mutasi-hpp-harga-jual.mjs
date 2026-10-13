/**
 * Mutation test untuk pemeriksaan smoke "HPP & Harga Jual".
 *
 * Tiap mutasi merusak SATU hal yang seharusnya dijaga smoke test, lalu test
 * dijalankan. Mutasi yang tidak membuat test gagal berarti pemeriksaannya
 * kosong — lulus tanpa memeriksa apa pun.
 *
 * Kenapa ini ada, dan kenapa permanen: kelas kesalahan ini sudah dua kali
 * menimpa halaman-halaman di repo ini — check pertama kali hijau karena
 * memeriksa hal yang salah, bukan karena kodenya benar. Tiket halaman ini
 * mewajibkan tiga mutasi; daftar di bawah lebih panjang karena SETIAP check
 * punya mutasi yang membuktikannya, bukan cuma tiga yang diwajibkan — dan
 * sejak revisi pemilik 2026-10-08 (SKU Produk, section Report, popup
 * perhitungan + riwayat), tiap check baru itu juga punya mutasinya.
 *
 * Bukan test (jest tidak memungutnya: namanya bukan `*.test.js`), jadi ia
 * TIDAK dihapus setelah dipakai — ia alat yang dijalankan ulang tiap kali
 * halaman atau datanya berubah.
 *
 * Jalankan: `node tests/mutasi-hpp-harga-jual.mjs` (dari root repo).
 *
 * Lanjutkan run yang terhenti: `node tests/mutasi-hpp-harga-jual.mjs --dari=20`
 * (mulai dari mutasi ke-20). Pre-check tetap memeriksa SELURUH daftar.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'frontend');

const HALAMAN = path.join(frontend, 'src/pages/HppHargaJual.tsx');
const SHELL = path.join(frontend, 'src/components/Shell.tsx');
const APP = path.join(frontend, 'src/App.tsx');

const MUTASI = [
  // ===== Baris & angkanya =====

  {
    nama: 'HPP White Label yang tertahan diubah null → 0 (keputusan pemilik)',
    berkas: HALAMAN,
    dari: "      sumber: 'White Label',\n      pcs: totalPcs(kartu),\n      hpp: g.hpp,",
    ke: "      sumber: 'White Label',\n      pcs: totalPcs(kartu),\n      hpp: g.hpp ?? 0,",
    // 0 terbaca "produk ini gratis" — justru itu `null` dipertahankan. Enam
    // check harus menangkapnya: konsistensi status, larangan angka nol (data),
    // perbandingan dengan mesin asli, dua lewat markup tabel tertahan
    // (sel "—" hilang, "Rp 0" muncul), dan satu lewat popup kartu tertahan
    // yang ikut berubah jadi "Rp 0".
    //
    // CATATAN soal tiket: tiket meminta check "7 baris Tertahan" ikut gagal di
    // sini, dan itu TIDAK MUNGKIN — status turun dari `bolehLanjut`, bukan dari
    // `hpp`, jadi hpp:0 tidak mengubah jumlah Tertahan (7 tetap 7). Yang gagal
    // adalah pemeriksaan angkanya. Deviasi ini disengaja.
    harusGagal: [
      'konsistensi status/angka',
      'hpp/harga jual 0',
      'angka vs mesin',
      'Rp 0 di tabel tertahan',
      'baris tertahan menampilkan',
      'angka popup tertahan',
    ],
  },
  {
    nama: 'rumus White Label ditukar memakai gerbang Production',
    berkas: HALAMAN,
    dari: "    const g = gerbangHpp(kartu, 'whitelabel', undefined, shipment ?? undefined);",
    ke: "    const g = gerbangHpp(kartu, 'production', kartu.detail.ongkosJahit);",
    // Kartu WL tidak punya ongkos jahit → semuanya tertahan dengan alasan
    // Production. Luna Pants kehilangan angkanya, dan jumlah Terhitung turun.
    harusGagal: ['jumlah Terhitung', 'angka vs mesin', 'Luna Pants', 'alasan tertahan'],
  },
  {
    nama: 'label sumber White Label ditukar jadi "Production"',
    berkas: HALAMAN,
    dari: "      sumber: 'White Label',",
    ke: "      sumber: 'Production',",
    harusGagal: ['urutan White Label', 'label sumber', 'Luna Pants sumber/status'],
  },
  {
    nama: 'urutan baris dibalik — White Label dulu',
    berkas: HALAMAN,
    dari: '  return [...produksi, ...whiteLabel];',
    ke: '  return [...whiteLabel, ...produksi];',
    harusGagal: ['urutan Production', 'urutan White Label'],
  },
  {
    nama: 'daftar kartu White Label dipotong satu',
    berkas: HALAMAN,
    dari: '  const whiteLabel: BarisHarga[] = KARTU_WHITELABEL.map((kartu) => {',
    ke: '  const whiteLabel: BarisHarga[] = KARTU_WHITELABEL.slice(0, 7).map((kartu) => {',
    harusGagal: ['jumlah baris', 'urutan White Label', 'jumlah Tertahan'],
  },
  {
    nama: 'kunci baris Production diseragamkan (id tidak unik)',
    berkas: HALAMAN,
    dari: "      id: kartu.id,\n      produk: kartu.productName,\n      sku: skuProduk(kartu),\n      batch: kartu.batch,\n      kartu,\n      sumber: 'Production',",
    ke: "      id: 'x',\n      produk: kartu.productName,\n      sku: skuProduk(kartu),\n      batch: kartu.batch,\n      kartu,\n      sumber: 'Production',",
    // Baris = kartu, dan kartu yang berbeda wajib punya kunci berbeda —
    // kalau tidak, React memakai satu kunci untuk banyak baris.
    harusGagal: ['id unik'],
  },
  {
    nama: 'pcs Production diisi 0 (bukan dari kartunya)',
    berkas: HALAMAN,
    dari: "      sumber: 'Production',\n      pcs: totalPcs(kartu),",
    ke: "      sumber: 'Production',\n      pcs: 0,",
    harusGagal: ['pcs'],
  },
  {
    nama: 'alasan tertahan dibuang (keterangan selalu null)',
    berkas: HALAMAN,
    dari: '        : g.alasan,\n    };\n  });\n\n  return [...produksi, ...whiteLabel];',
    ke: '        : null,\n    };\n  });\n\n  return [...produksi, ...whiteLabel];',
    // Kartu tertahan tanpa alasan = orang tidak tahu apa yang harus
    // ditindak — dan halaman ini justru ada untuk itu.
    harusGagal: ['alasan tertahan'],
  },
  {
    nama: 'baris terhitung diberi keterangan (keterangan tidak lagi null)',
    berkas: HALAMAN,
    dari: "      status: g.bolehLanjut ? 'Terhitung' : 'Tertahan',\n      keterangan: g.alasan,",
    ke: "      status: g.bolehLanjut ? 'Terhitung' : 'Tertahan',\n      keterangan: g.alasan ?? 'catatan',",
    harusGagal: ['keterangan terhitung'],
  },
  {
    nama: 'status White Label dipatok "Terhitung"',
    berkas: HALAMAN,
    dari: "      status: boleh ? 'Terhitung' : 'Tertahan',",
    ke: "      status: 'Terhitung',",
    harusGagal: ['jumlah Tertahan', 'konsistensi status/angka'],
  },

  // ===== Kolom =====

  {
    nama: 'urutan kolom SKU & Sumber ditukar',
    berkas: HALAMAN,
    dari: "    { key: 'sku', label: 'SKU Produk', value: (r) => r.sku },\n    {\n      key: 'sumber',\n      label: 'Sumber',\n      value: (r) => r.sumber,\n      jenis: 'badge',\n      filterOptions: ['Production', 'White Label'],\n    },",
    ke: "    {\n      key: 'sumber',\n      label: 'Sumber',\n      value: (r) => r.sumber,\n      jenis: 'badge',\n      filterOptions: ['Production', 'White Label'],\n    },\n    { key: 'sku', label: 'SKU Produk', value: (r) => r.sku },",
    harusGagal: ['urutan kolom'],
  },
  {
    nama: 'filter kolom Sumber dikosongkan',
    berkas: HALAMAN,
    dari: "    filterOptions: ['Production', 'White Label'],",
    ke: '    filterOptions: [],',
    harusGagal: ['filterOptions sumber'],
  },
  {
    nama: 'filter kolom Status kehilangan "Tertahan"',
    berkas: HALAMAN,
    dari: "    filterOptions: ['Terhitung', 'Tertahan'],",
    ke: "    filterOptions: ['Terhitung'],",
    harusGagal: ['filterOptions status'],
  },
  {
    nama: 'kolom HPP memakai jenis "angka" (null tidak lagi "—")',
    berkas: HALAMAN,
    dari: "  { key: 'hpp', label: 'HPP / pcs', value: (r) => r.hpp, jenis: 'uang' },",
    ke: "  { key: 'hpp', label: 'HPP / pcs', value: (r) => r.hpp, jenis: 'angka' },",
    harusGagal: ['jenis kolom uang'],
  },
  {
    nama: 'lebar kolom produk tidak lagi dibatasi',
    berkas: HALAMAN,
    dari: "      lebar: 'max-w-44',",
    ke: "      lebar: 'max-w-40',",
    harusGagal: ['lebar kolom'],
  },
  {
    nama: 'warna badge "Terhitung" tidak lagi hijau',
    berkas: HALAMAN,
    dari: "    warna: (r) => (r.status === 'Terhitung' ? 'hijau' : 'kuning'),",
    ke: "    warna: (r) => (r.status === 'Terhitung' ? 'netral' : 'kuning'),",
    harusGagal: ['warna status'],
  },
  {
    nama: 'label field pencarian diubah',
    berkas: HALAMAN,
    dari: "  { label: 'Produk', get: (r) => r.produk },",
    ke: "  { label: 'Nama Produk', get: (r) => r.produk },",
    harusGagal: ['label pencarian'],
  },
  {
    nama: 'field pencarian Produk membaca SKU',
    berkas: HALAMAN,
    dari: "  { label: 'Produk', get: (r) => r.produk },",
    ke: "  { label: 'Produk', get: (r) => r.sku },",
    harusGagal: ['isi pencarian'],
  },

  // ===== Halaman lewat rutenya =====

  {
    nama: 'banner menyebut jumlah kolom yang salah',
    berkas: HALAMAN,
    dari: '      <BannerPratinjau modul="HPP & Harga Jual" jumlahKolom={kolom.length} />',
    ke: '      <BannerPratinjau modul="HPP & Harga Jual" jumlahKolom={7} />',
    harusGagal: ['banner'],
  },
  {
    nama: 'tabel hanya diberi 10 baris (bukan 18)',
    berkas: HALAMAN,
    dari: '        rows={baris}',
    ke: '        rows={baris.slice(0, 10)}',
    // Footer paginasi menampilkan TOTAL baris yang diterima tabel — di sini
    // "of 18" berubah jadi "of 10", dan itulah satu-satunya tempat totalnya
    // terlihat di markup (halaman 1 hanya merender 10 baris pertama).
    harusGagal: ['footer paginasi'],
  },
  {
    nama: 'label kolom "Keterangan" diubah',
    berkas: HALAMAN,
    dari: "  { key: 'keterangan', label: 'Keterangan', value: (r) => r.keterangan, lebar: 'max-w-72' },",
    ke: "  { key: 'keterangan', label: 'Catatan', value: (r) => r.keterangan, lebar: 'max-w-72' },",
    harusGagal: ['header kolom'],
  },
  {
    nama: 'sel HPP selalu bernilai 0',
    berkas: HALAMAN,
    dari: "  { key: 'hpp', label: 'HPP / pcs', value: (r) => r.hpp, jenis: 'uang' },",
    ke: "  { key: 'hpp', label: 'HPP / pcs', value: () => 0, jenis: 'uang' },",
    // Membuktikan check "Rp 0" membaca MARKUP, bukan cuma data: nilai 0 di
    // sel (bukan di `susunBaris`) hanya terlihat lewat render.
    harusGagal: ['Rp 0 di markup'],
  },
  {
    nama: 'route di App.tsx diganti nama',
    berkas: APP,
    dari: '      <Route path="/modul/hpp-harga-jual" element={',
    ke: '      <Route path="/modul/hpp-harga-jual-baru" element={',
    // Halaman jatuh ke fallback "Coming soon..." — rute, banner, footer, dan
    // header kolom harus ikut gagal.
    harusGagal: ['rute', 'banner', 'footer paginasi', 'header kolom'],
    // Breadcrumb TIDAK ikut gagal, dan itu bukan kebetulan: ia dibangun dari
    // URL + daftar menu, bukan dari rute yang cocok. Mengganti nama rute tidak
    // mengubah URL, jadi breadcrumb-nya tetap benar. Asersi ini yang menjaga
    // pembagian itu — kalau suatu saat breadcrumb ikut gagal, berarti ia mulai
    // bergantung pada rute, dan itu perubahan perilaku yang perlu dilihat.
    tidakBolehGagal: ['breadcrumb'],
  },

  // ===== Menu sidebar =====

  {
    nama: 'entri menu HPP & Harga Jual dihapus',
    berkas: SHELL,
    dari: "  {\n    path: '/modul/hpp-harga-jual',\n    label: 'HPP & Harga Jual',\n    // Panah naik, bukan kalkulator: kalkulator sudah dipakai \"HPP\" di\n    // Master Data, dan dua ikon yang sama membuat barisnya sulit dibedakan\n    // saat sidebar dipindai cepat.\n    icon: TrendingUp,\n    section: 'Report',\n  },\n",
    ke: '',
    // Menghapus entri dari `menuReport` (section Report tetap ada, kosong):
    // menu, posisi, label, breadcrumb (item.section hilang), dan jumlah entri
    // (0×, bukan 1×) semuanya harus gagal.
    harusGagal: ['menu', 'section menu', 'label menu', 'breadcrumb', 'entri ganda'],
  },
  {
    nama: 'entri menu disalin ke modulBaru (dua entri)',
    berkas: SHELL,
    dari: "const modulBaru: NavItem[] = [\n  { path: '/modul/material', label: 'Material', icon: Package, section: 'Master Data' },",
    ke: "const modulBaru: NavItem[] = [\n  { path: '/modul/hpp-harga-jual', label: 'HPP & Harga Jual', icon: TrendingUp, section: 'Master Data' },\n  { path: '/modul/material', label: 'Material', icon: Package, section: 'Master Data' },",
    // Salinan di Master Data membuat kemunculan PERTAMA `/modul/hpp-harga-jual`
    // berada sebelum section Report (posisi salah) DAN totalnya 2× — plus
    // breadcrumb membaca salinan itu dan kehilangan induk "Report".
    harusGagal: ['section menu', 'entri ganda', 'breadcrumb'],
  },
  {
    nama: 'section menu dihapus (breadcrumb kehilangan induk)',
    berkas: SHELL,
    dari: "    icon: TrendingUp,\n    section: 'Report',",
    ke: '    icon: TrendingUp,',
    harusGagal: ['breadcrumb'],
  },
  {
    nama: 'section Report dipindah ke atas Progress',
    berkas: SHELL,
    dari: "  {\n    title: 'Progress',\n    items: papanProgress,\n  },\n  {\n    title: 'Report',\n    items: menuReport,\n  },\n];",
    ke: "  {\n    title: 'Report',\n    items: menuReport,\n  },\n  {\n    title: 'Progress',\n    items: papanProgress,\n  },\n];",
    // Urutan section diperiksa, bukan cuma keberadaannya: Report yang muncul
    // di atas Progress berarti laporan ikut ke tengah alur kerja — kebalikan
    // dari keputusan pemilik (paling bawah).
    harusGagal: ['urutan section'],
  },

  // ===== SKU Produk (revisi 2026-10-08) =====

  {
    nama: 'skuProduk() kehilangan prefix "LVU-"',
    berkas: HALAMAN,
    dari: "  return `LVU-${kartu.detail.designCode.replace(/^CSC-/, '')}`;",
    ke: "  return `${kartu.detail.designCode.replace(/^CSC-/, '')}`;",
    harusGagal: ['SKU Elodie', 'SKU Luna', 'SKU semua kartu'],
  },
  {
    nama: 'skuProduk() tidak membuang prefix "CSC-"',
    berkas: HALAMAN,
    dari: "replace(/^CSC-/, '')",
    ke: "replace(/^XX-/, '')",
    // designCode asli berawalan CSC- (diverifikasi lewat data-kanban.ts), jadi
    // tanpa replace ini SKU-nya jadi "LVU-CSC-TOP-17". Check "SKU semua kartu"
    // TIDAK ikut gagal — ia membandingkan baris dengan helper yang sama-sama
    // bermutasi, jadi keduanya sepakat; yang menjaga larangan CSC- adalah
    // check "sisa CSC-".
    harusGagal: ['SKU Elodie', 'SKU Luna', 'sisa CSC- di SKU'],
  },
  {
    nama: 'sepuluh baris Production diberi akhiran varian (skuProduk + "-S")',
    berkas: HALAMAN,
    dari: "      sku: skuProduk(kartu),\n      batch: kartu.batch,\n      kartu,\n      sumber: 'Production',",
    ke: "      sku: `${skuProduk(kartu)}-S`,\n      batch: kartu.batch,\n      kartu,\n      sumber: 'Production',",
    // Check "SKU semua kartu" membandingkan SETIAP baris dengan helper aslinya;
    // Elodie (baris pertama) ikut berubah, jadi dua check SKU gagal sekaligus.
    harusGagal: ['SKU Elodie', 'SKU semua kartu'],
  },
  {
    nama: 'label kolom "SKU Produk" dikembalikan jadi "Workcode"',
    berkas: HALAMAN,
    dari: "    { key: 'sku', label: 'SKU Produk', value: (r) => r.sku },",
    ke: "    { key: 'sku', label: 'Workcode', value: (r) => r.sku },",
    harusGagal: ['label kolom SKU', 'header SKU'],
  },
  {
    nama: 'field pencarian SKU membaca produk',
    berkas: HALAMAN,
    dari: "  { label: 'SKU Produk', get: (r) => r.sku },",
    ke: "  { label: 'SKU Produk', get: (r) => r.produk },",
    harusGagal: ['isi pencarian'],
  },
  {
    nama: 'placeholder pencarian diganti "Cari…" (tidak lagi menyebut SKU)',
    berkas: HALAMAN,
    dari: 'searchPlaceholder="Cari produk atau SKU…"',
    ke: 'searchPlaceholder="Cari…"',
    harusGagal: ['placeholder pencarian'],
  },

  // ===== Popup: perhitungan =====

  {
    nama: 'tombol keyboard produk kehilangan aria-label',
    berkas: HALAMAN,
    dari: '          aria-label={`Buka detail HPP ${r.produk}`}\n',
    ke: '',
    harusGagal: ['tombol keyboard produk'],
  },
  {
    nama: 'pill SKU di header popup dihapus',
    berkas: HALAMAN,
    dari: '          <Badge variant="outline" className="font-mono">\n            {baris.sku}\n          </Badge>',
    ke: '',
    harusGagal: ['header popup'],
  },
  {
    nama: 'batch di header popup dipatok "B-00"',
    berkas: HALAMAN,
    dari: '            Batch <span className="font-medium text-foreground">{baris.batch}</span>',
    ke: '            Batch <span className="font-medium text-foreground">B-00</span>',
    // Kartu pertama (Elodie) memang B-00, jadi check header Elodie tetap lolos —
    // yang menangkapnya check header Luna, yang membandingkan dengan batch
    // baris Luna sendiri (B-01).
    harusGagal: ['batch/pcs popup Luna'],
  },
  {
    nama: 'stat HPP popup dipatok 1 (bukan dari barisnya)',
    berkas: HALAMAN,
    dari: "{hpp === null ? '—' : rupiah(hpp)}",
    ke: "{hpp === null ? '—' : rupiah(1)}",
    harusGagal: ['stat box Elodie'],
  },
  {
    nama: 'stat total biaya popup dipatok 1',
    berkas: HALAMAN,
    dari: "{totalBiaya === null ? '—' : rupiah(totalBiaya)}",
    ke: "{totalBiaya === null ? '—' : rupiah(1)}",
    harusGagal: ['stat box Elodie'],
  },
  {
    nama: 'label margin harga jual dipatok 2,5 (lepas dari MARGIN_HARGA_JUAL)',
    berkas: HALAMAN,
    dari: "HPP × {String(MARGIN_HARGA_JUAL).replace('.', ',')}",
    ke: 'HPP × 2,5',
    // Label yang lepas dari konstanta akan berbohong begitu margin global
    // berubah — check "label margin" menahannya.
    harusGagal: ['label margin'],
  },
  {
    nama: 'garis bagi Production membulatkan (rupiah, bukan rupiahPresisi)',
    berkas: HALAMAN,
    dari: 'kanan={`${rupiah(hasil.totalBiaya)} ÷ ${hasil.jumlahPcsJadi} = ${rupiahPresisi(hpp)}`}',
    ke: 'kanan={`${rupiah(hasil.totalBiaya)} ÷ ${hasil.jumlahPcsJadi} = ${rupiah(hpp)}`}',
    harusGagal: ['garis bagi Elodie'],
  },
  {
    nama: 'garis bagi Production memakai pcs yang salah (bukan pcs jadi)',
    berkas: HALAMAN,
    dari: 'kanan={`${rupiah(hasil.totalBiaya)} ÷ ${hasil.jumlahPcsJadi} = ${rupiahPresisi(hpp)}`}',
    ke: 'kanan={`${rupiah(hasil.totalBiaya)} ÷ ${hasil.jumlahPcsJadi + 1} = ${rupiahPresisi(hpp)}`}',
    // Yang diperiksa check "isi garis bagi Elodie" adalah KANAN-nya
    // ("16.225.520 ÷ 145"): pcs jadi diganti angka lain harus ketahuan dari
    // sana. Kiri-nya tetap benar, jadi check "garis bagi Elodie" (yang mencari
    // "Rp 111.900,14") tidak ikut gagal.
    harusGagal: ['isi garis bagi Elodie'],
  },
  {
    nama: 'kolom "Harga FIFO" tabel perhitungan diubah',
    berkas: HALAMAN,
    dari: '<TableHead className="text-right">Harga FIFO</TableHead>',
    ke: '<TableHead className="text-right">Harga</TableHead>',
    harusGagal: ['tabel perhitungan'],
  },
  {
    nama: 'label total tabel perhitungan diganti (ongkos jahit hilang dari judul)',
    berkas: HALAMAN,
    dari: 'Total biaya bahan + ongkos jahit',
    ke: 'Total',
    harusGagal: ['tabel perhitungan'],
  },

  // ===== Popup: White Label =====

  {
    nama: 'lookup shipment popup diabaikan (selalu tanpa shipment)',
    berkas: HALAMAN,
    dari: '    baris.sumber === \'White Label\' ? barisShipmentUntuk(baris.kartu, barisContoh).baris : null;',
    ke: "    baris.sumber === 'White Label' ? null : null;",
    harusGagal: ['shipment WL', 'komponen WL', 'garis bagi WL'],
  },
  {
    nama: 'sel pembelian produk WL memakai ongkos kirim',
    berkas: HALAMAN,
    dari: '              {rupiah(shipment.actualIdrPaidProduct)}\n',
    ke: '              {rupiah(shipment.actualIdrPaidLogistic)}\n',
    // Angka pembelian produk (5.200.000) hilang dari popup — check "komponen
    // WL" mencari KEDUA angka, jadi yang satu ini ketahuan. Check "garis bagi
    // WL" tidak ikut gagal: total di garis bagi dihitung dari `shipment`,
    // bukan dari sel yang dimutasi.
    harusGagal: ['komponen WL'],
  },
  {
    nama: 'baris kode shipment/vendor di bawah tabel WL dihapus',
    berkas: HALAMAN,
    dari: 'Shipment {shipment.codeShipment} · {shipment.namaSupplier}',
    ke: 'Shipment',
    harusGagal: ['shipment WL'],
  },

  // ===== Popup: riwayat =====

  {
    nama: 'entri riwayat Elodie B-00 dihapus',
    berkas: HALAMAN,
    dari: "    { batch: 'B-00', tanggal: '26 May 2026', pcs: 145, hpp: 111900.14, hargaJual: 268560.34 },\n",
    ke: '',
    // Menghapus entri "ini" (batch kartu Elodie): tanda "ini" hilang, jumlah
    // entri di label tab turun jadi 3, dan check delta (yang menunggu 3 delta)
    // ikut gagal karena pembandingnya hilang.
    harusGagal: ['riwayat Elodie', 'tanda ini', 'label tab', 'delta riwayat'],
  },
  {
    nama: 'tanda "ini" dibandingkan dengan SKU, bukan batch',
    berkas: HALAMAN,
    dari: '        const ini = e.batch === batch;',
    ke: '        const ini = e.batch === sku;',
    harusGagal: ['tanda ini'],
  },
  {
    nama: 'badge delta dihapus dari baris riwayat',
    berkas: HALAMAN,
    dari: '{formatDelta(e.hpp, sebelumnya)}',
    ke: '{sebelumnya === null ? \'—\' : \'—\'}',
    harusGagal: ['delta riwayat', 'delta Luna'],
  },
  {
    nama: 'label tab riwayat tidak lagi membawa jumlah entri',
    berkas: HALAMAN,
    dari: '<TabsTrigger value="riwayat">Riwayat HPP ({riwayat.length})</TabsTrigger>',
    ke: '<TabsTrigger value="riwayat">Riwayat HPP</TabsTrigger>',
    harusGagal: ['label tab', 'label tab Luna'],
  },
  {
    nama: 'empty state riwayat dibuang (daftar kosong tanpa penjelasan)',
    berkas: HALAMAN,
    dari: '        Belum ada riwayat HPP untuk SKU ini.',
    ke: '        ',
    harusGagal: ['empty state riwayat'],
  },
  {
    nama: 'riwayat Luna B-02 diubah (delta tidak lagi +2,0%)',
    berkas: HALAMAN,
    dari: "    { batch: 'B-02', tanggal: '12 Mar 2026', pcs: 50, hpp: 129400, hargaJual: 310560 },",
    ke: "    { batch: 'B-02', tanggal: '12 Mar 2026', pcs: 50, hpp: 129500, hargaJual: 310560 },",
    // Check "delta Luna" ikut menghitung ulang dari riwayat yang SAMA, jadi
    // ia tetap konsisten dan TIDAK gagal — yang menangkapnya check literal
    // "+2,0%": angka mockup-nya dipatok, bukan sekadar dihitung ulang.
    harusGagal: ['delta literal Luna'],
  },
  {
    nama: 'formatDelta membalik tanda (turun terbaca naik)',
    berkas: HALAMAN,
    dari: "  const tanda = persen < 0 ? '−' : '+';",
    ke: "  const tanda = persen < 0 ? '+' : '−';",
    // Dua check delta lama dihitung ulang lewat formatDelta yang SAMA dengan
    // halaman, jadi keduanya tetap "konsisten" saat tandanya dibalik. Yang
    // gagal cuma check literal — dan itu tepat gunanya dipatok.
    harusGagal: ['delta literal Elodie', 'delta literal Luna'],
  },
  {
    nama: 'formatDelta memakai titik desimal (bukan koma)',
    berkas: HALAMAN,
    dari: ".toFixed(1).replace('.', ',')",
    ke: '.toFixed(1)',
    harusGagal: ['delta literal Elodie', 'delta literal Luna'],
  },

  // ===== Popup: kartu tertahan =====

  {
    nama: 'alasan tertahan di popup dibuang (teks selalu kosong)',
    berkas: HALAMAN,
    dari: "      <p>{teks ?? 'HPP belum bisa dihitung.'}</p>",
    ke: '      <p></p>',
    harusGagal: ['alasan di popup tertahan'],
  },
];

// `--dari=N` (1-based) menjalankan hanya mutasi ke-N dan seterusnya — untuk
// melanjutkan run yang terhenti. Di mesin ini harness pernah di-kill sistem
// saat memory kritis: TerminateProcess melewati blok `finally`, jadi berkas
// yang sedang dimutasi ditinggal rusak dan harus dipulihkan dulu
// (.scratch/hpp-restore.ps1) sebelum run berikutnya. Pre-check di bawah tetap
// memeriksa SELURUH daftar, bukan hanya irisan yang dijalankan.
const argDari = process.argv.find((a) => a.startsWith('--dari='));
const nomorDari = argDari ? Number(argDari.slice('--dari='.length)) : 1;
if (!Number.isInteger(nomorDari) || nomorDari < 1 || nomorDari > MUTASI.length) {
  console.log(
    `Nilai --dari tidak sah: ${argDari ?? '(kosong)'} — pakai --dari=N, N = 1..${MUTASI.length}.`
  );
  process.exit(1);
}
const mulaiDari = nomorDari - 1;

/**
 * Cari `dari` di berkas, toleran terhadap CRLF/LF, dan kembalikan posisinya di
 * koordinat berkas ASLI (mulai dan akhir).
 *
 * Pola di daftar mutasi ditulis dengan LF, jadi pencariannya harus di versi LF —
 * kalau tidak, pola multi-baris tidak pernah ketemu. Pemetaan baliknya dibangun
 * dengan MENYUSURI berkas aslinya, bukan aritmetika yang mengasumsikan akhiran
 * baris seragam: satu berkas boleh CRLF dan tetangganya LF. Kesalahan di sini
 * pernah membuat berkas hasil mutasi rusak sintaks, bundel SSR gagal dibangun,
 * dan test keluar non-zero tanpa satu pun baris GAGAL — harness-nya membaca itu
 * sebagai "mutasi tertangkap" padahal pemeriksaannya tidak pernah jalan.
 */
function cari(isi, dari) {
  const lf = isi.replace(/\r\n/g, '\n');
  const mulaiLf = lf.indexOf(dari);
  if (mulaiLf < 0) return null;

  const peta = [];
  let i = 0;
  while (i < isi.length) {
    if (isi[i] === '\r' && isi[i + 1] === '\n') {
      peta.push(i);
      i += 2;
    } else {
      peta.push(i);
      i += 1;
    }
  }
  peta.push(isi.length);

  const akhirLf = mulaiLf + dari.length;
  return { mulai: peta[mulaiLf], akhir: peta[akhirLf] };
}

const jalankan = () => {
  try {
    execFileSync(process.execPath, [path.join(root, 'tests/smoke-hpp-harga-jual.mjs')], {
      cwd: frontend,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return { kode: 0, keluaran: '' };
  } catch (e) {
    return { kode: e.status ?? 1, keluaran: String(e.stdout || '') + String(e.stderr || '') };
  }
};

// Pre-check SEMUA pola sebelum menjalankan mutasi satu pun. Dua hal yang
// dicegah, dua-duanya sudah pernah terjadi di repo ini:
//
//   1. Pola yang basi (berkasnya sudah berubah) — tanpa ini baru ketahuan
//      setelah puluhan build, dan setiap mutasi "LEWAT" adalah satu putaran
//      yang tidak membuktikan apa pun.
//   2. Pola yang TIDAK UNIK — `cari()` mengambil kemunculan pertama, jadi pola
//      yang muncul dua kali bisa memutasi lokasi yang salah: berkasnya rusak
//      di tempat lain, test gagal karena sebab yang berbeda, dan hasilnya
//      terbaca "mutasi tertangkap" padahal bukan pemeriksaan itu yang gagal.
{
  const masalah = [];
  for (const m of MUTASI) {
    const asli = readFileSync(m.berkas, 'utf8');
    const lf = asli.replace(/\r\n/g, '\n');
    let n = 0;
    for (let i = lf.indexOf(m.dari); i >= 0; i = lf.indexOf(m.dari, i + 1)) n += 1;
    if (n === 0) masalah.push(`  - ${m.nama} (${path.basename(m.berkas)}) — pola tidak ditemukan`);
    else if (n > 1)
      masalah.push(`  - ${m.nama} (${path.basename(m.berkas)}) — pola muncul ${n}×, tidak unik`);
  }
  if (masalah.length) {
    console.log('DAFTAR MUTASI BERMASALAH — perbaiki dulu sebelum menjalankan:');
    console.log(masalah.join('\n'));
    process.exit(1);
  }
  console.log(`Pre-check: ${MUTASI.length} pola mutasi ada dan unik.`);

  // Coverage: SETIAP label `salah(...)` di smoke test harus bisa dipicu oleh
  // minimal satu mutasi. Check yang tidak terpetakan ke mutasi mana pun adalah
  // check yang tidak pernah dibuktikan — persis kelas kesalahan yang tiket ini
  // ada untuk mencegahnya. Dijalankan di sini (bukan saat iterasi) supaya
  // check yang lupa dimutasi ketahuan sebelum puluhan build berjalan.
  const isiSmoke = readFileSync(path.join(root, 'tests/smoke-hpp-harga-jual.mjs'), 'utf8');
  // `\s*` wajib: separuh pemanggilan `salah()` menaruh labelnya di baris
  // berikutnya (`salah(\n      'urutan Production',`). Tanpa itu, check-check
  // itu terlihat "tidak ada" dan coverage-nya lolos karena alasan yang salah.
  const labelSmoke = [...isiSmoke.matchAll(/salah\(\s*'([^']+)'/g)].map((x) => x[1]);
  const semuaHarusGagal = MUTASI.flatMap((m) => m.harusGagal);
  const takTercakup = labelSmoke.filter(
    (label) => !semuaHarusGagal.some((h) => label.includes(h))
  );
  if (takTercakup.length) {
    console.log('CHECK TANPA MUTASI — tambahkan mutasi untuk label berikut:');
    for (const l of takTercakup) console.log(`  - ${l}`);
    process.exit(1);
  }
  console.log(`Pre-check: ${labelSmoke.length} label check punya mutasi yang membuktikannya.\n`);
}

const dasar = jalankan();
console.log(`BASELINE: exit=${dasar.kode} (harus 0)\n`);
if (dasar.kode !== 0) {
  console.log(dasar.keluaran.slice(-3000));
  process.exit(1);
}

if (mulaiDari > 0) {
  console.log(
    `Melanjutkan dari mutasi ${nomorDari} — ${MUTASI.length - mulaiDari} mutasi akan dijalankan.\n`
  );
}

let semuaTertangkap = true;
for (const m of MUTASI.slice(mulaiDari)) {
  const asli = readFileSync(m.berkas, 'utf8');
  const pos = cari(asli, m.dari);
  if (!pos) {
    console.log(`LEWAT  ${m.nama} — pola tidak ditemukan di ${path.basename(m.berkas)}`);
    semuaTertangkap = false;
    continue;
  }

  // Restore WAJIB di `finally`: kalau tidak, proses yang mati di tengah
  // meninggalkan berkas termutasi dan run berikutnya melaporkan baseline
  // gagal — yang terlihat seperti masalah test padahal berkasnya rusak.
  let hasil;
  try {
    writeFileSync(m.berkas, asli.slice(0, pos.mulai) + m.ke + asli.slice(pos.akhir), 'utf8');
    hasil = jalankan();
  } finally {
    writeFileSync(m.berkas, asli, 'utf8');
  }

  if (hasil.kode === 0) {
    console.log(`TIDAK KETANGKAP  ${m.nama} — test tetap LULUS`);
    semuaTertangkap = false;
    continue;
  }

  // Label yang dilaporkan `salah()` adalah argumen pertamanya, bukan teks OK.
  const gagal = [...hasil.keluaran.matchAll(/^  GAGAL (.+?) —/gm)].map((x) => x[1]);

  // Keluar non-zero TANPA satu pun baris GAGAL berarti testnya tidak sampai ke
  // bagian pemeriksaan — mis. bundel SSR gagal dibangun karena berkas hasil
  // mutasinya rusak sintaks. Itu BUKAN mutasi tertangkap.
  if (gagal.length === 0) {
    console.log(`TIDAK SAH  ${m.nama} — test gagal tanpa satu pun pemeriksaan jalan`);
    console.log(
      `          keluaran mentah (ekor):\n${hasil.keluaran
        .trim()
        .split('\n')
        .slice(-12)
        .map((l) => `            ${l}`)
        .join('\n')}`
    );
    semuaTertangkap = false;
    continue;
  }

  const ketemu = m.harusGagal.filter((h) => gagal.some((g) => g.includes(h)));
  // Asersi negatif: check yang TIDAK boleh ikut gagal. Lihat catatan pada
  // mutasi rename rute — tanpa ini, mutasi yang seharusnya hanya memicu satu
  // pemeriksaan bisa "lulus" karena pemeriksaan lain ikut runtuh, dan yang
  // terbukti bukan yang dimaksud.
  const bocor = (m.tidakBolehGagal ?? []).filter((h) => gagal.some((g) => g.includes(h)));
  const lengkap = ketemu.length === m.harusGagal.length && bocor.length === 0;
  if (!lengkap) semuaTertangkap = false;
  console.log(`${lengkap ? 'KETANGKAP' : 'SEBAGIAN'}  ${m.nama}`);
  console.log(`          gagal: ${gagal.join(' | ')}`);
  if (bocor.length) console.log(`          BOCOR (tidak seharusnya gagal): ${bocor.join(' | ')}`);
  if (ketemu.length !== m.harusGagal.length) {
    const kurang = m.harusGagal.filter((h) => !gagal.some((g) => g.includes(h)));
    console.log(`          KURANG (tidak ikut gagal): ${kurang.join(' | ')}`);
  }
}

const rentang = mulaiDari > 0 ? ` (${nomorDari}–${MUTASI.length})` : '';
console.log(
  semuaTertangkap ? `\nSEMUA MUTASI${rentang} KETANGKAP` : `\nADA MUTASI${rentang} YANG LOLOS`
);
process.exit(semuaTertangkap ? 0 : 1);
