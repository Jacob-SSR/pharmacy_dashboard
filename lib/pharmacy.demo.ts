// lib/pharmacy.demo.ts
// ข้อมูลตัวอย่างสำหรับตอนที่ยังไม่ได้ตั้ง env ฐานข้อมูล
// มีไว้ให้เปิดดู/แก้หน้าจอได้โดยไม่ต้องต่อ HOSxP จริง — หน้าจอจะขึ้นป้าย "ข้อมูลตัวอย่าง"
// ❗ ชื่อทุกชื่อในไฟล์นี้เป็นชื่อสมมติ ไม่ใช่ผู้ป่วยจริง

import "server-only";
import { basketOf } from "./pharmacy.env";
import type { DrugLine, QueueRow, Stage } from "./pharmacy.types";

interface Seed {
  hn: string;
  name: string;
  items: number;
  priority: number;
  /** นาทีก่อนเวลาปัจจุบัน ที่ผู้ป่วยรายนี้เข้าสู่ขั้นปัจจุบัน */
  agoMin: number;
  stage: Stage;
  /** สิทธิการรักษา */
  pttype: string;
}

const SEEDS: Seed[] = [
  { hn: "00812", name: "นางสาวสุภาพร ใจดี", items: 2, priority: 0, agoMin: 214, stage: "dispensed" , pttype: "เบิกจ่ายตรง" },
  { hn: "02341", name: "นายสมชาย รักไทย", items: 6, priority: 0, agoMin: 187, stage: "dispensed" , pttype: "ชำระเงินเอง" },
  { hn: "00988", name: "เด็กชายธีรภัทร ฝันดี", items: 3, priority: 0, agoMin: 154, stage: "dispensed" , pttype: "ข้าราชการ" },
  { hn: "01555", name: "นางสาวพิมพ์ชนก สายรุ้ง", items: 4, priority: 1, agoMin: 132, stage: "dispensed" , pttype: "บัตรทอง" },
  { hn: "01200", name: "นางสาวอรทัย เพชรงาม", items: 1, priority: 0, agoMin: 96, stage: "dispensed" , pttype: "ประกันสังคม" },
  { hn: "00333", name: "นางปาริชาต สีทอง", items: 7, priority: 0, agoMin: 71, stage: "dispensed" , pttype: "เบิกจ่ายตรง" },
  { hn: "02250", name: "นางพรพิมล แสนดี", items: 2, priority: 0, agoMin: 58, stage: "dispensed" , pttype: "ชำระเงินเอง" },
  { hn: "04010", name: "นางสมหมาย เข้มแข็ง", items: 8, priority: 0, agoMin: 34, stage: "calling" , pttype: "ข้าราชการ" },
  { hn: "01880", name: "นายวีรพงษ์ สุขสันต์", items: 5, priority: 2, agoMin: 27, stage: "calling" , pttype: "บัตรทอง" },
  { hn: "03200", name: "นางชนาภา ดีงาม", items: 2, priority: 0, agoMin: 22, stage: "calling" , pttype: "ประกันสังคม" },
  { hn: "00770", name: "นายประพัฒน์ มั่นใจ", items: 9, priority: 0, agoMin: 25, stage: "waiting" , pttype: "เบิกจ่ายตรง" },
  { hn: "02550", name: "นางสาวจิตรา ร่าเริง", items: 3, priority: 0, agoMin: 19, stage: "waiting" , pttype: "ชำระเงินเอง" },
  { hn: "01660", name: "นางลำดวน ดวงดี", items: 4, priority: 1, agoMin: 16, stage: "waiting" , pttype: "ข้าราชการ" },
  { hn: "03800", name: "เด็กชายภาสกร จิตใจดี", items: 5, priority: 0, agoMin: 12, stage: "waiting" , pttype: "บัตรทอง" },
  { hn: "00440", name: "นางสาวธัญพร สว่างจิต", items: 1, priority: 0, agoMin: 9, stage: "waiting" , pttype: "ประกันสังคม" },
  { hn: "02980", name: "นายอธิป คิดดี", items: 6, priority: 3, agoMin: 7, stage: "waiting" , pttype: "เบิกจ่ายตรง" },
  { hn: "01130", name: "นางรวีวรรณ งามสง่า", items: 4, priority: 0, agoMin: 5, stage: "waiting" , pttype: "ชำระเงินเอง" },
  { hn: "03550", name: "นายนพดล ตั้งมั่น", items: 2, priority: 0, agoMin: 3, stage: "waiting" , pttype: "ข้าราชการ" },
  { hn: "02100", name: "นางสาวกวินทรา ใสบริสุทธิ์", items: 3, priority: 1, agoMin: 1, stage: "waiting" , pttype: "บัตรทอง" },
  // เคสที่ต้องไม่ไปโผล่ในตัวเลขตะกร้า: ยืนอยู่ห้องยาแล้วแต่ใบสั่งยายังไม่ถูกลงในระบบ
  { hn: "01777", name: "นายกิตติชัย พร้อมมูล", items: 0, priority: 0, agoMin: 2, stage: "waiting", pttype: "บัตรทอง" },
];

/** คิวตัวอย่างของวันที่กำหนด — เวลาเลื่อนตามนาฬิกาจริงเพื่อให้ "เวลารอ" ดูสมจริง */
export function demoQueue(date: string): QueueRow[] {
  const now = Date.now();
  const pad = (n: number) => String(n).padStart(2, "0");
  const vnPrefix = date.replace(/-/g, "").slice(2);

  return SEEDS.map((s, i) => {
    const at = new Date(now - s.agoMin * 60_000);
    return {
      vn: `${vnPrefix}-${pad(i + 1)}`,
      hn: s.hn,
      queue: String(i + 1),
      name: s.name,
      basket: basketOf(s.items, s.priority),
      stage: s.stage,
      drugItems: s.items,
      drugQty: s.items * 21,
      ptPriority: s.priority,
      timeStr: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
      waitMin: s.agoMin,
      pttype: s.pttype,
      curDeptCode: "051",
      curDept: "ห้องยาผู้ป่วยนอก",
      statusName: s.stage === "dispensed" ? "รับยาแล้ว" : "รอรับยา",
    } satisfies QueueRow;
  });
}

// ─── รายการยาตัวอย่าง ─────────────────────────────────────────────────────────
// ชุดยาสามัญที่ห้องยา OPD จ่ายบ่อย — ใช้เฉพาะตอนยังไม่ต่อ HOSxP
const DEMO_DRUGS: readonly Omit<DrugLine, "qty">[] = [
  { icode: "1000001", name: "Paracetamol", strength: "500 mg", units: "เม็ด" },
  { icode: "1000002", name: "Amoxicillin", strength: "500 mg", units: "แคปซูล" },
  { icode: "1000003", name: "Simethicone", strength: "80 mg", units: "เม็ด" },
  { icode: "1000004", name: "Chlorpheniramine", strength: "4 mg", units: "เม็ด" },
  { icode: "1000005", name: "Omeprazole", strength: "20 mg", units: "แคปซูล" },
  { icode: "1000006", name: "Metformin", strength: "500 mg", units: "เม็ด" },
  { icode: "1000007", name: "Amlodipine", strength: "5 mg", units: "เม็ด" },
  { icode: "1000008", name: "Simvastatin", strength: "20 mg", units: "เม็ด" },
  { icode: "1000009", name: "Enalapril", strength: "5 mg", units: "เม็ด" },
  { icode: "1000010", name: "ORS ผงเกลือแร่", strength: "", units: "ซอง" },
];

/**
 * รายการยาตัวอย่างของ VN หนึ่ง
 * VN ของข้อมูลตัวอย่างลงท้ายด้วยลำดับใน SEEDS (ดู demoQueue) จึงย้อนกลับไปหา
 * จำนวนรายการยาของคนนั้นได้ ให้ตรงกับเลขที่โชว์ในตาราง
 */
export function demoDrugLines(vn: string): DrugLine[] {
  const idx = Number(vn.split("-").pop()) - 1;
  const seed = SEEDS[idx];
  const n = Math.min(seed?.items ?? 3, DEMO_DRUGS.length);
  // เลื่อนจุดเริ่มตามลำดับ เพื่อให้แต่ละคนไม่ได้ยาชุดเดียวกันเป๊ะ
  const offset = Number.isFinite(idx) ? Math.max(0, idx) : 0;
  return Array.from({ length: n }, (_, i) => ({
    ...DEMO_DRUGS[(offset + i) % DEMO_DRUGS.length],
    qty: (i + 1) * 10,
  }));
}
