// app/api/tts/route.ts
// ส่งไฟล์เสียงประกาศเป็น MP3 ธรรมดา ให้เบราว์เซอร์ของทีวีเล่นด้วย <audio>
//
// ทีวีไม่ต้องรู้เลยว่าเสียงมาจากไหน เห็นแค่ไฟล์ audio/mpeg ผ่าน HTTP ปกติ
// จึงใช้ได้กับทุกยี่ห้อโดยไม่ต้องเขียนโค้ดแยกตาม platform
//
// เรียกได้ 2 แบบ
//   GET  /api/tts?text=...    ← จอใช้แบบนี้ ใส่ใน <audio src> ได้ตรง ๆ
//   POST /api/tts  {"text":"..."}
import { createLegacyThaiTTS, looksLikeMp3 } from "@/lib/tts/legacyThaiTTS";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** ความเร็วเสียง 1 = เท่าจอเดิมเป๊ะ ๆ, ต่ำกว่านั้นช้าลง (Google รับ 0.1–1) */
function ttsSpeed(raw: string | null): number {
  const n = Number(raw ?? process.env.TTS_RATE ?? 1);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0.1, n));
}

/**
 * ?debug=1 — คืน JSON บอกว่าได้ไฟล์อะไรมาจาก Google แทนการส่งเสียง
 * ไว้ให้หน้างานเปิดดูได้เองเวลาเสียงไม่ออก จะได้รู้ว่าติดตรงไหน
 */
async function debugInfo(text: string, speed: number): Promise<Response> {
  try {
    const audio = await createLegacyThaiTTS(text, speed);
    return Response.json({
      ok: true,
      bytes: audio.length,
      isMp3: looksLikeMp3(audio),
      head: audio.subarray(0, 16).toString("hex"),
      text,
      speed,
    });
  } catch (err) {
    return Response.json({ ok: false, error: String(err), text, speed }, { status: 502 });
  }
}

async function respond(text: string, speed: number): Promise<Response> {
  if (!text.trim()) {
    return Response.json({ error: "text is required" }, { status: 400 });
  }

  try {
    const audio = await createLegacyThaiTTS(text, speed);

    // log ไว้ใน docker compose logs ทุกครั้ง — เวลาเสียงไม่ออกจะได้ดูย้อนหลังได้
    // ว่าเซิร์ฟเวอร์ส่งอะไรออกไป โดยไม่ต้องให้หน้างานเปิด ?debug=1 เอง
    console.log(
      `[tts] ${audio.length} ไบต์ mp3=${looksLikeMp3(audio)} ` +
        `head=${audio.subarray(0, 8).toString("hex")} "${text.slice(0, 40)}..."`,
    );

    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        // ⚠️ ห้ามตั้ง Content-Length เอง — Next อาจบีบอัด/ส่งแบบ chunked
        //    แล้วความยาวที่แจ้งไว้ไม่ตรงกับที่ส่งจริง เบราว์เซอร์จะได้ไฟล์ไม่ครบ
        //    โหลดผ่าน (200) แต่ decode ไม่ได้ → <audio> ขึ้น error หาสาเหตุยาก
        "Accept-Ranges": "none",
        // ประโยคเดิมถูกเรียกซ้ำได้ (เรียกคนเดิมอีกรอบ / เปิดหลายจอ)
        // ให้เบราว์เซอร์เก็บไว้ได้ จะได้ไม่ต้องรอโหลดใหม่ทุกครั้ง
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    // เครื่องที่รัน docker ต้องออกเน็ตไปหา translate.google.com ได้
    // ถ้าโรงพยาบาลบล็อกไว้จะมาตกตรงนี้ — จอยังทำงานต่อได้ แค่ไม่มีเสียง
    console.error("[tts] สร้างเสียงไม่สำเร็จ:", err);
    return Response.json(
      { error: "tts_unavailable", detail: String(err) },
      { status: 502 },
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const text = url.searchParams.get("text") ?? "";
  const speed = ttsSpeed(url.searchParams.get("speed"));
  if (url.searchParams.get("debug") === "1") return debugInfo(text, speed);
  return respond(text, speed);
}

export async function POST(request: Request) {
  let body: { text?: string; speed?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  return respond(body.text ?? "", ttsSpeed(body.speed?.toString() ?? null));
}
