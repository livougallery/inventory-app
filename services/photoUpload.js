// Upload foto — satu aturan untuk nota PO (tiket 11c) dan foto material
// (tiket 11d).
//
// Dipakai dua fitur sekaligus, jadi sengaja jadi satu modul. Validasi tipe,
// batas ukuran, dan penamaan berkas tidak boleh punya dua versi — kalau satu
// fitur memperbolehkan PDF dan yang lain tidak, pengguna akan melaporkannya
// sebagai bug di salah satu halaman, dan tidak ada yang bisa menjelaskan mana
// yang benar.
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Direktori penyimpanan. Bisa diganti lewat env supaya test bisa menulis ke
// tempat sementara, bukan ke uploads/ yang sesungguhnya.
//
// Dibaca sekali saat modul dimuat — sengaja, supaya seluruh hidup proses
// memakai direktori yang sama. Mengubahnya di tengah jalan akan membuat
// sebagian foto ditulis ke satu tempat dan sebagian lagi ke tempat lain,
// sementara isi database hanya mencatat namanya.
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

// 5 MB. Cukup untuk foto nota dari kamera ponsel, kecil untuk mencegah satu
// unggahan menghabiskan kuota disk.
const UKURAN_MAKS = 5 * 1024 * 1024;

// Ekstensi yang diterima. Diperiksa terpisah dari MIME type karena MIME dikirim
// klien dan bisa dipalsukan: berkas .exe yang dikirim dengan header
// image/jpeg akan lolos kalau cuma MIME yang diperiksa.
const EKSTENSI_VALID = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// Tipe MIME yang diterima, sejajar dengan EKSTENSI_VALID di atas.
const MIME_VALID = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Dibuat saat modul dimuat, bukan saat upload pertama. Kalau tidak, unggahan
// pertama di mesin baru (atau setelah direktori dibersihkan) akan gagal —
// kegagalan yang sulit dilacak karena hanya terjadi sekali.
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Nama berkas yang aman: prefiks jenis + cap waktu + acak + ekstensi.
//
// Nama asli dari klien TIDAK pernah dipakai, dengan dua alasan. Pertama, ia
// bisa berisi "../" dan dengan itu klien menentukan sendiri di mana berkasnya
// ditulis. Kedua, dua PO bisa sama-sama mengunggah "nota.jpg" dan yang kedua
// akan menimpa foto yang pertama — lalu satu PO kehilangan fotonya tanpa
// penjelasan.
//
// Cap waktu dan bagian acak digabung, bukan cuma cap waktu: dua unggahan dalam
// milidetik yang sama tetap harus menghasilkan nama berbeda.
const buatNamaBerkas = (jenis, namaAsli) => {
  const ekstensi = path.extname(String(namaAsli || '')).toLowerCase();
  const aman = EKSTENSI_VALID.has(ekstensi) ? ekstensi : '.bin';
  // Bagian acak pendek — cukup untuk menghindari tabrakan, tidak dimaksudkan
  // sebagai pengaman kriptografis. Yang mencegah penyalahgunaan adalah
  // ekstensinya yang sudah divalidasi, bukan kerahasiaan namanya.
  const acak = Math.random().toString(36).slice(2, 10);
  return `${jenis}-${Date.now()}-${acak}${aman}`;
};

// Penyaring tipe berkas.
//
// Diekspos terpisah supaya bisa diuji langsung. Lewat middleware multer pun
// ia akan dijalankan, tetapi hanya kalau permintaan benar-benar multipart —
// mengujinya lewat situ berarti setiap kasus uji harus membuat permintaan
// multipart yang sah, padahal yang ingin diuji cuma aturan tipe berkasnya.
//
// filter dipanggil dengan Error, BUKAN cb(null, false).
//
// Ini beda dari routes/products.js, yang memakai cb(null, ...). Dengan
// cb(null, false), multer menolak berkasnya secara diam-diam: req.file menjadi
// undefined dan endpoint melihatnya sebagai "tidak ada berkas dikirim".
// Pengguna hanya melihat formulir yang tidak pernah terkirim tanpa pesan apa
// pun. Mengirim error membuat alasannya bisa ditampilkan ke pengguna.
const filterBerkas = (req, file, cb) => {
  const ekstensi = path.extname(file.originalname || '').toLowerCase();
  if (!MIME_VALID.has(file.mimetype) || !EKSTENSI_VALID.has(ekstensi)) {
    return cb(new Error('Berkas harus berupa gambar JPEG, PNG, atau WEBP.'));
  }
  cb(null, true);
};

// Menghasilkan middleware multer untuk satu berkas.
//
// `jenis` ('po' atau 'material') jadi prefiks nama berkas.
const buatUploadFoto = (jenis) =>
  multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, UPLOAD_DIR),
      filename: (req, file, cb) => cb(null, buatNamaBerkas(jenis, file.originalname)),
    }),
    limits: { fileSize: UKURAN_MAKS },
    fileFilter: filterBerkas,
  });

// Menghapus berkas foto. Tidak pernah melempar.
//
// Dipanggil saat PO atau material dihapus. Menghapus berkas adalah pekerjaan
// bersih-bersih, bukan bagian dari operasi utama — gagal menghapus berkas yang
// sudah tidak ada tidak boleh membuat penghapusan PO gagal, dan tidak boleh
// menjawab 500 hanya karena berkasnya ternyata sudah hilang.
const hapusBerkas = async (namaBerkas) => {
  if (!namaBerkas) return;

  // Penjaga jalan keluar direktori. Isi kolom file_path berasal dari database,
  // dan kalau suatu saat berisi "../", menghapusnya akan mengenai berkas di
  // luar direktori upload. path.basename membuang semua komponen direktori.
  const aman = path.basename(String(namaBerkas));
  if (aman !== String(namaBerkas)) return; // ada komponen direktori → ditolak
  if (!aman || aman === '.' || aman === '..') return;

  await fs.promises.unlink(path.join(UPLOAD_DIR, aman)).catch(() => {
    // Gagal diabaikan dengan sengaja: berkas yang sudah tidak ada, atau
    // tanpa hak tulis, tidak boleh membatalkan penghapusan datanya.
  });
};

// Penanganan error multer untuk dipasang sebagai middleware Express.
//
// Diekspos dari sini, bukan ditulis di tiap route, karena dipakai dua fitur
// (nota PO dan foto material) dan keduanya harus menjawab dengan cara yang
// sama. Ditulis terpisah akan membuat satu fitur menjawab 400 dengan pesan
// jelas sementara yang lain menjawab 500 — dan pengguna yang menemukannya
// akan melaporkannya sebagai bug di salah satu halaman.
//
// Tanpa penanganan khusus, multer MELEMPAR dan Express menjawab 500. Padahal
// berkas kebesaran atau bukan gambar adalah kesalahan PENGGUNA, bukan
// kegagalan server: 500 membuatnya tercatat sebagai insiden dan tidak memberi
// tahu pengguna apa yang salah.
//
// Harus dipasang SETELAH middleware multer. Express memilih penangan error
// dari jumlah argumennya (empat), dan ia menangkap error dari middleware
// SEBELUMNYA dalam rantai yang sama — jadi multer harus mendahuluinya.
const tanganiErrorUpload = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const mb = Math.round(UKURAN_MAKS / (1024 * 1024));
      return res.status(400).json({
        ok: false,
        error: `Ukuran berkas terlalu besar. Maksimal ${mb} MB.`,
      });
    }
    return res.status(400).json({ ok: false, error: `Berkas tidak valid: ${err.message}` });
  }
  // Pesan dari filterBerkas sudah ditulis untuk pengguna, jadi diteruskan apa
  // adanya, bukan diganti pesan generik.
  if (err) return res.status(400).json({ ok: false, error: err.message });
  next();
};

module.exports = {
  UPLOAD_DIR,
  UKURAN_MAKS,
  EKSTENSI_VALID,
  filterBerkas,
  buatNamaBerkas,
  buatUploadFoto,
  hapusBerkas,
  tanganiErrorUpload,
};
