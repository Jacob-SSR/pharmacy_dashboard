// GET /api/pharmacy/queue/[vn]/items?date=YYYY-MM-DD
// รายการยาของ visit หนึ่ง — ใช้ในหน้าต่างรายละเอียดของเภสัชกร
import { NextResponse } from "next/server";
import { getDrugLines, todayISO } from "@/lib/pharmacy.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, ctx: RouteContext<"/api/pharmacy/queue/[vn]/items">) {
  // Next.js 16: params เป็น Promise ต้อง await เสมอ
  const { vn } = await ctx.params;
  const date = new URL(req.url).searchParams.get("date") ?? todayISO();

  if (!vn) {
    return NextResponse.json({ message: "ต้องระบุ VN" }, { status: 400 });
  }

  try {
    const lines = await getDrugLines(vn, date);
    return NextResponse.json(
      { vn, date, lines },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[pharmacy/queue/items]", err);
    return NextResponse.json(
      { message: "ดึงรายการยาไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
