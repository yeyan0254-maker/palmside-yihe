import * as THREE from 'three';
import {
  type BaseSeasonId,
  SEASON_PRESETS,
  type ScenicSpotId,
  type SeasonPresetId,
  type ThemeId,
  type TimeOfDayId,
  type WeatherModeId,
  computeSunDirection,
} from './sceneConfig';

export type AutoCycleMode = 'both' | 'dayNight' | 'seasons';
export type AutoCycleSpeed = 0.5 | 1 | 2;

export interface AppState {
  preset: SeasonPresetId;
  season: BaseSeasonId;
  weather: WeatherModeId;
  weatherIntensity: number;
  temperatureC: number;
  timeOfDay: TimeOfDayId;
  timeHour: number;
  solsticeMode: boolean;
  autoCycleEnabled: boolean;
  autoCycleMode: AutoCycleMode;
  autoCycleSpeed: AutoCycleSpeed;
  seasonProgress: number;
  theme: ThemeId;
  activeSpotId: ScenicSpotId;
  poiVisible: boolean;
  particlesEnabled: boolean;
  roamingActive: boolean;
  autoOrbitActive: boolean;
  sunElevationDeg: number;
  snowAmount: number;
  iceFactor: number;
  rainAmount: number;
  windStrength: number;
  solsticeGlow: number;
  fogDensityScale: number;
  gtaoEnabled: boolean;
  boatsEnabled: boolean;
  powerSave: boolean;
  clockFrozen: boolean;
  frozenTime: number;
  cameraTweenActive: boolean;
}

const initialPreset = SEASON_PRESETS.spring;
const initialSun = computeSunDirection(
  initialPreset.sunElevationDeg,
  initialPreset.sunAzimuthFromSouthTowardWestDeg
);

export const APP_STATE: AppState = {
  preset: 'spring',
  season: 'spring',
  weather: 'clear',
  weatherIntensity: 0.25,
  temperatureC: 19.0,
  timeOfDay: 'afternoon',
  timeHour: 14.5,
  solsticeMode: false,
  autoCycleEnabled: false,
  autoCycleMode: 'both',
  autoCycleSpeed: 1,
  seasonProgress: 0.2,
  theme: 'xuan-light',
  activeSpotId: 'overview',
  poiVisible: true,
  particlesEnabled: true,
  roamingActive: false,
  autoOrbitActive: false,
  sunElevationDeg: initialPreset.sunElevationDeg,
  snowAmount: initialPreset.snowAmount,
  iceFactor: initialPreset.iceFactor,
  rainAmount: initialPreset.rainAmount,
  windStrength: initialPreset.windStrength,
  solsticeGlow: initialPreset.solsticeGlow,
  fogDensityScale: 1.0,
  gtaoEnabled: true,
  boatsEnabled: true,
  powerSave: false,
  clockFrozen: false,
  frozenTime: 0.0,
  cameraTweenActive: false,
};

export const SHARED_UNIFORMS = {
  uTime: { value: 0.0 },
  uSnowAmount: { value: initialPreset.snowAmount },
  uIceFactor: { value: initialPreset.iceFactor },
  uRainAmount: { value: initialPreset.rainAmount },
  uWindStrength: { value: initialPreset.windStrength },
  uSolsticeGlow: { value: initialPreset.solsticeGlow },
  uThemeDark: { value: 0.0 },
  uWaterShallowColor: { value: new THREE.Color(initialPreset.waterShallowHex) },
  uWaterMidColor: { value: new THREE.Color(initialPreset.waterMidHex) },
  uWaterDeepColor: { value: new THREE.Color(initialPreset.waterDeepHex) },
  uSunDir: { value: new THREE.Vector3(initialSun[0], initialSun[1], initialSun[2]).normalize() },
};
