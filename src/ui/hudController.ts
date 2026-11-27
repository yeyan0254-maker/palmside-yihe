import type { AmbientAudioController, BuiltinTrackId } from '../audio/ambientAudio';
import {
  type BaseSeasonId,
  HERO_COPY,
  QUICK_SCENARIOS,
  type QuickScenarioId,
  SCENIC_SPOTS,
  type ScenicSpotId,
  type ThemeId,
  type TimeOfDayId,
  WEATHER_MODES,
  type WeatherModeId,
} from '../config/sceneConfig';
import {
  APP_STATE,
  type AutoCycleMode,
  type AutoCycleSpeed,
} from '../config/stateStore';

export interface HudControllerOptions {
  audio: AmbientAudioController;
  onSelectSpot: (id: ScenicSpotId) => void;
  onToggleRoaming: () => void;
  onToggleAutoOrbit: () => void;
  onCycleNextSpot: () => void;
  onSelectSeason: (season: BaseSeasonId) => void;
  onSelectWeather: (weather: WeatherModeId) => void;
  onWeatherIntensityChange: (val: number) => void;
  onTemperatureChange: (tempC: number) => void;
  onSelectTimeOfDay: (tod: TimeOfDayId) => void;
  onTimeHourChange: (hour: number) => void;
  onToggleAutoCycle: () => void;
  onSelectAutoCycleMode: (mode: AutoCycleMode) => void;
  onSelectAutoCycleSpeed: (speed: AutoCycleSpeed) => void;
  onSelectQuickScenario: (id: QuickScenarioId) => void;
  onStopPrecipitation: () => void;
  onResetWeather: () => void;
  onTogglePoi: () => void;
  onToggleBoats: () => void;
  onToggleParticles: () => void;
  onTogglePowerSave: () => void;
  onToggleTheme: (theme: ThemeId) => void;
  onCaptureSnapshot: () => void;
}

export interface HudControllerHandle {
  sync: () => void;
  syncTelemetry: (advanceSec?: number) => void;
  syncClockOnly: () => void;
  showToast: (text: string, loud?: boolean) => void;
  setPanels: (opts: { weatherOpen?: boolean; audioOpen?: boolean }) => void;
  isRightPanelOpen: () => boolean;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgIcon(pathD: string, size = 14): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.85');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of pathD.split('|')) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

const ICONS = {
  dawn: 'M12 3v2|M5.6 5.6l1.4 1.4|M18.4 5.6l-1.4 1.4|M4 15h16|M7 15a5 5 0 0 1 10 0',
  sun: 'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0|M12 2v2|M12 20v2|M4.9 4.9l1.4 1.4|M17.7 17.7l1.4 1.4|M2 12h2|M20 12h2|M4.9 19.1l1.4-1.4|M17.7 6.3l1.4-1.4',
  moon: 'M20.3 14.4A8.5 8.5 0 1 1 9.6 3.7a6.8 6.8 0 0 0 10.7 10.7z',
  cloudy: 'M7 18h10a4 4 0 0 0 .8-7.9A5.5 5.5 0 0 0 7.3 9 3.5 3.5 0 0 0 7 18z',
  mist: 'M4 9h14|M6 13h14|M3 17h12',
  rain: 'M7 14h10a4 4 0 0 0 .8-7.9A5.5 5.5 0 0 0 7.3 5 3.5 3.5 0 0 0 7 14z|M8 18l-1 3|M12 18l-1 3|M16 18l-1 3',
  snow: 'M12 3v18|M4.5 7.5l15 9|M19.5 7.5l-15 9',
  play: 'M7 5l12 7-12 7V5z',
  pause: 'M8 5h3v14H8z|M13 5h3v14h-3z',
  stop: 'M7 7h10v10H7z',
  pin: 'M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10z|M12 11a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z',
  walk: 'M9 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z|M15 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z|M8 20l1.5-6 3-3|M14 20l.5-5-2-3',
  music: 'M9 18V6l10-2v12|M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M17 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  boat: 'M3 15l3 3h12l3-3H3z|M7 15l2-5h6l2 5|M12 10V6',
  camera: 'M4 8h3l2-2h6l2 2h3v10H4V8z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  orbit: 'M12 2a10 10 0 1 0 10 10|M12 2c3 3 3 17 0 20|M2 12h20',
  fullscreen: 'M4 9V4h5|M20 9V4h-5|M4 15v5h5|M20 15v5h-5',
  reset: 'M3 12a9 9 0 1 0 3-6.7L3 8|M3 3v5h5',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z|M15.5 8.5l-2 5-5 2 2-5 5-2z',
};

function formatClockTime(hour: number): string {
  const clamped = Math.max(0, Math.min(23.99, hour));
  const hh = Math.floor(clamped);
  const mm = Math.floor((clamped - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function formatDuration(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/**
 * 1:1 复刻参考视频与截图的新中式画卷浮层控制器：
 * - 左上无框印章 + 留白诗句 / 入景导览卡切换
 * - 右上 3 层轻量胶囊 + 默认收起「湖山天气」面板 + 互斥「雅乐声景/换歌」面板
 * - 右侧居中 8 图标工具条（无任何旋转/平移冗余按钮）
 * - 底部居中 7 主景点 + 「更多景点」 + 漫游/复位/画质 + 上方微提示/Toast
 * - 左下诗意题记与极淡手势提示 + 右下序号与时辰光照滑块
 */
export function createHudController(opts: HudControllerOptions): HudControllerHandle {
  const root = document.getElementById('hud-root');
  if (!root) {
    return {
      sync: () => {},
      syncTelemetry: () => {},
      syncClockOnly: () => {},
      showToast: () => {},
      setPanels: () => {},
      isRightPanelOpen: () => false,
    };
  }

  root.innerHTML = '';

  const blockCanvas = (el: HTMLElement) => {
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  };

  let weatherOpen = false;
  let audioOpen = false;
  let moreSpotsOpen = false;
  let qualityOpen = false;
  let infoOpen = false;
  let urlInputOpen = false;
  let isScrubbingTime = false;
  let isScrubbingAudio = false;
  let lastWeatherIconKey = '';
  let lastCycleIconPlaying: boolean | null = null;
  let weatherElapsedSec = 0;
  let lastWeatherKey = `${APP_STATE.weather}`;

  const clearScrubLocks = () => {
    isScrubbingTime = false;
    isScrubbingAudio = false;
  };
  window.addEventListener('pointerup', clearScrubLocks, { passive: true });
  window.addEventListener('pointercancel', clearScrubLocks, { passive: true });

  // =========================================================================
  // 1. 左上角：极简品牌头 + 英雄文案 / 入景导览卡
  // =========================================================================
  const brandBtn = document.createElement('button');
  brandBtn.type = 'button';
  brandBtn.className = 'hud-brand';
  brandBtn.title = '点击返回万寿昆明全景';
  blockCanvas(brandBtn);

  const seal = document.createElement('div');
  seal.className = 'hud-seal-circle';
  seal.textContent = '颐';

  const brandText = document.createElement('div');
  brandText.className = 'hud-brand-text';
  const brandTitle = document.createElement('div');
  brandTitle.className = 'hud-brand-title';
  brandTitle.textContent = '掌上颐和';
  const brandSub = document.createElement('div');
  brandSub.className = 'hud-brand-sub';
  brandSub.textContent = 'PALMSIDE YIHE · No. 01 · 昆明湖';
  brandText.append(brandTitle, brandSub);
  brandBtn.append(seal, brandText);
  brandBtn.addEventListener('click', () => {
    brandBtn.blur();
    opts.onSelectSpot('overview');
  });
  root.appendChild(brandBtn);

  const heroHost = document.createElement('div');
  heroHost.className = 'hud-hero';

  const heroBare = document.createElement('div');
  heroBare.className = 'hud-hero-bare';
  const eyebrow = document.createElement('div');
  eyebrow.className = 'hud-eyebrow';
  eyebrow.textContent = 'KUNMING LAKE / WANSHOU HILL';
  const poemEl = document.createElement('h1');
  poemEl.className = 'hud-hero-poem';
  const enSubEl = document.createElement('p');
  enSubEl.className = 'hud-hero-en';
  const verseEl = document.createElement('p');
  verseEl.className = 'hud-hero-verse';
  const creditEl = document.createElement('div');
  creditEl.className = 'hud-hero-credit';
  creditEl.textContent = 'INSPIRED BY SUMMER PALACE, BEIJING';
  heroBare.append(eyebrow, poemEl, enSubEl, verseEl, creditEl);

  const spotCard = document.createElement('div');
  spotCard.className = 'hud-spot-card';
  blockCanvas(spotCard);
  const spotMeta = document.createElement('div');
  spotMeta.className = 'hud-spot-card-meta';
  const spotTag = document.createElement('span');
  const spotIdxTag = document.createElement('span');
  spotMeta.append(spotTag, spotIdxTag);
  const spotTitle = document.createElement('h2');
  spotTitle.className = 'hud-spot-card-title';
  const spotDesc = document.createElement('p');
  spotDesc.className = 'hud-spot-card-desc';
  const spotActions = document.createElement('div');
  spotActions.className = 'hud-spot-card-actions';

  const prevSpotBtn = document.createElement('button');
  prevSpotBtn.type = 'button';
  prevSpotBtn.className = 'hud-mini-btn';
  prevSpotBtn.textContent = '上一景';
  prevSpotBtn.addEventListener('click', () => {
    prevSpotBtn.blur();
    const idx = SCENIC_SPOTS.findIndex((s) => s.id === APP_STATE.activeSpotId);
    const prevIdx = idx <= 1 ? SCENIC_SPOTS.length - 1 : idx - 1;
    opts.onSelectSpot(SCENIC_SPOTS[prevIdx].id);
  });

  const nextSpotBtn = document.createElement('button');
  nextSpotBtn.type = 'button';
  nextSpotBtn.className = 'hud-mini-btn';
  nextSpotBtn.textContent = '下一景';
  nextSpotBtn.addEventListener('click', () => {
    nextSpotBtn.blur();
    opts.onCycleNextSpot();
  });

  const backOverviewBtn = document.createElement('button');
  backOverviewBtn.type = 'button';
  backOverviewBtn.className = 'hud-mini-btn is-primary';
  backOverviewBtn.textContent = '返回全景';
  backOverviewBtn.addEventListener('click', () => {
    backOverviewBtn.blur();
    opts.onSelectSpot('overview');
  });

  spotActions.append(prevSpotBtn, nextSpotBtn, backOverviewBtn);
  spotCard.append(spotMeta, spotTitle, spotDesc, spotActions);
  heroHost.append(heroBare, spotCard);
  root.appendChild(heroHost);

  // =========================================================================
  // 2. 左下角：诗意题记 + 隐式操作微提示
  // =========================================================================
  const storyBox = document.createElement('div');
  storyBox.className = 'hud-story';
  const storyRule = document.createElement('div');
  storyRule.className = 'hud-story-rule';
  const storyTitle = document.createElement('h3');
  storyTitle.className = 'hud-story-title';
  const storyBody = document.createElement('p');
  storyBody.className = 'hud-story-body';
  storyBox.append(storyRule, storyTitle, storyBody);
  root.appendChild(storyBox);

  const gestureHint = document.createElement('div');
  gestureHint.className = 'hud-gesture-hint';
  gestureHint.textContent = '左键旋转 · 右键/空格/WASD 平移 · 滚轮缩放';
  root.appendChild(gestureHint);

  // =========================================================================
  // 3. 右上角三层控制堆栈 + 展开说明卡
  // =========================================================================
  const topRight = document.createElement('div');
  topRight.className = 'hud-top-right';

  // Row 1: Tagline + [ 晨光 | 午后 | 入夜 ] + (i)
  const row1 = document.createElement('div');
  row1.className = 'hud-top-row1';
  blockCanvas(row1);

  const tagline = document.createElement('span');
  tagline.className = 'hud-tagline';
  tagline.textContent = 'AN IMPERIAL GARDEN, HELD IN YOUR PALM.';

  const todCapsule = document.createElement('div');
  todCapsule.className = 'hud-capsule hud-capsule-compact';
  const todBtns = new Map<TimeOfDayId, HTMLButtonElement>();
  const todSpecs: Array<{ id: TimeOfDayId; label: string; icon: string }> = [
    { id: 'dawn', label: '晨光', icon: ICONS.dawn },
    { id: 'afternoon', label: '午后', icon: ICONS.sun },
    { id: 'night', label: '入夜', icon: ICONS.moon },
  ];
  for (const t of todSpecs) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hud-seg-btn';
    b.append(svgIcon(t.icon, 13), document.createTextNode(t.label));
    b.addEventListener('click', () => {
      b.blur();
      opts.onSelectTimeOfDay(t.id);
    });
    todBtns.set(t.id, b);
    todCapsule.appendChild(b);
  }

  const infoBtn = document.createElement('button');
  infoBtn.type = 'button';
  infoBtn.className = 'hud-circle-btn';
  infoBtn.textContent = 'i';
  infoBtn.title = '操控指南与快捷键';

  row1.append(tagline, todCapsule, infoBtn);

  // Row 2: [ 春色 | 夏荫 | 秋韵 | 冬雪 ]
  const seasonCapsule = document.createElement('div');
  seasonCapsule.className = 'hud-capsule hud-capsule-compact';
  blockCanvas(seasonCapsule);
  const seasonBtns = new Map<BaseSeasonId, HTMLButtonElement>();
  const seasonSpecs: Array<{ id: BaseSeasonId; label: string }> = [
    { id: 'spring', label: '春色' },
    { id: 'summer', label: '夏荫' },
    { id: 'autumn', label: '秋韵' },
    { id: 'winter', label: '冬雪' },
  ];
  for (const s of seasonSpecs) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hud-seg-btn hud-seg-btn-sm';
    b.textContent = s.label;
    b.addEventListener('click', () => {
      b.blur();
      opts.onSelectSeason(s.id);
    });
    seasonBtns.set(s.id, b);
    seasonCapsule.appendChild(b);
  }

  // Row 3: Weather trigger button
  const weatherTrigger = document.createElement('button');
  weatherTrigger.type = 'button';
  weatherTrigger.className = 'hud-weather-trigger';
  blockCanvas(weatherTrigger);
  const weatherTriggerIcon = document.createElement('span');
  weatherTriggerIcon.style.display = 'inline-flex';
  const weatherTriggerLabel = document.createElement('span');
  const weatherTriggerCaret = document.createElement('span');
  weatherTriggerCaret.style.fontSize = '10px';
  weatherTrigger.append(weatherTriggerIcon, weatherTriggerLabel, weatherTriggerCaret);

  topRight.append(row1, seasonCapsule, weatherTrigger);
  root.appendChild(topRight);

  // Info popover
  const infoPopover = document.createElement('div');
  infoPopover.className = 'hud-info-popover';
  infoPopover.hidden = true;
  blockCanvas(infoPopover);
  infoPopover.innerHTML = `
    <h3>《掌上颐和》画卷交互说明</h3>
    <div>• <b>旋转视角</b>：鼠标左键拖拽</div>
    <div>• <b>水平平移</b>：右键 / 中键 / 按住 <b>Space</b>+左键 / <b>WASD</b> 或方向键</div>
    <div>• <b>缩放焦距</b>：鼠标滚轮或双指捏合</div>
    <div>• <b>分景游览</b>：点击沙盘悬浮标签、底部景点胶囊或右侧巡游</div>
    <div>• <b>时光流转</b>：点右下角或天气面板播放键开启 24h 昼夜与四季自动演替</div>
    <div>• <b>雅乐换歌</b>：点右侧音符开启程序化雅乐，支持导入本地 MP3/WAV 或粘贴音频直链</div>
  `;
  root.appendChild(infoPopover);

  // =========================================================================
  // 4. 展开式「湖山天气 · WEATHER / SIM」右侧面板
  // =========================================================================
  const weatherPanel = document.createElement('div');
  weatherPanel.className = 'hud-right-popover yihe-scroll';
  weatherPanel.hidden = true;
  blockCanvas(weatherPanel);

  const wHead = document.createElement('div');
  wHead.className = 'hud-popover-head';
  const wTitle = document.createElement('h3');
  wTitle.className = 'hud-popover-title';
  wTitle.textContent = '湖山天气';
  const wCode = document.createElement('span');
  wCode.className = 'hud-popover-code';
  wCode.textContent = 'WEATHER / SIM';
  wHead.append(wTitle, wCode);

  const wModeGrid = document.createElement('div');
  wModeGrid.className = 'hud-weather-grid5';
  const wModeBtns = new Map<WeatherModeId, HTMLButtonElement>();
  const wModeOrder: Array<{ id: WeatherModeId; icon: string }> = [
    { id: 'clear', icon: ICONS.sun },
    { id: 'cloudy', icon: ICONS.cloudy },
    { id: 'mist', icon: ICONS.mist },
    { id: 'rain', icon: ICONS.rain },
    { id: 'snow', icon: ICONS.snow },
  ];
  for (const wm of wModeOrder) {
    const def = WEATHER_MODES[wm.id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hud-wmode-btn';
    btn.append(svgIcon(wm.icon, 15), document.createTextNode(def.label));
    btn.addEventListener('click', () => {
      btn.blur();
      opts.onSelectWeather(wm.id);
    });
    wModeBtns.set(wm.id, btn);
    wModeGrid.appendChild(btn);
  }

  // 天气强度滑块
  const wIntBlock = document.createElement('div');
  wIntBlock.className = 'hud-slider-block';
  const wIntRow = document.createElement('div');
  wIntRow.className = 'hud-slider-row';
  const wIntLbl = document.createElement('span');
  wIntLbl.textContent = '天气强度';
  const wIntVal = document.createElement('span');
  wIntVal.className = 'hud-slider-val';
  wIntRow.append(wIntLbl, wIntVal);
  const wIntRange = document.createElement('input');
  wIntRange.type = 'range';
  wIntRange.className = 'hud-range';
  wIntRange.min = '0';
  wIntRange.max = '100';
  wIntRange.step = '1';
  wIntRange.addEventListener('input', () => {
    opts.onWeatherIntensityChange(Number(wIntRange.value) / 100);
  });
  const wIntDesc = document.createElement('div');
  wIntDesc.className = 'hud-sub-note';
  wIntBlock.append(wIntRow, wIntRange, wIntDesc);

  // 温度滑块
  const wTempBlock = document.createElement('div');
  wTempBlock.className = 'hud-slider-block';
  const wTempRow = document.createElement('div');
  wTempRow.className = 'hud-slider-row';
  const wTempLbl = document.createElement('span');
  wTempLbl.textContent = '温度';
  const wTempVal = document.createElement('span');
  wTempVal.className = 'hud-slider-val';
  wTempRow.append(wTempLbl, wTempVal);
  const wTempRange = document.createElement('input');
  wTempRange.type = 'range';
  wTempRange.className = 'hud-range';
  wTempRange.min = '-8';
  wTempRange.max = '32';
  wTempRange.step = '0.5';
  wTempRange.addEventListener('input', () => {
    opts.onTemperatureChange(Number(wTempRange.value));
  });
  const wTempSub = document.createElement('div');
  wTempSub.className = 'hud-sub-note';
  wTempBlock.append(wTempRow, wTempRange, wTempSub);

  // 4 格气象遥测
  const teleGrid = document.createElement('div');
  teleGrid.className = 'hud-telemetry-grid';
  const mkTele = (label: string) => {
    const cell = document.createElement('div');
    cell.className = 'hud-tele-cell';
    const sp = document.createElement('span');
    sp.textContent = label;
    const st = document.createElement('strong');
    cell.append(sp, st);
    teleGrid.appendChild(cell);
    return st;
  };
  const teleDurVal = mkTele('已持续');
  const teleIceVal = mkTele('湖面结冰');
  const teleSnowVal = mkTele('积雪覆盖');
  const teleWindVal = mkTele('当前风速');

  // 过程下拉
  const processRow = document.createElement('div');
  processRow.className = 'hud-select-row';
  const processLbl = document.createElement('span');
  processLbl.textContent = '过程';
  const processSelect = document.createElement('select');
  processSelect.className = 'hud-select';
  const processOptions: Array<{ value: string; label: string }> = [
    { value: 'custom', label: '自定义实时天气' },
    { value: 'sunny', label: '春日晴朗高光' },
    { value: 'lightMist', label: '万寿轻雾缭绕' },
    { value: 'drizzle', label: '烟雨斜织昆明' },
    { value: 'lightSnow', label: '秋韵树梢初雪' },
    { value: 'heavySnow', label: '冬雪封湖停航' },
    { value: 'solsticeGlow', label: '冬至落日金光穿洞' },
  ];
  for (const op of processOptions) {
    const o = document.createElement('option');
    o.value = op.value;
    o.textContent = op.label;
    processSelect.appendChild(o);
  }
  processSelect.addEventListener('change', () => {
    const val = processSelect.value;
    if (val !== 'custom') {
      opts.onSelectQuickScenario(val as QuickScenarioId);
    }
    processSelect.blur();
  });
  processRow.append(processLbl, processSelect);

  // 2×3 快捷天气按钮
  const quickGrid = document.createElement('div');
  quickGrid.className = 'hud-quick-grid';
  const quickBtns = new Map<QuickScenarioId, HTMLButtonElement>();
  for (const q of QUICK_SCENARIOS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hud-chip-btn';
    b.textContent = q.label;
    b.addEventListener('click', () => {
      b.blur();
      opts.onSelectQuickScenario(q.id);
    });
    quickBtns.set(q.id, b);
    quickGrid.appendChild(b);
  }

  const wActionPair = document.createElement('div');
  wActionPair.className = 'hud-action-pair';
  const stopPrecipBtn = document.createElement('button');
  stopPrecipBtn.type = 'button';
  stopPrecipBtn.className = 'hud-chip-btn';
  stopPrecipBtn.textContent = '停止降水';
  stopPrecipBtn.addEventListener('click', () => {
    stopPrecipBtn.blur();
    opts.onStopPrecipitation();
  });
  const resetWeatherBtn = document.createElement('button');
  resetWeatherBtn.type = 'button';
  resetWeatherBtn.className = 'hud-chip-btn';
  resetWeatherBtn.textContent = '重置推荐';
  resetWeatherBtn.addEventListener('click', () => {
    resetWeatherBtn.blur();
    opts.onResetWeather();
  });
  wActionPair.append(stopPrecipBtn, resetWeatherBtn);

  // 时光流转（24h 昼夜 + 四季自动循环）控制区
  const cycleBox = document.createElement('div');
  cycleBox.className = 'hud-cycle-box';

  const cycleHead = document.createElement('div');
  cycleHead.className = 'hud-cycle-head';
  const cycleTitle = document.createElement('span');
  cycleTitle.textContent = '时光流转';
  const cycleToggleBtn = document.createElement('button');
  cycleToggleBtn.type = 'button';
  cycleToggleBtn.className = 'hud-chip-btn';
  cycleToggleBtn.addEventListener('click', () => {
    cycleToggleBtn.blur();
    opts.onToggleAutoCycle();
  });
  cycleHead.append(cycleTitle, cycleToggleBtn);

  const cycleModeGrid = document.createElement('div');
  cycleModeGrid.className = 'hud-cycle-grid3';
  const cycleModeBtns = new Map<AutoCycleMode, HTMLButtonElement>();
  const cycleModes: Array<{ id: AutoCycleMode; label: string }> = [
    { id: 'both', label: '昼夜+四季' },
    { id: 'dayNight', label: '仅昼夜' },
    { id: 'seasons', label: '仅四季' },
  ];
  for (const m of cycleModes) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hud-chip-btn';
    b.textContent = m.label;
    b.addEventListener('click', () => {
      b.blur();
      opts.onSelectAutoCycleMode(m.id);
    });
    cycleModeBtns.set(m.id, b);
    cycleModeGrid.appendChild(b);
  }

  const cycleSpeedRow = document.createElement('div');
  cycleSpeedRow.className = 'hud-cycle-speed-row';
  const cycleSpeedLbl = document.createElement('span');
  cycleSpeedLbl.textContent = '演替流速';
  const cycleSpeedBtns = new Map<AutoCycleSpeed, HTMLButtonElement>();
  const speedGroup = document.createElement('div');
  speedGroup.className = 'hud-cycle-speed-btns';
  for (const sp of [0.5, 1, 2] as const) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hud-chip-btn';
    b.textContent = `${sp}×`;
    b.addEventListener('click', () => {
      b.blur();
      opts.onSelectAutoCycleSpeed(sp);
    });
    cycleSpeedBtns.set(sp, b);
    speedGroup.appendChild(b);
  }
  cycleSpeedRow.append(cycleSpeedLbl, speedGroup);

  cycleBox.append(cycleHead, cycleModeGrid, cycleSpeedRow);

  const wFootnote = document.createElement('p');
  wFootnote.className = 'hud-footnote';
  wFootnote.textContent =
    '降至 1.5°C 以下昆明湖渐凝冰面，画舫将自动减速返航泊定于排云门码头；升温后平滑解冻复航。';

  weatherPanel.append(
    wHead,
    wModeGrid,
    wIntBlock,
    wTempBlock,
    teleGrid,
    processRow,
    quickGrid,
    wActionPair,
    cycleBox,
    wFootnote
  );
  root.appendChild(weatherPanel);

  // =========================================================================
  // 5. 展开式「雅乐声景 · AUDIO / MIX」右侧面板（支持自由开关 + 本地/外链换歌）
  // =========================================================================
  const audioPanel = document.createElement('div');
  audioPanel.className = 'hud-right-popover yihe-scroll';
  audioPanel.hidden = true;
  blockCanvas(audioPanel);

  const aHead = document.createElement('div');
  aHead.className = 'hud-popover-head';
  const aTitle = document.createElement('h3');
  aTitle.className = 'hud-popover-title';
  aTitle.textContent = '雅乐声景';
  const aHeadActions = document.createElement('div');
  aHeadActions.style.display = 'inline-flex';
  aHeadActions.style.gap = '6px';

  const audioPlayPill = document.createElement('button');
  audioPlayPill.type = 'button';
  audioPlayPill.className = 'hud-mini-btn';
  audioPlayPill.addEventListener('click', () => {
    audioPlayPill.blur();
    opts.audio.togglePlay();
  });

  const audioCloseBtn = document.createElement('button');
  audioCloseBtn.type = 'button';
  audioCloseBtn.className = 'hud-mini-btn';
  audioCloseBtn.textContent = '收起';
  audioCloseBtn.addEventListener('click', () => {
    audioCloseBtn.blur();
    audioOpen = false;
    sync();
  });
  aHeadActions.append(audioPlayPill, audioCloseBtn);
  aHead.append(aTitle, aHeadActions);

  // 4 首内置新中式雅乐曲目
  const trackGrid = document.createElement('div');
  trackGrid.className = 'hud-track-grid';
  const builtinTrackBtns = new Map<BuiltinTrackId, HTMLButtonElement>();
  const builtinList: Array<{ id: BuiltinTrackId; title: string; sub: string }> = [
    { id: 'springDawn', title: '昆明春晓', sub: '宫调古筝清韵' },
    { id: 'mistyRain', title: '烟雨西堤', sub: '羽调洞箫水韵' },
    { id: 'autumnFrost', title: '万寿霜天', sub: '商调古琴松风' },
    { id: 'snowNight', title: '松雪夜泊', sub: '徵调冰湖月冷' },
  ];
  for (const tr of builtinList) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hud-track-btn';
    const st = document.createElement('strong');
    st.textContent = tr.title;
    const sb = document.createElement('span');
    sb.textContent = tr.sub;
    b.append(st, sb);
    b.addEventListener('click', () => {
      b.blur();
      opts.audio.selectBuiltinTrack(tr.id);
    });
    builtinTrackBtns.set(tr.id, b);
    trackGrid.appendChild(b);
  }

  // 自定义音乐区（本地文件 + 可选外链）
  const customBox = document.createElement('div');
  customBox.className = 'hud-custom-music-box';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'audio/*';
  fileInput.multiple = true;
  fileInput.hidden = true;
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      opts.audio.addLocalFiles(fileInput.files);
      fileInput.value = '';
    }
  });

  const customActions = document.createElement('div');
  customActions.className = 'hud-custom-actions';
  const importLocalBtn = document.createElement('button');
  importLocalBtn.type = 'button';
  importLocalBtn.className = 'hud-mini-btn';
  importLocalBtn.style.flex = '1';
  importLocalBtn.textContent = '导入本地音乐';
  importLocalBtn.addEventListener('click', () => {
    importLocalBtn.blur();
    fileInput.click();
  });

  const toggleUrlBtn = document.createElement('button');
  toggleUrlBtn.type = 'button';
  toggleUrlBtn.className = 'hud-mini-btn';
  toggleUrlBtn.textContent = '外链 URL';
  customActions.append(importLocalBtn, toggleUrlBtn);

  const urlRow = document.createElement('div');
  urlRow.className = 'hud-url-row';
  urlRow.hidden = true;
  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.className = 'hud-url-input';
  urlInput.placeholder = '粘贴 MP3 / WAV / OGG 音频直链...';
  const urlAddBtn = document.createElement('button');
  urlAddBtn.type = 'button';
  urlAddBtn.className = 'hud-mini-btn';
  urlAddBtn.textContent = '添加';
  urlAddBtn.addEventListener('click', () => {
    urlAddBtn.blur();
    if (opts.audio.addCustomUrl(urlInput.value)) {
      urlInput.value = '';
      urlInputOpen = false;
      urlRow.hidden = true;
    }
  });
  urlRow.append(urlInput, urlAddBtn);

  toggleUrlBtn.addEventListener('click', () => {
    toggleUrlBtn.blur();
    urlInputOpen = !urlInputOpen;
    urlRow.hidden = !urlInputOpen;
  });

  const playlistHost = document.createElement('div');
  playlistHost.className = 'hud-playlist';

  const progressWrap = document.createElement('div');
  progressWrap.className = 'hud-progress-wrap';
  progressWrap.hidden = true;
  const progRange = document.createElement('input');
  progRange.type = 'range';
  progRange.className = 'hud-range';
  progRange.min = '0';
  progRange.max = '1000';
  progRange.value = '0';
  progRange.addEventListener('pointerdown', () => {
    isScrubbingAudio = true;
  });
  progRange.addEventListener('input', () => {
    opts.audio.seekCustom(Number(progRange.value) / 1000);
  });
  progRange.addEventListener('change', () => {
    isScrubbingAudio = false;
  });
  const progTime = document.createElement('span');
  progTime.textContent = '00:00 / 00:00';
  progressWrap.append(progRange, progTime);

  customBox.append(fileInput, customActions, urlRow, playlistHost, progressWrap);

  // 音量滑块：配乐 + 自然声景
  const mkAudioSlider = (label: string, initialPct: number, onInput: (v: number) => void) => {
    const block = document.createElement('div');
    block.className = 'hud-slider-block';
    const row = document.createElement('div');
    row.className = 'hud-slider-row';
    const sp = document.createElement('span');
    sp.textContent = label;
    const vl = document.createElement('span');
    vl.className = 'hud-slider-val';
    vl.textContent = `${initialPct}%`;
    row.append(sp, vl);
    const rg = document.createElement('input');
    rg.type = 'range';
    rg.className = 'hud-range';
    rg.min = '0';
    rg.max = '100';
    rg.value = String(initialPct);
    rg.addEventListener('input', () => {
      onInput(Number(rg.value) / 100);
    });
    block.append(row, rg);
    return { block, valEl: vl, rangeEl: rg };
  };

  const musicVolCtrl = mkAudioSlider('雅乐 / 自选音量', 62, (v) => opts.audio.setMusicVolume(v));
  const ambVolCtrl = mkAudioSlider('湖风 / 水波 / 雨声', 45, (v) => opts.audio.setAmbientVolume(v));

  const switchRow1 = document.createElement('div');
  switchRow1.className = 'hud-switch-row';
  const autoMatchLabel = document.createElement('span');
  autoMatchLabel.textContent = '随四季与天气自动配乐';
  const autoMatchBtn = document.createElement('button');
  autoMatchBtn.type = 'button';
  autoMatchBtn.className = 'hud-chip-btn';
  autoMatchBtn.addEventListener('click', () => {
    autoMatchBtn.blur();
    opts.audio.setAutoMatchTrack(!opts.audio.getState().autoMatchTrack);
  });
  switchRow1.append(autoMatchLabel, autoMatchBtn);

  const switchRow2 = document.createElement('div');
  switchRow2.className = 'hud-switch-row';
  const chimeLabel = document.createElement('span');
  chimeLabel.textContent = '切景五声清韵提示音';
  const chimeBtn = document.createElement('button');
  chimeBtn.type = 'button';
  chimeBtn.className = 'hud-chip-btn';
  chimeBtn.addEventListener('click', () => {
    chimeBtn.blur();
    opts.audio.setChimeEnabled(!opts.audio.getState().chimeEnabled);
  });
  switchRow2.append(chimeLabel, chimeBtn);

  const aFootnote = document.createElement('p');
  aFootnote.className = 'hud-footnote';
  aFootnote.style.marginTop = '9px';
  aFootnote.textContent =
    '默认静音待机；支持导入本地 MP3/WAV/OGG 离线单文件直放，互不打扰也可叠听风声湖波。';

  audioPanel.append(
    aHead,
    trackGrid,
    customBox,
    musicVolCtrl.block,
    ambVolCtrl.block,
    switchRow1,
    switchRow2,
    aFootnote
  );
  root.appendChild(audioPanel);

  // =========================================================================
  // 6. 右侧 8 图标竖排工具条（无任何旋转/平移冗余按钮）
  // =========================================================================
  const rail = document.createElement('div');
  rail.className = 'hud-rail';
  blockCanvas(rail);

  const mkRailBtn = (tip: string, icon: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hud-rail-btn';
    b.setAttribute('data-tip', tip);
    b.appendChild(svgIcon(icon, 14));
    b.addEventListener('click', () => {
      b.blur();
      onClick();
    });
    rail.appendChild(b);
    return b;
  };

  const railRoamBtn = mkRailBtn('低空石阶漫游', ICONS.play, () => opts.onToggleRoaming());
  const railPoiBtn = mkRailBtn('景点标注开关', ICONS.pin, () => opts.onTogglePoi());
  mkRailBtn('巡游下一景', ICONS.walk, () => opts.onCycleNextSpot());
  const railMusicBtn = mkRailBtn('雅乐声景与换歌', ICONS.music, () => {
    audioOpen = !audioOpen;
    if (audioOpen) {
      weatherOpen = false;
      infoOpen = false;
      moreSpotsOpen = false;
      qualityOpen = false;
    }
    sync();
  });
  const musicLiveDot = document.createElement('span');
  musicLiveDot.className = 'hud-live-dot';
  musicLiveDot.hidden = true;
  railMusicBtn.appendChild(musicLiveDot);

  const railBoatBtn = mkRailBtn('画舫巡游开关', ICONS.boat, () => opts.onToggleBoats());
  mkRailBtn('画卷高清留影', ICONS.camera, () => opts.onCaptureSnapshot());
  const railOrbitBtn = mkRailBtn('360° 缓速环绕', ICONS.orbit, () => opts.onToggleAutoOrbit());
  const railFullBtn = mkRailBtn('全屏画卷', ICONS.fullscreen, () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      void document.exitFullscreen?.().catch(() => {});
    }
  });
  document.addEventListener('fullscreenchange', () => {
    railFullBtn.classList.toggle('is-active', Boolean(document.fullscreenElement));
  });

  root.appendChild(rail);

  // =========================================================================
  // 7. 底部微提示/Toast + 居中悬浮 7 主景点胶囊 + 更多景点/画质向上弹层
  // =========================================================================
  const toastEl = document.createElement('div');
  toastEl.className = 'hud-toast';
  toastEl.textContent = '点击地标入景，或选一处慢慢看。';
  root.appendChild(toastEl);

  let toastTimer: number | undefined;
  const showToast = (text: string, loud = true) => {
    toastEl.textContent = text;
    toastEl.classList.toggle('is-loud', loud);
    if (toastTimer !== undefined) {
      window.clearTimeout(toastTimer);
    }
    toastTimer = window.setTimeout(() => {
      toastEl.classList.remove('is-loud');
      toastEl.textContent = APP_STATE.roamingActive
        ? '低空石阶漫游中 · 任意拖拽或滚轮随时接管视角'
        : '点击地标入景，或选一处慢慢看。';
      toastTimer = undefined;
    }, 2200);
  };

  const dock = document.createElement('div');
  dock.className = 'hud-bottom-dock';
  blockCanvas(dock);

  const dockScroll = document.createElement('div');
  dockScroll.className = 'hud-dock-scroll yihe-scroll';
  const mainSpotBtns = new Map<ScenicSpotId, HTMLButtonElement>();
  for (const s of SCENIC_SPOTS.filter((sp) => sp.inMainBar)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hud-spot-btn';
    b.textContent = s.label;
    b.addEventListener('click', () => {
      b.blur();
      opts.onSelectSpot(s.id);
    });
    mainSpotBtns.set(s.id, b);
    dockScroll.appendChild(b);
  }

  const moreSpotsBtn = document.createElement('button');
  moreSpotsBtn.type = 'button';
  moreSpotsBtn.className = 'hud-spot-btn';
  moreSpotsBtn.textContent = '更多景点 ⌄';
  dockScroll.appendChild(moreSpotsBtn);

  const dockDiv = document.createElement('span');
  dockDiv.className = 'hud-divider';

  const dockRoamBtn = document.createElement('button');
  dockRoamBtn.type = 'button';
  dockRoamBtn.className = 'hud-icon-btn';
  dockRoamBtn.title = '低空石阶漫游';
  dockRoamBtn.appendChild(svgIcon(ICONS.compass, 14));
  dockRoamBtn.addEventListener('click', () => {
    dockRoamBtn.blur();
    opts.onToggleRoaming();
  });

  const dockResetBtn = document.createElement('button');
  dockResetBtn.type = 'button';
  dockResetBtn.className = 'hud-icon-btn';
  dockResetBtn.title = '复位万寿昆明全景';
  dockResetBtn.appendChild(svgIcon(ICONS.reset, 14));
  dockResetBtn.addEventListener('click', () => {
    dockResetBtn.blur();
    opts.onSelectSpot('overview');
  });

  const qualityBtn = document.createElement('button');
  qualityBtn.type = 'button';
  qualityBtn.className = 'hud-spot-btn';
  qualityBtn.textContent = '画质 ⌄';

  dock.append(dockScroll, dockDiv, dockRoamBtn, dockResetBtn, qualityBtn);
  root.appendChild(dock);

  // 更多景点 upward menu
  const moreSpotsMenu = document.createElement('div');
  moreSpotsMenu.className = 'hud-up-menu';
  moreSpotsMenu.hidden = true;
  blockCanvas(moreSpotsMenu);
  const moreList = document.createElement('div');
  moreList.className = 'hud-menu-list';
  const extraSpotBtns = new Map<ScenicSpotId, HTMLButtonElement>();
  for (const s of SCENIC_SPOTS.filter((sp) => !sp.inMainBar)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hud-menu-item';
    const sp = document.createElement('span');
    sp.textContent = s.label;
    const tg = document.createElement('span');
    tg.className = 'hud-menu-tag';
    tg.textContent = s.tag.split(' · ')[0];
    b.append(sp, tg);
    b.addEventListener('click', () => {
      b.blur();
      moreSpotsOpen = false;
      opts.onSelectSpot(s.id);
    });
    extraSpotBtns.set(s.id, b);
    moreList.appendChild(b);
  }
  moreSpotsMenu.appendChild(moreList);
  root.appendChild(moreSpotsMenu);

  // 画质与展陈 upward menu
  const qualityMenu = document.createElement('div');
  qualityMenu.className = 'hud-up-menu';
  qualityMenu.hidden = true;
  blockCanvas(qualityMenu);
  const qualityList = document.createElement('div');
  qualityList.className = 'hud-menu-list';

  const qGtaoBtn = document.createElement('button');
  qGtaoBtn.type = 'button';
  qGtaoBtn.className = 'hud-menu-item';
  const qGtaoTag = document.createElement('span');
  qGtaoTag.className = 'hud-menu-tag';
  qGtaoBtn.append(document.createTextNode('高清光影 GTAO'), qGtaoTag);

  const qPowerBtn = document.createElement('button');
  qPowerBtn.type = 'button';
  qPowerBtn.className = 'hud-menu-item';
  const qPowerTag = document.createElement('span');
  qPowerTag.className = 'hud-menu-tag';
  qPowerBtn.append(document.createTextNode('省电直出模式'), qPowerTag);
  qPowerBtn.addEventListener('click', () => {
    qPowerBtn.blur();
    opts.onTogglePowerSave();
  });

  const qPartBtn = document.createElement('button');
  qPartBtn.type = 'button';
  qPartBtn.className = 'hud-menu-item';
  const qPartTag = document.createElement('span');
  qPartTag.className = 'hud-menu-tag';
  qPartBtn.append(document.createTextNode('四季落叶 / 飘雪粒子'), qPartTag);
  qPartBtn.addEventListener('click', () => {
    qPartBtn.blur();
    opts.onToggleParticles();
  });

  const qThemeBtn = document.createElement('button');
  qThemeBtn.type = 'button';
  qThemeBtn.className = 'hud-menu-item';
  const qThemeTag = document.createElement('span');
  qThemeTag.className = 'hud-menu-tag';
  qThemeBtn.append(document.createTextNode('暗墨鎏金深色模式'), qThemeTag);
  qThemeBtn.addEventListener('click', () => {
    qThemeBtn.blur();
    opts.onToggleTheme(APP_STATE.theme === 'xuan-light' ? 'ink-gold' : 'xuan-light');
  });

  qGtaoBtn.addEventListener('click', () => {
    qGtaoBtn.blur();
    if (APP_STATE.powerSave) {
      opts.onTogglePowerSave();
    } else {
      APP_STATE.gtaoEnabled = !APP_STATE.gtaoEnabled;
      sync();
    }
  });

  qualityList.append(qGtaoBtn, qPowerBtn, qPartBtn, qThemeBtn);
  qualityMenu.appendChild(qualityList);
  root.appendChild(qualityMenu);

  // =========================================================================
  // 8. 右下角：景点序号 + 时辰光照滑块
  // =========================================================================
  const bottomRight = document.createElement('div');
  bottomRight.className = 'hud-bottom-right';
  blockCanvas(bottomRight);

  const counterBox = document.createElement('div');
  counterBox.className = 'hud-spot-counter';
  const counterNum = document.createElement('div');
  counterNum.className = 'hud-counter-num';
  const counterName = document.createElement('div');
  counterName.className = 'hud-counter-name';
  counterBox.append(counterNum, counterName);

  const timeBar = document.createElement('div');
  timeBar.className = 'hud-time-bar';
  const timeLbl = document.createElement('span');
  timeLbl.textContent = '时辰';
  const timeVal = document.createElement('span');
  timeVal.className = 'hud-time-val';
  const timeRange = document.createElement('input');
  timeRange.type = 'range';
  timeRange.className = 'hud-time-range';
  timeRange.min = '0';
  timeRange.max = '24';
  timeRange.step = '0.05';
  timeRange.title = '拖动时辰滑块（00:00–24:00）调整太阳高度与昼夜氛围';
  timeRange.addEventListener('pointerdown', () => {
    isScrubbingTime = true;
  });
  timeRange.addEventListener('input', () => {
    opts.onTimeHourChange(Number(timeRange.value));
  });
  timeRange.addEventListener('change', () => {
    isScrubbingTime = false;
  });

  const cycleBtn = document.createElement('button');
  cycleBtn.type = 'button';
  cycleBtn.className = 'hud-cycle-btn';
  cycleBtn.title = '开启/暂停 昼夜与四季自动流转';
  cycleBtn.addEventListener('click', () => {
    cycleBtn.blur();
    opts.onToggleAutoCycle();
  });

  timeBar.append(timeLbl, timeVal, timeRange, cycleBtn);
  bottomRight.append(counterBox, timeBar);
  root.appendChild(bottomRight);

  // 菜单与浮层开关逻辑
  const positionUpMenu = (anchorBtn: HTMLElement, menu: HTMLElement) => {
    const r = anchorBtn.getBoundingClientRect();
    menu.style.left = `${Math.max(16, Math.min(window.innerWidth - 210, r.left - 24))}px`;
    menu.style.bottom = `${window.innerHeight - r.top + 10}px`;
  };

  weatherTrigger.addEventListener('click', () => {
    weatherTrigger.blur();
    weatherOpen = !weatherOpen;
    if (weatherOpen) {
      audioOpen = false;
      infoOpen = false;
      moreSpotsOpen = false;
      qualityOpen = false;
    }
    sync();
  });

  infoBtn.addEventListener('click', () => {
    infoBtn.blur();
    infoOpen = !infoOpen;
    if (infoOpen) {
      moreSpotsOpen = false;
      qualityOpen = false;
    }
    sync();
  });

  moreSpotsBtn.addEventListener('click', () => {
    moreSpotsBtn.blur();
    moreSpotsOpen = !moreSpotsOpen;
    if (moreSpotsOpen) {
      qualityOpen = false;
      infoOpen = false;
      positionUpMenu(moreSpotsBtn, moreSpotsMenu);
    }
    sync();
  });

  qualityBtn.addEventListener('click', () => {
    qualityBtn.blur();
    qualityOpen = !qualityOpen;
    if (qualityOpen) {
      moreSpotsOpen = false;
      infoOpen = false;
      positionUpMenu(qualityBtn, qualityMenu);
    }
    sync();
  });

  // 在 3D 画布操作时自动收起轻量菜单，保留右栏滑块便于边看边调
  document.getElementById('app')?.addEventListener(
    'pointerdown',
    () => {
      if (moreSpotsOpen || qualityOpen || infoOpen) {
        moreSpotsOpen = false;
        qualityOpen = false;
        infoOpen = false;
        sync();
      }
    },
    { passive: true }
  );

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (moreSpotsOpen || qualityOpen || infoOpen || weatherOpen || audioOpen)) {
      moreSpotsOpen = false;
      qualityOpen = false;
      infoOpen = false;
      weatherOpen = false;
      audioOpen = false;
      sync();
    }
  });

  // =========================================================================
  // 9. 全量 UI 同步 & 遥测刷新
  // =========================================================================
  let lastRenderedPlaylistSig = '';

  const syncPlaylistUi = () => {
    const aState = opts.audio.getState();
    const sig = `${aState.playing}|${aState.sourceKind}|${aState.activeCustomId}|${aState.customTracks.map((t) => t.id + t.name).join(',')}`;
    if (sig !== lastRenderedPlaylistSig) {
      lastRenderedPlaylistSig = sig;
      playlistHost.innerHTML = '';
      for (const tr of aState.customTracks) {
        const row = document.createElement('div');
        row.className = 'hud-playlist-item';
        row.classList.toggle(
          'is-active',
          aState.sourceKind === 'custom' && aState.activeCustomId === tr.id
        );

        const playBtn = document.createElement('button');
        playBtn.type = 'button';
        playBtn.className = 'hud-playlist-play';
        playBtn.textContent =
          (aState.sourceKind === 'custom' && aState.activeCustomId === tr.id ? '▶ ' : '♪ ') + tr.name;
        playBtn.addEventListener('click', () => {
          playBtn.blur();
          opts.audio.selectCustomTrack(tr.id);
        });

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'hud-playlist-del';
        delBtn.textContent = '×';
        delBtn.title = '移除该曲目';
        delBtn.addEventListener('click', () => {
          delBtn.blur();
          opts.audio.removeCustomTrack(tr.id);
        });

        row.append(playBtn, delBtn);
        playlistHost.appendChild(row);
      }
    }

    const showProg = aState.sourceKind === 'custom' && aState.activeCustomId !== null;
    progressWrap.hidden = !showProg;
    if (showProg) {
      if (!isScrubbingAudio) {
        const ratio = aState.durationSec > 0 ? aState.currentTimeSec / aState.durationSec : 0;
        progRange.value = String(Math.round(ratio * 1000));
      }
      progTime.textContent = `${formatDuration(aState.currentTimeSec)} / ${formatDuration(aState.durationSec)}`;
    }
  };

  const syncTelemetry = (advanceSec = 0) => {
    if (lastWeatherKey !== APP_STATE.weather) {
      lastWeatherKey = APP_STATE.weather;
      weatherElapsedSec = 0;
    } else if (advanceSec > 0 && !APP_STATE.clockFrozen) {
      weatherElapsedSec += advanceSec;
    }

    if (!weatherPanel.hidden) {
      teleDurVal.textContent = formatDuration(weatherElapsedSec);
      teleIceVal.textContent = `${Math.round(APP_STATE.iceFactor * 100)}%`;
      teleSnowVal.textContent = `${Math.round(APP_STATE.snowAmount * 100)}%`;
      teleWindVal.textContent = `${(1.2 + APP_STATE.windStrength * 5.8).toFixed(1)} m/s`;
    }

    if (!audioPanel.hidden) {
      syncPlaylistUi();
    }
  };

  const syncClockOnly = () => {
    if (!isScrubbingTime) {
      timeRange.value = String(APP_STATE.timeHour);
    }
    timeVal.textContent = formatClockTime(APP_STATE.timeHour);
    cycleBtn.classList.toggle('is-active', APP_STATE.autoCycleEnabled);
    if (lastCycleIconPlaying !== APP_STATE.autoCycleEnabled) {
      lastCycleIconPlaying = APP_STATE.autoCycleEnabled;
      cycleBtn.innerHTML = '';
      cycleBtn.appendChild(svgIcon(APP_STATE.autoCycleEnabled ? ICONS.pause : ICONS.play, 10));
    }
  };

  const sync = () => {
    const heroKey = APP_STATE.solsticeMode
      ? 'solstice'
      : APP_STATE.weather === 'rain' && APP_STATE.season === 'spring'
        ? 'rain'
        : APP_STATE.season;
    const hero = HERO_COPY[heroKey];
    const spotIdx = Math.max(0, SCENIC_SPOTS.findIndex((s) => s.id === APP_STATE.activeSpotId));
    const spot = SCENIC_SPOTS[spotIdx] ?? SCENIC_SPOTS[0];
    const isOverview = spot.id === 'overview';

    heroBare.hidden = !isOverview;
    spotCard.hidden = isOverview;
    if (isOverview) {
      poemEl.textContent = hero.poem;
      enSubEl.textContent = hero.enSub;
      verseEl.textContent = `${hero.verse1}\n${hero.verse2}`;
    } else {
      spotTag.textContent = spot.tag;
      spotIdxTag.textContent = `${String(spotIdx + 1).padStart(2, '0')} / ${String(SCENIC_SPOTS.length).padStart(2, '0')}`;
      spotTitle.textContent = spot.label;
      spotDesc.textContent = spot.description;
    }

    storyTitle.textContent = spot.storyTitle;
    storyBody.textContent = spot.storyBody;
    counterNum.textContent = `${String(spotIdx + 1).padStart(2, '0')} / ${String(SCENIC_SPOTS.length).padStart(2, '0')}`;
    counterName.textContent = spot.label;

    // 晨光/午后/入夜 + 四季 + 天气触发钮
    for (const [id, btn] of todBtns) {
      btn.classList.toggle('is-active', id === APP_STATE.timeOfDay);
    }
    for (const [id, btn] of seasonBtns) {
      btn.classList.toggle('is-solid-active', id === APP_STATE.season);
    }

    const wMeta = WEATHER_MODES[APP_STATE.weather];
    const nextWKey = APP_STATE.weather;
    if (lastWeatherIconKey !== nextWKey) {
      lastWeatherIconKey = nextWKey;
      weatherTriggerIcon.innerHTML = '';
      const wIconSvg =
        nextWKey === 'clear'
          ? ICONS.sun
          : nextWKey === 'cloudy'
            ? ICONS.cloudy
            : nextWKey === 'mist'
              ? ICONS.mist
              : nextWKey === 'rain'
                ? ICONS.rain
                : ICONS.snow;
      weatherTriggerIcon.appendChild(svgIcon(wIconSvg, 13));
    }
    weatherTriggerLabel.textContent = APP_STATE.solsticeMode ? '冬至金光' : wMeta.label;
    weatherTriggerCaret.textContent = weatherOpen ? '⌃' : '⌄';
    weatherTrigger.classList.toggle('is-open', weatherOpen);

    // 右侧浮层互斥与 8 图标工具条避让
    weatherPanel.hidden = !weatherOpen;
    audioPanel.hidden = !audioOpen;
    infoPopover.hidden = !infoOpen;
    infoBtn.classList.toggle('is-active', infoOpen);
    rail.classList.toggle('is-suppressed', weatherOpen || audioOpen);

    // 湖山天气面板控件刷新
    for (const [id, btn] of wModeBtns) {
      btn.classList.toggle('is-active', id === APP_STATE.weather);
    }
    const intPct = Math.round(APP_STATE.weatherIntensity * 100);
    wIntRange.value = String(intPct);
    wIntVal.textContent = `${intPct}%`;
    wIntDesc.textContent = APP_STATE.solsticeMode
      ? '冬至 9.0° 低斜晚照，旋转至低视角正对十七孔桥可见金光穿洞。'
      : wMeta.desc;

    wTempRange.value = String(APP_STATE.temperatureC);
    wTempVal.textContent = `${APP_STATE.temperatureC.toFixed(1)}°C`;
    wTempSub.textContent =
      APP_STATE.temperatureC <= 1.5
        ? '低于 1.5°C 冰冻阈值 · 画舫平稳泊靠排云门码头'
        : `清朗微风 ${(1.2 + APP_STATE.windStrength * 5.8).toFixed(1)} m/s · 湖水清澈流淌`;

    let activeQuick: QuickScenarioId | 'custom' = 'custom';
    for (const q of QUICK_SCENARIOS) {
      const match = q.solsticeMode
        ? APP_STATE.solsticeMode
        : !APP_STATE.solsticeMode &&
          APP_STATE.weather === q.weather &&
          Math.abs(APP_STATE.weatherIntensity - q.intensity) < 0.06 &&
          Math.abs(APP_STATE.temperatureC - q.temperatureC) < 1.5;
      quickBtns.get(q.id)?.classList.toggle('is-active', match);
      if (match) activeQuick = q.id;
    }
    processSelect.value = activeQuick;

    // 时光流转控制区刷新
    cycleToggleBtn.textContent = APP_STATE.autoCycleEnabled ? '流转中 · 暂停' : '开启流转';
    cycleToggleBtn.classList.toggle('is-active', APP_STATE.autoCycleEnabled);
    for (const [id, btn] of cycleModeBtns) {
      btn.classList.toggle('is-active', id === APP_STATE.autoCycleMode);
    }
    for (const [sp, btn] of cycleSpeedBtns) {
      btn.classList.toggle('is-active', sp === APP_STATE.autoCycleSpeed);
    }

    // 雅乐声景面板刷新
    const aState = opts.audio.getState();
    audioPlayPill.textContent = aState.playing ? '播放中 · 点此静音' : '点击开启雅乐';
    audioPlayPill.classList.toggle('is-primary', aState.playing);
    musicLiveDot.hidden = !aState.playing;
    railMusicBtn.classList.toggle('is-active', audioOpen);

    for (const [id, btn] of builtinTrackBtns) {
      btn.classList.toggle(
        'is-active',
        aState.sourceKind === 'builtin' && aState.activeBuiltinId === id
      );
    }
    musicVolCtrl.rangeEl.value = String(Math.round(aState.musicVolume * 100));
    musicVolCtrl.valEl.textContent = `${Math.round(aState.musicVolume * 100)}%`;
    ambVolCtrl.rangeEl.value = String(Math.round(aState.ambientVolume * 100));
    ambVolCtrl.valEl.textContent = `${Math.round(aState.ambientVolume * 100)}%`;
    autoMatchBtn.textContent = aState.autoMatchTrack ? '已开启' : '手动选曲';
    autoMatchBtn.classList.toggle('is-active', aState.autoMatchTrack);
    chimeBtn.textContent = aState.chimeEnabled ? '已开启' : '静音';
    chimeBtn.classList.toggle('is-active', aState.chimeEnabled);
    syncPlaylistUi();

    // 右侧工具条激活态
    railRoamBtn.classList.toggle('is-active', APP_STATE.roamingActive);
    railPoiBtn.classList.toggle('is-active', APP_STATE.poiVisible);
    railBoatBtn.classList.toggle('is-active', APP_STATE.boatsEnabled);
    railOrbitBtn.classList.toggle('is-active', APP_STATE.autoOrbitActive);
    dockRoamBtn.classList.toggle('is-active', APP_STATE.roamingActive);

    // 底部景点与向上弹层
    let activeInExtra = false;
    for (const [id, btn] of mainSpotBtns) {
      btn.classList.toggle('is-active', id === APP_STATE.activeSpotId);
    }
    for (const [id, btn] of extraSpotBtns) {
      const isAct = id === APP_STATE.activeSpotId;
      btn.classList.toggle('is-active', isAct);
      if (isAct) activeInExtra = true;
    }
    moreSpotsBtn.classList.toggle('is-active', activeInExtra || moreSpotsOpen);
    moreSpotsMenu.hidden = !moreSpotsOpen;
    qualityMenu.hidden = !qualityOpen;
    if (moreSpotsOpen) positionUpMenu(moreSpotsBtn, moreSpotsMenu);
    if (qualityOpen) positionUpMenu(qualityBtn, qualityMenu);

    qGtaoBtn.classList.toggle('is-active', !APP_STATE.powerSave && APP_STATE.gtaoEnabled);
    qGtaoTag.textContent = APP_STATE.powerSave ? '省电禁用' : APP_STATE.gtaoEnabled ? '开启' : '关闭';
    qPowerBtn.classList.toggle('is-active', APP_STATE.powerSave);
    qPowerTag.textContent = APP_STATE.powerSave ? '省电直出' : '标准';
    qPartBtn.classList.toggle('is-active', !APP_STATE.powerSave && APP_STATE.particlesEnabled);
    qPartTag.textContent = !APP_STATE.powerSave && APP_STATE.particlesEnabled ? '开启' : '关闭';
    qThemeBtn.classList.toggle('is-active', APP_STATE.theme === 'ink-gold');
    qThemeTag.textContent = APP_STATE.theme === 'ink-gold' ? '暗墨鎏金' : '宣纸浅色';

    // 右下时辰滑块与循环开关
    syncClockOnly();
    syncTelemetry(0);
  };

  opts.audio.setCallbacks({
    onStateChange: () => sync(),
    onNotice: (msg) => showToast(msg, true),
  });

  const setPanels = (p: { weatherOpen?: boolean; audioOpen?: boolean }) => {
    if (typeof p.weatherOpen === 'boolean') {
      weatherOpen = p.weatherOpen;
      if (weatherOpen) audioOpen = false;
    }
    if (typeof p.audioOpen === 'boolean') {
      audioOpen = p.audioOpen;
      if (audioOpen) weatherOpen = false;
    }
    moreSpotsOpen = false;
    qualityOpen = false;
    infoOpen = false;
    sync();
  };

  sync();

  return {
    sync,
    syncTelemetry,
    syncClockOnly,
    showToast,
    setPanels,
    isRightPanelOpen: () => weatherOpen || audioOpen,
  };
}
