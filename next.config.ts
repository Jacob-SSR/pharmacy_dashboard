import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker: บิลด์เป็น standalone → image เล็ก รันด้วย `node server.js` ไม่ต้องมี node_modules ทั้งก้อน
  output: "standalone",
};

export default nextConfig;
