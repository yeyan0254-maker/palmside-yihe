import * as THREE from 'three';
import { BOAT_DOCK_POINTS, BOAT_WAYPOINTS } from '../config/sceneConfig';
import { clamp } from '../core/terrainMath';
import type { BoatHandle } from '../generators/buildBridges';

export type BoatState = 'CRUISING' | 'RETURNING' | 'DOCKED';

export interface BoatController {
  update: (
    dt: number,
    elapsedTime: number,
    iceFactor: number,
    windStrength: number,
    clockFrozen: boolean,
    enabled: boolean
  ) => void;
}

interface BoatRuntime {
  handle: BoatHandle;
  phaseU: number;
  phaseRad: number;
  u: number;
  x: number;
  z: number;
  yaw: number;
  wakeSpeed: number;
  state: BoatState;
  dockPos: readonly [number, number];
  dockYaw: number;
}

function shortestAngleDiff(target: number, current: number): number {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function lerpAngle(current: number, target: number, alpha: number): number {
  return current + shortestAngleDiff(target, current) * alpha;
}

/**
 * 画舫四态滞回控制器（CRUISING -> RETURNING -> DOCKED -> CRUISING，PRD 3.3 / P12）：
 * - 正常水域沿 8 航点闭环舒缓巡航，含轻微波浪纵横摇与压舷转向
 * - 当 iceFactor >= 0.38 时平滑偏航驶向排云门前错位双泊位并逐渐消隐尾波
 * - 仅当 iceFactor <= 0.25 时解冻离港，彻底消除滑块边界抖动
 * - 截屏冻结态（clockFrozen = true）确定性解析画舫位置（P13）
 */
export function createBoatController(boatHandles: BoatHandle[]): BoatController {
  const curvePts = BOAT_WAYPOINTS.map(([wx, wz]) => new THREE.Vector3(wx, 0, wz));
  const routeCurve = new THREE.CatmullRomCurve3(curvePts, true, 'centripetal');
  const routeLen = Math.max(routeCurve.getLength(), 1.0);
  const cruiseSpeed = 0.92;
  const uRate = cruiseSpeed / routeLen;

  const tmpPos = new THREE.Vector3();
  const tmpTan = new THREE.Vector3();

  const runtimes: BoatRuntime[] = boatHandles.map((handle, i) => {
    const phaseU = i === 0 ? 0.0 : 0.5;
    routeCurve.getPointAt(phaseU, tmpPos);
    routeCurve.getTangentAt(phaseU, tmpTan);
    const dock = BOAT_DOCK_POINTS[i % BOAT_DOCK_POINTS.length];
    return {
      handle,
      phaseU,
      phaseRad: i * Math.PI * 0.85,
      u: phaseU,
      x: tmpPos.x,
      z: tmpPos.z,
      yaw: Math.atan2(tmpTan.x, tmpTan.z),
      wakeSpeed: 1.0,
      state: 'CRUISING',
      dockPos: dock.pos,
      dockYaw: dock.yaw,
    };
  });

  const findNearestU = (px: number, pz: number): number => {
    const samples = 48;
    let bestU = 0;
    let bestDistSq = Infinity;
    for (let s = 0; s < samples; s++) {
      const candidateU = s / samples;
      routeCurve.getPointAt(candidateU, tmpPos);
      const d2 = (tmpPos.x - px) * (tmpPos.x - px) + (tmpPos.z - pz) * (tmpPos.z - pz);
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestU = candidateU;
      }
    }
    return bestU;
  };

  const update = (
    dt: number,
    elapsedTime: number,
    iceFactor: number,
    windStrength: number,
    clockFrozen: boolean,
    enabled: boolean
  ) => {
    const liquidMobility = 1.0 - clamp(iceFactor / 0.38, 0.0, 1.0);
    const bobAmp = (0.55 + windStrength * 0.75) * liquidMobility;

    for (const b of runtimes) {
      b.handle.group.visible = enabled;
      if (!enabled) continue;

      if (clockFrozen) {
        if (iceFactor >= 0.38) {
          b.state = 'DOCKED';
          b.x = b.dockPos[0];
          b.z = b.dockPos[1];
          b.yaw = b.dockYaw;
          b.wakeSpeed = 0.0;
          b.handle.group.position.set(b.x, 0, b.z);
          b.handle.group.rotation.set(0, b.yaw, 0);
        } else {
          b.state = 'CRUISING';
          b.u = (((b.phaseU + elapsedTime * uRate) % 1) + 1) % 1;
          routeCurve.getPointAt(b.u, tmpPos);
          routeCurve.getTangentAt(b.u, tmpTan);
          b.x = tmpPos.x;
          b.z = tmpPos.z;
          b.yaw = Math.atan2(tmpTan.x, tmpTan.z);
          b.wakeSpeed = 1.0;

          const bobY = Math.sin(elapsedTime * 1.85 + b.phaseRad) * 0.012 * bobAmp;
          const pitch = Math.sin(elapsedTime * 1.45 + b.phaseRad) * 0.014 * bobAmp;
          const roll = Math.cos(elapsedTime * 1.7 + b.phaseRad) * 0.018 * bobAmp;
          b.handle.group.position.set(b.x, bobY, b.z);
          b.handle.group.rotation.set(pitch, b.yaw, roll);
        }
        b.handle.wakeSpeedUniform.value = b.wakeSpeed;
        continue;
      }

      // 滞回状态转移：ice >= 0.38 触发归港；仅当 ice <= 0.25 才解冻复航
      if (b.state === 'CRUISING' && iceFactor >= 0.38) {
        b.state = 'RETURNING';
      } else if ((b.state === 'RETURNING' || b.state === 'DOCKED') && iceFactor <= 0.25) {
        b.u = findNearestU(b.x, b.z);
        b.state = 'CRUISING';
      }

      const safeDt = clamp(dt, 0.0, 0.05);
      let bankRoll = 0.0;

      if (b.state === 'CRUISING') {
        b.u = (((b.u + safeDt * uRate) % 1) + 1) % 1;
        routeCurve.getPointAt(b.u, tmpPos);
        routeCurve.getTangentAt(b.u, tmpTan);

        const blend = 1.0 - Math.exp(-3.2 * safeDt);
        b.x += (tmpPos.x - b.x) * blend;
        b.z += (tmpPos.z - b.z) * blend;

        const targetYaw = Math.atan2(tmpTan.x, tmpTan.z);
        const diff = shortestAngleDiff(targetYaw, b.yaw);
        b.yaw = lerpAngle(b.yaw, targetYaw, 1.0 - Math.exp(-3.4 * safeDt));
        bankRoll = clamp(-diff * 0.14, -0.045, 0.045);
        b.wakeSpeed += (1.0 - b.wakeSpeed) * (1.0 - Math.exp(-2.8 * safeDt));
      } else if (b.state === 'RETURNING') {
        const dx = b.dockPos[0] - b.x;
        const dz = b.dockPos[1] - b.z;
        const dist = Math.hypot(dx, dz);

        if (dist > 0.025) {
          const approachSpeed = clamp(dist * 0.72, 0.24, 1.08);
          const step = Math.min(dist, approachSpeed * safeDt);
          b.x += (dx / dist) * step;
          b.z += (dz / dist) * step;
          b.wakeSpeed += (clamp(approachSpeed / cruiseSpeed, 0.15, 1.0) - b.wakeSpeed) * (1.0 - Math.exp(-3.5 * safeDt));
        } else {
          b.x = b.dockPos[0];
          b.z = b.dockPos[1];
          b.wakeSpeed *= Math.exp(-4.0 * safeDt);
        }

        const travelYaw = dist > 0.35 ? Math.atan2(dx, dz) : b.dockYaw;
        const desiredYaw =
          dist < 0.75
            ? lerpAngle(travelYaw, b.dockYaw, clamp(1.0 - (dist - 0.1) / 0.65, 0.0, 1.0))
            : travelYaw;
        const yawDiff = shortestAngleDiff(desiredYaw, b.yaw);
        b.yaw = lerpAngle(b.yaw, desiredYaw, 1.0 - Math.exp(-3.8 * safeDt));
        bankRoll = clamp(-yawDiff * 0.1, -0.03, 0.03);

        if (dist < 0.06 && Math.abs(shortestAngleDiff(b.dockYaw, b.yaw)) < 0.05) {
          b.state = 'DOCKED';
        }
      } else {
        // DOCKED：平稳泊定于排云门前错位双泊位
        const lockBlend = 1.0 - Math.exp(-5.0 * safeDt);
        b.x += (b.dockPos[0] - b.x) * lockBlend;
        b.z += (b.dockPos[1] - b.z) * lockBlend;
        b.yaw = lerpAngle(b.yaw, b.dockYaw, lockBlend);
        b.wakeSpeed *= Math.exp(-4.5 * safeDt);
        if (b.wakeSpeed < 0.01) b.wakeSpeed = 0.0;
      }

      const dockScale = b.state === 'DOCKED' ? 0.2 : b.state === 'RETURNING' ? 0.55 : 1.0;
      const bobY = Math.sin(elapsedTime * 1.85 + b.phaseRad) * 0.012 * bobAmp * dockScale;
      const pitch = Math.sin(elapsedTime * 1.45 + b.phaseRad) * 0.014 * bobAmp * dockScale;
      const roll = Math.cos(elapsedTime * 1.7 + b.phaseRad) * 0.018 * bobAmp * dockScale + bankRoll;

      b.handle.group.position.set(b.x, bobY, b.z);
      b.handle.group.rotation.set(pitch, b.yaw, roll);
      b.handle.wakeSpeedUniform.value = b.wakeSpeed;
    }
  };

  return { update };
}
