// ===== Helper API bersama untuk semua halaman React =====
// Pola: fetch JSON + CSRF fresh sebelum tiap mutasi
// (server merotasi token setelah setiap mutasi berhasil).
// Hidup di lib/ agar tidak ada halaman yang mengimpor dari file halaman lain.

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...init });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.ok !== true) {
    throw new Error(json?.error ?? `HTTP ${res.status}`);
  }
  return json as T;
}

// Ambil token CSRF fresh, lalu tempel ke header mutasi.
//
// Tidak boleh lewat apiJson: endpoint /api/csrf menjawab `{ csrfToken }` polos,
// tanpa field `ok`, jadi apiJson akan selalu melempar "HTTP 200" walau
// permintaan berhasil. Token diambil dengan fetch langsung dan bentuknya
// divalidasi di sini.
export async function withCsrf(init: RequestInit = {}): Promise<RequestInit> {
  const res = await fetch('/api/csrf', { credentials: 'same-origin' });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || typeof json.csrfToken !== 'string') {
    throw new Error(`Gagal mengambil token CSRF (HTTP ${res.status})`);
  }
  return {
    ...init,
    headers: { ...(init.headers ?? {}), 'x-csrf-token': json.csrfToken },
  };
}

// Merakit URL berkas yang diunggah (foto nota PO, foto material).
//
// Hidup di sini, bukan di tiap halaman, supaya tidak ada dua tempat yang
// menulis prefix /uploads/ dengan cara berbeda — kalau lokasinya berpindah,
// yang berubah satu baris, bukan dua halaman.
//
// encodeURIComponent pada nama berkasnya: nama dihasilkan server dari cap
// waktu dan bagian acak, jadi secara praktis aman, tetapi menggabungkan
// string mentah ke URL adalah kebiasaan yang cepat atau lambat melukai diri
// sendiri.
export function urlUnggahan(namaBerkas: string | null | undefined): string {
  if (!namaBerkas) return '';
  return `/uploads/${encodeURIComponent(namaBerkas)}`;
}

// Unggah satu berkas ke endpoint foto. FormData dipakai karena multer hanya
// menerima multipart/form-data; token CSRF dikirim sebagai header, bukan field
// form, karena server memeriksanya sebelum membaca badan permintaan.
export async function unggahFoto(
  endpoint: string,
  berkas: File,
  field = 'foto'
): Promise<{ file_path: string }> {
  const fd = new FormData();
  fd.append(field, berkas);
  const init = await withCsrf({ method: 'POST', body: fd });
  return apiJson<{ data: { file_path: string } }>(endpoint, init).then((r) => r.data);
}

// Hapus berkas foto. Token CSRF diambil ulang oleh withCsrf karena server
// merotasi token setelah setiap mutasi berhasil.
export async function hapusFoto(endpoint: string): Promise<void> {
  const init = await withCsrf({ method: 'DELETE' });
  await apiJson(endpoint, init);
}
