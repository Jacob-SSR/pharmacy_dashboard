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

export const HOSPITAL_NAME =
  process.env.PHARMACY_HOSPITAL_NAME ?? "โรงพยาบาลพลับพลาชัย";

/** จัดตะกร้าจากจำนวนรายการยา + ธงเร่งด่วนของ visit */
export function basketOf(drugItems: number, ptPriority: number): Basket {
  if (ptPriority > 0) return "urgent";
  return drugItems >= MANY_ITEMS_THRESHOLD ? "many" : "few";
}
