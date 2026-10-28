import { useMemo, useState } from 'react';
import * as dashboardApi from '../../api/dashboardApi.js';
import ExportChartButton from '../../components/buttons/ExportChartButton.jsx';
import ErrorState from '../../components/common/ErrorState.jsx';
import SalesTrendFilter from '../../components/filters/SalesTrendFilter.jsx';
import { useResource } from '../../hooks/useResource.js';

// Drawing area inside the SVG (no chart library is installed, so the chart is plain SVG).
const W = 760;
const H = 300;
const PAD = { left: 52, right: 24, top: 20, bottom: 40 };
const innerW = W - PAD.left - PAD.right;
const innerH = H - PAD.top - PAD.bottom;

// Smooth curve through the points (Catmull-Rom converted to cubic Beziers).
function smoothPath(points) {
  return points.map((p, i) => {
    if (i === 0) return `M${p.x},${p.y}`;
    const p0 = points[i - 2] || points[i - 1];
    const p1 = points[i - 1];
    const p3 = points[i + 1] || p;
    const c1 = { x: p1.x + (p.x - p0.x) / 6, y: p1.y + (p.y - p0.y) / 6 };
    const c2 = { x: p.x - (p3.x - p1.x) / 6, y: p.y - (p3.y - p1.y) / 6 };
    return `C${c1.x},${c1.y} ${c2.x},${c2.y} ${p.x},${p.y}`;
  }).join(' ');
}

// Five round y-axis values from 0 up to just above the biggest value (a flat 0-1000 axis while there are no sales).
function niceTicks(max) {
  const raw = (max > 0 ? max : 1000) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw);
  return [0, 1, 2, 3, 4].map((i) => i * step);
}
const compact = (v) => (v >= 1000 ? `${Number((v / 1000).toFixed(1))}k` : String(Math.round(v)));

export default function SalesChart({ shopId }) {
  const [period, setPeriod] = useState('today');
  const { data, loading, error, reload } = useResource((signal) => dashboardApi.salesTrend({ period, shopId }, signal), [period, shopId]);
  const [hover, setHover] = useState(null);

  const values = data?.points.map((p) => p.value) ?? [];
  const labels = data?.points.map((p) => p.label) ?? [];
  const ticks = niceTicks(Math.max(0, ...values));
  const top = ticks[ticks.length - 1];
  const highlight = values.length ? values.indexOf(Math.max(...values)) : 0;
  const active = hover ?? highlight;

  const points = useMemo(() => values.map((v, i) => ({
    x: PAD.left + (innerW * i) / Math.max(1, values.length - 1),
    y: PAD.top + innerH - (innerH * v) / top,
  })), [values, top]);

  const move = (e) => {
    if (!points.length) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    let nearest = 0;
    points.forEach((p, i) => { if (Math.abs(p.x - x) < Math.abs(points[nearest].x - x)) nearest = i; });
    setHover(nearest);
  };

  const line = points.length ? smoothPath(points) : '';
  const baseline = PAD.top + innerH;
  const area = points.length ? `${line} L${points[points.length - 1].x},${baseline} L${points[0].x},${baseline} Z` : '';
  const point = points[active];

  return (
    <section className="dash-card dash-trend">
      <div className="dash-card__head">
        <h2>Sales Trend</h2>
        <div className="dash-trend__controls">
          <SalesTrendFilter value={period} onChange={(next) => { setPeriod(next); setHover(null); }} />
          <ExportChartButton />
        </div>
      </div>
      {error && <ErrorState message={error} onRetry={reload} />}
      {!error && (
        <svg className="dash-trend__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sales trend for ${period}`} aria-busy={loading}
          onMouseMove={move} onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#03962b" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#03962b" stopOpacity="0.06" />
            </linearGradient>
          </defs>
          {ticks.map((t) => {
            const y = PAD.top + innerH - (innerH * t) / top;
            return (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#e5e7eb" strokeWidth="1" strokeDasharray={t === 0 ? undefined : '4 4'} />
                <text x={PAD.left - 12} y={y + 4} textAnchor="end" className="dash-trend__tick">{compact(t)}</text>
              </g>
            );
          })}
          {points.length > 0 && (
            <>
              <path d={area} fill="url(#trendFill)" />
              <path d={line} fill="none" stroke="#b7e0c2" strokeWidth="2" />
              <g>
                <rect x={point.x - 34} y={point.y - 38} width="68" height="24" rx="5" fill="#03962b" />
                <text x={point.x} y={point.y - 21} textAnchor="middle" className="dash-trend__tip">{`Rs. ${compact(values[active])}`}</text>
                <circle cx={point.x} cy={point.y} r="4.5" fill="#03962b" />
              </g>
              {labels.map((label, i) => (
                <text key={label} x={points[i].x} y={H - 12} textAnchor="middle" className={`dash-trend__label${i === active ? ' is-active' : ''}`}>{label}</text>
              ))}
            </>
          )}
        </svg>
      )}
    </section>
  );
}
