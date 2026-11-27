import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { APP_STATE } from '../config/stateStore';
import { clamp } from './terrainMath';

interface CameraTween {
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startTarget: THREE.Vector3;
  endTarget: THREE.Vector3;
  elapsed: number;
  duration: number;
  onComplete?: () => void;
}

interface RoamingState {
  posCurve: THREE.CatmullRomCurve3;
  targetCurve: THREE.CatmullRomCurve3;
  elapsed: number;
  duration: number;
  onComplete?: () => void;
}

const PAN_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

export class CameraRig {
  public readonly camera: THREE.PerspectiveCamera;
  public readonly controls: OrbitControls;
  private tween: CameraTween | null = null;
  private roaming: RoamingState | null = null;
  private autoOrbit = false;
  private onInterruptCb?: () => void;
  private readonly domElement: HTMLElement;
  private readonly tmpPrevTarget = new THREE.Vector3();
  private readonly tmpForward = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpMove = new THREE.Vector3();
  private readonly tmpOrbitOffset = new THREE.Vector3();
  private readonly upVec = new THREE.Vector3(0, 1, 0);
  private readonly keyVel = new THREE.Vector3();
  private readonly pressedKeys = new Set<string>();
  private spacePanning = false;
  private isPointerDown = false;

  constructor(domElement: HTMLElement, width: number, height: number) {
    this.domElement = domElement;
    this.camera = new THREE.PerspectiveCamera(36, width / Math.max(height, 1), 0.25, 240);
    this.camera.position.set(24.0, 29.5, 43.0);

    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.target.set(0.0, 1.8, -2.0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = true;
    // 严格锁定沿沙盘水平 XZ 面平移，避免斜飞入天或撞入木托盘底座
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 4.2;
    this.controls.maxDistance = 95.0;
    this.controls.minPolarAngle = 0.08;
    // 严格防止相机穿至托盘底部
    this.controls.maxPolarAngle = Math.PI / 2 - 0.08;
    this.controls.panSpeed = 1.12;
    this.controls.rotateSpeed = 0.72;
    this.controls.zoomSpeed = 0.9;
    this.applyControlButtons();
    this.controls.update();

    const interruptMotion = () => {
      const hadMotion = Boolean(this.tween || this.roaming || this.autoOrbit);
      if (this.tween) {
        this.tween = null;
        APP_STATE.cameraTweenActive = false;
      }
      if (this.roaming) {
        this.roaming = null;
        APP_STATE.roamingActive = false;
      }
      if (this.autoOrbit) {
        this.autoOrbit = false;
        APP_STATE.autoOrbitActive = false;
      }
      if (hadMotion) {
        this.onInterruptCb?.();
      }
    };

    domElement.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // P12：用户按下拖拽、滚轮或空格抓手/方向键毫秒级打断相机 Tween / 漫游 / 环绕
    domElement.addEventListener(
      'pointerdown',
      () => {
        this.isPointerDown = true;
        this.updateCursor();
        interruptMotion();
      },
      { passive: true }
    );
    window.addEventListener(
      'pointerup',
      () => {
        if (this.isPointerDown) {
          this.isPointerDown = false;
          this.updateCursor();
        }
      },
      { passive: true }
    );
    window.addEventListener(
      'pointercancel',
      () => {
        if (this.isPointerDown) {
          this.isPointerDown = false;
          this.updateCursor();
        }
      },
      { passive: true }
    );
    domElement.addEventListener('wheel', interruptMotion, { passive: true });

    const isEditableTarget = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);

    window.addEventListener('keydown', (e) => {
      if (isEditableTarget(e.target)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!this.spacePanning) {
          this.spacePanning = true;
          this.applyControlButtons();
        }
        interruptMotion();
      } else if (PAN_KEYS.has(e.code)) {
        this.pressedKeys.add(e.code);
        interruptMotion();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        if (this.spacePanning) {
          this.spacePanning = false;
          this.applyControlButtons();
        }
      } else if (PAN_KEYS.has(e.code)) {
        this.pressedKeys.delete(e.code);
      }
    });

    window.addEventListener('blur', () => {
      this.pressedKeys.clear();
      this.keyVel.set(0, 0, 0);
      this.isPointerDown = false;
      if (this.spacePanning) {
        this.spacePanning = false;
      }
      this.applyControlButtons();
    });
  }

  private applyControlButtons(): void {
    const panPrimary = this.spacePanning;
    this.controls.mouseButtons = {
      LEFT: panPrimary ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: panPrimary ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN,
    };
    this.controls.touches = {
      ONE: panPrimary ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    this.updateCursor();
  }

  private updateCursor(): void {
    this.domElement.style.cursor = this.spacePanning
      ? this.isPointerDown
        ? 'grabbing'
        : 'grab'
      : '';
  }

  public setOnUserInterrupt(cb: () => void): void {
    this.onInterruptCb = cb;
  }

  public resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  public flyTo(
    pos: readonly [number, number, number],
    target: readonly [number, number, number],
    duration = 1.05,
    onComplete?: () => void
  ): void {
    this.roaming = null;
    APP_STATE.roamingActive = false;
    this.autoOrbit = false;
    APP_STATE.autoOrbitActive = false;

    this.tween = {
      startPos: this.camera.position.clone(),
      endPos: new THREE.Vector3(pos[0], pos[1], pos[2]),
      startTarget: this.controls.target.clone(),
      endTarget: new THREE.Vector3(target[0], target[1], target[2]),
      elapsed: 0,
      duration: Math.max(0.05, duration),
      onComplete,
    };
    APP_STATE.cameraTweenActive = true;
  }

  public startRoaming(
    waypoints: ReadonlyArray<{
      pos: readonly [number, number, number];
      target: readonly [number, number, number];
    }>,
    duration = 26.0,
    onComplete?: () => void
  ): void {
    if (waypoints.length < 2) return;
    this.tween = null;
    APP_STATE.cameraTweenActive = false;
    this.autoOrbit = false;
    APP_STATE.autoOrbitActive = false;

    const posPts = [
      this.camera.position.clone(),
      ...waypoints.map((w) => new THREE.Vector3(w.pos[0], w.pos[1], w.pos[2])),
    ];
    const targetPts = [
      this.controls.target.clone(),
      ...waypoints.map((w) => new THREE.Vector3(w.target[0], w.target[1], w.target[2])),
    ];

    this.roaming = {
      posCurve: new THREE.CatmullRomCurve3(posPts, false, 'centripetal', 0.45),
      targetCurve: new THREE.CatmullRomCurve3(targetPts, false, 'centripetal', 0.45),
      elapsed: 0,
      duration: Math.max(4.0, duration),
      onComplete,
    };
    APP_STATE.roamingActive = true;
  }

  public stopRoaming(): void {
    this.roaming = null;
    APP_STATE.roamingActive = false;
  }

  public setAutoOrbit(enabled: boolean): void {
    if (enabled) {
      this.tween = null;
      APP_STATE.cameraTweenActive = false;
      this.roaming = null;
      APP_STATE.roamingActive = false;
    }
    this.autoOrbit = enabled;
    APP_STATE.autoOrbitActive = enabled;
  }

  public isAutoOrbitActive(): boolean {
    return this.autoOrbit;
  }

  /** 确定性瞬移接口：取消一切补间/漫游/环绕并立即锁定目标机位（供 verify-visuals.mjs 使用） */
  public teleport(
    pos: readonly [number, number, number],
    target: readonly [number, number, number]
  ): void {
    this.tween = null;
    this.roaming = null;
    this.autoOrbit = false;
    APP_STATE.cameraTweenActive = false;
    APP_STATE.roamingActive = false;
    APP_STATE.autoOrbitActive = false;
    this.pressedKeys.clear();
    this.keyVel.set(0, 0, 0);
    const prevDamping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.camera.position.set(pos[0], pos[1], pos[2]);
    this.controls.target.set(target[0], target[1], target[2]);
    this.controls.update();
    this.camera.updateMatrixWorld(true);
    this.controls.enableDamping = prevDamping;
  }

  public update(dt: number): void {
    if (this.tween) {
      this.tween.elapsed += dt;
      const t = clamp(this.tween.elapsed / this.tween.duration, 0, 1);
      // 五次缓动曲线，起步收尾均柔顺
      const ease = t * t * t * (t * (t * 6 - 15) + 10);
      this.camera.position.lerpVectors(this.tween.startPos, this.tween.endPos, ease);
      this.controls.target.lerpVectors(this.tween.startTarget, this.tween.endTarget, ease);
      if (t >= 1) {
        const cb = this.tween.onComplete;
        this.tween = null;
        APP_STATE.cameraTweenActive = false;
        cb?.();
      }
    } else if (this.roaming) {
      this.roaming.elapsed += dt;
      const rawT = clamp(this.roaming.elapsed / this.roaming.duration, 0, 1);
      // 起步与收尾柔缓过渡，中段近似匀速巡航
      const u = rawT * rawT * (3 - 2 * rawT);
      this.roaming.posCurve.getPointAt(u, this.camera.position);
      this.roaming.targetCurve.getPointAt(u, this.controls.target);
      if (rawT >= 1) {
        const cb = this.roaming.onComplete;
        this.roaming = null;
        APP_STATE.roamingActive = false;
        cb?.();
      }
    } else if (dt > 0) {
      if (this.autoOrbit) {
        this.tmpOrbitOffset.subVectors(this.camera.position, this.controls.target);
        this.tmpOrbitOffset.applyAxisAngle(this.upVec, dt * 0.13);
        this.camera.position.copy(this.controls.target).add(this.tmpOrbitOffset);
      }

      // WASD / 方向键自适应水平桌面平移（贴近 XZ 面随距调速）
      let fInput = 0;
      let rInput = 0;
      if (this.pressedKeys.has('KeyW') || this.pressedKeys.has('ArrowUp')) fInput += 1;
      if (this.pressedKeys.has('KeyS') || this.pressedKeys.has('ArrowDown')) fInput -= 1;
      if (this.pressedKeys.has('KeyD') || this.pressedKeys.has('ArrowRight')) rInput += 1;
      if (this.pressedKeys.has('KeyA') || this.pressedKeys.has('ArrowLeft')) rInput -= 1;

      if (fInput !== 0 || rInput !== 0) {
        this.camera.getWorldDirection(this.tmpForward);
        this.tmpForward.y = 0;
        if (this.tmpForward.lengthSq() > 1e-6) {
          this.tmpForward.normalize();
        } else {
          this.tmpForward.set(0, 0, -1);
        }
        this.tmpRight.crossVectors(this.tmpForward, this.upVec).normalize();

        const dist = this.camera.position.distanceTo(this.controls.target);
        const speed = clamp(dist * 0.52, 4.5, 32.0);
        this.tmpMove
          .set(0, 0, 0)
          .addScaledVector(this.tmpForward, fInput)
          .addScaledVector(this.tmpRight, rInput);
        if (this.tmpMove.lengthSq() > 1e-6) {
          this.tmpMove.normalize().multiplyScalar(speed);
        }
      } else {
        this.tmpMove.set(0, 0, 0);
      }

      const damp = 1 - Math.exp(-10 * dt);
      this.keyVel.lerp(this.tmpMove, damp);
      if (this.keyVel.lengthSq() > 1e-5) {
        this.camera.position.addScaledVector(this.keyVel, dt);
        this.controls.target.addScaledVector(this.keyVel, dt);
      }
    }

    this.controls.update();

    // 平移目标钳制在沙盘包围盒内，防止飞失（复用向量避免每帧 GC）
    this.tmpPrevTarget.copy(this.controls.target);
    this.controls.target.x = clamp(this.controls.target.x, -26.0, 26.0);
    this.controls.target.y = clamp(this.controls.target.y, -0.4, 14.0);
    this.controls.target.z = clamp(this.controls.target.z, -22.0, 22.0);
    const dx = this.controls.target.x - this.tmpPrevTarget.x;
    const dy = this.controls.target.y - this.tmpPrevTarget.y;
    const dz = this.controls.target.z - this.tmpPrevTarget.z;
    if (dx !== 0 || dy !== 0 || dz !== 0) {
      this.camera.position.x += dx;
      this.camera.position.y += dy;
      this.camera.position.z += dz;
    }
  }
}
