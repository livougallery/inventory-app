import { useState } from 'react';
import BannerPratinjau from '@/components/BannerPratinjau';
import { Button } from '@/components/ui/button';
import PapanFulfillment from './PapanFulfillment';
import {
  KARTU_PRODUCTION,
  KARTU_WHITELABEL,
  PAPAN_PRODUCTION,
  PAPAN_WHITELABEL,
} from './data-kanban';

// ===== Halaman papan: PROGRESS > Production Fulfillment =====
//
// Papan ini DIPISAH dari tabel 40 kolom, dan pemisahannya disengaja bukan
// sekadar penataan menu. Keduanya menjawab pertanyaan yang berbeda:
//
//   - Papan menjawab "pekerjaan mana yang sedang di tahap mana" — dibaca
//     sambil bergerak, sering, dan yang penting justru sebarannya.
//   - Tabel menjawab "kolom apa saja yang dicatat untuk satu pekerjaan" —
//     dibaca saat menyusun laporan, dengan 40 kolom yang perlu tempat lebar.
//
// Selama keduanya satu halaman, papan selalu jadi tampilan kedua: ia berbagi
// ruang dengan toolbar tabel, dan tiap kali halaman dibuka yang terlihat lebih
// dulu adalah tabel. Pemisahan ini menaruh papan di tempatnya sendiri, dan
// menyisakan tabel di Master Data bersama enam modul lain yang bentuknya
// memang tabel.
//
// Saklar Production / White Label TETAP di sini, bukan dinaikkan ke sidebar:
// keduanya papan yang sama dengan tahap berbeda, dan memindahkannya ke menu
// akan membuat sidebar berisi dua entri yang isinya 90% sama.

export default function PapanProduksi() {
  const [sumber, setSumber] = useState<'production' | 'whitelabel'>('production');

  const papan = sumber === 'production' ? PAPAN_PRODUCTION : PAPAN_WHITELABEL;
  const kartu = sumber === 'production' ? KARTU_PRODUCTION : KARTU_WHITELABEL;

  return (
    <div className="space-y-4">
      <BannerPratinjau modul="Production Fulfillment" bentuk="papan" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Saklar papan. Sengaja tetap satu baris dengan judul tahapannya,
            bukan tab di atas papan: yang berpindah di sini cuma sumber
            datanya, dan papannya sendiri langsung terlihat berubah. */}
        <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
          {(
            [
              { id: 'production', label: 'Production' },
              { id: 'whitelabel', label: 'White Label' },
            ] as const
          ).map((s) => (
            <Button
              key={s.id}
              variant={sumber === s.id ? 'default' : 'ghost'}
              size="sm"
              aria-pressed={sumber === s.id}
              onClick={() => setSumber(s.id)}
            >
              {s.label}
            </Button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          {papan.length} tahap • {kartu.length} kartu contoh
        </p>
      </div>

      {/* Papan TIDAK di-remount saat sumber ditukar.
          Sebelumnya di sini ada `key={sumber}`, dan komentarnya ditulis saat
          papan belum menyimpan apa pun — dulu `key` itu memang cuma menyegarkan
          tampilan. Sekarang tidak: `kartuTambahan`, `pindah`, dan seluruh
          `siapBahan` hidup di dalam PapanFulfillment. Dengan `key`, menukar ke
          White Label lalu kembali menghapus kartu yang baru ditambahkan dan
          semua centang yang sudah dikerjakan — pekerjaan pengguna, bukan
          sekadar tampilan basi.

          Tanpa `key`, state itu tetap terpisah per papan karena id kartunya
          berbeda: kartu Production ber-id `p-*`, White Label `w-*`, dan kartu
          baru `b-*`. Peta `pindah`/`siapBahan` di-key oleh id kartu, jadi
          menukar papan tidak pernah mencampurnya. */}
      <PapanFulfillment stages={papan} kartu={kartu} sumber={sumber} />
    </div>
  );
}
