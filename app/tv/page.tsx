// /tv — จอสำหรับแขวนใน TV ห้องยา (เปิดทิ้งไว้ ไม่มีคนกด)
//
// ตัวเลือกผ่าน query string ปรับได้จากรีโมต/แถบ URL ของ TV โดยไม่ต้อง build ใหม่
//   ?rows=12   จำนวนแถวต่อหน้า (ไม่ใส่ = วัดความสูงจอแล้วคำนวณให้เอง)
//   ?sec=15    เปลี่ยนหน้าทุกกี่วินาที (ค่าเริ่มต้น 12)
//   ?done=1    แสดงคนที่รับยาแล้วด้วย (ค่าเริ่มต้นไม่แสดง — TV ควรเห็นแต่งานค้าง)
//   ?mask=1    ปิดบังนามสกุล เผื่อ TV ตั้งในมุมที่ผู้ป่วยมองเห็น
//   ?voice=1   เปิดเสียงเรียกชื่อบนจอนี้ (ต้องตั้ง env PHARMACY_VOICE=1 ด้วย)
//              ⚠️ เปิดที่ "จอเดียว" เท่านั้น เปิดหลายจอจะแย่งกันประกาศ
import PharmacyDashboard from "../PharmacyDashboard";
import { getPharmacyQueue } from "@/lib/pharmacy.service";
import type { PharmacyQueueData, TvOptions } from "@/lib/pharmacy.types";

export const dynamic = "force-dynamic";

type Param = string | string[] | undefined;

const one = (v: Param): string | undefined => (Array.isArray(v) ? v[0] : v);

const flag = (v: Param): boolean => {
  const s = one(v);
  return s === "1" || s === "true";
};

const posInt = (v: Param, fallback: number | null): number | null => {
  const n = Number(one(v));
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
};

export default async function TvPage(props: PageProps<"/tv">) {
  // Next.js 16: searchParams เป็น Promise ต้อง await
  const sp = await props.searchParams;

  const tv: TvOptions = {
    rowsPerPage: posInt(sp.rows, null),
    pageSeconds: posInt(sp.sec, 12) ?? 12,
    includeDone: flag(sp.done),
    maskName: flag(sp.mask),
  };

  let initial: PharmacyQueueData | null = null;
  let initialError: string | null = null;
  try {
    initial = await getPharmacyQueue();
  } catch (err) {
    console.error("[tv] โหลดคิวห้องยาครั้งแรกไม่สำเร็จ", err);
    initialError = "เชื่อมต่อฐานข้อมูลไม่สำเร็จ กำลังลองใหม่อัตโนมัติ";
  }

  return (
    <PharmacyDashboard
      initial={initial}
      initialError={initialError}
      tv={tv}
      voiceRequested={flag(sp.voice)}
    />
  );
}
