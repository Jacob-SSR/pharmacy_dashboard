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
    const message =
      err instanceof Error && err.message.startsWith("รูปแบบวันที่")
        ? err.message
        : "ดึงข้อมูลคิวห้องยาไม่สำเร็จ";
    const status = message.startsWith("รูปแบบวันที่") ? 400 : 500;
    return NextResponse.json({ message }, { status });
  }
}
