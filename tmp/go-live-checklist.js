/**
 * Go-Live Checklist: interactive prompt version of the plan's Section 7 checklist.
 *
 * Run AFTER starting the app:
 *   node tmp/go-live-checklist.js
 *
 * The user walks through each item, marking it done/failed/skip interactively.
 * At the end a summary is printed. Non-interactive (piped) runs default to
 * "print only" mode so the checklist can be reviewed without a TTY.
 */
const readline = require('readline');

const CHECKLIST = [
  {
    id: 1,
    item: '.env ada, DATABASE_URL URL-encoded benar (password @ → %40)',
    verify: 'cat .env | grep DATABASE_URL  (password harus %40, bukan @)',
  },
  {
    id: 2,
    item: 'node -e "require(\'./db\').query(\'SELECT NOW()\')" → return timestamp Supabase',
    verify: 'node -e "const db=require(\'./db\'); db.query(\'SELECT NOW() AS t\').then(r=>console.log(r.rows[0].t)).catch(e=>{console.error(e);process.exit(1)})"',
  },
  {
    id: 3,
    item: 'npm test → semua suite pass',
    verify: 'npx jest --no-cache --verbose',
  },
  {
    id: 4,
    item: 'npm start → app jalan tanpa error boot',
    verify: 'npm start  →  harus cetak "Server running at http://localhost:3000"',
  },
  {
    id: 5,
    item: 'Login admin → success, session persist setelah refresh',
    verify: 'Buka http://localhost:3000/login → admin/admin123 → refresh halaman → tetap login',
  },
  {
    id: 6,
    item: 'CRUD vendor → create + edit + delete success',
    verify: 'Menu Vendor → Tambah → Edit → Hapus, cek per step tidak error',
  },
  {
    id: 7,
    item: 'Buat PO → add items → validate → stok bahan naik (FIFO batch created)',
    verify: 'Menu Purchase Order → buat PO + items → Validate → cek raw_materials.stok & material_batches naik',
  },
  {
    id: 8,
    item: 'Buat production batch → add costs → validate → HPP terhitung',
    verify: 'Menu Production Batch → buat batch + costs → Validate → cek hpp_history & product_variants.hpp_saat_ini update',
  },
  {
    id: 9,
    item: 'Bandingkan data: row count per tabel SQLite vs Supabase sama',
    verify: 'Jalankan script verifikasi row count (lihat Task 4 Step 3 di plan)',
  },
  {
    id: 10,
    item: 'Git commit di branch supabase-migration, main tetap SQLite',
    verify: 'git branch  →  supabase-migration ada & HEAD-nya. main tetap di commit SQLite',
  },
  {
    id: 11,
    item: 'Push & merge ke main setelah smoke test 1-2 hari gak ada keluhan',
    verify: 'Tunggu 1-2 hari pemakaian normal tanpa keluhan, lalu git push & PR merge',
  },
];

const STATUS = {
  DONE: { label: 'done', mark: '[x]' },
  FAIL: { label: 'fail', mark: '[!] ' },
  SKIP: { label: 'skip', mark: '[ ]' },
};

function printHeader() {
  console.log('');
  console.log('============================================================');
  console.log('  Go-Live Checklist — Supabase PostgreSQL Migration');
  console.log('  (from plan Section 7)');
  console.log('============================================================');
  console.log('');
  console.log('Mark each item: [d]one / [f]ail / [s]kip / [enter]=skip');
  console.log('');
}

function printItem(entry, status) {
  const mark = status ? status.mark : '[ ]';
  console.log(`${mark} ${entry.id}. ${entry.item}`);
  console.log(`      Verify: ${entry.verify}`);
  console.log('');
}

function printSummary(results) {
  console.log('');
  console.log('============================================================');
  console.log('  Checklist Summary');
  console.log('============================================================');
  const done = results.filter(r => r.status === STATUS.DONE).length;
  const fail = results.filter(r => r.status === STATUS.FAIL).length;
  const skip = results.filter(r => r.status === STATUS.SKIP).length;
  const total = results.length;
  console.log(`  Done : ${done}/${total}`);
  console.log(`  Fail : ${fail}/${total}`);
  console.log(`  Skip : ${skip}/${total}`);
  console.log('');
  if (fail > 0) {
    console.log('  FAILED items:');
    results.filter(r => r.status === STATUS.FAIL).forEach(r => {
      console.log(`    [!] ${r.entry.id}. ${r.entry.item}`);
    });
    console.log('');
  }
  if (done === total) {
    console.log('  ALL ITEMS DONE — ready to merge to main.');
  } else if (fail === 0 && done > 0) {
    console.log(`  ${done}/${total} done, ${skip} skipped. Resolve remaining before merge.`);
  } else if (fail > 0) {
    console.log('  BLOCKERS PRESENT — fix failed items before merge.');
  } else {
    console.log('  Nothing marked done yet.');
  }
  console.log('');
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve((answer || '').trim().toLowerCase()));
  });
}

async function runInteractive() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const results = [];
  printHeader();
  for (const entry of CHECKLIST) {
    printItem(entry, null);
    const ans = await ask(rl, `  Mark [d]one/[f]ail/[s]kip (Enter=skip): `);
    let status;
    if (ans === 'd' || ans === 'done') status = STATUS.DONE;
    else if (ans === 'f' || ans === 'fail') status = STATUS.FAIL;
    else status = STATUS.SKIP;
    results.push({ entry, status });
    console.log('');
  }
  rl.close();
  console.log('');
  console.log('------------------------------------------------------------');
  console.log('  Final checklist:');
  console.log('------------------------------------------------------------');
  results.forEach(({ entry, status }) => printItem(entry, status));
  printSummary(results);
  const failCount = results.filter(r => r.status === STATUS.FAIL).length;
  process.exit(failCount > 0 ? 1 : 0);
}

function runPrintOnly() {
  console.log('');
  console.log('============================================================');
  console.log('  Go-Live Checklist — Supabase PostgreSQL Migration');
  console.log('  (print-only mode — no TTY detected)');
  console.log('============================================================');
  console.log('');
  CHECKLIST.forEach(entry => printItem(entry, null));
  console.log('------------------------------------------------------------');
  console.log('  Run interactively (with a terminal) to mark each item.');
  console.log('------------------------------------------------------------');
  console.log('');
  process.exit(0);
}

const isTTY = process.stdin.isTTY;
if (isTTY) {
  runInteractive().catch((err) => {
    console.error('Checklist error:', err.message);
    process.exit(1);
  });
} else {
  runPrintOnly();
}
