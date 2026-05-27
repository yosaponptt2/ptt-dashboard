// Ingest parsed reports → Firestore via web SDK (works because rules are in test mode)
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, writeBatch, serverTimestamp } = require('firebase/firestore');
const { main: parseFile } = require('./parse.js');

const firebaseConfig = {
  apiKey: "AIzaSyAnL7choPqd9NVrptiFghzAh96FOIajbWw",
  authDomain: "ptt-samrej.firebaseapp.com",
  projectId: "ptt-samrej",
  storageBucket: "ptt-samrej.firebasestorage.app",
  messagingSenderId: "118765392504",
  appId: "1:118765392504:web:ccfdf1165a95e9c379938d",
};

async function ingest(filePath) {
  console.log(`Parsing ${filePath}...`);
  const t0 = Date.now();
  const { reports } = parseFile(filePath);
  console.log(`Parsed ${reports.length} reports in ${Date.now() - t0}ms`);

  console.log('Initializing Firebase...');
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  // Dedup by (date, business). Keep last (more complete) record.
  const byKey = new Map();
  for (const r of reports) {
    const key = `${r.date}_${r.business}`;
    byKey.set(key, r);
  }
  const unique = [...byKey.values()];
  console.log(`Deduped to ${unique.length} unique reports (by date+business)`);

  const reportsCol = collection(db, 'reports');
  const BATCH_SIZE = 400;
  let written = 0;
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const slice = unique.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const r of slice) {
      const id = `${r.date}_${r.business}`;
      const ref = doc(reportsCol, id);
      batch.set(ref, {
        business: r.business,
        date: r.date,
        parsed: r.parsed,
        rawText: r.rawText.slice(0, 3000), // cap raw text size
        source: 'line-import',
        createdAt: serverTimestamp(),
      });
    }
    const tb = Date.now();
    await batch.commit();
    written += slice.length;
    console.log(`  Batch ${Math.ceil(i / BATCH_SIZE) + 1}: wrote ${slice.length} docs in ${Date.now() - tb}ms (total ${written}/${unique.length})`);
  }
  console.log(`\nDone. Wrote ${written} reports to Firestore.`);
  process.exit(0);
}

const file = process.argv[2];
if (!file) { console.error('Usage: node ingest.js <chat.txt>'); process.exit(1); }
ingest(file).catch((e) => { console.error('FAILED:', e); process.exit(1); });
