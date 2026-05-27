# PTT สำเร็จพัฒนา · Sales Dashboard

Dashboard เก็บข้อมูลและวิเคราะห์ยอดขาย 3 ธุรกิจ (Cafe Amazon / ร้านสะดวกซื้อ 18351 / สถานีน้ำมัน) จากการแจ้งทาง LINE

## คุณสมบัติ

- Responsive: desktop ดู V2 (เปรียบเทียบ 3 ธุรกิจ), mobile ดูแบบ overview
- ปุ่ม "+" มุมขวาล่าง → วางข้อความจาก LINE → ระบบ parse + บันทึก Firestore ให้
- Real-time: dashboard อัพเดททันทีเมื่อมีข้อมูลใหม่
- ทำงานแบบ offline ได้ (จะเห็น mock data, save ไม่ได้)

## วิธี Deploy

### ขั้นที่ 1 — สร้าง Firebase Project + Firestore

1. ไปที่ https://console.firebase.google.com → **Add project**
2. ตั้งชื่อโครงการ (เช่น `ptt-samrej`) → ปิด Analytics ก็ได้ → Create
3. เมนูซ้าย: **Build → Firestore Database** → **Create database**
   - เลือก location: `asia-southeast1` (Singapore — ใกล้ไทยที่สุด)
   - เริ่มที่ **Test mode** (จะเปลี่ยน rules ทีหลัง)
4. ที่ Project Overview → กดไอคอน `</>` (Web)
   - ตั้งชื่อ app (เช่น `dashboard`) → Register (ไม่ต้องเลือก Hosting)
   - **คัดลอก** object `firebaseConfig` ทั้งก้อน
5. เปิดไฟล์ `firebase-config.js` → แทนที่ค่าทั้ง 6 ตัว (apiKey, authDomain, projectId, ...) ด้วยของจริง

### ขั้นที่ 2 — ตั้ง Firestore Security Rules

1. ใน Firebase Console → **Firestore Database → Rules**
2. คัดลอกเนื้อหาจากไฟล์ `firestore.rules` ในโปรเจกต์นี้ ไปวาง → **Publish**

> หมายเหตุ: ตั้งแต่ Phase 1 rules เปิด public เพื่อให้ใช้งานได้ทันที — เมื่อขึ้น production จริง ควรเพิ่ม Authentication แล้วล็อก rules

### ขั้นที่ 3 — Push ขึ้น GitHub

```powershell
# จากใน folder business/
git init
git add .
git commit -m "Initial dashboard"
git branch -M main
git remote add origin https://github.com/<USERNAME>/<REPO>.git
git push -u origin main
```

### ขั้นที่ 4 — เปิด GitHub Pages

1. ใน GitHub repo → **Settings → Pages**
2. Source: **Deploy from a branch** → Branch: `main` → Folder: `/ (root)` → Save
3. รอ ~1 นาที จะได้ URL `https://<USERNAME>.github.io/<REPO>/`

### ขั้นที่ 5 — Authorize Domain ใน Firebase (ถ้าใช้ Auth ในอนาคต)

ตอนนี้ Phase 1 ไม่ใช้ Auth ข้ามขั้นนี้ไปได้ก่อน

## การใช้งานประจำวัน

1. เปิด URL ของ GitHub Pages
2. กดปุ่ม **"+"** มุมขวาล่าง
3. คัดลอกข้อความรายงานยอดขายจาก LINE (จะวางทั้ง 3 ธุรกิจรวมกัน หรือทีละธุรกิจก็ได้)
4. กด **"1. ดูตัวอย่าง parse"** → ตรวจตัวเลขให้ถูก
5. กด **"2. บันทึกลง Firestore"** → Dashboard จะอัพเดททันที

## รูปแบบข้อความที่รองรับ

ระบบรู้จัก 3 รูปแบบ:

**Amazon** — ต้องมี: `อเมซอน`, `ยอดขายทั้งหมด`, `ยอดแก้ว`
**ร้านสะดวกซื้อ 18351** — ต้องมี: `18351`, `เป้าหมายยอดขาย`, `Delivery 7-11`
**น้ำมัน** — ต้องมี: `ยอดขายน้ำมัน กะ เช้า/ดึก`, `รวมลิตร`, `รวมเป็นเงิน`

วันที่รองรับทั้งแบบ `26/05/2569` และ `26 พฤษภาคม 2569` (พ.ศ. → ค.ศ. อัตโนมัติ)

## โครงสร้างไฟล์

```
business/
├── index.html            ← เว็บหลัก (React + dashboard + parser + modal)
├── firebase-config.js    ← ⚠ TODO: ใส่ค่า Firebase config ของคุณ
├── firestore.rules       ← Security rules (copy ไป Firebase Console)
└── README.md             ← ไฟล์นี้
```

## โครงสร้างข้อมูลใน Firestore

```
reports/
  {YYYY-MM-DD}_{amazon|store|fuel}/
    business: "amazon" | "store" | "fuel"
    date: "2026-05-26"
    parsed: { ...ตัวเลขที่ parse ได้... }
    rawText: "...ข้อความดิบจาก LINE..."
    createdAt: Timestamp
```

## Phase 2 (ในอนาคต)

- LINE Bot webhook → รับข้อความอัตโนมัติ ไม่ต้อง paste เอง
- Authentication: ล็อกให้เฉพาะคนของบริษัทเข้าได้
- Export PDF/Excel
- Filter ตามช่วงวันที่ + กราฟ trend หลายเดือน
