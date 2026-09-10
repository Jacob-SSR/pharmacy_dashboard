// lib/pharmacy.env.ts
// รวม env ของหน้าห้องยาไว้ที่เดียว — server เท่านั้นที่ import ไฟล์นี้
// (client ได้ค่าพวกนี้ผ่าน field `thresholds` ใน payload ของ API แทน)

import "server-only";

import type { Basket } from "./pharmacy.types";

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** env ของฐานข้อมูลครบหรือยัง — ไม่ครบ = ใช้ข้อมูลตัวอย่างแทน ไม่ล้มแอป */
export const DB_KEYS = [
  "DB_HOST",
  "DB_USER",
  "DB_PASS",
  "DB_NAME",
] as const;

export function hasDbConfig(): boolean {
  return DB_KEYS.every((k) => Boolean(process.env[k]));
}

/**
 * depcode ของจุดจ่ายยา (kskdepartment.depcode) คั่นด้วย comma
 * ใช้กรองแถวใน sd_queue_calling ว่า "ถูกเรียกคิวที่ห้องยา" จริงไหม
 * ไม่ตั้งไว้ = ไม่กรองแผนก (นับทุกการเรียกคิวของ visit นั้นในวันนั้น)
 */
export const PHARMACY_DEPCODES: string[] = (
  process.env.PHARMACY_DEPCODES ?? ""
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** จำนวนรายการยาตั้งแต่เท่านี้ขึ้นไป = "ยามาก" (ปกติต้องใช้คนจัด ≥ 2 คน) */
export const MANY_ITEMS_THRESHOLD = num(process.env.PHARMACY_MANY_ITEMS, 4);

/** รอเกินกี่นาทีจึงขึ้นแถบเตือนด้านบน */
export const URGENT_WAIT_MIN = num(process.env.PHARMACY_URGENT_WAIT_MIN, 20);

/** หน้าจอดึงข้อมูลซ้ำทุกกี่มิลลิวินาที */
export const REFRESH_MS = num(process.env.PHARMACY_REFRESH_MS, 30_000);

/** กันแถวบวมเวลาโรงพยาบาลใหญ่/ข้อมูลเพี้ยน */
export const ROW_LIMIT = num(process.env.PHARMACY_ROW_LIMIT, 500);

/**
 * ชื่อบนหัวจอ — ตั้งไว้ในโค้ดที่เดียว ไม่รับจาก env
 * เคยรับจาก env แล้วเจอปัญหา: คนคัดลอก .env.example รุ่นเก่าที่ยังเขียนชื่อผิดไว้
 * ค่าใน env จะทับค่าในโค้ดเสมอ จอเลยขึ้นชื่อผิดทั้งที่แก้โค้ดแล้ว
 */
export const HOSPITAL_NAME = "โรงพยาบาลพลับพลาชัย";

// ─── ระบบเสียงเรียกชื่อ ────────────────────────────────────────────────────────
// ❗ นี่เป็น "จุดเดียวในแอป" ที่เขียนลง HOSxP — ปิดไว้เป็นค่าเริ่มต้น
//    เปิดแล้วจะทำเหมือน getMedicineQ.php เดิม คือพอประกาศเสียงเสร็จจะ
//    UPDATE sd_queue_calling SET status='N' เพื่อกันประกาศชื่อเดิมซ้ำ
//    ถ้ายังเปิดจอ PHP เดิมอยู่ด้วย สองระบบจะแย่งกันประกาศ (ใครพลิกธงก่อนได้ก่อน)
//    → เลือกใช้อย่างใดอย่างหนึ่ง
export const VOICE_ENABLED =
  (process.env.PHARMACY_VOICE ?? "").trim() === "1";

/** จอที่เปิดเสียงจะถามหาคิวใหม่ทุกกี่ ms (ถี่กว่ารอบรีเฟรชตาราง เพื่อให้เรียกทัน) */
export const VOICE_POLL_MS = num(process.env.PHARMACY_VOICE_POLL_MS, 5_000);

/**
 * จัดตะกร้าจากจำนวนรายการยา + ธงเร่งด่วนของ visit
 *
 * ไม่มีรายการยาเลย = คืน null ไม่ใช่ "ยาน้อย"
 * ตั้งแต่เปลี่ยนมาคัดคนเข้าคิวตาม getScreeningW.php (ยืนอยู่ห้องยา = ขึ้นจอ)
 * คนที่ใบสั่งยายังไม่ถูกลงในระบบจะมี drugItems = 0 ถ้าปล่อยให้ตกเป็น "ยาน้อย"
 * ตัวเลขตะกร้าจะเฟ้อ ทั้งที่ยังไม่มีอะไรให้จัด — ซึ่งเป็นตัวเลขหลักของจอนี้
 */
export function basketOf(drugItems: number, ptPriority: number): Basket | null {
  if (drugItems <= 0) return null;
  if (ptPriority > 0) return "urgent";
  return drugItems >= MANY_ITEMS_THRESHOLD ? "many" : "few";
}
