import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoaderCircle, Plus } from 'lucide-react';
import { apiJson, withCsrf } from '@/lib/api';

// ===== Dropdown yang bisa menambah entri baru =====
//
// Inti permintaan owner: saat mengisi form, vendor atau barang yang belum ada
// harus bisa langsung diketik di situ — tidak perlu membuka halaman master
// data dulu. Komponen ini menambahkan satu pilihan "Tambah …" di dasar
// dropdown yang sudah ada; memilihnya membuka satu baris isian singkat.
//
// Sengaja dibangun di atas `Select` yang sudah dipakai CreatePoDialog, bukan
// memakai Combobox: Select sudah terbukti berjalan di codebase ini (termasuk
// pola sentinel dan fungsi child pada SelectValue), jadi permukaan API baru
// yang bisa salah tinggal sedikit.

// Sentinel untuk "belum memilih". Dipakai karena base-ui Select memakai `null`
// untuk menandai keadaan tidak terkendali — pola yang sama sudah dipakai
// dropdown Flow Transaksi di CreatePoDialog.
const NONE = 'none';

// Penanda pilihan "tambah baru". Diawali dan diakhiri garis bawah ganda supaya
// tidak mungkin berbenturan dengan id yang dikirim server.
const BARU = '__baru__';

export interface OpsiCreatable {
  id: number;
  label: string;
}

export interface FieldTambahan {
  /** Nama field sesuai yang diharapkan endpoint, mis. `tipe`. */
  name: string;
  label: string;
  /** Kalau diisi, dirender sebagai dropdown. Kalau tidak, sebagai isian teks. */
  options?: { value: string; label: string }[];
  defaultValue?: string;
  /**
   * Nilai tetap yang dikirim apa adanya tanpa ditampilkan. Dipakai untuk field
   * wajib server yang sudah pasti nilainya di konteks form ini — misal tipe
   * vendor di form PO selalu `bahan_baku`, dan menampilkannya hanya memberi
   * kesempatan salah isi.
   */
  fixed?: boolean;
}

interface CreatableSelectProps {
  id?: string;
  value: number | null;
  onChange: (id: number | null) => void;
  options: OpsiCreatable[];
  placeholder?: string;
  disabled?: boolean;
  /** Dipakai di label tombol: "Tambah vendor baru…" */
  namaEntitas: string;
  /** Endpoint POST yang menerima `{ nama, ...fieldTambahan }`. */
  endpoint: string;
  /** Field selain nama yang dikirim saat membuat entri baru. */
  fieldTambahan?: FieldTambahan[];
  /** Dipanggil setelah berhasil membuat, supaya pemanggil memuat ulang opsi. */
  onCreated?: () => void;
}

export default function CreatableSelect({
  id,
  value,
  onChange,
  options,
  placeholder = 'Pilih',
  disabled = false,
  namaEntitas,
  endpoint,
  fieldTambahan = [],
  onCreated,
}: CreatableSelectProps) {
  const [membuat, setMembuat] = useState(false);
  const [teks, setTeks] = useState('');
  const [nilaiField, setNilaiField] = useState<Record<string, string>>({});
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fokus ke isian nama begitu baris "tambah baru" muncul, supaya pengguna
  // bisa langsung mengetik tanpa mengarahkan kursor dulu.
  useEffect(() => {
    if (membuat) inputRef.current?.focus();
  }, [membuat]);

  const nilaiAwalField = () =>
    Object.fromEntries(fieldTambahan.map((f) => [f.name, f.defaultValue ?? ''])) as Record<
      string,
      string
    >;

  // Field bertipe dropdown atau teks harus terisi sebelum bisa disimpan.
  // Field `fixed` dilewati karena nilainya sudah pasti ada.
  const fieldWajib = fieldTambahan.filter((f) => !f.fixed);
  const fieldLengkap = fieldWajib.every((f) => (nilaiField[f.name] ?? '').trim() !== '');

  const handleChange = (v: unknown) => {
    const s = typeof v === 'string' ? v : null;
    if (s === BARU) {
      setNilaiField(nilaiAwalField());
      setMembuat(true);
      setError(null);
      return;
    }
    // Memilih entri yang sudah ada membatalkan baris "tambah baru" yang
    // mungkin sedang terbuka.
    setMembuat(false);
    setError(null);
    if (!s || s === NONE) {
      onChange(null);
      return;
    }
    onChange(Number(s));
  };

  const batal = () => {
    setMembuat(false);
    setTeks('');
    setError(null);
  };

  const simpan = async () => {
    const nama = teks.trim();
    if (!nama) return;

    // Cek kembar tanpa mempedulikan huruf besar-kecil, sebelum menulis ke
    // server. Tanpa ini, "Vendor A" dan "vendor a" menjadi dua entitas
    // berbeda — persis kekacauan yang dicegah index unik `uq_negara_nama`
    // pada tabel negara. Kebanyakan tabel di sini belum punya index itu,
    // jadi pengecekan dilakukan di klien.
    const kembar = options.find((o) => o.label.trim().toLowerCase() === nama.toLowerCase());
    if (kembar) {
      onChange(kembar.id);
      batal();
      return;
    }

    setMenyimpan(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { ...nilaiField, nama };
      const init = await withCsrf({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const res = await apiJson<{ data: { id: number } }>(endpoint, init);
      onChange(res.data.id);
      batal();
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menambah data');
    } finally {
      setMenyimpan(false);
    }
  };

  const opsiValue = value === null ? NONE : String(value);

  return (
    <div className="space-y-2">
      <Select value={opsiValue} onValueChange={handleChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          {/* Fungsi child: tanpa ini trigger menampilkan id mentah, bukan
              labelnya. Pola sama dengan dropdown vendor/material sebelumnya. */}
          <SelectValue placeholder={placeholder}>
            {(v) => options.find((o) => String(o.id) === String(v))?.label ?? placeholder}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{placeholder}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={String(o.id)}>
              {o.label}
            </SelectItem>
          ))}
          <SelectItem value={BARU}>
            <span className="flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Tambah {namaEntitas} baru…
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      {membuat && (
        <div className="space-y-2 rounded-lg border bg-muted/40 p-2">
          <Input
            ref={inputRef}
            value={teks}
            onChange={(e) => setTeks(e.target.value)}
            placeholder={`Nama ${namaEntitas} baru`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                // Cegah Enter mengirim form induk (PO) sebelum entri baru ini
                // tersimpan.
                e.preventDefault();
                e.stopPropagation();
                void simpan();
              }
            }}
          />

          {fieldWajib.map((f) => (
            <div key={f.name} className="space-y-1">
              <span className="text-xs text-muted-foreground">{f.label}</span>
              {f.options ? (
                <Select
                  value={nilaiField[f.name] || NONE}
                  onValueChange={(v) =>
                    setNilaiField((prev) => ({
                      ...prev,
                      [f.name]: !v || v === NONE ? '' : String(v),
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    {/* Fungsi child WAJIB: tanpa ini SelectValue menampilkan
                        nilai mentah ("kain_roll"), bukan label tampilannya
                        ("Fabric Roll"). */}
                    <SelectValue placeholder={`Pilih ${f.label.toLowerCase()}`}>
                      {(v) => {
                        const o = f.options?.find((x) => x.value === String(v));
                        return o ? o.label : `Pilih ${f.label.toLowerCase()}`;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Pilih {f.label.toLowerCase()}</SelectItem>
                    {f.options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={nilaiField[f.name] ?? ''}
                  onChange={(e) =>
                    setNilaiField((prev) => ({ ...prev, [f.name]: e.target.value }))
                  }
                  placeholder={f.label}
                />
              )}
            </div>
          ))}

          {error && (
            <p className="text-xs text-red-600" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={batal} disabled={menyimpan}>
              Batal
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void simpan()}
              disabled={menyimpan || teks.trim() === '' || !fieldLengkap}
            >
              {menyimpan ? (
                <>
                  <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" /> Menyimpan…
                </>
              ) : (
                'Simpan'
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
