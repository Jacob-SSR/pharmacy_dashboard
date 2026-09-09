# จอสถานะห้องยา (Pharmacy Dashboard)

จอติดตามคิวจ่ายยาของ **ห้องยา OPD** อ่านข้อมูลสดจาก HOSxP

> ⚠️ **จอนี้สำหรับเภสัชกร/เจ้าหน้าที่ห้องยาเท่านั้น — ไม่ใช่จอสำหรับผู้ป่วย**
> หน้าจอแสดงชื่อ-นามสกุลเต็ม, HN, VN, จำนวนรายการยา และการแบ่งตะกร้า
> ซึ่งเป็นข้อมูลบริหารงานภายใน ไม่ควรให้ผู้ป่วยเห็น
> (ต่างจากจอเรียกคิวหน้าห้องที่ปิดบังนามสกุลเป็น `XXX`)

## ข้อควรระวังก่อนติดตั้ง

ตามที่ตกลงกันไว้ ระบบนี้ **ไม่มีหน้าล็อกอิน** — ใครเปิด URL ได้ก็เห็นข้อมูลผู้ป่วยทั้งหมด
ที่โค้ดทำได้คือใส่ `robots: noindex` กัน search engine เท่านั้น
**ต้องจำกัดการเข้าถึงที่ระดับเครือข่ายเอง** เช่น

- ผูก service ไว้กับ IP ภายใน / วง LAN ห้องยาเท่านั้น
- หรือใส่ Basic Auth / IP allowlist ที่ reverse proxy (nginx) ด้านหน้า

ถ้าภายหลังต้องการล็อกอินจริง ใช้แนวเดียวกับ `ppc-hos-10667` ได้
(ตาราง `ppchos.users` + role `PHARMACY` ใน `lib/permissions.ts`)

## ที่มาของข้อมูล

อ่านอย่างเดียว ไม่เขียนกลับเข้า HOSxP เลย
(ต่างจากสคริปต์ PHP เดิม เช่น `getMedicineQ.php` ที่ `UPDATE sd_queue_calling` ตอนเรียกชื่อ)

| สิ่งที่แสดง | ตาราง / คอลัมน์ใน HOSxP |
| --- | --- |
| visit ของวัน | `ovst` (`vn`, `hn`, `oqueue`, `pt_priority`, `cur_dep`, `ovstost`, `an`) |
| ชื่อผู้ป่วย | `patient` (`pname`, `fname`, `lname`) |
| ชื่อแผนก | `kskdepartment.department` |
| ชื่อสถานะ visit | `ovstost.name` |
| เวลาตรวจเสร็จ | `service_time.service12` |
| เวลาถึงห้องยา | `service_time.service6` |
| เวลารับยา | `service_time.service16` |
| รายการยา | `opitemrece` × `drugitems` (นับบรรทัด + รวม `qty`) |
| เรียกคิวจ่ายยาแล้วหรือยัง | `sd_queue_calling` |

สูตรแปลงคอลัมน์ `TIME` ของ `service_time` เป็น `DATETIME` (รวมเคส `'24:00:00'`
ที่ต้องบวกไปวันถัดไป) ยกมาจาก `ppc-hos-10667/lib/servicetime.queries.ts` ไม่ได้แก้

### ขั้นตอนในห้องยา

HOSxP บันทึก checkpoint ของห้องยาไว้ 4 จุด จอนี้จึงมี 4 ขั้น — ไม่มีการเดาขั้นที่ไม่มีข้อมูลรองรับ

| ขั้น | เงื่อนไข |
| --- | --- |
| 1 ใบสั่งยาเข้า | ตรวจเสร็จแล้ว (`service12`) แต่ยังไม่ถึงห้องยา |
| 2 จัดยา | ถึงห้องยาแล้ว (`service6`) ยังไม่ถูกเรียกคิว |
| 3 เรียกรับยา | มีรายการใน `sd_queue_calling` ของวันนั้น |
| 4 รับยาแล้ว | มี `service16` |

> **หมายเหตุ** แบบร่างเดิมมีขั้น "ตรวจสอบ (Check ก่อนจ่ายยา)" แยกจาก "จัดยา"
> แต่ HOSxP ไม่มีฟิลด์ที่บันทึกจุดนี้ จึงยุบรวมไว้ในขั้น "จัดยา"
> ถ้าต้องการแยกจริง ต้องให้เภสัชกรกดบันทึกเอง แล้วเก็บลงตารางของแอปเอง (ยังไม่ได้ทำ)

### ตะกร้ายา

HOSxP ไม่มีฟิลด์ "ตะกร้า" — คำนวณจากจำนวนรายการยาต่อ VN ตามที่ตกลงกันไว้

| ตะกร้า | เกณฑ์ |
| --- | --- |
| 🔴 ยาด่วน | `ovst.pt_priority` ≠ 0 (ตรวจก่อนเสมอ) |
| 🔵 ยามาก | จำนวนรายการยา ≥ `PHARMACY_MANY_ITEMS` (ค่าเริ่มต้น 4) |
| 🟢 ยาน้อย | นอกนั้น |

ตัวเลขบนการ์ดตะกร้านับเฉพาะคนที่ **ยังไม่รับยา**

## ตั้งค่า

คัดลอก `.env.example` เป็น `.env.local` แล้วแก้ค่า

| ตัวแปร | จำเป็น | ค่าเริ่มต้น | คำอธิบาย |
| --- | --- | --- | --- |
| `DB_HOST` | ✅ | — | HOSxP MySQL |
| `DB_PORT` | | `3306` | |
| `DB_USER` `DB_PASS` `DB_NAME` | ✅ | — | ใช้ผู้ใช้สิทธิ์ **SELECT อย่างเดียว** |
| `PHARMACY_DEPCODES` | | (ว่าง) | depcode จุดจ่ายยา คั่นด้วย comma — ใช้กรอง `sd_queue_calling` ว่างไว้ = นับทุกจุดเรียกคิว |
| `PHARMACY_MANY_ITEMS` | | `4` | รายการยาตั้งแต่เท่านี้ = ตะกร้ายามาก |
| `PHARMACY_URGENT_WAIT_MIN` | | `20` | รอเกินกี่นาทีจึงเตือน |
| `PHARMACY_REFRESH_MS` | | `30000` | จอดึงข้อมูลใหม่ทุกกี่ ms |
| `PHARMACY_ROW_LIMIT` | | `500` | จำกัดจำนวนแถวต่อรอบ |
| `PHARMACY_HOSPITAL_NAME` | | `โรงพยาบาลพลับพลาชัย` | ชื่อบนหัวจอ |
| `DB_POOL_SIZE` `DB_POOL_IDLE` `DB_QUEUE_LIMIT` | | `6` `3` `50` | ขนาด connection pool |

**ถ้าไม่ตั้ง env ฐานข้อมูล** แอปจะไม่ล้ม แต่จะขึ้นข้อมูลตัวอย่างพร้อมป้าย
"ข้อมูลตัวอย่าง" บนหัวจอ (สะดวกตอนพัฒนา/สาธิต — ชื่อทั้งหมดเป็นชื่อสมมติ)

## รัน

```bash
npm install
npm run dev        # พัฒนา
npm run typecheck  # ตรวจ type (ต้องผ่านก่อน build image เสมอ)
npm run lint
npm run build && npm run start   # production
```

> `npm run typecheck` เรียก `next typegen` ให้ก่อนเสมอ — Next 16 สร้าง type ของ route
> (`PageProps` / `LayoutProps` / `RouteContext`) ตอน typegen ถ้าสั่ง `tsc --noEmit` เปล่า ๆ
> บน clone ใหม่ที่ยังไม่เคย build จะหา type พวกนี้ไม่เจอ

## จอ TV (`/tv`)

หน้าสำหรับแขวน TV ในห้องยา เปิดทิ้งไว้ ไม่ต้องมีคนกดอะไร

- ตัดช่องค้นหา / ตัวกรอง / การกดดูรายการยา ออกทั้งหมด (TV ไม่มีเมาส์)
- ตัวหนังสือใหญ่ อ่านจากระยะ 2–4 เมตร · ไม่มี scrollbar
- **แสดงเฉพาะคนที่ยังไม่รับยา** — TV ควรเห็นแต่งานค้าง
- คิวยาวเกินจอ → **วนหน้าเอง** จำนวนแถวต่อหน้าคำนวณจากความสูงจอจริง
  (1080p ≈ 7 แถว · 720p ≈ 6 แถว) เลขลำดับแถวต่อเนื่องข้ามหน้า

ปรับได้จากแถบ URL ของ TV โดยไม่ต้อง build ใหม่

| query | ค่าเริ่มต้น | ความหมาย |
| --- | --- | --- |
| `?rows=12` | วัดจากจอเอง | บังคับจำนวนแถวต่อหน้า |
| `?sec=15` | `12` | เปลี่ยนหน้าทุกกี่วินาที |
| `?done=1` | ปิด | แสดงคนที่รับยาแล้วด้วย |
| `?mask=1` | ปิด | ปิดบังนามสกุลเหลืออักษรแรก |

> 🔒 **ถ้า TV หันไปทางที่ผู้ป่วยมองเห็น ให้เปิด `?mask=1` เสมอ**
> จอนี้แสดงชื่อ-นามสกุลเต็ม + HN ซึ่งเป็นข้อมูลผู้ป่วย
> ค่าเริ่มต้นไม่ปิดบัง เพราะออกแบบไว้ให้ตั้งในพื้นที่ทำงานของเภสัชกร

ตัวอย่างที่ตั้งบน TV: `http://<ip-server>:4600/tv?mask=1&sec=15`

## Deploy ด้วย Docker (พอร์ต 4600)

```bash
cp .env.example .env.production   # แล้วแก้ค่า DB_* ให้ตรงกับ HOSxP จริง
docker compose up -d --build
```

เปิดที่ `http://<ip-server>:4600` (จอโต๊ะ) และ `http://<ip-server>:4600/tv` (จอ TV)

- image เป็น **standalone** (`output: "standalone"` ใน `next.config.ts`) — รันด้วย `node server.js` ไม่ต้องมี `node_modules` ทั้งก้อน
- รันด้วย user `nextjs` (ไม่ใช่ root)
- `.env.production` **ไม่เข้า image** — อ่านตอน runtime ผ่าน `env_file`
- healthcheck ยิง `/api/pharmacy/queue` ทุก 60 วินาที (ไม่ใช่แค่หน้าแรก จะได้รู้ว่าต่อ DB ได้จริง)

**ข้อควรรู้ตอน build**

- เครื่องที่ build **ต้องต่อเน็ตได้** เพราะ `next/font/google` โหลดฟอนต์ Sarabun ตอน build
  ถ้าอยู่วงปิด ให้ย้ายไปใช้ `next/font/local` แล้ววางไฟล์ฟอนต์ไว้ในโปรเจก
- HOSxP อยู่บนเครื่อง host เดียวกัน → ใช้ `DB_HOST=host.docker.internal` (compose ตั้ง `extra_hosts` ไว้แล้ว)
  ถ้าอยู่คนละเครื่องในวง LAN → ใส่ IP จริงไปเลย

คำสั่งที่ใช้บ่อย

```bash
docker compose logs -f app      # ดู log
docker compose restart app      # รีสตาร์ต
docker compose up -d --build    # deploy เวอร์ชันใหม่
```

## API

| Endpoint | คืนค่า |
| --- | --- |
| `GET /api/pharmacy/queue?date=YYYY-MM-DD` | คิวทั้งวัน + ตัวนับต่อขั้น/ต่อตะกร้า (ไม่ระบุ `date` = วันนี้) |
| `GET /api/pharmacy/queue/{vn}/items?date=YYYY-MM-DD` | รายการยาของ visit นั้น (ใช้ในหน้าต่างที่เปิดจากการกดแถว) |

ทั้งสอง endpoint ตอบ `Cache-Control: no-store`

## โครงไฟล์

```
app/
  page.tsx                     จอบนโต๊ะ — โหลดข้อมูลชุดแรกฝั่ง server
  tv/page.tsx                  จอ TV — อ่านตัวเลือกจาก query string
  PharmacyDashboard.tsx        จอหลัก (client) ใช้ร่วมกันทั้งสองหน้า
  globals.css                  โทนสีจากแบบร่างของห้องยา + ธีมมืด
  api/pharmacy/queue/…         route handlers
Dockerfile                     build standalone → รันที่พอร์ต 4600
docker-compose.yml             service เดียว + healthcheck
lib/
  db.ts                        pool mysql2 (charset tis620)
  pharmacy.service.ts          SQL ทั้งหมด + แปลงเป็นข้อมูลของจอ
  pharmacy.env.ts              env + เกณฑ์ตะกร้า (server เท่านั้น)
  pharmacy.constants.ts        ป้ายชื่อ/ลำดับ ใช้ร่วม server+client
  pharmacy.types.ts            รูปร่างข้อมูล
  pharmacy.demo.ts             ข้อมูลตัวอย่างตอนยังไม่ต่อ DB
```

## ความปลอดภัยของ SQL

ค่าจากภายนอกทุกตัวส่งเป็น placeholder (`?`) เสมอ ไม่มีการต่อ string เข้า SQL
(สคริปต์ PHP เดิมต่อ `$_POST['depcode']` ลง query ตรง ๆ = ช่อง SQL injection — ที่นี่ไม่ทำซ้ำ)
ยกเว้น `LIMIT` ที่ bind ไม่ได้ จึงตรวจให้เป็นจำนวนเต็มบวกก่อนต่อ
และ `multipleStatements` ปิดไว้ที่ระดับ pool
