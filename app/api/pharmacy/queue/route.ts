// GET /api/pharmacy/queue?date=YYYY-MM-DD
// คิวห้องยาของวัน — ไม่ระบุ date = วันนี้
import { NextResponse } from "next/server";
import { getPharmacyQueue, todayISO } from "@/lib/pharmacy.service";

// สถานะคิวเปลี่ยนตลอดเวลา — ห้าม cache ทั้งฝั่ง Next และฝั่ง proxy/browser
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get("date") ?? todayISO();

  try {
    const data = await getPharmacyQueue(date);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    // ข้อความจาก DB อาจมีชื่อ host/schema ปนมา — log ฝั่ง server พอ ไม่ส่งออกไป
    console.error("[pharmacy/queue]", err);
    // ข้อความ 2 ประเภทนี้ผู้ดูแลระบบต้องเห็นเพื่อไปแก้ต่อ จึงส่งออกไปตรง ๆ
    // ที่เหลืออาจมีชื่อ host/schema ปนมา → ตอบข้อความกลาง ๆ แล้ว log ไว้ฝั่ง server พอ
    const raw = err instanceof Error ? err.message : "";
    const isBadDate = raw.startsWith("รูปแบบวันที่");
    const isMisconfig = raw.startsWith("ยังไม่ได้ตั้ง");
    const message = isBadDate || isMisconfig ? raw : "ดึงข้อมูลคิวห้องยาไม่สำเร็จ";
    return NextResponse.json({ message }, { status: isBadDate ? 400 : 500 });
  }
}
