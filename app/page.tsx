import PharmacyDashboard from "./PharmacyDashboard";
import { getPharmacyQueue } from "@/lib/pharmacy.service";
import type { PharmacyQueueData } from "@/lib/pharmacy.types";

// คิวเปลี่ยนตลอด — เรนเดอร์ใหม่ทุก request ไม่มี static cache
export const dynamic = "force-dynamic";

export default async function Page(props: PageProps<"/">) {
  const sp = await props.searchParams;
  const voiceRequested = sp.voice === "1" || sp.voice?.[0] === "1";
  // โหลดชุดแรกฝั่ง server เพื่อให้จอมีข้อมูลทันทีที่เปิด (ไม่ต้องรอ fetch รอบแรก)
  // ต่อ HOSxP ไม่ได้ก็ยังต้องเปิดจอได้ — ให้ client ลองดึงใหม่เองทุกรอบ refresh
  let initial: PharmacyQueueData | null = null;
  let initialError: string | null = null;
  try {
    initial = await getPharmacyQueue();
  } catch (err) {
    console.error("[page] โหลดคิวห้องยาครั้งแรกไม่สำเร็จ", err);
    initialError = "เชื่อมต่อฐานข้อมูลไม่สำเร็จ กำลังลองใหม่อัตโนมัติ";
  }

  return (
    <PharmacyDashboard
      initial={initial}
      initialError={initialError}
      voiceRequested={voiceRequested}
    />
  );
}
