// Validasi id dari parameter URL — dipakai bersama oleh semua fitur JSON API.
//
// Dulu tiap fitur mengetik ulang validasinya (negara, vendor, purchase-order),
// jadi kalau aturannya berubah satu fitur bisa ketinggalan. Sekarang satu
// definisi dipakai di mana-mana.
//
// Alasan id HARUS divalidasi sebelum dipakai: kalau tidak, '/abc' diteruskan
// ke Postgres dan memicu 22P02 (invalid input syntax for integer) yang berujung
// 500, padahal yang diminta klien adalah 404. Ini bukan khayalan — dibuktikan
// dengan menjalankan query-nya langsung: `WHERE id = 'abc'` sungguh melempar
// 22P02, dan test di tiap fitur membuktikan endpoint menjawab 500 tanpanya.
//
// Regex dipakai sebelum Number() karena Number() meloloskan '1.0', ' 1 ', dan
// '+1' sebagai id 1 — itu memberi satu baris database beberapa ejaan URL yang
// semuanya dianggap sah. Mengembalikan null kalau bukan id yang sah.
const parseId = (raw) => {
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw)) return null;
  return Number(raw);
};

module.exports = { parseId };
