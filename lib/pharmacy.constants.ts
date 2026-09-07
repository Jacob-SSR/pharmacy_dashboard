// lib/pharmacy.constants.ts
// ป้ายชื่อ/ลำดับที่ทั้ง server และ client ใช้ร่วมกัน — ไม่มี env ไม่มี db
// (env ทั้งหมดอยู่ใน lib/pharmacy.env.ts ซึ่งฝั่ง server เท่านั้นที่ import)

import type { Basket, Stage } from "./pharmacy.types";

// ─── ลำดับขั้นในห้องยา ────────────────────────────────────────────────────────
// ทุกขั้นมาจาก checkpoint ที่ HOSxP บันทึกไว้จริง (ดูรายละเอียดใน pharmacy.service.ts)
//   service12 = ตรวจเสร็จ (แพทย์)  → ใบสั่งยาเข้าห้องยา
//   service6  = ถึงห้องยา           → กำลังจัด/ตรวจสอบยา
//   sd_queue_calling = ถูกเรียกคิวที่จุดจ่ายยา
//   service16 = รับยาแล้ว           → จบ
export const STAGE_SEQ: readonly Stage[] = [
  "incoming",
  "preparing",
  "calling",
  "dispensed",
];

export const STAGE_META: Record<
  Stage,
  { label: string; sub: string; num: string; pulse: boolean; cls: string }
> = {
  incoming: {
    label: "ใบสั่งยาเข้า",
    sub: "ตรวจเสร็จแล้ว ยังไม่ถึงห้องยา",
    num: "1",
    pulse: false,
    cls: "st-1",
  },
  preparing: {
    label: "จัดยา",
    sub: "ถึงห้องยาแล้ว กำลังจัด/ตรวจสอบ",
    num: "2",
    pulse: true,
    cls: "st-2",
  },
  calling: {
    label: "เรียกรับยา",
    sub: "เรียกคิวที่จุดจ่ายยาแล้ว",
    num: "3",
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
