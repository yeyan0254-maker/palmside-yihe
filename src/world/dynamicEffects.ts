import * as THREE from 'three';
import { LANDMARKS, type SeasonPresetId, type ThemeId } from '../config/sceneConfig';
import { APP_STATE, SHARED_UNIFORMS } from '../config/stateStore';
import { clamp, getEastDikeX, getNorthShoreZ, getWestDikeX } from '../core/terrainMath';
import type { ArchAnchor } from '../generators/buildBridges';

export interface DynamicEffectsResult {
  group: THREE.Group;
  applySeason: (preset: SeasonPresetId, theme: ThemeId) => void;
  syncAtmosphere: () => void;
  update: (elapsedTime: number) => void;
  setPowerSave: (enabled: boolean) => void;
  isSolsticeBeamsVisible: () => boolean;
  mistCount: number;
  particlesCount: number;
}

interface MistRibbonSpec {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  pitch: number;
  yaw: number;
  speed: number;
  phase: number;
  density: number;
  driftLen: number;
}

/**
 * 构建 100% GPU 驱动的山间流动丝带轻雾（22 层谷地雾带，depthWrite: false + excludeFromAO）
 * 与四季空间分化 GPU 粒子系统（春秋严避开阔湖面零白点，冬雪覆盖全盘）
 */
export function buildDynamicEffects(
  archAnchors: ReadonlyArray<ArchAnchor> = []
): DynamicEffectsResult {
  const group = new THREE.Group();
  group.name = 'DynamicEffectsGroup';

  // =========================================================================
  // 1. 万寿山麓与山脊 22 层 GPU 流动丝带轻雾（1 InstancedMesh，零 CPU 每帧矩阵更新）
  //    中轴佛香阁与排云殿正立面留白透朗，轻雾贴合东西山谷与后山腰绵延流淌
  // =========================================================================
  const mistSpecs: MistRibbonSpec[] = [
    // 西麓与西山谷丝带（7 层）
    { x: -20.8, y: 2.3, z: -15.6, width: 10.5, depth: 3.8, pitch: 0.16, yaw: 0.18, speed: 0.19, phase: 0.3, density: 0.92, driftLen: 1.45 },
    { x: -16.2, y: 3.2, z: -14.2, width: 11.4, depth: 4.2, pitch: 0.18, yaw: 0.12, speed: 0.17, phase: 1.4, density: 1.0, driftLen: 1.55 },
    { x: -12.6, y: 2.5, z: -11.4, width: 9.8, depth: 3.5, pitch: 0.14, yaw: 0.22, speed: 0.21, phase: 2.5, density: 0.85, driftLen: 1.35 },
    { x: -11.2, y: 4.1, z: -17.6, width: 12.2, depth: 4.4, pitch: 0.17, yaw: -0.08, speed: 0.15, phase: 3.2, density: 0.96, driftLen: 1.4 },
    { x: -7.2, y: 3.6, z: -13.2, width: 8.6, depth: 3.3, pitch: 0.15, yaw: 0.15, speed: 0.2, phase: 4.1, density: 0.78, driftLen: 1.2 },
    { x: -6.8, y: 4.7, z: -19.2, width: 10.8, depth: 4.0, pitch: 0.14, yaw: 0.08, speed: 0.14, phase: 5.0, density: 0.94, driftLen: 1.5 },
    { x: -18.5, y: 1.9, z: -11.8, width: 9.2, depth: 3.4, pitch: 0.12, yaw: 0.24, speed: 0.18, phase: 0.9, density: 0.76, driftLen: 1.3 },
    // 东麓与东山谷丝带（7 层）
    { x: 20.6, y: 2.2, z: -15.4, width: 10.4, depth: 3.8, pitch: 0.16, yaw: -0.18, speed: 0.18, phase: 1.1, density: 0.92, driftLen: 1.45 },
    { x: 15.8, y: 3.1, z: -14.0, width: 11.6, depth: 4.2, pitch: 0.18, yaw: -0.12, speed: 0.16, phase: 2.3, density: 1.0, driftLen: 1.55 },
    { x: 12.4, y: 2.4, z: -11.2, width: 9.6, depth: 3.5, pitch: 0.14, yaw: -0.22, speed: 0.2, phase: 3.6, density: 0.85, driftLen: 1.35 },
    { x: 11.0, y: 4.0, z: -17.5, width: 12.0, depth: 4.4, pitch: 0.17, yaw: 0.08, speed: 0.15, phase: 4.4, density: 0.96, driftLen: 1.4 },
    { x: 7.0, y: 3.5, z: -13.0, width: 8.6, depth: 3.3, pitch: 0.15, yaw: -0.15, speed: 0.19, phase: 5.3, density: 0.78, driftLen: 1.2 },
    { x: 6.8, y: 4.6, z: -19.2, width: 10.8, depth: 4.0, pitch: 0.14, yaw: -0.08, speed: 0.14, phase: 0.5, density: 0.94, driftLen: 1.5 },
    { x: 18.2, y: 1.9, z: -11.6, width: 9.0, depth: 3.4, pitch: 0.12, yaw: -0.24, speed: 0.18, phase: 2.8, density: 0.76, driftLen: 1.3 },
    // 后山远脊高层山岚（4 层，绕佛香阁背后柔化山脊轮廓）
    { x: 0.0, y: 5.0, z: -20.6, width: 15.6, depth: 5.4, pitch: 0.14, yaw: 0.0, speed: 0.12, phase: 1.7, density: 0.95, driftLen: 1.7 },
    { x: -14.2, y: 4.4, z: -20.2, width: 13.4, depth: 4.6, pitch: 0.13, yaw: 0.06, speed: 0.13, phase: 3.9, density: 0.88, driftLen: 1.55 },
    { x: 14.2, y: 4.4, z: -20.2, width: 13.4, depth: 4.6, pitch: 0.13, yaw: -0.06, speed: 0.13, phase: 5.5, density: 0.88, driftLen: 1.55 },
    { x: 0.2, y: 4.1, z: -17.8, width: 12.6, depth: 4.0, pitch: 0.12, yaw: 0.02, speed: 0.15, phase: 2.1, density: 0.72, driftLen: 1.4 },
    // 东西堤岸晨霭薄纱（4 层贴近林冠上方微荡）
    { x: -17.6, y: 1.7, z: 3.6, width: 9.2, depth: 3.6, pitch: 0.1, yaw: 0.45, speed: 0.22, phase: 0.8, density: 0.56, driftLen: 1.1 },
    { x: -16.8, y: 1.8, z: 12.2, width: 9.6, depth: 3.6, pitch: 0.1, yaw: 0.32, speed: 0.2, phase: 3.1, density: 0.52, driftLen: 1.1 },
    { x: 23.8, y: 1.9, z: -1.8, width: 8.8, depth: 3.5, pitch: 0.1, yaw: -0.35, speed: 0.21, phase: 4.6, density: 0.55, driftLen: 1.1 },
    { x: 23.4, y: 1.8, z: 8.8, width: 8.8, depth: 3.5, pitch: 0.1, yaw: -0.28, speed: 0.19, phase: 1.9, density: 0.5, driftLen: 1.1 },
  ];

  const mistGeo = new THREE.PlaneGeometry(1, 1);
  mistGeo.rotateX(-Math.PI * 0.5);

  const mistAttrData = new Float32Array(mistSpecs.length * 4);
  for (let i = 0; i < mistSpecs.length; i++) {
    const m = mistSpecs[i];
    mistAttrData[i * 4] = m.speed;
    mistAttrData[i * 4 + 1] = m.phase;
    mistAttrData[i * 4 + 2] = m.density;
    mistAttrData[i * 4 + 3] = m.driftLen;
  }
  mistGeo.setAttribute('aMistData', new THREE.InstancedBufferAttribute(mistAttrData, 4));

  const uMistColor = { value: new THREE.Color(0xf2f5f1) };
  const uMistOpacity = { value: 0.3 };

  const mistMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: SHARED_UNIFORMS.uTime,
      uMistColor,
      uMistOpacity,
    },
    vertexShader: /* glsl */ `
attribute vec4 aMistData;
uniform float uTime;
varying vec2 vUv;
varying vec4 vMistData;

void main() {
  vUv = uv;
  vMistData = aMistData;
  vec4 wp = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp.x += sin(uTime * aMistData.x + aMistData.y) * aMistData.w;
  wp.y += cos(uTime * aMistData.x * 0.65 + aMistData.y) * 0.08;
  gl_Position = projectionMatrix * modelViewMatrix * wp;
}`,
    fragmentShader: /* glsl */ `
uniform float uTime;
uniform vec3 uMistColor;
uniform float uMistOpacity;
varying vec2 vUv;
varying vec4 vMistData;

float yiheMistHash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float yiheMistNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(yiheMistHash(i), yiheMistHash(i + vec2(1.0, 0.0)), u.x),
    mix(yiheMistHash(i + vec2(0.0, 1.0)), yiheMistHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec2 scrollUv = vUv * vec2(3.6, 2.1)
    + vec2(uTime * vMistData.x * 0.24, uTime * vMistData.x * 0.05)
    + vMistData.y;
  float n1 = yiheMistNoise(scrollUv);
  float n2 = yiheMistNoise(scrollUv * 2.15 - vec2(uTime * vMistData.x * 0.16, 0.7));
  float fbm = n1 * 0.65 + n2 * 0.35;

  float ex = smoothstep(0.0, 0.42, vUv.x) * smoothstep(1.0, 0.58, vUv.x);
  float ey = smoothstep(0.0, 0.44, vUv.y) * smoothstep(1.0, 0.56, vUv.y);
  float envelope = pow(clamp(ex * ey, 0.0, 1.0), 1.35);

  float alpha = envelope * (0.44 + fbm * 0.72) * uMistOpacity * vMistData.z;
  if (alpha <= 0.004) discard;
  gl_FragColor = vec4(uMistColor, alpha);
}`,
  });

  const mistInst = new THREE.InstancedMesh(mistGeo, mistMat, mistSpecs.length);
  mistInst.name = 'MountainMistRibbons';
  mistInst.renderOrder = 3;
  mistInst.castShadow = false;
  mistInst.receiveShadow = false;
  mistInst.userData.excludeFromAO = true;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < mistSpecs.length; i++) {
    const m = mistSpecs[i];
    dummy.position.set(m.x, m.y, m.z);
    dummy.rotation.set(m.pitch, m.yaw, 0);
    dummy.scale.set(m.width, 1, m.depth);
    dummy.updateMatrix();
    mistInst.setMatrixAt(i, dummy.matrix);
  }
  mistInst.instanceMatrix.needsUpdate = true;
  group.add(mistInst);

  // =========================================================================
  // 2. 四季 GPU 粒子（前 420 粒严格限定陆地/林区，后 180 粒冬季全盘飘雪）
  // =========================================================================
  const particlesCount = 600;
  const landOnlyCount = 420;
  const pPos = new Float32Array(particlesCount * 3);
  const pRand = new Float32Array(particlesCount * 4);
  const pSnowOnly = new Float32Array(particlesCount);

  let seed = 0x20261130;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < particlesCount; i++) {
    let x = 0;
    let z = 0;
    if (i < landOnlyCount) {
      pSnowOnly[i] = 0.0;
      const zone = rand();
      if (zone < 0.68) {
        // 万寿山林冠区（与湖岸线留出安全缓冲，避免吹入开阔湖面）
        x = -27.5 + rand() * 55.0;
        const shoreLimit = getNorthShoreZ(x) - 1.2;
        z = -22.2 + rand() * Math.max(2.0, shoreLimit + 22.2);
      } else if (zone < 0.82) {
        // 西堤绿带
        z = -4.2 + rand() * 25.0;
        x = getWestDikeX(z) + (rand() - 0.5) * 1.1;
      } else if (zone < 0.94) {
        // 东堤绿带
        z = -5.0 + rand() * 26.0;
        x = getEastDikeX(z) + 0.6 + rand() * 3.8;
      } else {
        // 南湖岛林区
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * 2.8;
        x = LANDMARKS.southLakeIsland.x + Math.cos(a) * r;
        z = LANDMARKS.southLakeIsland.z + Math.sin(a) * r;
      }
    } else {
      // 仅冬日/冬至飘雪启用全沙盘铺洒
      pSnowOnly[i] = 1.0;
      x = -29.0 + rand() * 58.0;
      z = -23.0 + rand() * 46.0;
    }

    pPos[i * 3] = x;
    pPos[i * 3 + 1] = 0.6 + rand() * 13.8;
    pPos[i * 3 + 2] = z;

    pRand[i * 4] = 0.55 + rand() * 0.9; // 下落速率
    pRand[i * 4 + 1] = rand() * Math.PI * 2; // 相位
    pRand[i * 4 + 2] = 0.7 + rand() * 0.75; // 尺寸
    pRand[i * 4 + 3] = rand(); // 颜色分化种子
  }

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('aRandom', new THREE.BufferAttribute(pRand, 4));
  pGeo.setAttribute('aSnowOnly', new THREE.BufferAttribute(pSnowOnly, 1));

  const uParticleMode = { value: 1 }; // 0=off, 1=spring, 2=autumn, 3=winter
  const pMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: SHARED_UNIFORMS.uTime,
      uWindStrength: SHARED_UNIFORMS.uWindStrength,
      uSolsticeGlow: SHARED_UNIFORMS.uSolsticeGlow,
      uParticleMode,
    },
    vertexShader: /* glsl */ `
attribute vec4 aRandom;
attribute float aSnowOnly;
uniform float uTime;
uniform float uWindStrength;
uniform int uParticleMode;
varying float vTint;
varying float vAlpha;

void main() {
  vTint = aRandom.w;
  if (uParticleMode == 0 || (uParticleMode != 3 && aSnowOnly > 0.5)) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vAlpha = 0.0;
    return;
  }

  float fallSpeed = (uParticleMode == 3 ? 1.15 : uParticleMode == 2 ? 0.95 : 0.52) * aRandom.x;
  float spanH = 14.5;
  float y = mod(position.y - uTime * fallSpeed, spanH) + 0.45;
  float sway = uParticleMode == 3 ? (0.45 + uWindStrength * 1.45) : (0.28 + uWindStrength * 0.72);
  float x = position.x + sin(uTime * 0.85 + aRandom.y + y * 0.4) * sway;
  float z = position.z + cos(uTime * 0.72 + aRandom.y * 1.3 + y * 0.35) * sway * 0.8;

  vec4 mvPosition = modelViewMatrix * vec4(x, y, z, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float baseSize = uParticleMode == 3 ? 4.3 : uParticleMode == 2 ? 4.8 : 2.9;
  float maxPx = uParticleMode == 3 ? 8.8 : 6.2;
  gl_PointSize = clamp((baseSize * aRandom.z * 26.0) / max(-mvPosition.z, 1.0), 1.2, maxPx);
  vAlpha = smoothstep(0.45, 1.45, y) * (1.0 - smoothstep(13.2, 14.8, y));
}
`,
    fragmentShader: /* glsl */ `
uniform int uParticleMode;
uniform float uSolsticeGlow;
varying float vTint;
varying float vAlpha;

void main() {
  if (uParticleMode == 0 || vAlpha <= 0.01) discard;
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.08, d);

  vec3 col;
  if (uParticleMode == 1) {
    // 春：柔润淡青绿与淡粉花瓣（低对比度融入山林，避免白点噪点）
    col = mix(vec3(0.84, 0.90, 0.81), vec3(0.95, 0.79, 0.82), step(0.55, vTint));
  } else if (uParticleMode == 2) {
    // 秋：银杏金黄与元宝枫丹红落叶
    col = mix(vec3(0.88, 0.67, 0.16), vec3(0.75, 0.22, 0.14), step(0.64, vTint));
  } else {
    // 冬：洁白瑞雪（冬至暮色下渐染柔和暖金微尘）
    col = mix(vec3(0.95, 0.97, 1.0), vec3(1.0, 0.85, 0.62), uSolsticeGlow * 0.65);
  }
  float modeAlpha = uParticleMode == 3 ? mix(0.85, 0.45, uSolsticeGlow) : uParticleMode == 2 ? 0.74 : 0.56;
  gl_FragColor = vec4(col, soft * vAlpha * modeAlpha);
}
`,
  });

  const particles = new THREE.Points(pGeo, pMat);
  particles.name = 'SeasonalParticles600';
  particles.renderOrder = 4;
  particles.frustumCulled = false;
  particles.userData.excludeFromAO = true;
  group.add(particles);

  // =========================================================================
  // 3. 烟雨江南 GPU 斜织细雨丝（900 根，单 InstancedMesh + 视向绕轴广告牌，仅 rain 显示）
  // =========================================================================
  const rainCount = 900;
  const rainBaseGeo = new THREE.PlaneGeometry(0.032, 0.92);
  const rainPos = new Float32Array(rainCount * 3);
  const rainMeta = new Float32Array(rainCount * 2);
  for (let i = 0; i < rainCount; i++) {
    rainPos[i * 3] = -28.5 + rand() * 57.0;
    rainPos[i * 3 + 1] = 0.2 + rand() * 16.2;
    rainPos[i * 3 + 2] = -22.5 + rand() * 45.0;
    rainMeta[i * 2] = 11.5 + rand() * 5.0; // 下落速度
    rainMeta[i * 2 + 1] = 0.65 + rand() * 0.35; // 透明度微分
  }
  rainBaseGeo.setAttribute('aRainPos', new THREE.InstancedBufferAttribute(rainPos, 3));
  rainBaseGeo.setAttribute('aRainMeta', new THREE.InstancedBufferAttribute(rainMeta, 2));

  const rainMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: SHARED_UNIFORMS.uTime,
      uWindStrength: SHARED_UNIFORMS.uWindStrength,
      uRainAmount: SHARED_UNIFORMS.uRainAmount,
      uThemeDark: SHARED_UNIFORMS.uThemeDark,
    },
    vertexShader: /* glsl */ `
attribute vec3 aRainPos;
attribute vec2 aRainMeta;
uniform float uTime;
uniform float uWindStrength;
uniform float uRainAmount;
varying vec2 vUv;
varying float vDropAlpha;

void main() {
  vUv = uv;
  if (uRainAmount <= 0.01) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vDropAlpha = 0.0;
    return;
  }

  float t = uTime;
  float y = mod(aRainPos.y - t * aRainMeta.x, 16.2) + 0.18;
  float windShear = 0.14 + uWindStrength * 0.24;
  float x = mod(aRainPos.x - t * windShear * 2.2 + 28.5, 57.0) - 28.5;
  float z = aRainPos.z;
  vec3 center = vec3(x, y, z);

  vec3 streakDir = normalize(vec3(-windShear, -1.0, windShear * 0.45));
  vec3 toCam = normalize(cameraPosition - center);
  vec3 rightAxis = cross(toCam, -streakDir);
  if (dot(rightAxis, rightAxis) < 1e-4) {
    rightAxis = vec3(1.0, 0.0, 0.0);
  } else {
    rightAxis = normalize(rightAxis);
  }

  vec3 worldPos = center + rightAxis * position.x + (-streakDir) * position.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
  float heightMask = smoothstep(0.18, 0.9, y) * (1.0 - smoothstep(14.8, 16.4, y));
  vDropAlpha = aRainMeta.y * heightMask * uRainAmount;
}`,
    fragmentShader: /* glsl */ `
uniform float uThemeDark;
varying vec2 vUv;
varying float vDropAlpha;

void main() {
  if (vDropAlpha <= 0.005) discard;
  float hMask = smoothstep(0.5, 0.06, abs(vUv.x - 0.5));
  float vMask = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.18, 1.0, vUv.y));
  float alpha = hMask * vMask * vDropAlpha * mix(0.56, 0.44, uThemeDark);
  if (alpha <= 0.004) discard;
  vec3 col = mix(vec3(0.90, 0.94, 0.96), vec3(0.64, 0.76, 0.84), uThemeDark);
  gl_FragColor = vec4(col, alpha);
}`,
  });

  const rainInst = new THREE.InstancedMesh(rainBaseGeo, rainMat, rainCount);
  rainInst.name = 'RainStreaks900';
  rainInst.renderOrder = 4;
  rainInst.castShadow = false;
  rainInst.receiveShadow = false;
  rainInst.frustumCulled = false;
  rainInst.userData.excludeFromAO = true;
  const identMat = new THREE.Matrix4();
  for (let i = 0; i < rainCount; i++) {
    rainInst.setMatrixAt(i, identMat);
  }
  rainInst.instanceMatrix.needsUpdate = true;
  group.add(rainInst);

  // =========================================================================
  // 4. 冬至 17 孔体积金光穿洞（全 17 孔合并为单一 BufferGeometry，1 DrawCall，Additive + depthWrite: false）
  // =========================================================================
  const anchorList = archAnchors;
  const quadsPerArch = 3;
  const totalQuads = Math.max(1, anchorList.length) * quadsPerArch;
  const beamPos = new Float32Array(totalQuads * 4 * 3);
  const beamNorm = new Float32Array(totalQuads * 4 * 3);
  const beamUv = new Float32Array(totalQuads * 4 * 2);
  const beamMeta = new Float32Array(totalQuads * 4 * 3);
  const beamIndices: number[] = [];

  // PRD 2.5：落日单位方向 (-0.855, +0.156, +0.494)，穿过桥洞的光束推进方向取其反向量
  const beamDir = new THREE.Vector3(0.855, -0.156, -0.494).normalize();
  const spanAxis = new THREE.Vector3(0.5299, 0.0, 0.848).normalize();
  const upAxis = new THREE.Vector3().crossVectors(beamDir, spanAxis).normalize();
  if (upAxis.y < 0) upAxis.negate();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const tmpEdge1 = new THREE.Vector3();
  const tmpEdge2 = new THREE.Vector3();
  const tmpFaceNorm = new THREE.Vector3();

  let qCursor = 0;
  const pushBeamQuad = (
    bl: THREE.Vector3,
    br: THREE.Vector3,
    tr: THREE.Vector3,
    tl: THREE.Vector3,
    weight: number,
    kind: number,
    phase: number
  ) => {
    const baseV = qCursor * 4;
    const pts = [bl, br, tr, tl];
    tmpEdge1.subVectors(br, bl);
    tmpEdge2.subVectors(tl, bl);
    tmpFaceNorm.crossVectors(tmpEdge1, tmpEdge2);
    if (tmpFaceNorm.lengthSq() < 1e-8) {
      tmpFaceNorm.set(0, 1, 0);
    } else {
      tmpFaceNorm.normalize();
    }
    const uvs = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    for (let k = 0; k < 4; k++) {
      const vIdx = baseV + k;
      beamPos[vIdx * 3] = pts[k].x;
      beamPos[vIdx * 3 + 1] = pts[k].y;
      beamPos[vIdx * 3 + 2] = pts[k].z;
      beamNorm[vIdx * 3] = tmpFaceNorm.x;
      beamNorm[vIdx * 3 + 1] = tmpFaceNorm.y;
      beamNorm[vIdx * 3 + 2] = tmpFaceNorm.z;
      beamUv[vIdx * 2] = uvs[k][0];
      beamUv[vIdx * 2 + 1] = uvs[k][1];
      beamMeta[vIdx * 3] = weight;
      beamMeta[vIdx * 3 + 1] = kind;
      beamMeta[vIdx * 3 + 2] = phase;
    }
    beamIndices.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);
    qCursor++;
  };

  for (let i = 0; i < anchorList.length; i++) {
    const a = anchorList[i];
    const weight = 1.0 - Math.abs(i - 8) / 11.2;
    const r = a.radius;
    // 起始于桥洞西侧内喉（-0.36 * beamDir），防止白雾前溢遮挡桥墩，直射透出东侧湖面 2.35u
    const p0 = a.center.clone().addScaledVector(beamDir, -0.36);
    const p1 = a.center.clone().addScaledVector(beamDir, 2.35);

    const w0 = r * 0.84;
    const w1 = r * 1.08;
    // 1. 水平斜穿光片（沿 -9° 下掠穿透桥洞并铺向东侧冰湖）
    pushBeamQuad(
      p0.clone().addScaledVector(spanAxis, -w0),
      p1.clone().addScaledVector(spanAxis, -w1),
      p1.clone().addScaledVector(spanAxis, w1),
      p0.clone().addScaledVector(spanAxis, w0),
      weight,
      0.0,
      i * 0.63
    );

    const h0 = Math.max(0.11, r * 0.78);
    const h1 = Math.max(0.14, r * 0.92);
    // 2. 垂向交叉体积光帘
    pushBeamQuad(
      p0.clone().addScaledVector(upAxis, -h0),
      p1.clone().addScaledVector(upAxis, -h1),
      p1.clone().addScaledVector(upAxis, h1),
      p0.clone().addScaledVector(upAxis, h0),
      weight,
      0.0,
      i * 0.63 + 1.7
    );

    // 3. 桥洞拱心内腔炽金核（严限拱券内缘且微退内喉，紧扣桥洞轮廓不溢桥墩）
    const crownY = a.springY + r * 0.94;
    const botY = 0.02;
    const coreH = Math.max(0.12, (crownY - botY) * 0.5);
    const coreMidY = botY + coreH;
    const pCore = new THREE.Vector3(a.center.x, coreMidY, a.center.z).addScaledVector(a.normal, -0.14);
    const coreW = r * 0.92;
    pushBeamQuad(
      pCore.clone().addScaledVector(spanAxis, -coreW).addScaledVector(worldUp, -coreH),
      pCore.clone().addScaledVector(spanAxis, coreW).addScaledVector(worldUp, -coreH),
      pCore.clone().addScaledVector(spanAxis, coreW).addScaledVector(worldUp, coreH),
      pCore.clone().addScaledVector(spanAxis, -coreW).addScaledVector(worldUp, coreH),
      weight,
      1.0,
      i * 0.63
    );
  }

  const beamsGeo = new THREE.BufferGeometry();
  beamsGeo.setAttribute('position', new THREE.BufferAttribute(beamPos.slice(0, qCursor * 12), 3));
  beamsGeo.setAttribute('normal', new THREE.BufferAttribute(beamNorm.slice(0, qCursor * 12), 3));
  beamsGeo.setAttribute('uv', new THREE.BufferAttribute(beamUv.slice(0, qCursor * 8), 2));
  beamsGeo.setAttribute('aBeamMeta', new THREE.BufferAttribute(beamMeta.slice(0, qCursor * 12), 3));
  beamsGeo.setIndex(beamIndices);

  const beamsMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    toneMapped: true,
    uniforms: {
      uTime: SHARED_UNIFORMS.uTime,
      uSolsticeGlow: SHARED_UNIFORMS.uSolsticeGlow,
      uThemeDark: SHARED_UNIFORMS.uThemeDark,
    },
    vertexShader: /* glsl */ `
attribute vec3 aBeamMeta;
varying vec2 vUv;
varying vec3 vMeta;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

void main() {
  vUv = uv;
  vMeta = aBeamMeta;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,
    fragmentShader: /* glsl */ `
uniform float uTime;
uniform float uSolsticeGlow;
uniform float uThemeDark;
varying vec2 vUv;
varying vec3 vMeta;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

void main() {
  if (uSolsticeGlow <= 0.004) discard;
  float aboveWater = smoothstep(-0.02, 0.06, vWorldPos.y);
  if (aboveWater <= 0.005) discard;

  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec2 viewXZ = normalize(viewDir.xz + vec2(1e-5));
  vec2 normXZ = vec2(-0.8480, 0.5299);
  float horizDot = abs(dot(viewXZ, normXZ));
  float azimReveal = smoothstep(0.66, 0.95, horizDot);
  float elevReveal = 1.0 - smoothstep(0.35, 0.58, viewDir.y);
  float angleReveal = azimReveal * elevReveal;
  float lookIntoSun = smoothstep(-0.15, 0.65, -dot(viewXZ, normXZ));

  float archBias = 0.44 + 0.56 * vMeta.x;
  float themeBoost = mix(0.75, 1.0, uThemeDark);

  if (vMeta.y >= 0.5) {
    // 拱门内腔暖金核心（NormalBlending 直接置换冷蓝底色，呈现温润鎏金不灰不白爆）
    float dx = abs(vUv.x - 0.5) * 2.0;
    float archTop = 0.35 + 0.65 * sqrt(max(0.0, 1.0 - dx * dx));
    float archMask = (1.0 - smoothstep(0.84, 1.0, dx)) * (1.0 - smoothstep(archTop - 0.18, archTop + 0.02, vUv.y));
    float centerGlow = exp(-dx * dx * 2.6 - pow((vUv.y - 0.46) * 1.9, 2.0));
    float val = archMask * (0.48 + 0.52 * centerGlow);
    float coreReveal = 0.06 + 0.94 * angleReveal;
    vec3 col = mix(vec3(0.86, 0.42, 0.04), vec3(1.04, 0.64, 0.12), centerGlow);
    float alpha = val * uSolsticeGlow * aboveWater * archBias * themeBoost * coreReveal * 0.62;
    if (alpha <= 0.004) discard;
    gl_FragColor = vec4(col, alpha);
    return;
  }

  // 穿洞体积金光束（严格视角对齐 + 侧视面片柔化消隐 + 克制薄纱金光）
  float edgeFade = smoothstep(0.06, 0.32, abs(dot(normalize(vWorldNormal), viewDir)));
  float shaftGain = mix(0.66, 1.0, lookIntoSun);
  float along = smoothstep(0.0, 0.14, vUv.x) * pow(clamp(1.0 - vUv.x, 0.0, 1.0), 1.38);
  float tunnelBoost = exp(-pow((vUv.x - 0.16) / 0.14, 2.0)) * 0.38;
  float across = exp(-pow((vUv.y - 0.5) * 2.6, 2.0));
  float shimmer = 0.90 + 0.10 * sin(vUv.x * 8.5 - uTime * 0.85 + vMeta.z);

  vec3 col = mix(vec3(0.84, 0.40, 0.04), vec3(0.98, 0.58, 0.10), across * (1.0 - vUv.x * 0.65));
  float intensity = (along + tunnelBoost * 0.38) * across * shimmer * archBias * themeBoost * shaftGain * angleReveal * edgeFade;
  float alpha = clamp(intensity * uSolsticeGlow * aboveWater * 0.50, 0.0, 0.54);
  if (alpha <= 0.004) discard;
  gl_FragColor = vec4(col, alpha);
}`,
  });

  const solsticeBeamsMesh = new THREE.Mesh(beamsGeo, beamsMat);
  solsticeBeamsMesh.name = 'SolsticeGoldenBeams17';
  solsticeBeamsMesh.renderOrder = 5;
  solsticeBeamsMesh.castShadow = false;
  solsticeBeamsMesh.receiveShadow = false;
  solsticeBeamsMesh.frustumCulled = false;
  solsticeBeamsMesh.userData.excludeFromAO = true;
  solsticeBeamsMesh.visible = false;
  group.add(solsticeBeamsMesh);

  let currentPreset: SeasonPresetId = 'spring';
  let currentTheme: ThemeId = 'xuan-light';
  let baseMistOpacity = 0.42;
  let powerSaveEnabled = APP_STATE.powerSave;

  const syncAtmosphere = () => {
    uMistOpacity.value = clamp(baseMistOpacity * APP_STATE.fogDensityScale, 0.0, 0.78);

    let mode = 0;
    if (APP_STATE.weather === 'snow') {
      mode = 3;
    } else if (APP_STATE.solsticeMode) {
      mode = 0;
    } else if (APP_STATE.snowAmount >= 0.35) {
      mode = 3;
    } else if (APP_STATE.weather === 'rain') {
      mode = 0;
    } else if (APP_STATE.season === 'spring') {
      mode = 1;
    } else if (APP_STATE.season === 'autumn') {
      mode = 2;
    } else if (APP_STATE.season === 'winter') {
      mode = 3;
    }
    uParticleMode.value = mode;

    const ps = powerSaveEnabled || APP_STATE.powerSave;
    particles.visible = !ps && APP_STATE.particlesEnabled && mode !== 0;
    rainInst.visible = !ps && APP_STATE.rainAmount > 0.02 && APP_STATE.iceFactor < 0.72;
    solsticeBeamsMesh.visible = !ps && APP_STATE.solsticeGlow > 0.005;
  };

  const applySeason = (preset: SeasonPresetId, theme: ThemeId) => {
    currentPreset = preset;
    currentTheme = theme;

    // 五季 + 雨天 × 双主题差异化山岚色相与透光度
    if (theme === 'ink-gold') {
      if (preset === 'autumn') {
        uMistColor.value.setHex(0x786d64);
        baseMistOpacity = 0.2;
      } else if (preset === 'winter') {
        uMistColor.value.setHex(0x6d839b);
        baseMistOpacity = 0.24;
      } else if (preset === 'rain') {
        uMistColor.value.setHex(0x526a7f);
        baseMistOpacity = 0.28;
      } else if (preset === 'solstice') {
        uMistColor.value.setHex(0x8a6c52);
        baseMistOpacity = 0.22;
      } else {
        uMistColor.value.setHex(0x5e7388);
        baseMistOpacity = 0.2;
      }
    } else {
      if (preset === 'summer') {
        uMistColor.value.setHex(0xeef4f0);
        baseMistOpacity = 0.34;
      } else if (preset === 'autumn') {
        uMistColor.value.setHex(0xf5efe2);
        baseMistOpacity = 0.38;
      } else if (preset === 'winter') {
        uMistColor.value.setHex(0xeaf0f6);
        baseMistOpacity = 0.4;
      } else if (preset === 'rain') {
        uMistColor.value.setHex(0xe3ecee);
        baseMistOpacity = 0.54;
      } else if (preset === 'solstice') {
        uMistColor.value.setHex(0xf5e2c6);
        baseMistOpacity = 0.38;
      } else {
        uMistColor.value.setHex(0xf2f5f1);
        baseMistOpacity = 0.42;
      }
    }

    syncAtmosphere();
  };

  const setPowerSave = (enabled: boolean) => {
    powerSaveEnabled = enabled;
    applySeason(currentPreset, currentTheme);
  };

  return {
    group,
    applySeason,
    syncAtmosphere,
    update: () => {},
    setPowerSave,
    isSolsticeBeamsVisible: () => solsticeBeamsMesh.visible,
    mistCount: mistSpecs.length,
    particlesCount,
  };
}
