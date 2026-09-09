// GET /api/pharmacy/debug?date=YYYY-MM-DD
// เครื่องมือวินิจฉัย: ตอบว่า "ทำไมตัวเลขบนจอเป็น 0" โดยไปนับของจริงใน HOSxP
//
// ❗ คืนเฉพาะ "ตัวนับกับรหัสแผนก" ไม่มีชื่อ/HN/VN ของผู้ป่วยเลย
//    ไม่ต้องกลัวข้อมูลผู้ป่วยรั่วจาก endpoint นี้
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getDb } from "@/lib/db";
import { PHARMACY_DEPCODES } from "@/lib/pharmacy.env";
import { assertDate, todayISO } from "@/lib/pharmacy.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get("date") ?? todayISO();

  try {
    assertDate(date);
    const db = getDb();
    if (!db) {
      return NextResponse.json(
        { message: "ยังไม่ได้ตั้ง env ฐานข้อมูล — กำลังใช้ข้อมูลตัวอย่างอยู่" },
        { status: 503 },
      );
    }

    const q = <T extends RowDataPacket>(sql: string, p: unknown[] = []) =>
      db.query<T[]>(sql, p).then(([r]) => r);

    const [calling, curDep, lastDep, svc, status] = await Promise.all([
      // 1) วันนี้มีการเรียกคิวที่แผนกไหนบ้าง — ถ้าว่าง = โรงพยาบาลไม่ได้ใช้ระบบเรียกคิว
      //    หรือ depcode ที่ใช้เรียก ไม่ใช่ตัวเดียวกับที่ตั้งใน PHARMACY_DEPCODES
      q<RowDataPacket>(
        `SELECT sc.sd_queue_calling_curdep AS depcode,
                COALESCE(k.department,'(ไม่พบชื่อแผนก)') AS department,
                COUNT(*) AS rows_today
           FROM sd_queue_calling sc
           LEFT JOIN kskdepartment k ON k.depcode = sc.sd_queue_calling_curdep
          WHERE DATE(sc.sd_queue_calling_datetime) = ?
          GROUP BY 1,2 ORDER BY rows_today DESC LIMIT 30`,
        [date],
      ),
      // 2) วันนี้คนไข้ค้างอยู่แผนกไหนบ้าง (cur_dep) — ใช้หา depcode ห้องยาที่ถูกต้อง
      q<RowDataPacket>(
        `SELECT o.cur_dep AS depcode,
                COALESCE(k.department,'(ไม่พบชื่อแผนก)') AS department,
                COUNT(*) AS patients
           FROM ovst o
           LEFT JOIN kskdepartment k ON k.depcode = o.cur_dep
          WHERE o.vstdate = ? AND (o.an IS NULL OR o.an = '')
          GROUP BY 1,2 ORDER BY patients DESC LIMIT 30`,
        [date],
      ),
      // 3) แผนกก่อนหน้า (last_dep) — คนที่ "ผ่านห้องยาไปแล้ว" จะโผล่ตรงนี้
      q<RowDataPacket>(
        `SELECT o.last_dep AS depcode,
                COALESCE(k.department,'(ไม่พบชื่อแผนก)') AS department,
                COUNT(*) AS patients
           FROM ovst o
           LEFT JOIN kskdepartment k ON k.depcode = o.last_dep
          WHERE o.vstdate = ? AND (o.an IS NULL OR o.an = '')
          GROUP BY 1,2 ORDER BY patients DESC LIMIT 30`,
        [date],
      ),
      // 4) service_time ถูกลงจริงแค่ไหน — ถ้า service16 เป็น 0 แปลว่าเจ้าหน้าที่ไม่ได้ลงเวลารับยา
      q<RowDataPacket>(
        `SELECT COUNT(*) AS visits,
                SUM(service6  IS NOT NULL) AS has_service6_arrive_pharmacy,
                SUM(service12 IS NOT NULL) AS has_service12_end_doctor,
                SUM(service16 IS NOT NULL) AS has_service16_receive_drug
           FROM service_time WHERE vstdate = ?`,
        [date],
      ),
      // 5) ชื่อสถานะ visit ที่มีจริงวันนี้ — ใช้เทียบกับคำที่โค้ดถือว่า "จบงานแล้ว"
      q<RowDataPacket>(
        `SELECT COALESCE(os.name,'(ไม่ระบุ)') AS status_name, COUNT(*) AS patients
           FROM ovst o
           LEFT JOIN ovstost os ON os.ovstost = o.ovstost
          WHERE o.vstdate = ? AND (o.an IS NULL OR o.an = '')
          GROUP BY 1 ORDER BY patients DESC LIMIT 20`,
        [date],
      ),
    ]);

    const configured = PHARMACY_DEPCODES;
    const callingDeps = calling.map((r) => String(r.depcode));
    const matched = configured.filter((d) => callingDeps.includes(d));

    return NextResponse.json(
      {
        date,
        PHARMACY_DEPCODES: configured,
        // สรุปให้อ่านง่าย ๆ ก่อนไปดูตัวเลขดิบข้างล่าง
        วินิจฉัย: {
          เรียกคิววันนี้ทั้งโรงพยาบาล: calling.reduce((a, r) => a + Number(r.rows_today), 0),
          เรียกคิวที่ตรงกับ_PHARMACY_DEPCODES: matched.length
            ? `ตรง ${matched.join(",")}`
            : callingDeps.length
              ? `ไม่ตรงเลย — วันนี้เรียกคิวที่ depcode: ${callingDeps.join(",")}`
              : "วันนี้ไม่มีการเรียกคิวเลยสักแผนก",
          ลง_service16_รับยา: Number(svc[0]?.has_service16_receive_drug ?? 0),
        },
        เรียกคิวแยกตามแผนก: calling,
        คนไข้ค้างอยู่แผนก_cur_dep: curDep,
        แผนกก่อนหน้า_last_dep: lastDep,
        service_time: svc[0] ?? null,
        สถานะ_visit: status,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[pharmacy/debug]", err);
    const raw = err instanceof Error ? err.message : "";
    return NextResponse.json(
      { message: raw || "ตรวจข้อมูลไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
