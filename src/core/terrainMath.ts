import { LANDMARKS, STAIR_PATHS, TRAY } from '../config/sceneConfig';

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** 双向平滑阶跃函数：支持 a < b 与 a > b 两个方向 */
export function smoothstep(a: number, b: number, v: number): number {
  const denom = b - a;
  if (Math.abs(denom) < 1e-8) return v >= b ? 1 : 0;
  const t = clamp((v - a) / denom, 0, 1);
  return t * t * (3 - 2 * t);
}

/** 圆角矩形精确有向距离场（负值为内部） */
export function sdRoundedRect(x: number, z: number, halfW: number, halfD: number, r: number): number {
  const qx = Math.abs(x) - (halfW - r);
  const qz = Math.abs(z) - (halfD - r);
  const outX = Math.max(qx, 0);
  const outZ = Math.max(qz, 0);
  return Math.hypot(outX, outZ) + Math.min(Math.max(qx, qz), 0) - r;
}

export function getNorthShoreZ(x: number): number {
  return -4.5 - 0.007 * x * x;
}

export function getEastDikeX(z: number): number {
  return 24.4 - 0.08 * Math.max(0, z + 4.0);
}

export function getWestDikeX(z: number): number {
  return -18.0 + 0.09 * (z + 6.0);
}

/** 解析长廊中心线 Z 坐标 */
export function getCorridorCenterZ(x: number): number {
  return getNorthShoreZ(x) - 0.72;
}

/**
 * PRD 2.2 解析基底 H_base(x, z)
 */
export function getBaseHeight(x: number, z: number): number {
  const zShore = getNorthShoreZ(x);
  const hNorth = 1.25 * smoothstep(zShore + 1.2, zShore - 1.2, z);

  const xEast = getEastDikeX(z);
  const hEast = 1.45 * smoothstep(xEast - 1.8, xEast + 1.2, x);

  const xWest = getWestDikeX(z);
  const wGap = 1.0 - 0.92 * Math.exp(-((z - 2.0) * (z - 2.0)) / 0.75);
  const dxWest = x - xWest;
  const hWest =
    1.32 *
    Math.exp(-(dxWest * dxWest) / 2.2) *
    smoothstep(-7.5, -5.0, z) *
    wGap;

  const dxIsl = x - LANDMARKS.southLakeIsland.x;
  const dzIsl = z - LANDMARKS.southLakeIsland.z;
  const rIsl = Math.hypot(dxIsl, dzIsl);
  const hIsland = 1.75 * smoothstep(5.6, 2.4, rIsl);

  const gMain =
    6.4 *
    Math.exp(-(x * x) / 250.0 - ((z + 18.8) * (z + 18.8)) / 64.0);
  const gEast =
    3.0 *
    Math.exp(-((x - 15.5) * (x - 15.5)) / 90.0 - ((z + 18.4) * (z + 18.4)) / 50.0);
  const gWest =
    3.2 *
    Math.exp(-((x + 16.0) * (x + 16.0)) / 95.0 - ((z + 18.4) * (z + 18.4)) / 52.0);

  return (
    -0.8 +
    Math.max(hNorth, hEast, hWest, hIsland) +
    gMain +
    gEast +
    gWest
  );
}

// ---------------------------------------------------------------------------
// 确定性 2D Simplex Noise 与 3 阶域扭曲脊线噪声 N_ridged(x, z)
// ---------------------------------------------------------------------------
const PERM = new Uint8Array(512);
const GRAD2: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

(function initPermutation() {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let seed = 0x51a7b39d;
  for (let i = 255; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) {
    PERM[i] = p[i & 255];
  }
})();

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

export function simplex2D(xin: number, yin: number): number {
  const s = (xin + yin) * F2;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const t = (i + j) * G2;
  const X0 = i - t;
  const Y0 = j - t;
  const x0 = xin - X0;
  const y0 = yin - Y0;

  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;

  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1.0 + 2.0 * G2;
  const y2 = y0 - 1.0 + 2.0 * G2;

  const ii = i & 255;
  const jj = j & 255;

  let n0 = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) {
    t0 *= t0;
    const g = GRAD2[PERM[ii + PERM[jj]] & 7];
    n0 = t0 * t0 * (g[0] * x0 + g[1] * y0);
  }

  let n1 = 0;
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) {
    t1 *= t1;
    const g = GRAD2[PERM[ii + i1 + PERM[jj + j1]] & 7];
    n1 = t1 * t1 * (g[0] * x1 + g[1] * y1);
  }

  let n2 = 0;
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) {
    t2 *= t2;
    const g = GRAD2[PERM[ii + 1 + PERM[jj + 1]] & 7];
    n2 = t2 * t2 * (g[0] * x2 + g[1] * y2);
  }

  return clamp(70.0 * (n0 + n1 + n2), -1.0, 1.0);
}

/**
 * 3 阶域扭曲 FBM 脊线噪声（幅值严格控制在 ±0.55u，雕琢山脊与侵蚀沟壑）
 */
export function getRidgedNoise(x: number, z: number): number {
  // 轻微域扭曲，使山脊呈现自然的折曲肌理
  const wx = x + 1.45 * simplex2D(x * 0.055 + 11.3, z * 0.055 - 4.7);
  const wz = z + 1.45 * simplex2D(x * 0.055 - 7.1, z * 0.055 + 9.2);

  // 3 阶脊线 FBM：1 - |simplex2D|
  const n1 = 1.0 - Math.abs(simplex2D(wx * 0.095 + 3.1, wz * 0.095 + 1.7));
  const r1 = Math.pow(clamp(n1, 0, 1), 1.55);

  const n2 = 1.0 - Math.abs(simplex2D(wx * 0.22 - 8.4, wz * 0.22 + 5.9));
  const r2 = Math.pow(clamp(n2, 0, 1), 1.45) * (0.45 + 0.55 * r1);

  const n3 = 1.0 - Math.abs(simplex2D(wx * 0.48 + 14.2, wz * 0.48 - 10.6));
  const r3 = Math.pow(clamp(n3, 0, 1), 1.3) * (0.35 + 0.65 * r2);

  const fbm = r1 * 0.58 + r2 * 0.29 + r3 * 0.13;
  // 围绕 0.42 居中，使既有锋利凸脊也有深切沟壑
  const centered = (fbm - 0.42) * 1.15;
  return clamp(centered, -0.55, 0.55);
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const lenSq = vx * vx + vz * vz;
  const t = lenSq > 1e-8 ? clamp((wx * vx + wz * vz) / lenSq, 0, 1) : 0;
  const cx = ax + vx * t;
  const cz = az + vz * t;
  return Math.hypot(px - cx, pz - cz);
}

function distToBox(px: number, pz: number, cx: number, cz: number, hx: number, hz: number): number {
  const dx = Math.max(Math.abs(px - cx) - hx, 0);
  const dz = Math.max(Math.abs(pz - cz) - hz, 0);
  return Math.hypot(dx, dz);
}

function distToPolyline(px: number, pz: number, pts: ReadonlyArray<readonly [number, number]>): number {
  let minD = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegment(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (d < minD) minD = d;
  }
  return minD;
}

/** 返回距离最近古建压平区边缘的距离（<= 0 表示处于压平区核心） */
export function getMinPadDistance(x: number, z: number): number {
  let d = Infinity;

  // 1. 佛香阁高台 (0, -13.6)
  d = Math.min(d, distToBox(x, z, LANDMARKS.foxiangge.x, LANDMARKS.foxiangge.z, 3.4, 3.1));

  // 2. 排云殿中轴院落 (0, -8.4)
  d = Math.min(d, distToBox(x, z, LANDMARKS.paiyundian.x, LANDMARKS.paiyundian.z, 2.35, 1.55));

  // 3. 排云门与湖岸码头 (0, -5.5 / -4.3)
  d = Math.min(d, distToBox(x, z, 0.0, -4.9, 1.55, 1.15));

  // 4. 八字形双侧爬山廊平台走廊
  d = Math.min(d, distToSegment(x, z, -4.66, -7.85, -2.6, -10.8) - 0.72);
  d = Math.min(d, distToSegment(x, z, 4.66, -7.85, 2.6, -10.8) - 0.72);

  // 5-6. 长廊东西两翼及其上四座八角亭
  if (x >= -18.4 && x <= -0.4) {
    const cx = clamp(x, LANDMARKS.corridor.westXMin, LANDMARKS.corridor.westXMax);
    const cz = getCorridorCenterZ(cx);
    d = Math.min(d, Math.hypot(x - cx, z - cz) - 0.85);
    for (const t of LANDMARKS.corridor.pavilionTs) {
      const px = LANDMARKS.corridor.westXMin + (LANDMARKS.corridor.westXMax - LANDMARKS.corridor.westXMin) * t;
      d = Math.min(d, Math.hypot(x - px, z - getCorridorCenterZ(px)) - 1.05);
    }
  }
  if (x >= 0.4 && x <= 17.7) {
    const cx = clamp(x, LANDMARKS.corridor.eastXMin, LANDMARKS.corridor.eastXMax);
    const cz = getCorridorCenterZ(cx);
    d = Math.min(d, Math.hypot(x - cx, z - cz) - 0.85);
    for (const t of LANDMARKS.corridor.pavilionTs) {
      const px = LANDMARKS.corridor.eastXMin + (LANDMARKS.corridor.eastXMax - LANDMARKS.corridor.eastXMin) * t;
      d = Math.min(d, Math.hypot(x - px, z - getCorridorCenterZ(px)) - 1.05);
    }
  }

  // 7. 南湖岛涵虚堂 (12.6, 2.0)
  d = Math.min(d, distToBox(x, z, LANDMARKS.hanxutang.x, LANDMARKS.hanxutang.z, 1.45, 1.15));

  // 8-9. 十七孔桥两端桥台 (15.89, 3.86) & (23.31, 15.74)
  d = Math.min(
    d,
    Math.hypot(x - LANDMARKS.seventeenArchBridge.nwEnd[0], z - LANDMARKS.seventeenArchBridge.nwEnd[1]) - 0.95
  );
  d = Math.min(
    d,
    Math.hypot(x - LANDMARKS.seventeenArchBridge.seEnd[0], z - LANDMARKS.seventeenArchBridge.seEnd[1]) - 1.1
  );

  // 10-11. 玉带桥两端桥台 (-17.42, 0.4) & (-17.14, 3.6)
  d = Math.min(
    d,
    Math.hypot(x - LANDMARKS.jadeBeltBridge.northEnd[0], z - LANDMARKS.jadeBeltBridge.northEnd[1]) - 0.95
  );
  d = Math.min(
    d,
    Math.hypot(x - LANDMARKS.jadeBeltBridge.southEnd[0], z - LANDMARKS.jadeBeltBridge.southEnd[1]) - 0.95
  );

  // 12. 西堤景亭
  d = Math.min(d, Math.hypot(x - LANDMARKS.westDikePavilion.x, z - LANDMARKS.westDikePavilion.z) - 0.95);

  return d;
}

/** 返回建筑压平区核心权重（1=台地核心，0=纯自然山地），用于台地地坪石土微染色 */
export function getArchitecturalPadWeight(x: number, z: number): number {
  return 1.0 - smoothstep(0.0, 0.32, getMinPadDistance(x, z));
}

/**
 * 衰减与建筑压平掩码 M_noise(x, z) ∈ [0, 1]
 */
export function getNoiseMask(x: number, z: number, hBase?: number): number {
  const hb = hBase ?? getBaseHeight(x, z);

  // 1. 水域与浅滩清零：H_base < 0.25 严格归零
  if (hb <= 0.25) return 0;
  const waterMask = smoothstep(0.25, 0.72, hb);

  // 2. 托盘内壁 1.0u 范围内平滑归零
  const distInsideTray = -sdRoundedRect(x, z, TRAY.innerW * 0.5, TRAY.innerD * 0.5, TRAY.innerRadius);
  if (distInsideTray <= 0.08) return 0;
  const edgeMask = smoothstep(0.08, 1.0, distInsideTray);

  // 3. 所有建筑锚点外扩 1.2u 缓冲带内平滑归零
  const padDist = getMinPadDistance(x, z);
  if (padDist <= 0.0) return 0;
  const padMask = smoothstep(0.0, 1.2, padDist);

  return waterMask * edgeMask * padMask;
}

/**
 * 全沙盘唯一高程真相源：getSculptedHeight(x, z)
 * 地形顶点、驳岸、420 级石阶、古建基座、植被及自检脚本必须且只能调用此函数。
 */
export function getSculptedHeight(x: number, z: number): number {
  const hBase = getBaseHeight(x, z);
  const mask = getNoiseMask(x, z, hBase);
  if (mask <= 0) return hBase;
  return hBase + getRidgedNoise(x, z) * mask;
}

export function getTerrainNormal(x: number, z: number, eps = 0.14): [number, number, number] {
  const hL = getSculptedHeight(x - eps, z);
  const hR = getSculptedHeight(x + eps, z);
  const hD = getSculptedHeight(x, z - eps);
  const hU = getSculptedHeight(x, z + eps);
  const nx = hL - hR;
  const ny = 2.0 * eps;
  const nz = hD - hU;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

/** 离散拉普拉斯曲率：正值偏山脊凸起，负值偏山谷/沟壑凹陷 */
export function getTerrainCurvature(x: number, z: number, eps = 0.36): number {
  const hc = getSculptedHeight(x, z);
  const avg =
    0.25 *
    (getSculptedHeight(x - eps, z) +
      getSculptedHeight(x + eps, z) +
      getSculptedHeight(x, z - eps) +
      getSculptedHeight(x, z + eps));
  return hc - avg;
}

/**
 * 统一空间排斥函数 isPlacementBlocked(x, z, margin)
 * 供 M1 山石及 M3 2000 株森林、灌木撒点共同调用。
 */
export function isPlacementBlocked(x: number, z: number, margin = 0.9): boolean {
  // 1. 水域及浅滩
  if (getSculptedHeight(x, z) < 0.22) return true;

  // 2. 托盘边缘
  if (Math.abs(x) > 29.0 || Math.abs(z) > 23.0) return true;

  // 3. 所有古建占地包围盒外扩 margin
  if (distToBox(x, z, LANDMARKS.foxiangge.x, LANDMARKS.foxiangge.z, 3.65, 3.35) < margin) return true;
  if (distToBox(x, z, 0.0, -7.8, 3.15, 2.0) < margin) return true;
  if (distToBox(x, z, LANDMARKS.paiyunmen.x, LANDMARKS.paiyunmen.z, 1.45, 1.0) < margin) return true;
  if (distToBox(x, z, LANDMARKS.pier.x, LANDMARKS.pier.z, 1.45, 0.9) < margin) return true;
  if (distToBox(x, z, LANDMARKS.hanxutang.x, LANDMARKS.hanxutang.z, 1.6, 1.3) < margin) return true;
  if (Math.hypot(x - LANDMARKS.westDikePavilion.x, z - LANDMARKS.westDikePavilion.z) < 1.2 + margin * 0.45) {
    return true;
  }
  if (distToSegment(x, z, -4.66, -7.85, -2.6, -10.8) < 0.9 + margin * 0.65) return true;
  if (distToSegment(x, z, 4.66, -7.85, 2.6, -10.8) < 0.9 + margin * 0.65) return true;

  // 4. 长廊曲线中心线两侧 1.40u 走廊带 + 4 座八角亭 + 两座桥投影带
  if (x >= LANDMARKS.corridor.westXMin - 0.9 && x <= LANDMARKS.corridor.westXMax + 0.9) {
    const cx = clamp(x, LANDMARKS.corridor.westXMin, LANDMARKS.corridor.westXMax);
    if (Math.hypot(x - cx, z - getCorridorCenterZ(cx)) < 1.4) return true;
    for (const t of LANDMARKS.corridor.pavilionTs) {
      const px = LANDMARKS.corridor.westXMin + (LANDMARKS.corridor.westXMax - LANDMARKS.corridor.westXMin) * t;
      if (Math.hypot(x - px, z - getCorridorCenterZ(px)) < 1.65 + margin * 0.45) return true;
    }
  }
  if (x >= LANDMARKS.corridor.eastXMin - 0.9 && x <= LANDMARKS.corridor.eastXMax + 0.9) {
    const cx = clamp(x, LANDMARKS.corridor.eastXMin, LANDMARKS.corridor.eastXMax);
    if (Math.hypot(x - cx, z - getCorridorCenterZ(cx)) < 1.4) return true;
    for (const t of LANDMARKS.corridor.pavilionTs) {
      const px = LANDMARKS.corridor.eastXMin + (LANDMARKS.corridor.eastXMax - LANDMARKS.corridor.eastXMin) * t;
      if (Math.hypot(x - px, z - getCorridorCenterZ(px)) < 1.65 + margin * 0.45) return true;
    }
  }
  if (
    distToSegment(
      x,
      z,
      LANDMARKS.seventeenArchBridge.nwEnd[0],
      LANDMARKS.seventeenArchBridge.nwEnd[1],
      LANDMARKS.seventeenArchBridge.seEnd[0],
      LANDMARKS.seventeenArchBridge.seEnd[1]
    ) < 1.35
  ) {
    return true;
  }
  if (
    distToSegment(
      x,
      z,
      LANDMARKS.jadeBeltBridge.northEnd[0],
      LANDMARKS.jadeBeltBridge.northEnd[1],
      LANDMARKS.jadeBeltBridge.southEnd[0],
      LANDMARKS.jadeBeltBridge.southEnd[1]
    ) < 1.45
  ) {
    return true;
  }

  // 5. 5 条石阶路径中心线两侧 0.95u 步道带
  for (const stair of STAIR_PATHS) {
    if (distToPolyline(x, z, stair.points) < 0.95) return true;
  }

  return false;
}
