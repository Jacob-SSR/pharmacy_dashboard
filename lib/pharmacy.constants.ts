// lib/pharmacy.constants.ts
// ป้ายชื่อ/ลำดับที่ทั้ง server และ client ใช้ร่วมกัน — ไม่มี env ไม่มี db
// (env ทั้งหมดอยู่ใน lib/pharmacy.env.ts ซึ่งฝั่ง server เท่านั้นที่ import)

import type { Basket, Stage } from "./pharmacy.types";

// ─── ลำดับขั้นในห้องยา ────────────────────────────────────────────────────────
// ยึดตามสคริปต์ที่โรงพยาบาลใช้จริง ไม่ได้คิดขั้นเพิ่มเอง
//   getScreeningW.php  คนที่ยังรอ  = ovst.cur_dep อยู่ห้องยา และยังไม่ถูกเรียก
//   getMedicineQ.php   คนที่เรียกแล้ว = มีแถวใน sd_queue_calling ของจุดจ่ายยาวันนี้
export const STAGE_SEQ: readonly Stage[] = ["waiting", "calling", "dispensed"];

export const STAGE_META: Record<
  Stage,
  { label: string; sub: string; num: string; pulse: boolean; cls: string }
> = {
  waiting: {
    label: "รอเรียกคิว",
    sub: "อยู่ที่ห้องยา ยังไม่ถูกเรียก",
    num: "1",
    pulse: false,
    cls: "st-1",
  },
  calling: {
    label: "เรียกแล้ว",
    sub: "เรียกคิวที่จุดจ่ายยาแล้ว",
    num: "2",
    pulse: true,
    cls: "st-3",
  },
  dispensed: {
    label: "รับยาแล้ว",
    sub: "เสร็จสิ้น / ออกจากห้องยา",
    num: "✓",
    pulse: false,
    cls: "st-5",
  },
};

// ─── ตะกร้ายา ─────────────────────────────────────────────────────────────────
export const BASKET_SEQ: readonly Basket[] = ["few", "many", "urgent"];

export const BASKET_META: Record<
  Basket,
  { label: string; icon: string; cls: string }
> = {
  few: { label: "ยาน้อย", icon: "🟢", cls: "bk-few" },
  many: { label: "ยามาก", icon: "🔵", cls: "bk-many" },
  urgent: { label: "ยาด่วน", icon: "🔴", cls: "bk-urg" },
};

/** นาที → "12 นาที" / "1 ชม. 05 น." */
export function fmtWait(min: number): string {
  if (min < 60) return `${min} นาที`;
  return `${Math.floor(min / 60)} ชม. ${String(min % 60).padStart(2, "0")} น.`;
}
