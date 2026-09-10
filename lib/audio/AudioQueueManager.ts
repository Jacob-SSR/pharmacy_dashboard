// lib/audio/AudioQueueManager.ts
// เล่นเสียงประกาศทีละอัน ห้ามทับกัน
//
// เจ้าหน้าที่กดเรียกคิวรัว ๆ ได้ (คนหนึ่งไม่มา กดเรียกคนถัดไปเลย) ถ้าปล่อยให้
// เล่นพร้อมกันคนไข้จะไม่ได้ยินชื่อตัวเองสักคน ตัวนี้จึงต่อคิวเสียงไว้แล้วเล่น
// ไล่ทีละอันจนหมด
//
// ใช้ HTMLAudioElement ล้วน ๆ ไม่มี API เฉพาะยี่ห้อ จึงใช้ได้กับทีวีทุกแบรนด์
type Task = { url: string; onDone?: () => void };

/** แปลรหัส error ของ <audio> เป็นภาษาที่บอกสาเหตุได้จริง */
function describeMediaError(err: MediaError | null): string {
  if (!err) return "ไม่ทราบสาเหตุ";
  switch (err.code) {
    case 1:
      return "MEDIA_ERR_ABORTED — ถูกยกเลิกกลางคัน";
    case 2:
      return "MEDIA_ERR_NETWORK — เน็ตหลุดระหว่างโหลด";
    case 3:
      return "MEDIA_ERR_DECODE — โหลดได้แต่ถอดรหัสไม่ได้ (ไฟล์ไม่ใช่ MP3 ที่ถูกต้อง)";
    case 4:
      return "MEDIA_ERR_SRC_NOT_SUPPORTED — เบราว์เซอร์ไม่รับไฟล์นี้ (มักได้ HTML แทนเสียง)";
    default:
      return `code ${err.code} ${err.message}`;
  }
}

export class AudioQueueManager {
  private queue: Task[] = [];
  private playing = false;
  private unlocked = false;

  /** element เดียวใช้ซ้ำตลอด — ทีวีบางรุ่นสร้าง Audio ใหม่รัว ๆ แล้วค้าง */
  private el: HTMLAudioElement | null = null;

  /**
   * ⚠️ ต้องเป็นคนละ element กับตัวที่ใช้เล่นประกาศเด็ดขาด
   *
   * เดิมใช้ตัวเดียวกัน พอ unlock() ไปตั้ง src เป็นไฟล์เงียบระหว่างที่ประกาศ
   * กำลังเล่นอยู่ เบราว์เซอร์ก็ยกเลิกการเล่นทิ้ง ขึ้น
   *   AbortError: The play() request was interrupted by a new load request
   * แล้วประกาศนั้นก็เงียบไปเลย — เป็นสาเหตุที่เสียงไม่ออกทั้งที่ไฟล์ปกติดี
   */
  private unlockEl: HTMLAudioElement | null = null;

  /** ไฟล์เงียบตัวที่กำลังใช้ทดสอบ — เลื่อนไปตัวถัดไปถ้าเบราว์เซอร์ decode ไม่ได้ */
  private silentIdx = 0;

  private makeEl(): HTMLAudioElement {
    const el = new Audio();
    el.preload = "auto";
    // ทีวีบางรุ่นต้องมี attribute นี้ถึงจะเล่นโดยไม่เปิดตัวเล่นเต็มจอ
    el.setAttribute("playsinline", "");
    return el;
  }

  private element(): HTMLAudioElement {
    if (!this.el) this.el = this.makeEl();
    return this.el;
  }

  /**
   * ปลดล็อกเสียง — ต้องเรียก "ในจังหวะที่ผู้ใช้เพิ่งกดปุ่ม" เท่านั้น
   * เบราว์เซอร์นับว่าเป็น user gesture แล้วจะยอมให้เล่นเสียงได้ตลอดไป
   * เล่นไฟล์เงียบสั้น ๆ 1 ครั้งเพื่อ "จอง" สิทธิ์ไว้
   */
  async unlock(fromGesture = false): Promise<boolean> {
    if (this.unlocked) return true;
    // กำลังประกาศอยู่ = เบราว์เซอร์ยอมให้เล่นแล้ว ไม่ต้องไปยุ่งอะไรอีก
    if (this.playing) {
      this.unlocked = true;
      return true;
    }

    if (!this.unlockEl) this.unlockEl = this.makeEl();
    const probe = this.unlockEl;
    const main = this.element();

    // ⚠️ ต้องยิง play() ของทั้งสอง element "ก่อน await ใด ๆ"
    //    เบราว์เซอร์นับเฉพาะ play() ที่ถูกเรียกใน task เดียวกับการกดปุ่ม
    //    ถ้ารอ await ตัวแรกเสร็จค่อยยิงตัวที่สอง ตัวที่สองจะหลุด gesture แล้วโดนบล็อก
    const silent = SILENT_SRCS[this.silentIdx];
    probe.src = silent;
    probe.muted = true;
    main.src = silent;
    main.muted = true;

    const pProbe = probe.play();
    const pMain = main.play();

    try {
      await pProbe;
      probe.pause();
      probe.currentTime = 0;

      // element หลักอาจล้มได้โดยที่ probe ผ่าน — ไม่ถือว่าล้มเหลวทั้งหมด
      await pMain.catch(() => {});
      main.pause();
      main.currentTime = 0;
      main.muted = false;

      this.unlocked = true;
      return true;
    } catch {
      // ไฟล์เงียบตัวนี้เบราว์เซอร์ decode ไม่ได้ → รอบหน้าลองฟอร์แมตถัดไป
      // (MP3 สั้น ๆ บาง build ปฏิเสธ เจอจริงกับ chromium ที่ไม่ได้มาจาก playwright
      //  ผลคือปุ่ม "กดเพื่อเปิดเสียง" ไม่ยอมหายทั้งที่เสียงประกาศออกได้ปกติ)
      if (probe.error && this.silentIdx < SILENT_SRCS.length - 1) this.silentIdx++;
      main.muted = false;

      // ⚠️ มาถึงตรงนี้ไม่ได้แปลว่าเบราว์เซอร์บล็อกเสมอไป
      //    ไฟล์เงียบที่ใช้ทดสอบเป็น MP3 ซึ่งบางเบราว์เซอร์ถอดรหัสไม่ได้
      //    (Chromium รุ่นไม่มี codec ลิขสิทธิ์ ฯลฯ) แล้ว play() จะ reject
      //    ทั้งที่ประกาศจริงเล่นได้ปกติ
      //
      //    ถ้าเป็นการ "กดจริงของผู้ใช้" ให้ถือว่าปลดล็อกแล้ว เพราะการกดคือ
      //    สิ่งเดียวที่นโยบาย autoplay ต้องการ ไม่งั้นแถบให้กดจะค้างตลอด
      //    กดแล้วกดอีกก็ไม่หาย — ซึ่งแย่กว่ามาก
      //    ถ้าสุดท้ายเล่นไม่ได้จริง playOne() จะเจอ NotAllowedError
      //    แล้วตั้งกลับเป็นยังไม่ปลดล็อกให้เอง แถบก็จะกลับมา
      if (fromGesture) {
        this.unlocked = true;
        return true;
      }
      return false;
    }
  }

  isUnlocked(): boolean {
    // กำลังเล่นอยู่ = เบราว์เซอร์ยอมให้เล่นแน่นอน ถือว่าปลดล็อกแล้ว
    return this.unlocked || this.playing;
  }

  /** ต่อคิวเสียง ถ้ายังไม่มีอะไรเล่นอยู่ก็เริ่มเล่นเลย */
  enqueue(url: string, onDone?: () => void): void {
    this.queue.push({ url, onDone });
    if (!this.playing) void this.drain();
  }

  clear(): void {
    this.queue = [];
  }

  private async drain(): Promise<void> {
    this.playing = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;
      await this.playOne(task.url);
      task.onDone?.();
    }
    this.playing = false;
  }

  private playOne(url: string): Promise<void> {
    return new Promise((resolve) => {
      const el = this.element();
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        el.onended = null;
        el.onerror = null;
        clearTimeout(guard);
        resolve();
      };

      // กันค้าง: ถ้าไฟล์เสีย/เน็ตหลุด ต้องไม่ทำให้คิวเสียงตันทั้งวัน
      const guard = setTimeout(finish, 30_000);

      el.onended = finish;
      el.onerror = () => {
        // บอกให้ชัดว่าพังเพราะอะไร ไม่ใช่แค่ "เล่นไม่ได้"
        // MEDIA_ERR_DECODE / SRC_NOT_SUPPORTED = ไฟล์ที่ได้ไม่ใช่ MP3 ที่เล่นได้
        // → เปิด /api/tts?debug=1&text=... ดูว่าเซิร์ฟเวอร์ได้อะไรมาจาก Google
        console.error(
          `[audio] เล่นไฟล์เสียงไม่ได้ (${describeMediaError(el.error)})`,
          "\nลองเปิดดูสาเหตุที่:",
          url.replace("/api/tts?", "/api/tts?debug=1&"),
        );
        finish();
      };

      el.src = url;
      el.play()
        .then(() => {
          // เล่นได้ = เบราว์เซอร์ยอมแล้วแน่นอน
          this.unlocked = true;
        })
        .catch((err: unknown) => {
          const name = err instanceof Error ? err.name : "";
          if (name === "NotAllowedError") {
            // ยังไม่ได้ปลดล็อก — จอจะขึ้นปุ่มให้กดรีโมต
            console.error("[audio] เบราว์เซอร์ยังไม่อนุญาตให้เล่นเสียง:", err);
            this.unlocked = false;
          } else {
            // AbortError ฯลฯ = โดนขัดจังหวะ ไม่ได้แปลว่าถูกบล็อก
            // ห้ามตั้ง unlocked = false ตรงนี้ ไม่งั้นจะไปกระตุ้นให้ probe
            // มาตั้ง src ทับซ้ำ กลายเป็นวนขัดจังหวะกันเองไม่จบ
            console.error("[audio] เล่นไม่สำเร็จ:", err);
          }
          finish();
        });
    });
  }
}

/** MP3 เงียบสั้นที่สุด ใช้ปลดล็อกตอนกดปุ่ม ไม่ต้องยิงเน็ต */
/**
 * ไฟล์เงียบสำหรับทดสอบว่าเบราว์เซอร์ยอมให้เล่นเสียงหรือยัง
 * เรียงจาก MP3 (ตัวที่ใช้บนทีวีจริงมาแล้ว) → WAV/PCM (รองรับกว้างสุด เผื่อ MP3 สั้นถูกปฏิเสธ)
 */
const SILENT_MP3 =
  "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA//////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAASDs90hvAAAAAAAAAAAAAAAAAAAA//sQxAADwAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxCADwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";

/** PCM 8kHz 0.05 วิ — ตัวสำรองเวลาเบราว์เซอร์ decode MP3 ข้างบนไม่ได้ */
const SILENT_WAV = "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

const SILENT_SRCS = [SILENT_MP3, SILENT_WAV] as const;
