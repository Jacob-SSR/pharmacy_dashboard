// POST /api/pharmacy/announce?date=YYYY-MM-DD
// เอาคิวที่รอประกาศคนถัดไปมา 1 คน พร้อม mp3 — และพลิกธงเป็น "ประกาศแล้ว"
//
// เป็น POST เพราะ "เขียน" ลง HOSxP (พลิก sd_queue_calling_status) ไม่ใช่ GET
// ปิดไว้เป็นค่าเริ่มต้น เปิดด้วย env PHARMACY_VOICE=1
import { NextResponse } from "next/server";
import { VOICE_ENABLED } from "@/lib/pharmacy.env";
import { todayISO } from "@/lib/pharmacy.service";
import { nextAnnouncement } from "@/lib/pharmacy.voice";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!VOICE_ENABLED) {
    return NextResponse.json(
      { message: "ระบบเสียงปิดอยู่ — เปิดด้วย env PHARMACY_VOICE=1" },
      { status: 403 },
    );
  }

  const date = new URL(req.url).searchParams.get("date") ?? todayISO();
  try {
    const a = await nextAnnouncement(date);
    return NextResponse.json(
      { announcement: a },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[pharmacy/announce]", err);
    const raw = err instanceof Error ? err.message : "";
    return NextResponse.json(
      { message: raw.startsWith("ยังไม่ได้ตั้ง") || raw.startsWith("รูปแบบวันที่") ? raw : "เรียกคิวด้วยเสียงไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
