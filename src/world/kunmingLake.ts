import * as THREE from 'three';
import { ELEVATION, TRAY } from '../config/sceneConfig';
import { enhanceMaterial } from '../core/shaders';
import { getSculptedHeight } from '../core/terrainMath';
import { mapUnitGridToRoundedRect } from '../generators/buildTrayAndTerrain';
import { createWaterRippleNormal } from '../textures/proceduralPBR';

/**
 * 构建水深渐变昆明湖水面网格：
 * - 严格圆角收口于木框内壁（depthWrite: false 避免 GTAO 黑边污染）
 * - 基于 getSculptedHeight(x, z) 写入逐顶点水深 aWaterDepth
 */
export function buildKunmingLake(): THREE.Mesh {
  const segX = 160;
  const segZ = 128;
  const cols = segX + 1;
  const rows = segZ + 1;
  const halfW = TRAY.innerW * 0.5 - 0.02;
  const halfD = TRAY.innerD * 0.5 - 0.02;
  const radius = TRAY.innerRadius - 0.02;

  const vertCount = cols * rows;
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const depths = new Float32Array(vertCount);
  const heights = new Float32Array(vertCount);

  for (let iz = 0; iz < rows; iz++) {
    const v = (iz / segZ) * 2 - 1;
    for (let ix = 0; ix < cols; ix++) {
      const u = (ix / segX) * 2 - 1;
      const [x, z] = mapUnitGridToRoundedRect(u, v, halfW, halfD, radius);
      const h = getSculptedHeight(x, z);
      const idx = iz * cols + ix;

      positions[idx * 3] = x;
      positions[idx * 3 + 1] = ELEVATION.waterY;
      positions[idx * 3 + 2] = z;

      normals[idx * 3] = 0;
      normals[idx * 3 + 1] = 1;
      normals[idx * 3 + 2] = 0;

      uvs[idx * 2] = x / (halfW * 2) + 0.5;
      uvs[idx * 2 + 1] = z / (halfD * 2) + 0.5;

      heights[idx] = h;
      depths[idx] = Math.max(0.0, ELEVATION.waterY - h);
    }
  }

  // 剔除完全位于高地内部的无效三角面，保持岸线交界处全覆盖
  const indices: number[] = [];
  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iz * cols + ix;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;

      if (heights[a] < 0.25 || heights[c] < 0.25 || heights[b] < 0.25) {
        indices.push(a, c, b);
      }
      if (heights[b] < 0.25 || heights[c] < 0.25 || heights[d] < 0.25) {
        indices.push(b, c, d);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aWaterDepth', new THREE.BufferAttribute(depths, 1));
  geo.setIndex(indices);

  const rippleNormal = createWaterRippleNormal();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    normalMap: rippleNormal,
    normalScale: new THREE.Vector2(0.075, 0.075),
    roughness: 0.14,
    metalness: 0.04,
    transparent: true,
    depthWrite: false,
    envMapIntensity: 1.12,
  });

  enhanceMaterial(mat, { waterIce: true });

  const lakeMesh = new THREE.Mesh(geo, mat);
  lakeMesh.name = 'KunmingLake';
  lakeMesh.receiveShadow = true;
  lakeMesh.castShadow = false;
  lakeMesh.renderOrder = 1;
  lakeMesh.userData.excludeFromAO = true;

  return lakeMesh;
}
