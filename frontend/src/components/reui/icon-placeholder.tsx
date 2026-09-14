// Pengganti `icon-placeholder` milik contoh reui.
//
// Komponen aslinya (`@/app/(create)/components/icon-placeholder`) milik situs
// demo reui: ia menerima tiga nama ikon sekaligus (lucide/tabler/hugeicons)
// supaya satu cuplikan kode bisa menghasilkan tampilan untuk tiga pustaka
// ikon berbeda. Di sini tidak ada situs demo itu, jadi yang dipakai hanya
// cabang `lucide` — pustaka yang sudah terpasang di project ini.
//
// Dibuat sebagai pengganti, bukan menyunting 6 berkas data-grid: kalau reui
// merilis pembaruan, berkas-berkas itu bisa ditimpa ulang tanpa konflik.

import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowLeftToLineIcon,
  ArrowRightIcon,
  ArrowRightToLineIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  CirclePlusIcon,
  GripHorizontalIcon,
  GripVerticalIcon,
  PinOffIcon,
  PlusIcon,
  Settings2Icon,
  type LucideIcon,
} from 'lucide-react';

const IKON: Record<string, LucideIcon> = {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowLeftToLineIcon,
  ArrowRightIcon,
  ArrowRightToLineIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  CirclePlusIcon,
  GripHorizontalIcon,
  GripVerticalIcon,
  PinOffIcon,
  PlusIcon,
  Settings2Icon,
};

interface IconPlaceholderProps {
  /** Nama ikon lucide, mis. "ChevronLeftIcon". */
  lucide: string;
  className?: string;
  // Tiga prop berikut dikirim cuplikan reui untuk pustaka ikon lain yang
  // tidak dipakai project ini. Diterima lalu diabaikan — kalau tidak
  // dideklarasikan, TypeScript menolak setiap pemakaian <IconPlaceholder />
  // di keenam berkas data-grid.
  tabler?: string;
  hugeicons?: string;
  phosphor?: string;
  remixicon?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}

export function IconPlaceholder({ lucide, className }: IconPlaceholderProps) {
  const Ikon = IKON[lucide];
  if (!Ikon) return null;
  return <Ikon className={className} />;
}
