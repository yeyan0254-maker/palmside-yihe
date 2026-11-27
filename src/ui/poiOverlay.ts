import * as THREE from 'three';
import { SCENIC_SPOTS, type ScenicSpotDef, type ScenicSpotId } from '../config/sceneConfig';

export interface PoiOverlayOptions {
  root: HTMLElement;
  onSelectSpot: (id: ScenicSpotId) => void;
}

export interface PoiUpdateParams {
  visible: boolean;
  activeSpotId: ScenicSpotId;
  rightPanelOpen: boolean;
  force?: boolean;
}

export interface PoiOverlayHandle {
  update: (camera: THREE.Camera, width: number, height: number, opts: PoiUpdateParams) => void;
}

interface PinItem {
  spot: ScenicSpotDef;
  anchor: THREE.Vector3;
  el: HTMLButtonElement;
  boxW: number;
  boxH: number;
}

interface PlacedRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * 3D-to-2D 景点悬浮标注层（PRD 5.2）：
 * - 纯 DOM 微胶囊映射，0 WebGL DrawCall，零每帧对象分配
 * - 内置相机矩阵脏检查，静止帧零 DOM 写入
 * - 严格按激活态、优先级与距相机远近排序，执行 >= 12px 包围盒防重叠剔除与留白安全区避让
 */
export function createPoiOverlay(opts: PoiOverlayOptions): PoiOverlayHandle {
  const layer = document.createElement('div');
  layer.className = 'poi-layer';
  opts.root.appendChild(layer);

  const anchorSpots = SCENIC_SPOTS.filter((s) => s.anchor !== undefined);
  const pins: PinItem[] = anchorSpots.map((spot) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'poi-pin is-hidden';
    btn.title = `${spot.label} · ${spot.tag}`;

    const dot = document.createElement('span');
    dot.className = 'poi-dot';
    const text = document.createElement('span');
    text.className = 'poi-label';
    text.textContent = spot.label;

    btn.append(dot, text);
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    btn.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      btn.blur();
      opts.onSelectSpot(spot.id);
    });

    layer.appendChild(btn);
    return {
      spot,
      anchor: new THREE.Vector3(spot.anchor![0], spot.anchor![1], spot.anchor![2]),
      el: btn,
      boxW: spot.label.length * 13 + 32,
      boxH: 28,
    };
  });

  const tmpProj = new THREE.Vector3();
  const candidates: Array<{
    pin: PinItem;
    sx: number;
    sy: number;
    dist: number;
    isActive: boolean;
  }> = [];
  const placed: PlacedRect[] = [];

  let lastSig = '';

  const buildCameraSignature = (
    camera: THREE.Camera,
    w: number,
    h: number,
    u: PoiUpdateParams
  ): string => {
    const m = camera.matrixWorldInverse.elements;
    const p = camera.projectionMatrix.elements;
    const camSig =
      m[0] * 1.1 +
      m[4] * 1.3 +
      m[8] * 1.7 +
      m[12] * 2.3 +
      m[13] * 2.9 +
      m[14] * 3.1 +
      m[5] * 3.7 +
      p[0] * 4.1 +
      p[5] * 4.3;
    return `${camSig.toFixed(4)}|${w}x${h}|${u.visible ? 1 : 0}|${u.activeSpotId}|${u.rightPanelOpen ? 1 : 0}`;
  };

  const update = (
    camera: THREE.Camera,
    width: number,
    height: number,
    params: PoiUpdateParams
  ) => {
    if (width <= 0 || height <= 0) return;

    const sig = buildCameraSignature(camera, width, height, params);
    if (!params.force && sig === lastSig) return;
    lastSig = sig;

    if (!params.visible) {
      layer.classList.add('is-muted');
      for (const pin of pins) {
        pin.el.classList.add('is-hidden');
      }
      return;
    }
    layer.classList.remove('is-muted');

    camera.updateMatrixWorld(false);
    candidates.length = 0;

    const overviewLeftGuardX = params.activeSpotId === 'overview' ? 316 : 306;
    const overviewLeftGuardY = params.activeSpotId === 'overview' ? 305 : 275;
    const rightGuardX = params.rightPanelOpen ? width - 318 : width - 86;

    for (const pin of pins) {
      pin.el.classList.add('is-hidden');
      pin.el.classList.toggle('is-active', pin.spot.id === params.activeSpotId);

      tmpProj.copy(pin.anchor).project(camera);
      if (tmpProj.z < -1 || tmpProj.z > 1) continue;

      const sx = (tmpProj.x * 0.5 + 0.5) * width;
      const sy = (-tmpProj.y * 0.5 + 0.5) * height;

      // 视口安全边距 + 左上文案/导览卡 + 左下题记 + 右下时辰 + 右侧工具栏/展开面板全向避让
      if (sx < 56 || sx > width - 56 || sy < 74 || sy > height - 96) continue;
      if (sx < overviewLeftGuardX && sy < overviewLeftGuardY) continue;
      if (sx < 292 && sy > height - 185) continue;
      if (sx > width - 260 && sy > height - 108) continue;
      if (sx > rightGuardX && sy > 96 && sy < height - 88) continue;

      candidates.push({
        pin,
        sx,
        sy,
        dist: camera.position.distanceTo(pin.anchor),
        isActive: pin.spot.id === params.activeSpotId,
      });
    }

    // PRD 5.2：按激活态 + 优先级 + 距相机近远排序
    candidates.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      const pa = a.pin.spot.priority ?? 99;
      const pb = b.pin.spot.priority ?? 99;
      if (pa !== pb) return pa - pb;
      return a.dist - b.dist;
    });

    placed.length = 0;
    const gap = 12;

    for (const c of candidates) {
      const halfW = c.pin.boxW * 0.5;
      const rect: PlacedRect = {
        left: c.sx - halfW,
        right: c.sx + halfW,
        top: c.sy - c.pin.boxH,
        bottom: c.sy,
      };

      let collides = false;
      for (const prev of placed) {
        if (
          rect.left < prev.right + gap &&
          rect.right + gap > prev.left &&
          rect.top < prev.bottom + gap &&
          rect.bottom + gap > prev.top
        ) {
          collides = true;
          break;
        }
      }

      if (collides) continue;
      placed.push(rect);
      c.pin.el.style.transform = `translate3d(${c.sx.toFixed(1)}px, ${c.sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
      c.pin.el.classList.remove('is-hidden');
    }
  };

  return { update };
}
