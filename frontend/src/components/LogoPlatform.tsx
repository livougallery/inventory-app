// ===== Logo asli marketplace =====
//
// Sebelumnya tiap tempat menggambar lencana sendiri: huruf pertama nama
// platform di atas kotak berwarna merek ("S" oranye untuk Shopee). Pemilik
// meminta logo aslinya (19 Okt 2026) — huruf yang kebetulan sama untuk Shopee
// dan Shopify memang tidak bisa dibedakan sekilas, dan justru itu gunanya
// lencana: dikenali sebelum dibaca.
//
// Digambar sebagai SVG inline, bukan pustaka ikon. Alasannya bukan selera:
// paket ikon populer (lucide) TIDAK memuat logo merek — mereka sengaja
// mengeluarkannya — dan paket khusus merek (`simple-icons`) akan menambah satu
// dependensi produksi hanya untuk tiga gambar yang tidak akan berubah.
//
// Path-nya disalin dari Simple Icons 13.0.0 (CC0), bukan digambar ulang.
// Merek yang digambar "mirip tapi bukan" lebih buruk daripada tidak digambar
// sama sekali: ia terlihat seperti logo, jadi orang mempercayainya, padahal
// bentuknya salah.
//
// Warnanya diambil dari masing-masing brand:
//   Shopee  #EE4D2D  (oranye)
//   TikTok  #000000  (hitam; di tema gelap dibalik jadi putih, lihat di bawah)
//   Shopify #5E8E3E  (hijau — warna versi Simple Icons, bukan hijau gelap
//                     #95BF47 milik wordmark lamanya)
import type { Platform } from '@/lib/produk';

/** Satu logo: path SVG (viewBox 24×24) dan warnanya. */
const LOGO: Record<Platform, { path: string; warna: string }> = {
  shopee: {
    warna: '#EE4D2D',
    path:
      'M15.9414 17.9633c.229-1.879-.981-3.077-4.1758-4.0969-1.548-.528-2.277-1.22-2.26-2.1719.065-1.056 1.048-1.825 2.352-1.85a5.2898 5.2898 0 0 1 2.8838.89c.116.072.197.06.263-.039.09-.145.315-.494.39-.62.051-.081.061-.187-.068-.281-.185-.1369-.704-.4149-.983-.5319a6.4697 6.4697 0 0 0-2.5118-.514c-1.909.008-3.4129 1.215-3.5389 2.826-.082 1.1629.494 2.1078 1.73 2.8278.262.152 1.6799.716 2.2438.892 1.774.552 2.695 1.5419 2.478 2.6969-.197 1.047-1.299 1.7239-2.818 1.7439-1.2039-.046-2.2878-.537-3.1278-1.19l-.141-.11c-.104-.08-.218-.075-.287.03-.05.077-.376.547-.458.67-.077.108-.035.168.045.234.35.293.817.613 1.134.775a6.7097 6.7097 0 0 0 2.8289.727 4.9048 4.9048 0 0 0 2.0759-.354c1.095-.465 1.8029-1.394 1.9449-2.554zM11.9986 1.4009c-2.068 0-3.7539 1.95-3.8329 4.3899h7.6657c-.08-2.44-1.765-4.3899-3.8328-4.3899zm7.8516 22.5981-.08.001-15.7843-.002c-1.074-.04-1.863-.91-1.971-1.991l-.01-.195L1.298 6.2858a.459.459 0 0 1 .45-.494h4.9748C6.8448 2.568 9.1607 0 11.9996 0c2.8388 0 5.1537 2.5689 5.2757 5.7898h4.9678a.459.459 0 0 1 .458.483l-.773 15.5883-.007.131c-.094 1.094-.979 1.9769-2.0709 2.0059z',
  },
  tiktok: {
    // Hitam di tema terang, putih di tema gelap: logo hitam di atas latar
    // gelap sama saja dengan tidak ada logo. `currentColor` yang membuatnya
    // bisa mengikuti tema, karena `text-white dark:text-black` salah arah —
    // yang benar justru sebaliknya, dan itu gampang tertukar.
    warna: 'currentColor',
    path:
      'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
  },
  shopify: {
    warna: '#5E8E3E',
    path:
      'M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.116-.114-.192-.211-.192s-1.929-.136-1.929-.136-1.275-1.274-1.439-1.411c-.045-.037-.075-.057-.121-.074l-.914 21.104h.023zM11.71 11.305s-.81-.424-1.774-.424c-1.447 0-1.504.906-1.504 1.141 0 1.232 3.24 1.715 3.24 4.629 0 2.295-1.44 3.76-3.406 3.76-2.354 0-3.54-1.465-3.54-1.465l.646-2.086s1.245 1.066 2.28 1.066c.675 0 .975-.545.975-.932 0-1.619-2.654-1.694-2.654-4.359-.034-2.237 1.571-4.416 4.827-4.416 1.257 0 1.875.361 1.875.361l-.945 2.715-.02.01zM11.17.83c.136 0 .271.038.405.135-.984.465-2.064 1.639-2.508 3.992-.656.213-1.293.405-1.889.578C7.697 3.75 8.951.84 11.17.84V.83zm1.235 2.949v.135c-.754.232-1.583.484-2.394.736.466-1.777 1.333-2.645 2.085-2.971.193.501.309 1.176.309 2.1zm.539-2.234c.694.074 1.141.867 1.429 1.755-.349.114-.735.231-1.158.366v-.252c0-.752-.096-1.371-.271-1.871v.002zm2.992 1.289c-.02 0-.06.021-.078.021s-.289.075-.714.21c-.423-1.233-1.176-2.37-2.508-2.37h-.115C12.135.209 11.669 0 11.265 0 8.159 0 6.675 3.877 6.21 5.846c-1.194.365-2.063.636-2.16.674-.675.213-.694.232-.772.87-.075.462-1.83 14.063-1.83 14.063L15.009 24l.927-21.166z',
  },
};

/**
 * Logo satu platform.
 *
 * `aria-hidden` selalu: di semua pemakaiannya ada nama platform sebagai teks
 * di sebelahnya, dan pembaca layar yang menyebut "Shopee" dua kali lebih
 * membingungkan daripada tidak menyebut logonya sama sekali.
 *
 * Bukan `title` di dalam SVG-nya: itu memunculkan tooltip peramban yang
 * menutupi barisnya, padahal yang mau dibaca di baris itu justru statusnya.
 */
export function LogoPlatform({
  platform,
  className = 'h-4 w-4',
}: {
  platform: Platform;
  className?: string;
}) {
  const logo = LOGO[platform];
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
      // TikTok memakai `currentColor`: hitam di tema terang, putih di tema
      // gelap. Dua yang lain memakai warna mereknya sendiri, yang sudah
      // kontras di kedua tema.
      className={
        logo.warna === 'currentColor'
          ? `${className} text-black dark:text-white`
          : className
      }
      fill={logo.warna}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={logo.path} />
    </svg>
  );
}
