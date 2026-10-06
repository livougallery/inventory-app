# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root
- **`docs/adr/`**: read ADRs that touch the area you're about to work in

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_

## Catatan untuk repo ini

`CONTEXT.md` **sudah ada** per 2026-09-24, dibuat dari sesi `grilling` stage Cutting & Receive.
Bagian "read these" di atas berlaku sejak sekarang: baca `CONTEXT.md` sebelum mengeksplorasi,
dan pakai istilahnya saat menamai hal di tiket, test, atau kode.

Cakupan glosariumnya masih terbatas pada **Production Fulfillment** (fulfillment, cutting,
receive, kesesuaian) plus istilah produksi/biaya yang sudah lama dipakai. Istilah lama lain
(material, varian, batch produksi, HPP, PO) belum dimasukkan — tambahkan saat ada yang benar
benar perlu diputuskan, jangan borongan.

`docs/adr/` masih kosong. Keputusan yang sulit dibalik dan butuh konteks untuk pembaca nanti
dicatat di situ; sejauh ini belum ada yang memenuhi syarat itu.

Konteks teknis yang sudah terdokumentasi ada di `CLAUDE.md` (database Supabase, cara menjalankan
app, konvensi UI) dan skema database di `db.js` serta `features/`.
