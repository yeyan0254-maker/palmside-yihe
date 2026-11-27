import * as THREE from 'three';
import { BOAT_WAYPOINTS, LANDMARKS, type BaseSeasonId, type SeasonPresetId } from '../config/sceneConfig';
import { enhanceMaterial } from '../core/shaders';
import {
  clamp,
  getEastDikeX,
  getNorthShoreZ,
  getSculptedHeight,
  getWestDikeX,
  isPlacementBlocked,
} from '../core/terrainMath';
import {
  createDeciduousLeafClusterTexture,
  createPineNeedleSprayTexture,
  createShrubLeafTexture,
  createWillowFrondTexture,
} from '../textures/proceduralPBR';

export interface FoliageResult {
  group: THREE.Group;
  applySeason: (preset: SeasonPresetId) => void;
  blendSeasons: (from: BaseSeasonId, to: BaseSeasonId, t: number) => void;
  stats: {
    deciduousCount: number;
    pineCount: number;
    willowCount: number;
    shrubCount: number;
    lotusCount: number;
    totalTrees: number;
  };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mergeFoliageGeometries(
  geos: THREE.BufferGeometry[],
  withVertexColor: boolean
): THREE.BufferGeometry {
  const valid = geos.filter((g) => g.attributes.position && g.attributes.position.count > 0);
  if (valid.length === 0) return new THREE.BufferGeometry();

  let totalVerts = 0;
  let totalIdx = 0;
  for (const g of valid) {
    if (!g.attributes.normal) g.computeVertexNormals();
    totalVerts += g.attributes.position.count;
    totalIdx += g.index ? g.index.count : g.attributes.position.count;
  }

  const pos = new Float32Array(totalVerts * 3);
  const norm = new Float32Array(totalVerts * 3);
  const uv = new Float32Array(totalVerts * 2);
  const col = withVertexColor ? new Float32Array(totalVerts * 3) : null;
  const idx = new Uint32Array(totalIdx);

  let vOff = 0;
  let iOff = 0;
  for (const g of valid) {
    const pAttr = g.attributes.position;
    const nAttr = g.attributes.normal;
    const uAttr = g.attributes.uv;
    const cAttr = g.attributes.color;
    const count = pAttr.count;

    for (let i = 0; i < count; i++) {
      pos[(vOff + i) * 3] = pAttr.getX(i);
      pos[(vOff + i) * 3 + 1] = pAttr.getY(i);
      pos[(vOff + i) * 3 + 2] = pAttr.getZ(i);
      norm[(vOff + i) * 3] = nAttr ? nAttr.getX(i) : 0;
      norm[(vOff + i) * 3 + 1] = nAttr ? nAttr.getY(i) : 1;
      norm[(vOff + i) * 3 + 2] = nAttr ? nAttr.getZ(i) : 0;
      uv[(vOff + i) * 2] = uAttr ? uAttr.getX(i) : 0;
      uv[(vOff + i) * 2 + 1] = uAttr ? uAttr.getY(i) : 0;
      if (col) {
        if (cAttr) {
          col[(vOff + i) * 3] = cAttr.getX(i);
          col[(vOff + i) * 3 + 1] = cAttr.getY(i);
          col[(vOff + i) * 3 + 2] = cAttr.getZ(i);
        } else {
          col[(vOff + i) * 3] = 1;
          col[(vOff + i) * 3 + 1] = 1;
          col[(vOff + i) * 3 + 2] = 1;
        }
      }
    }

    if (g.index) {
      const gIdx = g.index.array;
      for (let i = 0; i < gIdx.length; i++) idx[iOff + i] = gIdx[i] + vOff;
      iOff += gIdx.length;
    } else {
      for (let i = 0; i < count; i++) idx[iOff + i] = vOff + i;
      iOff += count;
    }
    vOff += count;
    g.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function addBranchSegment(
  start: THREE.Vector3,
  end: THREE.Vector3,
  rBot: number,
  rTop: number,
  radialSegs: number,
  bucket: THREE.BufferGeometry[]
): void {
  const dir = new THREE.Vector3().subVectors(end, start);
  const len = dir.length();
  if (len < 0.01) return;
  const g = new THREE.CylinderGeometry(rTop, rBot, len, radialSegs, 1, true);
  g.translate(0, len * 0.5, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.applyQuaternion(q);
  g.translate(start.x, start.y, start.z);
  bucket.push(g);
}

/**
 * 构造微弧曲折植物枝叶簇面片，并重算从树冠中心辐射的球面化软法线与内外顶点 AO 渐变
 */
function addCurvedLeafCard(
  center: THREE.Vector3,
  width: number,
  height: number,
  yaw: number,
  pitch: number,
  roll: number,
  domeCenter: THREE.Vector3,
  crownRadius: number,
  bucket: THREE.BufferGeometry[],
  bendScale = 0.16
): void {
  const g = new THREE.PlaneGeometry(width, height, 2, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const lx = p.getX(i) / Math.max(width * 0.5, 1e-4);
    const ly = p.getY(i) / Math.max(height * 0.5, 1e-4);
    const bulge = (1.0 - 0.55 * (lx * lx + ly * ly)) * width * bendScale;
    p.setZ(i, bulge);
  }

  const euler = new THREE.Euler(pitch, yaw, roll, 'YXZ');
  const mat = new THREE.Matrix4().makeRotationFromEuler(euler);
  mat.setPosition(center);
  g.applyMatrix4(mat);

  const posAttr = g.attributes.position;
  const normAttr = g.attributes.normal;
  const cols = new Float32Array(posAttr.count * 3);
  const vPos = new THREE.Vector3();
  const radialN = new THREE.Vector3();
  const upVec = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < posAttr.count; i++) {
    vPos.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    radialN.subVectors(vPos, domeCenter);
    const dist = radialN.length();
    if (dist > 1e-4) radialN.divideScalar(dist);
    else radialN.set(0, 1, 0);

    // 70% 树冠球面法线 + 30% 朝上法线，彻底消除硬片接缝反光
    radialN.lerp(upVec, 0.3).normalize();
    normAttr.setXYZ(i, radialN.x, radialN.y, radialN.z);

    const radialAO = clamp(dist / Math.max(crownRadius, 0.25), 0.18, 1.0);
    const heightAO = clamp((vPos.y - (domeCenter.y - crownRadius)) / (crownRadius * 2.0), 0.0, 1.0);
    const ao = clamp(0.6 + radialAO * 0.24 + heightAO * 0.22, 0.58, 1.06);
    cols[i * 3] = ao;
    cols[i * 3 + 1] = ao;
    cols[i * 3 + 2] = ao;
  }

  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  bucket.push(g);
}

interface DeciduousStyle {
  trunkH: number;
  spread: number;
  cardSize: number;
  boughs: number;
}

const DECIDUOUS_STYLES: ReadonlyArray<DeciduousStyle> = [
  // 1. 挺拔广展古银杏/国槐型
  { trunkH: 0.62, spread: 0.56, cardSize: 0.57, boughs: 5 },
  // 2. 阔冠婆娑元宝枫型
  { trunkH: 0.48, spread: 0.62, cardSize: 0.55, boughs: 5 },
  // 3. 纤逸高挑写意树型
  { trunkH: 0.68, spread: 0.48, cardSize: 0.51, boughs: 4 },
];

/** 构造 1 套多级分枝落叶树原型（弯曲主干 + 3~4 级写意枯枝 + 28 片交叉枝叶簇面片） */
function createDeciduousPrototype(seed: number, styleIdx: number): {
  trunkGeo: THREE.BufferGeometry;
  canopyGeo: THREE.BufferGeometry;
} {
  const rand = mulberry32(seed);
  const style = DECIDUOUS_STYLES[styleIdx % DECIDUOUS_STYLES.length];
  const trunkGeos: THREE.BufferGeometry[] = [];
  const canopyGeos: THREE.BufferGeometry[] = [];
  const leafAnchors: Array<{ pos: THREE.Vector3; yaw: number }> = [];

  // 弯曲主干（深扎地表 -0.18u 防止陡坡悬根）
  const p0 = new THREE.Vector3(0, -0.18, 0);
  const p1 = new THREE.Vector3((rand() - 0.5) * 0.07, style.trunkH * 0.42, (rand() - 0.5) * 0.07);
  const p2 = new THREE.Vector3(
    p1.x + (rand() - 0.5) * 0.08,
    style.trunkH,
    p1.z + (rand() - 0.5) * 0.08
  );
  addBranchSegment(p0, p1, 0.045, 0.032, 5, trunkGeos);
  addBranchSegment(p1, p2, 0.032, 0.022, 5, trunkGeos);

  // 1 级主枝
  for (let b = 0; b < style.boughs; b++) {
    const yaw = (b / style.boughs) * Math.PI * 2 + (rand() - 0.5) * 0.4;
    const tilt = 0.44 + rand() * 0.34;
    const len1 = style.spread * (0.72 + rand() * 0.32);
    const bStart = b === 0 ? p2.clone() : p1.clone().lerp(p2, 0.55 + rand() * 0.45);
    const dir1 = new THREE.Vector3(
      Math.cos(yaw) * Math.sin(tilt),
      Math.cos(tilt),
      Math.sin(yaw) * Math.sin(tilt)
    );
    const bEnd = bStart.clone().addScaledVector(dir1, len1);
    addBranchSegment(bStart, bEnd, 0.02, 0.0115, 4, trunkGeos);

    // 2 级分枝（3 枝）
    for (let s = 0; s < 3; s++) {
      const sYaw = yaw + (s - 1) * 0.62 + (rand() - 0.5) * 0.3;
      const sTilt = 0.38 + rand() * 0.45;
      const len2 = style.spread * (0.52 + rand() * 0.24);
      const sStart = bStart.clone().lerp(bEnd, 0.54 + (s / 3) * 0.44);
      const dir2 = new THREE.Vector3(
        Math.cos(sYaw) * Math.sin(sTilt),
        Math.cos(sTilt),
        Math.sin(sYaw) * Math.sin(sTilt)
      );
      const sEnd = sStart.clone().addScaledVector(dir2, len2);
      addBranchSegment(sStart, sEnd, 0.011, 0.0062, 3, trunkGeos);
      if (s === 1) leafAnchors.push({ pos: sEnd.clone(), yaw: sYaw });

      // 3 级细枝杈（2 枝）
      for (let t = 0; t < 2; t++) {
        const tYaw = sYaw + (t === 0 ? -0.46 : 0.46) + (rand() - 0.5) * 0.28;
        const tTilt = 0.28 + rand() * 0.42;
        const len3 = style.spread * (0.36 + rand() * 0.18);
        const tStart = sStart.clone().lerp(sEnd, 0.62 + rand() * 0.35);
        const dir3 = new THREE.Vector3(
          Math.cos(tYaw) * Math.sin(tTilt),
          Math.cos(tTilt),
          Math.sin(tYaw) * Math.sin(tTilt)
        );
        const tEnd = tStart.clone().addScaledVector(dir3, len3);
        addBranchSegment(tStart, tEnd, 0.0065, 0.0035, 3, trunkGeos);
        leafAnchors.push({ pos: tEnd.clone(), yaw: tYaw });
      }
    }
  }

  const domeCenter = new THREE.Vector3(p2.x, style.trunkH + 0.56, p2.z);
  const crownR = style.spread * 1.15;

  // 在末梢锚点与冠心交叉布置 20–23 片微弧枝叶簇卡片
  for (let i = 0; i < leafAnchors.length; i++) {
    const a = leafAnchors[i];
    if (i % 3 === 2 || (leafAnchors.length > 28 && i % 5 === 0)) continue;
    const sz = style.cardSize * (0.85 + rand() * 0.34);
    const cardYaw = a.yaw + (rand() - 0.5) * 1.3;
    const pitch = (rand() - 0.5) * 0.85;
    const roll = (rand() - 0.5) * 0.5;
    addCurvedLeafCard(a.pos, sz, sz * 0.94, cardYaw, pitch, roll, domeCenter, crownR, canopyGeos);
  }

  // 冠顶与冠心柔化交叉补片，保障俯视与仰视均呈饱满云团
  for (let k = 0; k < 3; k++) {
    const yaw = (k / 3) * Math.PI * 2 + rand() * 0.4;
    const pos = domeCenter.clone().add(new THREE.Vector3(Math.cos(yaw) * 0.1, 0.22 + (k % 2) * 0.08, Math.sin(yaw) * 0.1));
    addCurvedLeafCard(
      pos,
      style.cardSize * 1.1,
      style.cardSize,
      yaw,
      -0.92 + rand() * 0.25,
      (rand() - 0.5) * 0.3,
      domeCenter,
      crownR,
      canopyGeos
    );
  }

  return {
    trunkGeo: mergeFoliageGeometries(trunkGeos, false),
    canopyGeo: mergeFoliageGeometries(canopyGeos, true),
  };
}

/** 构造常绿苍松原型（苍劲曲干 + 多层错落扇形松针簇面片） */
function createPinePrototype(seed: number): {
  trunkGeo: THREE.BufferGeometry;
  canopyGeo: THREE.BufferGeometry;
} {
  const rand = mulberry32(seed);
  const trunkGeos: THREE.BufferGeometry[] = [];
  const canopyGeos: THREE.BufferGeometry[] = [];

  const t0 = new THREE.Vector3(0, -0.18, 0);
  const t1 = new THREE.Vector3((rand() - 0.5) * 0.16, 0.48, (rand() - 0.5) * 0.14);
  const t2 = new THREE.Vector3(-t1.x * 0.5 + (rand() - 0.5) * 0.12, 1.08, -t1.z * 0.5 + (rand() - 0.5) * 0.12);
  const t3 = new THREE.Vector3(t2.x + (rand() - 0.5) * 0.1, 1.52, t2.z + (rand() - 0.5) * 0.1);
  addBranchSegment(t0, t1, 0.052, 0.038, 5, trunkGeos);
  addBranchSegment(t1, t2, 0.038, 0.025, 5, trunkGeos);
  addBranchSegment(t2, t3, 0.025, 0.011, 4, trunkGeos);

  const domeCenter = new THREE.Vector3(t2.x, 1.18, t2.z);
  const tierCount = 6;

  for (let k = 0; k < tierCount; k++) {
    const f = k / (tierCount - 1);
    const yaw = k * 2.39996 + seed;
    const armLen = (1 - f * 0.62) * (0.3 + rand() * 0.14);
    const yBase = 0.72 + f * 0.82;
    const stem = t1.clone().lerp(t3, clamp((yBase - 0.48) / 1.04, 0, 1));
    const padPos = new THREE.Vector3(
      stem.x + Math.cos(yaw) * armLen,
      yBase + 0.08,
      stem.z + Math.sin(yaw) * armLen
    );
    addBranchSegment(stem, padPos, 0.015, 0.008, 4, trunkGeos);

    const padW = (1 - f * 0.42) * (0.7 + rand() * 0.15);
    // 每层松枝由平展 + 斜交双片扇形松针簇组成，兼顾 45° 俯视与冬日接雪
    addCurvedLeafCard(
      padPos,
      padW,
      padW * 0.92,
      yaw,
      -Math.PI * 0.42 + (rand() - 0.5) * 0.18,
      0,
      domeCenter,
      0.68,
      canopyGeos,
      0.14
    );
    addCurvedLeafCard(
      padPos.clone().add(new THREE.Vector3(0, -0.02, 0)),
      padW * 0.9,
      padW * 0.66,
      yaw + 0.75,
      -0.32 + (rand() - 0.5) * 0.2,
      0.15,
      domeCenter,
      0.68,
      canopyGeos,
      0.12
    );
  }

  // 顶冠云松簇
  addCurvedLeafCard(
    new THREE.Vector3(t3.x, t3.y + 0.08, t3.z),
    0.52,
    0.48,
    0.3,
    -Math.PI * 0.44,
    0,
    domeCenter,
    0.68,
    canopyGeos,
    0.18
  );
  addCurvedLeafCard(
    new THREE.Vector3(t3.x, t3.y + 0.05, t3.z),
    0.48,
    0.38,
    1.8,
    -0.38,
    0,
    domeCenter,
    0.68,
    canopyGeos,
    0.14
  );

  return {
    trunkGeo: mergeFoliageGeometries(trunkGeos, false),
    canopyGeo: mergeFoliageGeometries(canopyGeos, true),
  };
}

/** 构造湖岸垂柳原型（弯斜主干 + 拱枝 + 16 片纤细垂柳丝帘面片） */
function createWillowPrototype(seed: number): {
  trunkGeo: THREE.BufferGeometry;
  canopyGeo: THREE.BufferGeometry;
} {
  const rand = mulberry32(seed);
  const trunkGeos: THREE.BufferGeometry[] = [];
  const canopyGeos: THREE.BufferGeometry[] = [];

  const p0 = new THREE.Vector3(0, -0.18, 0);
  const p1 = new THREE.Vector3(0.08, 0.38, 0.04);
  const p2 = new THREE.Vector3(0.14, 0.88, 0.02);
  addBranchSegment(p0, p1, 0.044, 0.03, 5, trunkGeos);
  addBranchSegment(p1, p2, 0.03, 0.018, 5, trunkGeos);

  const domeCenter = new THREE.Vector3(p2.x, 0.92, p2.z);

  // 6 组拱枝与 12 片环绕下垂的柳丝帘
  for (let b = 0; b < 6; b++) {
    const yaw = (b / 6) * Math.PI * 2 + (rand() - 0.5) * 0.3;
    const rOut = 0.34 + rand() * 0.08;
    const archEnd = new THREE.Vector3(
      p2.x + Math.cos(yaw) * rOut,
      p2.y + 0.22,
      p2.z + Math.sin(yaw) * rOut
    );
    addBranchSegment(p2, archEnd, 0.015, 0.0075, 4, trunkGeos);

    const dropEnd = new THREE.Vector3(
      archEnd.x + Math.cos(yaw) * 0.08,
      0.34 + rand() * 0.14,
      archEnd.z + Math.sin(yaw) * 0.08
    );
    addBranchSegment(archEnd, dropEnd, 0.0055, 0.0032, 3, trunkGeos);

    const curtainPos = new THREE.Vector3(
      archEnd.x * 0.92 + p2.x * 0.08,
      archEnd.y - 0.28,
      archEnd.z * 0.92 + p2.z * 0.08
    );
    // 径向垂帘面片 + 切向交叉垂帘面片，消除任意角度的薄片感
    addCurvedLeafCard(curtainPos, 0.49, 0.76, yaw, 0.14, 0, domeCenter, 0.62, canopyGeos, 0.14);
    addCurvedLeafCard(
      curtainPos.clone().add(new THREE.Vector3(0, 0.04, 0)),
      0.46,
      0.7,
      yaw + Math.PI * 0.48,
      0.16,
      0,
      domeCenter,
      0.62,
      canopyGeos,
      0.14
    );
  }

  // 柳冠顶蓬
  for (let k = 0; k < 2; k++) {
    const yaw = (k / 2) * Math.PI * 2 + 0.4;
    addCurvedLeafCard(
      new THREE.Vector3(p2.x, p2.y + 0.28, p2.z),
      0.62,
      0.58,
      yaw,
      -0.85,
      0,
      domeCenter,
      0.62,
      canopyGeos,
      0.16
    );
  }

  return {
    trunkGeo: mergeFoliageGeometries(trunkGeos, false),
    canopyGeo: mergeFoliageGeometries(canopyGeos, true),
  };
}

interface TreePlacement {
  x: number;
  y: number;
  z: number;
  scale: number;
  yaw: number;
  tiltX: number;
  tiltZ: number;
  species: 0 | 1 | 2; // 0=银杏(55%), 1=元宝枫(30%), 2=国槐晚绿(15%)
  hueJitter: number;
}

function distToBoatRoute(x: number, z: number): number {
  let minD = Infinity;
  for (let i = 0; i < BOAT_WAYPOINTS.length; i++) {
    const a = BOAT_WAYPOINTS[i];
    const b = BOAT_WAYPOINTS[(i + 1) % BOAT_WAYPOINTS.length];
    const vx = b[0] - a[0];
    const vz = b[1] - a[1];
    const l2 = vx * vx + vz * vz;
    const t = l2 > 1e-6 ? clamp(((x - a[0]) * vx + (z - a[1]) * vz) / l2, 0, 1) : 0;
    const d = Math.hypot(x - (a[0] + vx * t), z - (a[1] + vz * t));
    if (d < minD) minD = d;
  }
  return minD;
}

/**
 * 构建 2,000 株高精枝叶森林 + 600 簇灌木 + 夏季荷花体系
 */
export function buildFoliage(): FoliageResult {
  const group = new THREE.Group();
  group.name = 'ForestAndMicroEcology';

  const rand = mulberry32(20261128);
  const cellSize = 0.42;
  const occupied = new Set<string>();
  const tryClaim = (x: number, z: number, minGapCells = 1): boolean => {
    const gx = Math.round(x / cellSize);
    const gz = Math.round(z / cellSize);
    if (minGapCells > 0) {
      for (let dx = -minGapCells; dx <= minGapCells; dx++) {
        for (let dz = -minGapCells; dz <= minGapCells; dz++) {
          if (occupied.has(`${gx + dx},${gz + dz}`)) return false;
        }
      }
    } else if (occupied.has(`${gx},${gz}`)) {
      return false;
    }
    occupied.add(`${gx},${gz}`);
    return true;
  };

  // =========================================================================
  // 1. 湖岸垂柳（350 株：西堤 + 东堤 + 南湖岛岸 + 北岸东西尽端）
  // =========================================================================
  const willowPlacements: TreePlacement[] = [];
  for (let attempt = 0; attempt < 9000 && willowPlacements.length < 350; attempt++) {
    let x = 0;
    let z = 0;
    const zone = rand();
    if (zone < 0.42) {
      z = -4.5 + rand() * 27.3;
      x = getWestDikeX(z) + (rand() - 0.5) * 1.4;
    } else if (zone < 0.72) {
      z = -6.0 + rand() * 28.5;
      x = getEastDikeX(z) + 0.3 + rand() * 3.8;
    } else if (zone < 0.9) {
      const a = rand() * Math.PI * 2;
      const r = 2.0 + rand() * 1.85;
      x = LANDMARKS.southLakeIsland.x + Math.cos(a) * r;
      z = LANDMARKS.southLakeIsland.z + Math.sin(a) * r;
    } else {
      x = rand() < 0.5 ? -28.0 + rand() * 10.2 : 17.2 + rand() * 7.6;
      z = getNorthShoreZ(x) - 0.4 - rand() * 1.8;
    }

    if (isPlacementBlocked(x, z, 0.65)) continue;
    const y = getSculptedHeight(x, z);
    if (y < 0.28 || y > 1.38) continue;
    if (!tryClaim(x, z, 0)) continue;

    willowPlacements.push({
      x,
      y,
      z,
      scale: 0.72 + rand() * 0.52,
      yaw: rand() * Math.PI * 2,
      tiltX: (rand() - 0.5) * 0.09,
      tiltZ: (rand() - 0.5) * 0.09,
      species: 0,
      hueJitter: rand(),
    });
  }

  // =========================================================================
  // 2. 常绿苍松（570 株，分 2 套原型）
  // =========================================================================
  const pineBuckets: [TreePlacement[], TreePlacement[]] = [[], []];
  const pineTargetPerType = 285;
  for (let attempt = 0; attempt < 22000 && pineBuckets[0].length + pineBuckets[1].length < 570; attempt++) {
    const x = -28.2 + rand() * 56.4;
    const z = -22.5 + rand() * 16.5;
    if (isPlacementBlocked(x, z, 0.92)) continue;
    const y = getSculptedHeight(x, z);
    if (y < 1.25 && rand() > 0.22) continue;
    if (y < 0.45) continue;
    if (!tryClaim(x, z, 1)) continue;

    const bIdx =
      pineBuckets[0].length < pineTargetPerType && (pineBuckets[1].length >= pineTargetPerType || rand() < 0.5)
        ? 0
        : 1;
    pineBuckets[bIdx].push({
      x,
      y,
      z,
      scale: 0.74 + rand() * 0.58,
      yaw: rand() * Math.PI * 2,
      tiltX: (rand() - 0.5) * 0.08,
      tiltZ: (rand() - 0.5) * 0.08,
      species: 0,
      hueJitter: rand(),
    });
  }

  // =========================================================================
  // 3. 落叶阔叶林（1,080 株，分 3 套骨架原型：银杏 55% / 元宝枫 30% / 国槐 15%）
  // =========================================================================
  const decBuckets: [TreePlacement[], TreePlacement[], TreePlacement[]] = [[], [], []];
  const decTargetPerType = 360;
  for (
    let attempt = 0;
    attempt < 30000 && decBuckets[0].length + decBuckets[1].length + decBuckets[2].length < 1080;
    attempt++
  ) {
    let x = 0;
    let z = 0;
    const zone = rand();
    if (zone < 0.82) {
      x = -28.4 + rand() * 56.8;
      z = -22.4 + rand() * 18.2;
    } else if (zone < 0.95) {
      z = -5.5 + rand() * 27.8;
      x = getEastDikeX(z) + 0.6 + rand() * 5.2;
    } else {
      const a = rand() * Math.PI * 2;
      const r = 1.6 + rand() * 2.2;
      x = LANDMARKS.southLakeIsland.x + Math.cos(a) * r;
      z = LANDMARKS.southLakeIsland.z + Math.sin(a) * r;
    }

    if (isPlacementBlocked(x, z, 0.9)) continue;
    const y = getSculptedHeight(x, z);
    if (y < 0.35) continue;
    if (!tryClaim(x, z, 0)) continue;

    const avail = [0, 1, 2].filter((k) => decBuckets[k].length < decTargetPerType);
    const bIdx = avail[Math.floor(rand() * avail.length)];

    const spRoll = rand();
    const species: 0 | 1 | 2 = spRoll < 0.55 ? 0 : spRoll < 0.85 ? 1 : 2;
    decBuckets[bIdx].push({
      x,
      y,
      z,
      scale: 0.72 + rand() * 0.58,
      yaw: rand() * Math.PI * 2,
      tiltX: (rand() - 0.5) * 0.08,
      tiltZ: (rand() - 0.5) * 0.08,
      species,
      hueJitter: rand(),
    });
  }

  // =========================================================================
  // 4. 低矮灌木微地被（600 簇交叉叶簇）与夏季浅水荷花（160 叶 + 55 粉荷）
  // =========================================================================
  const shrubPlacements: TreePlacement[] = [];
  for (let attempt = 0; attempt < 9000 && shrubPlacements.length < 600; attempt++) {
    const x = -28.5 + rand() * 57.0;
    const z = -22.4 + rand() * 44.5;
    if (isPlacementBlocked(x, z, 0.58)) continue;
    const y = getSculptedHeight(x, z);
    if (y < 0.28) continue;
    shrubPlacements.push({
      x,
      y,
      z,
      scale: 0.68 + rand() * 0.6,
      yaw: rand() * Math.PI * 2,
      tiltX: 0,
      tiltZ: 0,
      species: 0,
      hueJitter: rand(),
    });
  }

  const lotusPadPlacements: Array<{ x: number; z: number; scale: number; yaw: number }> = [];
  const lotusBloomPlacements: Array<{ x: number; z: number; scale: number; yaw: number }> = [];
  for (let attempt = 0; attempt < 6000 && lotusPadPlacements.length < 160; attempt++) {
    const cove = rand();
    let x = 0;
    let z = 0;
    if (cove < 0.45) {
      z = 4.5 + rand() * 14.5;
      x = getWestDikeX(z) + 1.6 + rand() * 3.8;
    } else if (cove < 0.75) {
      const a = Math.PI * 0.65 + rand() * Math.PI * 0.85;
      const r = 4.6 + rand() * 2.2;
      x = LANDMARKS.southLakeIsland.x + Math.cos(a) * r;
      z = LANDMARKS.southLakeIsland.z + Math.sin(a) * r;
    } else {
      x = -26.0 + rand() * 6.5;
      z = 4.0 + rand() * 15.0;
    }

    if (Math.abs(x) > 29.0 || Math.abs(z) > 22.8) continue;
    const h = getSculptedHeight(x, z);
    if (h > -0.14 || h < -0.78) continue;
    if (distToBoatRoute(x, z) < 2.2) continue;
    if (Math.hypot(x - LANDMARKS.seventeenArchBridge.x, z - LANDMARKS.seventeenArchBridge.z) < 6.0) continue;

    const s = 0.75 + rand() * 0.55;
    const yaw = rand() * Math.PI * 2;
    lotusPadPlacements.push({ x, z, scale: s, yaw });
    if (lotusBloomPlacements.length < 55 && rand() < 0.38) {
      lotusBloomPlacements.push({
        x: x + (rand() - 0.5) * 0.14,
        z: z + (rand() - 0.5) * 0.14,
        scale: s * 0.95,
        yaw,
      });
    }
  }

  // =========================================================================
  // 实例化挂载 + enhanceMaterial 统一风摆（透传 alphaTest 同步 customDepthMaterial）与积雪
  // =========================================================================
  const dummy = new THREE.Object3D();
  const cTmp = new THREE.Color();

  const populateTransforms = (inst: THREE.InstancedMesh, items: TreePlacement[]) => {
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.tiltX, p.yaw, p.tiltZ);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  };

  const decLeafTex = createDeciduousLeafClusterTexture();
  const pineLeafTex = createPineNeedleSprayTexture();
  const willowLeafTex = createWillowFrondTexture();
  const shrubLeafTex = createShrubLeafTexture();

  // 落叶树 3 组
  const decCanopyMeshes: Array<{ mesh: THREE.InstancedMesh; items: TreePlacement[] }> = [];
  for (let idx = 0; idx < 3; idx++) {
    const items = decBuckets[idx];
    const proto = createDeciduousPrototype(1100 + idx * 313, idx);

    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x261f1a,
      roughness: 0.92,
      metalness: 0.02,
    });
    const trunkMesh = new THREE.InstancedMesh(proto.trunkGeo, trunkMat, items.length);
    trunkMesh.name = `DeciduousTrunks_${idx + 1}`;
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    trunkMesh.userData.excludeFromAO = true;
    enhanceMaterial(trunkMesh.material, {
      wind: true,
      windAmplitude: 0.04,
      windHeightScale: 1.8,
      snow: true,
      snowThreshold: 0.75,
      snowStrength: 0.35,
      mesh: trunkMesh,
    });
    populateTransforms(trunkMesh, items);
    group.add(trunkMesh);

    const canopyMat = new THREE.MeshStandardMaterial({
      map: decLeafTex,
      alphaTest: 0.38,
      transparent: false,
      depthWrite: true,
      side: THREE.DoubleSide,
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.01,
    });
    const canopyMesh = new THREE.InstancedMesh(proto.canopyGeo, canopyMat, items.length);
    canopyMesh.name = `DeciduousCanopy_${idx + 1}`;
    canopyMesh.castShadow = true;
    canopyMesh.receiveShadow = true;
    enhanceMaterial(canopyMesh.material, {
      wind: true,
      windAmplitude: 0.14,
      windHeightScale: 1.65,
      snow: true,
      snowThreshold: 0.56,
      snowStrength: 0.76,
      foliageTranslucency: true,
      mesh: canopyMesh,
    });
    populateTransforms(canopyMesh, items);
    group.add(canopyMesh);
    decCanopyMeshes.push({ mesh: canopyMesh, items });
  }

  // 常绿苍松 2 组
  for (let idx = 0; idx < 2; idx++) {
    const items = pineBuckets[idx];
    const proto = createPinePrototype(2200 + idx * 419);

    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x2e231c,
      roughness: 0.92,
      metalness: 0.02,
    });
    const trunkMesh = new THREE.InstancedMesh(proto.trunkGeo, trunkMat, items.length);
    trunkMesh.name = `PineTrunks_${idx + 1}`;
    trunkMesh.castShadow = false;
    trunkMesh.receiveShadow = true;
    trunkMesh.userData.excludeFromAO = true;
    enhanceMaterial(trunkMesh.material, {
      wind: true,
      windAmplitude: 0.032,
      windHeightScale: 1.8,
      mesh: trunkMesh,
    });
    populateTransforms(trunkMesh, items);
    group.add(trunkMesh);

    const canopyMat = new THREE.MeshStandardMaterial({
      map: pineLeafTex,
      alphaTest: 0.36,
      transparent: false,
      depthWrite: true,
      side: THREE.DoubleSide,
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.01,
    });
    const canopyMesh = new THREE.InstancedMesh(proto.canopyGeo, canopyMat, items.length);
    canopyMesh.name = `PineNeedles_${idx + 1}`;
    canopyMesh.castShadow = true;
    canopyMesh.receiveShadow = true;
    enhanceMaterial(canopyMesh.material, {
      wind: true,
      windAmplitude: 0.055,
      windHeightScale: 1.8,
      snow: true,
      snowThreshold: 0.36,
      snowStrength: 0.95,
      foliageTranslucency: true,
      mesh: canopyMesh,
    });
    populateTransforms(canopyMesh, items);
    for (let i = 0; i < items.length; i++) {
      const j = items[i].hueJitter;
      // 低饱和苍松针叶（#273d2c - #344b37）
      cTmp.setRGB(0.15 + j * 0.05, 0.24 + j * 0.06, 0.17 + j * 0.04, THREE.SRGBColorSpace);
      canopyMesh.setColorAt(i, cTmp);
    }
    if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true;
    group.add(canopyMesh);
  }

  // 湖岸垂柳（1 套骨架 + 1 套垂丝帘）
  const willowProto = createWillowPrototype(3301);
  const wTrunkMat = new THREE.MeshStandardMaterial({ color: 0x2c241d, roughness: 0.9 });
  const wTrunkMesh = new THREE.InstancedMesh(willowProto.trunkGeo, wTrunkMat, willowPlacements.length);
  wTrunkMesh.name = 'WillowTrunks';
  wTrunkMesh.castShadow = false;
  wTrunkMesh.receiveShadow = true;
  wTrunkMesh.userData.excludeFromAO = true;
  enhanceMaterial(wTrunkMesh.material, {
    wind: true,
    windAmplitude: 0.055,
    windHeightScale: 1.6,
    snow: true,
    snowThreshold: 0.72,
    snowStrength: 0.4,
    mesh: wTrunkMesh,
  });
  populateTransforms(wTrunkMesh, willowPlacements);
  group.add(wTrunkMesh);

  const wCanopyMat = new THREE.MeshStandardMaterial({
    map: willowLeafTex,
    alphaTest: 0.34,
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.01,
  });
  const wCanopyMesh = new THREE.InstancedMesh(willowProto.canopyGeo, wCanopyMat, willowPlacements.length);
  wCanopyMesh.name = 'WillowCanopy';
  wCanopyMesh.castShadow = true;
  wCanopyMesh.receiveShadow = true;
  enhanceMaterial(wCanopyMesh.material, {
    wind: true,
    windAmplitude: 0.19,
    windHeightScale: 1.45,
    snow: true,
    snowThreshold: 0.58,
    snowStrength: 0.68,
    foliageTranslucency: true,
    mesh: wCanopyMesh,
  });
  populateTransforms(wCanopyMesh, willowPlacements);
  group.add(wCanopyMesh);

  // 低矮灌木（600 簇交叉叶簇）
  const shrubGeos: THREE.BufferGeometry[] = [];
  const shrubCenter = new THREE.Vector3(0, 0.16, 0);
  for (let k = 0; k < 4; k++) {
    const yaw = (k / 4) * Math.PI * 2 + 0.25;
    addCurvedLeafCard(
      new THREE.Vector3(Math.cos(yaw) * 0.08, 0.14, Math.sin(yaw) * 0.08),
      0.46,
      0.35,
      yaw,
      -0.32,
      0,
      shrubCenter,
      0.28,
      shrubGeos,
      0.16
    );
  }
  const shrubGeo = mergeFoliageGeometries(shrubGeos, true);
  const shrubMat = new THREE.MeshStandardMaterial({
    map: shrubLeafTex,
    alphaTest: 0.38,
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.88,
  });
  const shrubMesh = new THREE.InstancedMesh(shrubGeo, shrubMat, shrubPlacements.length);
  shrubMesh.name = 'UndergrowthShrubs600';
  shrubMesh.castShadow = false;
  shrubMesh.receiveShadow = true;
  shrubMesh.userData.excludeFromAO = true;
  enhanceMaterial(shrubMesh.material, {
    wind: true,
    windAmplitude: 0.04,
    windHeightScale: 0.6,
    snow: true,
    snowThreshold: 0.44,
    snowStrength: 0.88,
    foliageTranslucency: true,
    mesh: shrubMesh,
  });
  populateTransforms(shrubMesh, shrubPlacements);
  group.add(shrubMesh);

  // 夏季荷叶与粉荷（各 1 InstancedMesh，仅 summer 显示）
  const padGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.015, 10);
  const padMat = new THREE.MeshStandardMaterial({ color: 0x3b663d, roughness: 0.65 });
  const padMesh = new THREE.InstancedMesh(padGeo, padMat, lotusPadPlacements.length);
  padMesh.name = 'SummerLotusPads';
  padMesh.castShadow = false;
  padMesh.receiveShadow = true;
  padMesh.userData.excludeFromAO = true;
  for (let i = 0; i < lotusPadPlacements.length; i++) {
    const lp = lotusPadPlacements[i];
    dummy.position.set(lp.x, 0.014, lp.z);
    dummy.rotation.set(0, lp.yaw, 0);
    dummy.scale.setScalar(lp.scale);
    dummy.updateMatrix();
    padMesh.setMatrixAt(i, dummy.matrix);
  }
  padMesh.instanceMatrix.needsUpdate = true;
  group.add(padMesh);

  const bloomGeo = new THREE.ConeGeometry(0.065, 0.1, 6);
  bloomGeo.rotateX(Math.PI);
  bloomGeo.translate(0, 0.05, 0);
  const bloomMat = new THREE.MeshStandardMaterial({
    color: 0xee96a8,
    roughness: 0.55,
    emissive: 0x361218,
    emissiveIntensity: 0.2,
  });
  const bloomMesh = new THREE.InstancedMesh(bloomGeo, bloomMat, lotusBloomPlacements.length);
  bloomMesh.name = 'SummerLotusBlooms';
  bloomMesh.castShadow = false;
  bloomMesh.userData.excludeFromAO = true;
  for (let i = 0; i < lotusBloomPlacements.length; i++) {
    const lb = lotusBloomPlacements[i];
    dummy.position.set(lb.x, 0.02, lb.z);
    dummy.rotation.set(0, lb.yaw, 0);
    dummy.scale.setScalar(lb.scale);
    dummy.updateMatrix();
    bloomMesh.setMatrixAt(i, dummy.matrix);
  }
  bloomMesh.instanceMatrix.needsUpdate = true;
  group.add(bloomMesh);

  // =========================================================================
  // 降饱和新中式矿物树色板 + 四季平滑演替插值 + 冬日枯枝显影控制
  // =========================================================================
  const cFrom = new THREE.Color();
  const cTo = new THREE.Color();
  const cBud = new THREE.Color();

  const computeDeciduousColor = (
    preset: SeasonPresetId,
    species: number,
    j: number,
    out: THREE.Color
  ) => {
    if (preset === 'spring') {
      if (species === 0) out.setRGB(0.39 + j * 0.07, 0.51 + j * 0.08, 0.31 + j * 0.05, THREE.SRGBColorSpace);
      else if (species === 1) out.setRGB(0.34 + j * 0.06, 0.45 + j * 0.07, 0.29 + j * 0.04, THREE.SRGBColorSpace);
      else out.setRGB(0.29 + j * 0.05, 0.4 + j * 0.06, 0.26 + j * 0.04, THREE.SRGBColorSpace);
    } else if (preset === 'summer') {
      out.setRGB(0.21 + j * 0.06, 0.34 + j * 0.07, 0.21 + j * 0.04, THREE.SRGBColorSpace);
    } else if (preset === 'rain') {
      if (species === 0) out.setRGB(0.26 + j * 0.06, 0.41 + j * 0.07, 0.26 + j * 0.04, THREE.SRGBColorSpace);
      else out.setRGB(0.21 + j * 0.05, 0.36 + j * 0.06, 0.24 + j * 0.04, THREE.SRGBColorSpace);
    } else if (preset === 'autumn') {
      if (species === 0) out.setRGB(0.76 + j * 0.08, 0.58 + j * 0.08, 0.22 + j * 0.05, THREE.SRGBColorSpace);
      else if (species === 1) out.setRGB(0.62 + j * 0.09, 0.22 + j * 0.06, 0.15 + j * 0.04, THREE.SRGBColorSpace);
      else out.setRGB(0.33 + j * 0.06, 0.39 + j * 0.06, 0.25 + j * 0.04, THREE.SRGBColorSpace);
    } else {
      // 冬季枯槁余褐色（仅用于入冬脱叶前瞬间过渡）
      out.setRGB(0.38 + j * 0.05, 0.32 + j * 0.04, 0.24 + j * 0.03, THREE.SRGBColorSpace);
    }
  };

  const computeWillowColor = (preset: SeasonPresetId, j: number, out: THREE.Color) => {
    if (preset === 'spring') {
      out.setRGB(0.43 + j * 0.07, 0.56 + j * 0.07, 0.31 + j * 0.05, THREE.SRGBColorSpace);
    } else if (preset === 'summer') {
      out.setRGB(0.25 + j * 0.06, 0.4 + j * 0.07, 0.23 + j * 0.04, THREE.SRGBColorSpace);
    } else if (preset === 'rain') {
      out.setRGB(0.28 + j * 0.06, 0.44 + j * 0.07, 0.27 + j * 0.04, THREE.SRGBColorSpace);
    } else if (preset === 'autumn') {
      out.setRGB(0.67 + j * 0.08, 0.58 + j * 0.07, 0.28 + j * 0.05, THREE.SRGBColorSpace);
    } else {
      out.setRGB(0.42 + j * 0.05, 0.38 + j * 0.04, 0.26 + j * 0.03, THREE.SRGBColorSpace);
    }
  };

  const computeShrubColor = (preset: SeasonPresetId, j: number, out: THREE.Color) => {
    if (preset === 'spring') out.setRGB(0.28 + j * 0.06, 0.4 + j * 0.07, 0.24 + j * 0.04, THREE.SRGBColorSpace);
    else if (preset === 'summer') out.setRGB(0.19 + j * 0.05, 0.31 + j * 0.06, 0.19 + j * 0.04, THREE.SRGBColorSpace);
    else if (preset === 'rain') out.setRGB(0.18 + j * 0.05, 0.31 + j * 0.06, 0.21 + j * 0.04, THREE.SRGBColorSpace);
    else if (preset === 'autumn') out.setRGB(0.44 + j * 0.09, 0.32 + j * 0.07, 0.19 + j * 0.04, THREE.SRGBColorSpace);
    else out.setRGB(0.25 + j * 0.05, 0.24 + j * 0.04, 0.2 + j * 0.03, THREE.SRGBColorSpace);
  };

  const applySeason = (preset: SeasonPresetId) => {
    const isWinter = preset === 'winter' || preset === 'solstice';

    for (const { mesh, items } of decCanopyMeshes) {
      mesh.visible = !isWinter;
      if (isWinter) continue;

      for (let i = 0; i < items.length; i++) {
        computeDeciduousColor(preset, items[i].species, items[i].hueJitter, cTmp);
        mesh.setColorAt(i, cTmp);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    wCanopyMesh.visible = !isWinter;
    if (!isWinter) {
      for (let i = 0; i < willowPlacements.length; i++) {
        computeWillowColor(preset, willowPlacements[i].hueJitter, cTmp);
        wCanopyMesh.setColorAt(i, cTmp);
      }
      if (wCanopyMesh.instanceColor) wCanopyMesh.instanceColor.needsUpdate = true;
    }

    for (let i = 0; i < shrubPlacements.length; i++) {
      computeShrubColor(preset, shrubPlacements[i].hueJitter, cTmp);
      shrubMesh.setColorAt(i, cTmp);
    }
    if (shrubMesh.instanceColor) shrubMesh.instanceColor.needsUpdate = true;

    const showLotus = preset === 'summer';
    padMesh.visible = showLotus;
    bloomMesh.visible = showLotus;
  };

  const blendSeasons = (from: BaseSeasonId, to: BaseSeasonId, rawT: number) => {
    const t = clamp(rawT, 0, 1);
    if (from === to || t <= 0.002) {
      applySeason(from);
      return;
    }
    if (t >= 0.998) {
      applySeason(to);
      return;
    }

    const hideCanopies =
      (to === 'winter' && t >= 0.72) || (from === 'winter' && t < 0.28);

    if (!hideCanopies) {
      for (const { mesh, items } of decCanopyMeshes) {
        mesh.visible = true;
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (to === 'winter') {
            computeDeciduousColor(from, it.species, it.hueJitter, cFrom);
            computeDeciduousColor('winter', it.species, it.hueJitter, cTo);
            cFrom.lerp(cTo, clamp(t / 0.72, 0, 1));
          } else if (from === 'winter') {
            cBud.setRGB(0.45 + it.hueJitter * 0.06, 0.56 + it.hueJitter * 0.07, 0.34, THREE.SRGBColorSpace);
            computeDeciduousColor(to, it.species, it.hueJitter, cTo);
            cFrom.copy(cBud).lerp(cTo, clamp((t - 0.28) / 0.72, 0, 1));
          } else {
            computeDeciduousColor(from, it.species, it.hueJitter, cFrom);
            computeDeciduousColor(to, it.species, it.hueJitter, cTo);
            cFrom.lerp(cTo, t);
          }
          mesh.setColorAt(i, cFrom);
        }
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }

      wCanopyMesh.visible = true;
      for (let i = 0; i < willowPlacements.length; i++) {
        const j = willowPlacements[i].hueJitter;
        computeWillowColor(from, j, cFrom);
        computeWillowColor(to, j, cTo);
        cFrom.lerp(cTo, t);
        wCanopyMesh.setColorAt(i, cFrom);
      }
      if (wCanopyMesh.instanceColor) wCanopyMesh.instanceColor.needsUpdate = true;
    } else {
      for (const { mesh } of decCanopyMeshes) mesh.visible = false;
      wCanopyMesh.visible = false;
    }

    for (let i = 0; i < shrubPlacements.length; i++) {
      const j = shrubPlacements[i].hueJitter;
      computeShrubColor(from, j, cFrom);
      computeShrubColor(to, j, cTo);
      cFrom.lerp(cTo, t);
      shrubMesh.setColorAt(i, cFrom);
    }
    if (shrubMesh.instanceColor) shrubMesh.instanceColor.needsUpdate = true;

    const showLotus = (from === 'summer' && t < 0.78) || (to === 'summer' && t > 0.22);
    padMesh.visible = showLotus;
    bloomMesh.visible = showLotus;
  };

  applySeason('spring');

  const deciduousCount = decBuckets[0].length + decBuckets[1].length + decBuckets[2].length;
  const pineCount = pineBuckets[0].length + pineBuckets[1].length;
  const willowCount = willowPlacements.length;

  return {
    group,
    applySeason,
    blendSeasons,
    stats: {
      deciduousCount,
      pineCount,
      willowCount,
      shrubCount: shrubPlacements.length,
      lotusCount: lotusPadPlacements.length + lotusBloomPlacements.length,
      totalTrees: deciduousCount + pineCount + willowCount,
    },
  };
}
