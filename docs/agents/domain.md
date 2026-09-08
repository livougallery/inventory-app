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

`CONTEXT.md` dan `docs/adr/` belum ada per 2026-08-31. Sampai keduanya dibuat, bagian "read
these" di atas tidak berlaku: langsung eksplorasi kode tanpa perlu mencari atau menyarankan
file domain docs.

Konteks teknis yang sudah terdokumentasi ada di `CLAUDE.md` (database Supabase, cara menjalankan
app, konvensi UI). Untuk vocabulary domain gudang (material, varian, batch produksi, HPP, PO),
lihat kode dan skema database di `db.js` dan `features/`.
