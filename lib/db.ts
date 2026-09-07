// lib/db.ts
// pool เดียวสำหรับอ่าน HOSxP — อ่านอย่างเดียว ไม่มีการเขียนกลับจากหน้าจอนี้
// โครงตาม ppc-hos-10667/lib/db.ts (charset tis620 + จำกัดขนาด pool)

import "server-only";
import mysql from "mysql2/promise";
import { hasDbConfig } from "./pharmacy.env";

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

let pool: mysql.Pool | null = null;

/**
 * คืน pool ถ้าตั้ง env ครบ ไม่ครบคืน null (ผู้เรียกจะ fallback ไปข้อมูลตัวอย่าง)
 * สร้างครั้งเดียวต่อ process — เรียกซ้ำได้ไม่เปลือง connection
 */
export function getDb(): mysql.Pool | null {
  if (!hasDbConfig()) return null;
  if (pool) return pool;

  pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: num(process.env.DB_PORT, 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,

    charset: "tis620", // HOSxP ใช้ tis620 — อย่าเปลี่ยน ไม่งั้นภาษาไทยเพี้ยน

    // ⚠️ ห้ามเปิดเด็ดขาด — เปิดแล้วยิงหลาย statement ต่อกันได้ = ทาง stacked-query injection
    multipleStatements: false,

    // จำกัดขนาด pool ไว้ชัด ๆ: จอนี้ auto-refresh ทุก 30 วิ และอาจเปิดค้างหลายเครื่อง
    // ปล่อยไม่จำกัดแล้วเผลอ refresh พร้อมกัน = ยิง HOSxP ตัวจริงของโรงพยาบาลรัว ๆ
    connectionLimit: num(process.env.DB_POOL_SIZE, 6),
    maxIdle: num(process.env.DB_POOL_IDLE, 3),
    idleTimeout: 60_000,
    waitForConnections: true,
    queueLimit: num(process.env.DB_QUEUE_LIMIT, 50),
    connectTimeout: 10_000,
    enableKeepAlive: true, // กัน connection ตายเงียบเวลาข้าม LAN/NAT
    keepAliveInitialDelay: 30_000,
  });

  return pool;
}
