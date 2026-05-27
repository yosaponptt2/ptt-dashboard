// Analysis of historical sales reports
const { main: parseFile } = require('./parse.js');

const file = process.argv[2];
const { reports } = parseFile(file);

const fmt = (n) => n == null ? '-' : '฿' + Math.round(n).toLocaleString('en-US');
const fmtN = (n) => n == null ? '-' : Math.round(n).toLocaleString('en-US');

// Group by date+business (keep latest)
const map = new Map();
for (const r of reports) map.set(`${r.date}_${r.business}`, r);
const data = [...map.values()];

// Per-business
const amazon = data.filter(r => r.business === 'amazon');
const store = data.filter(r => r.business === 'store');
const fuel = data.filter(r => r.business === 'fuel');

// Sum helpers
const sumBy = (arr, fn) => arr.reduce((s, r) => s + (fn(r) || 0), 0);
const countNonNull = (arr, fn) => arr.filter(r => fn(r) != null).length;

console.log('═══════════════════════════════════════════════');
console.log('  สรุปยอดขายย้อนหลัง · ปตท.สำเร็จพัฒนา');
console.log('═══════════════════════════════════════════════');
console.log(`ช่วงข้อมูล: ${data.map(r => r.date).sort()[0]} → ${data.map(r => r.date).sort().reverse()[0]}`);
console.log(`รายงานทั้งหมด: ${data.length} ฉบับ`);
console.log(`  - คาเฟ่ อเมซอน: ${amazon.length} วัน`);
console.log(`  - ร้านสะดวกซื้อ: ${store.length} วัน`);
console.log(`  - สถานีน้ำมัน:  ${fuel.length} วัน`);

console.log('\n─── ยอดขายรวมตลอดช่วง ───────────────────');

const amzGross = sumBy(amazon, r => r.parsed.grossSales);
const amzNet = sumBy(amazon, r => r.parsed.netSales);
const amzCups = sumBy(amazon, r => r.parsed.cups);
const amzBakery = sumBy(amazon, r => r.parsed.bakery);

console.log('คาเฟ่ อเมซอน:');
console.log(`  ยอดขายรวม (gross):    ${fmt(amzGross)}`);
console.log(`  ยอดสุทธิ (net):       ${fmt(amzNet)}`);
console.log(`  แก้วเครื่องดื่ม:        ${fmtN(amzCups)} แก้ว`);
console.log(`  เบเกอรี่:             ${fmtN(amzBakery)} ชิ้น`);
console.log(`  เฉลี่ย/วัน:           ${fmt(amzGross / amazon.length)} · ${fmtN(amzCups / amazon.length)} แก้ว`);

const stSales = sumBy(store, r => r.parsed.sales);
const stCust = sumBy(store, r => r.parsed.customers);
const stDeliv = sumBy(store, r => r.parsed.delivery?.total?.amount);

console.log('\nร้านสะดวกซื้อ (7-11):');
console.log(`  ยอดขายรวม:           ${fmt(stSales)}`);
console.log(`  ลูกค้าทั้งหมด:        ${fmtN(stCust)} คน`);
console.log(`  Delivery 7-11 รวม:    ${fmt(stDeliv)}`);
console.log(`  เฉลี่ย/วัน:           ${fmt(stSales / store.length)} · ${fmtN(stCust / store.length)} ลูกค้า`);

const flAmt = sumBy(fuel, r => r.parsed.total?.amount);
const flLit = sumBy(fuel, r => r.parsed.total?.liters);

console.log('\nสถานีน้ำมัน:');
console.log(`  ยอดขายรวม:           ${fmt(flAmt)}`);
console.log(`  ปริมาณรวม:           ${fmtN(flLit)} ลิตร`);
console.log(`  ราคาเฉลี่ย:           ฿${(flAmt / flLit).toFixed(2)} / ลิตร`);
console.log(`  เฉลี่ย/วัน:           ${fmt(flAmt / fuel.length)} · ${fmtN(flLit / fuel.length)} ลิตร`);

console.log(`\n  ยอดขายรวม 3 ธุรกิจ:   ${fmt(amzGross + stSales + flAmt)}`);

// Monthly breakdown (last 12 months with data)
console.log('\n─── ยอดขายรายเดือน (เรียงล่าสุด → เก่า) ───');
const months = new Map();
for (const r of data) {
  const ym = r.date.slice(0, 7);
  if (!months.has(ym)) months.set(ym, { amazon: 0, store: 0, fuel: 0, fuelLiters: 0, customers: 0, cups: 0 });
  const m = months.get(ym);
  if (r.business === 'amazon') { m.amazon += r.parsed.grossSales || 0; m.cups += r.parsed.cups || 0; }
  if (r.business === 'store')  { m.store  += r.parsed.sales || 0;       m.customers += r.parsed.customers || 0; }
  if (r.business === 'fuel')   { m.fuel   += r.parsed.total?.amount || 0; m.fuelLiters += r.parsed.total?.liters || 0; }
}
const monthList = [...months.entries()].sort((a, b) => b[0].localeCompare(a[0]));
console.log('YYYY-MM    Amazon         Store          Fuel            Total          Cups   Cust    Liters');
console.log('────────   ────────────   ────────────   ─────────────   ─────────────  ─────  ─────   ───────');
for (const [ym, m] of monthList.slice(0, 18)) {
  const total = m.amazon + m.store + m.fuel;
  console.log(`${ym}    ${fmt(m.amazon).padStart(12)}   ${fmt(m.store).padStart(12)}   ${fmt(m.fuel).padStart(13)}   ${fmt(total).padStart(13)}  ${fmtN(m.cups).padStart(5)}  ${fmtN(m.customers).padStart(5)}   ${fmtN(m.fuelLiters).padStart(7)}`);
}

// Year-over-year
console.log('\n─── ยอดขายรายปี ───────────────────────');
const years = new Map();
for (const r of data) {
  const y = r.date.slice(0, 4);
  if (!years.has(y)) years.set(y, { amazon: 0, store: 0, fuel: 0, days: new Set() });
  const yr = years.get(y);
  yr.days.add(r.date);
  if (r.business === 'amazon') yr.amazon += r.parsed.grossSales || 0;
  if (r.business === 'store')  yr.store  += r.parsed.sales || 0;
  if (r.business === 'fuel')   yr.fuel   += r.parsed.total?.amount || 0;
}
const yearList = [...years.entries()].sort();
console.log('Year   Amazon          Store           Fuel             Total           Days');
for (const [y, yr] of yearList) {
  const total = yr.amazon + yr.store + yr.fuel;
  console.log(`${y}   ${fmt(yr.amazon).padStart(13)}   ${fmt(yr.store).padStart(13)}   ${fmt(yr.fuel).padStart(14)}   ${fmt(total).padStart(14)}   ${yr.days.size}`);
}

// Day-of-week pattern (sales avg by weekday) — fuel + store
console.log('\n─── ยอดขายเฉลี่ยตามวันในสัปดาห์ (น้ำมัน) ───');
const dow = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const byDow = Array.from({length: 7}, () => ({ count: 0, sum: 0 }));
for (const r of fuel) {
  const d = new Date(r.date).getDay();
  if (r.parsed.total?.amount != null) {
    byDow[d].count++;
    byDow[d].sum += r.parsed.total.amount;
  }
}
for (let i = 0; i < 7; i++) {
  const avg = byDow[i].count ? byDow[i].sum / byDow[i].count : 0;
  const barLen = avg > 0 ? Math.round((avg / Math.max(...byDow.map(x => x.sum / Math.max(x.count, 1)))) * 30) : 0;
  console.log(`  ${dow[i].padEnd(3)}  ${fmt(avg).padStart(11)}  ${'█'.repeat(barLen)}`);
}

// Top 5 best days (each biz)
console.log('\n─── 5 วันยอดขายสูงสุด ─────────────────');
const top = (arr, fn, name) => {
  const sorted = arr.filter(r => fn(r) != null).sort((a, b) => fn(b) - fn(a));
  console.log(`\n${name}:`);
  for (const r of sorted.slice(0, 5)) console.log(`  ${r.date}  ${fmt(fn(r))}`);
};
top(amazon, r => r.parsed.grossSales, 'คาเฟ่ อเมซอน');
top(store, r => r.parsed.sales, 'ร้านสะดวกซื้อ');
top(fuel, r => r.parsed.total?.amount, 'สถานีน้ำมัน');

// Recent trend: last 30 days vs prior 30 days
console.log('\n─── เปรียบเทียบ 30 วันล่าสุด vs 30 วันก่อนหน้า ───');
const sortedDates = [...new Set(data.map(r => r.date))].sort().reverse();
const last30 = new Set(sortedDates.slice(0, 30));
const prev30 = new Set(sortedDates.slice(30, 60));
function periodSum(arr, fn, dateSet) {
  return arr.filter(r => dateSet.has(r.date)).reduce((s, r) => s + (fn(r) || 0), 0);
}
function compare(name, arr, fn) {
  const cur = periodSum(arr, fn, last30);
  const prv = periodSum(arr, fn, prev30);
  const pct = prv > 0 ? ((cur - prv) / prv * 100) : 0;
  const arrow = pct >= 0 ? '▲' : '▼';
  console.log(`  ${name.padEnd(18)} ${fmt(cur).padStart(13)}  vs  ${fmt(prv).padStart(13)}  ${arrow} ${pct.toFixed(1)}%`);
}
compare('Amazon (gross)', amazon, r => r.parsed.grossSales);
compare('Store sales', store, r => r.parsed.sales);
compare('Fuel sales', fuel, r => r.parsed.total?.amount);
compare('Fuel volume (L)', fuel, r => r.parsed.total?.liters);

console.log('\n═══════════════════════════════════════════════');
