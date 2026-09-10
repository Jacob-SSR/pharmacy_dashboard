// lib/pharmacy.voice.ts
// ระบบเสียงเรียกชื่อ — ทำตาม getMedicineQ.php เดิม
//
// กลไกของเดิม:
//   1) อ่านแถวใน sd_queue_calling ที่ status='Y' (= ยังไม่ประกาศ)
//   2) ประกอบข้อความ "ขอเชิญ คุณ<ชื่อ> <นามสกุล> ที่จุด <แผนก> ค่ะ"
//   3) ยิง Google Translate TTS เอา mp3 มาเล่น
//   4) UPDATE status='N' กันประกาศชื่อเดิมซ้ำรอบถัดไป
//
// ❗ ข้อ 4 คือการเขียนลง HOSxP — จุดเดียวในแอปนี้ที่เขียน และปิดไว้เป็นค่าเริ่มต้น
//    (ดู VOICE_ENABLED ใน pharmacy.env.ts)
//
// ต่างจากของเดิม 3 จุด — ทั้งสามเป็นการรัดกุมขึ้น ไม่ได้เปลี่ยนพฤติกรรมที่ต้องการ:
//   - ประกาศทีละคน ไม่ต่อชื่อหลายคนเป็นก้อนเดียว
//     (Google TTS ตัดข้อความยาวเกิน ~200 ตัวอักษร ของเดิมเสี่ยงชื่อขาดกลางประโยค)
//   - UPDATE ผูก vn + วันที่ + depcode ด้วย ของเดิมใช้แค่ hn + queue
//     ซึ่งอาจไปพลิกธงของ visit วันอื่น/แผนกอื่นที่ hn กับเลขคิวชนกัน
//   - ค่าทุกตัวส่งเป็น placeholder ไม่ต่อ string เข้า SQL

import "server-only";
import type { RowDataPacket } from "mysql2";
import { getDb } from "./db";
import { PHARMACY_DEPCODES, VOICE_ENABLED } from "./pharmacy.env";
import { assertDate, todayISO } from "./pharmacy.service";

/** ผลของการขอประกาศ 1 ครั้ง */
export interface Announcement {
  /** ข้อความที่จะอ่าน — ฝั่งจอใช้เป็น fallback ถ้า mp3 มาไม่ได้ */
  text: string;
  /** mp3 จาก Google TTS เป็น base64 · null = ดึงไม่ได้ ให้จอใช้เสียงของ browser แทน */
  audioBase64: string | null;
  hn: string;
  queue: string;
  name: string;
  department: string;
}

interface PendingRow extends RowDataPacket {
  vn: string;
  hn: string;
  oqueue: string | null;
  call_name: string | null;
  department: string | null;
  curdep: string;
}

const GOOGLE_TTS = "https://translate.google.com/translate_tts";

/** ดึง mp3 ภาษาไทยจาก Google TTS — endpoint เดียวกับที่สคริปต์เดิมใช้ */
async function fetchTts(text: string): Promise<string | null> {
  const url =
    `${GOOGLE_TTS}?ie=UTF-8&client=gtx&tl=th&q=${encodeURIComponent(text)}`;
  try {
    const res = await fetch(url, {
      // ไม่ใส่ User-Agent จะถูกตอบ 403 บ่อย
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[voice] Google TTS ตอบ ${res.status} — จอจะใช้เสียง browser แทน`);
      return null;
    }
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch (err) {
    // ตู้ที่อยู่วงปิดออกเน็ตไม่ได้ = ปกติ ไม่ใช่ error ที่ต้องหยุดทำงาน
    console.warn("[voice] ดึง Google TTS ไม่ได้ — จอจะใช้เสียง browser แทน", err);
    return null;
  }
}

/**
 * เอาคิวที่รอประกาศ "คนถัดไป 1 คน" มาประกาศ แล้วพลิกธงเป็น N
 * ไม่มีใครรอประกาศ = คืน null
 */
export async function nextAnnouncement(
  date: string = todayISO(),
): Promise<Announcement | null> {
  if (!VOICE_ENABLED) return null;
  assertDate(date);

  const db = getDb();
  if (!db || PHARMACY_DEPCODES.length === 0) return null;
  const deps = PHARMACY_DEPCODES.map(() => "?").join(",");

  // เงื่อนไข status='Y' + curdep + วันที่ ตรงกับ getMedicineQ.php
  // เอาคนที่ถูกกดเรียกก่อนสุดที่ยังไม่ประกาศ (ของเดิมเรียง DESC เพราะเป็นจอโชว์คิวล่าสุด
  // แต่การ "ประกาศ" ต้องไล่จากคนที่ถูกเรียกก่อน ไม่งั้นคนแรกไม่มีวันได้ยินชื่อ)
  const [rows] = await db.query<PendingRow[]>(
    `
    SELECT o.vn,
           o.hn,
           o.oqueue,
           CONCAT('คุณ', pt.fname, ' ', pt.lname) AS call_name,
           k.department,
           sq.sd_queue_calling_curdep AS curdep
      FROM sd_queue_calling sq
      INNER JOIN ovst o          ON o.vn = sq.sd_queue_calling_vn
      INNER JOIN patient pt      ON pt.hn = o.hn
      INNER JOIN kskdepartment k ON k.depcode = sq.sd_queue_calling_curdep
     WHERE sq.sd_queue_calling_status = 'Y'
       AND sq.sd_queue_calling_curdep IN (${deps})
       AND DATE(sq.sd_queue_calling_datetime) = ?
     ORDER BY sq.sd_queue_calling_datetime ASC
     LIMIT 1
  `,
    [...PHARMACY_DEPCODES, date],
  );

  const r = rows[0];
  if (!r) return null;

  const name = (r.call_name ?? "").trim();
  const department = (r.department ?? "").trim();
  const hn = String(r.hn ?? "").trim();
  const queue = String(r.oqueue ?? "").trim();
  // ข้อความเดียวกับ getMedicineQ.php
  const text = `ขอเชิญ ${name} ที่จุด ${department} ค่ะ`;

  // พลิกธงก่อนเล่นเสียง — ถ้าพลิกทีหลังแล้วจอปิดกลางทาง ชื่อจะถูกประกาศซ้ำไม่จบ
  // ผูก vn + วันที่ + depcode ด้วย (ของเดิมใช้แค่ hn + queue ซึ่งกว้างเกินไป)
  await db.query(
    `UPDATE sd_queue_calling
        SET sd_queue_calling_status = 'N'
      WHERE sd_queue_calling_vn = ?
        AND sd_queue_calling_curdep = ?
        AND DATE(sd_queue_calling_datetime) = ?
        AND sd_queue_calling_status = 'Y'`,
    [r.vn, r.curdep, date],
  );

  return { text, audioBase64: await fetchTts(text), hn, queue, name, department };
}
