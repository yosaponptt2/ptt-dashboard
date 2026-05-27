// LINE chat → structured reports parser (line-based, no catastrophic backtracking)
const fs = require('fs');

const THAI_MONTHS = {
  'มกราคม':1, 'กุมภาพันธ์':2, 'มีนาคม':3, 'เมษายน':4,
  'พฤษภาคม':5, 'พฤศภาคม':5, 'มิถุนายน':6, 'กรกฎาคม':7, 'สิงหาคม':8,
  'กันยายน':9, 'ตุลาคม':10, 'พฤศจิกายน':11, 'ะฤศจิกายน':11, 'พฤษจิกายน':11,
  'ธันวาคม':12,
};

const num = (s) => {
  if (s == null) return null;
  const cleaned = String(s).replace(/[,  ]/g, '');
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : null;
};
const beToAd = (y) => (y > 2400 ? y - 543 : y);
const pad = (n) => String(n).padStart(2, '0');

function parseDate(s) {
  if (!s) return null;
  let m = s.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/);
  if (m) {
    const d = +m[1], mo = +m[2], y = beToAd(+m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad(mo)}-${pad(d)}`;
  }
  const monthNames = Object.keys(THAI_MONTHS);
  for (const mn of monthNames) {
    const i = s.indexOf(mn);
    if (i < 0) continue;
    // Find a 1-2 digit day before the month name (within ~20 chars)
    const before = s.slice(Math.max(0, i - 25), i);
    const dm = before.match(/(\d{1,2})[^\d]*$/);
    if (!dm) continue;
    // Find 4-digit year after the month
    const after = s.slice(i + mn.length, i + mn.length + 25);
    const ym = after.match(/(\d{4})/);
    if (!ym) continue;
    const d = +dm[1], mo = THAI_MONTHS[mn], y = beToAd(+ym[1]);
    if (d >= 1 && d <= 31) return `${y}-${pad(mo)}-${pad(d)}`;
  }
  return null;
}

// ===== chat structure =====
function parseChat(text) {
  const lines = text.split(/\r?\n/);
  const dayHeaderRe = /^[จอพศสห][า\.ฤ]*\.\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/;
  const msgRe = /^(\d{2}):(\d{2})\t([^\t]*)\t(.*)$/;
  const days = [];
  let curDay = null;
  let curMsg = null;
  function flushMsg() {
    if (curMsg && curDay) {
      curMsg.body = curMsg.bodyLines.join('\n').trim();
      delete curMsg.bodyLines;
      curDay.messages.push(curMsg);
    }
    curMsg = null;
  }
  for (const line of lines) {
    const dm = line.match(dayHeaderRe);
    if (dm) {
      flushMsg();
      const d = +dm[1], mo = +dm[2], y = +dm[3];
      curDay = { dateISO: `${y}-${pad(mo)}-${pad(d)}`, messages: [] };
      days.push(curDay);
      continue;
    }
    const mm = line.match(msgRe);
    if (mm && curDay) {
      flushMsg();
      curMsg = { time: `${mm[1]}:${mm[2]}`, sender: mm[3], bodyLines: [mm[4]] };
      continue;
    }
    if (curMsg) curMsg.bodyLines.push(line);
  }
  flushMsg();
  return days;
}

// ===== line-based helpers =====
// Find first number anchored to a label, on the same line. Number can have commas / decimals.
const NUM_RE = /[-]?\d{1,3}(?:,\d{3})*(?:\.\d+)?|[-]?\d+(?:\.\d+)?/;

function findNumOnLine(lines, labelRe) {
  for (const line of lines) {
    if (!labelRe.test(line)) continue;
    const after = line.replace(labelRe, '');
    const m = after.match(NUM_RE);
    if (m) return num(m[0]);
  }
  return null;
}

// Find first number after a label even if number is on a following line within `lookahead` lines.
function findNumNear(lines, labelRe, lookahead = 3) {
  for (let i = 0; i < lines.length; i++) {
    if (!labelRe.test(lines[i])) continue;
    const after = lines[i].replace(labelRe, '');
    let m = after.match(NUM_RE);
    if (m) return num(m[0]);
    for (let j = 1; j <= lookahead && i + j < lines.length; j++) {
      m = lines[i + j].match(NUM_RE);
      if (m) return num(m[0]);
    }
  }
  return null;
}

// Find number anchored to two labels in sequence (label1 appears, then label2 within next few lines)
function findNumAfterPair(lines, label1Re, label2Re, gap = 5) {
  for (let i = 0; i < lines.length; i++) {
    if (!label1Re.test(lines[i])) continue;
    for (let j = 0; j <= gap && i + j < lines.length; j++) {
      const line = lines[i + j];
      if (!label2Re.test(line)) continue;
      const after = line.replace(label2Re, '');
      let m = after.match(NUM_RE);
      if (m) return num(m[0]);
      if (i + j + 1 < lines.length) {
        m = lines[i + j + 1].match(NUM_RE);
        if (m) return num(m[0]);
      }
    }
  }
  return null;
}

// ===== business detection =====
function detectBusiness(text) {
  if (/อเมซอน|ยอดแก้ว|Bakery|พรีเมียม/i.test(text)) return 'amazon';
  if (/ยอดขายน้ำมัน|รายงานยอดขายน้ำมัน|ราบงานยอดขายน้ำมัน|รายงายยอดขายน้ำมัน|กะ\s*เช้า|กะ\s*ดึก|รวมลิตร|น้ำมันหล่อลื่น/i.test(text)) return 'fuel';
  if (/18351|06055|เป้าหมายยอดขาย|เฉลี่ยลูกค้า|ต่อหัว|Delivery\s*7-?11/i.test(text)) return 'store';
  return null;
}

// ===== business parsers =====
function parseAmazon(text) {
  const lines = text.split('\n');
  const out = {
    grossSales: findNumOnLine(lines, /ยอดขายทั้งหมด/) ?? findNumOnLine(lines, /^\s*ยอดขาย\s*=/),
    netSales: findNumOnLine(lines, /ยอดขายหลังหัก/) ?? findNumOnLine(lines, /รวม\s*ยอดเงินทั้งหมด/) ?? findNumOnLine(lines, /ยอดเงินทั้งหมด/),
    cash: findNumOnLine(lines, /ยอดเงินสด/),
    discount: findNumOnLine(lines, /หักค่านม/),
    cups: null, bakery: null, premium: null, others: null,
  };
  for (const line of lines) {
    if (out.cups == null) {
      let m = line.match(/ยอดแก้ว\s*\*{0,3}\(?\s*(\d+)\s*\)?\s*แก้ว/);
      if (m) out.cups = +m[1];
      else { m = line.match(/ยอดแก้ว\s*(\d+)/); if (m) out.cups = +m[1]; }
    }
    if (out.bakery == null) {
      let m = line.match(/Bakery\s*\*{0,3}\(?\s*(\d+)\s*\)?/i);
      if (m) out.bakery = +m[1];
    }
    if (out.premium == null) {
      const m = line.match(/Premium\s+(\d+)\s*ชิ้น/i);
      if (m) {
        // amount may be on same line after "ยอดเงิน"
        const amtM = line.match(/ยอดเงิน\s*([\d,]+(?:\.\d+)?)/);
        out.premium = { qty: +m[1], amount: amtM ? num(amtM[1]) : null };
      }
    }
    if (out.others == null) {
      const m = line.match(/^\s*อื่นๆ\s*[:=]?\s*(\d+)/);
      if (m) out.others = +m[1];
    }
  }
  if (out.grossSales == null && out.netSales == null && out.cups == null) return null;
  return out;
}

function parseStore(text) {
  const lines = text.split('\n');
  const out = {
    code: (() => { for (const l of lines) { const m = l.match(/(\d{5})\s*ปตท/); if (m) return m[1]; } return null; })(),
    target: findNumOnLine(lines, /เป้าหมายยอดขาย/),
    sales: null, avgSales: null, customers: null, avgCustomers: null, perHead: null,
    cutToday: { cost: null, sales: null },
    cutAccum: { cost: null, sales: null },
    delivery: null,
  };
  // ยอดขาย = X  (avoid matching "เป้าหมายยอดขาย" or "ยอดขายน้ำมัน")
  for (const line of lines) {
    if (out.sales == null) {
      const m = line.match(/^\s*ยอดขาย\s*=\s*([\d,]+(?:\.\d+)?)/);
      if (m) out.sales = num(m[1]);
    }
    if (out.avgSales == null) {
      const m = line.match(/^\s*(?:ยอดเฉลี่ย|เฉลี่ย)\s*=\s*([\d,]+(?:\.\d+)?)/);
      if (m) out.avgSales = num(m[1]);
    }
    if (out.customers == null) {
      const m = line.match(/^\s*ลูกค้า\s*=\s*(\d+)/);
      if (m) out.customers = +m[1];
    }
    if (out.avgCustomers == null) {
      const m = line.match(/^\s*เฉลี่ยลูกค้า\s*=\s*([\d,]+(?:\.\d+)?)/);
      if (m) out.avgCustomers = num(m[1]);
    }
    if (out.perHead == null) {
      const m = line.match(/ต่อหัว\s*=\s*([\d,]+(?:\.\d+)?)/);
      if (m) out.perHead = num(m[1]);
    }
  }
  // ตัดจ่าย(วัน) block — find header then look at next ~4 lines for ทุน/ขาย
  for (let i = 0; i < lines.length; i++) {
    if (/ตัดจ่าย\s*\(\s*วัน\s*\)/.test(lines[i]) && !/สะสม/.test(lines[i])) {
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        if (out.cutToday.cost == null) {
          const m = lines[j].match(/ทุน\s*=?\s*([\d,]+(?:\.\d+)?)/);
          if (m) out.cutToday.cost = num(m[1]);
        }
        if (out.cutToday.sales == null) {
          const m = lines[j].match(/ขาย\s*=?\s*([\d,]+(?:\.\d+)?)/);
          if (m) out.cutToday.sales = num(m[1]);
        }
      }
    }
    if (/ตัดจ่าย\s*สะสม|\(\s*ตัดจ่ายสะสม\s*\)|ตัดจ่าย\(\s*สะสม\)/.test(lines[i])) {
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        if (out.cutAccum.cost == null) {
          const m = lines[j].match(/ทุน\s*=?\s*([\d,]+(?:\.\d+)?)/);
          if (m) out.cutAccum.cost = num(m[1]);
        }
        if (out.cutAccum.sales == null) {
          const m = lines[j].match(/ขาย\s*=?\s*([\d,]+(?:\.\d+)?)/);
          if (m) out.cutAccum.sales = num(m[1]);
        }
      }
    }
  }
  // Delivery
  if (/Delivery\s*7-?11|เช้าได้|บ่ายได้/i.test(text)) {
    let mornBills = null, mornAmt = null, afterBills = null, afterAmt = null, totalBills = null, totalAmt = null;
    for (let i = 0; i < lines.length; i++) {
      let m = lines[i].match(/เช้าได้\s*=\s*(\d+)/);
      if (m) {
        mornBills = +m[1];
        for (let j = i; j < Math.min(i + 4, lines.length); j++) {
          const a = lines[j].match(/จำนวนเงิน\s*=?\s*([\d,]+(?:\.\d+)?)/);
          if (a) { mornAmt = num(a[1]); break; }
        }
      }
      m = lines[i].match(/บ่ายได้\s*=\s*(\d+)/);
      if (m) {
        afterBills = +m[1];
        for (let j = i; j < Math.min(i + 4, lines.length); j++) {
          const a = lines[j].match(/จำนวนเงิน\s*=?\s*([\d,]+(?:\.\d+)?)/);
          if (a) { afterAmt = num(a[1]); break; }
        }
      }
      m = lines[i].match(/รวมทั้งหมด\s*=\s*(\d+)/);
      if (m) totalBills = +m[1];
      m = lines[i].match(/ยอดเงินรวม\s*=?\s*([\d,]+(?:\.\d+)?)/);
      if (m) totalAmt = num(m[1]);
    }
    out.delivery = {
      morning: { bills: mornBills, amount: mornAmt },
      afternoon: { bills: afterBills, amount: afterAmt },
      total: { bills: totalBills, amount: totalAmt },
    };
  }
  if (out.sales == null && out.target == null && out.customers == null && !out.delivery) return null;
  return out;
}

function parseFuel(text) {
  const lines = text.split('\n');
  const out = {
    morning: { liters: null, amount: null },
    night: { liters: null, amount: null },
    lubricant: { units: null, amount: null },
    total: { liters: null, amount: null },
  };
  // For modern format: line has "ยอดขายน้ำมัน กะ เช้า  X.XXX  ลิตร" → liters on same line; "ยอดเงิน  X  บาท" on next line
  // For old format: "กะเช้า  X  ลิตร" / "เป็นเงิน X บาท" next line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // morning liters
    if (out.morning.liters == null) {
      let m = line.match(/กะ\s*เช้า[^\d]{0,30}([\d,]+(?:\.\d+)?)\s*ลิตร/);
      if (!m) m = line.match(/กะ\s*เช้า[^\d]{0,30}([\d,]+(?:\.\d+)?)\s*$/);
      if (m) {
        out.morning.liters = num(m[1]);
        // amount in next few lines
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const a = lines[j].match(/(?:ยอดเงิน|เป็นเงิน|เป๋นเงิน)[^\d]{0,10}([\d,]+(?:\.\d+)?)/);
          if (a) { out.morning.amount = num(a[1]); break; }
        }
      }
    }
    if (out.night.liters == null) {
      let m = line.match(/กะ\s*ดึก[^\d]{0,30}([\d,]+(?:\.\d+)?)\s*ลิตร/);
      if (!m) m = line.match(/กะ\s*ดึก[^\d]{0,30}([\d,]+(?:\.\d+)?)\s*$/);
      if (m) {
        out.night.liters = num(m[1]);
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const a = lines[j].match(/(?:ยอดเงิน|เป็นเงิน|เป๋นเงิน)[^\d]{0,10}([\d,]+(?:\.\d+)?)/);
          if (a) { out.night.amount = num(a[1]); break; }
        }
      }
    }
    if (out.lubricant.units == null) {
      const m = line.match(/น้ำมันหล่อลื่น[^\d]{0,30}([\d,]+(?:\.\d+)?)/);
      if (m) {
        out.lubricant.units = num(m[1]);
        for (let j = i; j < Math.min(i + 4, lines.length); j++) {
          const a = lines[j].match(/ยอดเงิน[^\d]{0,10}([\d,]+(?:\.\d+)?)/);
          if (a) { out.lubricant.amount = num(a[1]); break; }
        }
      }
    }
    if (out.total.liters == null) {
      let m = line.match(/รวมลิตร[^\d]{0,20}([\d,]+(?:\.\d+)?)/);
      if (!m) m = line.match(/รวมทั้งสิ้น[^\d]{0,20}([\d,]+(?:\.\d+)?)/);
      if (m) out.total.liters = num(m[1]);
    }
    if (out.total.amount == null) {
      const m = line.match(/รวมเป็นเงิน[^\d]{0,20}([\d,]+(?:\.\d+)?)/);
      if (m) out.total.amount = num(m[1]);
    }
  }
  if (out.morning.liters == null && out.night.liters == null && out.total.liters == null) return null;
  return out;
}

// Split a message body into per-business chunks
function splitMessages(body) {
  const markers = [
    'ยอดขายประจำเดือน',
    'สรุปยอดขายน้ำมัน',
    'รายงานยอดขายน้ำมัน',
    'ราบงานยอดขายน้ำมัน',
    'รายงายยอดขายน้ำมัน',
    'รายงานยอดขาย',
  ];
  const positions = [0];
  for (const mk of markers) {
    let idx = 0;
    while ((idx = body.indexOf(mk, idx)) !== -1) {
      if (idx > 0) positions.push(idx);
      idx += mk.length;
    }
  }
  const uniq = [...new Set(positions)].sort((a, b) => a - b);
  if (uniq.length <= 1) return [body];
  const chunks = [];
  for (let i = 0; i < uniq.length; i++) {
    const end = i + 1 < uniq.length ? uniq[i + 1] : body.length;
    const c = body.slice(uniq[i], end).trim();
    if (c.length > 20) chunks.push(c);
  }
  return chunks;
}

function parseChunk(chunk, fallbackDate) {
  const business = detectBusiness(chunk);
  if (!business) return null;
  const date = parseDate(chunk) || fallbackDate;
  if (!date) return null;
  let parsed = null;
  if (business === 'amazon') parsed = parseAmazon(chunk);
  else if (business === 'store') parsed = parseStore(chunk);
  else if (business === 'fuel') parsed = parseFuel(chunk);
  if (!parsed) return null;
  return { business, date, parsed, rawText: chunk };
}

function main(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8').replace(/﻿/, '');
  const days = parseChat(text);
  const allReports = [];
  for (const day of days) {
    for (const msg of day.messages) {
      if (!msg.body || msg.body.length < 30) continue;
      const chunks = splitMessages(msg.body);
      for (const chunk of chunks) {
        const rep = parseChunk(chunk, day.dateISO);
        if (rep) allReports.push(rep);
      }
    }
  }
  return { days: days.length, reports: allReports };
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node parse.js <chat.txt>'); process.exit(1); }
  const t0 = Date.now();
  const { days, reports } = main(file);
  const byBiz = { amazon: 0, store: 0, fuel: 0 };
  for (const r of reports) byBiz[r.business]++;
  console.log(`Parsed in ${Date.now() - t0}ms`);
  console.log(`Days: ${days}`);
  console.log(`Reports: ${reports.length} (amazon=${byBiz.amazon} store=${byBiz.store} fuel=${byBiz.fuel})`);
  // date range
  const dates = reports.map(r => r.date).sort();
  console.log(`Date range: ${dates[0]} → ${dates[dates.length - 1]}`);
  console.log('\nFirst 3:');
  for (const r of reports.slice(0, 3)) console.log(`  [${r.date}] ${r.business}: ${JSON.stringify(r.parsed).slice(0, 180)}`);
  console.log('\nLast 3:');
  for (const r of reports.slice(-3)) console.log(`  [${r.date}] ${r.business}: ${JSON.stringify(r.parsed).slice(0, 180)}`);
}

module.exports = { parseChat, parseChunk, splitMessages, detectBusiness, parseAmazon, parseStore, parseFuel, parseDate, main };
