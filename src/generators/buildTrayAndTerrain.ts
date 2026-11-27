import * as THREE from 'three';
import { ELEVATION, LANDMARKS, STAIR_PATHS, TRAY } from '../config/sceneConfig';
import { enhanceMaterial } from '../core/shaders';
import {
  clamp,
  getArchitecturalPadWeight,
  getEastDikeX,
  getNorthShoreZ,
  getSculptedHeight,
  getTerrainCurvature,
  getTerrainNormal,
  getWestDikeX,
  isPlacementBlocked,
  simplex2D,
} from '../core/terrainMath';
import {
  createAshlarStoneTextures,
  createContactShadowTexture,
  createRockStrataTextures,
  createRosewoodTextures,
  createTerrainDetailTextures,
} from '../textures/proceduralPBR';

export interface TrayAndTerrainResult {
  group: THREE.Group;
  contactShadowMesh: THREE.Mesh;
  stepsInstancedMesh: THREE.InstancedMesh;
  stepsCount: number;
  capstonesCount: number;
}

interface PerimeterPoint {
  x: number;
  z: number;
  nx: number;
  nz: number;
  u: number;
}

/** 生成逆时针（俯视下 +X -> +Z -> -X -> -Z 或标准参数）圆角矩形等弧长采样轮廓 */
function sampleRoundedRectPerimeter(halfW: number, halfD: number, radius: number, segments = 192): PerimeterPoint[] {
  const cx = halfW - radius;
  const cz = halfD - radius;
  const straightX = Math.max(0, cx * 2);
  const straightZ = Math.max(0, cz * 2);
  const arcLen = 0.5 * Math.PI * radius;
  const totalLen = 2 * straightX + 2 * straightZ + 4 * arcLen;

  const evalAtDist = (d: number): { x: number; z: number; nx: number; nz: number } => {
    let s = ((d % totalLen) + totalLen) % totalLen;
    // 从东北角圆弧末点开始顺时针（俯视）：东边(+X) -> 东南弧 -> 南边(+Z) -> 西南弧 -> 西边(-X) -> 西北弧 -> 北边(-Z) -> 东北弧
    if (s < straightZ) {
      const z = -cz + s;
      return { x: halfW, z, nx: 1, nz: 0 };
    }
    s -= straightZ;
    if (s < arcLen) {
      const a = (s / arcLen) * (Math.PI * 0.5);
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      return { x: cx + radius * nx, z: cz + radius * nz, nx, nz };
    }
    s -= arcLen;
    if (s < straightX) {
      const x = cx - s;
      return { x, z: halfD, nx: 0, nz: 1 };
    }
    s -= straightX;
    if (s < arcLen) {
      const a = Math.PI * 0.5 + (s / arcLen) * (Math.PI * 0.5);
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      return { x: -cx + radius * nx, z: cz + radius * nz, nx, nz };
    }
    s -= arcLen;
    if (s < straightZ) {
      const z = cz - s;
      return { x: -halfW, z, nx: -1, nz: 0 };
    }
    s -= straightZ;
    if (s < arcLen) {
      const a = Math.PI + (s / arcLen) * (Math.PI * 0.5);
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      return { x: -cx + radius * nx, z: -cz + radius * nz, nx, nz };
    }
    s -= arcLen;
    if (s < straightX) {
      const x = -cx + s;
      return { x, z: -halfD, nx: 0, nz: -1 };
    }
    s -= straightX;
    const a = Math.PI * 1.5 + (s / arcLen) * (Math.PI * 0.5);
    const nx = Math.cos(a);
    const nz = Math.sin(a);
    return { x: cx + radius * nx, z: -cz + radius * nz, nx, nz };
  };

  const pts: PerimeterPoint[] = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const p = evalAtDist(u * totalLen);
    pts.push({ ...p, u });
  }
  return pts;
}

/** 将单位正方形 [-1, 1]^2 无畸变平滑映射至圆角矩形 */
export function mapUnitGridToRoundedRect(
  u: number,
  v: number,
  halfW: number,
  halfD: number,
  radius: number
): [number, number] {
  const innerX = halfW - radius;
  const innerZ = halfD - radius;
  const uCorner = innerX / halfW;
  const vCorner = innerZ / halfD;
  const au = Math.abs(u);
  const av = Math.abs(v);
  const su = u < 0 ? -1 : 1;
  const sv = v < 0 ? -1 : 1;

  if (au <= uCorner || av <= vCorner) {
    return [u * halfW, v * halfD];
  }

  const tx = clamp((au - uCorner) / Math.max(1e-6, 1 - uCorner), 0, 1);
  const tz = clamp((av - vCorner) / Math.max(1e-6, 1 - vCorner), 0, 1);
  const qx = tx * Math.sqrt(Math.max(0, 1 - 0.5 * tz * tz));
  const qz = tz * Math.sqrt(Math.max(0, 1 - 0.5 * tx * tx));
  return [su * (innerX + radius * qx), sv * (innerZ + radius * qz)];
}

function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0;
  let totalIndices = 0;
  let hasColor = true;
  for (const g of geos) {
    totalVerts += g.attributes.position.count;
    totalIndices += g.index ? g.index.count : g.attributes.position.count;
    if (!g.attributes.color) hasColor = false;
  }

  const pos = new Float32Array(totalVerts * 3);
  const norm = new Float32Array(totalVerts * 3);
  const uv = new Float32Array(totalVerts * 2);
  const col = hasColor ? new Float32Array(totalVerts * 3) : null;
  const idx = new Uint32Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;
  for (const g of geos) {
    const pAttr = g.attributes.position;
    const nAttr = g.attributes.normal;
    const uAttr = g.attributes.uv;
    const cAttr = g.attributes.color;
    const count = pAttr.count;

    pos.set(pAttr.array as Float32Array, vOffset * 3);
    if (nAttr) norm.set(nAttr.array as Float32Array, vOffset * 3);
    if (uAttr) uv.set(uAttr.array as Float32Array, vOffset * 2);
    if (col && cAttr) col.set(cAttr.array as Float32Array, vOffset * 3);

    if (g.index) {
      const gIdx = g.index.array;
      for (let i = 0; i < gIdx.length; i++) {
        idx[iOffset + i] = gIdx[i] + vOffset;
      }
      iOffset += gIdx.length;
    } else {
      for (let i = 0; i < count; i++) {
        idx[iOffset + i] = vOffset + i;
      }
      iOffset += count;
    }

    vOffset += count;
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

/**
 * 构建薄边圆角紫檀木盘（总厚 2.15u，底收腰 0.55u，底板实厚 0.32u）及内缘 0.22u 暗金嵌线
 */
function buildWoodenTrayAndInlay(): { trayMesh: THREE.Mesh; inlayMesh: THREE.Mesh } {
  const segs = 192;
  const oHX = TRAY.outerW * 0.5;
  const oHZ = TRAY.outerD * 0.5;
  const oR = TRAY.outerRadius;
  const iHX = TRAY.innerW * 0.5;
  const iHZ = TRAY.innerD * 0.5;
  const iR = TRAY.innerRadius;
  const inset = TRAY.outerBottomInset;

  // 截面环带（按剖面顺序，每段折线独立出边以保持锐利倒角高光）
  // 注意：采样点顺序顺时针（东 -> 南 -> 西 -> 北），因此沿顺时针步进方向 (p_i -> p_{i+1}) 与 (ring_a -> ring_b) 需保证面朝外法向
  const ringSpecs: Array<{
    hx: number;
    hz: number;
    r: number;
    y: number;
    v: number;
  }> = [
    // 内底缘 -> 内壁 -> 内倒角 -> 顶面 -> 外倒角 -> 外上壁 -> 收腰底脚
    { hx: iHX, hz: iHZ, r: iR, y: ELEVATION.innerFloorY, v: 0.0 }, // 0: 内腔底壁交线
    { hx: iHX, hz: iHZ, r: iR, y: ELEVATION.topY - 0.07, v: 0.48 }, // 1: 内壁上沿
    { hx: iHX + 0.07, hz: iHZ + 0.07, r: iR + 0.07, y: ELEVATION.topY, v: 0.51 }, // 2: 内倒角顶
    { hx: oHX - 0.1, hz: oHZ - 0.1, r: oR - 0.1, y: ELEVATION.topY, v: 0.68 }, // 3: 顶框外倒角内沿
    { hx: oHX, hz: oHZ, r: oR, y: ELEVATION.topY - 0.1, v: 0.72 }, // 4: 外倒角下沿
    { hx: oHX, hz: oHZ, r: oR, y: -0.25, v: 0.85 }, // 5: 外直壁腰线
    { hx: oHX - inset, hz: oHZ - inset, r: Math.max(1.2, oR - inset * 0.65), y: ELEVATION.bottomY, v: 1.0 }, // 6: 收腰底脚
  ];

  const sampledRings = ringSpecs.map((spec) => ({
    spec,
    pts: sampleRoundedRectPerimeter(spec.hx, spec.hz, spec.r, segs),
  }));

  const bandGeos: THREE.BufferGeometry[] = [];

  for (let b = 0; b < sampledRings.length - 1; b++) {
    const rA = sampledRings[b];
    const rB = sampledRings[b + 1];
    const positions = new Float32Array((segs + 1) * 2 * 3);
    const uvs = new Float32Array((segs + 1) * 2 * 2);
    const indices: number[] = [];

    for (let i = 0; i <= segs; i++) {
      const pA = rA.pts[i];
      const pB = rB.pts[i];
      const base = i * 2;
      positions[base * 3] = pA.x;
      positions[base * 3 + 1] = rA.spec.y;
      positions[base * 3 + 2] = pA.z;

      positions[(base + 1) * 3] = pB.x;
      positions[(base + 1) * 3 + 1] = rB.spec.y;
      positions[(base + 1) * 3 + 2] = pB.z;

      uvs[base * 2] = pA.u * 14.0;
      uvs[base * 2 + 1] = rA.spec.v;
      uvs[(base + 1) * 2] = pB.u * 14.0;
      uvs[(base + 1) * 2 + 1] = rB.spec.v;

      if (i < segs) {
        const a0 = base;
        const b0 = base + 1;
        const a1 = base + 2;
        const b1 = base + 3;
        // 验证：b=2(内顶->外顶) 法向需朝 +Y；沿东侧 z 递增时 (a0->a1)=(0,0,+dz), (a0->b0)=(+dx,0,0)。(a0->a1) x (a0->b0) = (0, +dz*dx, 0) 朝 +Y！
        indices.push(a0, a1, b0, b0, a1, b1);
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    bandGeos.push(g);
  }

  // 内腔实心托底圆角盖板 (y = innerFloorY = -1.18，朝上)
  {
    const pts = sampledRings[0].pts;
    const pos = new Float32Array((segs + 2) * 3);
    const uvs = new Float32Array((segs + 2) * 2);
    const indices: number[] = [];
    pos[0] = 0;
    pos[1] = ELEVATION.innerFloorY;
    pos[2] = 0;
    uvs[0] = 0.5;
    uvs[1] = 0.5;
    for (let i = 0; i <= segs; i++) {
      pos[(i + 1) * 3] = pts[i].x;
      pos[(i + 1) * 3 + 1] = ELEVATION.innerFloorY;
      pos[(i + 1) * 3 + 2] = pts[i].z;
      uvs[(i + 1) * 2] = pts[i].x / 64 + 0.5;
      uvs[(i + 1) * 2 + 1] = pts[i].z / 52 + 0.5;
      if (i < segs) {
        // 顺时针外圈：center(0) -> i+2 -> i+1 叉乘朝 +Y
        indices.push(0, i + 2, i + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    bandGeos.push(g);
  }

  // 托盘最底面实心封底 (y = bottomY = -1.50，朝下)
  {
    const pts = sampledRings[sampledRings.length - 1].pts;
    const pos = new Float32Array((segs + 2) * 3);
    const uvs = new Float32Array((segs + 2) * 2);
    const indices: number[] = [];
    pos[0] = 0;
    pos[1] = ELEVATION.bottomY;
    pos[2] = 0;
    uvs[0] = 0.5;
    uvs[1] = 0.5;
    for (let i = 0; i <= segs; i++) {
      pos[(i + 1) * 3] = pts[i].x;
      pos[(i + 1) * 3 + 1] = ELEVATION.bottomY;
      pos[(i + 1) * 3 + 2] = pts[i].z;
      uvs[(i + 1) * 2] = pts[i].x / 64 + 0.5;
      uvs[(i + 1) * 2 + 1] = pts[i].z / 52 + 0.5;
      if (i < segs) {
        indices.push(0, i + 1, i + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    bandGeos.push(g);
  }

  const trayGeo = mergeGeometries(bandGeos);
  const woodTex = createRosewoodTextures();
  const trayMat = new THREE.MeshStandardMaterial({
    map: woodTex.map,
    normalMap: woodTex.normalMap,
    normalScale: new THREE.Vector2(0.18, 0.18),
    roughnessMap: woodTex.roughnessMap,
    roughness: 0.48,
    metalness: 0.06,
    envMapIntensity: 0.95,
  });

  const trayMesh = new THREE.Mesh(trayGeo, trayMat);
  trayMesh.name = 'WoodenTray';
  trayMesh.castShadow = true;
  trayMesh.receiveShadow = true;

  // 内沿 0.22u 极细暗金/黄铜收口嵌线
  const inlayInner = sampleRoundedRectPerimeter(iHX + 0.075, iHZ + 0.075, iR + 0.075, segs);
  const inlayOuter = sampleRoundedRectPerimeter(
    iHX + 0.075 + TRAY.inlayWidth,
    iHZ + 0.075 + TRAY.inlayWidth,
    iR + 0.075 + TRAY.inlayWidth,
    segs
  );
  const inlayPos = new Float32Array((segs + 1) * 2 * 3);
  const inlayUv = new Float32Array((segs + 1) * 2 * 2);
  const inlayIdx: number[] = [];
  const inlayY = ELEVATION.topY + 0.004;

  for (let i = 0; i <= segs; i++) {
    const pIn = inlayInner[i];
    const pOut = inlayOuter[i];
    const base = i * 2;
    inlayPos[base * 3] = pIn.x;
    inlayPos[base * 3 + 1] = inlayY;
    inlayPos[base * 3 + 2] = pIn.z;

    inlayPos[(base + 1) * 3] = pOut.x;
    inlayPos[(base + 1) * 3 + 1] = inlayY;
    inlayPos[(base + 1) * 3 + 2] = pOut.z;

    inlayUv[base * 2] = pIn.u * 12;
    inlayUv[base * 2 + 1] = 0;
    inlayUv[(base + 1) * 2] = pOut.u * 12;
    inlayUv[(base + 1) * 2 + 1] = 1;

    if (i < segs) {
      inlayIdx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }

  const inlayGeo = new THREE.BufferGeometry();
  inlayGeo.setAttribute('position', new THREE.BufferAttribute(inlayPos, 3));
  inlayGeo.setAttribute('uv', new THREE.BufferAttribute(inlayUv, 2));
  inlayGeo.setIndex(inlayIdx);
  inlayGeo.computeVertexNormals();

  const inlayMat = new THREE.MeshStandardMaterial({
    color: 0xc9a14a,
    metalness: 0.88,
    roughness: 0.22,
    envMapIntensity: 1.55,
  });

  const inlayMesh = new THREE.Mesh(inlayGeo, inlayMat);
  inlayMesh.name = 'TrayGoldInlay';
  inlayMesh.receiveShadow = true;

  return { trayMesh, inlayMesh };
}

/**
 * 构建 256×208 雕刻地形网格与严密嵌入木框内壁的闭合岩土剖面围裙
 */
function buildSculptedTerrainAndSkirt(): { terrainMesh: THREE.Mesh; skirtMesh: THREE.Mesh } {
  const segX = 256;
  const segZ = 208;
  const cols = segX + 1;
  const rows = segZ + 1;
  // 较托盘内壁缩进 0.015u，保证严丝合缝同时零 Z-fighting
  const halfW = TRAY.innerW * 0.5 - 0.015;
  const halfD = TRAY.innerD * 0.5 - 0.015;
  const radius = TRAY.innerRadius - 0.015;

  const vertCount = cols * rows;
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const colors = new Float32Array(vertCount * 3);

  const cDeepLake = new THREE.Color(0x183033);
  const cShallowSilt = new THREE.Color(0x5b6454);
  const cShoreGravel = new THREE.Color(0x787b69);
  const cMeadowMoss = new THREE.Color(0x536c48);
  const cDeepPine = new THREE.Color(0x364b33);
  const cGullyShadow = new THREE.Color(0x233124);
  const cRockCrest = new THREE.Color(0x787466);
  const cLimestone = new THREE.Color(0x888475);
  const cTerraceStone = new THREE.Color(0x6b6f5c);
  const tmpColor = new THREE.Color();

  for (let iz = 0; iz < rows; iz++) {
    const v = (iz / segZ) * 2 - 1;
    for (let ix = 0; ix < cols; ix++) {
      const u = (ix / segX) * 2 - 1;
      const [x, z] = mapUnitGridToRoundedRect(u, v, halfW, halfD, radius);
      const y = getSculptedHeight(x, z);
      const [nx, ny, nz] = getTerrainNormal(x, z, 0.14);
      const curv = getTerrainCurvature(x, z, 0.34);
      const padW = getArchitecturalPadWeight(x, z);
      const slope = clamp(1.0 - ny, 0, 1);

      const idx = iz * cols + ix;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;

      normals[idx * 3] = nx;
      normals[idx * 3 + 1] = ny;
      normals[idx * 3 + 2] = nz;

      uvs[idx * 2] = x / (halfW * 2) + 0.5;
      uvs[idx * 2 + 1] = z / (halfD * 2) + 0.5;

      // 多维度矿物岩土着色彩绘
      const microTone = simplex2D(x * 0.24 + 5.2, z * 0.24 - 3.8) * 0.5 + 0.5;
      const macroVar = simplex2D(x * 0.08 - 2.1, z * 0.08 + 7.4) * 0.5 + 0.5;

      if (y < -0.18) {
        const t = clamp((y + 0.8) / 0.62, 0, 1);
        tmpColor.copy(cDeepLake).lerp(cShallowSilt, t * t);
      } else if (y < 0.16) {
        const t = clamp((y + 0.18) / 0.34, 0, 1);
        tmpColor.copy(cShallowSilt).lerp(cShoreGravel, t);
      } else {
        const elevFactor = clamp((y - 0.35) / 5.0, 0, 1);
        tmpColor.copy(cMeadowMoss).lerp(cDeepPine, elevFactor * 0.74 + microTone * 0.24);

        // 沟壑凹陷加深，山脊凸起岩石露出
        const gullyMask = clamp((-curv - 0.008) / 0.065, 0, 1);
        tmpColor.lerp(cGullyShadow, gullyMask * 0.64);

        const rockBySlope = clamp((slope - 0.085) / 0.23, 0, 1);
        const rockByRidge = clamp((curv - 0.011) / 0.05, 0, 1);
        const rockMask = clamp(Math.max(rockBySlope, rockByRidge * 0.9) * (0.76 + 0.24 * macroVar), 0, 1);
        tmpColor.lerp(cRockCrest, rockMask * 0.78);

        const highCrest = clamp((y - 3.4) / 3.6, 0, 1) * rockBySlope;
        tmpColor.lerp(cLimestone, highCrest * 0.5);

        // 古建正基址铺以温润苔石三合土基色（克制范围，避免大面积浅沙感）
        tmpColor.lerp(cTerraceStone, padW * 0.45);
      }

      colors[idx * 3] = tmpColor.r;
      colors[idx * 3 + 1] = tmpColor.g;
      colors[idx * 3 + 2] = tmpColor.b;
    }
  }

  const indices = new Uint32Array(segX * segZ * 6);
  let ptr = 0;
  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iz * cols + ix;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      // +X 与 +Z 为网格增量：c - a = (0, dy, +dz), b - a = (+dx, dy, 0) -> (c - a) × (b - a) 朝 +Y
      indices[ptr++] = a;
      indices[ptr++] = c;
      indices[ptr++] = b;
      indices[ptr++] = b;
      indices[ptr++] = c;
      indices[ptr++] = d;
    }
  }

  const terrainGeo = new THREE.BufferGeometry();
  terrainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  terrainGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  terrainGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.setIndex(new THREE.BufferAttribute(indices, 1));

  const detailTex = createTerrainDetailTextures();
  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    normalMap: detailTex.normalMap,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughnessMap: detailTex.roughnessMap,
    roughness: 0.92,
    metalness: 0.02,
    envMapIntensity: 0.65,
  });
  enhanceMaterial(terrainMat, { snow: true, snowThreshold: 0.44, snowStrength: 0.94 });

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.name = 'SculptedTerrain';
  terrainMesh.castShadow = true;
  terrainMesh.receiveShadow = true;

  // 闭合岩土剖面围裙：沿地形网格四边逆时针抽出，垂直向下收口至 skirtBottomY = -1.10
  // 逆时针顺序（俯视）：南边(+Z) 左->右 (iz=segZ, ix=0..segX) -> 东边(+X) 下->上 (ix=segX, iz=segZ..0) -> 北边(-Z) 右->左 -> 西边(-X) 上->下
  const loopIndices: number[] = [];
  for (let ix = 0; ix <= segX; ix++) loopIndices.push(segZ * cols + ix);
  for (let iz = segZ - 1; iz >= 0; iz--) loopIndices.push(iz * cols + segX);
  for (let ix = segX - 1; ix >= 0; ix--) loopIndices.push(0 * cols + ix);
  for (let iz = 1; iz <= segZ; iz++) loopIndices.push(iz * cols + 0);

  const loopLen = loopIndices.length;
  const skirtPos = new Float32Array(loopLen * 2 * 3);
  const skirtUv = new Float32Array(loopLen * 2 * 2);
  const skirtIdx = new Uint32Array((loopLen - 1) * 6);

  let accLen = 0;
  for (let i = 0; i < loopLen; i++) {
    const vIdx = loopIndices[i];
    const x = positions[vIdx * 3];
    const y = positions[vIdx * 3 + 1];
    const z = positions[vIdx * 3 + 2];

    if (i > 0) {
      const prevIdx = loopIndices[i - 1];
      accLen += Math.hypot(x - positions[prevIdx * 3], z - positions[prevIdx * 3 + 2]);
    }

    const b = i * 2;
    skirtPos[b * 3] = x;
    skirtPos[b * 3 + 1] = y;
    skirtPos[b * 3 + 2] = z;

    skirtPos[(b + 1) * 3] = x;
    skirtPos[(b + 1) * 3 + 1] = ELEVATION.skirtBottomY;
    skirtPos[(b + 1) * 3 + 2] = z;

    const u = accLen / 22.0;
    skirtUv[b * 2] = u;
    skirtUv[b * 2 + 1] = 0.0;
    skirtUv[(b + 1) * 2] = u;
    skirtUv[(b + 1) * 2 + 1] = clamp((y - ELEVATION.skirtBottomY) / 4.5, 0.25, 1.0);
  }

  let sPtr = 0;
  for (let i = 0; i < loopLen - 1; i++) {
    const t0 = i * 2;
    const b0 = t0 + 1;
    const t1 = t0 + 2;
    const b1 = t0 + 3;
    // 验证南边(x 递增): (b0 - t0)=(0,-dy,0), (t1 - t0)=(+dx,0,0) -> (b0-t0)×(t1-t0) = (0,0,+dy*dx) 朝外(+Z)！
    skirtIdx[sPtr++] = t0;
    skirtIdx[sPtr++] = b0;
    skirtIdx[sPtr++] = t1;
    skirtIdx[sPtr++] = b0;
    skirtIdx[sPtr++] = b1;
    skirtIdx[sPtr++] = t1;
  }

  const skirtGeo = new THREE.BufferGeometry();
  skirtGeo.setAttribute('position', new THREE.BufferAttribute(skirtPos, 3));
  skirtGeo.setAttribute('uv', new THREE.BufferAttribute(skirtUv, 2));
  skirtGeo.setIndex(new THREE.BufferAttribute(skirtIdx, 1));
  skirtGeo.computeVertexNormals();

  const strataTex = createRockStrataTextures();
  const skirtMat = new THREE.MeshStandardMaterial({
    map: strataTex.map,
    normalMap: strataTex.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.9,
    metalness: 0.03,
  });

  const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
  skirtMesh.name = 'TerrainRockSkirt';
  skirtMesh.castShadow = false;
  skirtMesh.receiveShadow = true;

  return { terrainMesh, skirtMesh };
}

interface EmbankmentSample {
  x: number;
  z: number;
  /** 指向水域的法向 */
  nx: number;
  nz: number;
  topY: number;
}

function buildEmbankmentStrip(
  samples: EmbankmentSample[],
  baseY: number,
  wallBackDepth: number,
  waterDirSign: 1 | -1
): THREE.BufferGeometry {
  // 生成向湖面倾斜收分的条石墙面 + 顶部石肩 + 底部锚脚
  const n = samples.length;
  const vertRows = 3; // 0: 墙顶前缘, 1: 墙底前缘(向湖微微放坡), 2: 墙顶后沿(埋入岸坡)
  const positions = new Float32Array(n * vertRows * 3);
  const uvs = new Float32Array(n * vertRows * 2);
  const indices: number[] = [];

  let arcLen = 0;
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    if (i > 0) {
      arcLen += Math.hypot(s.x - samples[i - 1].x, s.z - samples[i - 1].z);
    }
    const u = arcLen / 1.45;
    const base = i * vertRows;

    // 0: 墙顶前缘
    positions[base * 3] = s.x;
    positions[base * 3 + 1] = s.topY;
    positions[base * 3 + 2] = s.z;
    uvs[base * 2] = u;
    uvs[base * 2 + 1] = 0.0;

    // 1: 墙底前缘（放坡 0.14u 朝湖）
    positions[(base + 1) * 3] = s.x + s.nx * 0.14;
    positions[(base + 1) * 3 + 1] = baseY;
    positions[(base + 1) * 3 + 2] = s.z + s.nz * 0.14;
    uvs[(base + 1) * 2] = u;
    uvs[(base + 1) * 2 + 1] = 1.0;

    // 2: 墙顶后沿（向岸深插 wallBackDepth）
    positions[(base + 2) * 3] = s.x - s.nx * wallBackDepth;
    positions[(base + 2) * 3 + 1] = s.topY - 0.02;
    positions[(base + 2) * 3 + 2] = s.z - s.nz * wallBackDepth;
    uvs[(base + 2) * 2] = u;
    uvs[(base + 2) * 2 + 1] = 0.22;

    if (i < n - 1) {
      const i0 = base;
      const i1 = base + vertRows;
      if (waterDirSign === -1) {
        // 前壁面朝 +N，顶石肩朝 +Y
        indices.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1);
        indices.push(i0 + 2, i0, i1 + 2, i0, i1, i1 + 2);
      } else {
        // 翻转绕序使 waterDirSign === +1 时前壁面同样朝 +N，顶石肩朝 +Y
        indices.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1);
        indices.push(i0 + 2, i1 + 2, i0, i0, i1 + 2, i1);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** 构造带顶部四边倒角的独立条石/石阶几何体（顶面 Y=0，实体底深延至 Y=-1） */
function createBeveledUnitGeometry(bevelX = 0.065, bevelY = 0.08, bevelZ = 0.065): THREE.BufferGeometry {
  const hx = 0.5;
  const hz = 0.5;
  const bx = hx - bevelX;
  const bz = hz - bevelZ;
  const by = -bevelY;
  const bot = -1.0;

  // 2 组环圈构成带倒角顶盖与垂向 plinth
  const ringTop = [
    [-bx, 0, -bz],
    [bx, 0, -bz],
    [bx, 0, bz],
    [-bx, 0, bz],
  ];
  const ringMid = [
    [-hx, by, -hz],
    [hx, by, -hz],
    [hx, by, hz],
    [-hx, by, hz],
  ];
  const ringBot = [
    [-hx, bot, -hz],
    [hx, bot, -hz],
    [hx, bot, hz],
    [-hx, bot, hz],
  ];

  const pos: number[] = [];
  const uvs: number[] = [];
  const addTri = (a: number[], b: number[], c: number[], uvScale = 1) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    uvs.push(a[0] * uvScale + 0.5, a[2] * uvScale + 0.5);
    uvs.push(b[0] * uvScale + 0.5, b[2] * uvScale + 0.5);
    uvs.push(c[0] * uvScale + 0.5, c[2] * uvScale + 0.5);
  };
  const addQuad = (a: number[], b: number[], c: number[], d: number[]) => {
    // 逆时针对外: a -> b -> c, a -> c -> d
    addTri(a, b, c);
    addTri(a, c, d);
  };

  // 顶面 (y=0, +Y)
  addQuad(ringTop[0], ringTop[3], ringTop[2], ringTop[1]);

  // 4 个斜向倒角面 & 4 个竖向侧面
  for (let i = 0; i < 4; i++) {
    const ni = (i + 1) % 4;
    addQuad(ringTop[i], ringTop[ni], ringMid[ni], ringMid[i]);
    addQuad(ringMid[i], ringMid[ni], ringBot[ni], ringBot[i]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/**
 * 生成北岸、东堤、南湖岛与西堤（含玉带桥水道缺口）条石驳岸与独立压顶条石
 */
function buildAshlarEmbankments(ashlarTex: ReturnType<typeof createAshlarStoneTextures>): {
  wallMesh: THREE.Mesh;
  capstonesMesh: THREE.InstancedMesh;
  capstonesCount: number;
} {
  const wallGeos: THREE.BufferGeometry[] = [];
  const capstoneMatrices: Array<{ x: number; y: number; z: number; yaw: number; len: number; depth: number; h: number }> = [];

  const pushPolylineSamples = (
    rawPts: Array<{ x: number; z: number; topY: number }>,
    waterDirSign: 1 | -1,
    capstoneLen = 0.52,
    capstoneDepth = 0.42,
    capstoneHeight = 0.14
  ) => {
    const samples: EmbankmentSample[] = [];
    for (let i = 0; i < rawPts.length; i++) {
      const pPrev = rawPts[Math.max(0, i - 1)];
      const pNext = rawPts[Math.min(rawPts.length - 1, i + 1)];
      const tx = pNext.x - pPrev.x;
      const tz = pNext.z - pPrev.z;
      const len = Math.hypot(tx, tz) || 1;
      const utx = tx / len;
      const utz = tz / len;
      // 若沿 +X 前进，左法向 (-utz, utx) 指向 -Z，右法向 (utz, -utx) 指向 +Z(湖面)
      const nx = utz * waterDirSign;
      const nz = -utx * waterDirSign;
      samples.push({ x: rawPts[i].x, z: rawPts[i].z, nx, nz, topY: rawPts[i].topY });
    }
    wallGeos.push(buildEmbankmentStrip(samples, -0.58, 0.42, waterDirSign));

    // 按固定弧长步距排布独立倒角压顶条石
    const segLens: number[] = [0];
    let total = 0;
    for (let i = 1; i < samples.length; i++) {
      total += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z);
      segLens.push(total);
    }
    const count = Math.max(2, Math.floor(total / capstoneLen));
    const actualLen = total / count;
    let cursor = 0;
    for (let k = 0; k < count; k++) {
      const targetS = (k + 0.5) * actualLen;
      while (cursor < segLens.length - 2 && segLens[cursor + 1] < targetS) cursor++;
      const s0 = segLens[cursor];
      const s1 = segLens[cursor + 1];
      const f = s1 > s0 ? (targetS - s0) / (s1 - s0) : 0;
      const a = samples[cursor];
      const b = samples[cursor + 1];
      const cx = a.x + (b.x - a.x) * f;
      const cz = a.z + (b.z - a.z) * f;
      const cy = a.topY + (b.topY - a.topY) * f;
      const nx = a.nx + (b.nx - a.nx) * f;
      const nz = a.nz + (b.nz - a.nz) * f;
      const yaw = Math.atan2(nx, nz);

      capstoneMatrices.push({
        x: cx - nx * 0.14,
        y: cy + 0.032,
        z: cz - nz * 0.14,
        yaw,
        len: actualLen * 0.96,
        depth: capstoneDepth,
        h: capstoneHeight,
      });
    }
  };

  // 1a. 北岸西段 (-28.8 -> -1.45)
  {
    const pts: Array<{ x: number; z: number; topY: number }> = [];
    for (let i = 0; i <= 64; i++) {
      const x = -28.8 + (27.35 * i) / 64;
      const z = getNorthShoreZ(x) - 0.14;
      pts.push({ x, z, topY: clamp(getSculptedHeight(x, z - 0.28) + 0.03, 0.36, 0.48) });
    }
    pushPolylineSamples(pts, -1, 0.48, 0.44, 0.16);
  }
  // 1b. 北岸中轴码头石台 (-1.45 -> +1.45)
  {
    const pts: Array<{ x: number; z: number; topY: number }> = [];
    for (let i = 0; i <= 8; i++) {
      const x = -1.45 + (2.9 * i) / 8;
      const z = getNorthShoreZ(x) + 0.35;
      pts.push({ x, z, topY: LANDMARKS.pier.topY });
    }
    pushPolylineSamples(pts, -1, 0.48, 0.48, 0.16);
  }
  // 1c. 北岸东段 (+1.45 -> +24.1)
  {
    const pts: Array<{ x: number; z: number; topY: number }> = [];
    for (let i = 0; i <= 54; i++) {
      const x = 1.45 + (22.65 * i) / 54;
      const z = getNorthShoreZ(x) - 0.14;
      pts.push({ x, z, topY: clamp(getSculptedHeight(x, z - 0.28) + 0.03, 0.36, 0.48) });
    }
    pushPolylineSamples(pts, -1, 0.48, 0.44, 0.16);
  }

  // 1d. 排云门码头东西两侧折角石壁封口（消除 Cam-2 左下角断口）
  {
    const zWestStart = getNorthShoreZ(-1.45) - 0.14;
    const zWestEnd = getNorthShoreZ(-1.45) + 0.35;
    const zEastStart = getNorthShoreZ(1.45) - 0.14;
    const zEastEnd = getNorthShoreZ(1.45) + 0.35;
    const westSidePts: Array<{ x: number; z: number; topY: number }> = [];
    const eastSidePts: Array<{ x: number; z: number; topY: number }> = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      westSidePts.push({ x: -1.45, z: zWestStart + (zWestEnd - zWestStart) * t, topY: LANDMARKS.pier.topY });
      eastSidePts.push({ x: 1.45, z: zEastStart + (zEastEnd - zEastStart) * t, topY: LANDMARKS.pier.topY });
    }
    pushPolylineSamples(westSidePts, -1, 0.24, 0.36, 0.15);
    pushPolylineSamples(eastSidePts, 1, 0.24, 0.36, 0.15);
  }

  // 2. 东堤 (-7.2 -> +23.8)，沿 z 递增，水在西侧(-X) -> waterDirSign = -1
  {
    const pts: Array<{ x: number; z: number; topY: number }> = [];
    for (let i = 0; i <= 66; i++) {
      const z = -7.2 + (31.0 * i) / 66;
      const x = getEastDikeX(z) - 0.32;
      pts.push({ x, z, topY: Math.max(0.46, getSculptedHeight(x + 0.4, z) + 0.03) });
    }
    pushPolylineSamples(pts, -1, 0.52, 0.42, 0.16);
  }

  // 3. 南湖岛环岛条石驳岸（逆时针采样，朝外辐射方向指向湖面 -> waterDirSign = +1）
  {
    const segs = 56;
    const pts: Array<{ x: number; z: number; topY: number }> = [];
    const r = LANDMARKS.southLakeIsland.shoreRadius - 0.12;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const x = LANDMARKS.southLakeIsland.x + Math.cos(a) * r;
      const z = LANDMARKS.southLakeIsland.z + Math.sin(a) * r;
      pts.push({ x, z, topY: Math.max(0.36, getSculptedHeight(x - Math.cos(a) * 0.24, z - Math.sin(a) * 0.24) + 0.03) });
    }
    pushPolylineSamples(pts, 1, 0.46, 0.4, 0.15);
  }

  // 4. 西堤两侧驳岸（北段 -6.6 -> +0.55，南段 +3.45 -> +23.8，严格保留玉带桥水渠通航并接实北岸）
  const westHalfW = 0.86;
  const addWestDikeSegment = (zStart: number, zEnd: number, steps: number) => {
    const eastFacePts: Array<{ x: number; z: number; topY: number }> = [];
    const westFacePts: Array<{ x: number; z: number; topY: number }> = [];
    for (let i = 0; i <= steps; i++) {
      const z = zStart + ((zEnd - zStart) * i) / steps;
      const xc = getWestDikeX(z);
      const topY = clamp(getSculptedHeight(xc, z) + 0.03, 0.38, 0.5);
      eastFacePts.push({ x: xc + westHalfW, z, topY });
      westFacePts.push({ x: xc - westHalfW, z, topY });
    }
    // 东侧岸面对 +X(昆明湖内湖) -> waterDirSign = +1；西侧岸面对 -X(西湖外侧) -> waterDirSign = -1
    pushPolylineSamples(eastFacePts, 1, 0.48, 0.36, 0.14);
    pushPolylineSamples(westFacePts, -1, 0.48, 0.36, 0.14);
  };
  addWestDikeSegment(-6.6, 0.55, 18);
  addWestDikeSegment(3.45, 23.8, 44);

  // 4b. 玉带桥水渠南北端石砌驳岸封头（z = 0.55 与 z = 3.45，衔接东西两侧驳岸）
  const addWestCanalAbutment = (zPos: number, waterDirSign: 1 | -1) => {
    const xc = getWestDikeX(zPos);
    const topY = clamp(getSculptedHeight(xc, zPos) + 0.03, 0.38, 0.5);
    const pts: Array<{ x: number; z: number; topY: number }> = [];
    for (let i = 0; i <= 6; i++) {
      const x = xc - westHalfW + (westHalfW * 2 * i) / 6;
      pts.push({ x, z: zPos, topY });
    }
    pushPolylineSamples(pts, waterDirSign, 0.44, 0.36, 0.14);
  };
  // 北端面(z=0.55) 朝南水渠(+Z) -> waterDirSign = -1；南端面(z=3.45) 朝北水渠(-Z) -> waterDirSign = +1
  addWestCanalAbutment(0.55, -1);
  addWestCanalAbutment(3.45, 1);

  const wallGeo = mergeGeometries(wallGeos);
  const wallMat = new THREE.MeshStandardMaterial({
    map: ashlarTex.map,
    normalMap: ashlarTex.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: ashlarTex.roughnessMap,
    roughness: 0.85,
    metalness: 0.03,
    color: 0xc2c0b8,
  });
  enhanceMaterial(wallMat, { snow: true, snowThreshold: 0.56, snowStrength: 0.72 });

  const wallMesh = new THREE.Mesh(wallGeo, wallMat);
  wallMesh.name = 'AshlarEmbankmentWalls';
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;

  // 独立倒角压顶条石 InstancedMesh
  const capGeo = createBeveledUnitGeometry(0.06, 0.14, 0.08);
  const capMat = new THREE.MeshStandardMaterial({
    map: ashlarTex.map,
    normalMap: ashlarTex.normalMap,
    normalScale: new THREE.Vector2(0.65, 0.65),
    roughness: 0.78,
    metalness: 0.04,
  });
  enhanceMaterial(capMat, { snow: true, snowThreshold: 0.52, snowStrength: 0.85 });

  const capstonesMesh = new THREE.InstancedMesh(capGeo, capMat, capstoneMatrices.length);
  capstonesMesh.name = 'EmbankmentCapstones';
  capstonesMesh.castShadow = false;
  capstonesMesh.receiveShadow = true;
  capstonesMesh.userData.excludeFromAO = true;

  const dummy = new THREE.Object3D();
  const cTmp = new THREE.Color();
  for (let i = 0; i < capstoneMatrices.length; i++) {
    const m = capstoneMatrices[i];
    dummy.position.set(m.x, m.y, m.z);
    dummy.rotation.set(0, m.yaw, 0);
    dummy.scale.set(m.len, m.h + 0.18, m.depth);
    dummy.updateMatrix();
    capstonesMesh.setMatrixAt(i, dummy.matrix);

    const tone = 0.84 + ((Math.sin(i * 19.37) * 0.5 + 0.5) * 0.13);
    cTmp.setRGB(tone * 1.0, tone * 0.99, tone * 0.95, THREE.SRGBColorSpace);
    capstonesMesh.setColorAt(i, cTmp);
  }
  capstonesMesh.instanceMatrix.needsUpdate = true;
  if (capstonesMesh.instanceColor) capstonesMesh.instanceColor.needsUpdate = true;

  return { wallMesh, capstonesMesh, capstonesCount: capstoneMatrices.length };
}

/**
 * 沿 5 条路径生成 420 级独立倒角青石阶 + 两侧压实垂带石护边
 */
function buildStoneStaircases(ashlarTex: ReturnType<typeof createAshlarStoneTextures>): {
  stepsInstancedMesh: THREE.InstancedMesh;
  curbsMesh: THREE.Mesh;
  stepsCount: number;
} {
  const totalSteps = STAIR_PATHS.reduce((acc, p) => acc + p.steps, 0);
  const stepGeo = createBeveledUnitGeometry(0.05, 0.11, 0.085);
  const stepMat = new THREE.MeshStandardMaterial({
    normalMap: ashlarTex.normalMap,
    normalScale: new THREE.Vector2(0.32, 0.32),
    roughness: 0.78,
    metalness: 0.04,
  });
  enhanceMaterial(stepMat, { snow: true, snowThreshold: 0.55, snowStrength: 0.88 });

  const stepsMesh = new THREE.InstancedMesh(stepGeo, stepMat, totalSteps);
  stepsMesh.name = 'StoneSteps420';
  stepsMesh.castShadow = true;
  stepsMesh.receiveShadow = true;

  const curbGeos: THREE.BufferGeometry[] = [];
  const dummy = new THREE.Object3D();
  const cTmp = new THREE.Color();
  let stepIdx = 0;

  for (const path of STAIR_PATHS) {
    const pts3 = path.points.map(([x, z]) => new THREE.Vector3(x, 0, z));
    let totalLen = 0;
    let curve: THREE.CatmullRomCurve3 | null = null;

    if (path.curved) {
      curve = new THREE.CatmullRomCurve3(pts3, false, 'catmullrom', 0.45);
      totalLen = curve.getLength();
    } else {
      totalLen = pts3[0].distanceTo(pts3[1]);
    }

    const pitch = totalLen / path.steps;
    const stepDepth = pitch * 1.08;
    const halfW = path.width * 0.5;
    const halfD = stepDepth * 0.5;

    const leftWallPts: Array<{ x: number; z: number; topY: number; botY: number }> = [];
    const rightWallPts: Array<{ x: number; z: number; topY: number; botY: number }> = [];

    for (let i = 0; i < path.steps; i++) {
      const u = (i + 0.5) / path.steps;
      let pos: THREE.Vector3;
      let tan: THREE.Vector3;
      if (curve) {
        pos = curve.getPointAt(u);
        tan = curve.getTangentAt(u).normalize();
      } else {
        pos = new THREE.Vector3().lerpVectors(pts3[0], pts3[1], u);
        tan = new THREE.Vector3().subVectors(pts3[1], pts3[0]).normalize();
      }

      const rightX = -tan.z;
      const rightZ = tan.x;

      const hCenter = getSculptedHeight(pos.x, pos.z);
      const hL = getSculptedHeight(pos.x - rightX * halfW, pos.z - rightZ * halfW);
      const hR = getSculptedHeight(pos.x + rightX * halfW, pos.z + rightZ * halfW);
      const hF = getSculptedHeight(pos.x + tan.x * halfD, pos.z + tan.z * halfD);
      const hB = getSculptedHeight(pos.x - tan.x * halfD, pos.z - tan.z * halfD);

      const minEdge = Math.min(hCenter, hL, hR, hF, hB);
      // 既压住两侧斜坡草土，又避免横坡过高抬离地面；底脚深扎山体
      const yTop = Math.max(hCenter + 0.026, Math.max(hL, hR) + 0.008);
      const embedDepth = Math.max(0.28, yTop - minEdge + 0.22);
      const yaw = Math.atan2(tan.x, tan.z);

      dummy.position.set(pos.x, yTop, pos.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(path.width, embedDepth, stepDepth);
      dummy.updateMatrix();
      stepsMesh.setMatrixAt(stepIdx, dummy.matrix);

      // 以 sRGB 空间赋值真实清雅青灰花岗岩微色差（杜绝线性空间过曝泛白）
      const jitter = Math.sin(stepIdx * 12.9898 + 4.1414) * 43758.5453;
      const frac = jitter - Math.floor(jitter);
      const shade = 0.54 + frac * 0.1;
      cTmp.setRGB(shade * 1.0, shade * 0.99, shade * 0.94, THREE.SRGBColorSpace);
      stepsMesh.setColorAt(stepIdx, cTmp);
      stepIdx++;

      // 两侧垂带石严格与踏步齐平微高出 0.032u，形成对称整洁石阶边框
      const curbOffset = halfW + 0.044;
      const curbTop = yTop + 0.032;
      leftWallPts.push({
        x: pos.x - rightX * curbOffset,
        z: pos.z - rightZ * curbOffset,
        topY: curbTop,
        botY: Math.min(hL, yTop) - 0.24,
      });
      rightWallPts.push({
        x: pos.x + rightX * curbOffset,
        z: pos.z + rightZ * curbOffset,
        topY: curbTop,
        botY: Math.min(hR, yTop) - 0.24,
      });
    }

    const buildCurbRibbon = (pts: typeof leftWallPts, sideSign: 1 | -1) => {
      const m = pts.length;
      const halfCurb = 0.044;
      const segPos: number[] = [];
      const segUv: number[] = [];
      const segIdx: number[] = [];

      const pushVert = (vx: number, vy: number, vz: number, uCoord: number, vCoord: number) => {
        segPos.push(vx, vy, vz);
        segUv.push(uCoord, vCoord);
      };

      for (let i = 0; i < m; i++) {
        const pPrev = pts[Math.max(0, i - 1)];
        const pNext = pts[Math.min(m - 1, i + 1)];
        const tx = pNext.x - pPrev.x;
        const tz = pNext.z - pPrev.z;
        const tLen = Math.hypot(tx, tz) || 1;
        const rx = (-tz / tLen) * sideSign;
        const rz = (tx / tLen) * sideSign;
        const p = pts[i];
        const uCoord = i * 0.16;

        pushVert(p.x - rx * halfCurb, p.topY, p.z - rz * halfCurb, uCoord, 0);
        pushVert(p.x + rx * halfCurb, p.topY, p.z + rz * halfCurb, uCoord, 0.35);
        pushVert(p.x + rx * halfCurb, p.botY, p.z + rz * halfCurb, uCoord, 1.0);
        pushVert(p.x - rx * halfCurb, p.botY, p.z - rz * halfCurb, uCoord, 1.0);

        if (i < m - 1) {
          const a = i * 4;
          const b = (i + 1) * 4;
          if (sideSign === 1) {
            segIdx.push(a + 0, a + 1, b + 0, a + 1, b + 1, b + 0);
            segIdx.push(a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
            segIdx.push(a + 3, a + 0, b + 3, a + 0, b + 0, b + 3);
          } else {
            segIdx.push(a + 1, a + 0, b + 1, a + 0, b + 0, b + 1);
            segIdx.push(a + 2, a + 1, b + 2, a + 1, b + 1, b + 2);
            segIdx.push(a + 0, a + 3, b + 0, a + 3, b + 3, b + 0);
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(segPos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(segUv, 2));
      g.setIndex(segIdx);
      g.computeVertexNormals();
      return g;
    };

    curbGeos.push(buildCurbRibbon(leftWallPts, -1));
    curbGeos.push(buildCurbRibbon(rightWallPts, 1));
  }

  stepsMesh.instanceMatrix.needsUpdate = true;
  if (stepsMesh.instanceColor) stepsMesh.instanceColor.needsUpdate = true;

  const curbsGeo = mergeGeometries(curbGeos);
  const curbsMat = new THREE.MeshStandardMaterial({
    normalMap: ashlarTex.normalMap,
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 0.82,
    metalness: 0.04,
    color: 0x7a7970,
  });
  enhanceMaterial(curbsMat, { snow: true, snowThreshold: 0.54, snowStrength: 0.86 });

  const curbsMesh = new THREE.Mesh(curbsGeo, curbsMat);
  curbsMesh.name = 'StaircaseCheekCurbs';
  curbsMesh.castShadow = false;
  curbsMesh.receiveShadow = true;

  return { stepsInstancedMesh: stepsMesh, curbsMesh, stepsCount: stepIdx };
}

/** 万寿山陡脊自然太湖/青灰岩露头（严格通过 isPlacementBlocked 避开步道与建筑） */
function buildRidgeOutcrops(ashlarTex: ReturnType<typeof createAshlarStoneTextures>): THREE.InstancedMesh {
  const geo = new THREE.IcosahedronGeometry(0.42, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const warp = 0.82 + 0.32 * simplex2D(vx * 3.1 + vy * 2.4, vz * 3.7);
    pos.setXYZ(i, vx * 1.25 * warp, vy * 0.56 * warp, vz * 1.05 * warp);
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    normalMap: ashlarTex.normalMap,
    normalScale: new THREE.Vector2(0.65, 0.65),
    roughness: 0.92,
    metalness: 0.02,
  });
  enhanceMaterial(mat, { snow: true, snowThreshold: 0.48, snowStrength: 0.9 });

  const placements: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; tone: number }> = [];
  let seed = 0x91827364;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let attempt = 0; attempt < 900 && placements.length < 44; attempt++) {
    const x = -25.0 + rand() * 50.0;
    const z = -22.2 + rand() * 16.5;
    if (isPlacementBlocked(x, z, 1.05)) continue;
    const y = getSculptedHeight(x, z);
    if (y < 2.1) continue;
    const [, ny] = getTerrainNormal(x, z, 0.18);
    const curv = getTerrainCurvature(x, z, 0.38);
    if (1 - ny < 0.22 && curv < 0.02) continue;

    placements.push({
      x,
      y: y - 0.2,
      z,
      sx: 0.7 + rand() * 0.75,
      sy: 0.48 + rand() * 0.48,
      sz: 0.65 + rand() * 0.7,
      ry: rand() * Math.PI * 2,
      tone: 0.36 + rand() * 0.11,
    });
  }

  const mesh = new THREE.InstancedMesh(geo, mat, placements.length);
  mesh.name = 'RidgeOutcrops';
  mesh.castShadow = false;
  mesh.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const cTmp = new THREE.Color();
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0.14, p.ry, 0.1);
    dummy.scale.set(p.sx, p.sy, p.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    cTmp.setRGB(p.tone * 1.02, p.tone * 1.0, p.tone * 0.93, THREE.SRGBColorSpace);
    mesh.setColorAt(i, cTmp);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

export function buildTrayAndTerrain(): TrayAndTerrainResult {
  const group = new THREE.Group();
  group.name = 'TrayAndTerrainGroup';

  // 1. 底部多级高斯羽化接触阴影（y = -1.53）
  const shadowGeo = new THREE.PlaneGeometry(78.0, 66.0);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: createContactShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.72,
  });
  const contactShadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadowMesh.name = 'ContactShadow';
  contactShadowMesh.position.y = ELEVATION.contactShadowY;
  contactShadowMesh.renderOrder = -1;
  contactShadowMesh.userData.excludeFromAO = true;
  group.add(contactShadowMesh);

  // 2. 薄边圆角紫檀木盘 + 内沿暗金嵌线
  const { trayMesh, inlayMesh } = buildWoodenTrayAndInlay();
  group.add(trayMesh);
  group.add(inlayMesh);

  // 3. 256×208 雕刻地形 + 闭合岩土围裙
  const { terrainMesh, skirtMesh } = buildSculptedTerrainAndSkirt();
  group.add(terrainMesh);
  group.add(skirtMesh);

  // 4. 青石条石驳岸（连续石墙 + 独立压顶条石）
  const ashlarTex = createAshlarStoneTextures();
  const { wallMesh, capstonesMesh, capstonesCount } = buildAshlarEmbankments(ashlarTex);
  group.add(wallMesh);
  group.add(capstonesMesh);

  // 5. 5 条路径 420 级独立石阶 + 两侧垂带石
  const { stepsInstancedMesh, curbsMesh, stepsCount } = buildStoneStaircases(ashlarTex);
  group.add(stepsInstancedMesh);
  group.add(curbsMesh);

  // 6. 万寿山陡脊自然露头石
  const outcropsMesh = buildRidgeOutcrops(ashlarTex);
  group.add(outcropsMesh);

  return {
    group,
    contactShadowMesh,
    stepsInstancedMesh,
    stepsCount,
    capstonesCount,
  };
}
