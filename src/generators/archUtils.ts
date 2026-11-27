import * as THREE from 'three';

/** 合并多个 BufferGeometry（统一转为带法线、UV 的索引网格，保留一致属性并释放输入几何） */
export function mergeBufferGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const valid = geos.filter((g) => g.attributes.position && g.attributes.position.count > 0);
  if (valid.length === 0) {
    return new THREE.BufferGeometry();
  }

  let totalVerts = 0;
  let totalIndices = 0;
  for (const g of valid) {
    if (!g.attributes.normal) g.computeVertexNormals();
    totalVerts += g.attributes.position.count;
    totalIndices += g.index ? g.index.count : g.attributes.position.count;
  }

  const pos = new Float32Array(totalVerts * 3);
  const norm = new Float32Array(totalVerts * 3);
  const uv = new Float32Array(totalVerts * 2);
  const idx = new Uint32Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;
  for (const g of valid) {
    const pAttr = g.attributes.position;
    const nAttr = g.attributes.normal;
    const uAttr = g.attributes.uv;
    const count = pAttr.count;

    for (let i = 0; i < count; i++) {
      pos[(vOffset + i) * 3] = pAttr.getX(i);
      pos[(vOffset + i) * 3 + 1] = pAttr.getY(i);
      pos[(vOffset + i) * 3 + 2] = pAttr.getZ(i);

      norm[(vOffset + i) * 3] = nAttr ? nAttr.getX(i) : 0;
      norm[(vOffset + i) * 3 + 1] = nAttr ? nAttr.getY(i) : 1;
      norm[(vOffset + i) * 3 + 2] = nAttr ? nAttr.getZ(i) : 0;

      uv[(vOffset + i) * 2] = uAttr ? uAttr.getX(i) : 0;
      uv[(vOffset + i) * 2 + 1] = uAttr ? uAttr.getY(i) : 0;
    }

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
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/** 创建带真实尺度 UV 的长方体 */
export function createBox(
  w: number,
  h: number,
  d: number,
  cx: number,
  cy: number,
  cz: number,
  uvScale = 1.0
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const norm = g.attributes.normal;
  const uv = g.attributes.uv;
  if (uv && norm && uvScale !== 0) {
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(norm.getX(i));
      const ny = Math.abs(norm.getY(i));
      let su = w;
      let sv = h;
      if (nx > 0.5) {
        su = d;
        sv = h;
      } else if (ny > 0.5) {
        su = w;
        sv = d;
      }
      uv.setXY(i, uv.getX(i) * su * uvScale, uv.getY(i) * sv * uvScale);
    }
  }
  g.translate(cx, cy, cz);
  return g;
}

/** 创建收分青砖台基四棱台（底面位于 bottomY） */
export function createTaperedPrism(
  bottomW: number,
  bottomD: number,
  topW: number,
  topD: number,
  height: number,
  cx: number,
  bottomY: number,
  cz: number,
  uvScale = 0.65
): THREE.BufferGeometry {
  const bw = bottomW * 0.5;
  const bd = bottomD * 0.5;
  const tw = topW * 0.5;
  const td = topD * 0.5;
  const y0 = bottomY;
  const y1 = bottomY + height;

  const pos: number[] = [];
  const uv: number[] = [];

  const pushQuad = (
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
    uSpan: number,
    vSpan: number
  ) => {
    // 逆时针对外: p0 -> p1 -> p2, p0 -> p2 -> p3
    pos.push(
      p0[0], p0[1], p0[2],
      p1[0], p1[1], p1[2],
      p2[0], p2[1], p2[2],
      p0[0], p0[1], p0[2],
      p2[0], p2[1], p2[2],
      p3[0], p3[1], p3[2]
    );
    uv.push(
      0, 0,
      uSpan * uvScale, 0,
      uSpan * uvScale, vSpan * uvScale,
      0, 0,
      uSpan * uvScale, vSpan * uvScale,
      0, vSpan * uvScale
    );
  };

  // 南(+Z)
  pushQuad([cx - bw, y0, cz + bd], [cx + bw, y0, cz + bd], [cx + tw, y1, cz + td], [cx - tw, y1, cz + td], bottomW, height);
  // 东(+X)
  pushQuad([cx + bw, y0, cz + bd], [cx + bw, y0, cz - bd], [cx + tw, y1, cz - td], [cx + tw, y1, cz + td], bottomD, height);
  // 北(-Z)
  pushQuad([cx + bw, y0, cz - bd], [cx - bw, y0, cz - bd], [cx - tw, y1, cz - td], [cx + tw, y1, cz - td], bottomW, height);
  // 西(-X)
  pushQuad([cx - bw, y0, cz - bd], [cx - bw, y0, cz + bd], [cx - tw, y1, cz + td], [cx - tw, y1, cz - td], bottomD, height);
  // 顶(+Y)
  pushQuad([cx - tw, y1, cz + td], [cx + tw, y1, cz + td], [cx + tw, y1, cz - td], [cx - tw, y1, cz - td], topW, topD);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export interface OctagonalRoofOptions {
  sides?: number;
  cx: number;
  cz: number;
  innerR: number;
  outerR: number;
  baseY: number;
  peakY: number;
  cornerLift: number;
  cornerOut: number;
  eaveThickness?: number;
  rotationY?: number;
  uvScale?: number;
}

export interface RoofParts {
  mainTileGeo: THREE.BufferGeometry;
  trimTileGeo: THREE.BufferGeometry;
  ridgeGeo: THREE.BufferGeometry;
  soffitGeo: THREE.BufferGeometry;
}

/**
 * 构建清式举折起翘八角/六角重檐与攒尖顶：
 * - 明黄/灰主瓦（mainTileGeo）与翠绿剪边（trimTileGeo）物理分离
 * - 显性起翘翼角、立体垂脊（ridgeGeo）及封闭檐底仰面（soffitGeo）
 */
export function buildOctagonalRoofParts(opts: OctagonalRoofOptions): RoofParts {
  const sides = opts.sides ?? 8;
  const segR = 8;
  const trimRows = 2; // 最外 2 段瓦楞为翠绿琉璃剪边
  const segT = 6;
  const thick = opts.eaveThickness ?? 0.065;
  const rot = opts.rotationY ?? 0;
  const uvScale = opts.uvScale ?? 2.4;

  const mainPos: number[] = [];
  const mainUv: number[] = [];
  const trimPos: number[] = [];
  const trimUv: number[] = [];
  const sofPos: number[] = [];
  const sofUv: number[] = [];
  const ridgeGeos: THREE.BufferGeometry[] = [];

  const evalPoint = (a0: number, a1: number, u: number, v: number): [number, number, number] => {
    const c0x = Math.cos(a0);
    const c0z = Math.sin(a0);
    const c1x = Math.cos(a1);
    const c1z = Math.sin(a1);
    // 沿直线棱边插值以形成挺拔的多边形檐口
    const dirX = c0x + (c1x - c0x) * v;
    const dirZ = c0z + (c1z - c0z) * v;
    const cornerWeight = Math.pow(Math.abs(v - 0.5) * 2.0, 2.05);
    const r = opts.innerR + (opts.outerR - opts.innerR) * u + opts.cornerOut * Math.pow(u, 1.85) * cornerWeight;
    const ySlope = opts.peakY - (opts.peakY - opts.baseY) * Math.pow(u, 0.78);
    const yLift = opts.cornerLift * Math.pow(u, 1.85) * cornerWeight;
    return [opts.cx + dirX * r, ySlope + yLift, opts.cz + dirZ * r];
  };

  const pushTri = (
    pArr: number[],
    uArr: number[],
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    ua: [number, number],
    ub: [number, number],
    uc: [number, number]
  ) => {
    pArr.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    uArr.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  };

  for (let s = 0; s < sides; s++) {
    const a0 = rot + (s / sides) * Math.PI * 2;
    const a1 = rot + ((s + 1) / sides) * Math.PI * 2;
    const edgeSpan = 2 * opts.outerR * Math.sin(Math.PI / sides);

    for (let ir = 0; ir < segR; ir++) {
      const u0 = ir / segR;
      const u1 = (ir + 1) / segR;
      const isTrim = ir >= segR - trimRows;
      const tPos = isTrim ? trimPos : mainPos;
      const tUv = isTrim ? trimUv : mainUv;

      for (let it = 0; it < segT; it++) {
        const v0 = it / segT;
        const v1 = (it + 1) / segT;

        const p00 = evalPoint(a0, a1, u0, v0);
        const p01 = evalPoint(a0, a1, u0, v1);
        const p10 = evalPoint(a0, a1, u1, v0);
        const p11 = evalPoint(a0, a1, u1, v1);

        const uv00: [number, number] = [v0 * edgeSpan * uvScale, (1 - u0) * (opts.outerR - opts.innerR) * uvScale];
        const uv01: [number, number] = [v1 * edgeSpan * uvScale, (1 - u0) * (opts.outerR - opts.innerR) * uvScale];
        const uv10: [number, number] = [v0 * edgeSpan * uvScale, (1 - u1) * (opts.outerR - opts.innerR) * uvScale];
        const uv11: [number, number] = [v1 * edgeSpan * uvScale, (1 - u1) * (opts.outerR - opts.innerR) * uvScale];

        // 顶瓦面 (+Y / +R): (p00 -> p01 -> p10) 与 (p01 -> p11 -> p10)
        pushTri(tPos, tUv, p00, p01, p10, uv00, uv01, uv10);
        pushTri(tPos, tUv, p01, p11, p10, uv01, uv11, uv10);

        // 封闭檐底仰面 (-Y): 下移 thick，翻转绕序
        const b00: [number, number, number] = [p00[0], p00[1] - thick, p00[2]];
        const b01: [number, number, number] = [p01[0], p01[1] - thick, p01[2]];
        const b10: [number, number, number] = [p10[0], p10[1] - thick, p10[2]];
        const b11: [number, number, number] = [p11[0], p11[1] - thick, p11[2]];
        pushTri(sofPos, sofUv, b00, b10, b01, uv00, uv10, uv01);
        pushTri(sofPos, sofUv, b01, b10, b11, uv01, uv10, uv11);

        // 外檐立面封边（最外环）
        if (ir === segR - 1) {
          pushTri(tPos, tUv, p10, p11, b10, uv10, uv11, [uv10[0], uv10[1] - 0.15]);
          pushTri(tPos, tUv, p11, b11, b10, uv11, [uv11[0], uv11[1] - 0.15], [uv10[0], uv10[1] - 0.15]);
        }
      }
    }

    // 沿每道屋脊生成立体垂脊脊线
    const ridgePts: THREE.Vector3[] = [];
    for (let ir = 0; ir <= segR; ir++) {
      const p = evalPoint(a0, a1, ir / segR, 0);
      ridgePts.push(new THREE.Vector3(p[0], p[1] + 0.025, p[2]));
    }
    for (let i = 0; i < ridgePts.length - 1; i++) {
      const A = ridgePts[i];
      const B = ridgePts[i + 1];
      const mid = new THREE.Vector3().addVectors(A, B).multiplyScalar(0.5);
      const len = A.distanceTo(B) + 0.02;
      const bar = new THREE.BoxGeometry(0.055, 0.055, len);
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3().subVectors(B, A).normalize()
      );
      bar.applyQuaternion(q);
      bar.translate(mid.x, mid.y, mid.z);
      ridgeGeos.push(bar);
    }
    // 翼角翘尖小脊兽
    const tip = ridgePts[ridgePts.length - 1];
    ridgeGeos.push(createBox(0.065, 0.085, 0.065, tip.x, tip.y + 0.035, tip.z, 1.0));
  }

  const makeGeo = (p: number[], u: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
    g.computeVertexNormals();
    return g;
  };

  return {
    mainTileGeo: makeGeo(mainPos, mainUv),
    trimTileGeo: makeGeo(trimPos, trimUv),
    ridgeGeo: mergeBufferGeometries(ridgeGeos),
    soffitGeo: makeGeo(sofPos, sofUv),
  };
}

export interface XieshanRoofOptions {
  cx: number;
  cz: number;
  width: number;
  depth: number;
  baseY: number;
  ridgeY: number;
  ridgeLen?: number;
  cornerLift?: number;
  cornerOut?: number;
  eaveThickness?: number;
  rotationY?: number;
  uvScale?: number;
  /** 若为重檐下围檐，传入内圈宽深以形成四坡围裙檐 */
  innerCutW?: number;
  innerCutD?: number;
}

export interface XieshanRoofParts extends RoofParts {
  gableGeo: THREE.BufferGeometry;
}

/**
 * 构建清式重檐/单檐歇山顶（含举折弧坡、四翼角起翘、正脊吻兽、垂脊及山花板）
 */
export function buildXieshanRoofParts(opts: XieshanRoofOptions): XieshanRoofParts {
  const hw = opts.width * 0.5;
  const hd = opts.depth * 0.5;
  const rHalf = (opts.ridgeLen ?? opts.width * 0.52) * 0.5;
  const lift = opts.cornerLift ?? 0.14;
  const cOut = opts.cornerOut ?? 0.16;
  const thick = opts.eaveThickness ?? 0.06;
  const uvScale = opts.uvScale ?? 2.4;
  const segU = 7;
  const segV = 7;
  const trimRows = 2;

  const mainPos: number[] = [];
  const mainUv: number[] = [];
  const trimPos: number[] = [];
  const trimUv: number[] = [];
  const sofPos: number[] = [];
  const sofUv: number[] = [];
  const ridgeGeos: THREE.BufferGeometry[] = [];
  const gableGeos: THREE.BufferGeometry[] = [];

  const isSkirt = Boolean(opts.innerCutW && opts.innerCutD);
  const ihw = (opts.innerCutW ?? 0) * 0.5;
  const ihd = (opts.innerCutD ?? 0) * 0.5;

  const pushTri = (
    pArr: number[],
    uArr: number[],
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    ua: [number, number],
    ub: [number, number],
    uc: [number, number]
  ) => {
    pArr.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    uArr.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  };

  // 将任意局部四边形网格按 举折 + 翼角起翘 生成屋瓦、剪边、檐底仰面
  const emitTrapezoidSlope = (
    topA: [number, number, number],
    topB: [number, number, number],
    botA: [number, number, number],
    botB: [number, number, number],
    outDirA: [number, number],
    outDirB: [number, number],
    spanW: number,
    spanR: number
  ) => {
    const evalUV = (u: number, v: number): [number, number, number] => {
      // v=0 在 A(左), v=1 在 B(右); u=0 在顶脊, u=1 在外檐
      const tx = topA[0] + (topB[0] - topA[0]) * v;
      const ty = topA[1] + (topB[1] - topA[1]) * v;
      const tz = topA[2] + (topB[2] - topA[2]) * v;
      const bx = botA[0] + (botB[0] - botA[0]) * v;
      const by = botA[1] + (botB[1] - botA[1]) * v;
      const bz = botA[2] + (botB[2] - botA[2]) * v;

      const cWeight = Math.pow(Math.abs(v - 0.5) * 2.0, 2.1);
      const flare = cOut * Math.pow(u, 1.85) * cWeight;
      const ox = outDirA[0] + (outDirB[0] - outDirA[0]) * v;
      const oz = outDirA[1] + (outDirB[1] - outDirA[1]) * v;

      const x = tx + (bx - tx) * u + ox * flare;
      const z = tz + (bz - tz) * u + oz * flare;
      const yBase = ty - (ty - by) * Math.pow(u, 0.78);
      const y = yBase + lift * Math.pow(u, 1.85) * cWeight;
      return [x, y, z];
    };

    for (let iu = 0; iu < segU; iu++) {
      const u0 = iu / segU;
      const u1 = (iu + 1) / segU;
      const isTrim = iu >= segU - trimRows;
      const tPos = isTrim ? trimPos : mainPos;
      const tUv = isTrim ? trimUv : mainUv;

      for (let iv = 0; iv < segV; iv++) {
        const v0 = iv / segV;
        const v1 = (iv + 1) / segV;

        const p00 = evalUV(u0, v0);
        const p01 = evalUV(u0, v1);
        const p10 = evalUV(u1, v0);
        const p11 = evalUV(u1, v1);

        const uv00: [number, number] = [v0 * spanW * uvScale, (1 - u0) * spanR * uvScale];
        const uv01: [number, number] = [v1 * spanW * uvScale, (1 - u0) * spanR * uvScale];
        const uv10: [number, number] = [v0 * spanW * uvScale, (1 - u1) * spanR * uvScale];
        const uv11: [number, number] = [v1 * spanW * uvScale, (1 - u1) * spanR * uvScale];

        // 顶瓦面 (+Y / 外): (p10 - p00) × (p01 - p00) = (+Z) × (+X) = +Y 朝上
        pushTri(tPos, tUv, p00, p10, p01, uv00, uv10, uv01);
        pushTri(tPos, tUv, p01, p10, p11, uv01, uv10, uv11);

        // 封闭檐底仰面 (-Y)
        const b00: [number, number, number] = [p00[0], p00[1] - thick, p00[2]];
        const b01: [number, number, number] = [p01[0], p01[1] - thick, p01[2]];
        const b10: [number, number, number] = [p10[0], p10[1] - thick, p10[2]];
        const b11: [number, number, number] = [p11[0], p11[1] - thick, p11[2]];
        pushTri(sofPos, sofUv, b00, b01, b10, uv00, uv01, uv10);
        pushTri(sofPos, sofUv, b01, b11, b10, uv01, uv11, uv10);

        // 最外檐口立面封边（法向朝外）
        if (iu === segU - 1) {
          pushTri(tPos, tUv, p10, b10, p11, uv10, [uv10[0], uv10[1] - 0.12], uv11);
          pushTri(tPos, tUv, p11, b10, b11, uv11, [uv10[0], uv10[1] - 0.12], [uv11[0], uv11[1] - 0.12]);
        }
      }
    }
  };

  if (isSkirt) {
    // 四坡围廊下檐（前/后/左/右四坡，从内墙顶环绕向外伸展）
    // 南坡 (+Z): A=左(-X), B=右(+X)
    emitTrapezoidSlope([-ihw, opts.ridgeY, ihd], [ihw, opts.ridgeY, ihd], [-hw, opts.baseY, hd], [hw, opts.baseY, hd], [-0.7, 0.7], [0.7, 0.7], opts.width, hd - ihd);
    // 东坡 (+X): A=前(+Z), B=后(-Z)
    emitTrapezoidSlope([ihw, opts.ridgeY, ihd], [ihw, opts.ridgeY, -ihd], [hw, opts.baseY, hd], [hw, opts.baseY, -hd], [0.7, 0.7], [0.7, -0.7], opts.depth, hw - ihw);
    // 北坡 (-Z): A=右(+X), B=左(-X)
    emitTrapezoidSlope([ihw, opts.ridgeY, -ihd], [-ihw, opts.ridgeY, -ihd], [hw, opts.baseY, -hd], [-hw, opts.baseY, -hd], [0.7, -0.7], [-0.7, -0.7], opts.width, hd - ihd);
    // 西坡 (-X): A=后(-Z), B=前(+Z)
    emitTrapezoidSlope([-ihw, opts.ridgeY, -ihd], [-ihw, opts.ridgeY, ihd], [-hw, opts.baseY, -hd], [-hw, opts.baseY, hd], [-0.7, -0.7], [-0.7, 0.7], opts.depth, hw - ihw);
  } else {
    // 标准清式歇山顶：正脊 + 山花 + 两侧围檐
    const gableBaseY = opts.baseY + (opts.ridgeY - opts.baseY) * 0.46;
    const gableZHalf = hd * 0.44;
    const gableX = rHalf;

    // 1. 南/北两大主坡
    emitTrapezoidSlope([-rHalf, opts.ridgeY, 0], [rHalf, opts.ridgeY, 0], [-hw, opts.baseY, hd], [hw, opts.baseY, hd], [-0.7, 0.7], [0.7, 0.7], opts.width, hd);
    emitTrapezoidSlope([rHalf, opts.ridgeY, 0], [-rHalf, opts.ridgeY, 0], [hw, opts.baseY, -hd], [-hw, opts.baseY, -hd], [0.7, -0.7], [-0.7, -0.7], opts.width, hd);

    // 2. 东/西两侧歇山围檐（从山花底线向外坡至东西檐口）
    emitTrapezoidSlope([gableX, gableBaseY, gableZHalf], [gableX, gableBaseY, -gableZHalf], [hw, opts.baseY, hd], [hw, opts.baseY, -hd], [0.7, 0.7], [0.7, -0.7], opts.depth, hw - gableX);
    emitTrapezoidSlope([-gableX, gableBaseY, -gableZHalf], [-gableX, gableBaseY, gableZHalf], [-hw, opts.baseY, -hd], [-hw, opts.baseY, hd], [-0.7, -0.7], [-0.7, 0.7], opts.depth, hw - gableX);

    // 3. 左右山花三角板（底边深插围檐上沿之下，严密封堵山花缝隙）
    const addGableTri = (xSign: 1 | -1) => {
      const gx = xSign * (gableX - 0.04);
      const pTop: [number, number, number] = [gx, opts.ridgeY - 0.03, 0];
      const pA: [number, number, number] = [gx, gableBaseY - 0.04, xSign * (gableZHalf * 0.96)];
      const pB: [number, number, number] = [gx, gableBaseY - 0.04, -xSign * (gableZHalf * 0.96)];
      const posArr = [pTop[0], pTop[1], pTop[2], pA[0], pA[1], pA[2], pB[0], pB[1], pB[2]];
      const uvArr = [0.5, 1, 0, 0, 1, 0];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
      g.computeVertexNormals();
      gableGeos.push(g);
    };
    addGableTri(1);
    addGableTri(-1);

    // 4. 正脊与吻兽
    ridgeGeos.push(createBox(rHalf * 2 + 0.06, 0.085, 0.075, 0, opts.ridgeY + 0.035, 0, 1.0));
    ridgeGeos.push(createBox(0.08, 0.14, 0.09, -rHalf - 0.02, opts.ridgeY + 0.075, 0, 1.0));
    ridgeGeos.push(createBox(0.08, 0.14, 0.09, rHalf + 0.02, opts.ridgeY + 0.075, 0, 1.0));
  }

  // 4 条斜垂脊（含翼角起翘点）
  const corners: Array<[number, number, number, number]> = [
    [-1, 1, -1, 1],
    [1, 1, 1, 1],
    [1, -1, 1, -1],
    [-1, -1, -1, -1],
  ];
  for (const [sx, sz, ox, oz] of corners) {
    const startX = isSkirt ? sx * ihw : sx * rHalf;
    const startZ = isSkirt ? sz * ihd : 0;
    const endX = sx * hw + ox * cOut * 0.75;
    const endZ = sz * hd + oz * cOut * 0.75;
    const endY = opts.baseY + lift + 0.025;
    const mid = new THREE.Vector3((startX + endX) * 0.5, (opts.ridgeY + endY) * 0.5 + 0.015, (startZ + endZ) * 0.5);
    const a = new THREE.Vector3(startX, opts.ridgeY + 0.02, startZ);
    const b = new THREE.Vector3(endX, endY, endZ);
    const bar = new THREE.BoxGeometry(0.055, 0.055, a.distanceTo(b) + 0.02);
    bar.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize())
    );
    bar.translate(mid.x, mid.y, mid.z);
    ridgeGeos.push(bar);
    ridgeGeos.push(createBox(0.065, 0.08, 0.065, endX, endY + 0.035, endZ, 1.0));
  }

  const makeGeo = (p: number[], u: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
    g.computeVertexNormals();
    return g;
  };

  const parts: XieshanRoofParts = {
    mainTileGeo: makeGeo(mainPos, mainUv),
    trimTileGeo: makeGeo(trimPos, trimUv),
    ridgeGeo: mergeBufferGeometries(ridgeGeos),
    soffitGeo: makeGeo(sofPos, sofUv),
    gableGeo: mergeBufferGeometries(gableGeos),
  };

  const rotY = opts.rotationY ?? 0;
  for (const geo of [parts.mainTileGeo, parts.trimTileGeo, parts.ridgeGeo, parts.soffitGeo, parts.gableGeo]) {
    if (!geo.attributes.position || geo.attributes.position.count === 0) continue;
    if (rotY !== 0) geo.rotateY(rotY);
    geo.translate(opts.cx, 0, opts.cz);
  }

  return parts;
}

/** 八角/矩形檐下深色斗拱挑檐阴影槽几何体 */
export function buildOctagonalDougongBand(
  cx: number,
  cz: number,
  radius: number,
  baseY: number,
  height: number,
  sides = 8,
  rotationY = 0
): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  // 暗影垫槽环
  const band = new THREE.CylinderGeometry(radius * 1.03, radius * 0.96, height, sides, 1);
  band.rotateY(Math.PI / 2 - rotationY);
  band.translate(cx, baseY + height * 0.5, cz);
  geos.push(band);

  // 逐面出挑双层小斗拱块
  for (let s = 0; s < sides; s++) {
    const aMid = rotationY + ((s + 0.5) / sides) * Math.PI * 2;
    const faceNormalX = Math.cos(aMid);
    const faceNormalZ = Math.sin(aMid);
    const faceTanX = -Math.sin(aMid);
    const faceTanZ = Math.cos(aMid);
    const rDist = radius * Math.cos(Math.PI / sides);
    const brackets = 3;
    for (let k = -1; k <= 1; k++) {
      const offset = (k / brackets) * radius * 0.52;
      const bx = cx + faceNormalX * (rDist + 0.04) + faceTanX * offset;
      const bz = cz + faceNormalZ * (rDist + 0.04) + faceTanZ * offset;
      const b1 = new THREE.BoxGeometry(0.11, height * 0.45, 0.13);
      b1.rotateY(-aMid + Math.PI / 2);
      b1.translate(bx, baseY + height * 0.35, bz);
      geos.push(b1);

      const b2 = new THREE.BoxGeometry(0.14, height * 0.38, 0.18);
      b2.rotateY(-aMid + Math.PI / 2);
      b2.translate(bx + faceNormalX * 0.03, baseY + height * 0.76, bz + faceNormalZ * 0.03);
      geos.push(b2);
    }
  }
  return mergeBufferGeometries(geos);
}

/** 矩形殿宇檐下暗影斗拱槽 */
export function buildRectDougongBand(
  cx: number,
  cz: number,
  w: number,
  d: number,
  baseY: number,
  height: number
): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [createBox(w, height, d, cx, baseY + height * 0.5, cz, 1.0)];
  const nx = Math.max(3, Math.round(w / 0.36));
  for (let i = 0; i < nx; i++) {
    const x = cx - w * 0.42 + (w * 0.84 * i) / (nx - 1);
    geos.push(createBox(0.11, height * 0.52, 0.13, x, baseY + height * 0.72, cz + d * 0.5 + 0.04));
    geos.push(createBox(0.11, height * 0.52, 0.13, x, baseY + height * 0.72, cz - d * 0.5 - 0.04));
  }
  const nz = Math.max(2, Math.round(d / 0.36));
  for (let i = 0; i < nz; i++) {
    const z = cz - d * 0.4 + (d * 0.8 * i) / (nz - 1);
    geos.push(createBox(0.13, height * 0.52, 0.11, cx + w * 0.5 + 0.04, baseY + height * 0.72, z));
    geos.push(createBox(0.13, height * 0.52, 0.11, cx - w * 0.5 - 0.04, baseY + height * 0.72, z));
  }
  return mergeBufferGeometries(geos);
}

/** 汉白玉寻杖栏板与莲花望柱段 */
export function buildMarbleBalustradeSegment(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  baseY: number,
  height = 0.22,
  postSpacing = 0.52,
  includeEndPosts = true
): THREE.BufferGeometry {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 0.05) return new THREE.BufferGeometry();
  const yaw = Math.atan2(dx, dz);
  const segs = Math.max(1, Math.round(len / postSpacing));
  const geos: THREE.BufferGeometry[] = [];

  // 通长地栿（下槛）、雕花栏板、寻杖扶手
  const railMid = new THREE.BoxGeometry(0.055, height * 0.16, len);
  railMid.rotateY(yaw);
  railMid.translate((ax + bx) * 0.5, baseY + height * 0.08, (az + bz) * 0.5);
  geos.push(railMid);

  const slab = new THREE.BoxGeometry(0.032, height * 0.56, len);
  slab.rotateY(yaw);
  slab.translate((ax + bx) * 0.5, baseY + height * 0.45, (az + bz) * 0.5);
  geos.push(slab);

  const topRail = new THREE.BoxGeometry(0.06, height * 0.15, len);
  topRail.rotateY(yaw);
  topRail.translate((ax + bx) * 0.5, baseY + height * 0.82, (az + bz) * 0.5);
  geos.push(topRail);

  const startIdx = includeEndPosts ? 0 : 1;
  const endIdx = includeEndPosts ? segs : segs - 1;
  for (let i = startIdx; i <= endIdx; i++) {
    const t = i / segs;
    const px = ax + dx * t;
    const pz = az + dz * t;
    geos.push(createBox(0.072, height * 1.05, 0.072, px, baseY + height * 0.525, pz));
    const cap = new THREE.SphereGeometry(0.044, 6, 4);
    cap.translate(px, baseY + height * 1.12, pz);
    geos.push(cap);
  }

  return mergeBufferGeometries(geos);
}

/** 鎏金火焰宝顶（莲台 + 宝瓶 + 相轮 + 火焰尖） */
export function buildGildedFinialGeometry(
  cx: number,
  baseY: number,
  cz: number,
  totalHeight: number,
  baseRadius: number
): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  const tiers: Array<[number, number, number, number]> = [
    [baseRadius * 1.1, baseRadius * 0.82, 0.16, 0.08],
    [baseRadius * 0.72, baseRadius * 0.92, 0.2, 0.25],
    [baseRadius * 0.88, baseRadius * 0.36, 0.24, 0.46],
    [baseRadius * 0.34, baseRadius * 0.24, 0.22, 0.69],
    [baseRadius * 0.22, 0.015, 0.24, 0.91],
  ];
  for (const [rBot, rTop, hFrac, yCenterFrac] of tiers) {
    const c = new THREE.CylinderGeometry(rTop, rBot, totalHeight * hFrac, 10);
    c.translate(cx, baseY + totalHeight * yCenterFrac, cz);
    geos.push(c);
  }
  const orb = new THREE.SphereGeometry(baseRadius * 0.32, 8, 6);
  orb.translate(cx, baseY + totalHeight * 0.8, cz);
  geos.push(orb);
  return mergeBufferGeometries(geos);
}
