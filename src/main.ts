import * as THREE from 'three';
import { createAmbientAudio } from './audio/ambientAudio';
import {
  type BaseSeasonId,
  QUICK_SCENARIOS,
  type QuickScenarioId,
  ROAMING_WAYPOINTS,
  SCENIC_SPOTS,
  SEASON_PRESETS,
  type ScenicSpotId,
  type SeasonPresetId,
  type ThemeId,
  type TimeOfDayId,
  WEATHER_MODES,
  type WeatherModeId,
  computeSunDirection,
} from './config/sceneConfig';
import { APP_STATE, type AppState, SHARED_UNIFORMS } from './config/stateStore';
import { CameraRig } from './core/cameraRig';
import { countSceneMetrics, createRenderPipeline } from './core/renderer';
import { clamp } from './core/terrainMath';
import { buildBridgesAndIsland } from './generators/buildBridges';
import { buildCorridor } from './generators/buildCorridor';
import { buildFoliage } from './generators/buildFoliage';
import { buildFoxiangge } from './generators/buildFoxiangge';
import { buildTrayAndTerrain } from './generators/buildTrayAndTerrain';
import { createStudioBackdropTexture } from './textures/proceduralPBR';
import { createHudController } from './ui/hudController';
import { createPoiOverlay } from './ui/poiOverlay';
import { createBoatController } from './world/boatController';
import { buildDynamicEffects } from './world/dynamicEffects';
import { buildKunmingLake } from './world/kunmingLake';

export interface CaptureViewOptions {
  pos: readonly [number, number, number];
  target: readonly [number, number, number];
  preset?: SeasonPresetId;
  season?: BaseSeasonId;
  weather?: WeatherModeId;
  weatherIntensity?: number;
  temperatureC?: number;
  theme?: ThemeId;
  spotId?: ScenicSpotId;
  weatherPanelOpen?: boolean;
  audioPanelOpen?: boolean;
  showPoi?: boolean;
  frozenTime?: number;
}

export interface SceneDebugStats {
  sceneDrawCalls: number;
  renderPassCalls: number;
  triangles: number;
  stepsCount: number;
  capstonesCount: number;
  corridorColumnsCount: number;
  bridgePostsCount: number;
  archAnchorsCount: number;
  treesCount: number;
  shrubsCount: number;
  solsticeBeamsVisible: boolean;
  preset: SeasonPresetId;
  season: BaseSeasonId;
  weather: WeatherModeId;
  theme: ThemeId;
  activeSpotId: ScenicSpotId;
}

declare global {
  interface Window {
    __YIHE_READY__?: boolean;
    __YIHE_DEBUG__?: {
      captureView: (opts: CaptureViewOptions) => Promise<SceneDebugStats>;
      getStats: () => SceneDebugStats;
      getAppState: () => AppState;
      setPreset: (preset: SeasonPresetId) => void;
      setTheme: (theme: ThemeId) => void;
      setSpot: (id: ScenicSpotId) => void;
    };
  }
}

const SEASON_ORDER: ReadonlyArray<BaseSeasonId> = ['spring', 'summer', 'autumn', 'winter'];

function showWebGLFallback(): void {
  const el = document.getElementById('webgl-fallback');
  if (el) el.hidden = false;
}

function bootstrap(): void {
  const container = document.getElementById('app');
  const hudRoot = document.getElementById('hud-root');
  if (!container || !hudRoot) return;

  const scene = new THREE.Scene();
  const fog = new THREE.FogExp2(0xebeae0, 0.0028);
  scene.fog = fog;

  const cameraRig = new CameraRig(container, container.clientWidth, container.clientHeight);

  let pipeline: ReturnType<typeof createRenderPipeline>;
  try {
    pipeline = createRenderPipeline(container, scene, cameraRig.camera);
  } catch (err) {
    console.error('[Yihe] WebGL2 initialization failed:', err);
    showWebGLFallback();
    return;
  }

  // 主平行光源（紧贴沙盘正交阴影视锥，2048²，动态 normalBias）
  const sunLight = new THREE.DirectionalLight(0xfff3de, 2.55);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -36;
  sunLight.shadow.camera.right = 36;
  sunLight.shadow.camera.top = 32;
  sunLight.shadow.camera.bottom = -32;
  sunLight.shadow.camera.near = 6;
  sunLight.shadow.camera.far = 125;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.032;
  sunLight.shadow.radius = 3.2;
  sunLight.target.position.set(0, 0, -2);
  scene.add(sunLight);
  scene.add(sunLight.target);

  const hemiLight = new THREE.HemisphereLight(0xdde9ea, 0x625a4d, 0.92);
  scene.add(hemiLight);

  // M1 地形 + 昆明湖
  const trayAndTerrain = buildTrayAndTerrain();
  scene.add(trayAndTerrain.group);
  const kunmingLake = buildKunmingLake();
  scene.add(kunmingLake);

  // M2 古建集群
  const foxiangge = buildFoxiangge();
  scene.add(foxiangge.group);
  const corridor = buildCorridor();
  scene.add(corridor.group);
  const bridgesAndIsland = buildBridgesAndIsland();
  scene.add(bridgesAndIsland.group);

  // M3 分枝森林与动态氛围（M5 传入十七孔桥锚点驱动 17 道体积金光）
  const foliage = buildFoliage();
  scene.add(foliage.group);
  const dynamicEffects = buildDynamicEffects(bridgesAndIsland.archAnchors);
  scene.add(dynamicEffects.group);

  const boatController = createBoatController(bridgesAndIsland.boatHandles);
  const ambientAudio = createAmbientAudio();

  let hud: ReturnType<typeof createHudController> | null = null;
  let poiOverlay: ReturnType<typeof createPoiOverlay> | null = null;
  let lastFoliageKey = '';
  let lastThemeApplied: ThemeId | null = null;
  let lastEnvPreset: SeasonPresetId | null = null;

  const tmpSunCol = new THREE.Color();
  const tmpDawnCol = new THREE.Color(0xffbe7d);
  const tmpNightCol = new THREE.Color(0x9bb5dc);
  const tmpSkyCol = new THREE.Color();
  const tmpNightSky = new THREE.Color(0x28364e);

  /** 仅同步场景背景纹理、雾效色、接触阴影与 PMREM（无任何 HUD DOM 操作，支持高帧率增量更新） */
  const applyThemeResources = (theme: ThemeId) => {
    APP_STATE.theme = theme;
    SHARED_UNIFORMS.uThemeDark.value = theme === 'ink-gold' ? 1.0 : 0.0;
    document.documentElement.dataset.theme = theme;

    const palette = SEASON_PRESETS[APP_STATE.preset].themes[theme];
    if (lastThemeApplied !== theme || lastEnvPreset !== APP_STATE.preset) {
      scene.background = createStudioBackdropTexture(palette.backdropCenterHex, palette.backgroundHex);
      fog.color.setHex(palette.fogHex);
      (trayAndTerrain.contactShadowMesh.material as THREE.MeshBasicMaterial).opacity =
        palette.contactShadowOpacity;
      scene.environmentIntensity = palette.iblIntensity;
      if (lastThemeApplied !== theme) {
        pipeline.setThemeEnvironment(scene, theme);
      }
      lastThemeApplied = theme;
      lastEnvPreset = APP_STATE.preset;
    }
    fog.density = palette.fogDensity * APP_STATE.fogDensityScale;
    dynamicEffects.applySeason(APP_STATE.preset, theme);
  };

  const applyThemeOnly = (theme: ThemeId) => {
    applyThemeResources(theme);
    pipeline.requestShadowUpdate();
    hud?.sync();
  };

  /**
   * 完整 24 小时无缝周期光照求解（00:00 与 24:00 首尾同值，白昼在典型午后精准重合各季验收角度）
   */
  const compute24hSunParams = (
    hourRaw: number,
    basePreset: (typeof SEASON_PRESETS)[SeasonPresetId]
  ): { elevDeg: number; azimDeg: number; twilightNightBlend: number } => {
    const h = ((hourRaw % 24) + 24) % 24;
    // 白昼弧：05:45 (5.75) -> 18:15 (18.25)
    if (h >= 5.75 && h <= 18.25) {
      const dayPhase = (h - 5.75) / 12.5;
      const elevShape = Math.pow(Math.sin(dayPhase * Math.PI), 0.72);
      const canonHour =
        basePreset.id === 'summer'
          ? 13.0
          : basePreset.id === 'autumn'
            ? 15.5
            : basePreset.id === 'winter'
              ? 15.0
              : 14.5;
      const canonShape = Math.pow(Math.sin(((canonHour - 5.75) / 12.5) * Math.PI), 0.72);
      const peakElev = 10.5 + (basePreset.sunElevationDeg - 10.5) / Math.max(canonShape, 0.55);
      const elevDeg = 10.5 + (peakElev - 10.5) * elevShape;

      // 东升 (-58°) -> 典型午后精准角 -> 西落 (+68°) 平滑分段样条
      const canonAz = basePreset.sunAzimuthFromSouthTowardWestDeg;
      const azimDeg =
        h <= canonHour
          ? -58.0 + ((h - 5.75) / Math.max(canonHour - 5.75, 0.1)) * (canonAz + 58.0)
          : canonAz + ((h - canonHour) / Math.max(18.25 - canonHour, 0.1)) * (68.0 - canonAz);

      // 晨昏各 0.75h 平滑进入夜光权重，消除切换闪跳
      let nightW = 0;
      if (h < 6.5) nightW = (6.5 - h) / 0.75 * 0.45;
      else if (h > 17.5) nightW = ((h - 17.5) / 0.75) * 0.45;
      return { elevDeg, azimDeg, twilightNightBlend: nightW };
    }

    // 静谧月夜（18:15 -> 24:00 -> 00:00 -> 05:45），00:00 与 24:00 完全连续
    const nightOffset = h > 18.25 ? h - 18.25 : h + (24.0 - 18.25);
    const nightPhase = clamp(nightOffset / 11.5, 0, 1);
    const nightArc = Math.sin(nightPhase * Math.PI);
    const elevDeg = 14.0 + 18.0 * nightArc;
    const azimDeg = 22.0 + Math.sin((nightPhase - 0.5) * Math.PI) * 30.0;
    let nightW = 1.0;
    if (nightOffset < 0.75) nightW = 0.45 + (nightOffset / 0.75) * 0.55;
    else if (nightOffset > 10.75) nightW = 0.45 + ((11.5 - nightOffset) / 0.75) * 0.55;
    return { elevDeg, azimDeg, twilightNightBlend: nightW };
  };

  /**
   * 统一解耦态天时与气候求解器：
   * - 支持 `gpuOnly: true`（自动流转期间每帧仅刷新 Uniform/光照/雾，零 HUD 全量重绘）
   * - 季节（四季叶色）与天气（晴/多云/山雾/下雨/降雪）相互独立，且冬季放晴可完全融雪至 0
   */
  const applyClimateState = (opts: { gpuOnly?: boolean; skipFoliage?: boolean } = {}) => {
    const baseKey: SeasonPresetId = APP_STATE.solsticeMode
      ? 'solstice'
      : APP_STATE.season === 'spring' && APP_STATE.weather === 'rain'
        ? 'rain'
        : APP_STATE.season;
    APP_STATE.preset = baseKey;
    const basePreset = SEASON_PRESETS[baseKey];

    if (!opts.skipFoliage && lastFoliageKey !== baseKey) {
      foliage.applySeason(baseKey);
      lastFoliageKey = baseKey;
    }

    // 1. 积雪、结冰、雨势、风力与山雾联动求解（气温回暖或放晴可彻底化雪至 0）
    let snowAmt = 0.0;
    if (APP_STATE.solsticeMode) {
      snowAmt = clamp(APP_STATE.weather === 'snow' ? APP_STATE.weatherIntensity * 0.95 : 0.45, 0, 1);
    } else if (APP_STATE.weather === 'snow') {
      snowAmt =
        APP_STATE.season === 'winter'
          ? clamp(0.6 + APP_STATE.weatherIntensity * 0.36, 0, 1)
          : clamp(APP_STATE.weatherIntensity * 0.92, 0, 1);
    } else if (APP_STATE.season === 'winter') {
      snowAmt = clamp((3.0 - APP_STATE.temperatureC) * 0.16, 0.0, 0.8);
    }

    let iceAmt = 0.0;
    if (APP_STATE.solsticeMode) {
      iceAmt = Math.max(0.65, clamp((1.5 - APP_STATE.temperatureC) / 6.0, 0, 1));
    } else if (APP_STATE.temperatureC <= 1.5) {
      iceAmt = clamp((1.5 - APP_STATE.temperatureC) / 5.5, 0.28, 1.0);
    }

    const rainAmt =
      APP_STATE.weather === 'rain' && iceAmt < 0.72 ? clamp(APP_STATE.weatherIntensity, 0, 1) : 0.0;

    const wMeta = WEATHER_MODES[APP_STATE.weather];
    const fogScale = wMeta.fogScale * (0.72 + APP_STATE.weatherIntensity * 0.48);
    const windStr = clamp(basePreset.windStrength + wMeta.windBoost * APP_STATE.weatherIntensity, 0.14, 0.95);

    APP_STATE.snowAmount = snowAmt;
    APP_STATE.iceFactor = iceAmt;
    APP_STATE.rainAmount = rainAmt;
    APP_STATE.fogDensityScale = fogScale;
    APP_STATE.windStrength = windStr;
    APP_STATE.solsticeGlow = APP_STATE.solsticeMode ? 1.0 : 0.0;

    SHARED_UNIFORMS.uSnowAmount.value = snowAmt;
    SHARED_UNIFORMS.uIceFactor.value = iceAmt;
    SHARED_UNIFORMS.uRainAmount.value = rainAmt;
    SHARED_UNIFORMS.uWindStrength.value = windStr;
    SHARED_UNIFORMS.uSolsticeGlow.value = APP_STATE.solsticeGlow;
    SHARED_UNIFORMS.uWaterShallowColor.value.setHex(basePreset.waterShallowHex);
    SHARED_UNIFORMS.uWaterMidColor.value.setHex(basePreset.waterMidHex);
    SHARED_UNIFORMS.uWaterDeepColor.value.setHex(basePreset.waterDeepHex);

    // 2. 光照与太阳方向求解（冬至金光锁定 PRD 2.5；常态走 24h 无缝连续弧线）
    let elevDeg = basePreset.sunElevationDeg;
    let azimDeg = basePreset.sunAzimuthFromSouthTowardWestDeg;
    tmpSunCol.setHex(basePreset.sunColorHex);
    let sunInt = basePreset.sunIntensity;
    tmpSkyCol.setHex(basePreset.hemiSkyHex);
    let hemiInt = basePreset.hemiIntensity;

    if (!APP_STATE.solsticeMode) {
      const h = ((APP_STATE.timeHour % 24) + 24) % 24;
      const sunArc = compute24hSunParams(h, basePreset);
      elevDeg = sunArc.elevDeg;
      azimDeg = sunArc.azimDeg;

      if (sunArc.twilightNightBlend > 0.01) {
        const nw = sunArc.twilightNightBlend;
        const isDusk = h > 15.0 && h < 19.2;
        if (isDusk && nw < 0.7) {
          tmpSunCol.lerp(tmpDawnCol, 0.65);
        } else {
          tmpSunCol.lerp(tmpNightCol, nw * 0.92);
        }
        tmpSkyCol.lerp(tmpNightSky, nw * 0.62);
        sunInt *= 1.0 - 0.56 * nw;
        hemiInt *= 1.0 - 0.28 * nw;
      } else if (h < 9.5) {
        const dawnK = clamp((9.5 - h) / 3.75, 0, 1);
        tmpSunCol.lerp(tmpDawnCol, dawnK * 0.68);
        sunInt *= 1.0 - 0.14 * dawnK;
      } else if (h > 16.5) {
        const duskK = clamp((h - 16.5) / 1.75, 0, 1);
        tmpSunCol.lerp(tmpDawnCol, duskK * 0.58);
        sunInt *= 1.0 - 0.16 * duskK;
      }
    }

    if (APP_STATE.weather === 'cloudy') {
      sunInt *= 0.84 - APP_STATE.weatherIntensity * 0.16;
      hemiInt *= 1.08;
    } else if (APP_STATE.weather === 'mist') {
      sunInt *= 0.78 - APP_STATE.weatherIntensity * 0.18;
      hemiInt *= 1.12;
    } else if (rainAmt > 0.01) {
      sunInt *= 1.0 - rainAmt * 0.48;
      hemiInt *= 1.0 + rainAmt * 0.18;
    }

    APP_STATE.sunElevationDeg = elevDeg;
    const [sx, sy, sz] = computeSunDirection(elevDeg, azimDeg);
    SHARED_UNIFORMS.uSunDir.value.set(sx, sy, sz).normalize();

    sunLight.position.set(sx * 64, sy * 64 + 1.0, sz * 64 - 2.0);
    sunLight.color.copy(tmpSunCol);
    sunLight.intensity = sunInt;

    const elevT = clamp((elevDeg - 9.0) / 30.0, 0.0, 1.0);
    sunLight.shadow.normalBias = 0.055 + (0.025 - 0.055) * elevT;

    hemiLight.color.copy(tmpSkyCol);
    hemiLight.groundColor.setHex(basePreset.hemiGroundHex);
    hemiLight.intensity = hemiInt;

    applyThemeResources(APP_STATE.theme);

    if (!opts.gpuOnly) {
      ambientAudio.syncSceneContext(APP_STATE.season, APP_STATE.weather, APP_STATE.timeOfDay);
      boatController.update(
        0,
        SHARED_UNIFORMS.uTime.value,
        APP_STATE.iceFactor,
        APP_STATE.windStrength,
        APP_STATE.clockFrozen,
        APP_STATE.boatsEnabled
      );
      pipeline.requestShadowUpdate();
      hud?.sync();
    }
  };

  const resolveAutoTimeAndTheme = (hourRaw: number): { changed: boolean } => {
    const h = ((hourRaw % 24) + 24) % 24;
    let nextTod: TimeOfDayId = APP_STATE.timeOfDay;
    let nextTheme: ThemeId = APP_STATE.theme;

    // 带 ±0.15h 滞回的昼夜与主题自动切换，杜绝边界抖动闪烁
    if (h >= 18.25 || h <= 5.65) {
      nextTod = 'night';
      nextTheme = 'ink-gold';
    } else if (h >= 5.95 && h <= 17.95) {
      nextTod = h < 9.5 ? 'dawn' : 'afternoon';
      nextTheme = 'xuan-light';
    }

    const changed = nextTod !== APP_STATE.timeOfDay || nextTheme !== APP_STATE.theme;
    APP_STATE.timeOfDay = nextTod;
    APP_STATE.theme = nextTheme;
    return { changed };
  };

  const exitSolsticeThemeIfNeeded = (wasSolstice: boolean) => {
    if (wasSolstice && !APP_STATE.solsticeMode && APP_STATE.theme === 'ink-gold') {
      APP_STATE.theme = 'xuan-light';
      APP_STATE.timeOfDay = 'afternoon';
      if (Math.abs(APP_STATE.timeHour - 16.6) < 0.25) {
        APP_STATE.timeHour = 14.5;
      }
    }
  };

  const applyPreset = (presetId: SeasonPresetId) => {
    const wasSolstice = APP_STATE.solsticeMode;
    APP_STATE.solsticeMode = presetId === 'solstice';
    if (presetId === 'rain') {
      APP_STATE.season = 'spring';
      APP_STATE.seasonProgress = 0.2;
      APP_STATE.weather = 'rain';
      APP_STATE.weatherIntensity = 0.95;
      APP_STATE.temperatureC = 15.0;
      APP_STATE.timeHour = 14.5;
      APP_STATE.timeOfDay = 'afternoon';
    } else if (presetId === 'winter') {
      APP_STATE.season = 'winter';
      APP_STATE.seasonProgress = 3.2;
      APP_STATE.weather = 'snow';
      APP_STATE.weatherIntensity = 0.86;
      APP_STATE.temperatureC = -3.5;
      APP_STATE.timeHour = 15.0;
      APP_STATE.timeOfDay = 'afternoon';
    } else if (presetId === 'solstice') {
      APP_STATE.season = 'winter';
      APP_STATE.seasonProgress = 3.5;
      APP_STATE.weather = 'clear';
      APP_STATE.weatherIntensity = 0.25;
      APP_STATE.temperatureC = -1.5;
      APP_STATE.timeHour = 16.6;
      APP_STATE.timeOfDay = 'night';
      APP_STATE.theme = 'ink-gold';
    } else {
      APP_STATE.season = presetId;
      APP_STATE.seasonProgress = SEASON_ORDER.indexOf(presetId) + 0.2;
      APP_STATE.weather = 'clear';
      APP_STATE.weatherIntensity = 0.25;
      APP_STATE.temperatureC = presetId === 'summer' ? 27.0 : presetId === 'autumn' ? 13.0 : 19.0;
      APP_STATE.timeHour = presetId === 'summer' ? 13.0 : presetId === 'autumn' ? 15.5 : 14.5;
      APP_STATE.timeOfDay = 'afternoon';
    }
    exitSolsticeThemeIfNeeded(wasSolstice);
    lastFoliageKey = '';
    applyClimateState();
  };

  const visitSpot = (id: ScenicSpotId, silent = false) => {
    const spot = SCENIC_SPOTS.find((s) => s.id === id) ?? SCENIC_SPOTS[0];
    APP_STATE.activeSpotId = spot.id;
    if (id === 'solsticeAxis') {
      APP_STATE.autoCycleEnabled = false;
      APP_STATE.solsticeMode = true;
      APP_STATE.season = 'winter';
      APP_STATE.seasonProgress = 3.5;
      APP_STATE.weather = 'clear';
      APP_STATE.weatherIntensity = 0.25;
      APP_STATE.temperatureC = -1.5;
      APP_STATE.timeHour = 16.6;
      APP_STATE.timeOfDay = 'night';
      APP_STATE.theme = 'ink-gold';
      lastFoliageKey = '';
      applyClimateState();
    }
    cameraRig.flyTo(spot.pos, spot.target, 1.05);
    const idx = SCENIC_SPOTS.indexOf(spot);
    if (!silent) {
      ambientAudio.playChime(idx);
      hud?.showToast(
        spot.id === 'overview'
          ? '已复位 · 万寿昆明全景'
          : spot.id === 'solsticeAxis'
            ? '已抵达 · 冬至金光轴线（低视角正对十七孔桥可见金光穿洞）'
            : `已抵达 · ${spot.label}`
      );
    }
    hud?.sync();
  };

  const refreshPoiNow = (force = false) => {
    poiOverlay?.update(cameraRig.camera, container.clientWidth, container.clientHeight, {
      visible: APP_STATE.poiVisible,
      activeSpotId: APP_STATE.activeSpotId,
      rightPanelOpen: hud?.isRightPanelOpen() ?? false,
      force,
    });
  };

  cameraRig.setOnUserInterrupt(() => {
    hud?.sync();
  });

  hud = createHudController({
    audio: ambientAudio,
    onSelectSpot: (id) => visitSpot(id),
    onCycleNextSpot: () => {
      const curIdx = SCENIC_SPOTS.findIndex((s) => s.id === APP_STATE.activeSpotId);
      const nextIdx = curIdx < 0 || curIdx >= SCENIC_SPOTS.length - 1 ? 1 : curIdx + 1;
      visitSpot(SCENIC_SPOTS[nextIdx].id);
    },
    onToggleRoaming: () => {
      if (APP_STATE.roamingActive) {
        cameraRig.stopRoaming();
        hud?.showToast('已暂停低空石阶漫游');
        hud?.sync();
      } else {
        APP_STATE.activeSpotId = 'overview';
        cameraRig.startRoaming(ROAMING_WAYPOINTS, 26.0, () => {
          hud?.showToast('石阶漫游巡礼完成');
          hud?.sync();
        });
        ambientAudio.playChime(2);
        hud?.showToast('开启低空石阶漫游 · 拖拽或滚轮随时接管');
        hud?.sync();
      }
    },
    onToggleAutoOrbit: () => {
      const next = !cameraRig.isAutoOrbitActive();
      cameraRig.setAutoOrbit(next);
      hud?.showToast(next ? '开启 360° 缓速环绕展陈' : '已停止环绕展陈');
      hud?.sync();
    },
    onSelectSeason: (season) => {
      const prevSeason = APP_STATE.season;
      const wasSolstice = APP_STATE.solsticeMode;
      APP_STATE.solsticeMode = false;
      APP_STATE.season = season;
      APP_STATE.seasonProgress = SEASON_ORDER.indexOf(season) + 0.2;

      if (season === 'winter') {
        APP_STATE.weather = 'snow';
        APP_STATE.weatherIntensity = 0.86;
        APP_STATE.temperatureC = -3.5;
      } else {
        APP_STATE.temperatureC = season === 'summer' ? 27.0 : season === 'autumn' ? 13.0 : 19.0;
        // 从冬雪/冬至金光切换或原天气为降雪时，立即清雪放晴并融冰复航，同时保留本季内先选季节再调天气的组合能力
        if (prevSeason === 'winter' || wasSolstice || APP_STATE.weather === 'snow') {
          APP_STATE.weather = 'clear';
          APP_STATE.weatherIntensity = 0.25;
        }
      }
      exitSolsticeThemeIfNeeded(wasSolstice);
      lastFoliageKey = '';
      applyClimateState();
      ambientAudio.playChime(1);
      const sMap = { spring: '春色', summer: '夏荫', autumn: '秋韵', winter: '冬雪' };
      hud?.showToast(`已切换 · ${sMap[season]}`);
    },
    onSelectWeather: (weather) => {
      const wasSolstice = APP_STATE.solsticeMode;
      APP_STATE.solsticeMode = false;
      APP_STATE.weather = weather;
      APP_STATE.weatherIntensity = WEATHER_MODES[weather].defaultIntensity;
      if (weather === 'snow' && APP_STATE.temperatureC > 0.5) {
        APP_STATE.temperatureC = -1.5;
      } else if (weather !== 'snow' && APP_STATE.temperatureC <= 1.5 && APP_STATE.season !== 'winter') {
        APP_STATE.temperatureC = 14.0;
      }
      exitSolsticeThemeIfNeeded(wasSolstice);
      applyClimateState();
      hud?.showToast(`湖山天气 · ${WEATHER_MODES[weather].label}`);
    },
    onWeatherIntensityChange: (val) => {
      APP_STATE.weatherIntensity = clamp(val, 0, 1);
      applyClimateState();
    },
    onTemperatureChange: (tempC) => {
      APP_STATE.temperatureC = clamp(tempC, -8, 32);
      applyClimateState();
    },
    onSelectTimeOfDay: (tod: TimeOfDayId) => {
      APP_STATE.solsticeMode = false;
      APP_STATE.timeOfDay = tod;
      APP_STATE.timeHour = tod === 'dawn' ? 7.5 : tod === 'afternoon' ? 14.5 : 20.5;
      APP_STATE.theme = tod === 'night' ? 'ink-gold' : 'xuan-light';
      applyClimateState();
      const tMap: Record<TimeOfDayId, string> = {
        dawn: '晨光微熹',
        afternoon: '午后天光',
        night: '入夜暗墨鎏金',
      };
      hud?.showToast(`时辰光影 · ${tMap[tod]}`);
    },
    onTimeHourChange: (hour: number) => {
      APP_STATE.solsticeMode = false;
      APP_STATE.timeHour = clamp(hour, 0.0, 24.0) % 24;
      resolveAutoTimeAndTheme(APP_STATE.timeHour);
      applyClimateState();
    },
    onToggleAutoCycle: () => {
      const next = !APP_STATE.autoCycleEnabled;
      const wasSolstice = APP_STATE.solsticeMode;
      APP_STATE.autoCycleEnabled = next;
      if (next) {
        APP_STATE.solsticeMode = false;
        exitSolsticeThemeIfNeeded(wasSolstice);
        applyClimateState();
      }
      const modeName =
        APP_STATE.autoCycleMode === 'both'
          ? '昼夜与四季'
          : APP_STATE.autoCycleMode === 'dayNight'
            ? '24h 昼夜'
            : '四季演替';
      hud?.showToast(next ? `开启 · ${modeName}自动流转` : '已暂停时光自动流转');
      hud?.sync();
    },
    onSelectAutoCycleMode: (mode) => {
      APP_STATE.autoCycleMode = mode;
      if (!APP_STATE.autoCycleEnabled) {
        const wasSolstice = APP_STATE.solsticeMode;
        APP_STATE.autoCycleEnabled = true;
        APP_STATE.solsticeMode = false;
        exitSolsticeThemeIfNeeded(wasSolstice);
        applyClimateState();
      }
      hud?.sync();
    },
    onSelectAutoCycleSpeed: (speed) => {
      APP_STATE.autoCycleSpeed = speed;
      hud?.sync();
    },
    onSelectQuickScenario: (id: QuickScenarioId) => {
      const sc = QUICK_SCENARIOS.find((q) => q.id === id);
      if (!sc) return;
      const wasSolstice = APP_STATE.solsticeMode;
      APP_STATE.weather = sc.weather;
      APP_STATE.weatherIntensity = sc.intensity;
      APP_STATE.temperatureC = sc.temperatureC;
      APP_STATE.solsticeMode = Boolean(sc.solsticeMode);
      if (APP_STATE.solsticeMode) {
        APP_STATE.autoCycleEnabled = false;
        APP_STATE.season = 'winter';
        APP_STATE.seasonProgress = 3.5;
        APP_STATE.theme = 'ink-gold';
        APP_STATE.timeOfDay = 'night';
        lastFoliageKey = '';
      } else {
        exitSolsticeThemeIfNeeded(wasSolstice);
      }
      if (typeof sc.timeHour === 'number') {
        APP_STATE.timeHour = sc.timeHour;
      }
      applyClimateState();
      ambientAudio.playChime(3);
      hud?.showToast(
        APP_STATE.solsticeMode
          ? '已切换情景 · 冬至金光（旋转至低视角正对十七孔桥可见金光穿洞）'
          : `已切换情景 · ${sc.label}`
      );
    },
    onStopPrecipitation: () => {
      const wasSolstice = APP_STATE.solsticeMode;
      APP_STATE.solsticeMode = false;
      APP_STATE.weather = 'clear';
      APP_STATE.weatherIntensity = 0.2;
      if (APP_STATE.temperatureC < 4.0) {
        APP_STATE.temperatureC = APP_STATE.season === 'winter' ? 6.0 : 14.0;
      }
      exitSolsticeThemeIfNeeded(wasSolstice);
      applyClimateState();
      hud?.showToast('已停止降水，恢复清朗天光');
    },
    onResetWeather: () => {
      applyPreset(APP_STATE.season === 'winter' ? 'winter' : APP_STATE.season);
      hud?.showToast('已重置当前季节推荐天时');
    },
    onTogglePoi: () => {
      APP_STATE.poiVisible = !APP_STATE.poiVisible;
      refreshPoiNow(true);
      hud?.showToast(APP_STATE.poiVisible ? '已显示 3D 景点标注' : '已隐藏 3D 景点标注');
      hud?.sync();
    },
    onToggleBoats: () => {
      APP_STATE.boatsEnabled = !APP_STATE.boatsEnabled;
      boatController.update(
        0,
        SHARED_UNIFORMS.uTime.value,
        APP_STATE.iceFactor,
        APP_STATE.windStrength,
        APP_STATE.clockFrozen,
        APP_STATE.boatsEnabled
      );
      pipeline.requestShadowUpdate();
      hud?.showToast(APP_STATE.boatsEnabled ? '昆明湖画舫巡游已开启' : '已隐藏昆明湖画舫');
      hud?.sync();
    },
    onToggleParticles: () => {
      APP_STATE.particlesEnabled = !APP_STATE.particlesEnabled;
      dynamicEffects.syncAtmosphere();
      hud?.showToast(APP_STATE.particlesEnabled ? '四季粒子氛围已开启' : '四季粒子氛围已关闭');
      hud?.sync();
    },
    onTogglePowerSave: () => {
      const next = !APP_STATE.powerSave;
      APP_STATE.powerSave = next;
      sunLight.castShadow = !next;
      pipeline.renderer.shadowMap.enabled = !next;
      dynamicEffects.setPowerSave(next);
      if (!next) {
        pipeline.requestShadowUpdate();
      }
      hud?.showToast(next ? '已切换省电直出模式（降耗增帧）' : '已恢复 GTAO 高清光影模式');
      hud?.sync();
    },
    onToggleTheme: (theme) => {
      APP_STATE.solsticeMode = false;
      APP_STATE.theme = theme;
      APP_STATE.timeOfDay = theme === 'ink-gold' ? 'night' : 'afternoon';
      if (theme === 'ink-gold' && APP_STATE.timeHour > 5.7 && APP_STATE.timeHour < 18.2) {
        APP_STATE.timeHour = 20.5;
      }
      if (theme === 'xuan-light' && (APP_STATE.timeHour <= 5.7 || APP_STATE.timeHour >= 18.2)) {
        APP_STATE.timeHour = 14.5;
      }
      applyClimateState();
      hud?.showToast(theme === 'ink-gold' ? '已切换 · 暗墨鎏金主题' : '已切换 · 宣纸浅色主题');
    },
    onCaptureSnapshot: () => {
      pipeline.renderFrame(scene, cameraRig.camera);
      try {
        const dataUrl = pipeline.renderer.domElement.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `palmside-yihe-${APP_STATE.season}-${APP_STATE.activeSpotId}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        ambientAudio.playChime(4);
        hud?.showToast('高清画卷留影已保存为 PNG');
      } catch {
        hud?.showToast('当前环境限制导出，请使用系统截图');
      }
    },
  });

  // 必须在 createHudController 之后挂载 POI 标注层，避免 hud 初始化清空容器
  poiOverlay = createPoiOverlay({
    root: hudRoot,
    onSelectSpot: (id) => visitSpot(id),
  });

  applyPreset('spring');

  let cycleClockAccum = 0;
  let lastDiscreteSig = `${APP_STATE.season}|${APP_STATE.weather}|${APP_STATE.timeOfDay}|${APP_STATE.theme}`;

  const stepAutoCycle = (dt: number) => {
    const spd = APP_STATE.autoCycleSpeed;
    const mode = APP_STATE.autoCycleMode;

    if (mode === 'both' || mode === 'dayNight') {
      APP_STATE.timeHour = (APP_STATE.timeHour + (24.0 / 28.0) * spd * dt) % 24.0;
      resolveAutoTimeAndTheme(APP_STATE.timeHour);
    }

    let didCustomBlend = false;
    if (mode === 'both' || mode === 'seasons') {
      const rate = mode === 'both' ? 1.0 / 28.0 : 1.0 / 16.0;
      APP_STATE.seasonProgress = (APP_STATE.seasonProgress + rate * spd * dt) % 4.0;
      const sIdx = Math.floor(APP_STATE.seasonProgress) % 4;
      const nextIdx = (sIdx + 1) % 4;
      const frac = APP_STATE.seasonProgress - Math.floor(APP_STATE.seasonProgress);
      const curSeason = SEASON_ORDER[sIdx];
      const nextSeason = SEASON_ORDER[nextIdx];
      APP_STATE.season = curSeason;

      if (frac > 0.76) {
        const blendT = (frac - 0.76) / 0.24;
        foliage.blendSeasons(curSeason, nextSeason, blendT);
        lastFoliageKey = '';
        didCustomBlend = true;
      }

      if (sIdx === 2 && frac > 0.76) {
        // 秋末渐入初雪
        const k = (frac - 0.76) / 0.24;
        APP_STATE.weather = 'snow';
        APP_STATE.weatherIntensity = k * 0.45;
        APP_STATE.temperatureC = 13.0 + (-1.2 - 13.0) * k;
      } else if (sIdx === 3) {
        if (frac <= 0.76) {
          APP_STATE.weather = 'snow';
          APP_STATE.weatherIntensity = 0.84;
          APP_STATE.temperatureC = -3.5;
        } else {
          // 冬末融雪解冻入春
          const k = (frac - 0.76) / 0.24;
          APP_STATE.weather = k > 0.68 ? 'clear' : 'snow';
          APP_STATE.weatherIntensity = (1.0 - k) * 0.84;
          APP_STATE.temperatureC = -3.5 + (14.0 - -3.5) * k;
        }
      } else {
        APP_STATE.weather = 'clear';
        APP_STATE.weatherIntensity = 0.25;
        APP_STATE.temperatureC =
          sIdx === 0 ? 19.0 + 8.0 * frac : sIdx === 1 ? 27.0 - 14.0 * frac : 13.0;
      }
    }

    const sig = `${APP_STATE.season}|${APP_STATE.weather}|${APP_STATE.timeOfDay}|${APP_STATE.theme}`;
    const boundaryCrossed = sig !== lastDiscreteSig;

    applyClimateState({ gpuOnly: !boundaryCrossed, skipFoliage: didCustomBlend });

    if (boundaryCrossed) {
      lastDiscreteSig = sig;
      ambientAudio.syncSceneContext(APP_STATE.season, APP_STATE.weather, APP_STATE.timeOfDay);
      hud?.sync();
    } else {
      cycleClockAccum += dt;
      if (cycleClockAccum >= 0.16) {
        cycleClockAccum = 0;
        hud?.syncClockOnly();
      }
    }
  };

  const getStats = (): SceneDebugStats => {
    const metrics = countSceneMetrics(scene);
    return {
      sceneDrawCalls: metrics.sceneDrawCalls,
      renderPassCalls: pipeline.lastRenderPassCalls,
      triangles: metrics.triangles,
      stepsCount: trayAndTerrain.stepsCount,
      capstonesCount: trayAndTerrain.capstonesCount,
      corridorColumnsCount: corridor.corridorColumnsCount,
      bridgePostsCount: bridgesAndIsland.bridgePostsCount,
      archAnchorsCount: bridgesAndIsland.archAnchors.length,
      treesCount: foliage.stats.totalTrees,
      shrubsCount: foliage.stats.shrubCount,
      solsticeBeamsVisible: dynamicEffects.isSolsticeBeamsVisible(),
      preset: APP_STATE.preset,
      season: APP_STATE.season,
      weather: APP_STATE.weather,
      theme: APP_STATE.theme,
      activeSpotId: APP_STATE.activeSpotId,
    };
  };

  const waitTwoFrames = () =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

  window.__YIHE_DEBUG__ = {
    captureView: async (opts: CaptureViewOptions) => {
      document.documentElement.dataset.frozen = 'true';
      APP_STATE.clockFrozen = true;
      APP_STATE.autoCycleEnabled = false;
      cameraRig.stopRoaming();
      cameraRig.setAutoOrbit(false);

      if (opts.preset) applyPreset(opts.preset);
      if (opts.season) {
        APP_STATE.solsticeMode = false;
        APP_STATE.season = opts.season;
        APP_STATE.seasonProgress = SEASON_ORDER.indexOf(opts.season) + 0.2;
      }
      if (opts.weather) APP_STATE.weather = opts.weather;
      if (typeof opts.weatherIntensity === 'number') {
        APP_STATE.weatherIntensity = clamp(opts.weatherIntensity, 0, 1);
      }
      if (typeof opts.temperatureC === 'number') {
        APP_STATE.temperatureC = clamp(opts.temperatureC, -8, 32);
      }
      if (opts.season || opts.weather || typeof opts.weatherIntensity === 'number' || typeof opts.temperatureC === 'number') {
        lastFoliageKey = '';
        applyClimateState();
      }
      if (opts.theme) applyThemeOnly(opts.theme);

      APP_STATE.activeSpotId = opts.spotId ?? 'overview';
      if (typeof opts.showPoi === 'boolean') APP_STATE.poiVisible = opts.showPoi;

      hud?.setPanels({
        weatherOpen: Boolean(opts.weatherPanelOpen),
        audioOpen: Boolean(opts.audioPanelOpen),
      });

      if (typeof opts.frozenTime === 'number') {
        APP_STATE.frozenTime = opts.frozenTime;
        SHARED_UNIFORMS.uTime.value = opts.frozenTime;
      }

      dynamicEffects.update(SHARED_UNIFORMS.uTime.value);
      boatController.update(
        0,
        SHARED_UNIFORMS.uTime.value,
        APP_STATE.iceFactor,
        APP_STATE.windStrength,
        true,
        APP_STATE.boatsEnabled
      );
      cameraRig.teleport(opts.pos, opts.target);
      refreshPoiNow(true);
      pipeline.requestShadowUpdate();
      pipeline.renderFrame(scene, cameraRig.camera);
      await waitTwoFrames();
      refreshPoiNow(true);
      pipeline.requestShadowUpdate();
      pipeline.renderFrame(scene, cameraRig.camera);
      return getStats();
    },
    getStats,
    getAppState: () => ({ ...APP_STATE }),
    setPreset: applyPreset,
    setTheme: applyThemeOnly,
    setSpot: (id) => visitSpot(id),
  };

  const onResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    cameraRig.resize(w, h);
    pipeline.resize(w, h);
    refreshPoiNow(true);
  };
  window.addEventListener('resize', onResize);

  const clock = new THREE.Clock();
  let frameCount = 0;
  let shadowAccum = 0;
  let telemetryAccum = 0;

  document.addEventListener('visibilitychange', () => {
    ambientAudio.setBackgroundPaused(document.hidden);
    if (!document.hidden) {
      clock.getDelta();
    }
  });

  window.addEventListener('beforeunload', () => {
    ambientAudio.dispose();
  });

  const animate = () => {
    requestAnimationFrame(animate);
    if (document.hidden) return;
    if (APP_STATE.clockFrozen && frameCount >= 2) return;
    const dt = Math.min(clock.getDelta(), 0.05);

    if (!APP_STATE.clockFrozen) {
      SHARED_UNIFORMS.uTime.value += dt;
      if (APP_STATE.autoCycleEnabled && !APP_STATE.solsticeMode) {
        stepAutoCycle(dt);
      }
      if (!APP_STATE.powerSave) {
        shadowAccum += dt;
        if (shadowAccum >= 0.1) {
          shadowAccum = 0;
          pipeline.requestShadowUpdate();
        }
      }
    } else {
      SHARED_UNIFORMS.uTime.value = APP_STATE.frozenTime;
    }

    dynamicEffects.update(SHARED_UNIFORMS.uTime.value);
    boatController.update(
      dt,
      SHARED_UNIFORMS.uTime.value,
      APP_STATE.iceFactor,
      APP_STATE.windStrength,
      APP_STATE.clockFrozen,
      APP_STATE.boatsEnabled
    );
    cameraRig.update(dt);
    ambientAudio.update(
      dt,
      cameraRig.camera.position.y,
      APP_STATE.windStrength,
      APP_STATE.iceFactor,
      APP_STATE.rainAmount
    );
    pipeline.renderFrame(scene, cameraRig.camera);
    refreshPoiNow(false);

    telemetryAccum += dt;
    if (telemetryAccum >= 0.5) {
      telemetryAccum = 0;
      hud?.syncTelemetry(0.5);
    }

    frameCount++;
    if (frameCount === 2 && !window.__YIHE_READY__) {
      window.__YIHE_READY__ = true;
    }
  };

  animate();
}

bootstrap();
