"use client";
// Profile usage chart. Fed by a profile-only per-day series ({date, tokens, cost}). Features: a metric
// toggle ($ Spent / Tokens — order/default match the main board) driving the line + axes + readout;
// range tabs (7 days / 30 days / All time — same order as the board's window tabs; daily data, so no
// sub-day/24h view); a summary metrics row (total / daily avg / peak / active days); and a streak
// readout (current + longest active-day run). A hover readout (date + value for the nearest day)
// appears only while pointing at the plot.
// Client component for the toggles + pointer interaction; data is fully server-provided. PLACEMENT:
// profile page only.
import { useMemo, useRef, useState } from "react";
import { humanizeTokens, formatUsd2dp } from "@/lib/format/money";
import styles from "./sparkline.module.css";

// Plot area (excludes axis gutters, which CSS-grid lays out around it).
const W = 260;
const H = 96;
const P = 4;

export interface UsageDayPoint {
  date: string;
  tokens: number;
  cost: number;
}
// Ranges slice the trailing N days off the all-time series. 'all' keeps everything. Order mirrors the
// main leaderboard's window tabs (7d -> 30d -> all) so the two surfaces read the same.
const RANGES = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "all", label: "All time", days: null },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

type Metric = "cost" | "tokens";

function fmtTokens(t: number): string {
  const { value, unit } = humanizeTokens(t);
  return `${value}${unit}`;
}
function fmtMetric(v: number, metric: Metric): string {
  return metric === "cost" ? formatUsd2dp(v) : fmtTokens(v);
}
function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Longest run + current trailing run of days with usage > 0.
function streaks(vals: number[]): { current: number; longest: number } {
  let longest = 0;
  let run = 0;
  for (const v of vals) {
    if (v > 0) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  let current = 0;
  for (let i = vals.length - 1; i >= 0 && vals[i]! > 0; i--) current += 1;
  return { current, longest };
}

export function Sparkline({
  points,
  className,
}: {
  points: UsageDayPoint[];
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [range, setRange] = useState<RangeId>("all");
  const [metric, setMetric] = useState<Metric>("cost");

  const availableRanges = useMemo(
    () => RANGES.filter((r) => r.days === null || points.length > 2),
    [points.length],
  );

  // Visible slice for the active range.
  const view = useMemo(() => {
    const days = RANGES.find((r) => r.id === range)?.days ?? null;
    if (days === null) return points;
    const start = Math.max(0, points.length - days);
    return points.slice(start);
  }, [points, range]);

  const geom = useMemo(() => {
    if (view.length < 2) return null;
    const vals = view.map((p) => (metric === "cost" ? p.cost : p.tokens));
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const mid = (min + max) / 2;
    const span = max - min || 1;
    const total = vals.reduce((a, b) => a + b, 0);
    const avg = total / view.length;
    const activeDays = vals.filter((v) => v > 0).length;
    const stepX = (W - P * 2) / (view.length - 1);
    const xFor = (i: number) => P + i * stepX;
    const yFor = (v: number) => H - P - ((v - min) / span) * (H - P * 2);
    const path = view
      .map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(vals[i]!).toFixed(1)}`)
      .join(" ");
    const { current, longest } = streaks(view.map((p) => p.tokens));
    return { vals, min, max, mid, total, avg, activeDays, stepX, xFor, yFor, path, current, longest };
  }, [view, metric]);

  function selectRange(id: RangeId) {
    setRange(id);
    setHoverIdx(null);
  }

  if (points.length < 2 || !geom) return null;
  const { vals, min, max, mid, total, avg, activeDays, stepX, xFor, yFor, path, current, longest } = geom;

  const first = view[0]!;
  const last = view[view.length - 1]!;
  const gridYs = [yFor(max), yFor(mid), yFor(min)];

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round((vx - P) / stepX);
    setHoverIdx(Math.max(0, Math.min(view.length - 1, idx)));
  }

  const showHover = hoverIdx !== null;
  const active = hoverIdx ?? view.length - 1;
  const activePoint = view[active]!;
  const ax = xFor(active);
  const ay = yFor(vals[active]!);

  return (
    <figure className={`${styles.chart} ${className ?? ""}`}>
      {/* Controls: range tabs + metric toggle. */}
      <div className={styles.controls}>
        <div className={styles.tabs} role="tablist" aria-label="Usage time range">
          {availableRanges.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={range === r.id}
              className={`${styles.tab} ${range === r.id ? styles.tabActive : ""}`}
              onClick={() => selectRange(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className={styles.tabs} role="group" aria-label="Metric">
          <button
            type="button"
            aria-pressed={metric === "cost"}
            className={`${styles.tab} ${metric === "cost" ? styles.tabActive : ""}`}
            onClick={() => setMetric("cost")}
          >
            $ Spent
          </button>
          <button
            type="button"
            aria-pressed={metric === "tokens"}
            className={`${styles.tab} ${metric === "tokens" ? styles.tabActive : ""}`}
            onClick={() => setMetric("tokens")}
          >
            Tokens
          </button>
        </div>
      </div>

      {/* Summary metrics. */}
      <dl className={styles.metrics}>
        <div className={styles.metric}>
          <dt className={styles.metricKey}>Total</dt>
          <dd className={styles.metricVal}>{fmtMetric(total, metric)}</dd>
        </div>
        <div className={styles.metric}>
          <dt className={styles.metricKey}>Daily avg</dt>
          <dd className={styles.metricVal}>{fmtMetric(avg, metric)}</dd>
        </div>
        <div className={styles.metric}>
          <dt className={styles.metricKey}>Highest</dt>
          <dd className={styles.metricVal}>{fmtMetric(max, metric)}</dd>
        </div>
        <div className={styles.metric}>
          <dt className={styles.metricKey}>Streak</dt>
          <dd className={styles.metricVal}>
            {current}d
            <span className={styles.metricSub}> · best {longest}d</span>
          </dd>
        </div>
      </dl>

      <div className={styles.grid}>
        <ul className={styles.yAxis} aria-hidden="true">
          <li className={styles.yTick}>{fmtMetric(max, metric)}</li>
          <li className={styles.yTick}>{fmtMetric(mid, metric)}</li>
          <li className={styles.yTick}>{fmtMetric(min, metric)}</li>
        </ul>
        <div className={styles.plotWrap}>
          <svg
            ref={svgRef}
            className={styles.spark}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Daily ${metric} from ${fmtDay(first.date)} to ${fmtDay(last.date)}: peak ${fmtMetric(max, metric)}, latest ${fmtMetric(metric === "cost" ? last.cost : last.tokens, metric)}, low ${fmtMetric(min, metric)}. Total ${fmtMetric(total, metric)} over ${view.length} days.`}
            onPointerMove={onMove}
            onPointerLeave={() => setHoverIdx(null)}
          >
            {gridYs.map((y, i) => (
              <line key={i} className={styles.gridLine} x1={0} x2={W} y1={y} y2={y} />
            ))}
            <path className={styles.line} d={path} fill="none" />
            {showHover && (
              <>
                <line className={styles.guide} x1={ax} x2={ax} y1={P} y2={H - P} />
                <circle className={styles.dotActive} cx={ax.toFixed(1)} cy={ay.toFixed(1)} r={3.5} />
              </>
            )}
          </svg>
          {showHover && (
            <div
              className={styles.tip}
              style={{ left: `${(ax / W) * 100}%`, top: `${(ay / H) * 100}%` }}
              role="status"
            >
              <span className={styles.tipDate}>{fmtDay(activePoint.date)}</span>
              <span className={styles.tipVal}>
                {metric === "cost"
                  ? formatUsd2dp(activePoint.cost)
                  : `${fmtTokens(activePoint.tokens)} tokens`}
              </span>
            </div>
          )}
        </div>
        <div className={styles.xAxis} aria-hidden="true">
          <span className={styles.xTick}>{fmtDay(first.date)}</span>
          <span className={styles.xTick}>{fmtDay(last.date)}</span>
        </div>
      </div>
    </figure>
  );
}
