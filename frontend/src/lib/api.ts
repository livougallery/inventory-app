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

export async function withCsrf(init: RequestInit = {}): Promise<RequestInit> {
  const { csrfToken } = await apiJson<{ csrfToken: string }>('/api/csrf');
  return {
    ...init,
    headers: { ...(init.headers ?? {}), 'x-csrf-token': csrfToken },
  };
}
