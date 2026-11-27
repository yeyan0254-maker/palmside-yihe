import * as THREE from 'three';

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

function fract(x: number): number {
  return x - Math.floor(x);
}

/** 严格可无缝平铺的二维周期性值噪声 */
function tileableNoise(u: number, v: number, freq: number, seed: number): number {
  const x = u * freq;
  const y = v * freq;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const hash = (gx: number, gy: number) => {
    const px = ((gx % freq) + freq) % freq;
    const py = ((gy % freq) + freq) % freq;
    return fract(Math.sin(px * 127.1 + py * 311.7 + seed * 74.7) * 43758.5453123);
  };

  const n00 = hash(ix, iy);
  const n10 = hash(ix + 1, iy);
  const n01 = hash(ix, iy + 1);
  const n11 = hash(ix + 1, iy + 1);

  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create 2D context for procedural PBR texture');
  return [canvas, ctx];
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  repeat = true,
  rx = 1,
  ry = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = colorSpace;
  tex.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.repeat.set(rx, ry);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function heightToNormalCanvas(height: Float32Array, w: number, h: number, strength: number): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const data = img.data;

  const sample = (x: number, y: number) => {
    const wx = ((x % w) + w) % w;
    const wy = ((y % h) + h) % h;
    return height[wy * w + wx];
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const nx = -dx;
      const ny = -dy;
      const nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;

      const idx = (y * w + x) * 4;
      data[idx] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

export interface PBRTextureSet {
  map?: THREE.CanvasTexture;
  normalMap?: THREE.CanvasTexture;
  roughnessMap?: THREE.CanvasTexture;
}

/** 紫檀/老胡桃木托盘纹理（256×256） */
export function createRosewoodTextures(): Required<PBRTextureSet> {
  const w = 256;
  const h = 256;
  const [albedoCanvas, aCtx] = makeCanvas(w, h);
  const [roughCanvas, rCtx] = makeCanvas(w, h);
  const aImg = aCtx.createImageData(w, h);
  const rImg = rCtx.createImageData(w, h);
  const height = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const warp = tileableNoise(u, v, 3, 1.3) * 0.12 + tileableNoise(u, v, 6, 2.7) * 0.04;
      const rings = Math.sin((v * 10.0 + u * 1.0 + warp * 7.5) * Math.PI * 2) * 0.5 + 0.5;
      const streak = tileableNoise(u, v * 4.0, 12, 5.1);

      const grain = rings * 0.62 + streak * 0.38;
      const r = Math.round(36 + grain * 24);
      const g = Math.round(20 + grain * 14);
      const b = Math.round(14 + grain * 10);

      const idx = (y * w + x) * 4;
      aImg.data[idx] = r;
      aImg.data[idx + 1] = g;
      aImg.data[idx + 2] = b;
      aImg.data[idx + 3] = 255;

      const rough = Math.round((0.44 + (1 - grain) * 0.16) * 255);
      rImg.data[idx] = rough;
      rImg.data[idx + 1] = rough;
      rImg.data[idx + 2] = rough;
      rImg.data[idx + 3] = 255;

      height[y * w + x] = grain * 0.4;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  const normalCanvas = heightToNormalCanvas(height, w, h, 0.55);

  return {
    map: finalizeTexture(albedoCanvas, THREE.SRGBColorSpace, true, 1, 1),
    normalMap: finalizeTexture(normalCanvas, THREE.NoColorSpace, true, 1, 1),
    roughnessMap: finalizeTexture(roughCanvas, THREE.NoColorSpace, true, 1, 1),
  };
}

/** 山体矿岩微肌理法线与粗糙度贴图（512×512），彻底破除橡皮泥光滑感 */
export function createTerrainDetailTextures(): { normalMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
  const w = 512;
  const h = 512;
  const [roughCanvas, rCtx] = makeCanvas(w, h);
  const rImg = rCtx.createImageData(w, h);
  const height = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const n1 = 1 - Math.abs(tileableNoise(u, v, 8, 12.1) * 2 - 1);
      const n2 = 1 - Math.abs(tileableNoise(u, v, 16, 23.4) * 2 - 1);
      const n3 = tileableNoise(u, v, 32, 41.7);
      const n4 = tileableNoise(u, v, 64, 73.9);
      const hVal = n1 * 0.44 + n2 * 0.28 + n3 * 0.18 + n4 * 0.1;
      height[y * w + x] = hVal;

      const rough = Math.round((0.76 + (1 - hVal) * 0.2) * 255);
      const idx = (y * w + x) * 4;
      rImg.data[idx] = rough;
      rImg.data[idx + 1] = rough;
      rImg.data[idx + 2] = rough;
      rImg.data[idx + 3] = 255;
    }
  }

  rCtx.putImageData(rImg, 0, 0);
  const normalCanvas = heightToNormalCanvas(height, w, h, 3.2);

  return {
    normalMap: finalizeTexture(normalCanvas, THREE.NoColorSpace, true, 16, 13),
    roughnessMap: finalizeTexture(roughCanvas, THREE.NoColorSpace, true, 16, 13),
  };
}

/** 驳岸青石条石色/法线/糙度贴图（256×256） */
export function createAshlarStoneTextures(): Required<PBRTextureSet> {
  const w = 256;
  const h = 256;
  const [albedoCanvas, aCtx] = makeCanvas(w, h);
  const [roughCanvas, rCtx] = makeCanvas(w, h);
  const aImg = aCtx.createImageData(w, h);
  const rImg = rCtx.createImageData(w, h);
  const height = new Float32Array(w * h);

  const rows = 4;
  const cols = 2;

  for (let y = 0; y < h; y++) {
    const v = y / h;
    const rowF = v * rows;
    const rowIdx = Math.floor(rowF);
    const fy = rowF - rowIdx;

    for (let x = 0; x < w; x++) {
      const u = x / w;
      const offsetU = rowIdx % 2 === 1 ? 0.5 : 0.0;
      const colF = fract(u + offsetU) * cols;
      const colIdx = Math.floor(colF);
      const fx = colF - colIdx;

      const edgeX = Math.min(fx, 1 - fx) * 2;
      const edgeY = Math.min(fy, 1 - fy) * 2;
      const mortarX = Math.min(1, Math.max(0, (edgeX - 0.032) / 0.045));
      const mortarY = Math.min(1, Math.max(0, (edgeY - 0.055) / 0.07));
      const blockBevel = mortarX * mortarY;

      const blockSeed = fract(Math.sin((rowIdx * 13 + colIdx * 37) * 91.7) * 43758.5453);
      const grain =
        tileableNoise(u, v, 16, 4.2) * 0.5 +
        tileableNoise(u, v, 48, 8.9) * 0.35 +
        tileableNoise(u, v, 96, 15.1) * 0.15;

      // 下沿近水微潮深苔痕
      const damp = Math.max(0, 1 - v * 1.45) * 0.14;
      const baseTone = 0.54 + blockSeed * 0.11 + (grain - 0.5) * 0.11 - damp;
      const mortarTone = 0.29 + grain * 0.05;
      const tone = mortarTone + (baseTone - mortarTone) * blockBevel;

      const idx = (y * w + x) * 4;
      aImg.data[idx] = Math.round(Math.min(255, Math.max(0, tone * 238)));
      aImg.data[idx + 1] = Math.round(Math.min(255, Math.max(0, tone * 236)));
      aImg.data[idx + 2] = Math.round(Math.min(255, Math.max(0, tone * 226)));
      aImg.data[idx + 3] = 255;

      const rough = Math.round((0.84 - blockBevel * 0.14 + (1 - grain) * 0.12) * 255);
      rImg.data[idx] = rough;
      rImg.data[idx + 1] = rough;
      rImg.data[idx + 2] = rough;
      rImg.data[idx + 3] = 255;

      height[y * w + x] = blockBevel * 0.72 + grain * 0.28;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  const normalCanvas = heightToNormalCanvas(height, w, h, 3.0);

  return {
    map: finalizeTexture(albedoCanvas, THREE.SRGBColorSpace, true, 1, 1),
    normalMap: finalizeTexture(normalCanvas, THREE.NoColorSpace, true, 1, 1),
    roughnessMap: finalizeTexture(roughCanvas, THREE.NoColorSpace, true, 1, 1),
  };
}

/** 地形闭合围裙层状岩土剖面纹理（256×256） */
export function createRockStrataTextures(): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const w = 256;
  const h = 256;
  const [albedoCanvas, aCtx] = makeCanvas(w, h);
  const aImg = aCtx.createImageData(w, h);
  const height = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const v = y / h; // 0 = 顶部耕土, 1 = 底部基岩
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const warp = tileableNoise(u, v, 6, 31.1) * 0.06;
      const depth = v + warp;
      const strata = Math.sin(depth * 36.0) * 0.5 + 0.5;
      const grit = tileableNoise(u, v, 32, 62.7);
      const crack = Math.pow(1 - Math.abs(tileableNoise(u, v, 14, 18.4) * 2 - 1), 4.0);

      let r = 82;
      let g = 74;
      let b = 64;
      if (depth < 0.14) {
        r = 66;
        g = 62;
        b = 48;
      } else if (depth < 0.42) {
        r = 108;
        g = 90;
        b = 69;
      } else if (depth < 0.74) {
        r = 88;
        g = 84;
        b = 76;
      } else {
        r = 64;
        g = 64;
        b = 62;
      }

      const shade = 0.78 + strata * 0.18 + (grit - 0.5) * 0.18 - crack * 0.24;
      const idx = (y * w + x) * 4;
      aImg.data[idx] = Math.round(Math.min(255, Math.max(0, r * shade)));
      aImg.data[idx + 1] = Math.round(Math.min(255, Math.max(0, g * shade)));
      aImg.data[idx + 2] = Math.round(Math.min(255, Math.max(0, b * shade)));
      aImg.data[idx + 3] = 255;

      height[y * w + x] = strata * 0.35 + grit * 0.5 - crack * 0.45;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  const normalCanvas = heightToNormalCanvas(height, w, h, 2.4);

  return {
    map: finalizeTexture(albedoCanvas, THREE.SRGBColorSpace, true, 10, 1),
    normalMap: finalizeTexture(normalCanvas, THREE.NoColorSpace, true, 10, 1),
  };
}

/** 双频微浪法线贴图（256×256，严格无缝平铺） */
export function createWaterRippleNormal(): THREE.CanvasTexture {
  const w = 256;
  const h = 256;
  const height = new Float32Array(w * h);
  const rand = mulberry32(20261126);

  const waves: Array<{ fx: number; fy: number; amp: number; phase: number }> = [];
  for (let i = 0; i < 14; i++) {
    const fx = Math.round((rand() * 2 - 1) * 7);
    const fy = Math.round((rand() * 2 - 1) * 7);
    if (fx === 0 && fy === 0) continue;
    waves.push({
      fx,
      fy,
      amp: 0.08 + rand() * 0.12,
      phase: rand() * Math.PI * 2,
    });
  }

  for (let y = 0; y < h; y++) {
    const v = (y / h) * Math.PI * 2;
    for (let x = 0; x < w; x++) {
      const u = (x / w) * Math.PI * 2;
      let val = 0;
      for (const wv of waves) {
        val += Math.sin(u * wv.fx + v * wv.fy + wv.phase) * wv.amp;
      }
      val += tileableNoise(x / w, y / h, 16, 99.1) * 0.25;
      height[y * w + x] = val;
    }
  }

  const normalCanvas = heightToNormalCanvas(height, w, h, 1.35);
  return finalizeTexture(normalCanvas, THREE.NoColorSpace, true, 8, 7);
}

/** 托盘底部多级高斯羽化圆角接触阴影（256×256） */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 256;
  const [canvas, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);

  // 阴影平面尺寸 78×66，木盘底脚约 62.9×50.9 -> 归一化半宽高约 0.806 / 0.771
  const hx = 0.79;
  const hz = 0.75;
  const r = 0.065;

  for (let y = 0; y < h; y++) {
    const nz = (y / (h - 1)) * 2 - 1;
    for (let x = 0; x < w; x++) {
      const nx = (x / (w - 1)) * 2 - 1;
      const qx = Math.abs(nx) - (hx - r);
      const qz = Math.abs(nz) - (hz - r);
      const dist = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;

      // 多级羽化：内侧实影 + 中圈过渡 + 远端柔光晕（到边缘完全归零）
      const core = Math.exp(-Math.pow(Math.max(dist + 0.02, 0) / 0.045, 2.0));
      const mid = Math.exp(-Math.pow(Math.max(dist + 0.01, 0) / 0.11, 2.0));
      const soft = Math.exp(-Math.pow(Math.max(dist, 0) / 0.19, 2.0));
      const borderFade = Math.max(0, 1 - Math.pow(Math.max(Math.abs(nx), Math.abs(nz)), 6.0));

      const alpha = Math.min(1, (core * 0.56 + mid * 0.28 + soft * 0.16) * borderFade);
      const idx = (y * w + x) * 4;
      img.data[idx] = 10;
      img.data[idx + 1] = 12;
      img.data[idx + 2] = 15;
      img.data[idx + 3] = Math.round(alpha * 255);
    }
  }

  ctx.putImageData(img, 0, 0);
  return finalizeTexture(canvas, THREE.SRGBColorSpace, false, 1, 1);
}

let cachedGlazedTile: Required<PBRTextureSet> | null = null;
/** 清式琉璃筒瓦楞（128×128，高对比中性灰瓦楞底图，供明黄/翠绿/青灰着色复用） */
export function createGlazedTileTextures(): Required<PBRTextureSet> {
  if (cachedGlazedTile) return cachedGlazedTile;
  const w = 128;
  const h = 128;
  const [albedoCanvas, aCtx] = makeCanvas(w, h);
  const [roughCanvas, rCtx] = makeCanvas(w, h);
  const aImg = aCtx.createImageData(w, h);
  const rImg = rCtx.createImageData(w, h);
  const height = new Float32Array(w * h);

  const cols = 6;
  const rows = 4;
  for (let y = 0; y < h; y++) {
    const v = y / h;
    const rowF = v * rows;
    const fy = rowF - Math.floor(rowF);
    // 每排瓦檐呈搭接阶梯状
    const overlap = Math.min(1, fy / 0.14);
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const colF = u * cols;
      const fx = colF - Math.floor(colF);
      // 圆柱形筒瓦楞剖面（瓦背高光亮、瓦沟深邃）
      const arch = Math.sin(fx * Math.PI);
      const hVal = Math.pow(arch, 0.72) * 0.75 + overlap * 0.25;
      height[y * w + x] = hVal;

      const shade = 0.56 + Math.pow(arch, 0.85) * 0.34 + overlap * 0.12 - (fy < 0.09 ? 0.18 : 0);
      const val = Math.round(Math.min(255, Math.max(0, shade * 242)));
      const idx = (y * w + x) * 4;
      aImg.data[idx] = val;
      aImg.data[idx + 1] = val;
      aImg.data[idx + 2] = val;
      aImg.data[idx + 3] = 255;

      const rough = Math.round((0.18 + (1 - arch) * 0.24) * 255);
      rImg.data[idx] = rough;
      rImg.data[idx + 1] = rough;
      rImg.data[idx + 2] = rough;
      rImg.data[idx + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  const normalCanvas = heightToNormalCanvas(height, w, h, 3.4);

  cachedGlazedTile = {
    map: finalizeTexture(albedoCanvas, THREE.SRGBColorSpace, true, 1, 1),
    normalMap: finalizeTexture(normalCanvas, THREE.NoColorSpace, true, 1, 1),
    roughnessMap: finalizeTexture(roughCanvas, THREE.NoColorSpace, true, 1, 1),
  };
  return cachedGlazedTile;
}

let cachedQingBrick: Required<PBRTextureSet> | null = null;
/** 清式青砖砌筑纹理（256×256） */
export function createQingBrickTextures(): Required<PBRTextureSet> {
  if (cachedQingBrick) return cachedQingBrick;
  const w = 256;
  const h = 256;
  const [albedoCanvas, aCtx] = makeCanvas(w, h);
  const [roughCanvas, rCtx] = makeCanvas(w, h);
  const aImg = aCtx.createImageData(w, h);
  const rImg = rCtx.createImageData(w, h);
  const height = new Float32Array(w * h);

  const rows = 8;
  const cols = 4;
  for (let y = 0; y < h; y++) {
    const v = y / h;
    const rowF = v * rows;
    const rowIdx = Math.floor(rowF);
    const fy = rowF - rowIdx;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const offsetU = rowIdx % 2 === 1 ? 0.5 / cols : 0;
      const colF = fract(u + offsetU) * cols;
      const colIdx = Math.floor(colF);
      const fx = colF - colIdx;

      const edgeX = Math.min(fx, 1 - fx) * 2;
      const edgeY = Math.min(fy, 1 - fy) * 2;
      const mortar = Math.min(1, Math.max(0, (edgeX - 0.045) / 0.055)) *
        Math.min(1, Math.max(0, (edgeY - 0.08) / 0.08));

      const brickSeed = fract(Math.sin((rowIdx * 17 + colIdx * 53) * 71.3) * 43758.5453);
      const grain = tileableNoise(u, v, 32, 8.1) * 0.6 + tileableNoise(u, v, 64, 19.7) * 0.4;
      const baseTone = 0.43 + brickSeed * 0.1 + (grain - 0.5) * 0.08;
      const mortarTone = 0.64;
      const tone = mortarTone + (baseTone - mortarTone) * mortar;

      const idx = (y * w + x) * 4;
      aImg.data[idx] = Math.round(Math.min(255, tone * 212));
      aImg.data[idx + 1] = Math.round(Math.min(255, tone * 216));
      aImg.data[idx + 2] = Math.round(Math.min(255, tone * 222));
      aImg.data[idx + 3] = 255;

      const rough = Math.round((0.86 - mortar * 0.08 + (1 - grain) * 0.1) * 255);
      rImg.data[idx] = rough;
      rImg.data[idx + 1] = rough;
      rImg.data[idx + 2] = rough;
      rImg.data[idx + 3] = 255;

      height[y * w + x] = mortar * 0.72 + grain * 0.28;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  const normalCanvas = heightToNormalCanvas(height, w, h, 2.2);

  cachedQingBrick = {
    map: finalizeTexture(albedoCanvas, THREE.SRGBColorSpace, true, 1, 1),
    normalMap: finalizeTexture(normalCanvas, THREE.NoColorSpace, true, 1, 1),
    roughnessMap: finalizeTexture(roughCanvas, THREE.NoColorSpace, true, 1, 1),
  };
  return cachedQingBrick;
}

let cachedLattice: { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } | null = null;
/** 清式朱红三交六椀菱花隔扇门窗（256×256） */
export function createLatticeWindowTextures(): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  if (cachedLattice) return cachedLattice;
  const w = 256;
  const h = 256;
  const [canvas, ctx] = makeCanvas(w, h);
  const [nCanvas, nCtx] = makeCanvas(w, h);

  // 外框朱红漆底
  ctx.fillStyle = '#7e1e16';
  ctx.fillRect(0, 0, w, h);

  // 法线底（平坦中性）
  nCtx.fillStyle = 'rgb(128,128,255)';
  nCtx.fillRect(0, 0, w, h);

  const bays = 4;
  const bayW = w / bays;
  for (let b = 0; b < bays; b++) {
    const bx = b * bayW;
    // 每扇隔扇阴影凹槽
    ctx.fillStyle = '#380c09';
    ctx.fillRect(bx + 2, 6, bayW - 4, h - 12);

    // 外抹头边框
    ctx.fillStyle = '#99271d';
    ctx.fillRect(bx + 5, 10, bayW - 10, h - 20);

    // 上段菱花窗心（米宣纸透亮衬底）
    const winTop = 18;
    const winH = 148;
    ctx.fillStyle = '#dfd5bc';
    ctx.fillRect(bx + 11, winTop, bayW - 22, winH);

    // 三交六椀菱花格栅线条
    ctx.strokeStyle = '#8b2117';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    const cellH = winH / 4;
    for (let r = 0; r < 4; r++) {
      const y0 = winTop + r * cellH;
      const yMid = y0 + cellH * 0.5;
      const y1 = y0 + cellH;
      const xL = bx + 11;
      const xR = bx + bayW - 11;
      const xM = (xL + xR) * 0.5;
      ctx.moveTo(xL, y0);
      ctx.lineTo(xR, y1);
      ctx.moveTo(xR, y0);
      ctx.lineTo(xL, y1);
      ctx.moveTo(xL, yMid);
      ctx.lineTo(xR, yMid);
      ctx.moveTo(xM, y0);
      ctx.lineTo(xM, y1);
    }
    ctx.stroke();

    // 格心金线点缀
    ctx.fillStyle = '#d4a64a';
    for (let r = 0; r < 4; r++) {
      const yMid = winTop + (r + 0.5) * cellH;
      ctx.fillRect(bx + bayW * 0.5 - 2, yMid - 2, 4, 4);
    }

    // 绦环板与下段朱红裙板
    ctx.fillStyle = '#6f1811';
    ctx.fillRect(bx + 11, 174, bayW - 22, 62);
    ctx.strokeStyle = '#cfa146';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(bx + 15, 179, bayW - 30, 52);

    // 凸起框条法线信息
    nCtx.strokeStyle = 'rgb(185,128,255)';
    nCtx.lineWidth = 4;
    nCtx.strokeRect(bx + 6, 12, bayW - 12, h - 24);
  }

  cachedLattice = {
    map: finalizeTexture(canvas, THREE.SRGBColorSpace, true, 1, 1),
    normalMap: finalizeTexture(nCanvas, THREE.NoColorSpace, true, 1, 1),
  };
  return cachedLattice;
}

let cachedSuzhou: THREE.CanvasTexture | null = null;
/** 512×128 精绘苏式包袱彩画额枋（青绿底色 + 半圆包袱心山水花卉 + 金线卡子） */
export function createSuzhouPaintingTexture(): THREE.CanvasTexture {
  if (cachedSuzhou) return cachedSuzhou;
  const w = 512;
  const h = 128;
  const [canvas, ctx] = makeCanvas(w, h);

  // 1. 主体石青底色 + 上下青绿边带
  ctx.fillStyle = '#194a5e';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#1c634e';
  ctx.fillRect(0, 0, w, 24);
  ctx.fillRect(0, h - 22, w, 22);

  // 2. 上下金线、朱红线及暗影边框
  ctx.fillStyle = '#2d1a14';
  ctx.fillRect(0, 0, w, 4);
  ctx.fillRect(0, h - 4, w, 4);

  ctx.fillStyle = '#dfb14f';
  ctx.fillRect(0, 6, w, 3);
  ctx.fillRect(0, 22, w, 3);
  ctx.fillRect(0, h - 24, w, 3);
  ctx.fillRect(0, h - 9, w, 3);

  ctx.fillStyle = '#9e2e24';
  ctx.fillRect(0, 12, w, 6);
  ctx.fillRect(0, h - 18, w, 5);

  // 3. 两侧找头退晕卷草与卡子纹样
  const drawKazi = (cx: number) => {
    ctx.fillStyle = '#a22f24';
    ctx.beginPath();
    ctx.roundRect(cx - 20, 32, 40, 62, 8);
    ctx.fill();
    ctx.strokeStyle = '#e5b856';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#1d664f';
    ctx.beginPath();
    ctx.arc(cx, 63, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f0cc75';
    ctx.beginPath();
    ctx.arc(cx, 63, 5, 0, Math.PI * 2);
    ctx.fill();
  };
  drawKazi(36);
  drawKazi(w - 36);

  // 4. 左右小包袱心与中央大苏式包袱心（淡金宣底 + 写意山水青绿花鸟）
  const drawBaofu = (cx: number, rx: number, ry: number, mountainSeed: number) => {
    // 外青绿退晕框
    ctx.fillStyle = '#246e59';
    ctx.beginPath();
    ctx.ellipse(cx, 25, rx + 9, ry + 8, 0, 0, Math.PI);
    ctx.fill();

    // 淡宣金底包袱心
    ctx.fillStyle = '#ebe1c8';
    ctx.beginPath();
    ctx.ellipse(cx, 25, rx, ry, 0, 0, Math.PI);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, 25, rx - 1, ry - 1, 0, 0, Math.PI);
    ctx.clip();

    // 淡墨远山青绿写意山水
    ctx.fillStyle = '#759985';
    ctx.beginPath();
    ctx.moveTo(cx - rx, 25 + ry);
    ctx.quadraticCurveTo(cx - rx * 0.35, 25 + ry * (0.35 + mountainSeed * 0.1), cx, 25 + ry * 0.56);
    ctx.quadraticCurveTo(cx + rx * 0.4, 25 + ry * 0.28, cx + rx, 25 + ry * 0.65);
    ctx.lineTo(cx + rx, 25 + ry);
    ctx.closePath();
    ctx.fill();

    // 水岸亭阁剪影与红梅点缀
    ctx.fillStyle = '#2c4c47';
    ctx.beginPath();
    ctx.moveTo(cx - rx, 25 + ry * 0.85);
    ctx.quadraticCurveTo(cx, 25 + ry * 0.62, cx + rx, 25 + ry * 0.82);
    ctx.lineTo(cx + rx, 25 + ry);
    ctx.lineTo(cx - rx, 25 + ry);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#a83428';
    ctx.beginPath();
    ctx.arc(cx - rx * 0.32, 25 + ry * 0.44, 4.2, 0, Math.PI * 2);
    ctx.arc(cx + rx * 0.25, 25 + ry * 0.36, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 包袱金色收口描边
    ctx.strokeStyle = '#e5b856';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.ellipse(cx, 25, rx, ry, 0, 0, Math.PI);
    ctx.stroke();
  };

  drawBaofu(132, 50, 56, 0.2);
  drawBaofu(256, 70, 68, 0.5);
  drawBaofu(380, 50, 56, 0.8);

  // 包袱间隔万字金纹
  ctx.strokeStyle = '#d9ac4d';
  ctx.lineWidth = 2;
  for (const x of [76, 186, 326, 436]) {
    ctx.strokeRect(x - 6, 52, 12, 26);
    ctx.beginPath();
    ctx.moveTo(x - 6, 65);
    ctx.lineTo(x + 6, 65);
    ctx.stroke();
  }

  cachedSuzhou = finalizeTexture(canvas, THREE.SRGBColorSpace, true, 1, 1);
  return cachedSuzhou;
}

let cachedMarble: { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } | null = null;
/** 汉白玉雕花栏板材质（256×128） */
export function createMarbleCarvingTextures(): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  if (cachedMarble) return cachedMarble;
  const w = 256;
  const h = 128;
  const [albedoCanvas, aCtx] = makeCanvas(w, h);
  const aImg = aCtx.createImageData(w, h);
  const height = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const vein = tileableNoise(u * 2.0, v, 6, 33.7) * 0.6 + tileableNoise(u, v * 2.0, 14, 17.2) * 0.4;
      // 栏板内部浮雕边框与云头
      const inBoxX = Math.min(u, 1 - u);
      const inBoxY = Math.min(v, 1 - v);
      const frame = inBoxX > 0.08 && inBoxY > 0.14 ? 1 : 0;
      const scroll = frame * (Math.sin(u * Math.PI * 6) * Math.sin(v * Math.PI * 4) * 0.5 + 0.5);

      const tone = 0.84 + vein * 0.07 - (frame ? 0.02 : 0) + scroll * 0.03;
      const idx = (y * w + x) * 4;
      aImg.data[idx] = Math.round(Math.min(255, tone * 240));
      aImg.data[idx + 1] = Math.round(Math.min(255, tone * 236));
      aImg.data[idx + 2] = Math.round(Math.min(255, tone * 226));
      aImg.data[idx + 3] = 255;

      height[y * w + x] = vein * 0.35 + (1 - frame) * 0.35 + scroll * 0.3;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  const normalCanvas = heightToNormalCanvas(height, w, h, 1.8);

  cachedMarble = {
    map: finalizeTexture(albedoCanvas, THREE.SRGBColorSpace, true, 1, 1),
    normalMap: finalizeTexture(normalCanvas, THREE.NoColorSpace, true, 1, 1),
  };
  return cachedMarble;
}

let cachedSoftMist: THREE.CanvasTexture | null = null;
/** 山间流动软边轻雾贴图（128×128，边缘严格零透明度羽化） */
export function createSoftMistTexture(): THREE.CanvasTexture {
  if (cachedSoftMist) return cachedSoftMist;
  const w = 128;
  const h = 128;
  const [canvas, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);

  for (let y = 0; y < h; y++) {
    const ny = (y / (h - 1)) * 2 - 1;
    for (let x = 0; x < w; x++) {
      const nx = (x / (w - 1)) * 2 - 1;
      const dist = Math.hypot(nx, ny * 1.15);
      const radial = Math.max(0, 1 - dist);
      const envelope = Math.pow(radial, 1.85);
      const fbm =
        tileableNoise(x / w, y / h, 4, 17.3) * 0.55 +
        tileableNoise(x / w, y / h, 8, 41.9) * 0.3 +
        tileableNoise(x / w, y / h, 16, 83.2) * 0.15;

      const alpha = Math.min(1, envelope * (0.45 + fbm * 0.85));
      const idx = (y * w + x) * 4;
      img.data[idx] = 248;
      img.data[idx + 1] = 250;
      img.data[idx + 2] = 246;
      img.data[idx + 3] = Math.round(alpha * 255);
    }
  }

  ctx.putImageData(img, 0, 0);
  cachedSoftMist = finalizeTexture(canvas, THREE.SRGBColorSpace, false, 1, 1);
  return cachedSoftMist;
}

function finalizeLeafTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

let cachedDeciduousCluster: THREE.CanvasTexture | null = null;
/** 落叶阔叶精细枝叶簇 Alpha 贴图（256×256，用于 alphaTest 镂空树冠） */
export function createDeciduousLeafClusterTexture(): THREE.CanvasTexture {
  if (cachedDeciduousCluster) return cachedDeciduousCluster;
  const w = 256;
  const h = 256;
  const [canvas, ctx] = makeCanvas(w, h);
  const rand = mulberry32(7101);
  ctx.clearRect(0, 0, w, h);

  // 内部细枝骨架
  ctx.strokeStyle = 'rgba(115, 110, 102, 0.96)';
  ctx.lineCap = 'round';
  const subCenters: Array<{ x: number; y: number; r: number }> = [
    { x: 128, y: 122, r: 52 },
    { x: 76, y: 136, r: 44 },
    { x: 180, y: 132, r: 44 },
    { x: 102, y: 76, r: 44 },
    { x: 158, y: 78, r: 42 },
    { x: 128, y: 168, r: 40 },
  ];
  for (const sc of subCenters) {
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(128, 224);
    ctx.quadraticCurveTo((128 + sc.x) * 0.5, 185, sc.x, sc.y);
    ctx.stroke();
  }

  // 分两层绘制约 72 片错落尖椭圆/扇形小叶（深底明梢立体明暗）
  for (let pass = 0; pass < 2; pass++) {
    const count = pass === 0 ? 34 : 38;
    for (let i = 0; i < count; i++) {
      const sc = subCenters[i % subCenters.length];
      const ang = rand() * Math.PI * 2;
      const dist = Math.pow(rand(), 0.65) * sc.r;
      const lx = sc.x + Math.cos(ang) * dist;
      const ly = sc.y + Math.sin(ang) * dist;
      if (lx < 16 || lx > 240 || ly < 16 || ly > 240) continue;

      const leafAng = Math.atan2(ly - 140, lx - 128) + (rand() - 0.5) * 1.1;
      const len = (pass === 0 ? 18 : 15) + rand() * 11;
      const wid = len * (0.48 + rand() * 0.22);
      const lum = pass === 0 ? Math.round(145 + rand() * 45) : Math.round(202 + rand() * 48);

      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(leafAng);
      ctx.fillStyle = `rgb(${lum}, ${lum}, ${Math.max(0, lum - 6)})`;
      ctx.beginPath();
      ctx.moveTo(-len * 0.45, 0);
      ctx.quadraticCurveTo(0, -wid, len * 0.55, 0);
      ctx.quadraticCurveTo(0, wid, -len * 0.45, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  cachedDeciduousCluster = finalizeLeafTexture(canvas);
  return cachedDeciduousCluster;
}

let cachedPineSpray: THREE.CanvasTexture | null = null;
/** 常绿苍松扇形/层云细密松针簇 Alpha 贴图（256×256） */
export function createPineNeedleSprayTexture(): THREE.CanvasTexture {
  if (cachedPineSpray) return cachedPineSpray;
  const w = 256;
  const h = 256;
  const [canvas, ctx] = makeCanvas(w, h);
  const rand = mulberry32(7209);
  ctx.clearRect(0, 0, w, h);

  const hubs = [
    { x: 128, y: 136, n: 32, r: 62 },
    { x: 76, y: 126, n: 26, r: 50 },
    { x: 180, y: 126, n: 26, r: 50 },
    { x: 102, y: 82, n: 24, r: 46 },
    { x: 156, y: 82, n: 24, r: 46 },
  ];

  // 松枝暗底
  ctx.strokeStyle = 'rgba(110, 102, 94, 0.96)';
  ctx.lineWidth = 3.5;
  for (const hb of hubs) {
    ctx.beginPath();
    ctx.moveTo(128, 206);
    ctx.lineTo(hb.x, hb.y);
    ctx.stroke();
  }

  for (const hb of hubs) {
    // 中心实垫保障远距 mipmap 不漏空
    ctx.fillStyle = 'rgb(156, 158, 154)';
    ctx.beginPath();
    ctx.arc(hb.x, hb.y, hb.r * 0.42, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < hb.n; i++) {
      const ang = (i / hb.n) * Math.PI * 2 + (rand() - 0.5) * 0.25;
      const len = hb.r * (0.68 + rand() * 0.42);
      const lum = Math.round(160 + rand() * 88);
      ctx.save();
      ctx.translate(hb.x, hb.y);
      ctx.rotate(ang);
      ctx.fillStyle = `rgb(${lum}, ${lum + 2}, ${lum - 2})`;
      ctx.beginPath();
      ctx.moveTo(0, -3.4);
      ctx.lineTo(len, 0);
      ctx.lineTo(0, 3.4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  cachedPineSpray = finalizeLeafTexture(canvas);
  return cachedPineSpray;
}

let cachedWillowFrond: THREE.CanvasTexture | null = null;
/** 垂柳纤细下垂枝条与柳叶丝帘 Alpha 贴图（256×256） */
export function createWillowFrondTexture(): THREE.CanvasTexture {
  if (cachedWillowFrond) return cachedWillowFrond;
  const w = 256;
  const h = 256;
  const [canvas, ctx] = makeCanvas(w, h);
  const rand = mulberry32(7307);
  ctx.clearRect(0, 0, w, h);

  // 顶部拱枝聚束 + 18 条参差垂坠柳丝
  const strands = 18;
  for (let s = 0; s < strands; s++) {
    const t = s / (strands - 1);
    const startX = 68 + t * 120 + (rand() - 0.5) * 6;
    const startY = 14 + Math.abs(t - 0.5) * 38;
    const endX = 28 + t * 200 + (rand() - 0.5) * 14;
    const endY = 165 + Math.sin(t * Math.PI) * 74 + rand() * 14;
    const ctrlX = (startX + endX) * 0.5 + (t - 0.5) * 26;
    const ctrlY = (startY + endY) * 0.44;

    ctx.strokeStyle = 'rgb(168, 172, 158)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
    ctx.stroke();

    const leaves = 14;
    for (let k = 1; k <= leaves; k++) {
      const u = k / (leaves + 0.5);
      const imu = 1 - u;
      const px = imu * imu * startX + 2 * imu * u * ctrlX + u * u * endX;
      const py = imu * imu * startY + 2 * imu * u * ctrlY + u * u * endY;
      const side = k % 2 === 0 ? 1 : -1;
      const lum = Math.round(175 + u * 62 + rand() * 16);

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.PI * 0.5 + side * (0.28 + rand() * 0.22));
      ctx.fillStyle = `rgb(${lum}, ${lum}, ${Math.max(0, lum - 8)})`;
      ctx.beginPath();
      ctx.moveTo(-2, 0);
      ctx.quadraticCurveTo(8, -3.2, 19, 0);
      ctx.quadraticCurveTo(8, 3.2, -2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  cachedWillowFrond = finalizeLeafTexture(canvas);
  return cachedWillowFrond;
}

let cachedShrubLeaf: THREE.CanvasTexture | null = null;
/** 低矮灌木枝叶簇 Alpha 贴图（256×256） */
export function createShrubLeafTexture(): THREE.CanvasTexture {
  if (cachedShrubLeaf) return cachedShrubLeaf;
  const w = 256;
  const h = 256;
  const [canvas, ctx] = makeCanvas(w, h);
  const rand = mulberry32(7411);
  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < 64; i++) {
    const ang = -Math.PI * 0.92 + rand() * Math.PI * 0.84;
    const dist = 24 + Math.pow(rand(), 0.72) * 145;
    const lx = 128 + Math.cos(ang) * dist * 0.75;
    const ly = 232 + Math.sin(ang) * dist;
    if (lx < 16 || lx > 240 || ly < 22 || ly > 242) continue;

    const len = 18 + rand() * 12;
    const wid = len * 0.45;
    const lum = Math.round(142 + (1 - ly / 245) * 95 + rand() * 18);
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(ang + (rand() - 0.5) * 0.45);
    ctx.fillStyle = `rgb(${lum}, ${lum}, ${Math.max(0, lum - 6)})`;
    ctx.beginPath();
    ctx.moveTo(-len * 0.4, 0);
    ctx.quadraticCurveTo(0, -wid, len * 0.6, 0);
    ctx.quadraticCurveTo(0, wid, -len * 0.4, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  cachedShrubLeaf = finalizeLeafTexture(canvas);
  return cachedShrubLeaf;
}

let cachedBoatCabin: THREE.CanvasTexture | null = null;
/** 画舫舱壁专用离屏彩绘贴图（256×256：苏式彩画楣带 + 暖光菱花隔扇 + 朱红裙板） */
export function createBoatCabinTexture(): THREE.CanvasTexture {
  if (cachedBoatCabin) return cachedBoatCabin;
  const w = 256;
  const h = 256;
  const [canvas, ctx] = makeCanvas(w, h);

  // 1. 顶部苏式彩画额枋带 (y: 0..72 -> UV v: 0.72..1.0)
  ctx.fillStyle = '#194a5e';
  ctx.fillRect(0, 0, w, 72);
  ctx.fillStyle = '#1c634e';
  ctx.fillRect(0, 0, w, 12);
  ctx.fillRect(0, 58, w, 14);
  ctx.fillStyle = '#2d1a14';
  ctx.fillRect(0, 0, w, 3);
  ctx.fillStyle = '#dfb14f';
  ctx.fillRect(0, 13, w, 2);
  ctx.fillRect(0, 56, w, 2);
  ctx.fillRect(0, 68, w, 2);

  for (const cx of [54, 128, 202]) {
    ctx.fillStyle = '#ebe0c4';
    ctx.beginPath();
    ctx.ellipse(cx, 15, 28, 35, 0, 0, Math.PI);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, 15, 27, 34, 0, 0, Math.PI);
    ctx.clip();
    ctx.fillStyle = '#6f9380';
    ctx.beginPath();
    ctx.moveTo(cx - 28, 50);
    ctx.quadraticCurveTo(cx - 8, 28, cx + 2, 36);
    ctx.quadraticCurveTo(cx + 14, 24, cx + 28, 46);
    ctx.lineTo(cx + 28, 52);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a83428';
    ctx.beginPath();
    ctx.arc(cx - 8, 31, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = '#dfb14f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, 15, 28, 35, 0, 0, Math.PI);
    ctx.stroke();
  }

  // 2. 中段暖光透映三交六椀菱花隔扇窗带 (y: 72..200 -> UV v: 0.22..0.72)
  ctx.fillStyle = '#8b1f17';
  ctx.fillRect(0, 72, w, 128);
  const bayW = w / 4;
  for (let b = 0; b < 4; b++) {
    const bx = b * bayW;
    ctx.fillStyle = '#661510';
    ctx.fillRect(bx + 5, 80, bayW - 10, 112);

    const grad = ctx.createRadialGradient(bx + bayW * 0.5, 136, 4, bx + bayW * 0.5, 136, 48);
    grad.addColorStop(0, '#fae1a5');
    grad.addColorStop(0.65, '#e8bf70');
    grad.addColorStop(1, '#c48f48');
    ctx.fillStyle = grad;
    ctx.fillRect(bx + 8, 84, bayW - 16, 104);

    // 菱花纤细木格棂
    ctx.strokeStyle = '#8b1f17';
    ctx.lineWidth = 2.2;
    ctx.strokeRect(bx + 8, 84, bayW - 16, 104);
    for (let row = 0; row < 4; row++) {
      const y0 = 84 + row * 26;
      const y1 = y0 + 26;
      const x0 = bx + 8;
      const x1 = bx + bayW - 8;
      const xm = (x0 + x1) * 0.5;
      const ym = (y0 + y1) * 0.5;
      ctx.beginPath();
      ctx.moveTo(x0, ym);
      ctx.lineTo(xm, y0);
      ctx.lineTo(x1, ym);
      ctx.lineTo(xm, y1);
      ctx.closePath();
      ctx.moveTo(xm, y0);
      ctx.lineTo(xm, y1);
      ctx.moveTo(x0, y1);
      ctx.lineTo(x1, y1);
      ctx.stroke();

      ctx.fillStyle = '#d8aa4a';
      ctx.beginPath();
      ctx.arc(xm, ym, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 3. 底部裙板与纯朱红柱栏通用区 (y: 200..256 -> UV v: 0.0..0.22)
  ctx.fillStyle = '#96231a';
  ctx.fillRect(0, 200, w, 56);
  ctx.fillStyle = '#dfb14f';
  ctx.fillRect(0, 200, w, 2);
  for (let b = 0; b < 4; b++) {
    ctx.fillStyle = '#731811';
    ctx.fillRect(b * bayW + 8, 206, bayW - 16, 18);
  }

  cachedBoatCabin = finalizeTexture(canvas, THREE.SRGBColorSpace, false, 1, 1);
  return cachedBoatCabin;
}

const cachedStudioBackdrops = new Map<string, THREE.CanvasTexture>();
/** 柔和博物馆棚拍径向画廊渐变背景贴图（512×512，外缘精准对齐 fogHex 实现零接缝融合） */
export function createStudioBackdropTexture(centerHex: number, edgeHex: number): THREE.CanvasTexture {
  const key = `${centerHex.toString(16)}_${edgeHex.toString(16)}`;
  const existing = cachedStudioBackdrops.get(key);
  if (existing) return existing;

  const w = 512;
  const h = 512;
  const [canvas, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const data = img.data;

  const cr = (centerHex >> 16) & 0xff;
  const cg = (centerHex >> 8) & 0xff;
  const cb = centerHex & 0xff;
  const er = (edgeHex >> 16) & 0xff;
  const eg = (edgeHex >> 8) & 0xff;
  const eb = edgeHex & 0xff;

  for (let y = 0; y < h; y++) {
    const ny = y / (h - 1);
    const dy = (ny - 0.43) * 1.12;
    for (let x = 0; x < w; x++) {
      const nx = x / (w - 1);
      const dx = (nx - 0.5) * 0.92;
      const r = Math.min(1, Math.hypot(dx, dy) / 0.72);
      const smooth = r * r * (3 - 2 * r);
      const topLift = Math.max(0, 1 - ny * 1.6) * 0.08;
      const t = Math.max(0, Math.min(1, smooth - topLift * (1 - smooth)));
      const dither = (fract(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) - 0.5) * 1.5;

      const idx = (y * w + x) * 4;
      data[idx] = Math.max(0, Math.min(255, Math.round(cr + (er - cr) * t + dither)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.round(cg + (eg - cg) * t + dither)));
      data[idx + 2] = Math.max(0, Math.min(255, Math.round(cb + (eb - cb) * t + dither)));
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = finalizeTexture(canvas, THREE.SRGBColorSpace, false, 1, 1);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  cachedStudioBackdrops.set(key, tex);
  return tex;
}



