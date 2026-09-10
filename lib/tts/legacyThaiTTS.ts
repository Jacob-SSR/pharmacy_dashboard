// lib/tts/legacyThaiTTS.ts
// สร้างไฟล์เสียงประกาศด้วย "ตัวเดิมที่จอเก่าใช้" — Google Translate TTS
//
// ทำไมต้องสร้างที่เซิร์ฟเวอร์ ไม่ให้ทีวีทำเอง:
//   จอนี้ต้องแขวนได้กับทีวีทุกยี่ห้อ (LG webOS / Samsung Tizen / Google TV /
//   TCL / Hisense / Philips) ซึ่ง Web Speech API มีบ้างไม่มีบ้าง และเสียงไทย
//   ที่ติดมากับเครื่องก็คนละตัวกันทุกยี่ห้อ — เสียงจะไม่เหมือนกันสักจอ
//   พอย้ายมาสร้างที่เซิร์ฟเวอร์ ทีวีเห็นแค่ไฟล์ MP3 ธรรมดา ทุกยี่ห้อจึงได้
//   เสียงเดียวกันเป๊ะ และเป็นเสียงเดิมที่คนไข้คุ้นอยู่แล้ว
//
// ยกพารามิเตอร์มาจากจอเดิมตรง ๆ (docs/reference/getDoctorRoomQ.php):
//   http://translate.google.com/translate_tts?ie=UTF-8&client=gtx&q=...&tl=th-TH

/** Google TTS รับ q ได้ราว 200 ตัวอักษรต่อครั้ง เผื่อไว้ที่ 180 */
const MAX_CHARS = 180;

/**
 * ยุคที่จอเดิมเขียน (PHP file_get_contents) Google ยังไม่เช็ค User-Agent
 * เดี๋ยวนี้ถ้าไม่ส่งไปจะโดน 403 — ต้องใส่ให้เหมือนเบราว์เซอร์
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/** กันยิงซ้ำ — ชื่อคนเดิมถูกเรียกซ้ำได้ และหลายจอก็ขอไฟล์เดียวกัน */
const CACHE_MAX = 200;
const cache = new Map<string, Buffer>();

function cacheGet(key: string): Buffer | undefined {
  const hit = cache.get(key);
  if (hit) {
    // LRU อย่างง่าย — แตะแล้วเลื่อนไปท้ายแถว
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

function cacheSet(key: string, buf: Buffer): void {
  cache.set(key, buf);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/**
 * ตัดข้อความยาวเป็นท่อน ๆ ให้ไม่เกินโควตาของ Google
 * ตัดตรงช่องว่างก่อนเสมอ จะได้ไม่ตัดกลางคำจนอ่านเพี้ยน
 */
export function splitForTts(text: string, max = MAX_CHARS): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean ? [clean] : [];

  const parts: string[] = [];
  let rest = clean;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(" ", max);
    if (cut <= 0) cut = max; // ไม่มีช่องว่างเลย จำใจตัดตรง ๆ
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/**
 * ค่า client ที่ Google ยอมรับ
 *
 * gtx = ตัวที่จอเดิมใช้ ลองก่อนเสมอ
 * tw-ob = ปลายทางเดียวกัน เสียงเดียวกัน แต่บางช่วง Google ตอบ 403 ให้ gtx
 *         จึงเก็บไว้เป็นตัวสำรอง ไม่ได้เปลี่ยนผู้ให้บริการหรือเสียง
 */
const CLIENTS = ["gtx", "tw-ob"] as const;

function ttsUrl(
  client: string,
  text: string,
  speed: number,
  idx: number,
  total: number,
): string {
  return (
    "https://translate.google.com/translate_tts" +
    "?ie=UTF-8" +
    `&client=${client}` +
    `&q=${encodeURIComponent(text)}` +
    "&tl=th-TH" +
    // Google คาดหวัง 3 ตัวนี้เวลาข้อความถูกตัดเป็นท่อน ๆ
    `&total=${total}&idx=${idx}&textlen=${text.length}` +
    // ไม่ส่ง ttsspeed = ความเร็วเดิมของจอเก่าเป๊ะ ๆ
    (speed && speed !== 1 ? `&ttsspeed=${speed}` : "")
  );
}

async function fetchOne(
  text: string,
  speed: number,
  idx: number,
  total: number,
): Promise<Buffer> {
  let lastErr = "";

  for (const client of CLIENTS) {
    const res = await fetch(ttsUrl(client, text, speed, idx, total), {
      headers: { "User-Agent": UA, Referer: "https://translate.google.com/" },
      cache: "no-store",
    });

    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      const type = res.headers.get("content-type") ?? "";

      // ⚠️ Google ตอบ 200 แต่ไม่ใช่เสียงได้ (หน้า consent / captcha / error)
      //    ถ้าปล่อยผ่าน เบราว์เซอร์จะโหลดสำเร็จแล้วเล่นไม่ได้ ซึ่งหาสาเหตุยากมาก
      //    จึงเช็คลายเซ็นไฟล์จริง ๆ ไม่ดูแค่ content-type
      if (looksLikeMp3(buf)) return buf;

      lastErr =
        `client=${client} ตอบ 200 แต่ไม่ใช่ MP3 ` +
        `(${type}, ${buf.length} ไบต์, ขึ้นต้นด้วย ${preview(buf)})`;
      continue;
    }

    lastErr = `client=${client} → ${res.status} ${res.statusText}`;
  }

  throw new Error(`Legacy TTS failed: ${lastErr}`);
}

/**
 * ไฟล์ MP3 ต้องขึ้นต้นด้วย tag "ID3" หรือ frame sync (0xFF 0xEx/0xFx)
 * ใช้ดูลายเซ็นจริงแทนการเชื่อ content-type ที่ Google ส่งมา
 */
export function looksLikeMp3(buf: Buffer): boolean {
  // ไฟล์เสียงจริงของประโยคสั้นที่สุดยังหลายพันไบต์
  // ถ้าเล็กกว่านี้แปลว่าได้ header เปล่า ๆ หรือข้อความ error มา
  if (buf.length < 512) return false;

  // ขึ้นต้นด้วย frame sync ตรง ๆ
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true;

  // ขึ้นต้นด้วย ID3 tag — ต้องมี frame sync ตามหลังด้วย
  // ไม่ใช่แค่มีคำว่า "ID3" แล้วเนื้อในเป็นขยะ
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const limit = Math.min(buf.length - 1, 4096);
    for (let i = 3; i < limit; i++) {
      if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) return true;
    }
    return false;
  }

  return false;
}

/** ไบต์แรก ๆ แบบอ่านออก ไว้ใส่ใน error ให้รู้ว่า Google ส่งอะไรมาแทนเสียง */
function preview(buf: Buffer): string {
  const head = buf.subarray(0, 32);
  const text = head.toString("utf8").replace(/[^\x20-\x7e\u0e00-\u0e7f]/g, ".");
  return `"${text}" (hex ${head.subarray(0, 8).toString("hex")})`;
}

/**
 * คืน MP3 ของข้อความที่ส่งเข้ามา
 *
 * @param speed  1 = ความเร็วเดิมของจอเก่า, ต่ำกว่านั้นคือช้าลง (Google รับ 0.1–1)
 *               ไม่ได้เปลี่ยน "เสียง" แค่เปลี่ยนความเร็วของเสียงเดิม
 */
export async function createLegacyThaiTTS(
  text: string,
  speed = 1,
): Promise<Buffer> {
  const chunks = splitForTts(text);
  if (chunks.length === 0) throw new Error("text is required");

  const key = `${speed}|${chunks.join("|")}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  // ยิงทีละท่อนตามลำดับ แล้วต่อไฟล์เข้าด้วยกัน
  // (MP3 เป็นเฟรมต่อกัน จึงเอามาต่อท้ายกันตรง ๆ แล้วเล่นรวดเดียวได้)
  const buffers: Buffer[] = [];
  for (let i = 0; i < chunks.length; i++) {
    buffers.push(await fetchOne(chunks[i], speed, i, chunks.length));
  }

  const out = Buffer.concat(buffers);
  cacheSet(key, out);
  return out;
}
