"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  BASKET_META,
  BASKET_SEQ,
  STAGE_META,
  STAGE_SEQ,
  fmtWait,
} from "@/lib/pharmacy.constants";
import type {
  Basket,
  DrugLine,
  PharmacyQueueData,
  QueueRow,
  Stage,
  TvOptions,
} from "@/lib/pharmacy.types";

type SortKey = "seq" | "time" | "vn" | "hn" | "name" | "basket" | "items" | "wait" | "stage";

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const THAI_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

const pad = (n: number) => String(n).padStart(2, "0");

/** ลำดับตะกร้าเวลาจัดเรียง: ด่วนขึ้นก่อน */
const BASKET_ORDER: Record<Basket, number> = { urgent: 0, many: 1, few: 2 };
const STAGE_ORDER = Object.fromEntries(
  STAGE_SEQ.map((s, i) => [s, i]),
) as Record<Stage, number>;

/** เผื่อ TV ตั้งในมุมที่ผู้ป่วยมองเห็น — เหลือแค่อักษรแรกของนามสกุล */
function maskSurname(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full;
  return [...parts.slice(0, -1), `${parts[parts.length - 1].slice(0, 1)}●●●`].join(" ");
}

/** ความสูงสำรอง เผื่อวัดจาก DOM จริงไม่ได้ (เช่นตารางว่าง) */
const TV_FALLBACK_ROW_PX = 68;
const TV_FALLBACK_HEAD_PX = 56;
const TV_FALLBACK_FOOT_PX = 52;

// ─── ไอคอน ────────────────────────────────────────────────────────────────────
const IconSearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
  </svg>
);
const IconWarn = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
const IconTheme = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
    <circle cx="12" cy="12" r="5" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

// ─── ชิ้นส่วนย่อย ─────────────────────────────────────────────────────────────

function BasketBadge({ basket }: { basket: Basket }) {
  const m = BASKET_META[basket];
  return <span className={`basket-badge ${m.cls}`}>{m.icon} {m.label}</span>;
}

function StageBadge({ stage }: { stage: Stage }) {
  const m = STAGE_META[stage];
  return (
    <span className={`status-badge ${m.cls}`}>
      {m.pulse && <span className="pulse-dot" />}
      {m.label}
    </span>
  );
}

function WaitChip({ row, urgentMin }: { row: QueueRow; urgentMin: number }) {
  if (row.stage === "dispensed") {
    return <span className="wait-chip done">รวม {fmtWait(row.waitMin)}</span>;
  }
  return (
    <span className={`wait-chip${row.waitMin >= urgentMin ? " warn" : ""}`}>
      {fmtWait(row.waitMin)}
    </span>
  );
}

// ─── นาฬิกา ───────────────────────────────────────────────────────────────────
// เวลาเป็น "external store" ตัวหนึ่ง — subscribe ผ่าน useSyncExternalStore
// แทนการ setState ใน effect (ตัวหลังทำให้เกิด cascading render และ eslint ห้ามไว้)
// ค่า snapshot ต้อง cache ไว้ ไม่ใช่คำนวณใหม่ทุกครั้งที่ React อ่าน ไม่งั้น React
// จะเห็นค่าเปลี่ยนระหว่างเรนเดอร์เดียวกันแล้ววนไม่จบ
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

  if (!ms) {
    return (
      <div className="hdr-clock">
        <div className="time">--:--:--</div>
        <div className="date">&nbsp;</div>
      </div>
    );
  }

  const now = new Date(ms);
  return (
    <div className="hdr-clock">
      <div className="time">{pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}</div>
      <div className="date">
        วัน{THAI_DAYS[now.getDay()]}ที่ {now.getDate()} {THAI_MONTHS[now.getMonth()]} {now.getFullYear() + 543}
      </div>
    </div>
  );
}

/** หน้าต่างรายการยาของผู้ป่วย 1 ราย */
function DrugModal({ row, date, onClose }: { row: QueueRow; date: string; onClose: () => void }) {
  const [lines, setLines] = useState<DrugLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/pharmacy/queue/${encodeURIComponent(row.vn)}/items?date=${date}`, {
      signal: ac.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { lines: DrugLine[] }) => setLines(d.lines))
      .catch((e) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setError("ดึงรายการยาไม่สำเร็จ");
      });
    return () => ac.abort();
  }, [row.vn, date]);

  // ปิดด้วย Esc — จอห้องยาใช้คีย์บอร์ดเป็นหลัก
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`รายการยาของ ${row.name}`}>
        <div className="modal-head">
          <div>
            <h2>{row.name}</h2>
            <div className="sub">HN {row.hn} · VN {row.vn} · {row.drugItems} รายการ</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="ปิด">×</button>
        </div>
        <div className="modal-body">
          {error && <p className="modal-note">{error}</p>}
          {!error && lines === null && <p className="modal-note">กำลังโหลด…</p>}
          {!error && lines !== null && lines.length === 0 && (
            <p className="modal-note">ไม่พบรายการยา (ยังไม่ได้ต่อฐานข้อมูล หรือใบสั่งยาถูกยกเลิก)</p>
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
}: {
  initial: PharmacyQueueData | null;
  initialError: string | null;
  /** ส่งค่ามา = เรนเดอร์เป็นจอ TV (หน้า /tv) · null = จอบนโต๊ะตามปกติ */
  tv?: TvOptions | null;
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

  // ── โหมด TV: วนหน้าตารางเอง ──
  const [page, setPage] = useState(0);
  const [autoRows, setAutoRows] = useState(10);
  const tableRef = useRef<HTMLDivElement>(null);

  const refreshMs = data?.thresholds.refreshMs ?? 30_000;
  const urgentMin = data?.thresholds.urgentWaitMin ?? 20;
  const manyItems = data?.thresholds.manyItems ?? 4;

  // เก็บ AbortController ของรอบก่อนไว้ยกเลิก กันคำขอค้างซ้อนกันตอนเน็ตช้า
  const inflight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    inflight.current?.abort();
    const ac = new AbortController();
    inflight.current = ac;
    try {
      const res = await fetch("/api/pharmacy/queue", { signal: ac.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as PharmacyQueueData);
      setError(null);
      setFetchedAt(new Date());
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      // ดึงไม่สำเร็จ = คงข้อมูลรอบก่อนไว้บนจอ แล้วขึ้นแถบเตือน ดีกว่าจอว่าง
      setError("ดึงข้อมูลไม่สำเร็จ กำลังลองใหม่อัตโนมัติ");
    }
  }, []);

  useEffect(() => {
    if (!initial) void load(); // server โหลดครั้งแรกไม่สำเร็จ → ลองเองทันที
    const id = setInterval(() => void load(), refreshMs);
    return () => {
      clearInterval(id);
      inflight.current?.abort();
    };
  }, [load, refreshMs, initial]);

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
        r.name.toLowerCase().includes(q) ||
        r.hn.toLowerCase().includes(q) ||
        r.vn.toLowerCase().includes(q) ||
        r.queue.toLowerCase().includes(q)
      );
    });

    const dir = sortAsc ? 1 : -1;
    const cmpText = (a: string, b: string) => a.localeCompare(b, "th");
    out.sort((a, b) => {
      // คนที่รับยาไปแล้วไม่ใช่งานค้าง — ดันลงล่างเสมอ ยกเว้นตอนเรียงตามขั้นตอนโดยตรง
      if (sortKey !== "stage") {
        const doneA = a.stage === "dispensed" ? 1 : 0;
        const doneB = b.stage === "dispensed" ? 1 : 0;
        if (doneA !== doneB) return doneA - doneB;
      }
      switch (sortKey) {
        case "wait":   return dir * (a.waitMin - b.waitMin);
        case "items":  return dir * (a.drugItems - b.drugItems);
        case "basket": return dir * (BASKET_ORDER[a.basket] - BASKET_ORDER[b.basket]);
        case "stage":  return dir * (STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]);
        case "time":   return dir * cmpText(a.timeStr, b.timeStr);
        case "vn":     return dir * cmpText(a.vn, b.vn);
        case "hn":     return dir * cmpText(a.hn, b.hn);
        case "name":   return dir * cmpText(a.name, b.name);
        default:       return 0;
      }
    });
    return out;
  }, [rows, query, basketFilter, stageFilter, sortKey, sortAsc, isTv, tv]);

  // ── โหมด TV: วัดพื้นที่จริงของจอว่าใส่ได้กี่แถว ──
  // ResizeObserver ยิง callback แบบ async (ไม่ใช่ setState ใน effect body ตรง ๆ)
  // และ .tv ล็อกความสูงไว้ที่ 100vh + overflow hidden จอจึงไม่ขยายตามจำนวนแถว
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
      const padBottom = parseFloat(getComputedStyle(el).paddingBottom) || 0;
      const avail =
        window.innerHeight -
        el.getBoundingClientRect().top -
        h("thead", TV_FALLBACK_HEAD_PX) -
        h("tfoot", TV_FALLBACK_FOOT_PX) -
        padBottom -
        2; // เผื่อเส้นขอบบน/ล่างของตาราง

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

  const rowsPerPage = tv?.rowsPerPage ?? autoRows;
  const totalPages = isTv ? Math.max(1, Math.ceil(filtered.length / rowsPerPage)) : 1;
  // หาร mod ตอนเรนเดอร์แทนการ clamp state — คิวหดลงแล้วหน้าไม่ค้างเกินขอบเอง
  const curPage = isTv ? page % totalPages : 0;
  const visible = isTv
    ? filtered.slice(curPage * rowsPerPage, (curPage + 1) * rowsPerPage)
    : filtered;
  const rowOffset = isTv ? curPage * rowsPerPage : 0;

  const longWaitCount = useMemo(
    () => rows.filter((r) => r.stage !== "dispensed" && r.waitMin >= urgentMin).length,
    [rows, urgentMin],
  );

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(true); }
  };

  const toggleTheme = () => {
    const root = document.documentElement;
    const cur = root.dataset.theme;
    if (cur === "dark") root.dataset.theme = "light";
    else if (cur === "light") delete root.dataset.theme;
    else root.dataset.theme = "dark";
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

  return (
    <div className={isTv ? "tv" : undefined}>
      <header className="header">
        <div className="brand">
          <div className="brand-icon" aria-hidden>💊</div>
          <div className="brand-text">
            <h1>ห้องยา</h1>
            <p>{data?.hospitalName ?? "—"} · สถานะคิวจ่ายยา (สำหรับเภสัชกร)</p>
          </div>
        </div>

        <Clock />

        <div className="hdr-acts">
          {data?.source === "demo" && (
            <span className="demo-badge" title="ยังไม่ได้ตั้งค่า DB_HOST/DB_USER/DB_PASS/DB_NAME">
              ข้อมูลตัวอย่าง
            </span>
          )}
          {!isTv && (
            <>
              <a className="hdr-btn" href="/tv" target="_blank" rel="noopener noreferrer">
                จอ TV
              </a>
              <button className="hdr-btn" onClick={() => void load()}>รีเฟรช</button>
              <button className="hdr-btn" onClick={toggleTheme} aria-label="สลับธีมสว่าง/มืด">
                <IconTheme />
              </button>
            </>
          )}
          <div className="last-upd">อัปเดต: {updatedLabel}</div>
        </div>
      </header>

      {/* ขั้นตอนในห้องยา — กดที่ขั้นเพื่อกรองตาราง */}
      <div className="pipeline">
        {STAGE_SEQ.map((stage, i) => {
          const m = STAGE_META[stage];
          return (
            <button
              key={stage}
              type="button"
              className={`pipe-step stage-${stage}${!isTv && stageFilter === stage ? " active" : ""}`}
              onClick={isTv ? undefined : () => setStageFilter((cur) => (cur === stage ? "all" : stage))}
              disabled={isTv}
              aria-pressed={!isTv && stageFilter === stage}
            >
              <div className="pipe-num">{m.num}</div>
              <div className="pipe-title">{m.label}</div>
              <div className="pipe-sub">{m.sub}</div>
              <div className="pipe-count">{data?.byStage[stage] ?? 0}</div>
              {i < STAGE_SEQ.length - 1 && <div className="pipe-arrow" aria-hidden>›</div>}
            </button>
          );
        })}
      </div>

      {/* ตะกร้ายา — นับเฉพาะคนที่ยังไม่รับยา */}
      <div className="basket-bar">
        {BASKET_SEQ.map((b) => {
          const m = BASKET_META[b];
          const hint =
            b === "urgent" ? "ผู้ป่วยเร่งด่วน (pt_priority)"
            : b === "many" ? `ตั้งแต่ ${manyItems} รายการขึ้นไป`
            : `น้อยกว่า ${manyItems} รายการ`;
          return (
            <div className="basket-card" key={b}>
              <div className={`basket-dot ${b}`} />
              <div className="basket-info">
                <div className="basket-name">{m.icon} ตะกร้า{m.label}</div>
                <div className={`basket-cnt ${b}`}>{data?.byBasket[b] ?? 0}</div>
                <div className="basket-hint">{hint}</div>
              </div>
            </div>
          );
        })}
      </div>

      {error && <div className="error-strip"><IconWarn /><span>{error}</span></div>}

      {longWaitCount > 0 && (
        <div className="urgent-strip">
          <IconWarn />
          <span>⚠️ มีผู้ป่วย {longWaitCount} ราย รอนานเกิน {urgentMin} นาที</span>
        </div>
      )}

      {!isTv && (
        <div className="controls">
          <div className="search-wrap">
            <IconSearch />
            <input
              className="search-input"
              type="search"
              placeholder="ค้นหา ชื่อ / HN / VN / คิว…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="filter-pills">
            <button className={`pill${basketFilter === "all" ? " active" : ""}`} onClick={() => setBasketFilter("all")}>
              ทั้งหมด
            </button>
            {BASKET_SEQ.map((b) => (
              <button
                key={b}
                className={`pill${basketFilter === b ? " active" : ""}`}
                onClick={() => setBasketFilter(b)}
              >
                {BASKET_META[b].icon} {BASKET_META[b].label}
              </button>
            ))}
          </div>

          <select
            className="status-select"
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value as Stage | "all")}
            aria-label="กรองตามขั้นตอน"
          >
            <option value="all">ทุกขั้นตอน</option>
            {STAGE_SEQ.map((s) => (
              <option key={s} value={s}>{STAGE_META[s].num} – {STAGE_META[s].label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="table-wrap" ref={tableRef}>
        <table>
          <thead>
            <tr>
              <th>#</th>
              {th("time", "⏰ เวลา")}
              {th("vn", "VN")}
              {th("hn", "HN")}
              {th("name", "ชื่อ-นามสกุล")}
              {th("basket", "ตะกร้า")}
              {th("items", "รายการยา", "col-items")}
              {th("wait", "เวลารอ", "col-wait")}
              {th("stage", "ขั้นตอน")}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state">
                    <IconSearch />
                    <p>ไม่พบรายการที่ตรงกับเงื่อนไข</p>
                  </div>
                </td>
              </tr>
            ) : (
              visible.map((r, i) => {
                const longWait = r.stage !== "dispensed" && r.waitMin >= urgentMin;
                const cls =
                  r.stage === "dispensed" ? "row-dispensed"
                  : longWait ? "row-waiting-long"
                  : `row-${r.stage}`;
                return (
                  <tr
                    key={r.vn}
                    className={cls}
                    onClick={isTv ? undefined : () => setSelected(r)}
                    title={isTv ? undefined : "กดเพื่อดูรายการยา"}
                  >
                    <td className="col-num">{rowOffset + i + 1}</td>
                    <td className="col-time">{r.timeStr || "—"}</td>
                    <td className="col-id">{r.vn}</td>
                    <td className="col-id">{r.hn}</td>
                    <td className="col-name">{tv?.maskName ? maskSurname(r.name) : r.name}</td>
                    <td><BasketBadge basket={r.basket} /></td>
                    <td className="col-items">{r.drugItems}</td>
                    <td className="col-wait"><WaitChip row={r} urgentMin={urgentMin} /></td>
                    <td><StageBadge stage={r.stage} /></td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={9}>
                <div className="tfoot-inner">
                  {isTv ? (
                    <span>
                      กำลังรอรับยา {filtered.length} ราย
                      {totalPages > 1 && ` · หน้า ${curPage + 1}/${totalPages}`}
                    </span>
                  ) : (
                    <span>แสดง {filtered.length} จาก {rows.length} รายการ</span>
                  )}
                  <span>
                    ข้อมูลวันที่ {data?.date ?? "—"} · รีเฟรชทุก {Math.round(refreshMs / 1000)} วินาที
                  </span>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* หน้าต่างรายการยาเปิดจากการกดแถว — TV ไม่มีคนกด จึงไม่เรนเดอร์เลย */}
      {!isTv && selected && data && (
        <DrugModal row={selected} date={data.date} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
