// GET /api/pharmacy/call?date=YYYY-MM-DD
// คนที่ถูกกดเรียกคิวล่าสุดที่จุดจ่ายยา — จอใช้ประกาศเสียงอัตโนมัติ
// อ่านอย่างเดียว ไม่เขียน HOSxP (ดูเหตุผลใน lib/pharmacy.call.ts)
import { NextResponse } from "next/server";
import { getCallData } from "@/lib/pharmacy.call";
import { todayISO } from "@/lib/pharmacy.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get("date") ?? todayISO();
  try {
    return NextResponse.json(await getCallData(date), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[pharmacy/call]", err);
    return NextResponse.json({ error: "ดึงคิวที่ถูกเรียกไม่สำเร็จ" }, { status: 502 });
  }
}
