"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import {
  BASKET_META,
  BASKET_SEQ,
  STAGE_META,
  STAGE_SEQ,
  fmtWait,
} from "@/lib/pharmacy.constants";
import { useAnnouncer } from "./useAnnouncer";
import type {
  Basket,
  DrugLine,
  PharmacyQueueData,
  QueueRow,
  Stage,
  TvOptions,
} from "@/lib/pharmacy.types";

type SortKey = "time" | "vn" | "hn" | "name" | "pttype" | "basket" | "items" | "wait" | "stage";

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const THAI_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const pad = (n: number) => String(n).padStart(2, "0");

/** จำนวนแถวต่อหน้าของจอบนโต๊ะ (จอ TV คำนวณจากความสูงจริงแทน) */
const DESK_PAGE_SIZE = 8;

const BASKET_ORDER: Record<Basket, number> = { urgent: 0, many: 1, few: 2 };
/** ยังไม่มีใบสั่งยา (null) ให้ไปอยู่ท้ายสุดเวลาเรียงตามตะกร้า */
const bkOrder = (b: Basket | null) => (b === null ? 99 : BASKET_ORDER[b]);
const STAGE_ORDER = Object.fromEntries(STAGE_SEQ.map((s, i) => [s, i])) as Record<Stage, number>;

/** เผื่อ TV ตั้งในมุมที่ผู้ป่วยมองเห็น — เหลือแค่อักษรแรกของนามสกุล */
function maskSurname(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full;
  return [...parts.slice(0, -1), `${parts[parts.length - 1].slice(0, 1)}●●●`].join(" ");
}

/** สีป้ายสิทธิ — จับจากคำในชื่อสิทธิ ไม่ได้ผูกกับรหัส เพราะแต่ละที่ตั้งชื่อไม่เหมือนกัน */
function pttypeClass(name: string): string {
  if (/เบิก|ตรง|จ่ายตรง/.test(name)) return "pt-a";
  if (/ชำระ|จ่ายเงิน|เอง/.test(name)) return "pt-b";
  return "pt-c";
}

/** ความสูงสำรอง เผื่อวัดจาก DOM จริงไม่ได้ (เช่นตารางว่าง) */
const TV_FALLBACK_ROW_PX = 58;
const TV_FALLBACK_HEAD_PX = 46;
const TV_FALLBACK_FOOT_PX = 46;

// ─── ไอคอน ────────────────────────────────────────────────────────────────────
const S = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const Ic = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S} aria-hidden dangerouslySetInnerHTML={{ __html: d }} />
);
const I = {
  pill:   `<path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7Z"/><path d="m8.5 8.5 7 7"/>`,
  home:   `<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 21v-8h6v8"/>`,
  tv:     `<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>`,
  phone:  `<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>`,
  clip:   `<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>`,
  chart:  `<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="5" width="3" height="12"/>`,
  gear:   `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.6a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4Z"/>`,
  user:   `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
  users:  `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>`,
  glass:  `<path d="M5 22h14M5 2h14M17 22v-4.2a2 2 0 0 0-.6-1.4L14 14l2.4-2.4a2 2 0 0 0 .6-1.4V6M7 22v-4.2a2 2 0 0 1 .6-1.4L10 14 7.6 11.6A2 2 0 0 1 7 10.2V6"/>`,
  check:  `<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>`,
  xmark:  `<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>`,
  chev:   `<path d="m9 18 6-6-6-6"/>`,
  chevL:  `<path d="m15 18-6-6 6-6"/>`,
  search: `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>`,
  info:   `<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>`,
  warn:   `<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>`,
  clock:  `<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>`,
  refresh:`<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>`,
  cal:    `<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>`,
  bell:   `<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>`,
  list:   `<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>`,
};

// ─── ชิ้นส่วนย่อย ─────────────────────────────────────────────────────────────

function BasketTag({ basket }: { basket: Basket | null }) {
  // ยืนอยู่ห้องยาแต่ใบสั่งยายังไม่ลงระบบ — ยังไม่มีอะไรให้จัดตะกร้า
  if (!basket) return <span className="col-id">ยังไม่มีใบสั่งยา</span>;
  const m = BASKET_META[basket];
  return <span className={`tag ${m.cls}`}>{m.icon} {m.label}</span>;
}

function StageTag({ stage }: { stage: Stage }) {
  const m = STAGE_META[stage];
  return (
    <span className={`tag ${m.cls}`}>
      <span className={`tag-dot${m.pulse ? " pulse-dot" : ""}`} />
      {m.label}
    </span>
  );
}

function WaitChip({ row, urgentMin }: { row: QueueRow; urgentMin: number }) {
  if (row.stage === "dispensed") {
    return <span className="wait-chip done"><Ic d={I.clock} size={14} />รวม {fmtWait(row.waitMin)}</span>;
  }
  return (
    <span className={`wait-chip${row.waitMin >= urgentMin ? " warn" : ""}`}>
      <Ic d={I.clock} size={14} />{fmtWait(row.waitMin)}
    </span>
  );
}

// ─── นาฬิกา ───────────────────────────────────────────────────────────────────
// เวลาเป็น external store — subscribe ผ่าน useSyncExternalStore แทน setState ใน effect
// (ตัวหลังทำให้เกิด cascading render และ eslint ห้ามไว้)
// ค่า snapshot ต้อง cache ไม่ใช่คำนวณใหม่ทุกครั้งที่ React อ่าน ไม่งั้นเรนเดอร์วนไม่จบ
let tickMs = 0;
const tickListeners = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | null = null;

function subscribeTick(cb: () => void): () => void {
  tickListeners.add(cb);
  if (!tickTimer) {
    tickMs = Date.now();
    tickTimer = setInterval(() => {
      tickMs = Date.now();
      for (const l of tickListeners) l();
    }, 1000);
  }
  return () => {
    tickListeners.delete(cb);
    if (tickListeners.size === 0 && tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  };
}
const getTick = () => tickMs;
/** ฝั่ง server ไม่มีนาฬิกาที่ตรงกับเครื่องผู้ใช้ → คืน null แล้วโชว์ placeholder */
const getServerTick = () => null;

function Clock() {
  const ms = useSyncExternalStore(subscribeTick, getTick, getServerTick);
  const now = ms ? new Date(ms) : null;
  return (
    <div className="clock">
      <div className="clock-ring"><Ic d={I.clock} size={21} /></div>
      <div>
        <div className="time">
          {now ? `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` : "--:--:--"}
        </div>
        <div className="date">
          {now
            ? `วัน${THAI_DAYS[now.getDay()]}ที่ ${now.getDate()} ${THAI_MONTHS[now.getMonth()]} ${now.getFullYear() + 543}`
            : " "}
        </div>
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="sidebar">
      <Link className="nav-item active" href="/"><Ic d={I.home} />หน้าหลัก</Link>
      <a className="nav-item" href="/tv" target="_blank" rel="noopener noreferrer"><Ic d={I.tv} />จอ TV</a>
      {/* หน้าพวกนี้ยังไม่ได้ทำ — วางไว้ให้เห็นโครง แต่ทำให้ชัดว่ากดไม่ได้ ไม่ใช่ลิงก์เสีย */}
      <span className="nav-item soon"><Ic d={I.phone} />เรียกคิว<span className="soon-tag">ยังไม่มี</span></span>
      <span className="nav-item soon"><Ic d={I.clip} />ประวัติการจ่ายยา<span className="soon-tag">ยังไม่มี</span></span>
      <span className="nav-item soon"><Ic d={I.chart} />รายงาน<span className="soon-tag">ยังไม่มี</span></span>
      <span className="nav-item soon"><Ic d={I.gear} />ตั้งค่า<span className="soon-tag">ยังไม่มี</span></span>
      <div className="side-foot">
        <div className="user-card">
          <div className="user-avatar"><Ic d={I.user} size={20} /></div>
          <div>
            <div className="who">เภสัชกร</div>
            <div className="role">ฝ่ายเภสัชกรรม</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/** หน้าต่างรายการยาของผู้ป่วย 1 ราย */
function DrugModal({ row, date, onClose }: { row: QueueRow; date: string; onClose: () => void }) {
  const [lines, setLines] = useState<DrugLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/pharmacy/queue/${encodeURIComponent(row.vn)}/items?date=${date}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { lines: DrugLine[] }) => setLines(d.lines))
      .catch((e) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setError("ดึงรายการยาไม่สำเร็จ");
      });
    return () => ac.abort();
  }, [row.vn, date]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true"
           aria-label={`รายการยาของ ${row.name}`}>
        <div className="modal-head">
          <div>
            <h2>{row.name}</h2>
            <div className="sub">
              HN {row.hn} · VN {row.vn} · {row.drugItems} รายการ
              {row.pttype && ` · ${row.pttype}`}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="ปิด"><Ic d={I.xmark} /></button>
        </div>
        <div className="modal-body">
          {error && <p className="modal-note">{error}</p>}
          {!error && lines === null && <p className="modal-note">กำลังโหลด…</p>}
          {!error && lines !== null && lines.length === 0 && (
            <p className="modal-note">ไม่พบรายการยา (ใบสั่งยาอาจถูกยกเลิก)</p>
          )}
          {lines !== null && lines.length > 0 && (
            <ul className="drug-list">
              {lines.map((l) => (
                <li key={l.icode}>
                  <span className="drug-name">
                    {l.name}
                    {l.strength && <span className="drug-strength"> · {l.strength}</span>}
                  </span>
                  <span className="drug-qty">{l.qty.toLocaleString("th-TH")} {l.units}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── หน้าจอหลัก ───────────────────────────────────────────────────────────────

export default function PharmacyDashboard({
  initial,
  initialError,
  tv = null,
  voiceRequested = false,
}: {
  initial: PharmacyQueueData | null;
  initialError: string | null;
  /** ส่งค่ามา = เรนเดอร์เป็นจอ TV (หน้า /tv) · null = จอบนโต๊ะตามปกติ */
  tv?: TvOptions | null;
  /** URL มี ?voice=1 — จอนี้ขอเป็นตัวประกาศเสียง */
  voiceRequested?: boolean;
}) {
  const isTv = tv !== null;

  const [data, setData] = useState<PharmacyQueueData | null>(initial);
  const [error, setError] = useState<string | null>(initialError);
  const [query, setQuery] = useState("");
  const [basketFilter, setBasketFilter] = useState<Basket | "all">("all");
  const [stageFilter, setStageFilter] = useState<Stage | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("wait");
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<QueueRow | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [date, setDate] = useState(initial?.date ?? "");

  const [page, setPage] = useState(0);
  const [autoRows, setAutoRows] = useState(10);
  const tableRef = useRef<HTMLDivElement>(null);

  const refreshMs = data?.thresholds.refreshMs ?? 30_000;
  const urgentMin = data?.thresholds.urgentWaitMin ?? 20;
  const manyItems = data?.thresholds.manyItems ?? 4;

  const inflight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    inflight.current?.abort();
    const ac = new AbortController();
    inflight.current = ac;
    try {
      const qs = date ? `?date=${encodeURIComponent(date)}` : "";
      const res = await fetch(`/api/pharmacy/queue${qs}`, { signal: ac.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as PharmacyQueueData);
      setError(null);
      setFetchedAt(new Date());
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      // ดึงไม่สำเร็จ = คงข้อมูลรอบก่อนไว้บนจอ แล้วขึ้นแถบเตือน ดีกว่าจอว่าง
      setError("ดึงข้อมูลไม่สำเร็จ กำลังลองใหม่อัตโนมัติ");
    }
  }, [date]);

  useEffect(() => {
    if (!initial) void load();
    const id = setInterval(() => void load(), refreshMs);
    return () => { clearInterval(id); inflight.current?.abort(); };
  }, [load, refreshMs, initial]);

  // เปลี่ยนวันที่ = ดึงใหม่ทันที ไม่ต้องรอรอบ refresh
  const firstDate = useRef(true);
  useEffect(() => {
    if (firstDate.current) { firstDate.current = false; return; }
    void load();
  }, [date, load]);

  const rows = useMemo(() => data?.rows ?? [], [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = rows.filter((r) => {
      // TV ควรเห็นแต่งานที่ยังค้าง — คนรับยาไปแล้วไม่ต้องกินที่บนจอ
      if (isTv && !tv.includeDone && r.stage === "dispensed") return false;
      if (basketFilter !== "all" && r.basket !== basketFilter) return false;
      if (stageFilter !== "all" && r.stage !== stageFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) || r.hn.toLowerCase().includes(q) ||
        r.vn.toLowerCase().includes(q) || r.queue.toLowerCase().includes(q)
      );
    });

    const dir = sortAsc ? 1 : -1;
    const cmp = (a: string, b: string) => a.localeCompare(b, "th");
    out.sort((a, b) => {
      // คนที่รับยาไปแล้วไม่ใช่งานค้าง — ดันลงล่างเสมอ ยกเว้นตอนเรียงตามขั้นตอนโดยตรง
      if (sortKey !== "stage") {
        const da = a.stage === "dispensed" ? 1 : 0;
        const db = b.stage === "dispensed" ? 1 : 0;
        if (da !== db) return da - db;
      }
      switch (sortKey) {
        case "wait":   return dir * (a.waitMin - b.waitMin);
        case "items":  return dir * (a.drugItems - b.drugItems);
        case "basket": return dir * (bkOrder(a.basket) - bkOrder(b.basket));
        case "stage":  return dir * (STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]);
        case "pttype": return dir * cmp(a.pttype, b.pttype);
        case "time":   return dir * cmp(a.timeStr, b.timeStr);
        case "vn":     return dir * cmp(a.vn, b.vn);
        case "hn":     return dir * cmp(a.hn, b.hn);
        case "name":   return dir * cmp(a.name, b.name);
        default:       return 0;
      }
    });
    return out;
  }, [rows, query, basketFilter, stageFilter, sortKey, sortAsc, isTv, tv]);

  // ── โหมด TV: วัดพื้นที่จริงของจอว่าใส่ได้กี่แถว ──
  // ResizeObserver ยิง callback แบบ async (ไม่ใช่ setState ใน effect body ตรง ๆ)
  // และ .tv ล็อกความสูงไว้ 100vh + overflow hidden จอจึงไม่ขยายตามจำนวนแถว
  // = ไม่เกิดลูป measure → render → measure
  useEffect(() => {
    if (!isTv || tv.rowsPerPage) return;
    const el = tableRef.current;
    if (!el) return;

    const measure = () => {
      const h = (sel: string, fallback: number) =>
        el.querySelector(sel)?.getBoundingClientRect().height || fallback;
      const firstRow = el.querySelector("tbody tr");
      const rowH =
        firstRow instanceof HTMLElement && firstRow.offsetHeight > 0
          ? firstRow.offsetHeight
          : TV_FALLBACK_ROW_PX;
      // วัดของจริงทุกชิ้น แทนการเดาเป็นค่าคงที่ — ไม่งั้นเหลือพื้นที่ว่างใต้ตาราง
      const avail =
        window.innerHeight - el.getBoundingClientRect().top -
        h("thead", TV_FALLBACK_HEAD_PX) - h(".table-foot", TV_FALLBACK_FOOT_PX) - 6;
      setAutoRows(Math.max(3, Math.floor(avail / rowH)));
    };

    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [isTv, tv]);

  // ── โหมด TV: เลื่อนหน้าอัตโนมัติ ──
  useEffect(() => {
    if (!isTv) return;
    const id = setInterval(() => setPage((p) => p + 1), tv.pageSeconds * 1000);
    return () => clearInterval(id);
  }, [isTv, tv]);

  const perPage = isTv ? (tv.rowsPerPage ?? autoRows) : DESK_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  // หาร mod ตอนเรนเดอร์แทนการ clamp state — คิวหดลงแล้วหน้าไม่ค้างเกินขอบเอง
  const curPage = isTv ? page % totalPages : Math.min(page, totalPages - 1);
  const visible = filtered.slice(curPage * perPage, (curPage + 1) * perPage);
  const rowOffset = curPage * perPage;

  const longWait = useMemo(
    () => rows.filter((r) => r.stage !== "dispensed" && r.waitMin >= urgentMin).length,
    [rows, urgentMin],
  );
  const pending = rows.length - (data?.byStage.dispensed ?? 0);
  const called = (data?.byStage.calling ?? 0) + (data?.byStage.dispensed ?? 0);

  // ── ระบบเสียงเรียกชื่อ ──
  // ใช้ useAnnouncer ที่ยกมาจาก cashier_dashboard — อ่านอย่างเดียว ไม่เขียน HOSxP
  // เปิดได้เมื่อ env เปิด + URL มี ?voice=1 (กันหลายจอประกาศทับกัน)
  const voiceAvailable = Boolean(voiceRequested && data?.voice.enabled);

  // ❗ ต้องห่อ useCallback — useAnnouncer ใส่ buildAnnouncement ไว้ใน dep ของ effect
  //    ถ้าส่ง arrow inline identity จะเปลี่ยนทุก render → effect ล้างแล้วตั้ง timer ใหม่
  //    ทุกครั้ง → poll ยิงถี่กว่าที่ตั้งไว้มาก และประกาศข้ามคน (เจอตอนทดสอบจริง)
  const buildAnnouncement = useCallback(
    // ข้อความเดียวกับ getMedicineQ.php เดิม
    (row: { callName: string; dept: string }) =>
      `ขอเชิญ ${row.callName} ที่จุด ${row.dept} ค่ะ`,
    [],
  );

  const { calling, needsUnlock, unlockSound } = useAnnouncer({
    enabled: voiceAvailable,
    refreshSeconds: Math.max(5, Math.round((data?.voice.pollMs ?? 5000) / 1000)),
    buildAnnouncement,
  });

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(true); }
    setPage(0);
  };

  const th = (key: SortKey, label: string, extra = "") =>
    isTv ? (
      <th className={extra}>{label}</th>
    ) : (
      <th className={`sortable ${extra}`} onClick={() => sortBy(key)}
          aria-sort={sortKey === key ? (sortAsc ? "ascending" : "descending") : "none"}>
        {label}{sortKey === key ? (sortAsc ? " ▲" : " ▼") : ""}
      </th>
    );

  const updatedLabel = fetchedAt
    ? `${pad(fetchedAt.getHours())}:${pad(fetchedAt.getMinutes())}:${pad(fetchedAt.getSeconds())}`
    : "—";

  // ปุ่มหน้า: แสดงมากสุด 5 ปุ่มรอบ ๆ หน้าปัจจุบัน
  const pageBtns = useMemo(() => {
    const span = 5;
    let from = Math.max(0, curPage - Math.floor(span / 2));
    const to = Math.min(totalPages, from + span);
    from = Math.max(0, to - span);
    return Array.from({ length: to - from }, (_, i) => from + i);
  }, [curPage, totalPages]);

  return (
    <div className={isTv ? "tv shell" : "shell"}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon"><Ic d={I.pill} size={24} /></div>
          <div>
            <h1>ห้องยา</h1>
            <p>{data?.hospitalName ?? "—"} · สถานะคิวจ่ายยา (สำหรับเภสัชกร)</p>
          </div>
        </div>

        <div className="top-right">
          <Clock />
          <div className="top-acts">
            {data?.source === "demo" && (
              <span className="demo-badge" title="ยังไม่ได้ตั้งค่า DB_HOST/DB_USER/DB_PASS/DB_NAME">
                ข้อมูลตัวอย่าง
              </span>
            )}
            {voiceAvailable && needsUnlock && (
              <button className="btn-primary" onClick={() => void unlockSound()}>
                🔊 กดเพื่อเปิดเสียง
              </button>
            )}
            {voiceAvailable && !needsUnlock && (
              <span className="voice-on">🔊 เสียงทำงาน</span>
            )}
            {!isTv && (
              <>
                <a className="btn-soft" href="/tv" target="_blank" rel="noopener noreferrer">
                  <Ic d={I.tv} size={16} />จอ TV
                </a>
                <button className="icon-btn" onClick={() => void load()} aria-label="รีเฟรช">
                  <Ic d={I.refresh} size={17} />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="shell-body">
        {!isTv && <Sidebar />}

        <main className="main">
          {/* การ์ดสรุปตามขั้นตอน — กดเพื่อกรองตาราง */}
          <div className="kpis">
            {STAGE_SEQ.map((stage) => {
              const m = STAGE_META[stage];
              const icon = stage === "waiting" ? I.users
                : stage === "calling" ? I.phone : I.check;
              const active = !isTv && stageFilter === stage;
              return (
                <button
                  key={stage}
                  type="button"
                  className={`kpi stage-${stage}${active ? " active" : ""}`}
                  onClick={isTv ? undefined : () => {
                    setStageFilter((c) => (c === stage ? "all" : stage));
                    setPage(0);
                  }}
                  disabled={isTv}
                  aria-pressed={active}
                >
                  <div className="kpi-icon"><Ic d={icon} size={23} /></div>
                  <div className="kpi-body">
                    <div className="kpi-label">{m.label}</div>
                    <div className="kpi-num">{data?.byStage[stage] ?? 0}</div>
                    <div className="kpi-unit">คน</div>
                  </div>
                  {!isTv && <span className="kpi-chev"><Ic d={I.chev} size={17} /></span>}
                </button>
              );
            })}
          </div>

          {error ? (
            <div className="banner error">
              <span className="banner-icon"><Ic d={I.warn} /></span>
              <span>{error}</span>
            </div>
          ) : longWait > 0 ? (
            <div className="banner warn">
              <span className="banner-icon"><Ic d={I.warn} /></span>
              <span>มีผู้ป่วย <b>{longWait}</b> ราย รอนานเกิน <b>{urgentMin}</b> นาที</span>
            </div>
          ) : (
            <div className="banner info">
              <span className="banner-icon"><Ic d={I.info} /></span>
              <span>
                วันนี้มีผู้ป่วยรอรับยา <b>{pending}</b> ราย จากทั้งหมด <b>{rows.length}</b> ราย
                {" · "}เรียกคิวแล้ว <b>{called}</b> ราย
              </span>
              <span className="banner-spacer" />
              <span>อัปเดต {updatedLabel}</span>
            </div>
          )}

          {/* ตะกร้ายา — นับเฉพาะคนที่ยังไม่รับยา */}
          <div className="baskets">
            {BASKET_SEQ.map((b) => {
              const m = BASKET_META[b];
              const hint = b === "urgent" ? "ผู้ป่วยเร่งด่วน (pt_priority)"
                : b === "many" ? `ตั้งแต่ ${manyItems} รายการขึ้นไป`
                : `น้อยกว่า ${manyItems} รายการ`;
              return (
                <div className="basket-card" key={b}>
                  <div className={`basket-chip ${b}`}>{m.icon}</div>
                  <div>
                    <div className="basket-name">ตะกร้า{m.label}</div>
                    <div className="basket-hint">{hint}</div>
                  </div>
                  <div className={`basket-cnt ${b}`}>{data?.byBasket[b] ?? 0}</div>
                </div>
              );
            })}
          </div>

          {!isTv && (
            <div className="toolbar">
              <div className="search-wrap">
                <Ic d={I.search} size={17} />
                <input
                  className="search-input"
                  type="search"
                  placeholder="ค้นหา ชื่อ / HN / VN / คิว…"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(0); }}
                />
              </div>

              <button className={`pill${basketFilter === "all" ? " active" : ""}`}
                      onClick={() => { setBasketFilter("all"); setPage(0); }}>
                ทั้งหมด
              </button>
              {BASKET_SEQ.map((b) => (
                <button key={b} className={`pill${basketFilter === b ? " active" : ""}`}
                        onClick={() => { setBasketFilter(b); setPage(0); }}>
                  <span className={`pill-dot ${b}`} />{BASKET_META[b].label}
                </button>
              ))}

              <div className="date-field">
                <Ic d={I.cal} size={16} />
                <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPage(0); }}
                       aria-label="วันที่ของข้อมูล" />
              </div>
              <button className="btn-primary" onClick={() => void load()}>
                <Ic d={I.refresh} size={16} />รีเฟรช
              </button>
            </div>
          )}

          <div className="table-card" ref={tableRef}>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    {th("time", "เวลา")}
                    {th("vn", "VN")}
                    {th("hn", "HN")}
                    {th("name", "ชื่อ - นามสกุล")}
                    {th("pttype", "สิทธิการรักษา")}
                    {th("basket", "ตะกร้า")}
                    {th("items", "รายการยา", "col-items")}
                    {th("wait", "เวลารอ")}
                    {th("stage", "สถานะ")}
                    {!isTv && <th>ดำเนินการ</th>}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={isTv ? 10 : 11}>
                        <div className="empty-state">
                          <Ic d={I.search} size={44} />
                          <p>ไม่พบรายการที่ตรงกับเงื่อนไข</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    visible.map((r, i) => (
                      <tr key={r.vn} className={r.stage === "dispensed" ? "row-dispensed" : undefined}>
                        <td className="col-num">{rowOffset + i + 1}</td>
                        <td className="col-time">{r.timeStr || "—"}</td>
                        <td className="col-id">{r.vn}</td>
                        <td className="col-id">{r.hn}</td>
                        <td className="col-name">{tv?.maskName ? maskSurname(r.name) : r.name}</td>
                        <td>
                          {r.pttype
                            ? <span className={`tag ${pttypeClass(r.pttype)}`}><span className="tag-dot" />{r.pttype}</span>
                            : <span className="col-id">—</span>}
                        </td>
                        <td><BasketTag basket={r.basket} /></td>
                        <td className="col-items">{r.drugItems}</td>
                        <td><WaitChip row={r} urgentMin={urgentMin} /></td>
                        <td><StageTag stage={r.stage} /></td>
                        {!isTv && (
                          <td>
                            <button className="row-btn" onClick={() => setSelected(r)}>
                              <Ic d={I.list} size={15} />รายการยา
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="table-foot">
              {isTv ? (
                <span>
                  กำลังรอรับยา {filtered.length} ราย
                  {totalPages > 1 && ` · หน้า ${curPage + 1}/${totalPages}`}
                </span>
              ) : (
                <span>
                  แสดง {filtered.length === 0 ? 0 : rowOffset + 1} - {rowOffset + visible.length} จาก {filtered.length} รายการ
                </span>
              )}
              {isTv ? (
                <span>ข้อมูลวันที่ {data?.date ?? "—"} · รีเฟรชทุก {Math.round(refreshMs / 1000)} วินาที</span>
              ) : (
                <div className="pager">
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={curPage === 0} aria-label="หน้าก่อน">
                    <Ic d={I.chevL} size={16} />
                  </button>
                  {pageBtns.map((p) => (
                    <button key={p} className={p === curPage ? "active" : ""} onClick={() => setPage(p)}>
                      {p + 1}
                    </button>
                  ))}
                  <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                          disabled={curPage >= totalPages - 1} aria-label="หน้าถัดไป">
                    <Ic d={I.chev} size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {voiceAvailable && calling && (
        <div className="call-toast">
          📢 ขอเชิญ {calling.callName} ที่จุด {calling.dept} ค่ะ
        </div>
      )}

      {/* หน้าต่างรายการยาเปิดจากปุ่มในตาราง — TV ไม่มีคนกด จึงไม่เรนเดอร์เลย */}
      {!isTv && selected && data && (
        <DrugModal row={selected} date={data.date} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
