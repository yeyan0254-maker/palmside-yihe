export type SeasonPresetId = 'spring' | 'summer' | 'autumn' | 'winter' | 'rain' | 'solstice';
export type ThemeId = 'xuan-light' | 'ink-gold';

export const ELEVATION = {
  topY: 0.65,
  waterY: 0.0,
  lakeBedY: -0.8,
  skirtBottomY: -1.1,
  innerFloorY: -1.18,
  bottomY: -1.5,
  contactShadowY: -1.53,
} as const;

export const TRAY = {
  outerW: 64.0,
  outerD: 52.0,
  outerRadius: 2.6,
  outerBottomInset: 0.55,
  innerW: 60.8,
  innerD: 48.8,
  innerRadius: 1.6,
  inlayWidth: 0.22,
} as const;

export const LANDMARKS = {
  tray: { x: 0.0, z: 0.0 },
  wanshouMainPeak: { x: 0.0, z: -18.8 },
  wanshouEastSpur: { x: 15.5, z: -18.4 },
  wanshouWestSpur: { x: -16.0, z: -18.4 },
  foxiangge: {
    x: 0.0,
    z: -13.6,
    baseW: 6.8,
    baseD: 6.2,
    topY: 7.1,
    finialY: 13.5,
    embedBottomY: 1.1,
    rotationY: (22.5 * Math.PI) / 180,
  },
  paiyundian: {
    x: 0.0,
    z: -8.4,
    baseW: 3.4,
    baseD: 2.4,
    topY: 2.2,
    ridgeY: 4.05,
    embedBottomY: 0.8,
  },
  paiyunmen: { x: 0.0, z: -5.5, width: 2.4, topY: 1.05 },
  pier: { x: 0.0, z: -4.3, width: 2.6, depth: 1.4, topY: 0.35 },
  corridor: {
    westXMin: -17.2,
    westXMax: -1.6,
    eastXMin: 1.6,
    eastXMax: 16.5,
    baseW: 1.15,
    eaveW: 1.42,
    topY: 0.82,
    embedBottomY: -0.35,
    pavilionTs: [0.28, 0.72] as const,
  },
  southLakeIsland: { x: 12.6, z: 2.2, shoreRadius: 4.09, topY: 0.95 },
  hanxutang: { x: 12.6, z: 2.0, baseW: 2.4, baseD: 1.8, ridgeY: 2.75 },
  seventeenArchBridge: {
    x: 19.6,
    z: 9.8,
    length: 14.0,
    width: 0.95,
    centerY: 0.84,
    endY: 0.42,
    rotationY: (-58 * Math.PI) / 180,
    nwEnd: [15.89, 3.86] as const,
    seEnd: [23.31, 15.74] as const,
  },
  jadeBeltBridge: {
    x: -17.28,
    z: 2.0,
    span: 3.2,
    width: 0.85,
    crownY: 1.45,
    dikeY: 0.52,
    canalBedY: -0.69,
    rotationY: (5.1 * Math.PI) / 180,
    northEnd: [-17.42, 0.4] as const,
    southEnd: [-17.14, 3.6] as const,
  },
  westDikePavilion: { x: -16.82, z: 7.2 },
} as const;

export interface StairPathDef {
  id: string;
  label: string;
  points: ReadonlyArray<readonly [number, number]>;
  width: number;
  steps: number;
  curved: boolean;
}

// 5 条独立石阶路径：32 + 46 + 46 + 148 + 148 = 420 级
export const STAIR_PATHS: ReadonlyArray<StairPathDef> = [
  {
    id: 'imperialAxis',
    label: '中轴御道',
    points: [
      [0.0, -4.8],
      [0.0, -7.2],
    ],
    width: 1.2,
    steps: 32,
    curved: false,
  },
  {
    id: 'westSplayed',
    label: '西侧八字斜阶',
    points: [
      [-4.66, -7.85],
      [-2.6, -10.8],
    ],
    width: 0.72,
    steps: 46,
    curved: false,
  },
  {
    id: 'eastSplayed',
    label: '东侧八字斜阶',
    points: [
      [4.66, -7.85],
      [2.6, -10.8],
    ],
    width: 0.72,
    steps: 46,
    curved: false,
  },
  {
    id: 'westMountain',
    label: '西山盘山步道',
    points: [
      [-11.5, -6.4],
      [-9.2, -10.2],
      [-6.4, -14.0],
      [-3.6, -15.5],
    ],
    width: 0.58,
    steps: 148,
    curved: true,
  },
  {
    id: 'eastMountain',
    label: '东山盘山步道',
    points: [
      [11.2, -6.4],
      [8.8, -10.5],
      [6.0, -14.2],
      [3.6, -15.5],
    ],
    width: 0.58,
    steps: 148,
    curved: true,
  },
];

export const BOAT_WAYPOINTS: ReadonlyArray<readonly [number, number]> = [
  [0.0, -1.2],
  [6.5, -0.8],
  [5.2, 4.8],
  [8.8, 12.2],
  [2.5, 18.2],
  [-7.2, 16.5],
  [-11.8, 7.5],
  [-8.5, 0.5],
];

export const BOAT_DOCK_POINT: readonly [number, number] = [0.0, -2.6];

export const BOAT_DOCK_POINTS: ReadonlyArray<{ pos: readonly [number, number]; yaw: number }> = [
  { pos: [0.0, -2.6], yaw: Math.PI * 0.48 },
  { pos: [-2.6, -2.9], yaw: Math.PI * 0.52 },
];

export interface ThemePalette {
  backdropCenterHex: number;
  backgroundHex: number;
  fogHex: number;
  fogDensity: number;
  contactShadowOpacity: number;
  iblIntensity: number;
}

export interface SeasonPreset {
  id: SeasonPresetId;
  label: string;
  poem: string;
  sunElevationDeg: number;
  /** Azimuth measured clockwise from +Z (south) toward -X (west), so 60 = WSW (-X, +Z) */
  sunAzimuthFromSouthTowardWestDeg: number;
  sunColorHex: number;
  sunIntensity: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiIntensity: number;
  snowAmount: number;
  iceFactor: number;
  rainAmount: number;
  windStrength: number;
  solsticeGlow: number;
  waterShallowHex: number;
  waterMidHex: number;
  waterDeepHex: number;
  themes: Record<ThemeId, ThemePalette>;
}

export const SEASON_PRESETS: Record<SeasonPresetId, SeasonPreset> = {
  spring: {
    id: 'spring',
    label: '春',
    poem: '西堤柳色。',
    sunElevationDeg: 35.0,
    sunAzimuthFromSouthTowardWestDeg: 54.0,
    sunColorHex: 0xfff3de,
    sunIntensity: 2.28,
    hemiSkyHex: 0xe3eded,
    hemiGroundHex: 0x6e6456,
    hemiIntensity: 1.04,
    snowAmount: 0.0,
    iceFactor: 0.0,
    rainAmount: 0.0,
    windStrength: 0.36,
    solsticeGlow: 0.0,
    waterShallowHex: 0x84bdb0,
    waterMidHex: 0x3a847c,
    waterDeepHex: 0x1b4c57,
    themes: {
      'xuan-light': {
        backdropCenterHex: 0xf7f6ee,
        backgroundHex: 0xebeae0,
        fogHex: 0xebeae0,
        fogDensity: 0.0028,
        contactShadowOpacity: 0.7,
        iblIntensity: 0.88,
      },
      'ink-gold': {
        backdropCenterHex: 0x182130,
        backgroundHex: 0x0d1117,
        fogHex: 0x0d1117,
        fogDensity: 0.0036,
        contactShadowOpacity: 0.88,
        iblIntensity: 0.68,
      },
    },
  },
  summer: {
    id: 'summer',
    label: '夏',
    poem: '满湖荷风。',
    sunElevationDeg: 52.0,
    sunAzimuthFromSouthTowardWestDeg: 38.0,
    sunColorHex: 0xfff8ea,
    sunIntensity: 2.55,
    hemiSkyHex: 0xdfedf3,
    hemiGroundHex: 0x626b52,
    hemiIntensity: 1.12,
    snowAmount: 0.0,
    iceFactor: 0.0,
    rainAmount: 0.0,
    windStrength: 0.42,
    solsticeGlow: 0.0,
    waterShallowHex: 0x78b9ab,
    waterMidHex: 0x307e75,
    waterDeepHex: 0x164752,
    themes: {
      'xuan-light': {
        backdropCenterHex: 0xf5f6ee,
        backgroundHex: 0xe8eae2,
        fogHex: 0xe8eae2,
        fogDensity: 0.0026,
        contactShadowOpacity: 0.72,
        iblIntensity: 0.92,
      },
      'ink-gold': {
        backdropCenterHex: 0x161f2d,
        backgroundHex: 0x0c1016,
        fogHex: 0x0c1016,
        fogDensity: 0.0034,
        contactShadowOpacity: 0.88,
        iblIntensity: 0.7,
      },
    },
  },
  autumn: {
    id: 'autumn',
    label: '秋',
    poem: '万寿染霜。',
    sunElevationDeg: 28.0,
    sunAzimuthFromSouthTowardWestDeg: 58.0,
    sunColorHex: 0xffe2b5,
    sunIntensity: 2.38,
    hemiSkyHex: 0xeae4d8,
    hemiGroundHex: 0x745f4a,
    hemiIntensity: 0.96,
    snowAmount: 0.0,
    iceFactor: 0.0,
    rainAmount: 0.0,
    windStrength: 0.48,
    solsticeGlow: 0.0,
    waterShallowHex: 0x85b0a2,
    waterMidHex: 0x3c7672,
    waterDeepHex: 0x1c414d,
    themes: {
      'xuan-light': {
        backdropCenterHex: 0xf7f3e8,
        backgroundHex: 0xece8dc,
        fogHex: 0xece8dc,
        fogDensity: 0.0031,
        contactShadowOpacity: 0.7,
        iblIntensity: 0.86,
      },
      'ink-gold': {
        backdropCenterHex: 0x181f2c,
        backgroundHex: 0x0e1117,
        fogHex: 0x0e1117,
        fogDensity: 0.0038,
        contactShadowOpacity: 0.88,
        iblIntensity: 0.68,
      },
    },
  },
  winter: {
    id: 'winter',
    label: '冬',
    poem: '昆明瑞雪。',
    sunElevationDeg: 22.0,
    sunAzimuthFromSouthTowardWestDeg: 48.0,
    sunColorHex: 0xfff5e8,
    sunIntensity: 2.12,
    hemiSkyHex: 0xe1e8f0,
    hemiGroundHex: 0x7b828b,
    hemiIntensity: 1.06,
    snowAmount: 0.88,
    iceFactor: 0.92,
    rainAmount: 0.0,
    windStrength: 0.3,
    solsticeGlow: 0.0,
    waterShallowHex: 0x93b1b8,
    waterMidHex: 0x527582,
    waterDeepHex: 0x2d4a58,
    themes: {
      'xuan-light': {
        backdropCenterHex: 0xf5f7fb,
        backgroundHex: 0xe9ecf0,
        fogHex: 0xe9ecf0,
        fogDensity: 0.0032,
        contactShadowOpacity: 0.66,
        iblIntensity: 0.92,
      },
      'ink-gold': {
        backdropCenterHex: 0x161f2e,
        backgroundHex: 0x0c1018,
        fogHex: 0x0c1018,
        fogDensity: 0.0038,
        contactShadowOpacity: 0.88,
        iblIntensity: 0.72,
      },
    },
  },
  rain: {
    id: 'rain',
    label: '雨',
    poem: '烟雨昆明。',
    sunElevationDeg: 32.0,
    sunAzimuthFromSouthTowardWestDeg: 52.0,
    sunColorHex: 0xdce7ec,
    sunIntensity: 1.05,
    hemiSkyHex: 0xcbd9df,
    hemiGroundHex: 0x4f5b58,
    hemiIntensity: 1.28,
    snowAmount: 0.0,
    iceFactor: 0.0,
    rainAmount: 1.0,
    windStrength: 0.58,
    solsticeGlow: 0.0,
    waterShallowHex: 0x6ba69f,
    waterMidHex: 0x2c6d6c,
    waterDeepHex: 0x143b47,
    themes: {
      'xuan-light': {
        backdropCenterHex: 0xeef2f3,
        backgroundHex: 0xdce3e6,
        fogHex: 0xdce3e6,
        fogDensity: 0.0044,
        contactShadowOpacity: 0.62,
        iblIntensity: 0.96,
      },
      'ink-gold': {
        backdropCenterHex: 0x131d2b,
        backgroundHex: 0x0a0f17,
        fogHex: 0x0a0f17,
        fogDensity: 0.005,
        contactShadowOpacity: 0.88,
        iblIntensity: 0.72,
      },
    },
  },
  solstice: {
    id: 'solstice',
    label: '金光',
    poem: '金光穿洞。',
    // PRD 2.5：仰角 9.0°、方位角西偏南 30° -> 从 +Z 向 -X 旋转 60° 向量 (-0.855, +0.156, +0.494)
    sunElevationDeg: 9.0,
    sunAzimuthFromSouthTowardWestDeg: 60.0,
    sunColorHex: 0xf0a65a,
    sunIntensity: 1.78,
    hemiSkyHex: 0x7f93b0,
    hemiGroundHex: 0x594b40,
    hemiIntensity: 0.68,
    snowAmount: 0.45,
    iceFactor: 0.65,
    rainAmount: 0.0,
    windStrength: 0.24,
    solsticeGlow: 1.0,
    waterShallowHex: 0x89a3a4,
    waterMidHex: 0x42636e,
    waterDeepHex: 0x1e3342,
    themes: {
      'xuan-light': {
        backdropCenterHex: 0xf4efe4,
        backgroundHex: 0xe9e4da,
        fogHex: 0xe9e4da,
        fogDensity: 0.0034,
        contactShadowOpacity: 0.7,
        iblIntensity: 0.76,
      },
      'ink-gold': {
        backdropCenterHex: 0x1b2232,
        backgroundHex: 0x0b0e14,
        fogHex: 0x0b0e14,
        fogDensity: 0.004,
        contactShadowOpacity: 0.9,
        iblIntensity: 0.54,
      },
    },
  },
};

export interface VerifyCameraSpec {
  id: 'Cam-1' | 'Cam-2' | 'Cam-3' | 'Cam-4' | 'Cam-5' | 'Cam-6';
  name: string;
  pos: readonly [number, number, number];
  target: readonly [number, number, number];
  preset: SeasonPresetId;
  theme: ThemeId;
  frozenTime: number;
}

export const VERIFY_CAMERAS: ReadonlyArray<VerifyCameraSpec> = [
  {
    id: 'Cam-1',
    name: '45° 春季全景',
    pos: [24.0, 29.5, 43.0],
    target: [0.0, 1.8, -2.0],
    preset: 'spring',
    theme: 'xuan-light',
    frozenTime: 2.0,
  },
  {
    id: 'Cam-2',
    name: '贴地石阶与驳岸微距',
    pos: [4.2, 3.6, -2.5],
    target: [0.0, 1.4, -7.8],
    preset: 'spring',
    theme: 'xuan-light',
    frozenTime: 2.0,
  },
  {
    id: 'Cam-3',
    name: '佛香阁 45° 细部特写',
    pos: [8.8, 13.6, -3.2],
    target: [0.0, 9.2, -13.6],
    preset: 'summer',
    theme: 'xuan-light',
    frozenTime: 4.0,
  },
  {
    id: 'Cam-4',
    name: '长廊彩画与玉带桥微距',
    pos: [-10.5, 4.8, 6.8],
    target: [-16.2, 1.0, -1.2],
    preset: 'autumn',
    theme: 'xuan-light',
    frozenTime: 6.0,
  },
  {
    id: 'Cam-5',
    name: '冬景枯枝森林与覆雪',
    pos: [-18.0, 22.0, 32.0],
    target: [0.0, 3.2, -8.0],
    preset: 'winter',
    theme: 'xuan-light',
    frozenTime: 8.0,
  },
  {
    id: 'Cam-6',
    name: '冬至金光穿洞 + 暗墨鎏金 UI',
    pos: [6.2, 6.8, 20.5],
    target: [19.6, 0.7, 9.8],
    preset: 'solstice',
    theme: 'ink-gold',
    frozenTime: 10.0,
  },
];

export function computeSunDirection(elevationDeg: number, azimuthFromSouthTowardWestDeg: number): [number, number, number] {
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthFromSouthTowardWestDeg * Math.PI) / 180;
  const cosEl = Math.cos(el);
  return [-cosEl * Math.sin(az), Math.sin(el), cosEl * Math.cos(az)];
}

export type BaseSeasonId = 'spring' | 'summer' | 'autumn' | 'winter';
export type WeatherModeId = 'clear' | 'cloudy' | 'mist' | 'rain' | 'snow';
export type TimeOfDayId = 'dawn' | 'afternoon' | 'night';

export type ScenicSpotId =
  | 'overview'
  | 'foxiangge'
  | 'paiyundian'
  | 'corridor'
  | 'seventeenArch'
  | 'jadeBelt'
  | 'hanxutang'
  | 'westDike'
  | 'paiyunPier'
  | 'imperialSteps'
  | 'kunmingBoats'
  | 'solsticeAxis';

export interface ScenicSpotDef {
  id: ScenicSpotId;
  label: string;
  tag: string;
  description: string;
  storyTitle: string;
  storyBody: string;
  pos: readonly [number, number, number];
  target: readonly [number, number, number];
  inMainBar: boolean;
  anchor?: readonly [number, number, number];
  priority?: number;
}

export const SCENIC_SPOTS: ReadonlyArray<ScenicSpotDef> = [
  {
    id: 'overview',
    label: '全景概览',
    tag: '万寿昆明 · 皇家园林全景',
    description: '北倚万寿苍翠，南抱昆明碧波，将半部清代皇家山水盛景收入一盘。',
    storyTitle: '湖不大，四时很长。',
    storyBody: '漫步长廊与十七孔桥之间，\n慢下来，听见自己的脚步。',
    pos: [24.0, 29.5, 43.0],
    target: [0.0, 1.8, -2.0],
    inMainBar: true,
  },
  {
    id: 'foxiangge',
    label: '佛香阁',
    tag: '万寿山巅 · 八角四重檐',
    description: '立于二十米高石筑须弥台之上，黄琉璃瓦绿剪边攒尖凌空，为全园构图制高点。',
    storyTitle: '登高望远，一阁定乾坤。',
    storyBody: '飞檐斗拱随四季光影流转，\n俯瞰昆明湖烟波浩渺。',
    pos: [8.6, 13.4, -3.2],
    target: [0.0, 9.2, -13.6],
    inMainBar: true,
    anchor: [0.0, 14.3, -13.6],
    priority: 1,
  },
  {
    id: 'paiyundian',
    label: '排云殿',
    tag: '中轴仪制 · 八字斜廊',
    description: '背山面水居中轴而立，两侧八字斜阶拾级登临，尽显皇家礼制层叠气象。',
    storyTitle: '云影排闼，阶梯入画。',
    storyBody: '自排云门码头循中轴御道步步升高，\n檐牙层层相映。',
    pos: [5.4, 5.2, -1.2],
    target: [0.0, 2.4, -8.2],
    inMainBar: true,
    anchor: [0.0, 4.8, -8.4],
    priority: 6,
  },
  {
    id: 'corridor',
    label: '长廊',
    tag: '沿湖画卷 · 苏式彩画',
    description: '依万寿山南麓蜿蜒临水，梁枋满绘苏式包袱彩画与倒挂楣子，四座八角亭点缀其间。',
    storyTitle: '移步换景，百米画廊。',
    storyBody: '廊柱影落水面，檐下清风穿廊，\n一幅行走的山水长卷。',
    pos: [-5.6, 4.1, 1.4],
    target: [-9.8, 1.4, -5.8],
    inMainBar: true,
    anchor: [-9.2, 2.9, -5.8],
    priority: 3,
  },
  {
    id: 'seventeenArch',
    label: '十七孔桥',
    tag: '东堤长虹 · 72望柱石狮',
    description: '以 -58° 斜跨东堤与南湖岛，十七座连拱逐级起伏，桥栏七十二望柱石狮形态各异。',
    storyTitle: '长虹卧波，金光有约。',
    storyBody: '岁至冬至，低斜残阳\n恰好垂直贯通十七孔洞。',
    pos: [10.6, 5.4, 18.2],
    target: [19.6, 0.8, 9.8],
    inMainBar: true,
    anchor: [19.6, 2.1, 9.8],
    priority: 2,
  },
  {
    id: 'jadeBelt',
    label: '玉带桥',
    tag: '西堤高拱 · 28级曲阶',
    description: '汉白玉单孔蛋形高拱轻盈如练，两侧二十八级弧形石阶紧贴桥背，倒影合成明月。',
    storyTitle: '一弯素玉，轻束西堤。',
    storyBody: '曲拱高挑可通龙舟，\n垂柳拂过汉白玉栏板。',
    pos: [-10.8, 4.4, 6.6],
    target: [-17.28, 1.1, 2.0],
    inMainBar: true,
    anchor: [-17.28, 2.7, 2.0],
    priority: 4,
  },
  {
    id: 'hanxutang',
    label: '涵虚堂',
    tag: '南湖水榭 · 环岛垂柳',
    description: '坐落南湖岛心，二层水榭北望佛香阁正中轴，绿柳环岸，乃观湖赏船绝佳之所。',
    storyTitle: '孤屿涵虚，水天一色。',
    storyBody: '四面清波环抱，听风观舟，\n自成蓬莱仙境。',
    pos: [5.6, 4.8, 8.6],
    target: [12.6, 1.3, 2.0],
    inMainBar: true,
    anchor: [12.6, 3.7, 2.0],
    priority: 5,
  },
  {
    id: 'westDike',
    label: '西堤景亭',
    tag: '六角重檐 · 西湖烟柳',
    description: '仿杭州苏堤意趣而筑，六角重檐小亭掩映千丝垂柳间，春秋烟雨尤为动人。',
    storyTitle: '柳岸闻莺，亭影疏斜。',
    storyBody: '西湖水面清浅如碧玉，\n微风过处满堤轻翠。',
    pos: [-10.6, 4.2, 12.2],
    target: [-16.82, 1.2, 7.2],
    inMainBar: false,
    anchor: [-16.82, 2.9, 7.2],
    priority: 7,
  },
  {
    id: 'paiyunPier',
    label: '排云门码头',
    tag: '条石驳岸 · 画舫泊港',
    description: '青石条驳岸贴水而筑，冬日湖面封冻时，两艘龙首画舫平稳归港泊于码头两侧。',
    storyTitle: '石阶临水，舟归古渡。',
    storyBody: '细观条石勾缝与独立青石阶，\n尽得微缩匠心。',
    pos: [4.2, 3.6, -2.5],
    target: [0.0, 1.4, -7.8],
    inMainBar: false,
  },
  {
    id: 'imperialSteps',
    label: '万寿山步阶',
    tag: '420级青石 · 盘山古径',
    description: '四百二十级逐块实例化青石阶依山势盘旋而上，穿行于多级分枝苍松与红枫之间。',
    storyTitle: '拾级入林，步移景异。',
    storyBody: '每一级石阶皆贴合雕刻山脊，\n零悬空穿插林海。',
    pos: [-6.8, 6.8, -5.2],
    target: [-2.4, 4.6, -12.6],
    inMainBar: false,
  },
  {
    id: 'kunmingBoats',
    label: '昆明湖画舫',
    tag: '玉石清波 · 龙首游船',
    description: '两艘双层朱红金顶画舫沿昆明湖八航点悠然巡游，船尾荡开羽化水波纹。',
    storyTitle: '画舫凌波，镜湖生纹。',
    storyBody: '清透碧水由浅及深渐变，\n结冰期自动减速返航泊港。',
    pos: [-2.4, 9.6, 17.5],
    target: [1.8, 0.4, 4.2],
    inMainBar: false,
  },
  {
    id: 'solsticeAxis',
    label: '冬至金光轴线',
    tag: '-58°连拱 · 落日穿洞',
    description: '冬至九度斜阳自西偏南三十度低掠冰湖，与十七孔桥几何法线精准重合。',
    storyTitle: '一岁一会，金光穿洞。',
    storyBody: '暖金晚照映红石拱，\n暗墨鎏金夜色渐合。',
    pos: [6.2, 6.8, 20.5],
    target: [19.6, 0.7, 9.8],
    inMainBar: false,
  },
];

export const ROAMING_WAYPOINTS: ReadonlyArray<{
  pos: readonly [number, number, number];
  target: readonly [number, number, number];
}> = [
  { pos: [24.2, 2.8, 17.0], target: [19.6, 1.0, 9.8] },
  { pos: [19.2, 2.6, 9.6], target: [15.8, 1.2, 3.8] },
  { pos: [15.4, 2.9, 2.4], target: [11.2, 1.5, -3.5] },
  { pos: [11.0, 2.7, -2.6], target: [6.0, 1.6, -5.8] },
  { pos: [3.2, 2.5, -2.8], target: [0.0, 2.0, -7.4] },
  { pos: [0.0, 3.6, -5.2], target: [0.0, 4.4, -10.8] },
  { pos: [0.0, 7.6, -7.8], target: [0.0, 10.6, -13.6] },
  { pos: [8.6, 13.4, -3.2], target: [0.0, 9.2, -13.6] },
];

export interface HeroCopySpec {
  poem: string;
  enSub: string;
  verse1: string;
  verse2: string;
}

export const HERO_COPY: Record<BaseSeasonId | 'rain' | 'solstice', HeroCopySpec> = {
  spring: {
    poem: '西堤柳色。',
    enSub: 'Willows along the West Dike.',
    verse1: '看风吹过柳梢，长廊映在碧水，',
    verse2: '把一座皇家名园，端在日常的一瞬。',
  },
  summer: {
    poem: '满湖荷风。',
    enSub: 'Lotus breeze across Kunming Lake.',
    verse1: '看画舫破开玉波，南湖绿荫深处，',
    verse2: '半城蝉鸣荷香，皆藏入朱廊檐影。',
  },
  autumn: {
    poem: '万寿染霜。',
    enSub: 'Crimson maples on Longevity Hill.',
    verse1: '银杏落金、丹枫染岫，清霜轻抚石阶，',
    verse2: '四百年山林秋色，悄然浮于紫檀案头。',
  },
  winter: {
    poem: '昆明瑞雪。',
    enSub: 'First snow upon the quiet ice.',
    verse1: '疏枝刻墨、冰裂微光，画舫静泊排云渡，',
    verse2: '万寿山银装素裹，天地只余清冽静气。',
  },
  rain: {
    poem: '烟雨昆明。',
    enSub: 'Soft mist & rain over the lake.',
    verse1: '细雨斜织万寿松间，点点涟漪轻叩玉湖，',
    verse2: '廊角檐溜未停，满山皆作水墨青绿。',
  },
  solstice: {
    poem: '金光穿洞。',
    enSub: 'Solstice sunlight through seventeen arches.',
    verse1: '冬至九度斜阳落尽，暖金贯通十七桥孔，',
    verse2: '一年一度短暂光华，凝驻此刻暗墨流金。',
  },
};

export interface WeatherModeSpec {
  id: WeatherModeId;
  label: string;
  desc: string;
  defaultIntensity: number;
  windBoost: number;
  fogScale: number;
  snowScale: number;
}

export const WEATHER_MODES: Record<WeatherModeId, WeatherModeSpec> = {
  clear: {
    id: 'clear',
    label: '晴天',
    desc: '天光清朗，飞檐与长廊彩画投影锐利分明。',
    defaultIntensity: 0.25,
    windBoost: 0.0,
    fogScale: 0.85,
    snowScale: 0.0,
  },
  cloudy: {
    id: 'cloudy',
    label: '多云',
    desc: '柔光漫射山脊与湖面，整体呈雅致画卷质感。',
    defaultIntensity: 0.48,
    windBoost: 0.12,
    fogScale: 1.25,
    snowScale: 0.0,
  },
  mist: {
    id: 'mist',
    label: '山雾',
    desc: '山间流动轻雾漫过松坡与西堤，如浮云海之上。',
    defaultIntensity: 0.65,
    windBoost: 0.08,
    fogScale: 1.85,
    snowScale: 0.0,
  },
  rain: {
    id: 'rain',
    label: '下雨',
    desc: '细雨斜织万寿山林，昆明湖面泛起清浅涟漪。',
    defaultIntensity: 0.82,
    windBoost: 0.22,
    fogScale: 1.55,
    snowScale: 0.0,
  },
  snow: {
    id: 'snow',
    label: '降雪',
    desc: '飞雪沿枝叶飘落，屋瓦石阶与松梢渐积白雪。',
    defaultIntensity: 0.78,
    windBoost: 0.06,
    fogScale: 1.32,
    snowScale: 1.0,
  },
};

export type QuickScenarioId =
  | 'sunny'
  | 'lightMist'
  | 'drizzle'
  | 'lightSnow'
  | 'heavySnow'
  | 'solsticeGlow';

export interface QuickScenarioDef {
  id: QuickScenarioId;
  label: string;
  weather: WeatherModeId;
  intensity: number;
  temperatureC: number;
  solsticeMode?: boolean;
  timeHour?: number;
}

export const QUICK_SCENARIOS: ReadonlyArray<QuickScenarioDef> = [
  { id: 'sunny', label: '放晴', weather: 'clear', intensity: 0.2, temperatureC: 20.0, solsticeMode: false },
  { id: 'lightMist', label: '轻雾', weather: 'mist', intensity: 0.62, temperatureC: 14.0, solsticeMode: false },
  { id: 'drizzle', label: '细雨', weather: 'rain', intensity: 0.78, temperatureC: 16.0, solsticeMode: false },
  { id: 'lightSnow', label: '初雪', weather: 'snow', intensity: 0.56, temperatureC: -0.5, solsticeMode: false },
  { id: 'heavySnow', label: '瑞雪', weather: 'snow', intensity: 0.94, temperatureC: -4.0, solsticeMode: false },
  {
    id: 'solsticeGlow',
    label: '冬至金光',
    weather: 'clear',
    intensity: 0.25,
    temperatureC: -1.5,
    solsticeMode: true,
    timeHour: 16.6,
  },
];
