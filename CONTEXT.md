# Inventory App

Aplikasi gudang dan produksi untuk Livou Group: material masuk, produksi, HPP, sampai
barang jadi siap dijual. Glosarium ini menetapkan istilah mana yang dipakai supaya
percakapan, tiket, dan nama di kode tidak bercabang.

## Language

### Fulfillment

**Production Fulfillment**:
Perjalanan satu pekerjaan produksi dari usulan sampai divalidasi finance, dibagi menjadi
beberapa stage.
_Avoid_: alur produksi, workflow PDFF

**Workcode PDFF**:
Penanda unik satu pekerjaan fulfillment, gabungan SKU design, batch, dan kode sumber
produksi. Satu workcode boleh punya banyak varian warna/ukuran. Bentuknya
`PDFF_LVU-<desain>_B-<batch>_<sumber>`; suffix_sourcesnya yang terakhir.
_Avoid_: kode produksi, no. batch

**Sumber Produksi**:
Penanda asal barang, dibaca dari suffix workcode — `PRDN` untuk yang dibuat sendiri,
`WHLB` untuk yang dibeli utuh dari vendor luar negeri. Menentukan rumus HPP kartu, tapi
**bukan** penentunya: kartu tahu papannya sendiri, dan workcode hanya dipakai sebagai
pengecek. Kalau workcode dan papan bertentangan, papannya yang menang.
_Avoid_: kategori produk, jenis produksi

**Kartu**:
Satu workcode yang sedang berada di satu stage. Satu kartu boleh berisi banyak varian.
_Avoid_: item, task, tiket

**Stage**:
Satu tahap dalam perjalanan fulfillment. Satu kartu berada di tepat satu stage pada satu
waktu, dan hanya bisa pindah ke stage berikutnya di papan yang sama.
_Avoid_: kolom, status, tahap

**Stage Production**: Propose → Prepare → Cutting → Receive → Invoice Product → HPP & Price → Upload → Finance Validate.

**Stage White Label**: Propose → Invoice Logistic → Receive → Invoice Product → HPP & Price → Upload → Finance Validate.

**Terkunci**:
Setelah kartu pindah ke stage berikutnya, isinya tidak bisa diubah lagi — termasuk
bukti (PDF, foto), tanpa pengecualian. Kartu tidak pernah mundur ke stage sebelumnya;
yang bisa dilakukan hanya menyelesaikantemuan sampai kartu boleh lanjut.
_Avoid_: editable, belum final

**Finance Validate**:
Stage penutup, sekali jalan. Kalau angkanya tidak cocok, kartu **tetap tinggal di sini**
— tidak ada jalan mundur. Stage ini menampilkan daftar temuan apa yang tidak cocok,
supaya nyangkutnya kelihatan dan bukan diam saja. Kartu baru boleh lanjut setelah
temuannya ditutup.
_Avoid_: approval finance, validasi final

**White Label**:
Produk yang dibeli utuh dari vendor luar negeri, bukan dipotong dan dijahit sendiri.
Papan White Label tidak punya Cutting, karena tidak ada pemotongan di sini.
_Avoid_: beli jadi, import

### Cutting

**Cutting**:
Pemotongan kain oleh vendor menjadi potongan siap jahit. Hanya ada di papan Production.
_Avoid_: potong, gunting

**Cutting Total Pcs**:
Jumlah potongan yang benar-benar dihasilkan cutting, dicatat per varian lalu dijumlah
menjadi satu angka untuk seluruh workcode.

**Bukti Cutting**:
Foto-foto hasil pemotongan dari vendor. Boleh lebih dari satu per kartu.

**Register Cutting PDF**:
Berkas PDF dari sistem lain yang mencatat hasil cutting. Diunggah apa adanya dan dibuka
di tab baru; app ini tidak membuatnya sendiri.

### Receive

**Receive**:
Stage tempat barang yang datang dari vendor dicatat masuk. Satu kartu boleh menerima
barang berkali-kali sebelum selesai.
_Avoid_: terima stock, penerimaan barang

**Kedatangan**:
Satu peristiwa barang tiba, dengan satu tanggal dan satu surat jalan. Satu workcode boleh
punya banyak kedatangan. Inilah yang dihitung kolom "Kedatangan" pada kartu.
_Avoid_: pengiriman, batch datang, penerimaan

**Penerimaan**:
Tindakan mencatat satu kedatangan ke sistem. Sebuah kedatangan tersimpan sebagai satu
penerimaan.
_Avoid_: receipt, transaksi terima

**Draft Penerimaan**:
Penerimaan yang sudah dicatat tapi belum dikunci. Boleh diubah atau dibuang.

**Datang Sekarang**:
Jumlah fisik barang yang tiba pada kedatangan ini. Tidak pernah dikurangi apa pun —
barang yang sampai selalu dihitung masuk.
_Avoid_: qty datang, real terima

**Masuk Stok**:
Jumlah barang jadi yang dipakai sebagai pembagi HPP, dan penanda bahwa arrival
sudah lengkap. Tidak ada pengurangan barang cacat di app ini: yang sampai dianggap
masuk. Istilah "reject" sengaja tidak dipakai lagi supaya tidak terpakai untuk
hal lain — kalau nanti dibutuhkan, catat per baris, bukan dikurangi diam-diam.
_Avoid_: real terima, qty diterima

**Sisa**:
Kekurangan barang yang masih harus datang untuk satu varian.
Selalu `Plan − (Sudah Datang + Masuk Stok)`.

**Surat Jalan**:
Dokumen pengiriman dari vendor yang menyatakan barang apa saja yang dikirim. Menjadi
pembanding jumlah barang, bukan bukti serah terima.
_Avoid_: DO, delivery order

**Bukti Terima**:
Dokumen atau foto yang menandakan barang sudah diterima di sisi penerima. Beda dari surat
jalan: surat jalan dari pengirim, bukti terima dari penerima.
_Avoid_: tanda terima, BAST

**Barang Datang**:
Halaman daftar seluruh penerimaan lintas workcode. Bukan nama lain dari Receive: Receive
adalah stage-nya, Barang Datang adalah tampilan daftarnya.
_Avoid_: penerimaan barang, barang masuk

### Kesesuaian

Dua istilah ini mengukur hal yang berbeda dan tidak boleh saling menggantikan. Menyamakannya
membuat rapat berhenti karena "kok tidak sesuai, padahal sudah sesuai".

**Kesesuaian Real Stock**:
Selisih antara yang datang dan yang seharusnya datang, diukur terhadap **cutting** untuk
produk Production. Menjawab "apakah hasil potongannya lengkap". Tidak berlaku untuk White
Label, yang tidak punya cutting.

**Kesesuaian Surat Jalan**:
Selisih antara surat jalan dan barang yang benar-benar diterima, diukur **per kedatangan**.
Menjawab "apakah ada barang hilang atau rusak di perjalanan". Ini dasar kesesuaian untuk
White Label.
_Avoid_: selisih kirim, kesesuaian pengiriman

**Solusi**:
Keputusan atas barang yang tidak sesuai: refund, transfer, atau dikirim ulang.

**Log Solution**:
Catatan naratif yang menjelaskan solusinya, misalnya kapan barang susulan dijanjikan tiba.

### Produksi & biaya

**Batch**:
Sekelompok produksi satu produk pada satu rentang waktu. Batch punya nomor sendiri dan
bukan pengganti workcode PDFF.
_Avoid_: gelombang, produksi

**BOM**:
Daftar bahan yang dibutuhkan untuk membuat satu produk, beserta jumlah per pcs.

**HPP**:
Harga pokok produksi per unit. **Selalu dihitung di dalam app** — tidak pernah diisi
bebas dari luar. Ada dua bentuk, karena dua supply chain berbeda:

**HPP Produksi**:
Untuk barang yang dibuat sendiri. Sumber biayanya baris bahan (yang sudah termasuk
ongkos jahit sebagai kategori `cmt_cost`) dibagi barang jadi. Kalau ongkos jahit belum
terisi, kartu **macet di HPP & Price** — bukan dihitung setengah jadi.

**HPP White Label**:
Untuk barang yang dibeli utuh dari luar negeri. Sumber biainya
`actualIdrPaidProduct ÷ totalPcs`, ditambah ongkos kirim (`actualIdrPaidLogistic ÷
totalPcs`). `pricePerPcs` tidak dipakai — di satu titik ia tidak cocok dengan
`totalPrice ÷ totalPcs`, jadi tidak bisa jadi sumber.
_Avoid_: HPP Final/pcs, modal, HPP (tanpa keterangan)

**Tertutup**:
Kartu yang sudah melewati Finance Validate. Isinya terkunci permanen.

**Harga Jual**:
Selalu dihitung dari HPP dengan **margin global yang sama untuk semua produk**, bukan
margin per produk atau per kanal. Jadi mengubah margin mengubah semua harga jual
sekaligus.
_Avoid_: selling price, harga e-commerce

**Jumlah Upload POS**:
Berapa pcs produk ini yang sudah masuk ke point-of-sale. Angka, bukan bukti.
Berbeda dari **Proof Upload Ecommerce** dan **Upload POS**, yang keduanya berupa
bukti screenshot — jadi tiga field ini tidak boleh saling menggantikan.
_Avoid_: jumlah e-commerce, jumlah produk terjual

**Material**:
Bahan mentah: kain, aksesori, label. Punya stok dan varian.
_Avoid_: bahan baku, raw material

**Vendor**:
Pihak luar yang mengerjakan sesuatu untuk Livou. Satu tabel untuk semua tipe, dibedakan
kolom tipe: produksi, bahan baku, atau import.
_Avoid_: supplier, toko, pemasok

**PO**:
Pesanan pembelian material ke vendor.
_Avoid_: purchase order
