import type { BaseSeasonId, TimeOfDayId, WeatherModeId } from '../config/sceneConfig';
import { clamp } from '../core/terrainMath';

export type BuiltinTrackId = 'springDawn' | 'mistyRain' | 'autumnFrost' | 'snowNight';

export interface BuiltinTrackDef {
  id: BuiltinTrackId;
  title: string;
  subtitle: string;
  modeName: string;
  tempoSec: number;
  notesHz: ReadonlyArray<number>;
  droneHz: number;
  xiaoRatio: number;
}

export const BUILTIN_TRACKS: ReadonlyArray<BuiltinTrackDef> = [
  {
    id: 'springDawn',
    title: '昆明春晓',
    subtitle: '宫调古筝清韵',
    modeName: '宫调',
    tempoSec: 1.05,
    // C5 D5 E5 G5 A5 C6 D6
    notesHz: [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66],
    droneHz: 261.63,
    xiaoRatio: 0.42,
  },
  {
    id: 'mistyRain',
    title: '烟雨西堤',
    subtitle: '羽调洞箫水韵',
    modeName: '羽调',
    tempoSec: 1.32,
    // A4 C5 D5 E5 G5 A5 C6
    notesHz: [440.0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5],
    droneHz: 220.0,
    xiaoRatio: 0.72,
  },
  {
    id: 'autumnFrost',
    title: '万寿霜天',
    subtitle: '商调古琴松风',
    modeName: '商调',
    tempoSec: 1.24,
    // D4 E4 G4 A4 C5 D5 E5 G5
    notesHz: [293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99],
    droneHz: 196.0,
    xiaoRatio: 0.55,
  },
  {
    id: 'snowNight',
    title: '松雪夜泊',
    subtitle: '徵调冰湖月冷',
    modeName: '徵调',
    tempoSec: 1.48,
    // G4 A4 C5 D5 E5 G5 A5
    notesHz: [392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0],
    droneHz: 196.0,
    xiaoRatio: 0.68,
  },
];

export interface CustomAudioTrack {
  id: string;
  name: string;
  url: string;
  isObjectUrl: boolean;
}

export interface AudioSnapshotState {
  playing: boolean;
  sourceKind: 'builtin' | 'custom';
  activeBuiltinId: BuiltinTrackId;
  activeCustomId: string | null;
  autoMatchTrack: boolean;
  chimeEnabled: boolean;
  musicVolume: number;
  ambientVolume: number;
  customTracks: ReadonlyArray<CustomAudioTrack>;
  currentTimeSec: number;
  durationSec: number;
}

const PENTATONIC_CHIME_HZ = [523.25, 587.33, 659.25, 783.99, 880.0];

// 古典新中式旋律索引步进序列（避免单调随机）
const MELODY_PATTERN = [0, 2, 3, 4, 2, 1, 3, 5, 4, 2, 0, 1, 2, 4, 3, 1];

export interface AmbientAudioController {
  togglePlay: () => void;
  setPlaying: (play: boolean) => void;
  selectBuiltinTrack: (id: BuiltinTrackId) => void;
  addLocalFiles: (files: FileList | File[]) => void;
  addCustomUrl: (url: string, label?: string) => boolean;
  selectCustomTrack: (id: string) => void;
  removeCustomTrack: (id: string) => void;
  seekCustom: (ratio: number) => void;
  setAutoMatchTrack: (enabled: boolean) => void;
  setChimeEnabled: (enabled: boolean) => void;
  setMusicVolume: (vol: number) => void;
  setAmbientVolume: (vol: number) => void;
  syncSceneContext: (season: BaseSeasonId, weather: WeatherModeId, timeOfDay: TimeOfDayId) => void;
  setBackgroundPaused: (hidden: boolean) => void;
  playChime: (degreeHint?: number) => void;
  update: (
    dt: number,
    cameraY: number,
    windStrength: number,
    iceFactor: number,
    rainAmount: number
  ) => void;
  getState: () => AudioSnapshotState;
  setCallbacks: (cbs: { onStateChange?: () => void; onNotice?: (msg: string) => void }) => void;
  dispose: () => void;
}

/**
 * 零外部 MP3 依赖的 Web Audio 新中式雅乐与自然声景引擎（PRD 5.3 / P03）：
 * - 默认静音待机：页面初始化绝不创建 AudioContext 或调用 play()，确保零 Autoplay 告警
 * - 内置 4 首自适应新中式程序化配乐（古筝/古琴拨弦泛音 + 竹箫长音 + 柔混响）
 * - 支持用户自由导入本地音频文件或粘贴音频直链替换配乐（绕开 createMediaElementSource，file:// 下 100% 稳定）
 * - 独立自然声景（山风随相机高度变化、湖波随结冰消隐、细雨沙沙）与切景五声微响
 */
export function createAmbientAudio(): AmbientAudioController {
  let ctx: AudioContext | null = null;
  let masterOut: GainNode | null = null;
  let synthMusicBus: GainNode | null = null;
  let dryBus: GainNode | null = null;
  let wetBus: GainNode | null = null;
  let windGain: GainNode | null = null;
  let waterGain: GainNode | null = null;
  let rainGain: GainNode | null = null;

  let playing = false;
  let sourceKind: 'builtin' | 'custom' = 'builtin';
  let activeBuiltinId: BuiltinTrackId = 'springDawn';
  let activeCustomId: string | null = null;
  let autoMatchTrack = true;
  let chimeEnabled = true;
  let musicVolume = 0.62;
  let ambientVolume = 0.45;
  let customCounter = 1;
  const customTracks: CustomAudioTrack[] = [];

  // 原生 <audio> 播放器，独立控制本地文件/外链曲目，兼容 file:// 离线单文件
  const customAudioEl = new Audio();
  customAudioEl.loop = true;
  customAudioEl.preload = 'auto';
  customAudioEl.volume = 0;
  let customFadeVol = 0;

  let noteAccum = 0;
  let stepIndex = 0;
  let bgPaused = false;
  let lastSceneCtx: { season: BaseSeasonId; weather: WeatherModeId; timeOfDay: TimeOfDayId } = {
    season: 'spring',
    weather: 'clear',
    timeOfDay: 'afternoon',
  };
  let onStateChangeCb: (() => void) | undefined;
  let onNoticeCb: ((msg: string) => void) | undefined;

  const emitState = () => onStateChangeCb?.();
  const emitNotice = (msg: string) => onNoticeCb?.(msg);

  customAudioEl.addEventListener('error', () => {
    if (sourceKind === 'custom' && activeCustomId) {
      const broken = customTracks.find((t) => t.id === activeCustomId);
      emitNotice(`无法加载音频${broken ? `「${broken.name}」` : ''}，已切回内置雅乐`);
      sourceKind = 'builtin';
      activeCustomId = null;
      emitState();
    }
  });

  const buildImpulseResponse = (audioCtx: AudioContext): AudioBuffer => {
    const duration = 2.1;
    const length = Math.floor(audioCtx.sampleRate * duration);
    const impulse = audioCtx.createBuffer(2, length, audioCtx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let prev = 0;
      for (let i = 0; i < length; i++) {
        const decay = Math.pow(1 - i / length, 2.6);
        const white = Math.random() * 2 - 1;
        prev = prev * 0.62 + white * 0.38;
        data[i] = prev * decay * 0.45;
      }
    }
    return impulse;
  };

  const buildNoiseBuffer = (audioCtx: AudioContext): AudioBuffer => {
    const length = audioCtx.sampleRate * 3;
    const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      data[i] = clamp((b0 + b1 + b2 + white * 0.08) * 1.4, -1, 1);
    }
    return buffer;
  };

  const ensureAudioContext = (): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!ctx) {
      ctx = new AudioCtx();
      masterOut = ctx.createGain();
      masterOut.gain.value = 0.92;
      masterOut.connect(ctx.destination);

      synthMusicBus = ctx.createGain();
      synthMusicBus.gain.value = 0;

      dryBus = ctx.createGain();
      dryBus.gain.value = 0.78;
      wetBus = ctx.createGain();
      wetBus.gain.value = 0.28;

      const convolver = ctx.createConvolver();
      convolver.buffer = buildImpulseResponse(ctx);
      synthMusicBus.connect(dryBus);
      synthMusicBus.connect(convolver);
      convolver.connect(wetBus);
      dryBus.connect(masterOut);
      wetBus.connect(masterOut);

      // 3 路自然声景滤波节点（山风 / 昆明湖拍岸水声 / 细雨沙沙）
      const noiseBuffer = buildNoiseBuffer(ctx);

      const windSrc = ctx.createBufferSource();
      windSrc.buffer = noiseBuffer;
      windSrc.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.value = 360;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(masterOut);
      windSrc.start();

      const waterSrc = ctx.createBufferSource();
      waterSrc.buffer = noiseBuffer;
      waterSrc.loop = true;
      const waterFilter = ctx.createBiquadFilter();
      waterFilter.type = 'bandpass';
      waterFilter.frequency.value = 540;
      waterFilter.Q.value = 1.1;
      waterGain = ctx.createGain();
      waterGain.gain.value = 0;
      waterSrc.connect(waterFilter);
      waterFilter.connect(waterGain);
      waterGain.connect(masterOut);
      waterSrc.start();

      const rainSrc = ctx.createBufferSource();
      rainSrc.buffer = noiseBuffer;
      rainSrc.loop = true;
      const rainFilter = ctx.createBiquadFilter();
      rainFilter.type = 'bandpass';
      rainFilter.frequency.value = 1680;
      rainFilter.Q.value = 0.65;
      rainGain = ctx.createGain();
      rainGain.gain.value = 0;
      rainSrc.connect(rainFilter);
      rainFilter.connect(rainGain);
      rainGain.connect(masterOut);
      rainSrc.start();
    }

    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    return ctx;
  };

  const triggerPluckNote = (freq: number, durSec: number, gainPeak: number) => {
    if (!ctx || !synthMusicBus || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + 0.03;

    const oscMain = ctx.createOscillator();
    oscMain.type = 'triangle';
    oscMain.frequency.setValueAtTime(freq, t0);

    const oscOvertone = ctx.createOscillator();
    oscOvertone.type = 'sine';
    oscOvertone.frequency.setValueAtTime(freq * 2.0, t0);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 4.2, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(320, freq * 1.15), t0 + durSec);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(gainPeak, t0 + 0.018);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);

    const overGain = ctx.createGain();
    overGain.gain.value = 0.24;

    oscMain.connect(filter);
    oscOvertone.connect(overGain);
    overGain.connect(filter);
    filter.connect(env);
    env.connect(synthMusicBus);

    oscMain.start(t0);
    oscOvertone.start(t0);
    oscMain.stop(t0 + durSec + 0.05);
    oscOvertone.stop(t0 + durSec + 0.05);
  };

  const triggerXiaoNote = (freq: number, durSec: number, gainPeak: number) => {
    if (!ctx || !synthMusicBus || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + 0.04;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t0);

    const vib = ctx.createOscillator();
    vib.type = 'sine';
    vib.frequency.setValueAtTime(4.6, t0);
    const vibDepth = ctx.createGain();
    vibDepth.gain.setValueAtTime(freq * 0.008, t0);
    vib.connect(vibDepth);
    vibDepth.connect(osc.frequency);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(gainPeak, t0 + durSec * 0.28);
    env.gain.setValueAtTime(gainPeak * 0.85, t0 + durSec * 0.65);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);

    osc.connect(env);
    env.connect(synthMusicBus);

    osc.start(t0);
    vib.start(t0);
    osc.stop(t0 + durSec + 0.06);
    vib.stop(t0 + durSec + 0.06);
  };

  const startCustomAudioElement = (track: CustomAudioTrack) => {
    if (customAudioEl.src !== track.url) {
      customAudioEl.src = track.url;
      customAudioEl.currentTime = 0;
    }
    if (playing && !document.hidden) {
      customAudioEl.volume = customFadeVol;
      const p = customAudioEl.play();
      if (p) {
        p.catch(() => {
          emitNotice(`无法播放「${track.name}」，请检查音频格式或链接权限`);
        });
      }
    }
  };

  const setPlaying = (nextPlay: boolean) => {
    playing = nextPlay;
    if (playing) {
      ensureAudioContext();
      noteAccum = 0.85;
      if (sourceKind === 'custom' && activeCustomId) {
        const track = customTracks.find((t) => t.id === activeCustomId);
        if (track) startCustomAudioElement(track);
      }
    } else {
      if (!customAudioEl.paused) {
        customAudioEl.pause();
      }
    }
    emitState();
  };

  const togglePlay = () => {
    setPlaying(!playing);
  };

  const selectBuiltinTrack = (id: BuiltinTrackId) => {
    activeBuiltinId = id;
    sourceKind = 'builtin';
    // 用户主动选择内置曲目后尊重选择，避免自动循环切季/晨昏时抢歌
    autoMatchTrack = false;
    noteAccum = 0.9;
    if (!customAudioEl.paused) {
      customAudioEl.pause();
    }
    if (!playing) {
      playing = true;
      ensureAudioContext();
    }
    emitState();
  };

  const addLocalFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;

    let firstAdded: CustomAudioTrack | null = null;
    for (const file of arr) {
      const url = URL.createObjectURL(file);
      const track: CustomAudioTrack = {
        id: `local-${customCounter++}`,
        name: file.name.replace(/\.[^/.]+$/, '') || file.name,
        url,
        isObjectUrl: true,
      };
      customTracks.push(track);
      if (!firstAdded) firstAdded = track;
    }

    if (firstAdded) {
      activeCustomId = firstAdded.id;
      sourceKind = 'custom';
      playing = true;
      ensureAudioContext();
      startCustomAudioElement(firstAdded);
      emitNotice(`已导入并切换至「${firstAdded.name}」`);
      emitState();
    }
  };

  const addCustomUrl = (rawUrl: string, label?: string): boolean => {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      emitNotice('请输入有效的音频链接');
      return false;
    }
    let displayName = label?.trim() || '';
    if (!displayName) {
      try {
        const parsed = new URL(trimmed, window.location.href);
        const tail = parsed.pathname.split('/').filter(Boolean).pop() || '外链雅乐';
        displayName = decodeURIComponent(tail).replace(/\.[^/.]+$/, '');
      } catch {
        displayName = `外链曲目 ${customCounter}`;
      }
    }
    const track: CustomAudioTrack = {
      id: `url-${customCounter++}`,
      name: displayName,
      url: trimmed,
      isObjectUrl: false,
    };
    customTracks.push(track);
    activeCustomId = track.id;
    sourceKind = 'custom';
    playing = true;
    ensureAudioContext();
    startCustomAudioElement(track);
    emitNotice(`已添加「${track.name}」`);
    emitState();
    return true;
  };

  const selectCustomTrack = (id: string) => {
    const track = customTracks.find((t) => t.id === id);
    if (!track) return;
    activeCustomId = track.id;
    sourceKind = 'custom';
    playing = true;
    ensureAudioContext();
    startCustomAudioElement(track);
    emitState();
  };

  const removeCustomTrack = (id: string) => {
    const idx = customTracks.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const [removed] = customTracks.splice(idx, 1);
    if (removed.isObjectUrl) {
      URL.revokeObjectURL(removed.url);
    }
    if (activeCustomId === id) {
      if (customTracks.length > 0) {
        const next = customTracks[Math.max(0, idx - 1)];
        activeCustomId = next.id;
        startCustomAudioElement(next);
      } else {
        activeCustomId = null;
        sourceKind = 'builtin';
        if (!customAudioEl.paused) customAudioEl.pause();
      }
    }
    emitState();
  };

  const seekCustom = (ratio: number) => {
    const dur = customAudioEl.duration;
    if (Number.isFinite(dur) && dur > 0) {
      customAudioEl.currentTime = clamp(ratio, 0, 1) * dur;
      emitState();
    }
  };

  const setAutoMatchTrack = (enabled: boolean) => {
    autoMatchTrack = enabled;
    if (enabled && sourceKind === 'builtin') {
      syncSceneContext(lastSceneCtx.season, lastSceneCtx.weather, lastSceneCtx.timeOfDay);
    }
    emitState();
  };

  const setChimeEnabled = (enabled: boolean) => {
    chimeEnabled = enabled;
    emitState();
  };

  const setMusicVolume = (vol: number) => {
    musicVolume = clamp(vol, 0, 1);
    emitState();
  };

  const setAmbientVolume = (vol: number) => {
    ambientVolume = clamp(vol, 0, 1);
    emitState();
  };

  const syncSceneContext = (
    season: BaseSeasonId,
    weather: WeatherModeId,
    timeOfDay: TimeOfDayId
  ) => {
    lastSceneCtx = { season, weather, timeOfDay };
    if (!autoMatchTrack || sourceKind !== 'builtin') return;
    let next: BuiltinTrackId = 'springDawn';
    if (weather === 'rain' || weather === 'mist') {
      next = 'mistyRain';
    } else if (timeOfDay === 'night' || weather === 'snow' || season === 'winter') {
      next = 'snowNight';
    } else if (season === 'autumn') {
      next = 'autumnFrost';
    }
    if (next !== activeBuiltinId) {
      activeBuiltinId = next;
      emitState();
    }
  };

  const setBackgroundPaused = (hidden: boolean) => {
    bgPaused = hidden;
    if (hidden) {
      customFadeVol = 0;
      customAudioEl.volume = 0;
      if (!customAudioEl.paused) {
        customAudioEl.pause();
      }
      if (ctx && ctx.state === 'running') {
        void ctx.suspend();
      }
    } else if (playing) {
      if (ctx && ctx.state === 'suspended') {
        void ctx.resume();
      }
      if (sourceKind === 'custom' && activeCustomId) {
        const track = customTracks.find((t) => t.id === activeCustomId);
        if (track) startCustomAudioElement(track);
      }
    }
  };

  const playChime = (degreeHint = 0) => {
    if (!playing || !chimeEnabled || !ctx || !synthMusicBus || ctx.state !== 'running') return;
    const hz = PENTATONIC_CHIME_HZ[Math.abs(degreeHint) % PENTATONIC_CHIME_HZ.length];
    const t0 = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(hz, t0);
    const gain = ctx.createGain();
    const peak = 0.075 * Math.max(0.3, musicVolume);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.35);
    osc.connect(gain);
    gain.connect(synthMusicBus);
    osc.start(t0);
    osc.stop(t0 + 1.4);
  };

  const update = (
    dt: number,
    cameraY: number,
    windStrength: number,
    iceFactor: number,
    rainAmount: number
  ) => {
    const hidden = bgPaused || (typeof document !== 'undefined' && document.hidden);
    const targetCustomVol = playing && !hidden && sourceKind === 'custom' ? musicVolume : 0;

    if (targetCustomVol > 0.001) {
      if (customAudioEl.paused && activeCustomId) {
        const track = customTracks.find((t) => t.id === activeCustomId);
        if (track) startCustomAudioElement(track);
      }
      customFadeVol += (targetCustomVol - customFadeVol) * Math.min(1, dt * 4.5);
      customAudioEl.volume = clamp(customFadeVol, 0, 1);
    } else {
      customFadeVol += (0 - customFadeVol) * Math.min(1, dt * 6.5);
      customAudioEl.volume = clamp(customFadeVol, 0, 1);
      if (customFadeVol < 0.01 && !customAudioEl.paused) {
        customAudioEl.pause();
      }
    }

    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const active = playing && !hidden;

    const targetSynthGain = active && sourceKind === 'builtin' ? musicVolume * 0.44 : 0;
    synthMusicBus?.gain.setTargetAtTime(targetSynthGain, now, 0.14);

    // 自然声景随相机高度、风力、结冰、雨势自适应混合（PRD 5.3）
    const altFactor = clamp((cameraY - 3.0) / 36.0, 0.0, 1.0);
    const liquid = 1.0 - clamp(iceFactor / 0.52, 0.0, 1.0);
    const windLvl = active ? ambientVolume * (0.04 + windStrength * 0.14) * (0.45 + 0.55 * altFactor) : 0;
    const waterLvl = active ? ambientVolume * 0.075 * (1.0 - altFactor * 0.72) * liquid : 0;
    const rainLvl = active ? ambientVolume * 0.14 * rainAmount * (1.0 - clamp(iceFactor / 0.72, 0, 1)) : 0;

    windGain?.gain.setTargetAtTime(windLvl, now, 0.16);
    waterGain?.gain.setTargetAtTime(waterLvl, now, 0.16);
    rainGain?.gain.setTargetAtTime(rainLvl, now, 0.16);

    // 在主循环内按安全步进驱动程序化新中式音序，完全免疫后台定时器切回爆音
    if (active && sourceKind === 'builtin') {
      const safeDt = clamp(dt, 0, 0.05);
      const track = BUILTIN_TRACKS.find((t) => t.id === activeBuiltinId) ?? BUILTIN_TRACKS[0];
      noteAccum += safeDt;
      if (noteAccum >= track.tempoSec) {
        noteAccum = 0;
        const pat = MELODY_PATTERN[stepIndex % MELODY_PATTERN.length];
        const noteHz = track.notesHz[pat % track.notesHz.length];
        triggerPluckNote(noteHz, track.tempoSec * 2.3, 0.14);

        if (stepIndex % 4 === 0) {
          triggerPluckNote(track.droneHz, track.tempoSec * 3.4, 0.09);
        }
        if (stepIndex % 3 === 1 && Math.random() < track.xiaoRatio) {
          const xiaoHz = track.notesHz[(pat + 2) % track.notesHz.length] * 0.5;
          triggerXiaoNote(xiaoHz, track.tempoSec * 2.8, 0.065);
        }
        stepIndex = (stepIndex + 1) % 64;
      }
    }
  };

  const getState = (): AudioSnapshotState => ({
    playing,
    sourceKind,
    activeBuiltinId,
    activeCustomId,
    autoMatchTrack,
    chimeEnabled,
    musicVolume,
    ambientVolume,
    customTracks: customTracks.map((t) => ({ ...t })),
    currentTimeSec: Number.isFinite(customAudioEl.currentTime) ? customAudioEl.currentTime : 0,
    durationSec: Number.isFinite(customAudioEl.duration) ? customAudioEl.duration : 0,
  });

  const setCallbacks = (cbs: { onStateChange?: () => void; onNotice?: (msg: string) => void }) => {
    onStateChangeCb = cbs.onStateChange;
    onNoticeCb = cbs.onNotice;
  };

  const dispose = () => {
    playing = false;
    customAudioEl.pause();
    for (const t of customTracks) {
      if (t.isObjectUrl) URL.revokeObjectURL(t.url);
    }
    customTracks.length = 0;
    if (ctx) {
      void ctx.close();
      ctx = null;
    }
  };

  return {
    togglePlay,
    setPlaying,
    selectBuiltinTrack,
    addLocalFiles,
    addCustomUrl,
    selectCustomTrack,
    removeCustomTrack,
    seekCustom,
    setAutoMatchTrack,
    setChimeEnabled,
    setMusicVolume,
    setAmbientVolume,
    syncSceneContext,
    setBackgroundPaused,
    playChime,
    update,
    getState,
    setCallbacks,
    dispose,
  };
}
