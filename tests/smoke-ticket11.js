/**
 * Smoke test tiket 11 (11a kolom keputusan, 11b flow transaksi) terhadap
 * server nyata.
 *
 * Alasan smoke test ini ada, terpisah dari test suite: pada tiket 03 dan 09
 * dua bug lolos dari puluhan test API dan cuma muncul waktu halaman
 * benar-benar dimuat. Test suite menjalankan rute di Express buatan; smoke
 * test ini memakai aplikasi sebenarnya, lengkap dengan middleware dan SPA-nya.
 *
 * Yang dibuktikan:
 *   1. /api/purchase-orders mengirim validated_at dan validator_name.
 *   2. Format tanggalnya 'YYYY-MM-DD HH:MI' — bukan ISO berawalan Z, yang
 *      berarti nilainya sudah bergeser zona.
 *   3. PO yang DITOLAK tetap melapor tanggal keputusannya (keputusan 11a).
 *   4. Halaman /pembelian-material bisa dimuat.
 *   5. GET /api/purchase-orders/flow-transaksi terjangkau dan isinya sesuai.
 *   6. Kolom flow_transaksi terbaca di daftar.
 *   7. Foto nota bisa diunggah DAN dijangkau lewat /uploads/ (11c) — yang
 *      terakhir ini yang paling mudah salah, karena berkas bisa tersimpan
 *      tanpa pernah bisa ditampilkan.
 *   8. Foto material bisa diunggah dan dijangkau (11d). Materialnya tidak
 *      dihapus pada akhir pemeriksaan; hanya fotonya.
 *
 * Cara pakai:
 *   1. node index.js
 *   2. node tests/smoke-ticket11.js
 *
 * BUKAN sekadar GET sejak 11c: ia mengunggah satu PNG 1x1 ke PO pertama yang
 * pending, lalu menghapusnya kembali di akhir. Aman dijalankan berulang
 * karena pembersihannya ikut diuji — kalau pembersihan gagal, skrip ini
 * melaporkannya sebagai kegagalan, bukan membiarkan bekasnya diam-diam.
 */
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3000';
const USER = process.env.SMOKE_USER || 'admin';
const PASS = process.env.SMOKE_PASS || 'admin123';

let cookie = '';
const gagal = [];
const ok = (l) => console.log(`  OK   ${l}`);
const salah = (l, d) => { gagal.push(l); console.log(`  GAGAL ${l} — ${d}`); };

async function req(method, path, { form, redirect = 'manual' } = {}) {
  const headers = { cookie };
  let payload;
  if (form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(form).toString();
  }
  const r = await fetch(BASE + path, { method, headers, redirect, body: payload });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return { status: r.status, text: await r.text(), contentType: r.headers.get('content-type') || '' };
}

const FORMAT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

(async () => {
  console.log('=== Smoke test tiket 11 (server nyata) ===\n');

  const lp = await req('GET', '/login');
  // Token CSRF diambil kalau ada, tapi TIDAK diwajibkan: halaman login
  // sekarang disajikan React, jadi form server-rendered berikut tokennya
  // tidak selalu ada. smoke-ticket10.js memakai pola toleran yang sama, dan
  // login tetap berfungsi — yang dipakai smoke test ini cuma cookienya.
  const m = lp.text.match(/name="_csrf"\s+value="([^"]+)"/)
    || lp.text.match(/value="([^"]+)"\s+name="_csrf"/);

  await req('POST', '/login', {
    form: { username: USER, password: PASS, _csrf: m ? m[1] : '' },
  });
  // Penanda keberhasilan adalah COOKIE, bukan status: endpoint login bisa
  // menjawab 302/200 dengan cara berbeda tergantung jalur yang dipakai.
  if (!cookie) {
    console.log('GAGAL login — dibatalkan. Cek SMOKE_USER/SMOKE_PASS.');
    process.exit(1);
  }
  ok(`login sebagai ${USER}`);

  // Dideklarasikan di luar blok supaya pemeriksaan flow transaksi di bawah
  // bisa memakainya juga. Kalau dideklarasi di dalam, ia akan tertukar dengan
  // `data` milik endpoint flow-transaksi yang ada di akhir berkas ini.
  let daftarPo = null;

  const list = await req('GET', '/api/purchase-orders');
  if (list.status !== 200) {
    salah('GET /api/purchase-orders menjawab 200', `status ${list.status}`);
  } else {
    ok('GET /api/purchase-orders menjawab 200');
    let data;
    try {
      data = JSON.parse(list.text).data;
      daftarPo = data;
    } catch (e) {
      salah('respons /api/purchase-orders berupa JSON', e.message);
    }

    if (data) {
      // 1. Field ada di setiap baris.
      const tanpaField = data.filter((r) => !('validated_at' in r) || !('validator_name' in r));
      if (tanpaField.length) {
        salah('setiap baris punya validated_at dan validator_name', `${tanpaField.length} baris tidak`);
      } else {
        ok(`setiap baris punya kedua field (${data.length} PO)`);
      }

      // 2. Format tanggal — bukan ISO.
      const berformat = data.filter((r) => r.validated_at);
      const aneh = berformat.filter((r) => !FORMAT.test(r.validated_at));
      if (aneh.length) {
        salah(
          "format tanggal 'YYYY-MM-DD HH:MI' (bukan ISO)",
          `${aneh.length} baris melanggar, contoh: ${JSON.stringify(aneh[0].validated_at)}`
        );
      } else if (berformat.length) {
        ok(`format tanggal benar pada ${berformat.length} baris yang diputuskan`);
      }

      // 3. PO yang ditolak tetap punya tanggal keputusan.
      const ditolak = data.filter((r) => r.status === 'rejected');
      const ditolakTanpaTanggal = ditolak.filter((r) => !r.validated_at);
      if (ditolak.length === 0) {
        console.log('  INFO tidak ada PO rejected di data — kasus 3 tidak teruji');
      } else if (ditolakTanpaTanggal.length) {
        salah(
          'PO rejected tetap melapor tanggal keputusannya',
          `${ditolakTanpaTanggal.length} dari ${ditolak.length} kosong`
        );
      } else {
        ok(`PO rejected melapor tanggalnya (${ditolak.length} dari ${ditolak.length})`);
      }

      // 4. Tidak ada null/undefined yang bocor sebagai string.
      const bocor = data.filter(
        (r) => r.validated_at === 'null' || r.validated_at === 'undefined'
            || r.validator_name === 'null' || r.validator_name === 'undefined'
      );
      if (bocor.length) {
        salah('tidak ada nilai "null"/"undefined" sebagai string', `${bocor.length} baris`);
      } else {
        ok('tidak ada null/undefined yang bocor sebagai string');
      }

      // 5. Konsistensi: detail dan daftar memakai format yang sama.
      if (berformat.length) {
        const id = berformat[0].id;
        const det = await req('GET', `/api/purchase-orders/${id}`);
        if (det.status !== 200) {
          salah('GET detail menjawab 200', `status ${det.status}`);
        } else {
          const d = JSON.parse(det.text).data;
          if (d.validated_at !== berformat[0].validated_at) {
            salah(
              'detail dan daftar memakai format tanggal yang sama',
              `daftar "${berformat[0].validated_at}" vs detail "${d.validated_at}"`
            );
          } else {
            ok(`detail dan daftar formatnya sama (PO id ${id})`);
          }
        }
      }
    }
  }

  // 6. Halaman React bisa dimuat.
  const hal = await req('GET', '/pembelian-material');
  if (hal.status !== 200) {
    salah('GET /pembelian-material menjawab 200', `status ${hal.status}`);
  } else {
    ok('halaman /pembelian-material dimuat');
  }

  // ----- Tiket 11b: Flow Transaksi -----
  //
  // Endpoint opsi diuji di sini, bukan cuma lewat test suite, karena ia harus
  // terjangkau lewat aplikasi nyata — rutenya bisa saja kalah dari GET /:id
  // kalau urutannya keliru, dan itu tidak selalu terlihat di unit test yang
  // memasang routernya sendiri.
  const FLOW_VALID = [
    'Livou Transfer',
    'Saldo Shopee',
    'Reimbursement',
    'Deposit Cash',
    'Saldo Lalamove',
  ];

  const flow = await req('GET', '/api/purchase-orders/flow-transaksi');
  if (flow.status !== 200) {
    salah('GET /flow-transaksi menjawab 200', `status ${flow.status}`);
  } else {
    let opsiFlow;
    try {
      opsiFlow = JSON.parse(flow.text).data;
    } catch (e) {
      salah('respons flow-transaksi berupa JSON', e.message);
    }
    if (opsiFlow) {
      // Dibandingkan sebagai JSON string, bukan per elemen: urutannya ikut
      // diuji, dan urutan di sini menentukan urutan yang tampil di dropdown.
      const sama = JSON.stringify(opsiFlow) === JSON.stringify(FLOW_VALID);
      if (sama) ok(`GET /flow-transaksi mengembalikan ${opsiFlow.length} nilai sesuai daftar`);
      else salah('daftar flow transaksi sesuai lima nilai', JSON.stringify(opsiFlow));
    }
  }

  // Kolomnya harus terbaca di daftar, meski hari ini masih kosong semua.
  if (daftarPo) {
    const tanpaKolom = daftarPo.filter((r) => !('flow_transaksi' in r));
    if (tanpaKolom.length) {
      salah('setiap baris daftar punya flow_transaksi', `${tanpaKolom.length} baris tidak`);
    } else {
      const terisi = daftarPo.filter((r) => r.flow_transaksi);
      ok(
        terisi.length
          ? `flow_transaksi terbaca (${terisi.length} dari ${daftarPo.length} terisi)`
          : `kolom flow_transaksi ada di ${daftarPo.length} baris, belum ada yang terisi`
      );
    }
  }

  // ----- Tiket 11c: foto nota PO -----
  //
  // Yang paling penting bukan endpoint unggahnya, melainkan bahwa berkasnya
  // bisa DIJANGKAU lewat /uploads/. Sebelum tiket ini uploads/ tidak pernah
  // di-mount, jadi foto produk tersimpan di disk namun tidak pernah tampil —
  // kolomnya terisi, gambarnya tidak pernah muncul.
  //
  // Pemeriksaannya HARUS memakai berkas yang benar-benar ada. Dua percobaan
  // yang gagal lebih dulu:
  //
  //   1. Meminta /uploads/ saja → sia-sia. Tanpa mount, permintaan itu jatuh
  //      ke catch-all SPA, dan catch-all juga menjawab 404 untuk rute yang
  //      bukan miliknya. Kedua keadaan menghasilkan status yang sama.
  //   2. Meminta nama berkas acak dan memeriksa bahwa responsnya bukan HTML →
  //      juga sia-sia. express.static memang meneruskan ke next() kalau
  //      berkasnya tidak ada, jadi catch-all yang menjawab. Itu perilaku
  //      normal Express, bukan tanda mount hilang.
  //
  // Jadi: unggah dulu, baru minta berkasnya. Hanya itu yang membedakan
  // "tersimpan dan bisa dilihat" dari "tersimpan tetapi tidak terjangkau".
  let fotoTerunggah = null;
  if (daftarPo) {
    const target = daftarPo.find((r) => r.status === 'pending') || daftarPo[0];
    if (target) {
      const token = await req('GET', '/api/csrf');
      let t = '';
      try { t = JSON.parse(token.text).csrfToken; } catch (e) { /* abaikan */ }

      // Gambar PNG 1x1 yang sah, supaya lolos validasi tipe.
      const PNG = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
        'base64'
      );
      const fd = new FormData();
      fd.append('foto', new Blob([PNG], { type: 'image/png' }), 'smoke-nota.png');

      const up = await fetch(`${BASE}/api/purchase-orders/${target.id}/foto`, {
        method: 'POST',
        headers: { cookie, 'x-csrf-token': t },
        body: fd,
        redirect: 'manual',
      });
      const hasil = await up.json().catch(() => null);
      if (up.status !== 200 || !hasil?.ok) {
        salah('unggah foto nota → 200', `status ${up.status}: ${JSON.stringify(hasil).slice(0, 120)}`);
      } else {
        ok(`unggah foto nota berhasil (PO id ${target.id})`);
        fotoTerunggah = { poId: target.id, nama: hasil.data.file_path };

        // Inti pemeriksaannya: berkasnya bisa dijangkau browser.
        const ambil = await req('GET', `/uploads/${fotoTerunggah.nama}`);
        const html = (ambil.contentType || '').includes('text/html');
        if (ambil.status !== 200 || html) {
          salah(
            'foto yang diunggah bisa dijangkau lewat /uploads/',
            `status ${ambil.status}, jenis ${ambil.contentType} — mount tidak bekerja`
          );
        } else {
          ok(`foto bisa dijangkau lewat /uploads/ (${ambil.contentType})`);
        }
      }
    }
  }

  if (daftarPo) {
    const tanpaKolom = daftarPo.filter((r) => !('foto_path' in r));
    if (tanpaKolom.length) {
      salah('setiap baris daftar punya foto_path', `${tanpaKolom.length} baris tidak`);
    } else {
      const berfoto = daftarPo.filter((r) => r.foto_path);
      ok(
        berfoto.length
          ? `foto_path terbaca (${berfoto.length} dari ${daftarPo.length} berfoto)`
          : `kolom foto_path ada di ${daftarPo.length} baris, belum ada yang berfoto`
      );
      // Kolom bisa terisi sekaligus tidak bisa ditampilkan — itulah keadaan
      // foto produk hari ini. Jadi kalau ada yang berfoto, diakses juga.
      if (berfoto.length) {
        const satu = await req('GET', `/uploads/${berfoto[0].foto_path}`);
        if (satu.status !== 200) {
          salah('foto yang tercatat bisa dijangkau', `status ${satu.status} untuk ${berfoto[0].foto_path}`);
        } else {
          ok(`foto bisa dijangkau (${berfoto[0].foto_path})`);
        }
      }
    }
  }

  // ----- Tiket 11d: foto material -----
  //
  // Hanya endpointnya yang diuji, karena belum ada UI untuk mengubah material
  // (/master-data cuma redirect ke /stok-material yang baca-saja).
  // Materialnya TIDAK dihapus pada akhir
  // pemeriksaan — material yang punya riwayat pembelian ditolak server (409),
  // dan menghapus material yang tidak punya riwayat pun akan mengubah data
  // live tanpa perlu.
  const materials = await req('GET', '/api/materials');
  if (materials.status === 200) {
    let daftarMaterial = null;
    try { daftarMaterial = JSON.parse(materials.text).data; } catch (e) { /* abaikan */ }

    if (daftarMaterial && daftarMaterial.length) {
      const target = daftarMaterial[0];
      const token = await req('GET', '/api/csrf');
      let t = '';
      try { t = JSON.parse(token.text).csrfToken; } catch (e) { /* abaikan */ }

      const PNG = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
        'base64'
      );
      const fd = new FormData();
      fd.append('foto', new Blob([PNG], { type: 'image/png' }), 'smoke-material.png');

      const up = await fetch(`${BASE}/api/materials/${target.id}/foto`, {
        method: 'POST',
        headers: { cookie, 'x-csrf-token': t },
        body: fd,
        redirect: 'manual',
      });
      const hasil = await up.json().catch(() => null);
      if (up.status !== 200 || !hasil?.ok) {
        salah('unggah foto material → 200', `status ${up.status}: ${JSON.stringify(hasil).slice(0, 120)}`);
      } else {
        ok(`unggah foto material berhasil (material id ${target.id})`);

        const ambil = await req('GET', `/uploads/${hasil.data.file_path}`);
        const html = (ambil.contentType || '').includes('text/html');
        if (ambil.status !== 200 || html) {
          salah('foto material bisa dijangkau', `status ${ambil.status}, jenis ${ambil.contentType}`);
        } else {
          ok(`foto material bisa dijangkau (${ambil.contentType})`);
        }

        // Bersihkan: hapus lagi, lalu pastikan berkasnya ikut lenyap.
        const token2 = await req('GET', '/api/csrf');
        let t2 = '';
        try { t2 = JSON.parse(token2.text).csrfToken; } catch (e) { /* abaikan */ }
        const hapus = await fetch(`${BASE}/api/materials/${target.id}/foto`, {
          method: 'DELETE',
          headers: { cookie, 'x-csrf-token': t2 },
          redirect: 'manual',
        });
        if (hapus.status !== 200) {
          salah('pembersihan: foto material terhapus', `status ${hapus.status}`);
        } else {
          const sisa = await req('GET', `/uploads/${hasil.data.file_path}`);
          if (sisa.status === 200) salah('pembersihan: berkas material tidak ikut terhapus', hasil.data.file_path);
          else ok('dibersihkan kembali (foto material dihapus)');
        }
      }
    }
  }

  // Bersihkan foto yang baru saja diunggah.
  //
  // Walaupun berkasnya cuma PNG 1x1, membiarkannya berarti menjalankan smoke
  // test dua kali akan membuat PO uji punya foto sisa, dan pemeriksaan "belum
  // ada yang berfoto" di bawah jadi tidak pernah benar lagi.
  if (fotoTerunggah) {
    const token2 = await req('GET', '/api/csrf');
    let t2 = '';
    try { t2 = JSON.parse(token2.text).csrfToken; } catch (e) { /* abaikan */ }
    const hapus = await fetch(`${BASE}/api/purchase-orders/${fotoTerunggah.poId}/foto`, {
      method: 'DELETE',
      headers: { cookie, 'x-csrf-token': t2 },
      redirect: 'manual',
    });
    if (hapus.status !== 200) {
      salah('pembersihan: foto uji terhapus', `status ${hapus.status}`);
    } else {
      const sisa = await req('GET', `/uploads/${fotoTerunggah.nama}`);
      if (sisa.status === 200) salah('pembersihan: berkas tidak ikut terhapus', fotoTerunggah.nama);
      else ok('dibersihkan kembali (foto uji dihapus, tidak ada bekas)');
    }
  }

  console.log(
    gagal.length
      ? `\n=== ${gagal.length} GAGAL ===`
      : '\n=== Semua pemeriksaan lolos ==='
  );
  process.exit(gagal.length ? 1 : 0);
})();
