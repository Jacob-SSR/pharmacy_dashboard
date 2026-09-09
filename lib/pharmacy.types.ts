// lib/pharmacy.types.ts
// รูปร่างข้อมูลที่ API ห้องยาส่งออก — ใช้ร่วมกันทั้ง server และ client
// ❗ ห้าม import อะไรที่แตะ mysql2 / process.env จากไฟล์นี้

/** ตะกร้ายา — HOSxP ไม่มีฟิลด์นี้ คำนวณจากจำนวนรายการยา + ธงเร่งด่วน */
export type Basket = "few" | "many" | "urgent";

/** ขั้นในห้องยา — ทุกค่ามาจาก checkpoint จริงใน HOSxP (ดู pharmacy.service.ts) */
export type Stage = "incoming" | "preparing" | "calling" | "dispensed";

export interface QueueRow {
  /** คีย์ของแถว = vn (unique ต่อ visit) */
  vn: string;
  hn: string;
  /** เลขคิวห้องยา (ovst.oqueue) — ว่างได้ถ้า HOSxP ยังไม่ออกคิว */
  queue: string;
  /** ชื่อ-นามสกุลเต็ม — จอนี้ให้เภสัชกรดูเท่านั้น จึงไม่ปิดบังนามสกุล */
  name: string;
  basket: Basket;
  stage: Stage;
  /** จำนวนรายการยาของ visit นี้ (นับบรรทัดใน opitemrece ที่เป็นยา) */
  drugItems: number;
  /** จำนวนหน่วยยารวมของ visit นี้ */
  drugQty: number;
  /** ธงเร่งด่วนของ visit (ovst.pt_priority) — 0 = ปกติ */
  ptPriority: number;
  /** "HH:mm" เวลาอ้างอิงของแถว = ถึงห้องยา ถ้ายังไม่ถึงใช้เวลาตรวจเสร็จ */
  timeStr: string;
  /** นาทีที่รออยู่ ณ ตอนที่ query (นับถึงตอนนี้ หรือถึงเวลารับยาถ้าจบแล้ว) */
  waitMin: number;
  /** สิทธิการรักษา (pttype.name) เช่น เบิกจ่ายตรง / ชำระเงินเอง / ข้าราชการ */
  pttype: string;
  /** depcode ปัจจุบันของผู้ป่วย (ovst.cur_dep) */
  curDeptCode: string;
  /** ชื่อแผนกปัจจุบันของผู้ป่วย */
  curDept: string;
  /** ชื่อสถานะ visit ตาม HOSxP (ovstost.name) */
  statusName: string;
}

export interface PharmacyQueueData {
  /** "live" = อ่านจาก HOSxP จริง · "demo" = ยังไม่ตั้งค่า DB ใช้ข้อมูลตัวอย่าง */
  source: "live" | "demo";
  /** ISO timestamp ตอนที่ query เสร็จ */
  updatedAt: string;
  /** วันที่ของข้อมูล (YYYY-MM-DD, ค.ศ.) */
  date: string;
  rows: QueueRow[];
  /** จำนวนต่อขั้น — นับจาก rows ทั้งหมด ไม่สนตัวกรองฝั่งจอ */
  byStage: Record<Stage, number>;
  /** จำนวนต่อตะกร้า — นับเฉพาะคนที่ยังไม่รับยา */
  byBasket: Record<Basket, number>;
  /** เกณฑ์ที่ใช้คำนวณ ส่งมาด้วยเพื่อให้จอแสดงคำอธิบายได้ตรงกับ server */
  thresholds: {
    manyItems: number;
    urgentWaitMin: number;
    refreshMs: number;
  };
  hospitalName: string;
}

/** 1 บรรทัดยาของผู้ป่วย 1 คน (ใช้ในหน้าต่างรายละเอียด) */
export interface DrugLine {
  icode: string;
  name: string;
  strength: string;
  units: string;
  qty: number;
}

/**
 * ตัวเลือกของโหมดจอ TV (หน้า /tv)
 * จอ TV ไม่มีคนกดอะไร จึงตัดช่องค้นหา/ตัวกรอง/การกดดูรายการยาออกทั้งหมด
 * แล้วเปลี่ยนเป็นวนหน้าตารางให้เองแทน
 */
export interface TvOptions {
  /** จำนวนแถวต่อหน้า — null = วัดความสูงจอแล้วคำนวณเอง */
  rowsPerPage: number | null;
  /** เปลี่ยนหน้าทุกกี่วินาที */
  pageSeconds: number;
  /** แสดงคนที่รับยาไปแล้วด้วยหรือไม่ (ปกติไม่แสดง — TV ควรเห็นแต่งานค้าง) */
  includeDone: boolean;
  /** ปิดบังนามสกุล เผื่อ TV ตั้งในมุมที่ผู้ป่วยมองเห็น */
  maskName: boolean;
}
