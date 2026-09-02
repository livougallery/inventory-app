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
