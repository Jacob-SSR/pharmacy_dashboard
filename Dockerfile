# syntax=docker/dockerfile:1
# จอห้องยา — Next.js 16 / React 19 / Node 22 · build เป็น standalone
# แนวเดียวกับ ppc-hos-10667 แต่ไม่มี redis / native module จึงสั้นกว่า

FROM node:22-slim AS base
WORKDIR /app

# ---------- deps ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---------- builder ----------
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# ⚠️ เครื่องที่ build ต้องต่อเน็ตได้ — next/font/google โหลดฟอนต์ Sarabun ตอน build
#    ถ้า build ในวงปิด ให้เปลี่ยนไปใช้ next/font/local แล้ววางไฟล์ฟอนต์ไว้ในโปรเจกแทน
# หมายเหตุ: โปรเจกนี้ type-check ตอน build ได้ (มีแค่ 5 route ไม่ OOM)
#           ต่างจาก ppc-hos-10667 ที่ต้องปิด ignoreBuildErrors
RUN npm run build

# ---------- runner (production) ----------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# รันด้วย user ที่ไม่ใช่ root
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 4600
ENV PORT=4600
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
