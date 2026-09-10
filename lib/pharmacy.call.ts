// lib/pharmacy.call.ts
// "ใครถูกเรียกคิวล่าสุดที่จุดจ่ายยา" — ใช้ประกาศเสียงอัตโนมัติ
//
// ยกวิธีมาจากโปรเจกต์พี่น้อง cashier_dashboard (lib/cashier.service.ts getCallQueue)
// ซึ่งพิสูจน์มาแล้วกับจอห้องเก็บเงินของ รพ. เดียวกัน
//
// ❗ อ่านอย่างเดียว ไม่เขียน sd_queue_calling_status='N' เหมือนจอ PHP เดิม
//    key = แฮชของ vn + เวลาที่ถูกเรียก → กดเรียกคนเดิมซ้ำก็ได้ key ใหม่ ประกาศใหม่ได้
//    ฝั่งจอจำ key ที่ประกาศแล้วไว้เอง จึงไม่ต้องพลิกธงใน DB
//    ผลคือ "รันคู่กับจอ PHP เดิมได้" ไม่แย่งธงกัน

import "server-only";
import { createHash } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { getDb } from "./db";
import { PHARMACY_DEPCODES } from "./pharmacy.env";
import { assertDate, todayISO } from "./pharmacy.service";

export interface CallInfo {
  /** เปลี่ยนทุกครั้งที่มีการกดเรียกใหม่ — จอใช้กันประกาศซ้ำ */
  key: string;
  /** เลขคิว (ovst.oqueue) — 0/ว่าง = visit นี้ไม่ได้ออกเลขคิว */
  queueNo: string;
  /** ชื่อสำหรับอ่านออกเสียง "คุณ<ชื่อ> <นามสกุล>" */
  callName: string;
  /** ชื่อจุดที่เรียก เช่น "จ่ายยา ก" */
  dept: string;
}

export interface CallData {
  updatedAt: string;
  calling: CallInfo | null;
}

interface CalledRow extends RowDataPacket {
  vn: string;
  oqueue: string | null;
  call_name: string | null;
  department: string | null;
  called_at: string;
}

const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);

/**
 * แถวที่ถูกกดเรียกล่าสุดที่จุดจ่ายยา
 * เงื่อนไขเดียวกับ getMedicineQ.php — curdep + วันที่ + เรียงเวลาเรียกจากใหม่ไปเก่า
 * (getMedicineQ ใส่ DATE(...) = CURDATE() ไว้ ต่างจาก getDoctorRoomQ.php ที่ลืมใส่
 *  แล้วทำให้เช้าวันใหม่จอค้างชื่อคนเมื่อวาน — ที่นี่ใส่ตาม getMedicineQ)
 */
export async function getCallData(date: string = todayISO()): Promise<CallData> {
  assertDate(date);
  const updatedAt = new Date().toISOString();

  const db = getDb();
  if (!db || PHARMACY_DEPCODES.length === 0) return { updatedAt, calling: null };

  const deps = PHARMACY_DEPCODES.map(() => "?").join(",");
  const [rows] = await db.query<CalledRow[]>(
    `
    SELECT o.vn,
           o.oqueue,
           CONCAT('คุณ', pt.fname, ' ', pt.lname) AS call_name,
           k.department,
           sq.sd_queue_calling_datetime AS called_at
      FROM sd_queue_calling sq
      INNER JOIN ovst o          ON o.vn = sq.sd_queue_calling_vn
      INNER JOIN patient pt      ON pt.hn = o.hn
      INNER JOIN kskdepartment k ON k.depcode = sq.sd_queue_calling_curdep
     WHERE sq.sd_queue_calling_curdep IN (${deps})
       AND DATE(sq.sd_queue_calling_datetime) = ?
     ORDER BY sq.sd_queue_calling_datetime DESC
     LIMIT 1
  `,
    [...PHARMACY_DEPCODES, date],
  );

  const r = rows[0];
  if (!r) return { updatedAt, calling: null };

  return {
    updatedAt,
    calling: {
      key: hash(`${r.vn}@${String(r.called_at)}`),
      queueNo: String(r.oqueue ?? "").trim(),
      callName: (r.call_name ?? "").trim(),
      dept: (r.department ?? "").trim(),
    },
  };
}
