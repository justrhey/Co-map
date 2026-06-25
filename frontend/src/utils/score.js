// ── Score coloring: 0% → red, 50% → amber, 100% → green ────────
export function scoreColor(pct) {
  if (pct <= 0) return '#ef4444';
  if (pct >= 100) return '#22c55e';
  const r = pct < 50
    ? Math.round(239 - (239 - 245) * (pct / 50))
    : Math.round(245 - (245 - 34) * ((pct - 50) / 50));
  const g = pct < 50
    ? Math.round(68 - (68 - 158) * (pct / 50))
    : Math.round(158 - (158 - 197) * ((pct - 50) / 50));
  const b = pct < 50
    ? Math.round(68 - (68 - 11) * (pct / 50))
    : Math.round(11 - (11 - 94) * ((pct - 50) / 50));
  const h = (n) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
