import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
} from '@/components/reui/kanban';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import KartuFulfillment from './KartuFulfillment';
import PopupKartu, { type AksiStage } from './PopupKartu';
import SeksiHppPrice, { type BuktiHppPrice } from './SeksiHppPrice';
import { barisContoh as barisContohHpp } from '@/pages/HppPratinjau';
import FormProduksiBaru from './FormProduksiBaru';
import type {
  BerkasBukti,
  BuktiCutting,
  BuktiTahapAkhir,
  CuttingPcs,
  DataProduksiBaru,
  DataTahapAkhir,
  KartuPdff,
  KembalikanCutting,
  SiapBahan,
  StagePapan,
} from './data-kanban';
import { kartuBaru, ringkasCutting, stageKartu, stageSetelah } from './data-kanban';

// ===== Papan Kanban =====
//
// Delapan kolom sejajar, lebih lebar dari layar, jadi digulir horizontal.
// Satu kolom = satu tahap. Itu sebabnya papan ini tidak punya baris tab:
// kalau tahap jadi tab, yang terlihat hanya satu kolom terisi dan tujuh kolom
// kosong — dan gunanya papan (melihat sebaran sekaligus) hilang.
//
// Lebar kolom 280px. Di ruang konten ~1600px itu berarti ~5 kolom terlihat,
// sisanya digulir. Angka di header kolom yang memberi tahu sisanya ada berapa.
//
// DRAG SENGAJA TIDAK DIPASANG — dan itu bukan sekadar tidak memanggil
// `KanbanItemHandle`. `KanbanItem` sendiri tidak dipakai, karena komponen itu
// memasang `role="button"`, `tabindex="0"`, dan `aria-roledescription="sortable"`
// pada pembungkusnya. Akibatnya, di dalamnya lahir dua masalah sekaligus:
// tombol di dalam tombol (HTML yang tidak sah), dan dua perhentian Tab per
// kartu — satu di antaranya mengumumkan "sortable" padahal tidak ada yang bisa
// digeser, dan tidak melakukan apa pun saat ditekan Enter.
//
// Karena itu kartunya berdiri sendiri: satu elemen `<button>` yang benar-benar
// membuka popup, satu perhentian Tab, dan tidak ada janji drag yang tidak ada.
// `Kanban`/`KanbanBoard`/`KanbanColumn`/`KanbanColumnContent` tetap dipakai
// untuk tata letaknya. `KanbanOverlay` juga tidak dipakai: lapisan bayangan itu
// hanya muncul saat ada yang diseret, dan tidak ada yang bisa diseret.
//
// PINDAH STAGE lewat popup, bukan lewat geser: approve di Propose, dan tombol
// lanjut di Prepare setelah semua bahan dicentang. Papan menyimpan
// perpindahannya di state; lihat `pindah` di bawah.

// ===== Penyimpanan bukti =====
//
// Dipisah dari komponen supaya dipakai dua store (bukti Cutting dan bukti HPP)
// lewat SATU implementasi. Bentuk keduanya sama persis —
// `Record<kartuId, Record<jenis, BerkasBukti[]>>` — jadi perbedaan store tidak
// perlu membawa perbedaan aturan.

/** Tambah satu berkas ke satu kartu pada satu jenis bukti. */
function tambahBerkas(
  lama: BuktiCutting,
  kartuId: string,
  jenis: string,
  berkas: File
): BuktiCutting {
  const jenisKartu: Record<string, BerkasBukti[]> = { ...(lama[kartuId] ?? {}) };
  const daftar = [...(jenisKartu[jenis] ?? [])];
  // Berkas dengan nama sama tidak dihitung dua kali: `multiple` memungkinkan hal
  // itu, dan tanpa penjagaan dua baris dengan nama identik membuat tombol hapus
  // pertama ikut menghapus yang kedua diam-diam.
  if (!daftar.some((b) => b.nama === berkas.name)) {
    daftar.push({
      nama: berkas.name,
      ukuran: berkas.size,
      tipe: berkas.type,
      url: URL.createObjectURL(berkas),
    });
  } else {
    // Kembar yang ditolak tidak boleh menggantungkan object URL sia-sia: tidak
    // ada yang akan pernah merevoke-nya.
    return lama;
  }
  jenisKartu[jenis] = daftar;
  return { ...lama, [kartuId]: jenisKartu };
}

/** Buang satu berkas dari satu kartu pada satu jenis bukti. */
function buangBerkas(
  lama: BuktiCutting,
  kartuId: string,
  jenis: string,
  nama: string
): BuktiCutting {
  const jenisKartu: Record<string, BerkasBukti[]> = { ...(lama[kartuId] ?? {}) };
  const sisa = (jenisKartu[jenis] ?? []).filter((b) => b.nama !== nama);
  // Object URL tidak dikumpulkan garbage collector seperti memori biasa —
  // satu-satunya cara melepaskannya adalah revoke eksplisit, dan tanpa ini
  // setiap unggahan menahan isi berkasnya sampai halaman ditutup.
  for (const b of jenisKartu[jenis] ?? []) {
    if (b.nama === nama) URL.revokeObjectURL(b.url);
  }
  jenisKartu[jenis] = sisa;
  return { ...lama, [kartuId]: jenisKartu };
}

export default function PapanFulfillment({
  stages,
  kartu,
  sumber,
}: {
  stages: StagePapan[];
  kartu: KartuPdff[];
  /** Papan mana yang sedang dibuka — menentukan daftar kategori vendor di form. */
  sumber: 'production' | 'whitelabel';
}) {
  const [terbukaId, setTerbukaId] = useState<string | null>(null);
  const [kartuTambahan, setKartuTambahan] = useState<KartuPdff[]>([]);
  const [pindah, setPindah] = useState<Record<string, string>>({});
  const [siapBahan, setSiapBahan] = useState<SiapBahan>({});
  const [cuttingPcs, setCuttingPcs] = useState<CuttingPcs>({});
  const [buktiCutting, setBuktiCutting] = useState<BuktiCutting>({});
  /**
   * Bukti kalkulasi HPP — store TERPISAH dari `buktiCutting`.
   *
   * Bukan dua nama untuk satu state: `ringkasCutting` membaca `buktiCutting`
   * untuk menghitung apakah kartu boleh keluar dari stage Cutting, jadi
   * Bukti HPP yang ikut di sana akan membuat kartu Cutting terlihat selesai
   * tanpa bukti potong yang sah. Bentuk dan aturannya sama, asalnya tidak.
   */
  const [buktiHpp, setBuktiHpp] = useState<BuktiHppPrice>({});
  /**
   * Bukti tiga tahap akhir — store KETIGA, terpisah dari dua di atas.
   *
   * Id jenisnya sudah berbeda per tahap (`invoiceLogistic` vs `uploadPos`),
   * jadi tidak ada berkas yang bisa terhitung dua kali. Yang membuatnya harus
   * terpisah tetap sama: `ringkasCutting` membaca `buktiCutting` sebagai syarat
   * keluar dari Cutting, dan berkas dari tahap ini tidak boleh ikut ke sana.
   */
  const [buktiTahap, setBuktiTahap] = useState<BuktiTahapAkhir>({});
  /**
   * Isian tiga tahap akhir (kode shipment, tanggal, flow, jumlah upload POS).
   *
   * Disimpan di luar kartu, sama seperti `cuttingPcs` dan `siapBahan`: kartu di
   * `data-kanban.ts` adalah data pratinjau, dan yang diketik orang di popup
   * tidak boleh ikut menulis ke sana — kalau iya, tiap kartu perlu salinannya
   * sendiri dan angka hasil ketik orang hilang begitu halamannya dimuat ulang.
   *
   * Nilainya ditumpuk di ATAS `kartu.tahapAkhir` saat dibaca, jadi kartu contoh
   * yang sudah punya isinya tetap menampilkan isinya, dan yang belum punya
   * mulai dari kosong.
   */
  const [tahapAkhir, setTahapAkhir] = useState<Record<string, DataTahapAkhir>>({});
  const [formTerbuka, setFormTerbuka] = useState(false);
  const [kembalikan, setKembalikan] = useState<KembalikanCutting>({});
  /**
   * Stage yang sudah dilewati tiap kartu — penentu "terkunci total" di tiga
   * tahap akhir.
   *
   * Diisi saat kartu MENINGGALKAN sebuah stage, dan tidak pernah dikosongkan:
   * kartu yang sudah lewat Invoice Logistic membawa jejak itu seterusnya.
   *
   * BUKAN diturunkan dari `stage`, dengan alasan yang sama seperti
   * `disetujuiCutting`: kartu contoh bawaan sudah duduk di 'upload' dan
   * 'invoice-product' tanpa pernah melewati apa pun, dan mengunci mereka akan
   * membekukan data yang justru sedang didemokan.
   */
  const [sudahLewat, setSudahLewat] = useState<Record<string, string[]>>({});
  /**
   * Id temuan Finance Validate yang sudah ditutup, per kartu.
   *
   * Yang disimpan HANYA id-nya, bukan temuan itu sendiri: temuannya dihitung
   * ulang dari data tiap kali popup dibuka (`temuan.ts`), jadi temuan yang
   * sudah tidak berlaku hilang sendiri. Menyimpan salinan temuan berarti
   * menyimpan yang bisa basi — dan temuan basi terus menahan kartu tanpa
   * alasan yang bisa dilihat di layar.
   *
   * Tidak dikosongkan saat kartu pindah: kartu yang sudah lewat Finance
   * Validate tetap membawa riwayat temuannya, sama seperti `sudahLewat`.
   */
  const [temuanTertutup, setTemuanTertutup] = useState<Record<string, string[]>>({});
  // Kartu yang Cutting-nya sudah pernah disetujui. BUKAN diturunkan dari
  // `pindah`: kartu contoh bawaan sudah datang dengan `stage: 'receive'`
  // tanpa pernah ada approve Cutting untuk mereka, dan menjadikannya
  // terkunci akan membekukan data yang justru sedang didemokan — tanpa
  // tombol Kembalikan pun, karena tidak ada jejak pengembaliannya.
  const [disetujuiCutting, setDisetujuiCutting] = useState<Record<string, boolean>>({});

  // Object URL dari pratinjau bukti tidak bisa dibiarkan menggantung.
  // Menyimpan state-nya di ref membuat cleanup terakhir bisa membaca nilai
  // terbaru tanpa harus menggantungkan effect ini ke setiap perubahan — kalau
  // dependensinya ikut `buktiCutting`, effect akan mencabut URL berkas yang
  // masih tampil setiap kali berkas lain ditambahkan.
  //
  // KETIGA store ikut di sini. Effect-nya satu, tiap URL dicabut satu kali;
  // kalau dipisah jadi tiga effect, ref untuk masing-masing store harus diurus
  // sendiri-sendiri, padahal bentuk cleanup-nya identik — dan satu store yang
  // lupa didaftarkan berarti berkasnya menahan memori sampai halaman ditutup,
  // tanpa gejala apa pun.
  const buktiRef = useRef({ cutting: buktiCutting, hpp: buktiHpp, tahap: buktiTahap });
  buktiRef.current = { cutting: buktiCutting, hpp: buktiHpp, tahap: buktiTahap };
  useEffect(
    () => () => {
      const semua = [buktiRef.current.cutting, buktiRef.current.hpp, buktiRef.current.tahap];
      for (const perKartu of semua) {
        for (const perJenis of Object.values(perKartu)) {
          for (const daftar of Object.values(perJenis)) {
            for (const b of daftar) URL.revokeObjectURL(b.url);
          }
        }
      }
    },
    []
  );

  // Kartu bawaan + kartu yang baru ditambahkan lewat form, lalu isian tiga
  // tahap akhir yang diketik orang ditumpuk di atasnya.
  //
  // Ditumpuk di SINI, sekali, bukan di dalam popup: seluruh papan membaca
  // `semua`, jadi kartu yang sama harus terlihat sama di kolomnya dan di
  // popupnya. Kalau penumpukan itu dilakukan di popup, kartu di papan tetap
  // membawa `tahapAkhir` yang lama dan dua tempat itu bisa berbeda.
  const semua = useMemo(() => {
    const dasar = [...kartu, ...kartuTambahan];
    return dasar.map((k) => {
      const ubahan = tahapAkhir[k.id];
      if (!ubahan) return k;
      return { ...k, tahapAkhir: { ...k.tahapAkhir, ...ubahan } };
    });
  }, [kartu, kartuTambahan, tahapAkhir]);

  const kolom = useMemo(
    () =>
      Object.fromEntries(
        stages.map((s) => [
          s.id,
          semua.filter((k) => stageKartu(k.id, semua, pindah, stages) === s.id),
        ])
      ) as Record<string, KartuPdff[]>,
    [stages, semua, pindah]
  );

  const kartuTerbuka = terbukaId ? semua.find((k) => k.id === terbukaId) : undefined;
  const stageTerbuka = kartuTerbuka
    ? stages.find((s) => s.id === stageKartu(kartuTerbuka.id, semua, pindah, stages))
    : undefined;
  const stageSetelahTerbuka = stageTerbuka ? stageSetelah(stages, stageTerbuka.id) : undefined;

  const aksi: AksiStage = {
    approve: (k) => {
      // Tujuan diambil dari urutan kolom papan, bukan ditulis 'prepare': papan
      // White Label tidak punya Prepare, kolom setelah Propose di sana Invoice
      // Logistic. Menulis 'prepare' di sini membuat kartunya lenyap dari papan
      // begitu di-approve — tanpa error.
      const tujuan = stageSetelah(stages, 'propose');
      if (tujuan) setPindah((lama) => ({ ...lama, [k.id]: tujuan.id }));
      setTerbukaId(null);
    },
    lanjutStage: (k) => {
      // Sama: tujuan selalu kolom berikutnya DI PAPAN INI. Di papan White Label
      // kolom setelah Prepare tidak ada — kartunya langsung dari Propose ke
      // Invoice Logistic.
      const sekarang = stageKartu(k.id, semua, pindah, stages);
      const tujuan = stageSetelah(stages, sekarang);
      // Hanya lewat Cutting yang mengunci data Cutting. Menandainya di tahap
      // lain akan mengunci angka yang tidak pernah disetujui siapa pun.
      if (sekarang === 'cutting') setDisetujuiCutting((lama) => ({ ...lama, [k.id]: true }));
      // Tiga tahap akhir terkunci total: yang dilewati dicatat di sini, saat
      // kartunya benar-benar meninggalkannya. Tahap lain tidak ikut dicatat —
      // daftar ini khusus penjaga tahap akhir, dan mencampurnya dengan stage
      // yang punya mekanisme sendiri (Cutting) membuat dua aturan berbeda
      // terlihat seperti satu.
      if (sekarang === 'invoice-logistic' || sekarang === 'invoice-product' || sekarang === 'upload') {
        setSudahLewat((lama) => {
          const punya = lama[k.id] ?? [];
          return punya.includes(sekarang) ? lama : { ...lama, [k.id]: [...punya, sekarang] };
        });
      }
      if (tujuan) setPindah((lama) => ({ ...lama, [k.id]: tujuan.id }));
      setTerbukaId(null);
    },
    kembalikanCutting: (k, alasan) => {
      // Q11: approve Cutting tidak mencatat siapa yang menyetujuinya (Q1),
      // jadi satu-satunya cara tahu angkanya pernah diubah adalah jejak
      // pengembalian ini. Tiga hal dicatat — kapan, alasan, dan total pcs
      // saat itu — supaya selisihnya dengan angka akhir bisa dibaca langsung.
      const totalPcs = ringkasCutting(k, cuttingPcs, buktiCutting).totalPcs;
      setKembalikan((lama) => ({
        ...lama,
        [k.id]: [...(lama[k.id] ?? []), { waktu: new Date().toISOString(), alasan, totalPcs }],
      }));
      setPindah((lama) => ({ ...lama, [k.id]: 'cutting' }));
      setTerbukaId(null);
    },
    tandaiBahan: (k, kunci, siap) => {
      setSiapBahan((lama) => {
        const sekarang = new Set(lama[k.id] ?? []);
        if (siap) sekarang.add(kunci);
        else sekarang.delete(kunci);
        return { ...lama, [k.id]: [...sekarang] };
      });
    },
    siapKartu: (k) => siapBahan[k.id] ?? [],
    isiCutting: (k, kunci, pcs) => {
      setCuttingPcs((lama) => {
        const isiKartu: Record<string, number> = { ...(lama[k.id] ?? {}) };
        // NaN berarti kotak dikosongkan. Kunci DIHAPUS, bukan diisi NaN: kunci
        // yang masih ada dengan nilai NaN akan lolos pemeriksaan "sudah
        // terisi" di ringkasan, dan gerbangnya terbuka untuk varian yang
        // belum diisi. Lihat catatan di `ringkasCutting()`.
        if (Number.isNaN(pcs)) delete isiKartu[kunci];
        else isiKartu[kunci] = pcs;
        return { ...lama, [k.id]: isiKartu };
      });
    },
    tambahBukti: (k, jenis, berkas) => setBuktiCutting((lama) => tambahBerkas(lama, k.id, jenis, berkas)),
    hapusBukti: (k, jenis, nama) => setBuktiCutting((lama) => buangBerkas(lama, k.id, jenis, nama)),
    // Dua handler di bawah sengaja memanggil fungsi yang SAMA dengan yang
    // dipakai `tambahBukti`/`hapusBukti`, hanya dengan store berbeda. Menyalin
    // logikanya berarti aturan "nama kembar tidak dihitung dua kali" dan revoke
    // object URL punya dua versi yang bisa berbeda.
    tambahBuktiHpp: (k, jenis, berkas) => setBuktiHpp((lama) => tambahBerkas(lama, k.id, jenis, berkas)),
    hapusBuktiHpp: (k, jenis, nama) => setBuktiHpp((lama) => buangBerkas(lama, k.id, jenis, nama)),
    // Tiga tahap akhir memakai fungsi yang sama lagi, dengan store ketiga.
    // Aturan "nama kembar tidak dihitung dua kali" dan revoke object URL tetap
    // satu implementasi.
    tambahBuktiTahap: (k, jenis, berkas) =>
      setBuktiTahap((lama) => tambahBerkas(lama, k.id, jenis, berkas)),
    hapusBuktiTahap: (k, jenis, nama) => setBuktiTahap((lama) => buangBerkas(lama, k.id, jenis, nama)),
    tutupTemuan: (k, id) =>
      setTemuanTertutup((lama) => {
        const punya = lama[k.id] ?? [];
        // Menutup dua kali tidak menambah apa-apa, dan daftar yang tumbuh
        // tanpa batas membuat "berapa temuan yang sudah ditutup" tidak lagi
        // bisa dibaca dari panjangnya.
        return punya.includes(id) ? lama : { ...lama, [k.id]: [...punya, id] };
      }),
    ubahTahap: (k, kolom, nilai) =>
      setTahapAkhir((lama) => {
        const isi: DataTahapAkhir = { ...(lama[k.id] ?? {}) };
        // `undefined` berarti kolomnya DIKOSONGKAN — kuncinya dihapus, bukan
        // diisi `undefined`. Bedanya nyata saat kolom itu dibaca lagi: kunci
        // yang masih ada dengan nilai `undefined` tetap lolos pemeriksaan
        // "sudah ada isinya" di beberapa tempat, dan kotak yang sudah
        // dikosongkan akan terlihat terisi.
        //
        // Nilainya ditulis lewat `Record<string, ...>`, bukan `isi[kolom]`
        // langsung: `keyof DataTahapAkhir` adalah gabungan semua kuncinya, dan
        // TypeScript tidak bisa membuktikan `nilai` cocok untuk kunci MANA pun
        // secara khusus. Pemanggilnyalah yang tahu kolom mana yang dia ubah —
        // lihat pemanggilan di `PopupKartu.tsx`, yang selalu memasangkan nama
        // kolom dengan jenis nilainya.
        const peta = isi as Record<string, string | number | undefined>;
        if (nilai === undefined) delete peta[kolom];
        else peta[kolom] = nilai;
        return { ...lama, [k.id]: isi };
      }),
  };

  function tambahProduksi(data: DataProduksiBaru) {
    // Nomor kartu baru diambil dari yang terbesar + 1, bukan dari jumlah kartu:
    // jumlahnya tidak pernah turun, jadi id bisa terpakai dua kali begitu ada
    // kartu yang dihapus.
    const nomorBaru =
      semua.reduce((maks, k) => {
        const n = Number(k.id.replace(/^b-/, ''));
        return Number.isFinite(n) ? Math.max(maks, n) : maks;
      }, 0) + 1;
    setKartuTambahan((lama) => [...lama, kartuBaru(`b-${nomorBaru}`, data, sumber)]);
  }

  return (
    <>
      {/* `onValueChange` sengaja kosong: tidak ada yang bisa dipindahkan dengan
          drag, jadi tidak ada perubahan susunan yang perlu disimpan. Prop ini
          tetap dioper karena `Kanban` mensyaratkannya. */}
      <Kanban value={kolom} onValueChange={() => {}} getItemValue={(k) => k.id}>
        {/* `sm:grid-cols-none` wajib ada, meski kelihatannya mubazir.
            Bawaan komponennya `grid auto-rows-fr gap-4 sm:grid-cols-3` —
            papan 3 kolom. `flex` di bawah ini menang atas `grid`, tapi
            `sm:grid-cols-3` TIDAK ikut terhapus: tailwind-merge hanya
            menyelesaikan konflik dalam bucket yang sama, dan varian `sm:`
            dianggap terpisah. Sekarang ia tidak berpengaruh (template kolom
            tidak berlaku pada flex), tapi begitu seseorang menghapus `flex`,
            papan langsung berubah jadi 3 kolom tanpa ada yang menyadarinya.
            Karena itu dimatikan terang-terangan. */}
        <KanbanBoard className="flex items-start gap-3 overflow-x-auto pb-4 sm:grid-cols-none">
          {stages.map((s) => {
            const isi = kolom[s.id] ?? [];
            return (
              <KanbanColumn
                key={s.id}
                value={s.id}
                className="w-[280px] shrink-0 gap-0 rounded-xl border bg-muted/40"
              >
                <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2">
                    {/* Titik warna tahap. ReUI tidak mewarnai kolomnya sendiri —
                        contoh resminya pun menambahkan penanda seperti ini per
                        kolom — jadi warna dipasang di sini, bukan di komponen
                        registry yang akan tertimpa saat diperbarui. */}
                    <span
                      className={cn('h-2 w-2 shrink-0 rounded-full', s.warna)}
                      aria-hidden="true"
                    />
                    <span className="truncate text-xs font-semibold">{s.label}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-background px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {isi.length}
                  </span>
                </div>

                {/* Usulan produksi baru dibuat dari kolom Propose — di situlah
                    usulan lahir. Tombolnya tetap di dalam kolom, bukan di
                    toolbar halaman: pemilik yang melihat kolom kosong langsung
                    tahu caranya mengisi, tanpa harus tahu dulu ada toolbar.
                    owner 28 Sep 2026: posisinya DIPINDAH ke atas kartu, tepat
                    di bawah judul kolom. Di bawah deretan kartu, tombolnya
                    ikut ter-scroll dan hilang ke bawah layar begitu kolomnya
                    panjang — persis di saat kolom itu paling butuh diisi. */}
                {s.id === 'propose' && (
                  <div className="px-2 pb-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start border border-dashed text-muted-foreground"
                      onClick={() => setFormTerbuka(true)}
                    >
                      <Plus /> Tambah Produksi
                    </Button>
                  </div>
                )}

                <KanbanColumnContent value={s.id} className="min-h-[140px] gap-2 px-2 pb-2">
                  {isi.map((k) => (
                    <KartuFulfillment
                      key={k.id}
                      kartu={k}
                      stageId={s.id}
                      siapBahan={siapBahan}
                      onBuka={(kartuDibuka) => setTerbukaId(kartuDibuka.id)}
                    />
                  ))}

                  {isi.length === 0 && s.id !== 'propose' && (
                    <p className="px-1 py-6 text-center text-[11px] text-muted-foreground">
                      Belum ada kartu di tahap ini.
                    </p>
                  )}
                </KanbanColumnContent>
              </KanbanColumn>
            );
          })}
        </KanbanBoard>
      </Kanban>

      <PopupKartu
        kartu={kartuTerbuka ?? null}
        stage={stageTerbuka}
        stageBerikutnya={stageSetelahTerbuka}
        adaPrepare={stages.some((s) => s.id === 'prepare')}
        sumber={sumber}
        siapBahan={siapBahan}
        cuttingPcs={cuttingPcs}
        buktiCutting={buktiCutting}
        buktiHpp={buktiHpp}
        buktiTahap={buktiTahap}
        renderHpp={(p) => <SeksiHppPrice {...p} barisHpp={barisContohHpp} />}
        kembalikan={kembalikan}
        disetujuiCutting={disetujuiCutting}
        sudahLewat={sudahLewat}
        temuanTertutup={temuanTertutup}
        barisHpp={barisContohHpp}
        aksi={aksi}
        onTutup={() => setTerbukaId(null)}
      />

      <FormProduksiBaru
        terbuka={formTerbuka}
        sumber={sumber}
        tujuanApprove={stageSetelah(stages, 'propose')?.label}
        onTutup={() => setFormTerbuka(false)}
        onSimpan={(data) => {
          tambahProduksi(data);
          setFormTerbuka(false);
        }}
      />
    </>
  );
}
