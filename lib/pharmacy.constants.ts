// lib/pharmacy.constants.ts
// ป้ายชื่อ/ลำดับที่ทั้ง server และ client ใช้ร่วมกัน — ไม่มี env ไม่มี db
// (env ทั้งหมดอยู่ใน lib/pharmacy.env.ts ซึ่งฝั่ง server เท่านั้นที่ import)

import type { Basket, Stage } from "./pharmacy.types";

// ─── ลำดับขั้นในห้องยา ────────────────────────────────────────────────────────
// flow จริงของห้องยามี 5 ขั้น แต่ HOSxP บันทึกไว้แค่ 3 จุด จึงเหลือ 3 ขั้นบนจอ
//
//   1 รับใบสั่งยา (Check + ปริ้นสติกเกอร์ + แบ่งตะกร้า)  ✅ ใบสั่งยาเข้า + อยู่ที่ห้องยา
//   2 จัดยา (ยาน้อย / ยามาก)                            ❌ ไม่มีใครบันทึกว่าเริ่ม/จัดเสร็จ
//   3 ตรวจสอบ (Check ก่อนจ่ายยา)                        ❌ ตัดออก (ไม่มีข้อมูล)
//   4 จ่ายยา (เรียกชื่อ + จ่ายยา)                         ✅ sd_queue_calling
//   ✓ รับยาแล้ว                                          ✅ service16 / ออกจากห้องยา
//
// ขั้น 2-3 ถูกยุบรวมเข้าขั้น 1 เพราะทั้งคู่เกิดขึ้น "ระหว่างที่คนไข้นั่งรอ"
// และไม่มีฟิลด์ไหนใน HOSxP บอกได้ว่าตอนนี้อยู่ขั้นไหน — ถ้าแยกก็ต้องเดาเอา ซึ่งไม่ทำ
// ส่วน "ยาน้อย / ยามาก" ของขั้น 2 ไม่ได้หายไปไหน — ไปอยู่ที่การ์ดตะกร้าและคอลัมน์ตะกร้า
//
// ชื่อคีย์ (waiting/calling/dispensed) ยังสื่อถึง "แหล่งข้อมูล" ตามเดิม
// ส่วน label ที่เห็นบนจอใช้ภาษาที่ห้องยาใช้จริง
export const STAGE_SEQ: readonly Stage[] = ["waiting", "calling", "dispensed"];

export const STAGE_META: Record<
  Stage,
  { label: string; sub: string; num: string; pulse: boolean; cls: string }
> = {
  waiting: {
    label: "รับใบสั่งยา",
    sub: "Check + สติกเกอร์ + แบ่งตะกร้า + จัดยา",
    num: "1",
    pulse: false,
    cls: "st-1",
  },
  calling: {
    label: "จ่ายยา",
    sub: "เรียกชื่อ + จ่ายยา",
    num: "2",
    pulse: true,
    cls: "st-3",
  },
  dispensed: {
    label: "รับยาแล้ว",
    sub: "เสร็จสิ้น",
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
