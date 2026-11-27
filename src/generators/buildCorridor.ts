import * as THREE from 'three';
import { LANDMARKS } from '../config/sceneConfig';
import { enhanceMaterial } from '../core/shaders';
import { getCorridorCenterZ } from '../core/terrainMath';
import {
  createGlazedTileTextures,
  createMarbleCarvingTextures,
  createQingBrickTextures,
  createSuzhouPaintingTexture,
} from '../textures/proceduralPBR';
import {
  buildGildedFinialGeometry,
  buildOctagonalDougongBand,
  buildOctagonalRoofParts,
  mergeBufferGeometries,
} from './archUtils';

export interface CorridorResult {
  group: THREE.Group;
  corridorColumnsCount: number;
}

interface SweepFrame {
  pos: THREE.Vector3;
  tan: THREE.Vector3;
  right: THREE.Vector3;
  arcLen: number;
}

interface ProfilePoint {
  offsetRight: number;
  y: number;
  vCoord: number;
}

function buildTwistFreeFrames(curve: THREE.CatmullRomCurve3, segments: number): SweepFrame[] {
  const up = new THREE.Vector3(0, 1, 0);
  const frames: SweepFrame[] = [];
  let accLen = 0;
  let prevPos: THREE.Vector3 | null = null;

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const pos = curve.getPointAt(u);
    const rawTan = curve.getTangentAt(u);
    const tan = new THREE.Vector3(rawTan.x, 0, rawTan.z).normalize();
    // 严格以固定 UP=(0,1,0) 叉乘求右法向，杜绝 Frenet 标架在拐点发生 180° 翻转
    const right = new THREE.Vector3().crossVectors(tan, up).normalize();
    if (prevPos) {
      accLen += pos.distanceTo(prevPos);
    }
    prevPos = pos.clone();
    frames.push({ pos, tan, right, arcLen: accLen });
  }
  return frames;
}

/**
 * 按顺时针剖面绕序（面向 +tan 观察）无扭曲扫掠出法向严格朝外的网格，并封闭两端截面
 */
function sweepProfileAlongFrames(
  frames: SweepFrame[],
  profile: ProfilePoint[],
  uvUScale = 1.0,
  capEnds = true
): THREE.BufferGeometry {
  const nFrames = frames.length;
  const nProf = profile.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < nFrames; i++) {
    const f = frames[i];
    const u = f.arcLen * uvUScale;
    for (let k = 0; k < nProf; k++) {
      const p = profile[k];
      pos.push(
        f.pos.x + f.right.x * p.offsetRight,
        p.y,
        f.pos.z + f.right.z * p.offsetRight
      );
      uv.push(u, p.vCoord);
    }
  }

  for (let i = 0; i < nFrames - 1; i++) {
    const rowA = i * nProf;
    const rowB = (i + 1) * nProf;
    for (let k = 0; k < nProf - 1; k++) {
      const a0 = rowA + k;
      const a1 = rowA + k + 1;
      const b0 = rowB + k;
      const b1 = rowB + k + 1;
      // 顺时针剖面沿 +tan 扫掠：(a1 - a0) × (b0 - a0) 严格指向剖面外法向
      indices.push(a0, a1, b0, b0, a1, b1);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();

  if (!capEnds || nProf < 3) return g;

  const endGeos: THREE.BufferGeometry[] = [g];
  const makeCap = (frame: SweepFrame, flip: boolean) => {
    const shape = new THREE.Shape();
    shape.moveTo(profile[0].offsetRight, profile[0].y);
    for (let k = 1; k < nProf; k++) {
      shape.lineTo(profile[k].offsetRight, profile[k].y);
    }
    shape.closePath();
    const cap = new THREE.ShapeGeometry(shape);
    const pAttr = cap.attributes.position;
    for (let j = 0; j < pAttr.count; j++) {
      const rOff = pAttr.getX(j);
      const py = pAttr.getY(j);
      pAttr.setXYZ(
        j,
        frame.pos.x + frame.right.x * rOff,
        py,
        frame.pos.z + frame.right.z * rOff
      );
    }
    if (flip && cap.index) {
      const idx = cap.index.array as Uint16Array | Uint32Array;
      for (let j = 0; j < idx.length; j += 3) {
        const tmp = idx[j + 1];
        idx[j + 1] = idx[j + 2];
        idx[j + 2] = tmp;
      }
    }
    cap.computeVertexNormals();
    return cap;
  };
  endGeos.push(makeCap(frames[0], false));
  endGeos.push(makeCap(frames[nFrames - 1], true));
  return mergeBufferGeometries(endGeos);
}

/** 构造两侧对称的苏式彩画额枋竖向矩形带（确保每段长廊外侧面均清晰显示 512×128 彩画） */
function sweepVerticalBand(
  frames: SweepFrame[],
  offsetRight: number,
  yBot: number,
  yTop: number,
  facingSign: 1 | -1,
  uvUScale: number
): THREE.BufferGeometry {
  const n = frames.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < n; i++) {
    const f = frames[i];
    const x = f.pos.x + f.right.x * offsetRight;
    const z = f.pos.z + f.right.z * offsetRight;
    const u = f.arcLen * uvUScale;
    pos.push(x, yBot, z, x, yTop, z);
    uv.push(u, 0, u, 1);
    if (i < n - 1) {
      const a = i * 2;
      const b = (i + 1) * 2;
      if (facingSign === 1) {
        // 朝 +right (+Z 湖侧)
        indices.push(a + 1, a + 0, b + 1, b + 1, a + 0, b + 0);
      } else {
        // 朝 -right (-Z 山侧)
        indices.push(a + 0, a + 1, b + 0, b + 0, a + 1, b + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/**
 * 构建沿湖长廊（东西两翼，无扭曲扫掠 + 116 根朱红明柱 + 倒挂楣子 + 512×128 苏式彩画 + 4 座八角重檐亭）
 */
export function buildCorridor(): CorridorResult {
  const group = new THREE.Group();
  group.name = 'LongCorridorAndPavilions';

  const plinthGeos: THREE.BufferGeometry[] = [];
  const paintingGeos: THREE.BufferGeometry[] = [];
  const redWoodGeos: THREE.BufferGeometry[] = [];
  const soffitGeos: THREE.BufferGeometry[] = [];
  const greyTileGeos: THREE.BufferGeometry[] = [];
  const greenTrimGeos: THREE.BufferGeometry[] = [];
  const ridgeGeos: THREE.BufferGeometry[] = [];
  const gildedGeos: THREE.BufferGeometry[] = [];
  const marbleGeos: THREE.BufferGeometry[] = [];

  const columnTransforms: Array<{ x: number; y: number; z: number }> = [];
  const baseY = LANDMARKS.corridor.embedBottomY; // -0.35
  const floorY = LANDMARKS.corridor.topY; // 0.82
  const halfBase = LANDMARKS.corridor.baseW * 0.5; // 0.575
  const halfEave = LANDMARKS.corridor.eaveW * 0.5; // 0.71

  const wings: Array<{ xMin: number; xMax: number }> = [
    { xMin: LANDMARKS.corridor.westXMin, xMax: LANDMARKS.corridor.westXMax },
    { xMin: LANDMARKS.corridor.eastXMin, xMax: LANDMARKS.corridor.eastXMax },
  ];

  // 青石条基剖面（顺时针：底左 -> 顶左 -> 顶右 -> 底右）
  const plinthProfile: ProfilePoint[] = [
    { offsetRight: -halfBase, y: baseY, vCoord: 1.0 },
    { offsetRight: -halfBase, y: floorY, vCoord: 0.0 },
    { offsetRight: halfBase, y: floorY, vCoord: 0.45 },
    { offsetRight: halfBase, y: baseY, vCoord: 1.0 },
  ];

  // 灰筒瓦卷棚顶剖面（弧形拱脊 + 滴水檐口 + 底板封口，顺时针）
  const roofProfile: ProfilePoint[] = [
    { offsetRight: -halfEave, y: 1.66, vCoord: 0.0 },
    { offsetRight: -halfEave * 0.68, y: 1.84, vCoord: 0.24 },
    { offsetRight: -halfEave * 0.28, y: 1.97, vCoord: 0.42 },
    { offsetRight: 0, y: 2.02, vCoord: 0.5 },
    { offsetRight: halfEave * 0.28, y: 1.97, vCoord: 0.58 },
    { offsetRight: halfEave * 0.68, y: 1.84, vCoord: 0.76 },
    { offsetRight: halfEave, y: 1.66, vCoord: 1.0 },
  ];

  // 檐底暗木仰面闭合板
  const soffitProfile: ProfilePoint[] = [
    { offsetRight: halfEave, y: 1.64, vCoord: 1.0 },
    { offsetRight: 0, y: 1.72, vCoord: 0.5 },
    { offsetRight: -halfEave, y: 1.64, vCoord: 0.0 },
  ];

  // 两侧美人靠朱红坐栏剖面
  const makeBenchProfile = (side: 1 | -1): ProfilePoint[] => {
    const cx = side * 0.44;
    const hw = 0.04;
    return [
      { offsetRight: cx - hw, y: floorY, vCoord: 0 },
      { offsetRight: cx - hw, y: floorY + 0.14, vCoord: 0.5 },
      { offsetRight: cx + hw, y: floorY + 0.14, vCoord: 1 },
      { offsetRight: cx + hw, y: floorY, vCoord: 0.5 },
    ];
  };

  for (const wing of wings) {
    const ctrlPts: THREE.Vector3[] = [];
    const ctrlCount = 18;
    for (let i = 0; i <= ctrlCount; i++) {
      const x = wing.xMin + ((wing.xMax - wing.xMin) * i) / ctrlCount;
      ctrlPts.push(new THREE.Vector3(x, floorY, getCorridorCenterZ(x)));
    }
    const curve = new THREE.CatmullRomCurve3(ctrlPts, false, 'centripetal');
    const frames = buildTwistFreeFrames(curve, 96);

    plinthGeos.push(sweepProfileAlongFrames(frames, plinthProfile, 0.7, true));
    greyTileGeos.push(sweepProfileAlongFrames(frames, roofProfile, 1.35, true));
    soffitGeos.push(sweepProfileAlongFrames(frames, soffitProfile, 1.0, false));
    redWoodGeos.push(sweepProfileAlongFrames(frames, makeBenchProfile(1), 0.8, true));
    redWoodGeos.push(sweepProfileAlongFrames(frames, makeBenchProfile(-1), 0.8, true));

    // 双侧苏式包袱彩画额枋（1.44 -> 1.66，弧长比例 1/1.52 令每间出现一幅完整 512×128 彩画）
    paintingGeos.push(sweepVerticalBand(frames, 0.48, 1.44, 1.65, 1, 0.65));
    paintingGeos.push(sweepVerticalBand(frames, -0.48, 1.44, 1.65, -1, 0.65));
    // 额枋底板与顶压条（防漏光）
    for (const side of [-1, 1] as const) {
      redWoodGeos.push(
        sweepProfileAlongFrames(
          frames,
          [
            { offsetRight: side * 0.48 - 0.04, y: 1.41, vCoord: 0 },
            { offsetRight: side * 0.48 - 0.04, y: 1.445, vCoord: 0.5 },
            { offsetRight: side * 0.48 + 0.04, y: 1.445, vCoord: 1 },
            { offsetRight: side * 0.48 + 0.04, y: 1.41, vCoord: 0.5 },
          ],
          1.0,
          false
        )
      );
    }

    // 每翼 29 对 = 58 根（两翼合计精确 116 根朱红明柱）+ 镂空倒挂楣子花牙子
    const pairCount = 29;
    const pavCenters = LANDMARKS.corridor.pavilionTs.map((t) => curve.getPointAt(t));

    for (let i = 0; i < pairCount; i++) {
      const u = (i + 0.5) / pairCount;
      const pt = curve.getPointAt(u);
      const rawTan = curve.getTangentAt(u);
      const tan = new THREE.Vector3(rawTan.x, 0, rawTan.z).normalize();
      const right = new THREE.Vector3(-tan.z, 0, tan.x);

      // 若落在亭心内部则稍微偏移至亭外框，确保 116 根明柱全部可见且不穿心
      let px = pt.x;
      let pz = pt.z;
      for (const pc of pavCenters) {
        const dist = Math.hypot(px - pc.x, pz - pc.z);
        if (dist < 0.65) {
          const pushSign = px >= pc.x ? 1 : -1;
          px = pc.x + tan.x * pushSign * 0.72;
          pz = pc.z + tan.z * pushSign * 0.72;
        }
      }

      for (const s of [-1, 1]) {
        const cxCol = px + right.x * 0.45 * s;
        const czCol = pz + right.z * 0.45 * s;
        columnTransforms.push({ x: cxCol, y: floorY, z: czCol });

        // 柱侧对称镂空朱红倒挂楣子（花牙垂片）
        const yaw = Math.atan2(tan.x, tan.z);
        const bracket = new THREE.BoxGeometry(0.032, 0.13, 0.22);
        bracket.rotateY(yaw);
        bracket.translate(cxCol, 1.35, czCol);
        redWoodGeos.push(bracket);

        const pendant = new THREE.BoxGeometry(0.028, 0.065, 0.055);
        pendant.rotateY(yaw);
        pendant.translate(cxCol, 1.26, czCol);
        redWoodGeos.push(pendant);
      }
    }

    // 两翼共 4 座八角重檐翘角亭（留佳、寄澜、秋水、清遥，位于 t = 0.28, 0.72）
    for (const t of LANDMARKS.corridor.pavilionTs) {
      const pCenter = curve.getPointAt(t);
      const rawTan = curve.getTangentAt(t);
      const pYaw = Math.atan2(rawTan.z, rawTan.x);
      const px = pCenter.x;
      const pz = pCenter.z;

      // 八角石台基 + 白玉压边环
      const octPlinth = new THREE.CylinderGeometry(0.95, 1.0, floorY - baseY + 0.04, 8);
      octPlinth.rotateY(Math.PI / 2 - pYaw);
      octPlinth.translate(px, (floorY + baseY + 0.04) * 0.5, pz);
      plinthGeos.push(octPlinth);

      const octCap = new THREE.CylinderGeometry(0.99, 0.99, 0.06, 8);
      octCap.rotateY(Math.PI / 2 - pYaw);
      octCap.translate(px, floorY + 0.015, pz);
      marbleGeos.push(octCap);

      // 8 根亭柱 + 柱础
      for (let s = 0; s < 8; s++) {
        const a = pYaw + (s / 8) * Math.PI * 2;
        const colX = px + Math.cos(a) * 0.88;
        const colZ = pz + Math.sin(a) * 0.88;
        const col = new THREE.CylinderGeometry(0.036, 0.04, 1.05, 8);
        col.translate(colX, floorY + 0.55, colZ);
        redWoodGeos.push(col);

        const base = new THREE.CylinderGeometry(0.055, 0.064, 0.05, 8);
        base.translate(colX, floorY + 0.055, colZ);
        marbleGeos.push(base);
      }

      // 亭檐苏式彩画环带与斗拱阴影槽
      const pavFrieze = new THREE.CylinderGeometry(0.92, 0.92, 0.16, 8, 1, true);
      pavFrieze.rotateY(Math.PI / 2 - pYaw);
      pavFrieze.translate(px, 1.72, pz);
      paintingGeos.push(pavFrieze);

      soffitGeos.push(buildOctagonalDougongBand(px, pz, 0.9, 1.78, 0.14, 8, pYaw));

      // 下重檐八角起翘顶 (1.86 -> 2.24)
      const lowerEave = buildOctagonalRoofParts({
        sides: 8,
        cx: px,
        cz: pz,
        innerR: 0.72,
        outerR: 1.38,
        baseY: 1.86,
        peakY: 2.24,
        cornerLift: 0.16,
        cornerOut: 0.18,
        eaveThickness: 0.05,
        rotationY: pYaw,
      });
      greyTileGeos.push(lowerEave.mainTileGeo);
      greenTrimGeos.push(lowerEave.trimTileGeo);
      ridgeGeos.push(lowerEave.ridgeGeo);
      soffitGeos.push(lowerEave.soffitGeo);

      // 二层亭身与斗拱
      const upperFrieze = new THREE.CylinderGeometry(0.68, 0.68, 0.24, 8, 1, true);
      upperFrieze.rotateY(Math.PI / 2 - pYaw);
      upperFrieze.translate(px, 2.26, pz);
      paintingGeos.push(upperFrieze);
      soffitGeos.push(buildOctagonalDougongBand(px, pz, 0.68, 2.34, 0.13, 8, pYaw));

      // 上重檐八角攒尖顶 (2.42 -> 3.14) + 鎏金宝顶
      const upperRoof = buildOctagonalRoofParts({
        sides: 8,
        cx: px,
        cz: pz,
        innerR: 0.0,
        outerR: 1.18,
        baseY: 2.42,
        peakY: 3.14,
        cornerLift: 0.18,
        cornerOut: 0.2,
        eaveThickness: 0.045,
        rotationY: pYaw,
      });
      greyTileGeos.push(upperRoof.mainTileGeo);
      greenTrimGeos.push(upperRoof.trimTileGeo);
      ridgeGeos.push(upperRoof.ridgeGeo);
      soffitGeos.push(upperRoof.soffitGeo);
      gildedGeos.push(buildGildedFinialGeometry(px, 3.12, pz, 0.36, 0.095));
    }
  }

  // 实例化 116 根朱红明柱与 116 枚柱础石
  const colGeo = new THREE.CylinderGeometry(0.03, 0.034, 0.85, 8);
  colGeo.translate(0, 0.425, 0);
  const colMat = new THREE.MeshStandardMaterial({
    color: 0x9b241b,
    roughness: 0.44,
    metalness: 0.05,
  });
  const colInst = new THREE.InstancedMesh(colGeo, colMat, columnTransforms.length);
  colInst.name = 'CorridorColumns116';
  colInst.castShadow = true;
  colInst.receiveShadow = true;

  const baseGeo = new THREE.CylinderGeometry(0.048, 0.056, 0.055, 8);
  baseGeo.translate(0, 0.0275, 0);
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0xe2dfd5,
    roughness: 0.64,
    metalness: 0.04,
  });
  const baseInst = new THREE.InstancedMesh(baseGeo, baseMat, columnTransforms.length);
  baseInst.name = 'CorridorColumnBases116';
  baseInst.castShadow = false;
  baseInst.receiveShadow = true;
  baseInst.userData.excludeFromAO = true;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < columnTransforms.length; i++) {
    const c = columnTransforms[i];
    dummy.position.set(c.x, c.y, c.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    colInst.setMatrixAt(i, dummy.matrix);
    baseInst.setMatrixAt(i, dummy.matrix);
  }
  colInst.instanceMatrix.needsUpdate = true;
  baseInst.instanceMatrix.needsUpdate = true;
  group.add(colInst);
  group.add(baseInst);

  const brickTex = createQingBrickTextures();
  const tileTex = createGlazedTileTextures();
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
    plinthGeos,
    'CorridorStonePlinth',
    new THREE.MeshStandardMaterial({
      map: brickTex.map,
      normalMap: brickTex.normalMap,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughnessMap: brickTex.roughnessMap,
      roughness: 0.86,
      metalness: 0.03,
    }),
    { threshold: 0.56, strength: 0.8 }
  );

  // 苏式包袱彩画额枋严禁积雪
  addMerged(
    paintingGeos,
    'CorridorSuzhouPaintings',
    new THREE.MeshStandardMaterial({
      map: suzhouTex,
      roughness: 0.54,
      metalness: 0.04,
    })
  );

  addMerged(
    redWoodGeos,
    'CorridorRedWoodwork',
    new THREE.MeshStandardMaterial({
      color: 0x9b241b,
      roughness: 0.46,
      metalness: 0.05,
    })
  );

  addMerged(
    soffitGeos,
    'CorridorSoffitDougong',
    new THREE.MeshStandardMaterial({
      color: 0x241d19,
      roughness: 0.82,
      metalness: 0.04,
    })
  );

  addMerged(
    marbleGeos,
    'CorridorPavilionMarble',
    new THREE.MeshStandardMaterial({
      map: marbleTex.map,
      normalMap: marbleTex.normalMap,
      roughness: 0.64,
      metalness: 0.04,
      color: 0xe6e3da,
    })
  );

  addMerged(
    greyTileGeos,
    'CorridorGreyTileRoofs',
    new THREE.MeshStandardMaterial({
      color: 0x5c646c,
      map: tileTex.map,
      normalMap: tileTex.normalMap,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughnessMap: tileTex.roughnessMap,
      roughness: 0.58,
      metalness: 0.06,
    }),
    { threshold: 0.44, strength: 0.92 }
  );

  addMerged(
    greenTrimGeos,
    'CorridorPavilionGreenTrim',
    new THREE.MeshStandardMaterial({
      color: 0x1e6b52,
      map: tileTex.map,
      normalMap: tileTex.normalMap,
      normalScale: new THREE.Vector2(0.95, 0.95),
      roughnessMap: tileTex.roughnessMap,
      roughness: 0.28,
      metalness: 0.12,
      envMapIntensity: 1.25,
    }),
    { threshold: 0.44, strength: 0.92 }
  );

  addMerged(
    ridgeGeos,
    'CorridorPavilionRidges',
    new THREE.MeshStandardMaterial({
      color: 0x45494e,
      roughness: 0.56,
      metalness: 0.08,
    }),
    { threshold: 0.52, strength: 0.85 }
  );

  addMerged(
    gildedGeos,
    'CorridorPavilionFinials',
    new THREE.MeshStandardMaterial({
      color: 0xf1c85b,
      metalness: 0.9,
      roughness: 0.22,
      envMapIntensity: 1.65,
    })
  );

  return { group, corridorColumnsCount: columnTransforms.length };
}
