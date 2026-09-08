# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Catatan untuk tracker lokal

Tracker repo ini adalah file markdown di `.scratch/` (lihat `issue-tracker.md`), bukan GitHub
Issues. Karena itu label di atas **bukan** label GitHub yang perlu dibuat dulu: ia berwujud
baris `Status:` di dekat bagian atas tiap file isu.

Contoh:

```markdown
Status: ready-for-agent
```

Jangan jalankan `gh label create` untuk kelima label ini. Repo ini publik, dan membuat label
triage internal di sana tidak ada gunanya kalau isunya tidak pernah diterbitkan ke GitHub.
