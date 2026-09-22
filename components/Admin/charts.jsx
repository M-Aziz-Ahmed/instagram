"use client";

// Small hand-rolled SVG charts used across the admin dashboard. Kept
// dependency-free and responsive (viewBox scales to container width).

/* ── Stat card with day-over-day delta ──────────────────────── */
export function StatCard({ label, value, delta = null, icon, hint }) {
    const up = delta > 0;
    const down = delta < 0;
    const flat = delta === 0;
    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</p>
                    <p className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 mt-1 tabular-nums">{value ?? "—"}</p>
                </div>
                {icon && <span className="text-xl shrink-0">{icon}</span>}
            </div>
            <div className="mt-2 flex items-center gap-2">
                {delta != null && (
                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${up ? "text-green-600 dark:text-green-400 bg-green-500/10" : down ? "text-red-500 bg-red-500/10" : "text-gray-400 bg-gray-500/10"}`}>
                        {up ? "▲" : down ? "▼" : "—"} {Math.abs(delta)}%
                    </span>
                )}
                {hint && <span className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{hint}</span>}
            </div>
        </div>
    );
}

/* ── Multi-series area/line chart from { label, [field] } rows ── */
export function AreaChart({ data, keys, height = 220 }) {
    if (!data || !data.length || !keys.length) {
        return <NoData />;
    }

    const W = 800;
    const H = height;
    const PAD = { top: 14, right: 8, bottom: 22, left: 34 };
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    const maxVal = Math.max(1, ...data.flatMap((d) => keys.map((k) => d[k.field] || 0)));
    const maxTicks = Math.min(5, Math.floor(H / 26));
    const yTicks = Array.from({ length: maxTicks + 1 }, (_, i) => Math.round((maxVal / maxTicks) * i));

    const x = (i) => PAD.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
    const y = (v) => PAD.top + innerH - (v / maxVal) * innerH;

    const labelEvery = Math.max(1, Math.ceil(data.length / 7));

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" preserveAspectRatio="none">
            {/* grid + y labels */}
            {yTicks.map((t) => (
                <g key={t}>
                    <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-gray-100 dark:text-gray-800" strokeDasharray="3 3" strokeWidth={1} />
                    <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="currentColor" className="text-gray-400">{t}</text>
                </g>
            ))}

            {/* x labels */}
            {data.map((d, i) =>
                i % labelEvery === 0 ? (
                    <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="currentColor" className="text-gray-400">{d.label}</text>
                ) : null
            )}

            {/* areas + lines */}
            {keys.map((k) => {
                const pts = data.map((d, i) => `${x(i)},${y(d[k.field] || 0)}`).join(" ");
                const area = `${PAD.left},${y(0)} ${pts} ${x(data.length - 1)},${y(0)}`;
                return (
                    <g key={k.field}>
                        <polygon points={area} fill={k.color} opacity={0.08} />
                        <polyline points={pts} fill="none" stroke={k.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                    </g>
                );
            })}

            {/* last point dot */}
            {keys.map((k) => {
                const last = data[data.length - 1];
                return (
                    <circle key={`dot-${k.field}`} cx={x(data.length - 1)} cy={y(last[k.field] || 0)} r={4} fill={k.color} />
                );
            })}
        </svg>
    );
}

/* ── Simple bars (e.g. hourly, top N) ───────────────────────── */
export function BarChart({ data, color = "#1cb0f6", height = 160, valueKey = "value", labelKey = "label" }) {
    if (!data || !data.length) return <NoData />;
    const W = 800;
    const H = height;
    const PAD = { top: 18, right: 4, bottom: 24, left: 4 };
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const maxRef = Math.max(1, ...data.map((d) => d[valueKey] || 0));
    const innerPad = data.length > 20 ? 4 : 10;

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
            {data.map((d, i) => {
                const bw = innerW / data.length;
                const bh = (d[valueKey] / maxRef) * innerH;
                const bx = PAD.left + i * bw + innerPad / 2;
                return (
                    <g key={i}>
                        <rect x={bx} y={PAD.top + innerH - bh} width={bw - innerPad} height={Math.max(1, bh)} rx={3} fill={color} opacity={d.value === maxRef ? 1 : 0.72} />
                        {i % Math.max(1, Math.ceil(data.length / 8)) === 0 && (
                            <text x={bx + (bw - innerPad) / 2} y={H - 6} textAnchor="middle" fontSize={9} fill="currentColor" className="text-gray-400">{d[labelKey]}</text>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}

/* ── Donut with legend ──────────────────────────────────────── */
const DONUT_COLORS = ["#58cc02", "#1cb0f6", "#ffc800", "#ce82ff", "#ff9600", "#ff4b6e", "#3b82f6", "#10b981", "#f43f5e", "#8b5cf6", "#06b6d4", "#a3a3a3"];

export function DonutChart({ data, size = 150 }) {
    if (!data || !data.length) return <NoData />;
    const total = data.reduce((s, d) => s + d.count, 0) || 1;
    const r = size / 2 - 6;
    const c = 2 * Math.PI * r;
    const R = size / 2;
    const segments = data.map((d, i) => {
        const frac = d.count / total;
        const off = data.slice(0, i).reduce((s, x) => s + x.count / total, 0);
        return { frac, off };
    });

    return (
        <div className="flex items-center gap-5 flex-wrap">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
                <g transform={`rotate(-90 ${R} ${R})`}>
                    {data.map((d, i) => {
                        const seg = segments[i];
                        const len = seg.frac * c;
                        const off = seg.off * c;
                        return (
                            <circle
                                key={i}
                                cx={R} cy={R} r={r}
                                fill="none"
                                stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
                                strokeWidth={16}
                                strokeDasharray={`${Math.max(0, len - 2)} ${c - len + 2}`}
                                strokeDashoffset={-off}
                            />
                        );
                    })}
                </g>
                <text x={R} y={R + 1} textAnchor="middle" dominantBaseline="middle" fontSize={18} fontWeight={800} fill="currentColor" className="text-gray-900 dark:text-gray-100">
                    {total.toLocaleString()}
                </text>
                <text x={R} y={R + 17} textAnchor="middle" fontSize={9} fill="currentColor" className="text-gray-400">events</text>
            </svg>
            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                {data.slice(0, 8).map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                        <span className="font-medium text-gray-700 dark:text-gray-300 truncate">{d.label || "unknown"} <span className="text-gray-400">· {Math.round((d.count / total) * 100)}%</span></span>
                        <span className="ml-auto font-bold text-gray-900 dark:text-gray-100 tabular-nums">{d.count}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function NoData() {
    return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No data yet — analytics populate as users browse.</p>;
}