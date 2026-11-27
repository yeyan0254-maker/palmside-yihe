import * as THREE from 'three';
import { LANDMARKS } from '../config/sceneConfig';
import { enhanceMaterial } from '../core/shaders';
import {
  createGlazedTileTextures,
  createLatticeWindowTextures,
  createMarbleCarvingTextures,
  createQingBrickTextures,
  createSuzhouPaintingTexture,
} from '../textures/proceduralPBR';
import {
  buildGildedFinialGeometry,
  buildMarbleBalustradeSegment,
  buildOctagonalDougongBand,
  buildOctagonalRoofParts,
  buildRectDougongBand,
  buildXieshanRoofParts,
  createBox,
  createTaperedPrism,
  mergeBufferGeometries,
} from './archUtils';

export interface FoxianggeResult {
  group: THREE.Group;
}

/**
 * 构建佛香阁中轴群：
 * - 三层收分青砖高台 + 汉白玉栏板望柱 + 南向券门与御阶
 * - 八角三层四重檐主阁（明黄琉璃瓦 #E0AA2B + 翠绿剪边 #1E6B52 + 翼角起翘 + 斗拱暗槽 + 菱花隔扇 + 鎏金宝顶至 13.50）
 * - 八字形双侧爬山廊（石基深埋至 0.60）
 * - 排云殿重檐歇山主殿 + 东西配殿院落
 * - 排云门 + 湖岸码头三孔小石桥
 */
export function buildFoxiangge(): FoxianggeResult {
  const group = new THREE.Group();
  group.name = 'FoxianggeAxialComplex';

  const brickGeos: THREE.BufferGeometry[] = [];
  const marbleGeos: THREE.BufferGeometry[] = [];
  const redWoodGeos: THREE.BufferGeometry[] = [];
  const latticeGeos: THREE.BufferGeometry[] = [];
  const paintingGeos: THREE.BufferGeometry[] = [];
  const darkWoodGeos: THREE.BufferGeometry[] = [];
  const yellowTileGeos: THREE.BufferGeometry[] = [];
  const greenTrimGeos: THREE.BufferGeometry[] = [];
  const greyTileGeos: THREE.BufferGeometry[] = [];
  const ridgeGeos: THREE.BufferGeometry[] = [];
  const gildedGeos: THREE.BufferGeometry[] = [];

  const pushXieshan = (
    parts: ReturnType<typeof buildXieshanRoofParts>,
    mainBucket: THREE.BufferGeometry[]
  ) => {
    mainBucket.push(parts.mainTileGeo);
    greenTrimGeos.push(parts.trimTileGeo);
    ridgeGeos.push(parts.ridgeGeo);
    darkWoodGeos.push(parts.soffitGeo);
    if (parts.gableGeo.attributes.position?.count) {
      redWoodGeos.push(parts.gableGeo);
    }
  };

  const pushOctRoof = (
    parts: ReturnType<typeof buildOctagonalRoofParts>,
    mainBucket: THREE.BufferGeometry[]
  ) => {
    mainBucket.push(parts.mainTileGeo);
    greenTrimGeos.push(parts.trimTileGeo);
    ridgeGeos.push(parts.ridgeGeo);
    darkWoodGeos.push(parts.soffitGeo);
  };

  const addMarbleSteps = (
    cx: number,
    zStart: number,
    zEnd: number,
    yStart: number,
    yEnd: number,
    width: number,
    count: number
  ) => {
    const dz = (zEnd - zStart) / count;
    const dy = (yEnd - yStart) / count;
    const stepD = Math.abs(dz) * 1.15;
    for (let i = 0; i < count; i++) {
      const z = zStart + (i + 0.5) * dz;
      const yTop = yStart + (i + 1) * dy;
      const h = Math.max(0.18, yTop - Math.min(yStart, yEnd) + 0.16);
      marbleGeos.push(createBox(width, h, stepD, cx, yTop - h * 0.5, z, 0.8));
    }
    // 两侧垂带石框
    const midZ = (zStart + zEnd) * 0.5;
    const midY = (yStart + yEnd) * 0.5;
    const span = Math.hypot(zEnd - zStart, yEnd - yStart);
    const pitch = Math.atan2(yEnd - yStart, zEnd - zStart);
    for (const s of [-1, 1]) {
      const curb = new THREE.BoxGeometry(0.08, 0.12, span + 0.08);
      curb.rotateX(-pitch);
      curb.translate(cx + s * (width * 0.5 + 0.04), midY + 0.04, midZ);
      marbleGeos.push(curb);
    }
  };

  const addOctagonHallStory = (
    cx: number,
    cz: number,
    rotY: number,
    yBot: number,
    yTop: number,
    rCore: number,
    rCols: number,
    colRadius: number,
    addBalustradeR?: number
  ) => {
    const sides = 8;
    const h = yTop - yBot;

    if (addBalustradeR) {
      for (let s = 0; s < sides; s++) {
        const a0 = rotY + (s / sides) * Math.PI * 2;
        const a1 = rotY + ((s + 1) / sides) * Math.PI * 2;
        // 留出正南口(s=1 附近) 供梯道出入：实际上在八角顶旋转 22.5° 下，s=1 是正南面 (a0=67.5°, a1=112.5°)
        marbleGeos.push(
          buildMarbleBalustradeSegment(
            cx + Math.cos(a0) * addBalustradeR,
            cz + Math.sin(a0) * addBalustradeR,
            cx + Math.cos(a1) * addBalustradeR,
            cz + Math.sin(a1) * addBalustradeR,
            yBot,
            0.2,
            0.46,
            true
          )
        );
      }
    }

    // 16 根朱红立柱（8 角主柱 + 8 面副柱）配白色鼓形柱础
    for (let s = 0; s < sides; s++) {
      const a0 = rotY + (s / sides) * Math.PI * 2;
      const a1 = rotY + ((s + 1) / sides) * Math.PI * 2;
      const p0x = cx + Math.cos(a0) * rCols;
      const p0z = cz + Math.sin(a0) * rCols;
      const p1x = cx + Math.cos(a1) * rCols;
      const p1z = cz + Math.sin(a1) * rCols;

      const col = new THREE.CylinderGeometry(colRadius * 0.92, colRadius, h, 8);
      col.translate(p0x, yBot + h * 0.5, p0z);
      redWoodGeos.push(col);

      const base = new THREE.CylinderGeometry(colRadius * 1.45, colRadius * 1.65, 0.07, 8);
      base.translate(p0x, yBot + 0.035, p0z);
      marbleGeos.push(base);

      // 每面两侧菱花隔扇门窗扇（精确 0..1 UV 避免环形拉伸）
      const c0x = cx + Math.cos(a0) * rCore;
      const c0z = cz + Math.sin(a0) * rCore;
      const c1x = cx + Math.cos(a1) * rCore;
      const c1z = cz + Math.sin(a1) * rCore;
      const faceW = Math.hypot(c1x - c0x, c1z - c0z);
      const faceYaw = Math.atan2(c1x - c0x, c1z - c0z);
      const panelH = h * 0.84;

      const wallPanel = new THREE.BoxGeometry(0.06, panelH, faceW * 0.96);
      wallPanel.rotateY(faceYaw);
      wallPanel.translate((c0x + c1x) * 0.5, yBot + panelH * 0.5, (c0z + c1z) * 0.5);
      latticeGeos.push(wallPanel);

      // 檐下苏式彩画额枋带
      const f0x = cx + Math.cos(a0) * (rCols * 0.98);
      const f0z = cz + Math.sin(a0) * (rCols * 0.98);
      const f1x = cx + Math.cos(a1) * (rCols * 0.98);
      const f1z = cz + Math.sin(a1) * (rCols * 0.98);
      const friezeW = Math.hypot(f1x - f0x, f1z - f0z);
      const frieze = new THREE.BoxGeometry(0.075, h * 0.16, friezeW);
      frieze.rotateY(Math.atan2(f1x - f0x, f1z - f0z));
      frieze.translate((f0x + f1x) * 0.5, yTop - h * 0.14, (f0z + f1z) * 0.5);
      paintingGeos.push(frieze);
    }
  };

  // =========================================================================
  // 1. 佛香阁三层收分青砖高台 (0, -13.6) 底埋至 1.10 -> 顶 7.10
  // =========================================================================
  const fx = LANDMARKS.foxiangge.x;
  const fz = LANDMARKS.foxiangge.z;
  const fRot = LANDMARKS.foxiangge.rotationY; // 22.5°

  // 一层高台 (1.10 -> 3.45)
  brickGeos.push(createTaperedPrism(6.8, 6.2, 6.3, 5.75, 2.35, fx, 1.1, fz, 0.72));
  marbleGeos.push(createBox(6.46, 0.1, 5.91, fx, 3.45, fz, 0.6));
  // 一层围栏（南侧留出 1.3u 御道口）
  marbleGeos.push(buildMarbleBalustradeSegment(fx - 3.16, fz + 2.88, fx - 0.65, fz + 2.88, 3.5, 0.24));
  marbleGeos.push(buildMarbleBalustradeSegment(fx + 0.65, fz + 2.88, fx + 3.16, fz + 2.88, 3.5, 0.24));
  marbleGeos.push(buildMarbleBalustradeSegment(fx + 3.16, fz + 2.88, fx + 3.16, fz - 2.88, 3.5, 0.24));
  marbleGeos.push(buildMarbleBalustradeSegment(fx + 3.16, fz - 2.88, fx - 3.16, fz - 2.88, 3.5, 0.24));
  marbleGeos.push(buildMarbleBalustradeSegment(fx - 3.16, fz - 2.88, fx - 3.16, fz + 2.88, 3.5, 0.24));

  // 二层高台 (3.45 -> 5.35)
  brickGeos.push(createTaperedPrism(5.75, 5.2, 5.35, 4.82, 1.9, fx, 3.45, fz, 0.72));
  marbleGeos.push(createBox(5.5, 0.1, 4.96, fx, 5.35, fz, 0.6));
  marbleGeos.push(buildMarbleBalustradeSegment(fx - 2.68, fz + 2.41, fx - 0.56, fz + 2.41, 5.4, 0.23));
  marbleGeos.push(buildMarbleBalustradeSegment(fx + 0.56, fz + 2.41, fx + 2.68, fz + 2.41, 5.4, 0.23));
  marbleGeos.push(buildMarbleBalustradeSegment(fx + 2.68, fz + 2.41, fx + 2.68, fz - 2.41, 5.4, 0.23));
  marbleGeos.push(buildMarbleBalustradeSegment(fx + 2.68, fz - 2.41, fx - 2.68, fz - 2.41, 5.4, 0.23));
  marbleGeos.push(buildMarbleBalustradeSegment(fx - 2.68, fz - 2.41, fx - 2.68, fz + 2.41, 5.4, 0.23));

  // 三层高台 (5.35 -> 7.10)
  brickGeos.push(createTaperedPrism(4.85, 4.45, 4.55, 4.2, 1.75, fx, 5.35, fz, 0.72));
  marbleGeos.push(createBox(4.74, 0.12, 4.38, fx, 7.04, fz, 0.6));
  marbleGeos.push(buildMarbleBalustradeSegment(fx - 2.28, fz + 2.1, fx - 0.52, fz + 2.1, 7.1, 0.22));
  marbleGeos.push(buildMarbleBalustradeSegment(fx + 0.52, fz + 2.1, fx + 2.28, fz + 2.1, 7.1, 0.22));
  marbleGeos.push(buildMarbleBalustradeSegment(fx + 2.28, fz + 2.1, fx + 2.28, fz - 2.1, 7.1, 0.22));
  marbleGeos.push(buildMarbleBalustradeSegment(fx + 2.28, fz - 2.1, fx - 2.28, fz - 2.1, 7.1, 0.22));
  marbleGeos.push(buildMarbleBalustradeSegment(fx - 2.28, fz - 2.1, fx - 2.28, fz + 2.1, 7.1, 0.22));

  // 南向中轴登阁汉白玉石梯（三段）与一层券门洞框
  darkWoodGeos.push(createBox(0.84, 0.85, 0.28, fx, 2.7, fz + 3.04));
  marbleGeos.push(createBox(1.06, 0.98, 0.16, fx, 2.74, fz + 3.06));
  addMarbleSteps(fx, fz + 3.65, fz + 2.86, 2.45, 3.48, 1.15, 10);
  addMarbleSteps(fx, fz + 2.86, fz + 2.38, 3.48, 5.38, 0.98, 12);
  addMarbleSteps(fx, fz + 2.38, fz + 2.02, 5.38, 7.1, 0.9, 10);

  // =========================================================================
  // 2. 佛香阁八角三层四重檐主阁（Y = 7.10 -> 13.50，旋转 22.5° 正面朝南）
  // =========================================================================
  const octBase = new THREE.CylinderGeometry(2.16, 2.24, 0.16, 8);
  octBase.rotateY(Math.PI / 2 - fRot);
  octBase.translate(fx, 7.18, fz);
  marbleGeos.push(octBase);

  // 一层 (7.26 -> 8.80) + 一重檐
  addOctagonHallStory(fx, fz, fRot, 7.26, 8.76, 1.56, 1.92, 0.055);
  darkWoodGeos.push(buildOctagonalDougongBand(fx, fz, 1.9, 8.48, 0.28, 8, fRot));
  pushOctRoof(
    buildOctagonalRoofParts({
      sides: 8,
      cx: fx,
      cz: fz,
      innerR: 1.46,
      outerR: 2.68,
      baseY: 8.68,
      peakY: 9.28,
      cornerLift: 0.26,
      cornerOut: 0.28,
      rotationY: fRot,
    }),
    yellowTileGeos
  );

  // 二层平坐腰檐 (二重檐 9.48 -> 9.90) + 二层主体 (8.92 -> 10.42) + 三重檐
  addOctagonHallStory(fx, fz, fRot, 8.92, 10.38, 1.36, 1.66, 0.048, 1.84);
  darkWoodGeos.push(buildOctagonalDougongBand(fx, fz, 1.66, 9.28, 0.24, 8, fRot));
  pushOctRoof(
    buildOctagonalRoofParts({
      sides: 8,
      cx: fx,
      cz: fz,
      innerR: 1.38,
      outerR: 2.34,
      baseY: 9.46,
      peakY: 9.88,
      cornerLift: 0.22,
      cornerOut: 0.24,
      rotationY: fRot,
    }),
    yellowTileGeos
  );
  darkWoodGeos.push(buildOctagonalDougongBand(fx, fz, 1.64, 10.14, 0.26, 8, fRot));
  pushOctRoof(
    buildOctagonalRoofParts({
      sides: 8,
      cx: fx,
      cz: fz,
      innerR: 1.3,
      outerR: 2.38,
      baseY: 10.3,
      peakY: 10.9,
      cornerLift: 0.26,
      cornerOut: 0.26,
      rotationY: fRot,
    }),
    yellowTileGeos
  );

  // 三层主体 (10.56 -> 11.58) + 四重檐八角攒尖顶 (11.46 -> 12.68) + 鎏金宝顶 (12.64 -> 13.50)
  addOctagonHallStory(fx, fz, fRot, 10.56, 11.56, 1.12, 1.38, 0.044, 1.56);
  darkWoodGeos.push(buildOctagonalDougongBand(fx, fz, 1.36, 11.3, 0.28, 8, fRot));
  pushOctRoof(
    buildOctagonalRoofParts({
      sides: 8,
      cx: fx,
      cz: fz,
      innerR: 0.0,
      outerR: 2.08,
      baseY: 11.46,
      peakY: 12.68,
      cornerLift: 0.28,
      cornerOut: 0.3,
      rotationY: fRot,
    }),
    yellowTileGeos
  );
  gildedGeos.push(buildGildedFinialGeometry(fx, 12.64, fz, 0.86, 0.2));

  // =========================================================================
  // 3. 八字形双侧爬山廊 (±4.66, -7.85) -> (±2.60, -10.8)（石基埋至 0.60）
  // =========================================================================
  for (const sideSign of [-1, 1] as const) {
    const pStart = new THREE.Vector3(sideSign * 4.66, 2.2, -7.85);
    const pEnd = new THREE.Vector3(sideSign * 2.6, 4.75, -10.8);
    const dir = new THREE.Vector3().subVectors(pEnd, pStart);
    const lenXZ = Math.hypot(dir.x, dir.z);
    const yaw = Math.atan2(dir.x, dir.z);
    const bays = 4;
    const bayLen = lenXZ / bays;

    for (let b = 0; b < bays; b++) {
      const t = (b + 0.5) / bays;
      const bx = pStart.x + dir.x * t;
      const bz = pStart.z + dir.z * t;
      const floorY = pStart.y + dir.y * t;
      const baseH = floorY - 0.6;

      // 实心青砖石基埋至 0.60
      const plinth = new THREE.BoxGeometry(0.68, baseH, bayLen * 1.08);
      plinth.rotateY(yaw);
      plinth.translate(bx, 0.6 + baseH * 0.5, bz);
      brickGeos.push(plinth);

      // 两侧朱红立柱与低栏
      for (const lr of [-1, 1]) {
        const rx = -Math.cos(yaw) * 0.25 * lr;
        const rz = Math.sin(yaw) * 0.25 * lr;
        const col = new THREE.CylinderGeometry(0.032, 0.036, 0.58, 6);
        col.translate(bx + rx, floorY + 0.29, bz + rz);
        redWoodGeos.push(col);

        const rail = new THREE.BoxGeometry(0.04, 0.14, bayLen * 1.04);
        rail.rotateY(yaw);
        rail.translate(bx + rx, floorY + 0.08, bz + rz);
        redWoodGeos.push(rail);
      }

      // 梯级灰筒瓦坡顶
      const roof = buildXieshanRoofParts({
        cx: bx,
        cz: bz,
        width: bayLen * 1.12,
        depth: 0.8,
        baseY: floorY + 0.54,
        ridgeY: floorY + 0.8,
        ridgeLen: bayLen * 0.72,
        cornerLift: 0.045,
        cornerOut: 0.045,
        eaveThickness: 0.038,
        rotationY: yaw + Math.PI / 2,
      });
      pushXieshan(roof, greyTileGeos);
    }
  }

  // =========================================================================
  // 4. 排云殿中轴院落 (0.0, -8.4) + 东西配殿 + 宫墙
  // =========================================================================
  const px = LANDMARKS.paiyundian.x;
  const pz = LANDMARKS.paiyundian.z;
  const pyTop = LANDMARKS.paiyundian.topY; // 2.20

  // 台基深埋至 0.80
  brickGeos.push(createTaperedPrism(3.55, 2.55, 3.4, 2.4, pyTop - 0.8, px, 0.8, pz, 0.75));
  marbleGeos.push(createBox(3.52, 0.1, 2.52, px, pyTop - 0.05, pz, 0.6));
  marbleGeos.push(buildMarbleBalustradeSegment(px - 1.7, pz + 1.2, px - 0.62, pz + 1.2, pyTop, 0.2));
  marbleGeos.push(buildMarbleBalustradeSegment(px + 0.62, pz + 1.2, px + 1.7, pz + 1.2, pyTop, 0.2));
  marbleGeos.push(buildMarbleBalustradeSegment(px + 1.7, pz + 1.2, px + 1.7, pz - 1.2, pyTop, 0.2));
  marbleGeos.push(buildMarbleBalustradeSegment(px - 1.7, pz - 1.2, px - 1.7, pz + 1.2, pyTop, 0.2));
  addMarbleSteps(px, pz + 1.56, pz + 1.18, 1.82, pyTop, 1.18, 6);

  // 排云殿主殿一层柱网、菱花隔扇、彩画额枋与下围檐
  latticeGeos.push(createBox(2.26, 0.8, 1.26, px, pyTop + 0.4, pz, 1.0));
  paintingGeos.push(createBox(2.58, 0.14, 1.54, px, pyTop + 0.76, pz, 1.0));
  for (let ix = 0; ix < 6; ix++) {
    const cxCol = px - 1.26 + (2.52 * ix) / 5;
    for (const czCol of [pz - 0.74, pz + 0.74]) {
      const col = new THREE.CylinderGeometry(0.036, 0.04, 0.86, 6);
      col.translate(cxCol, pyTop + 0.43, czCol);
      redWoodGeos.push(col);
      marbleGeos.push(createBox(0.1, 0.06, 0.1, cxCol, pyTop + 0.03, czCol));
    }
  }
  darkWoodGeos.push(buildRectDougongBand(px, pz, 2.52, 1.48, pyTop + 0.78, 0.14));
  pushXieshan(
    buildXieshanRoofParts({
      cx: px,
      cz: pz,
      width: 3.24,
      depth: 2.18,
      innerCutW: 2.18,
      innerCutD: 1.22,
      baseY: pyTop + 0.86,
      ridgeY: pyTop + 1.18,
      cornerLift: 0.12,
      cornerOut: 0.14,
      eaveThickness: 0.05,
    }),
    yellowTileGeos
  );

  // 排云殿二层重檐主殿（至屋脊 Y = 4.05）
  latticeGeos.push(createBox(1.88, 0.36, 0.96, px, pyTop + 1.22, pz, 1.0));
  darkWoodGeos.push(buildRectDougongBand(px, pz, 1.96, 1.04, pyTop + 1.26, 0.14));
  pushXieshan(
    buildXieshanRoofParts({
      cx: px,
      cz: pz,
      width: 2.92,
      depth: 1.88,
      baseY: pyTop + 1.32,
      ridgeY: LANDMARKS.paiyundian.ridgeY, // 4.05
      ridgeLen: 1.56,
      cornerLift: 0.16,
      cornerOut: 0.18,
      eaveThickness: 0.05,
    }),
    yellowTileGeos
  );

  // 东西配殿 (±2.42, -7.65)
  for (const s of [-1, 1]) {
    const sx = s * 2.42;
    const sz = -7.65;
    const sTop = 1.65;
    brickGeos.push(createTaperedPrism(1.22, 1.95, 1.12, 1.85, sTop - 0.6, sx, 0.6, sz, 0.7));
    marbleGeos.push(createBox(1.16, 0.07, 1.88, sx, sTop - 0.035, sz, 0.6));
    latticeGeos.push(createBox(0.76, 0.62, 1.52, sx, sTop + 0.31, sz, 1.0));
    paintingGeos.push(createBox(0.9, 0.11, 1.68, sx, sTop + 0.58, sz, 1.0));
    for (let k = 0; k < 4; k++) {
      const colZ = sz - 0.78 + (1.56 * k) / 3;
      const col = new THREE.CylinderGeometry(0.03, 0.034, 0.64, 6);
      col.translate(sx - s * 0.44, sTop + 0.32, colZ);
      redWoodGeos.push(col);
    }
    darkWoodGeos.push(buildRectDougongBand(sx, sz, 0.88, 1.66, sTop + 0.58, 0.11));
    pushXieshan(
      buildXieshanRoofParts({
        cx: sx,
        cz: sz,
        width: 1.98,
        depth: 1.24,
        baseY: sTop + 0.65,
        ridgeY: sTop + 1.15,
        ridgeLen: 1.12,
        cornerLift: 0.1,
        cornerOut: 0.12,
        eaveThickness: 0.045,
        rotationY: Math.PI / 2,
      }),
      greyTileGeos
    );
    // 朱红宫墙围合院落
    redWoodGeos.push(createBox(0.14, 0.52, 1.65, s * 2.38, 1.48, -6.35));
    yellowTileGeos.push(createBox(0.22, 0.08, 1.68, s * 2.38, 1.76, -6.35));
  }

  // =========================================================================
  // 5. 排云门 (0.0, -5.5) 与 湖岸码头三孔小石桥 (0.0, -4.3)
  // =========================================================================
  const mx = LANDMARKS.paiyunmen.x;
  const mz = LANDMARKS.paiyunmen.z;
  const mTop = LANDMARKS.paiyunmen.topY; // 1.05
  brickGeos.push(createTaperedPrism(2.54, 1.32, 2.4, 1.2, mTop - 0.0, mx, 0.0, mz, 0.75));
  marbleGeos.push(createBox(2.44, 0.08, 1.24, mx, mTop - 0.04, mz, 0.6));

  // 三开间牌楼式朱红门柱与过门暗洞
  for (let i = 0; i < 4; i++) {
    const gx = mx - 0.96 + i * 0.64;
    for (const gz of [mz - 0.42, mz + 0.42]) {
      const col = new THREE.CylinderGeometry(0.036, 0.04, 0.76, 6);
      col.translate(gx, mTop + 0.38, gz);
      redWoodGeos.push(col);
      marbleGeos.push(createBox(0.1, 0.06, 0.1, gx, mTop + 0.03, gz));
    }
  }
  redWoodGeos.push(createBox(2.05, 0.72, 0.16, mx, mTop + 0.36, mz - 0.14));
  // 门洞黑底透深
  darkWoodGeos.push(createBox(0.36, 0.52, 0.24, mx, mTop + 0.26, mz - 0.14));
  darkWoodGeos.push(createBox(0.26, 0.44, 0.24, mx - 0.64, mTop + 0.22, mz - 0.14));
  darkWoodGeos.push(createBox(0.26, 0.44, 0.24, mx + 0.64, mTop + 0.22, mz - 0.14));
  paintingGeos.push(createBox(2.1, 0.14, 0.88, mx, mTop + 0.72, mz, 1.0));
  darkWoodGeos.push(buildRectDougongBand(mx, mz, 2.12, 0.88, mTop + 0.74, 0.12));
  pushXieshan(
    buildXieshanRoofParts({
      cx: mx,
      cz: mz,
      width: 2.74,
      depth: 1.52,
      baseY: mTop + 0.82,
      ridgeY: mTop + 1.38,
      ridgeLen: 1.48,
      cornerLift: 0.13,
      cornerOut: 0.14,
      eaveThickness: 0.045,
    }),
    yellowTileGeos
  );

  // 湖岸码头平台 (0.0, -4.3, topY = 0.35) + 汉白玉栏杆 + 三孔过水小石桥
  const pxPier = LANDMARKS.pier.x;
  const pzPier = LANDMARKS.pier.z;
  const pTop = LANDMARKS.pier.topY; // 0.35
  brickGeos.push(createBox(2.6, 0.95, 1.4, pxPier, pTop - 0.475, pzPier, 0.7));
  marbleGeos.push(createBox(2.64, 0.08, 1.44, pxPier, pTop - 0.02, pzPier, 0.6));
  marbleGeos.push(buildMarbleBalustradeSegment(pxPier - 1.26, pzPier + 0.66, pxPier - 0.52, pzPier + 0.66, pTop, 0.16, 0.38));
  marbleGeos.push(buildMarbleBalustradeSegment(pxPier + 0.52, pzPier + 0.66, pxPier + 1.26, pzPier + 0.66, pTop, 0.16, 0.38));
  marbleGeos.push(buildMarbleBalustradeSegment(pxPier - 1.26, pzPier - 0.66, pxPier - 1.26, pzPier + 0.66, pTop, 0.16, 0.42));
  marbleGeos.push(buildMarbleBalustradeSegment(pxPier + 1.26, pzPier - 0.66, pxPier + 1.26, pzPier + 0.66, pTop, 0.16, 0.42));
  addMarbleSteps(pxPier, pzPier + 0.88, pzPier + 0.58, 0.02, pTop, 0.96, 4);

  // 码头与排云门之间微型三孔拱石桥（z = -4.90）
  const smallBridgeShape = new THREE.Shape();
  smallBridgeShape.moveTo(-0.78, 0.0);
  smallBridgeShape.lineTo(0.78, 0.0);
  smallBridgeShape.lineTo(0.78, 0.42);
  smallBridgeShape.quadraticCurveTo(0, 0.64, -0.78, 0.42);
  smallBridgeShape.closePath();
  for (const ax of [-0.42, 0.0, 0.42]) {
    const r = ax === 0 ? 0.14 : 0.1;
    const hHole = new THREE.Path();
    hHole.moveTo(ax - r, 0.02);
    hHole.lineTo(ax - r, 0.22);
    hHole.absarc(ax, 0.22, r, Math.PI, 0, true);
    hHole.lineTo(ax + r, 0.02);
    hHole.closePath();
    smallBridgeShape.holes.push(hHole);
  }
  const sbGeo = new THREE.ExtrudeGeometry(smallBridgeShape, {
    depth: 0.72,
    bevelEnabled: true,
    bevelSize: 0.01,
    bevelThickness: 0.01,
    bevelSegments: 1,
  });
  sbGeo.translate(0, 0, -0.36);
  sbGeo.rotateY(Math.PI / 2);
  sbGeo.translate(0, 0.28, -4.92);
  marbleGeos.push(sbGeo);

  // =========================================================================
  // 材质构建与按材质合并挂载（严格控制积雪白名单）
  // =========================================================================
  const brickTex = createQingBrickTextures();
  const tileTex = createGlazedTileTextures();
  const latticeTex = createLatticeWindowTextures();
  const suzhouTex = createSuzhouPaintingTexture();
  const marbleTex = createMarbleCarvingTextures();

  const addMerged = (
    geos: THREE.BufferGeometry[],
    name: string,
    mat: THREE.MeshStandardMaterial,
    snowOpts?: { threshold: number; strength: number }
  ) => {
    if (geos.length === 0) return;
    const merged = mergeBufferGeometries(geos);
    if (!merged.attributes.position || merged.attributes.position.count === 0) return;
    if (snowOpts) {
      enhanceMaterial(mat, { snow: true, snowThreshold: snowOpts.threshold, snowStrength: snowOpts.strength });
    }
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  addMerged(
    brickGeos,
    'FoxianggeQingBrickBases',
    new THREE.MeshStandardMaterial({
      map: brickTex.map,
      normalMap: brickTex.normalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughnessMap: brickTex.roughnessMap,
      roughness: 0.88,
      metalness: 0.03,
    }),
    { threshold: 0.56, strength: 0.82 }
  );

  addMerged(
    marbleGeos,
    'FoxianggeMarbleTrim',
    new THREE.MeshStandardMaterial({
      map: marbleTex.map,
      normalMap: marbleTex.normalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.62,
      metalness: 0.04,
      color: 0xe6e3da,
    }),
    { threshold: 0.58, strength: 0.78 }
  );

  // 严禁对朱红柱、隔扇、彩画、斗拱暗影挂载积雪
  addMerged(
    redWoodGeos,
    'FoxianggeVermilionColumns',
    new THREE.MeshStandardMaterial({
      color: 0x9b241b,
      roughness: 0.46,
      metalness: 0.05,
    })
  );

  addMerged(
    latticeGeos,
    'FoxianggeLatticeDoors',
    new THREE.MeshStandardMaterial({
      map: latticeTex.map,
      normalMap: latticeTex.normalMap,
      normalScale: new THREE.Vector2(0.65, 0.65),
      roughness: 0.54,
      metalness: 0.04,
    })
  );

  addMerged(
    paintingGeos,
    'FoxianggeSuzhouFrieze',
    new THREE.MeshStandardMaterial({
      map: suzhouTex,
      roughness: 0.58,
      metalness: 0.04,
    })
  );

  addMerged(
    darkWoodGeos,
    'FoxianggeDougongSoffits',
    new THREE.MeshStandardMaterial({
      color: 0x241d19,
      roughness: 0.82,
      metalness: 0.04,
    })
  );

  // 屋瓦严格启用顶面积雪白名单
  addMerged(
    yellowTileGeos,
    'FoxianggeYellowGlazedRoofs',
    new THREE.MeshStandardMaterial({
      color: 0xe0aa2b,
      map: tileTex.map,
      normalMap: tileTex.normalMap,
      normalScale: new THREE.Vector2(0.95, 0.95),
      roughnessMap: tileTex.roughnessMap,
      roughness: 0.26,
      metalness: 0.14,
      envMapIntensity: 1.3,
    }),
    { threshold: 0.44, strength: 0.92 }
  );

  addMerged(
    greenTrimGeos,
    'FoxianggeEmeraldTrimRoofs',
    new THREE.MeshStandardMaterial({
      color: 0x1e6b52,
      map: tileTex.map,
      normalMap: tileTex.normalMap,
      normalScale: new THREE.Vector2(0.95, 0.95),
      roughnessMap: tileTex.roughnessMap,
      roughness: 0.25,
      metalness: 0.12,
      envMapIntensity: 1.25,
    }),
    { threshold: 0.44, strength: 0.92 }
  );

  addMerged(
    greyTileGeos,
    'FoxianggeGreyTileRoofs',
    new THREE.MeshStandardMaterial({
      color: 0x626a72,
      map: tileTex.map,
      normalMap: tileTex.normalMap,
      normalScale: new THREE.Vector2(0.88, 0.88),
      roughnessMap: tileTex.roughnessMap,
      roughness: 0.65,
      metalness: 0.05,
    }),
    { threshold: 0.44, strength: 0.92 }
  );

  addMerged(
    ridgeGeos,
    'FoxianggeRoofRidges',
    new THREE.MeshStandardMaterial({
      color: 0x45494e,
      roughness: 0.56,
      metalness: 0.08,
    }),
    { threshold: 0.52, strength: 0.85 }
  );

  addMerged(
    gildedGeos,
    'FoxianggeGildedFinial',
    new THREE.MeshStandardMaterial({
      color: 0xf1c85b,
      metalness: 0.9,
      roughness: 0.22,
      envMapIntensity: 1.65,
    })
  );

  return { group };
}
