/** Synthetic whorl ridges, clipped to a fingertip pad. No captured print is used. */
export function createFingerprintRidges() {
  const start: number[] = [];
  const target: number[] = [];
  const edge: number[] = [];
  const spacing = 0.055;
  const step = 0.014;
  const phase = (x: number, y: number) => {
    // Off-center whorl flows into transverse ridges below the core. Blending
    // the two fields makes the triangular delta instead of nested oval rings.
    const dx = x + 0.14 + 0.055 * Math.sin(y * 2.1);
    const dy = (y - 0.39) * 0.9;
    const radius = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const whorl =
      radius + ((angle + 0.13 * Math.sin(angle * 2)) * spacing) / Math.PI;
    const lower = 0.39 - y + 0.075 * x * x + 0.025 * Math.sin(x * 2.5);
    const t = Math.max(0, Math.min(1, (-y - 0.13) / 0.66));
    const blend = t * t * (3 - 2 * t);
    const organic = 0.009 * Math.sin(x * 11 + y * 3) * Math.sin(y * 8 - x * 2);
    return Math.sin(
      (Math.PI / spacing) * (whorl * (1 - blend) + lower * blend + organic),
    );
  };
  const inside = (x: number, y: number) => {
    const padY = (y - 0.035) / 1.57;
    const width = 1.07 * (1 + 0.075 * Math.sin(y * 1.5));
    return (x / width) ** 2 + padY ** 2 < 1 && y > -1.43;
  };
  const endings = [
    [-0.62, 0.87],
    [0.67, 0.43],
    [-0.42, -0.94],
    [0.35, 1.04],
  ];
  const addRibbon = (a: number[], b: number[]) => {
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    if (!inside(mx, my)) return;
    if (endings.some(([x, y]) => Math.hypot(mx - x, my - y) < 0.023)) return;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-6) return;
    const halfWidth = 0.0105 * (1 + 0.09 * Math.sin(mx * 29 + my * 17));
    const nx = (-(b[1] - a[1]) / length) * halfWidth;
    const ny = ((b[0] - a[0]) / length) * halfWidth;
    for (const [point, side] of [
      [a, -1],
      [b, -1],
      [a, 1],
      [a, 1],
      [b, -1],
      [b, 1],
    ] as const) {
      const x = point[0] + nx * side;
      const y = point[1] + ny * side;
      // A gently domed fingertip, rather than a floating flat contour map.
      const z =
        0.12 +
        0.24 * Math.sqrt(Math.max(0, 1 - (x / 1.14) ** 2 - (y / 1.75) ** 2));
      target.push(x, y, z);
      const angle = Math.atan2(y, x);
      const r = Math.hypot(x, y);
      start.push(
        Math.cos(angle) * r,
        Math.sin(angle) * r * 0.5,
        Math.sin(angle * 2 + r * 3) * 0.65,
      );
      edge.push(side);
    }
  };
  // March the zero contours. Interpolated crossings keep the ridges smooth
  // while allowing local terminations and bifurcations around the delta.
  for (let y = -1.5; y < 1.63; y += step) {
    for (let x = -1.16; x < 1.16; x += step) {
      const corners = [
        [x, y],
        [x + step, y],
        [x + step, y + step],
        [x, y + step],
      ];
      const values = corners.map(([cx, cy]) => phase(cx, cy));
      const crossings: number[][] = [];
      for (let side = 0; side < 4; side++) {
        const next = (side + 1) % 4;
        if (values[side] >= 0 === values[next] >= 0) continue;
        const t = values[side] / (values[side] - values[next]);
        crossings.push([
          corners[side][0] + t * (corners[next][0] - corners[side][0]),
          corners[side][1] + t * (corners[next][1] - corners[side][1]),
        ]);
      }
      if (crossings.length === 2) addRibbon(crossings[0], crossings[1]);
      else if (crossings.length === 4) {
        // Resolve saddle cells against the center to prevent crossed ridges.
        if (phase(x + step / 2, y + step / 2) >= 0 === values[0] >= 0) {
          addRibbon(crossings[0], crossings[1]);
          addRibbon(crossings[2], crossings[3]);
        } else {
          addRibbon(crossings[0], crossings[3]);
          addRibbon(crossings[1], crossings[2]);
        }
      }
    }
  }
  return { start, target, edge };
}
