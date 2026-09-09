import type { Metadata, Viewport } from "next";
import { Sarabun } from "next/font/google";
import "./globals.css";

// Sarabun — ฟอนต์ราชการไทย ตรงกับแบบร่างที่ห้องยาออกแบบไว้
const sarabun = Sarabun({
  variable: "--font-sarabun",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ห้องยา — สถานะคิวจ่ายยา",
  description: "จอสถานะคิวห้องยาสำหรับเภสัชกร (ใช้ภายในเท่านั้น)",
  // จอนี้มีชื่อ-นามสกุลผู้ป่วยเต็ม — กันไม่ให้ search engine เก็บ index เด็ดขาด
  robots: { index: false, follow: false, nocache: true },
};

// ธีมสว่างอย่างเดียว — บอก browser ไว้ด้วย ไม่งั้น control ของระบบ (เช่น input[type=date],
// scrollbar) จะถูกเรนเดอร์เป็นโทนมืดตามเครื่องผู้ใช้ แล้วหลุดโทนกับหน้าจอ
export const viewport: Viewport = { colorScheme: "light" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={sarabun.variable}>
      <body>{children}</body>
    </html>
  );
}
