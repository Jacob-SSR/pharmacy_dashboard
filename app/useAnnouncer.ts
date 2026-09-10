"use client";

// app/useAnnouncer.ts
// ยกมาจากโปรเจกต์พี่น้อง cashier_dashboard (app/useAnnouncer.ts) เกือบทั้งดุ้น
// เปลี่ยนแค่ endpoint กับ type — ตรรกะเสียง/การปลดล็อก/กันประกาศซ้ำ พิสูจน์มาแล้ว
// กับจอห้องเก็บเงินของ รพ. เดียวกัน จึงไม่เขียนใหม่
// ประกาศเรียกชื่อคนที่ถึงคิว "อัตโนมัติ" — ไม่มีปุ่มให้ใครกดตอนทำงานปกติ
//
// ── ทำไมไม่ใช้ speechSynthesis ของเบราว์เซอร์ ──────────────────────────────
// จอนี้ต้องแขวนได้กับทีวีทุกยี่ห้อ (LG webOS / Samsung Tizen / Google TV /
// TCL / Hisense / Philips) ซึ่ง Web Speech API มีบ้างไม่มีบ้าง และเสียงไทย
// ที่ติดมากับเครื่องเป็นคนละตัวกันทุกยี่ห้อ — เสียงจะไม่เหมือนกันสักจอ
//
// จึงย้ายไปให้ "เซิร์ฟเวอร์" สร้างเสียงด้วย Google Translate TTS ตัวเดิมที่จอเก่าใช้
// แล้วส่งมาเป็น MP3 ธรรมดา ทีวีเห็นแค่ไฟล์เสียงผ่าน <audio> มาตรฐาน
//
//   คิว → Next.js → Google Translate TTS → MP3 → HTTP → ทีวี → <audio> → ลำโพง
//
// ── จังหวะที่ประกาศ ───────────────────────────────────────────────────────
// เจ้าหน้าที่กด "เรียกคิว" ใน HOSxP → มีแถวใหม่ใน sd_queue_calling
// → /api/queue/call คืน key ใหม่ → จอประกาศ 1 ครั้ง
//
// ⚠️ นโยบาย autoplay: เบราว์เซอร์ไม่ยอมเล่นเสียงจนกว่าจะมีการกดปุ่มสักครั้ง
//    hook คืน needsUnlock + unlockSound() ให้จอขึ้นปุ่มให้กดด้วยรีโมตทีวี
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioQueueManager } from "@/lib/audio/AudioQueueManager";
import type { CallData } from "@/lib/pharmacy.call";

interface Options {
  /** เปิดเสียงประกาศบนจอนี้ — จอเดียวในห้องควรเปิด จอที่เหลือปิด กันเสียงซ้อน */
  enabled: boolean;
  /** ระยะถามเซิร์ฟเวอร์ว่ามีคนถูกเรียกใหม่หรือยัง (วินาที) */
  refreshSeconds: number;
  /** ข้อความประกาศ — ใส่ชื่อคนไข้กับจุดบริการเข้าไป */
  buildAnnouncement: (row: NonNullable<CallData["calling"]>) => string;
}

export function useAnnouncer({
  enabled,
  refreshSeconds,
  buildAnnouncement,
}: Options) {
  const [calling, setCalling] = useState<CallData["calling"]>(null);
  const [needsUnlock, setNeedsUnlock] = useState(false);

  // key ของคนที่ประกาศไปแล้ว — กันประกาศซ้ำคนเดิม
  const announced = useRef<Set<string>>(new Set());
  // รอบแรกยังไม่ประกาศ: เปิดจอ/รีเฟรชหน้า ไม่ควรตะโกนชื่อคนที่ยืนอยู่หน้าเคาน์เตอร์แล้ว
  const primed = useRef(false);
  // ตัวจัดคิวเสียง — เล่นทีละอัน ไม่ให้ทับกันเวลาเรียกรัว ๆ
  // สร้างครั้งแรกตอนถูกใช้จริง (ไม่แตะ ref ระหว่าง render และไม่สร้างตอน SSR)
  const audioRef = useRef<AudioQueueManager | null>(null);
  const getAudio = useCallback((): AudioQueueManager | null => {
    if (typeof window === "undefined") return null;
    if (!audioRef.current) audioRef.current = new AudioQueueManager();
    return audioRef.current;
  }, []);

  /** ปุ่มบนจอเรียกอันนี้ — ต้องอยู่ในจังหวะที่ผู้ใช้เพิ่งกดปุ่มจริง ๆ */
  const unlockSound = useCallback(async () => {
    // true = มาจากการกดจริงของผู้ใช้
    const ok = await getAudio()?.unlock(true);
    if (ok) setNeedsUnlock(false);
  }, [getAudio]);

  const speak = useCallback(
    (row: NonNullable<CallData["calling"]>) => {
      const text = buildAnnouncement(row);
      if (!text.trim()) return;
      // ใส่ URL ตรง ๆ ใน <audio> — ไม่ต้องแปลงเป็น Blob/data URI
      // ทีวีบางยี่ห้อจัดการ object URL ได้ไม่ดี แต่ไฟล์ผ่าน HTTP ปกติเล่นได้หมด
      getAudio()?.enqueue(`/api/tts?text=${encodeURIComponent(text)}`);
    },
    [buildAnnouncement, getAudio],
  );

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/pharmacy/call", { cache: "no-store" });
      if (!res.ok) return;
      const data: CallData = await res.json();
      setCalling(data.calling);

      const head = data.calling;
      if (!head) return;

      if (!primed.current) {
        // รอบแรก: จำไว้ว่าคนนี้ "ถือว่าประกาศแล้ว" โดยไม่ต้องออกเสียง
        primed.current = true;
        announced.current.add(head.key);
        return;
      }

      if (announced.current.has(head.key)) return;
      announced.current.add(head.key);
      if (enabled) speak(head);
    } catch {
      // ดึงไม่ได้รอบนี้ = ข้ามไป รอบหน้าค่อยว่ากัน จอไม่ต้องขึ้น error
    }
  }, [enabled, speak]);

  useEffect(() => {
    // รอบแรกยิงใน tick ถัดไป (ไม่เรียกตรง ๆ ใน effect body เพื่อไม่ให้เกิด cascading render)
    const first = setTimeout(poll, 0);
    const id = setInterval(poll, Math.max(5, refreshSeconds) * 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [poll, refreshSeconds]);

  // ── ตรวจว่าเบราว์เซอร์ยอมให้เล่นเสียงหรือยัง ────────────────────────────
  // ลองปลดล็อกเองก่อน (บางเครื่อง/บาง kiosk ยอมอยู่แล้ว) ถ้าไม่ได้ค่อยขึ้นปุ่ม
  // ให้กดด้วยรีโมต แล้วลองซ้ำเรื่อย ๆ เผื่อเบราว์เซอร์ยอมทีหลัง
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const attempt = async (delay: number) => {
      if (stop) return;
      const mgr = getAudio();
      if (!mgr) return;

      // ⚠️ ห้าม probe ระหว่างที่กำลังประกาศอยู่
      //    การ probe ต้องตั้ง src ของ element ซึ่งจะไปขัดจังหวะเสียงที่เล่นค้างอยู่
      //    (AbortError: play() request was interrupted by a new load request)
      //    ถ้าเล่นอยู่ได้ = เบราว์เซอร์ยอมแล้ว ไม่ต้อง probe ตั้งแต่แรก
      if (mgr.isUnlocked()) {
        setNeedsUnlock(false);
        return;
      }

      const ok = await mgr.unlock();
      if (stop) return;
      if (ok) {
        setNeedsUnlock(false);
        return; // ปลดล็อกแล้ว ไม่ต้องลองอีก
      }
      setNeedsUnlock(true);
      timer = setTimeout(() => void attempt(10_000), delay);
    };

    void attempt(10_000);

    /**
     * ★ กดตรงไหนก็ได้ทั้งจอ = ปลดล็อกเสียง
     *
     * ไม่ต้องเล็งปุ่มให้ตรง — คลิกเมาส์ แตะจอ กดปุ่มอะไรก็ได้บนรีโมต
     * (ลูกศร, OK, ตัวเลข, ปุ่มสี) ล้วนนับเป็น user gesture ทั้งหมด
     *
     * ดักที่ระดับ document แบบ capture เพื่อให้ทำงานก่อนตัวอื่นเสมอ
     * และต้องเรียก unlock() แบบ "ไม่ await ก่อนหน้า" เพราะเบราว์เซอร์นับ
     * เฉพาะ play() ที่ถูกเรียกใน task เดียวกับการกดเท่านั้น
     */
    const onGesture = () => {
      const mgr = getAudio();
      if (!mgr || mgr.isUnlocked()) return;
      void mgr.unlock(true).then((ok) => {
        if (!stop && ok) setNeedsUnlock(false);
      });
    };

    const events = ["pointerdown", "mousedown", "touchstart", "keydown", "click"] as const;
    for (const ev of events) {
      document.addEventListener(ev, onGesture, { capture: true, passive: true });
    }

    return () => {
      stop = true;
      clearTimeout(timer);
      for (const ev of events) {
        document.removeEventListener(ev, onGesture, { capture: true });
      }
    };
  }, [enabled, getAudio]);

  return { calling, needsUnlock, unlockSound };
}
