// lib/pharmacy.service.ts
// อ่านคิวห้องยาของวันนี้จาก HOSxP แล้วสรุปเป็นข้อมูลของหน้าจอ
//
// ── ที่มาของแต่ละค่า (ทุกตาราง/คอลัมน์ยึดตามที่ใช้จริงใน ppc-hos-10667) ──────────
//   ovst            visit ของวัน (vn, hn, oqueue, pt_priority, cur_dep, ovstost, an)
//   patient         ชื่อ-นามสกุล (pname/fname/lname)
//   kskdepartment   ชื่อแผนกจาก depcode
//   ovstost         ชื่อสถานะ visit
//   service_time    checkpoint เวลาแบบ HOSxP — service12 ตรวจเสร็จ,
//                   service6 ถึงห้องยา, service16 รับยาแล้ว
//                   (สูตรแปลง TIME → DATETIME คงตาม lib/servicetime.queries.ts เดิม
//                    รวมทั้งเคส '24:00:00' ที่ต้องบวกไปวันถัดไป)
//   opitemrece      บรรทัดรายการที่สั่ง — JOIN drugitems คือ "เฉพาะที่เป็นยา"
//   sd_queue_calling รายการเรียกคิว (ใช้รู้ว่าเรียกรับยาแล้วหรือยัง)
//
// ❗ จอนี้ "อ่านอย่างเดียว" — ต่างจากสคริปต์ PHP เดิม (getMedicineQ.php ฯลฯ)
//    ที่ UPDATE sd_queue_calling กลับเข้า HOSxP ตอนเรียกชื่อ ที่นี่ไม่เขียนอะไรทั้งสิ้น
// ❗ ค่าจากภายนอกทุกตัวส่งเป็น placeholder (?) เสมอ ไม่ต่อ string เข้า SQL
//    (สคริปต์ PHP เดิมต่อ $_POST['depcode'] ตรง ๆ = ช่อง SQL injection — ไม่ทำซ้ำ)

import "server-only";
import type { RowDataPacket } from "mysql2";
import { getDb } from "./db";
import {
  HOSPITAL_NAME,
  MANY_ITEMS_THRESHOLD,
  PHARMACY_DEPCODES,
  REFRESH_MS,
  ROW_LIMIT,
  URGENT_WAIT_MIN,
  basketOf,
} from "./pharmacy.env";
import { demoDrugLines, demoQueue } from "./pharmacy.demo";
import type {
  Basket,
  DrugLine,
  PharmacyQueueData,
  QueueRow,
  Stage,
} from "./pharmacy.types";

// ─── helpers ──────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** วันที่ต้องเป็น YYYY-MM-DD เท่านั้น — กันค่าแปลก ๆ ก่อนถึง DB */
export function assertDate(d: string): string {
  if (!DATE_RE.test(d)) throw new Error(`รูปแบบวันที่ไม่ถูกต้อง: ${d}`);
  return d;
}

/** วันนี้ตามเวลาเครื่อง (ไม่ใช่ UTC) ในรูป YYYY-MM-DD */
export function todayISO(): string {
  const n = new Date();
  const p = (v: number) => String(v).padStart(2, "0");
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

/**
 * คำใน ovstost.name หรือชื่อแผนกปัจจุบัน ที่แปลว่า "ออกจาก flow ห้องยาแล้ว"
 * ลิสต์เดียวกับ ppc-hos-10667/lib/deptStatus.service.ts
 *
 * ทำไมต้องมี: สคริปต์เรียกคิวของโรงพยาบาล (getMedicineQ.php ฯลฯ) เขียน DB แค่
 * `UPDATE sd_queue_calling SET status='N'` ซึ่งเป็นแค่ธง "ประกาศเสียงไปแล้ว"
 * ไม่ได้ย้ายคนไข้ไปไหน — คนย้ายจริงตอนเจ้าหน้าที่กดใน HOSxP แล้ว cur_dep/ovstost เปลี่ยน
 * ถ้าดูแต่ service_time.service16 อย่างเดียว visit ที่เจ้าหน้าที่ไม่ได้ลงเวลารับยา
 * จะค้างอยู่ขั้น "จัดยา" ตลอดไป
 */
const FINISHED_KEYWORDS = [
  "รับยาแล้ว",
  "กลับบ้าน",
  "จำหน่าย",
  "เสร็จสิ้น",
  "admit",
  "ส่งต่อ",
  "refer",
  "เสียชีวิต",
  "ถึงแก่กรรม",
  "dead",
];

function isFinishedLabel(name: string): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return FINISHED_KEYWORDS.some((k) => n.includes(k.toLowerCase()));
}

const str = (v: unknown): string => (v == null ? "" : String(v)).trim();
const int = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

/**
 * แปลงคอลัมน์ TIME ของ service_time เป็น DATETIME
 * '24:00:00' = เที่ยงคืนของวันถัดไป (HOSxP เก็บแบบนี้จริง)
 */
function dtExpr(col: string): string {
  return `CASE
      WHEN st.${col} IS NULL THEN NULL
      WHEN st.${col} = '24:00:00'
        THEN STR_TO_DATE(CONCAT(st.vstdate,' 00:00:00'),'%Y-%m-%d %H:%i:%s') + INTERVAL 1 DAY
      ELSE STR_TO_DATE(CONCAT(st.vstdate,' ',st.${col}),'%Y-%m-%d %H:%i:%s')
    END`;
}

// ─── query หลัก ───────────────────────────────────────────────────────────────

interface QueueDbRow extends RowDataPacket {
  vn: string;
  hn: string;
  queue: string | null;
  patient_name: string | null;
  pt_priority: number | null;
  cur_dep_code: string | null;
  cur_dept: string | null;
  status_name: string | null;
  pttype_name: string | null;
  drug_items: number;
  drug_qty: number | null;
  stage: Stage;
  time_str: string | null;
  wait_min: number | null;
}

function buildQueueSql(): { sql: string; depParams: string[] } {
  // depcode ของจุดจ่ายยาเป็นหัวใจของทั้งสองสคริปต์ต้นทาง — ไม่มีก็ query ไม่ได้
  if (PHARMACY_DEPCODES.length === 0) {
    throw new Error(
      "ยังไม่ได้ตั้ง PHARMACY_DEPCODES — ต้องใส่ depcode ของจุดจ่ายยา (kskdepartment.depcode) คั่นด้วย comma",
    );
  }
  const deps = PHARMACY_DEPCODES.map(() => "?").join(",");

  // LIMIT bind ไม่ได้ใน prepared statement → ตรวจเป็นจำนวนเต็มบวกแล้วค่อยต่อ
  const limit = Math.max(1, Math.trunc(ROW_LIMIT));

  const sql = `
    SELECT
      o.vn,
      o.hn,
      COALESCE(o.oqueue, '')                        AS queue,
      -- ชื่อเต็มแบบเดียวกับ getMedicineQ.php (จอห้องยาไม่ปิดบังนามสกุล
      -- ต่างจาก getScreeningQ/getDoctorRoomQ ที่แทนนามสกุลด้วย 'XXX')
      CONCAT(pt.pname, pt.fname, ' ', pt.lname)     AS patient_name,
      IFNULL(o.pt_priority, 0)                      AS pt_priority,
      COALESCE(o.cur_dep, '')                       AS cur_dep_code,
      COALESCE(kc.department, '')                   AS cur_dept,
      COALESCE(os.name, '')                         AS status_name,
      COALESCE(ptt.name, '')                        AS pttype_name,
      COALESCE(dr.drug_items, 0)                    AS drug_items,
      COALESCE(dr.drug_qty, 0)                      AS drug_qty,

      -- ขั้นในห้องยา — ไล่จากขั้นท้ายสุดก่อน แถวหนึ่งได้ขั้นเดียวเสมอ
      CASE
        WHEN t.dt_receive_drug IS NOT NULL THEN 'dispensed'
        -- เงื่อนไข "ถูกเรียกแล้ว" กลับด้านมาจาก getScreeningW.php ที่นับคนยังรอด้วย
        --   (o.cur_dep_time >= TIME(sc.sd_queue_calling_datetime) OR ... IS NULL)
        -- ดังนั้น "เรียกแล้ว" = มีการเรียก และเรียกหลังจากที่เข้ามาอยู่แผนกนี้
        WHEN q.called_at IS NOT NULL
             AND TIME(q.called_at) > o.cur_dep_time THEN 'calling'
        ELSE 'waiting'
      END AS stage,

      DATE_FORMAT(o.cur_dep_time, '%H:%i')          AS time_str,

      -- รอมากี่นาที: นับจากเวลาที่เข้ามาอยู่แผนกนี้ จนถึงเวลารับยา (ถ้าจบแล้ว) หรือถึงตอนนี้
      TIMESTAMPDIFF(
        MINUTE,
        STR_TO_DATE(CONCAT(o.vstdate, ' ', o.cur_dep_time), '%Y-%m-%d %H:%i:%s'),
        COALESCE(t.dt_receive_drug, NOW())
      ) AS wait_min

    FROM ovst o
    INNER JOIN patient pt ON pt.hn = o.hn

    LEFT JOIN kskdepartment kc ON kc.depcode = o.cur_dep
    LEFT JOIN ovstost       os ON os.ovstost = o.ovstost
    -- สิทธิการรักษา: vn_stat เป็นตารางสรุปที่อาจยังไม่มีแถวของ visit ที่ยังไม่ปิด
    -- จึงเอา ovst.pttype ก่อน แล้วค่อย fallback ไป vn_stat
    LEFT JOIN vn_stat       vs  ON vs.vn = o.vn
    LEFT JOIN pttype        ptt ON ptt.pttype = COALESCE(o.pttype, vs.pttype)

    -- จำนวนรายการยา (ใช้จัดตะกร้า) — ส่วนนี้ไม่มีในสคริปต์เดิม เป็นของจอนี้เอง
    LEFT JOIN (
      SELECT op.vn,
             COUNT(*)                  AS drug_items,
             SUM(COALESCE(op.qty, 0))  AS drug_qty
      FROM opitemrece op
      INNER JOIN drugitems di ON di.icode = op.icode
      WHERE op.vstdate = ?
      GROUP BY op.vn
    ) dr ON dr.vn = o.vn

    -- การเรียกคิวที่จุดจ่ายยา — เงื่อนไขเดียวกับ getMedicineQ.php
    --   sd_queue_calling_curdep IN (depcode) AND DATE(sd_queue_calling_datetime) = วันนั้น
    LEFT JOIN (
      SELECT sc.sd_queue_calling_vn            AS vn,
             MAX(sc.sd_queue_calling_datetime) AS called_at
      FROM sd_queue_calling sc
      WHERE DATE(sc.sd_queue_calling_datetime) = ?
        AND sc.sd_queue_calling_curdep IN (${deps})
      GROUP BY sc.sd_queue_calling_vn
    ) q ON q.vn = o.vn

    -- เวลารับยาจาก service_time (service16) — ใช้ปิดงานเท่านั้น ไม่ได้ใช้คัดคนเข้าคิว
    LEFT JOIN (
      SELECT
        st.vn,
        ${dtExpr("service16")} AS dt_receive_drug
      FROM service_time st
      WHERE st.vstdate = ?
    ) t ON t.vn = o.vn

    WHERE o.vstdate = ?
      -- OPD เท่านั้น — เช็คทั้ง NULL และ '' เพราะ HOSxP บางรุ่นเก็บ an ของคนไม่ admit
      -- เป็นสตริงว่าง ถ้าเช็คแค่ IS NULL แล้ว schema เป็นแบบหลัง จอจะว่างเปล่าโดยไม่มี error
      AND (o.an IS NULL OR o.an = '')
      AND (
        -- getScreeningW.php: ตอนนี้อยู่ที่ห้องยา
        o.cur_dep IN (${deps})
        -- getMedicineQ.php: ถูกเรียกคิวที่จุดจ่ายยาในวันนั้น
        OR q.called_at IS NOT NULL
      )
    ORDER BY o.cur_dep_time ASC
    LIMIT ${limit}
  `;

  return { sql, depParams: PHARMACY_DEPCODES };
}

const EMPTY_STAGES: Record<Stage, number> = {
  waiting: 0,
  calling: 0,
  dispensed: 0,
};
const EMPTY_BASKETS: Record<Basket, number> = { few: 0, many: 0, urgent: 0 };

/** สรุปตัวนับ + ห่อ payload — ใช้ร่วมกันทั้งข้อมูลจริงและข้อมูลตัวอย่าง */
export function summarize(
  rows: QueueRow[],
  source: "live" | "demo",
  date: string,
): PharmacyQueueData {
  const byStage = { ...EMPTY_STAGES };
  const byBasket = { ...EMPTY_BASKETS };

  for (const r of rows) {
    byStage[r.stage]++;
    // ตะกร้านับเฉพาะคนที่ยังไม่รับยา — คนรับยาไปแล้วไม่ใช่ภาระของห้องยาอีก
    if (r.stage !== "dispensed") byBasket[r.basket]++;
  }

  return {
    source,
    updatedAt: new Date().toISOString(),
    date,
    rows,
    byStage,
    byBasket,
    thresholds: {
      manyItems: MANY_ITEMS_THRESHOLD,
      urgentWaitMin: URGENT_WAIT_MIN,
      refreshMs: REFRESH_MS,
    },
    hospitalName: HOSPITAL_NAME,
  };
}

/**
 * คิวห้องยาของวันที่กำหนด
 * ยังไม่ได้ตั้ง env ฐานข้อมูล → คืนข้อมูลตัวอย่าง (source: "demo") แทนการ throw
 * เพื่อให้เปิดดูหน้าจอ/พัฒนา UI ได้โดยไม่ต้องต่อ HOSxP จริง
 */
export async function getPharmacyQueue(
  date: string = todayISO(),
): Promise<PharmacyQueueData> {
  assertDate(date);

  const db = getDb();
  if (!db) return summarize(demoQueue(date), "demo", date);

  const { sql, depParams } = buildQueueSql();
  // ลำดับ param ต้องตรงกับลำดับ ? ใน SQL:
  //   1) opitemrece.vstdate
  //   2) วันที่ของ sd_queue_calling   3..n) depcode ของ sd_queue_calling
  //   n+1) service_time.vstdate       n+2) ovst.vstdate
  //   n+3.. ) depcode ของเงื่อนไข o.cur_dep IN (...)
  const params = [date, date, ...depParams, date, date, ...depParams];

  const [dbRows] = await db.query<QueueDbRow[]>(sql, params);

  const rows: QueueRow[] = dbRows.map((r) => {
    const drugItems = int(r.drug_items);
    const ptPriority = int(r.pt_priority);
    const curDeptCode = str(r.cur_dep_code);
    const curDept = str(r.cur_dept);
    const statusName = str(r.status_name);

    // ขั้นจาก SQL ยึด service_time เป็นหลัก แล้วมาปรับด้วยตำแหน่งจริงของคนไข้ตรงนี้
    let stage: Stage = r.stage;
    if (stage !== "dispensed") {
      const leftPharmacy =
        // HOSxP ปิด visit / ย้ายไปจุดออก (กลับบ้าน, จำหน่าย, admit, refer ...)
        isFinishedLabel(statusName) ||
        isFinishedLabel(curDept) ||
        // ตอนนี้ cur_dep ไม่ใช่ห้องยาแล้ว = ห้องยาจ่ายเสร็จแล้วส่งต่อไป
        // (แถวนี้ติดมาได้เพราะเคยถูกเรียกคิวที่ห้องยาวันนี้ — ตาม getMedicineQ.php)
        (curDeptCode !== "" && !PHARMACY_DEPCODES.includes(curDeptCode));
      if (leftPharmacy) stage = "dispensed";
    }

    return {
      vn: str(r.vn),
      hn: str(r.hn),
      queue: str(r.queue),
      name: str(r.patient_name) || str(r.hn),
      basket: basketOf(drugItems, ptPriority),
      stage,
      drugItems,
      drugQty: int(r.drug_qty),
      ptPriority,
      timeStr: str(r.time_str),
      // นาฬิกาเครื่อง DB กับเวลา checkpoint อาจเพี้ยนกันได้ — กันค่าติดลบไว้
      waitMin: Math.max(0, int(r.wait_min)),
      pttype: str(r.pttype_name),
      curDeptCode,
      curDept,
      statusName,
    };
  });

  return summarize(rows, "live", date);
}

// ─── รายการยาของผู้ป่วย 1 คน ──────────────────────────────────────────────────

/**
 * คอลัมน์ของ drugitems ต่างกันได้ตามเวอร์ชัน HOSxP → ถามจาก information_schema ก่อน
 * (แนวเดียวกับ ppc-hos-10667/lib/drugUsage.service.ts)
 * ชื่อคอลัมน์ที่ต่อลง SQL เป็น literal ในไฟล์นี้เท่านั้น และต้องมีอยู่จริงเท่านั้น
 */
let drugCols: Set<string> | null = null;

async function drugItemColumns(): Promise<Set<string>> {
  if (drugCols) return drugCols;
  const db = getDb();
  if (!db) return (drugCols = new Set());
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT LOWER(COLUMN_NAME) AS col
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'drugitems'`,
    );
    drugCols = new Set(rows.map((r) => String(r.col)));
  } catch {
    drugCols = new Set();
  }
  return drugCols;
}

function pickCol(cols: Set<string>, candidates: string[]): string {
  const col = candidates.find((c) => cols.has(c));
  return col ? `COALESCE(di.${col}, '')` : `''`;
}

interface DrugLineRow extends RowDataPacket {
  icode: string;
  name: string | null;
  strength: string | null;
  units: string | null;
  qty: number | null;
}

/** บรรทัดยาทั้งหมดของ visit หนึ่ง — ใช้ในหน้าต่างรายละเอียดของเภสัชกร */
export async function getDrugLines(
  vn: string,
  date: string = todayISO(),
): Promise<DrugLine[]> {
  assertDate(date);
  const db = getDb();
  // ยังไม่ต่อฐานข้อมูล → คืนรายการยาตัวอย่างให้ตรงกับคิวตัวอย่างที่แสดงอยู่
  if (!db) return demoDrugLines(vn);

  const cols = await drugItemColumns();
  const nameExpr = `COALESCE(NULLIF(${pickCol(cols, ["name"])}, ''), op.icode)`;
  const strengthExpr = pickCol(cols, ["strength"]);
  const unitsExpr = pickCol(cols, ["units", "unit"]);

  const [rows] = await db.query<DrugLineRow[]>(
    `
    SELECT
      op.icode                 AS icode,
      MAX(${nameExpr})         AS name,
      MAX(${strengthExpr})     AS strength,
      MAX(${unitsExpr})        AS units,
      SUM(COALESCE(op.qty, 0)) AS qty
    FROM opitemrece op
    INNER JOIN drugitems di ON di.icode = op.icode
    WHERE op.vn = ? AND op.vstdate = ?
    -- group แค่ icode แล้วห่อคอลัมน์อื่นด้วย MAX — ชื่อ alias ซ้ำกับคอลัมน์จริงของ
    -- drugitems (name/units) ถ้าเอาไปใส่ GROUP BY/ORDER BY ตรง ๆ จะกำกวม
    GROUP BY op.icode
    ORDER BY 2
  `,
    [vn, date],
  );

  return rows.map((r) => ({
    icode: str(r.icode),
    name: str(r.name),
    strength: str(r.strength),
    units: str(r.units),
    qty: int(r.qty),
  }));
}
