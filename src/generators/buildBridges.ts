import * as THREE from 'three';
import { LANDMARKS } from '../config/sceneConfig';
import { SHARED_UNIFORMS } from '../config/stateStore';
import { enhanceMaterial } from '../core/shaders';
import {
  createAshlarStoneTextures,
  createBoatCabinTexture,
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

export interface ArchAnchor {
  center: THREE.Vector3;
  normal: THREE.Vector3;
  radius: number;
  springY: number;
}

export interface BoatHandle {
  group: THREE.Group;
  wakeSpeedUniform: { value: number };
}

export interface BridgesAndIslandResult {
  group: THREE.Group;
  archAnchors: ArchAnchor[];
  boats: THREE.Group[];
  boatHandles: BoatHandle[];
  bridgePostsCount: number;
}

/** 构造带微型石狮雕顶的望柱几何（供十七孔桥 72 根望柱实例化） */
function createLionPostGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // 基座 -> 柱身 -> 莲花柱帽 -> 微型蹲坐石狮（身/胸/头）
  parts.push(createBox(0.08, 0.04, 0.08, 0, 0.02, 0));
  parts.push(createBox(0.056, 0.16, 0.056, 0, 0.12, 0));
  parts.push(createBox(0.072, 0.026, 0.072, 0, 0.213, 0));
  parts.push(createBox(0.046, 0.042, 0.046, 0, 0.247, 0));
  const head = new THREE.SphereGeometry(0.024, 6, 5);
  head.translate(0, 0.28, 0.008);
  parts.push(head);
  return mergeBufferGeometries(parts);
}

/**
 * 构建：
 * 1. 十七孔桥（rotation.y = -58°，物理镂空 17 孔 + 72 望柱石狮 + 17 孔金光锚点）
 * 2. 玉带桥（(-17.28, 2.0)，+5.1°，高耸汉白玉单拱 + 28 级实砌石阶桥面）
 * 3. 西堤六角景亭 + 南湖岛涵虚堂（二层重檐歇山顶）
 * 4. 2 艘精雕双层画舫（含船尾扩散水纹环，depthWrite: false）
 */
export function buildBridgesAndIsland(): BridgesAndIslandResult {
  const group = new THREE.Group();
  group.name = 'BridgesIslandAndBoats';

  const ashlarGeos: THREE.BufferGeometry[] = [];
  const marbleGeos: THREE.BufferGeometry[] = [];
  const brickGeos: THREE.BufferGeometry[] = [];
  const redWoodGeos: THREE.BufferGeometry[] = [];
  const latticeGeos: THREE.BufferGeometry[] = [];
  const paintingGeos: THREE.BufferGeometry[] = [];
  const darkWoodGeos: THREE.BufferGeometry[] = [];
  const yellowTileGeos: THREE.BufferGeometry[] = [];
  const greenTrimGeos: THREE.BufferGeometry[] = [];
  const greyTileGeos: THREE.BufferGeometry[] = [];
  const ridgeGeos: THREE.BufferGeometry[] = [];
  const gildedGeos: THREE.BufferGeometry[] = [];

  // =========================================================================
  // 1. 十七孔桥（19.6, 0.0, 9.8），rotation.y = -58° (P10 红线)
  // =========================================================================
  const archAnchors: ArchAnchor[] = [];
  const postTransforms: Array<{ x: number; y: number; z: number; ry: number }> = [];

  {
    const bx = LANDMARKS.seventeenArchBridge.x;
    const bz = LANDMARKS.seventeenArchBridge.z;
    const rotY = LANDMARKS.seventeenArchBridge.rotationY; // -58°
    const deckY = (x: number) => 0.84 - 0.42 * (x / 7.0) * (x / 7.0);

    // 17 孔精确递减公式：净跨 9.28 + 16 墩×0.18 + 2 端台×0.92 = 14.000u
    const pierW = 0.18;
    const abutW = 0.92;
    const bridgeShape = new THREE.Shape();
    bridgeShape.moveTo(-7.0, -0.95);
    bridgeShape.lineTo(7.0, -0.95);
    bridgeShape.lineTo(7.0, deckY(7.0));
    for (let i = 36; i >= 0; i--) {
      const x = -7.0 + (14.0 * i) / 36;
      bridgeShape.lineTo(x, deckY(x));
    }
    bridgeShape.closePath();

    let cursorX = -7.0 + abutW;
    const localRotMat = new THREE.Matrix4().makeRotationY(rotY);
    const bridgeNormalLocal = new THREE.Vector3(0, 0, 1).applyMatrix4(localRotMat).normalize();

    for (let k = -8; k <= 8; k++) {
      const ak = Math.abs(k);
      const r = 0.4 - 0.03 * ak;
      const ySpring = 0.22 - 0.02 * ak;
      const cx = cursorX + r;

      const archHole = new THREE.Path();
      archHole.moveTo(cx - r, -0.88);
      archHole.lineTo(cx - r, ySpring);
      archHole.absarc(cx, ySpring, r, Math.PI, 0, true);
      archHole.lineTo(cx + r, -0.88);
      archHole.closePath();
      bridgeShape.holes.push(archHole);

      const worldCenter = new THREE.Vector3(cx, ySpring + r * 0.42, 0)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY)
        .add(new THREE.Vector3(bx, 0, bz));

      archAnchors.push({
        center: worldCenter,
        normal: bridgeNormalLocal.clone(),
        radius: r,
        springY: ySpring,
      });

      cursorX += 2 * r + (k < 8 ? pierW : 0);
    }

    const bridgeBody = new THREE.ExtrudeGeometry(bridgeShape, {
      depth: 0.95,
      bevelEnabled: true,
      bevelSize: 0.015,
      bevelThickness: 0.015,
      bevelSegments: 2,
      curveSegments: 14,
    });
    bridgeBody.translate(0, 0, -0.475);
    const bUv = bridgeBody.attributes.uv;
    if (bUv) {
      for (let i = 0; i < bUv.count; i++) {
        bUv.setXY(i, bUv.getX(i) * 0.55, bUv.getY(i) * 0.55);
      }
    }
    bridgeBody.rotateY(rotY);
    bridgeBody.translate(bx, 0, bz);
    ashlarGeos.push(bridgeBody);

    // 抛物线弧形桥面铺装与双侧白玉弧形栏板 + 72 根望柱（每侧 36 根）
    const deckSegs = 36;
    const deckParts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < deckSegs; i++) {
      const x0 = -7.0 + (14.0 * i) / deckSegs;
      const x1 = -7.0 + (14.0 * (i + 1)) / deckSegs;
      const y0 = deckY(x0);
      const y1 = deckY(x1);
      const xm = (x0 + x1) * 0.5;
      const ym = (y0 + y1) * 0.5;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const segLen = Math.hypot(dx, dy) + 0.015;
      const pitch = Math.atan2(dy, dx);

      const tread = new THREE.BoxGeometry(segLen, 0.055, 0.86);
      tread.rotateZ(pitch);
      tread.translate(xm, ym + 0.01, 0);
      deckParts.push(tread);

      for (const sz of [-0.435, 0.435]) {
        const rail = new THREE.BoxGeometry(segLen, 0.14, 0.048);
        rail.rotateZ(pitch);
        rail.translate(xm, ym + 0.095, sz);
        deckParts.push(rail);
      }
    }
    // 两端衔接踏步斜坡（无缝咬合南湖岛与东堤）
    for (const endSign of [-1, 1]) {
      for (let s = 0; s < 5; s++) {
        const lx = endSign * (7.02 + s * 0.11);
        const ly = 0.42 - s * 0.055;
        deckParts.push(createBox(0.14, 0.34, 0.92, lx, ly - 0.15, 0));
      }
    }
    const mergedDeck = mergeBufferGeometries(deckParts);
    mergedDeck.rotateY(rotY);
    mergedDeck.translate(bx, 0, bz);
    marbleGeos.push(mergedDeck);

    // 72 根白玉石狮望柱坐标（两侧各 36 根）
    for (let i = 0; i < 36; i++) {
      const lx = -6.85 + (13.7 * i) / 35;
      const ly = deckY(lx) + 0.02;
      for (const lz of [-0.435, 0.435]) {
        const wp = new THREE.Vector3(lx, ly, lz)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY)
          .add(new THREE.Vector3(bx, 0, bz));
        postTransforms.push({ x: wp.x, y: wp.y, z: wp.z, ry: rotY + (lz > 0 ? 0 : Math.PI) });
      }
    }
  }

  // =========================================================================
  // 2. 西堤玉带桥（-17.28, 0.0, 2.0），rotation.y = +5.1°（单拱透水 + 28 级实砌石阶）
  // =========================================================================
  {
    const jx = LANDMARKS.jadeBeltBridge.x;
    const jz = LANDMARKS.jadeBeltBridge.z;
    const jRot = LANDMARKS.jadeBeltBridge.rotationY; // +5.1°
    // 在 Z-Y 平面构建驼峰拱桥剖面（本地 Z ∈ [-1.72, +1.72]），沿 X 挤出 0.85u
    const jadeDeckY = (z: number) => {
      const t = Math.abs(z) / 1.72;
      return 1.45 - 0.98 * t * t * (1.28 - 0.28 * t);
    };

    const jShape = new THREE.Shape();
    jShape.moveTo(-1.72, -0.92);
    jShape.lineTo(1.72, -0.92);
    jShape.lineTo(1.72, jadeDeckY(1.72));
    for (let i = 28; i >= 0; i--) {
      const z = -1.72 + (3.44 * i) / 28;
      jShape.lineTo(z, jadeDeckY(z));
    }
    jShape.closePath();

    // 高耸汉白玉单拱镂空（净跨 1.88u，拱顶 1.14u，直通水底 -0.88）
    const jArch = new THREE.Path();
    jArch.moveTo(-0.94, -0.88);
    jArch.lineTo(-0.94, 0.22);
    jArch.absarc(0, 0.22, 0.94, Math.PI, 0, true);
    jArch.lineTo(0.94, -0.88);
    jArch.closePath();
    jShape.holes.push(jArch);

    const jBody = new THREE.ExtrudeGeometry(jShape, {
      depth: 0.85,
      bevelEnabled: true,
      bevelSize: 0.014,
      bevelThickness: 0.014,
      bevelSegments: 2,
      curveSegments: 20,
    });
    // 将 Shape(X->Z, Y->Y) 转入本地桥向
    jBody.translate(0, 0, -0.425);
    jBody.rotateY(-Math.PI / 2);
    const jUv = jBody.attributes.uv;
    if (jUv) {
      for (let i = 0; i < jUv.count; i++) {
        jUv.setXY(i, jUv.getX(i) * 0.75, jUv.getY(i) * 0.75);
      }
    }

    const jadeParts: THREE.BufferGeometry[] = [jBody];

    // 28 级实砌汉白玉石阶桥面（南北各 14 级逐级攀升至桥顶拱心平台）
    const stairHalfCount = 14;
    for (let i = 0; i < stairHalfCount; i++) {
      const zCenter = 0.14 + (i + 0.5) * (1.56 / stairHalfCount);
      const yStep = jadeDeckY(zCenter) + 0.025;
      for (const s of [-1, 1]) {
        jadeParts.push(createBox(0.76, 0.075, 0.125, 0, yStep - 0.02, s * zCenter, 0.8));
      }
    }
    // 拱顶中央平石板
    jadeParts.push(createBox(0.76, 0.08, 0.3, 0, jadeDeckY(0) + 0.012, 0, 0.8));

    // 雕花弧形白玉栏板与 22 根莲花望柱
    for (let i = 0; i < 24; i++) {
      const z0 = -1.7 + (3.4 * i) / 24;
      const z1 = -1.7 + (3.4 * (i + 1)) / 24;
      const y0 = jadeDeckY(z0);
      const y1 = jadeDeckY(z1);
      const segLen = Math.hypot(z1 - z0, y1 - y0) + 0.015;
      const pitch = Math.atan2(y1 - y0, z1 - z0);
      for (const sx of [-0.395, 0.395]) {
        const rail = new THREE.BoxGeometry(0.048, 0.16, segLen);
        rail.rotateX(-pitch);
        rail.translate(sx, (y0 + y1) * 0.5 + 0.11, (z0 + z1) * 0.5);
        jadeParts.push(rail);
      }
    }
    for (let i = 0; i <= 10; i++) {
      const pz = -1.66 + (3.32 * i) / 10;
      const py = jadeDeckY(pz);
      for (const sx of [-0.395, 0.395]) {
        jadeParts.push(createBox(0.068, 0.24, 0.068, sx, py + 0.14, pz));
        const cap = new THREE.SphereGeometry(0.036, 6, 4);
        cap.translate(sx, py + 0.275, pz);
        jadeParts.push(cap);
      }
    }

    const mergedJade = mergeBufferGeometries(jadeParts);
    mergedJade.rotateY(jRot);
    mergedJade.translate(jx, 0, jz);
    marbleGeos.push(mergedJade);
  }

  // =========================================================================
  // 3. 西堤六角景亭 (-16.82, 7.2)
  // =========================================================================
  {
    const wx = LANDMARKS.westDikePavilion.x;
    const wz = LANDMARKS.westDikePavilion.z;
    const hexBase = new THREE.CylinderGeometry(0.76, 0.82, 0.86, 6);
    hexBase.rotateY(Math.PI / 2);
    hexBase.translate(wx, 0.18, wz);
    brickGeos.push(hexBase);
    for (let s = 0; s < 6; s++) {
      const a = (s / 6) * Math.PI * 2;
      const cx = wx + Math.cos(a) * 0.6;
      const cz = wz + Math.sin(a) * 0.6;
      const col = new THREE.CylinderGeometry(0.03, 0.034, 0.78, 6);
      col.translate(cx, 1.0, cz);
      redWoodGeos.push(col);
      const base = new THREE.CylinderGeometry(0.05, 0.056, 0.045, 6);
      base.translate(cx, 0.63, cz);
      marbleGeos.push(base);
    }
    const frieze = new THREE.CylinderGeometry(0.62, 0.62, 0.13, 6, 1, true);
    frieze.rotateY(Math.PI / 2);
    frieze.translate(wx, 1.35, wz);
    paintingGeos.push(frieze);
    darkWoodGeos.push(buildOctagonalDougongBand(wx, wz, 0.6, 1.38, 0.11, 6, 0));

    const hexRoof = buildOctagonalRoofParts({
      sides: 6,
      cx: wx,
      cz: wz,
      innerR: 0.0,
      outerR: 1.05,
      baseY: 1.46,
      peakY: 2.08,
      cornerLift: 0.14,
      cornerOut: 0.16,
      eaveThickness: 0.045,
    });
    greyTileGeos.push(hexRoof.mainTileGeo);
    greenTrimGeos.push(hexRoof.trimTileGeo);
    ridgeGeos.push(hexRoof.ridgeGeo);
    darkWoodGeos.push(hexRoof.soffitGeo);
    gildedGeos.push(buildGildedFinialGeometry(wx, 2.06, wz, 0.28, 0.075));
  }

  // =========================================================================
  // 4. 南湖岛涵虚堂 (12.6, 2.0) —— 环台白玉栏杆 + 二层歇山顶水榭
  // =========================================================================
  {
    const hx = LANDMARKS.hanxutang.x;
    const hz = LANDMARKS.hanxutang.z;
    const hTop = 1.05;

    brickGeos.push(createTaperedPrism(2.75, 2.15, 2.6, 2.0, hTop - 0.25, hx, 0.25, hz, 0.75));
    marbleGeos.push(createBox(2.68, 0.08, 2.08, hx, hTop - 0.04, hz, 0.6));
    marbleGeos.push(buildMarbleBalustradeSegment(hx - 1.28, hz - 0.98, hx - 0.42, hz - 0.98, hTop, 0.17, 0.42));
    marbleGeos.push(buildMarbleBalustradeSegment(hx + 0.42, hz - 0.98, hx + 1.28, hz - 0.98, hTop, 0.17, 0.42));
    marbleGeos.push(buildMarbleBalustradeSegment(hx - 1.28, hz + 0.98, hx + 1.28, hz + 0.98, hTop, 0.17, 0.42));
    marbleGeos.push(buildMarbleBalustradeSegment(hx - 1.28, hz - 0.98, hx - 1.28, hz + 0.98, hTop, 0.17, 0.42));
    marbleGeos.push(buildMarbleBalustradeSegment(hx + 1.28, hz - 0.98, hx + 1.28, hz + 0.98, hTop, 0.17, 0.42));

    // 一层柱网、隔扇、苏式彩画与下围檐
    latticeGeos.push(createBox(1.88, 0.62, 1.22, hx, hTop + 0.31, hz, 1.0));
    paintingGeos.push(createBox(2.08, 0.12, 1.42, hx, hTop + 0.58, hz, 1.0));
    for (let ix = 0; ix < 5; ix++) {
      const cx = hx - 0.98 + (1.96 * ix) / 4;
      for (const cz of [hz - 0.68, hz + 0.68]) {
        const col = new THREE.CylinderGeometry(0.028, 0.032, 0.64, 6);
        col.translate(cx, hTop + 0.32, cz);
        redWoodGeos.push(col);
      }
    }
    darkWoodGeos.push(buildRectDougongBand(hx, hz, 2.04, 1.38, hTop + 0.6, 0.11));
    const hxLower = buildXieshanRoofParts({
      cx: hx,
      cz: hz,
      width: 2.66,
      depth: 1.94,
      innerCutW: 1.72,
      innerCutD: 1.12,
      baseY: hTop + 0.66,
      ridgeY: hTop + 0.92,
      cornerLift: 0.1,
      cornerOut: 0.11,
      eaveThickness: 0.04,
    });
    greyTileGeos.push(hxLower.mainTileGeo);
    greenTrimGeos.push(hxLower.trimTileGeo);
    ridgeGeos.push(hxLower.ridgeGeo);
    darkWoodGeos.push(hxLower.soffitGeo);

    // 二层重檐主顶 (屋脊 Y = 2.75)
    latticeGeos.push(createBox(1.48, 0.3, 0.88, hx, hTop + 0.98, hz, 1.0));
    darkWoodGeos.push(buildRectDougongBand(hx, hz, 1.54, 0.94, hTop + 1.02, 0.11));
    const hxUpper = buildXieshanRoofParts({
      cx: hx,
      cz: hz,
      width: 2.38,
      depth: 1.66,
      baseY: hTop + 1.08,
      ridgeY: LANDMARKS.hanxutang.ridgeY, // 2.75
      ridgeLen: 1.24,
      cornerLift: 0.13,
      cornerOut: 0.14,
      eaveThickness: 0.042,
    });
    greyTileGeos.push(hxUpper.mainTileGeo);
    greenTrimGeos.push(hxUpper.trimTileGeo);
    ridgeGeos.push(hxUpper.ridgeGeo);
    darkWoodGeos.push(hxUpper.soffitGeo);
    if (hxUpper.gableGeo.attributes.position?.count) {
      redWoodGeos.push(hxUpper.gableGeo);
    }
  }

  // =========================================================================
  // 实例化 72 根十七孔桥望柱石狮
  // =========================================================================
  const lionGeo = createLionPostGeometry();
  const marbleTex = createMarbleCarvingTextures();
  const lionMat = new THREE.MeshStandardMaterial({
    map: marbleTex.map,
    normalMap: marbleTex.normalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.62,
    metalness: 0.04,
    color: 0xe6e3da,
  });
  enhanceMaterial(lionMat, { snow: true, snowThreshold: 0.56, snowStrength: 0.8 });

  const postsInst = new THREE.InstancedMesh(lionGeo, lionMat, postTransforms.length);
  postsInst.name = 'SeventeenArchLionPosts72';
  postsInst.castShadow = true;
  postsInst.receiveShadow = true;
  postsInst.userData.excludeFromAO = true;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < postTransforms.length; i++) {
    const p = postTransforms[i];
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.ry, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    postsInst.setMatrixAt(i, dummy.matrix);
  }
  postsInst.instanceMatrix.needsUpdate = true;
  group.add(postsInst);

  // =========================================================================
  // 合并静态建筑网格
  // =========================================================================
  const ashlarTex = createAshlarStoneTextures();
  const brickTex = createQingBrickTextures();
  const tileTex = createGlazedTileTextures();
  const latticeTex = createLatticeWindowTextures();
  const suzhouTex = createSuzhouPaintingTexture();

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
    ashlarGeos,
    'SeventeenArchBridgeBody',
    new THREE.MeshStandardMaterial({
      map: ashlarTex.map,
      normalMap: ashlarTex.normalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughnessMap: ashlarTex.roughnessMap,
      roughness: 0.8,
      metalness: 0.04,
      color: 0xd0cec4,
    }),
    { threshold: 0.54, strength: 0.82 }
  );

  addMerged(
    marbleGeos,
    'BridgesAndIslandMarble',
    new THREE.MeshStandardMaterial({
      map: marbleTex.map,
      normalMap: marbleTex.normalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.62,
      metalness: 0.04,
      color: 0xe6e3da,
    }),
    { threshold: 0.56, strength: 0.82 }
  );

  addMerged(
    brickGeos,
    'IslandAndWestDikePlinths',
    new THREE.MeshStandardMaterial({
      map: brickTex.map,
      normalMap: brickTex.normalMap,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughnessMap: brickTex.roughnessMap,
      roughness: 0.88,
      metalness: 0.03,
    }),
    { threshold: 0.56, strength: 0.8 }
  );

  addMerged(
    redWoodGeos,
    'IslandPavilionRedWood',
    new THREE.MeshStandardMaterial({
      color: 0x9b241b,
      roughness: 0.46,
      metalness: 0.05,
    })
  );

  addMerged(
    latticeGeos,
    'HanxutangLatticeDoors',
    new THREE.MeshStandardMaterial({
      map: latticeTex.map,
      normalMap: latticeTex.normalMap,
      roughness: 0.54,
      metalness: 0.04,
    })
  );

  addMerged(
    paintingGeos,
    'IslandPavilionSuzhouFrieze',
    new THREE.MeshStandardMaterial({
      map: suzhouTex,
      roughness: 0.56,
      metalness: 0.04,
    })
  );

  addMerged(
    darkWoodGeos,
    'IslandPavilionDougongSoffit',
    new THREE.MeshStandardMaterial({
      color: 0x241d19,
      roughness: 0.82,
      metalness: 0.04,
    })
  );

  addMerged(
    greyTileGeos,
    'IslandPavilionGreyRoofs',
    new THREE.MeshStandardMaterial({
      color: 0x626a72,
      map: tileTex.map,
      normalMap: tileTex.normalMap,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughnessMap: tileTex.roughnessMap,
      roughness: 0.6,
      metalness: 0.06,
    }),
    { threshold: 0.44, strength: 0.92 }
  );

  addMerged(
    greenTrimGeos,
    'IslandPavilionGreenTrim',
    new THREE.MeshStandardMaterial({
      color: 0x1e6b52,
      map: tileTex.map,
      normalMap: tileTex.normalMap,
      normalScale: new THREE.Vector2(0.95, 0.95),
      roughnessMap: tileTex.roughnessMap,
      roughness: 0.28,
      metalness: 0.12,
    }),
    { threshold: 0.44, strength: 0.92 }
  );

  addMerged(
    ridgeGeos,
    'IslandPavilionRidges',
    new THREE.MeshStandardMaterial({
      color: 0x45494e,
      roughness: 0.56,
      metalness: 0.08,
    }),
    { threshold: 0.52, strength: 0.85 }
  );

  addMerged(
    gildedGeos,
    'WestPavilionFinial',
    new THREE.MeshStandardMaterial({
      color: 0xf1c85b,
      metalness: 0.9,
      roughness: 0.22,
      envMapIntensity: 1.65,
    })
  );

  // =========================================================================
  // 5. 2 艘精雕双层画舫（零新增 DrawCall：合批船体/镂空窗阁/双层翘檐顶 + GPU V 型羽化尾波）
  // =========================================================================
  const paintGeometry = (geo: THREE.BufferGeometry, hexColor: number): THREE.BufferGeometry => {
    const pos = geo.attributes.position;
    if (!pos) return geo;
    const c = new THREE.Color(hexColor);
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return geo;
  };

  const mergeColoredGeometries = (geos: THREE.BufferGeometry[]): THREE.BufferGeometry => {
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
    const col = new Float32Array(totalVerts * 3);
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
        col[(vOff + i) * 3] = cAttr ? cAttr.getX(i) : 1;
        col[(vOff + i) * 3 + 1] = cAttr ? cAttr.getY(i) : 1;
        col[(vOff + i) * 3 + 2] = cAttr ? cAttr.getZ(i) : 1;
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
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  };

  // 5a. 流线型紫檀木雕船体 + 柚木甲板 + 鎏金舷线 + 首尾微型宫灯
  const hullParts: THREE.BufferGeometry[] = [];
  {
    const stations: Array<{ z: number; halfW: number; keelY: number; sheerY: number }> = [
      { z: -1.08, halfW: 0.035, keelY: 0.04, sheerY: 0.24 },
      { z: -0.94, halfW: 0.145, keelY: -0.02, sheerY: 0.2 },
      { z: -0.74, halfW: 0.23, keelY: -0.07, sheerY: 0.17 },
      { z: -0.5, halfW: 0.275, keelY: -0.095, sheerY: 0.15 },
      { z: -0.22, halfW: 0.292, keelY: -0.1, sheerY: 0.145 },
      { z: 0.08, halfW: 0.29, keelY: -0.1, sheerY: 0.145 },
      { z: 0.36, halfW: 0.268, keelY: -0.092, sheerY: 0.155 },
      { z: 0.62, halfW: 0.215, keelY: -0.072, sheerY: 0.175 },
      { z: 0.84, halfW: 0.138, keelY: -0.03, sheerY: 0.205 },
      { z: 1.0, halfW: 0.068, keelY: 0.02, sheerY: 0.235 },
      { z: 1.12, halfW: 0.022, keelY: 0.08, sheerY: 0.27 },
    ];
    const profCount = 5;
    const hPos: number[] = [];
    const hUv: number[] = [];
    const hIdx: number[] = [];
    for (let i = 0; i < stations.length; i++) {
      const s = stations[i];
      const bilgeY = s.keelY * 0.45 + s.sheerY * 0.55;
      const bilgeW = s.halfW * 0.8;
      const u = i / (stations.length - 1);
      const pts: Array<[number, number, number]> = [
        [-s.halfW, s.sheerY, s.z],
        [-bilgeW, bilgeY, s.z],
        [0, s.keelY, s.z],
        [bilgeW, bilgeY, s.z],
        [s.halfW, s.sheerY, s.z],
      ];
      for (let k = 0; k < profCount; k++) {
        hPos.push(pts[k][0], pts[k][1], pts[k][2]);
        hUv.push(u, k / (profCount - 1));
      }
      if (i < stations.length - 1) {
        const rowA = i * profCount;
        const rowB = (i + 1) * profCount;
        for (let k = 0; k < profCount - 1; k++) {
          const a0 = rowA + k;
          const a1 = rowA + k + 1;
          const b0 = rowB + k;
          const b1 = rowB + k + 1;
          hIdx.push(a0, a1, b0, b0, a1, b1);
        }
      }
    }
    const shellGeo = new THREE.BufferGeometry();
    shellGeo.setAttribute('position', new THREE.Float32BufferAttribute(hPos, 3));
    shellGeo.setAttribute('uv', new THREE.Float32BufferAttribute(hUv, 2));
    shellGeo.setIndex(hIdx);
    shellGeo.computeVertexNormals();
    hullParts.push(paintGeometry(shellGeo, 0x4b2619));

    // 柚木主甲板与前后收尖平台
    const dPos: number[] = [];
    const dUv: number[] = [];
    const dIdx: number[] = [];
    const deckY = 0.128;
    for (let i = 0; i < stations.length; i++) {
      const s = stations[i];
      const dw = Math.max(0.015, s.halfW * 0.92);
      const u = i / (stations.length - 1);
      dPos.push(-dw, deckY, s.z, 0, deckY + 0.008, s.z, dw, deckY, s.z);
      dUv.push(u, 0, u, 0.5, u, 1);
      if (i < stations.length - 1) {
        const ra = i * 3;
        const rb = (i + 1) * 3;
        dIdx.push(ra, rb, ra + 1, ra + 1, rb, rb + 1);
        dIdx.push(ra + 1, rb + 1, ra + 2, ra + 2, rb + 1, rb + 2);
      }
    }
    const deckGeo = new THREE.BufferGeometry();
    deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(dPos, 3));
    deckGeo.setAttribute('uv', new THREE.Float32BufferAttribute(dUv, 2));
    deckGeo.setIndex(dIdx);
    deckGeo.computeVertexNormals();
    hullParts.push(paintGeometry(deckGeo, 0x8d653e));

    // 船舷两侧弧形鎏金压边与船首尾龙首翘饰 + 宫灯
    for (let i = 0; i < stations.length - 1; i++) {
      const s0 = stations[i];
      const s1 = stations[i + 1];
      const len = Math.hypot(s1.halfW - s0.halfW, s1.z - s0.z) + 0.012;
      const midZ = (s0.z + s1.z) * 0.5;
      const midY = (s0.sheerY + s1.sheerY) * 0.5;
      const pitch = Math.atan2(s1.sheerY - s0.sheerY, s1.z - s0.z);
      for (const side of [-1, 1]) {
        const midX = side * (s0.halfW + s1.halfW) * 0.5;
        const yaw = Math.atan2(side * (s1.halfW - s0.halfW), s1.z - s0.z);
        const strip = new THREE.BoxGeometry(0.022, 0.024, len);
        strip.rotateX(-pitch);
        strip.rotateY(yaw);
        strip.translate(midX, midY + 0.004, midZ);
        hullParts.push(paintGeometry(strip, 0xcda145));
      }
    }

    // 船首龙首曲翘与船尾舵梢（严格先在本地原点旋转，再平移至首尾端，防止绕原点偏转下沉）
    const bowStem = createTaperedPrism(0.046, 0.1, 0.024, 0.055, 0.14, 0, 0, 0, 1.0);
    bowStem.rotateX(0.32);
    bowStem.translate(0, 0.24, 1.07);
    hullParts.push(paintGeometry(bowStem, 0x562b1b));
    hullParts.push(paintGeometry(createBox(0.036, 0.036, 0.055, 0, 0.31, 1.13, 1.0), 0xd8ae4f));
    const sternPost = createTaperedPrism(0.05, 0.095, 0.03, 0.06, 0.12, 0, 0, 0, 1.0);
    sternPost.rotateX(-0.28);
    sternPost.translate(0, 0.22, -1.03);
    hullParts.push(paintGeometry(sternPost, 0x562b1b));

    // 船首/船尾微型暖光宫灯
    for (const lz of [0.96, -0.94]) {
      const lantern = new THREE.CylinderGeometry(0.024, 0.02, 0.052, 8);
      lantern.translate(0, 0.41, lz);
      hullParts.push(paintGeometry(lantern, 0xf7cf78));
      const cap = new THREE.ConeGeometry(0.03, 0.02, 8);
      cap.translate(0, 0.442, lz);
      hullParts.push(paintGeometry(cap, 0x9b241b));
    }
  }
  const sharedHullGeo = mergeColoredGeometries(hullParts);

  // 5b. 镂空雕花隔扇窗画舫船阁（1 张 256×256 合批纹理涵盖苏式彩画楣带、菱花窗与朱红柱栏）
  const cabinParts: THREE.BufferGeometry[] = [];
  {
    const createMappedBox = (
      w: number,
      h: number,
      d: number,
      cx: number,
      cy: number,
      cz: number,
      frontU0: number,
      frontU1: number,
      sideU0: number,
      sideU1: number,
      v0: number,
      v1: number
    ): THREE.BufferGeometry => {
      const g = new THREE.BoxGeometry(w, h, d);
      const uv = g.attributes.uv;
      const norm = g.attributes.normal;
      for (let i = 0; i < uv.count; i++) {
        const nx = Math.abs(norm.getX(i));
        const ny = Math.abs(norm.getY(i));
        const rawU = uv.getX(i);
        const rawV = uv.getY(i);
        if (ny > 0.5) {
          uv.setXY(i, 0.2 + rawU * 0.6, 0.04 + rawV * 0.06);
        } else if (nx > 0.5) {
          uv.setXY(i, sideU0 + rawU * (sideU1 - sideU0), v0 + rawV * (v1 - v0));
        } else {
          uv.setXY(i, frontU0 + rawU * (frontU1 - frontU0), v0 + rawV * (v1 - v0));
        }
      }
      g.translate(cx, cy, cz);
      return g;
    };

    // 一层观景主阁（菱花透光窗 + 苏式彩画楣带 + 裙板）
    cabinParts.push(createMappedBox(0.43, 0.36, 0.84, 0, 0.305, -0.02, 0.25, 0.75, 0.0, 1.0, 0.06, 0.99));
    // 二层退台采光重阁（菱花窗 + 彩画楣带）
    cabinParts.push(createMappedBox(0.33, 0.2, 0.54, 0, 0.635, -0.02, 0.25, 0.75, 0.12, 0.88, 0.23, 0.99));

    // 朱红明柱、前廊栏杆与艉廊护栏（采样底部纯朱红条带 v ∈ [0.02, 0.09]）
    const redBox = (w: number, h: number, d: number, cx: number, cy: number, cz: number) =>
      createMappedBox(w, h, d, cx, cy, cz, 0.1, 0.9, 0.1, 0.9, 0.02, 0.085);

    for (const lz of [-0.43, -0.14, 0.14, 0.39]) {
      for (const lx of [-0.24, 0.24]) {
        const col = new THREE.CylinderGeometry(0.014, 0.016, 0.36, 6);
        const cUv = col.attributes.uv;
        for (let i = 0; i < cUv.count; i++) cUv.setXY(i, 0.35, 0.05);
        col.translate(lx, 0.305, lz);
        cabinParts.push(col);
      }
    }
    // 船头与船尾观景低栏与角柱
    for (const side of [-1, 1]) {
      cabinParts.push(redBox(0.018, 0.085, 0.34, side * 0.21, 0.175, 0.57));
      cabinParts.push(redBox(0.018, 0.085, 0.32, side * 0.21, 0.175, -0.6));
      cabinParts.push(redBox(0.024, 0.125, 0.024, side * 0.18, 0.195, 0.74));
      cabinParts.push(redBox(0.024, 0.125, 0.024, side * 0.18, 0.195, -0.76));
    }
    cabinParts.push(redBox(0.36, 0.085, 0.018, 0, 0.175, 0.74));
    cabinParts.push(redBox(0.36, 0.085, 0.018, 0, 0.175, -0.76));
    // 船首/船尾宫灯挑杆
    cabinParts.push(redBox(0.016, 0.24, 0.016, 0, 0.36, 0.95));
    cabinParts.push(redBox(0.016, 0.24, 0.016, 0, 0.36, -0.93));
  }
  const sharedBoatCabinGeo = mergeColoredGeometries(cabinParts);

  // 5c. 双层御黄琉璃绿剪边起翘歇山顶（合并于 1 张瓦纹材质上用顶点色精密分色）
  const boatLowerRoof = buildXieshanRoofParts({
    cx: 0,
    cz: -0.02,
    width: 1.24,
    depth: 0.64,
    innerCutW: 0.66,
    innerCutD: 0.38,
    baseY: 0.47,
    ridgeY: 0.6,
    cornerLift: 0.055,
    cornerOut: 0.055,
    eaveThickness: 0.026,
    rotationY: Math.PI / 2,
  });
  const boatUpperRoof = buildXieshanRoofParts({
    cx: 0,
    cz: -0.02,
    width: 0.92,
    depth: 0.54,
    baseY: 0.72,
    ridgeY: 0.94,
    ridgeLen: 0.48,
    cornerLift: 0.075,
    cornerOut: 0.075,
    eaveThickness: 0.028,
    rotationY: Math.PI / 2,
  });
  // 释放殿阁尺度默认屋脊并替换为微缩画舫专属纤细屋脊
  boatLowerRoof.ridgeGeo.dispose();
  boatUpperRoof.ridgeGeo.dispose();

  const slimRidgeParts: THREE.BufferGeometry[] = [];
  const addSlimRidge = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, thickness = 0.018) => {
    const a = new THREE.Vector3(ax, ay, az);
    const b = new THREE.Vector3(bx, by, bz);
    const len = a.distanceTo(b) + 0.01;
    const bar = new THREE.BoxGeometry(thickness, thickness, len);
    bar.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize())
    );
    bar.translate((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5);
    slimRidgeParts.push(bar);
    slimRidgeParts.push(createBox(0.024, 0.028, 0.024, bx, by + 0.012, bz, 1.0));
  };

  // 上层画舫主正脊与微型吻兽
  slimRidgeParts.push(createBox(0.026, 0.028, 0.52, 0, 0.945, -0.02, 1.0));
  slimRidgeParts.push(createBox(0.028, 0.044, 0.032, 0, 0.96, -0.28, 1.0));
  slimRidgeParts.push(createBox(0.028, 0.044, 0.032, 0, 0.96, 0.24, 1.0));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // 上层四斜垂脊
      addSlimRidge(0, 0.945, -0.02 + sz * 0.24, sx * 0.326, 0.805, -0.02 + sz * 0.516, 0.018);
      // 下层四斜垂脊
      addSlimRidge(sx * 0.19, 0.605, -0.02 + sz * 0.33, sx * 0.361, 0.535, -0.02 + sz * 0.661, 0.018);
    }
  }
  const boatSlimRidgeGeo = paintGeometry(mergeBufferGeometries(slimRidgeParts), 0x46484b);

  const roofBuckets: THREE.BufferGeometry[] = [
    paintGeometry(boatLowerRoof.mainTileGeo, 0xe0aa2b),
    paintGeometry(boatLowerRoof.trimTileGeo, 0x1e6b52),
    paintGeometry(boatLowerRoof.soffitGeo, 0x281e18),
    paintGeometry(boatUpperRoof.mainTileGeo, 0xe0aa2b),
    paintGeometry(boatUpperRoof.trimTileGeo, 0x1e6b52),
    paintGeometry(boatUpperRoof.soffitGeo, 0x281e18),
    boatSlimRidgeGeo,
    paintGeometry(buildGildedFinialGeometry(0, 0.93, -0.02, 0.13, 0.036), 0xf1c85b),
  ];
  if (boatLowerRoof.gableGeo.attributes.position?.count) {
    roofBuckets.push(paintGeometry(boatLowerRoof.gableGeo, 0x9b241b));
  } else {
    boatLowerRoof.gableGeo.dispose();
  }
  if (boatUpperRoof.gableGeo.attributes.position?.count) {
    roofBuckets.push(paintGeometry(boatUpperRoof.gableGeo, 0x9b241b));
  } else {
    boatUpperRoof.gableGeo.dispose();
  }
  const sharedBoatRoofGeo = mergeColoredGeometries(roofBuckets);

  // 5d. 羽化 Kelvin V 型船尾水波纹（ShaderMaterial，边缘衰减至零，冬日结冰自动隐退）
  const wakeGeo = new THREE.PlaneGeometry(2.6, 3.8);
  wakeGeo.rotateX(-Math.PI / 2);
  wakeGeo.translate(0, 0.012, -1.25);

  const hullMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.45,
    metalness: 0.14,
  });
  const boatCabinMat = new THREE.MeshStandardMaterial({
    map: createBoatCabinTexture(),
    roughness: 0.48,
    metalness: 0.05,
  });
  const boatRoofMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: tileTex.map,
    normalMap: tileTex.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.28,
    metalness: 0.14,
  });
  enhanceMaterial(boatRoofMat, { snow: true, snowThreshold: 0.46, snowStrength: 0.9 });

  const wakeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: SHARED_UNIFORMS.uTime,
      uIceFactor: SHARED_UNIFORMS.uIceFactor,
      uThemeDark: SHARED_UNIFORMS.uThemeDark,
      uBoatSpeed: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: /* glsl */ `
uniform float uTime;
uniform float uIceFactor;
uniform float uThemeDark;
uniform float uBoatSpeed;
varying vec2 vUv;

void main() {
  float iceFade = 1.0 - smoothstep(0.15, 0.75, uIceFactor);
  if (iceFade <= 0.01) discard;
  float speedMask = smoothstep(0.05, 0.85, uBoatSpeed);

  float lx = (vUv.x - 0.5) * 2.6;
  float aftDist = 1.25 + (vUv.y - 0.5) * 3.8;
  float sternDist = max(0.0, aftDist - 0.72);

  // 约 19.5° Kelvin 船尾 V 型扩散波臂 + 动态向后推进轻涟漪
  float armX = 0.22 + sternDist * 0.354;
  float armBand = exp(-pow((abs(lx) - armX) / (0.085 + sternDist * 0.088), 2.0));
  float chevronPhase = sternDist * 13.5 - uTime * 2.4 - abs(lx) * 2.5;
  float chevronWave = 0.48 + 0.52 * sin(chevronPhase);
  float vWake = armBand * chevronWave * smoothstep(0.0, 0.24, sternDist) * (1.0 - smoothstep(0.95, 2.35, sternDist));

  // 船尾中心柔白余波 + 船舷贴水微漪
  float centerTrail = exp(-pow(lx / (0.14 + sternDist * 0.13), 2.0))
    * (0.52 + 0.48 * sin(sternDist * 16.0 - uTime * 2.8))
    * smoothstep(0.0, 0.16, sternDist) * (1.0 - smoothstep(0.45, 1.65, sternDist));

  float zHull = -aftDist;
  float rHull = length(vec2(lx / 0.34, zHull / 1.05));
  float hullHalo = exp(-pow((rHull - 1.04) / 0.13, 2.0)) * 0.42
    * (0.72 + 0.28 * sin(rHull * 12.0 - uTime * 1.9));

  // 四边柔滑衰减至零，彻底杜绝片状轮廓
  float boxMask = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x)
                * smoothstep(0.0, 0.14, vUv.y) * smoothstep(1.0, 0.74, vUv.y);

  float wakeStrength = vWake * 0.85 * speedMask
                     + centerTrail * 0.42 * speedMask
                     + hullHalo * 0.55 * (0.22 + 0.78 * speedMask);
  float alpha = clamp(wakeStrength * boxMask * iceFade, 0.0, 1.0) * 0.34;
  if (alpha <= 0.004) discard;

  vec3 col = mix(vec3(0.84, 0.93, 0.92), vec3(0.48, 0.60, 0.68), uThemeDark);
  gl_FragColor = vec4(col, alpha);
}`,
  });

  const initialBoatPlacements: Array<{ x: number; z: number; yaw: number }> = [
    { x: 0.0, z: -1.2, yaw: Math.PI * 0.46 },
    { x: -7.2, z: 16.5, yaw: Math.PI * 0.16 },
  ];

  const boats: THREE.Group[] = [];
  const boatHandles: BoatHandle[] = [];
  for (let i = 0; i < initialBoatPlacements.length; i++) {
    const bp = initialBoatPlacements[i];
    const boatGroup = new THREE.Group();
    boatGroup.name = `PaintedBoat_${i + 1}`;
    boatGroup.position.set(bp.x, 0.0, bp.z);
    boatGroup.rotation.y = bp.yaw;

    const hullMesh = new THREE.Mesh(sharedHullGeo, hullMat);
    hullMesh.name = `BoatHullAndTrim_${i + 1}`;
    hullMesh.castShadow = true;
    hullMesh.receiveShadow = true;

    const cabinMesh = new THREE.Mesh(sharedBoatCabinGeo, boatCabinMat);
    cabinMesh.name = `BoatCabinWoodAndLattice_${i + 1}`;
    cabinMesh.castShadow = true;
    cabinMesh.receiveShadow = true;

    const roofMesh = new THREE.Mesh(sharedBoatRoofGeo, boatRoofMat);
    roofMesh.name = `BoatGlazedRoof_${i + 1}`;
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;

    // 克隆独立尾波材质并显式重绑共享 Uniform 引用（避免 ShaderMaterial.clone 深拷贝断开实时时间与结冰同步）
    const perWakeMat = i === 0 ? wakeMat : wakeMat.clone();
    perWakeMat.uniforms.uTime = SHARED_UNIFORMS.uTime;
    perWakeMat.uniforms.uIceFactor = SHARED_UNIFORMS.uIceFactor;
    perWakeMat.uniforms.uThemeDark = SHARED_UNIFORMS.uThemeDark;
    const wakeSpeedUniform = { value: 1.0 };
    perWakeMat.uniforms.uBoatSpeed = wakeSpeedUniform;

    const wakeMesh = new THREE.Mesh(wakeGeo, perWakeMat);
    wakeMesh.name = `BoatWake_${i + 1}`;
    wakeMesh.renderOrder = 2;
    wakeMesh.castShadow = false;
    wakeMesh.receiveShadow = false;
    wakeMesh.userData.excludeFromAO = true;

    boatGroup.add(hullMesh, cabinMesh, roofMesh, wakeMesh);
    group.add(boatGroup);
    boats.push(boatGroup);
    boatHandles.push({ group: boatGroup, wakeSpeedUniform });
  }

  return {
    group,
    archAnchors,
    boats,
    boatHandles,
    bridgePostsCount: postTransforms.length,
  };
}
