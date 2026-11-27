import * as THREE from 'three';
import { SHARED_UNIFORMS } from '../config/stateStore';

export interface EnhanceMaterialOptions {
  /** 仅地形、屋瓦、桥面、石阶、松柏与树枝开启 */
  snow?: boolean;
  /** 积雪覆盖阈值（0.44 适合温和斜坡，0.58 仅限平缓顶面） */
  snowThreshold?: number;
  /** 积雪最大混合强度 */
  snowStrength?: number;
  /** 植被微风摇曳（同步生成 customDepthMaterial） */
  wind?: boolean;
  /** 风摆幅度权重 */
  windAmplitude?: number;
  /** 风摆基准高度（树冠/树梢随高度增强） */
  windHeightScale?: number;
  /** 昆明湖水深渐变 + 冬日冰裂模式 */
  waterIce?: boolean;
  /** 植被枝叶半透光柔和漫反射提亮 */
  foliageTranslucency?: boolean;
  /** 绑定目标网格时自动写入 customDepthMaterial */
  mesh?: THREE.Mesh;
}

function injectWindVertexChunk(
  shader: THREE.WebGLProgramParametersWithUniforms,
  windAmp: number,
  windHeightScale: number
): void {
  shader.uniforms.uTime = SHARED_UNIFORMS.uTime;
  shader.uniforms.uWindStrength = SHARED_UNIFORMS.uWindStrength;

  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
uniform float uTime;
uniform float uWindStrength;`
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
{
  vec3 yiheAnchor = vec3(0.0);
  #ifdef USE_INSTANCING
    yiheAnchor = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  #endif
  float yiheH = clamp(position.y / ${windHeightScale.toFixed(3)}, 0.0, 1.4);
  float yihePhase = yiheAnchor.x * 0.73 + yiheAnchor.z * 0.61 + position.y * 0.9;
  float yiheGust = sin(uTime * 1.45 + yihePhase) + 0.45 * cos(uTime * 2.35 + yihePhase * 1.7);
  float yiheSway = yiheH * yiheH * uWindStrength * ${windAmp.toFixed(4)};
  transformed.x += yiheGust * yiheSway;
  transformed.z += cos(uTime * 1.18 + yihePhase * 1.3) * yiheSway * 0.65;
}`
    );
}

/**
 * 统一着色器增强器（PRD 4.2）：
 * 单入口按位组合 snow / wind / waterIce，自动隔离 customProgramCacheKey，
 * 并为启用风摆的网格同步生成 customDepthMaterial，严格保留 USE_INSTANCING_COLOR。
 */
export function enhanceMaterial<T extends THREE.MeshStandardMaterial>(
  material: T,
  opts: EnhanceMaterialOptions = {}
): { material: T; customDepthMaterial?: THREE.MeshDepthMaterial } {
  const snow = Boolean(opts.snow);
  const wind = Boolean(opts.wind);
  const waterIce = Boolean(opts.waterIce);
  const foliageTrans = Boolean(opts.foliageTranslucency);

  if (!snow && !wind && !waterIce && !foliageTrans) {
    return { material };
  }

  const snowThreshold = opts.snowThreshold ?? 0.44;
  const snowStrength = opts.snowStrength ?? 0.92;
  const windAmp = opts.windAmplitude ?? 0.14;
  const windHeightScale = opts.windHeightScale ?? 1.8;

  const cacheKey = `yihe-s${snow ? 1 : 0}-w${wind ? 1 : 0}-i${waterIce ? 1 : 0}-f${foliageTrans ? 1 : 0}-t${Math.round(snowThreshold * 100)}-ss${Math.round(snowStrength * 100)}-wa${Math.round(windAmp * 1000)}-wh${Math.round(windHeightScale * 100)}`;
  material.customProgramCacheKey = () => cacheKey;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SHARED_UNIFORMS.uTime;
    shader.uniforms.uSnowAmount = SHARED_UNIFORMS.uSnowAmount;
    shader.uniforms.uIceFactor = SHARED_UNIFORMS.uIceFactor;
    shader.uniforms.uRainAmount = SHARED_UNIFORMS.uRainAmount;
    shader.uniforms.uWindStrength = SHARED_UNIFORMS.uWindStrength;
    shader.uniforms.uSolsticeGlow = SHARED_UNIFORMS.uSolsticeGlow;
    shader.uniforms.uThemeDark = SHARED_UNIFORMS.uThemeDark;
    shader.uniforms.uWaterShallowColor = SHARED_UNIFORMS.uWaterShallowColor;
    shader.uniforms.uWaterMidColor = SHARED_UNIFORMS.uWaterMidColor;
    shader.uniforms.uWaterDeepColor = SHARED_UNIFORMS.uWaterDeepColor;
    shader.uniforms.uSunDir = SHARED_UNIFORMS.uSunDir;

    if (wind) {
      injectWindVertexChunk(shader, windAmp, windHeightScale);
    }

    if (snow || waterIce || foliageTrans) {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vYiheWorldPos;
${waterIce ? 'attribute float aWaterDepth;\nvarying float vWaterDepth;' : ''}`
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
vec4 yiheWp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  yiheWp = instanceMatrix * yiheWp;
#endif
yiheWp = modelMatrix * yiheWp;
vYiheWorldPos = yiheWp.xyz;
${waterIce ? 'vWaterDepth = aWaterDepth;' : ''}`
        );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform float uSnowAmount;
uniform float uIceFactor;
uniform float uRainAmount;
uniform float uWindStrength;
uniform float uSolsticeGlow;
uniform float uThemeDark;
uniform vec3 uWaterShallowColor;
uniform vec3 uWaterMidColor;
uniform vec3 uWaterDeepColor;
uniform vec3 uSunDir;
varying vec3 vYiheWorldPos;
${waterIce ? 'varying float vWaterDepth;' : ''}

float yiheHash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float yiheNoise21(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(yiheHash21(i), yiheHash21(i + vec2(1.0, 0.0)), u.x),
    mix(yiheHash21(i + vec2(0.0, 1.0)), yiheHash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
${
  waterIce
    ? `vec3 yiheRainRippleLayer(vec2 p, float t) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float h1 = yiheHash21(cell + 13.7);
  float h2 = yiheHash21(cell + 71.3);
  float h3 = yiheHash21(cell + 139.1);
  float activeCell = smoothstep(0.38, 0.72, h3);
  if (activeCell <= 0.01) return vec3(0.0);
  vec2 dropPos = vec2(0.24 + 0.52 * h1, 0.24 + 0.52 * h2);
  float age = fract(t * (0.78 + 0.34 * h1) + h2);
  vec2 d = f - dropPos;
  float dist = length(d);
  float rad = 0.04 + age * 0.36;
  float band = exp(-pow((dist - rad) / 0.026, 2.0));
  float wave = cos(clamp((dist - rad) * 52.0, -3.14159, 3.14159));
  float fade = pow(1.0 - age, 1.8) * smoothstep(0.04, 0.20, age) * activeCell;
  vec2 dir = dist > 1e-4 ? d / dist : vec2(0.0);
  float ring = band * fade;
  return vec3(dir * (-wave * ring), ring);
}`
    : ''
}`
      );
    }

    // 在 normal_fragment_maps 之后执行，此时 normal、diffuseColor（含 vColor / USE_INSTANCING_COLOR）与 roughnessFactor 均已就绪
    let postNormalInject = '';

    if (snow) {
      postNormalInject += `
{
  vec3 yiheWorldN = normalize(inverseTransformDirection(normal, viewMatrix));
  float yiheSnowNoise = yiheNoise21(vYiheWorldPos.xz * 1.45) * 0.16 + yiheNoise21(vYiheWorldPos.xz * 5.2) * 0.07;
  float yiheSnowUp = yiheWorldN.y + yiheSnowNoise - 0.10;
  float yiheSnowMask = smoothstep(${snowThreshold.toFixed(3)}, ${(snowThreshold + 0.24).toFixed(3)}, yiheSnowUp);
  yiheSnowMask *= smoothstep(0.04, 0.22, uSnowAmount);
  float yiheSnowBlend = clamp(yiheSnowMask * uSnowAmount * ${snowStrength.toFixed(3)}, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.935, 0.952, 0.98), yiheSnowBlend);
  roughnessFactor = mix(roughnessFactor, 0.72, yiheSnowBlend);

  float yiheRainWet = clamp(uRainAmount * (1.0 - smoothstep(0.10, 0.45, uSnowAmount)), 0.0, 1.0);
  if (yiheRainWet > 0.005) {
    float yiheWetUp = smoothstep(0.15, 0.78, yiheWorldN.y);
    diffuseColor.rgb *= mix(1.0, 0.81, yiheRainWet * (0.45 + 0.55 * yiheWetUp));
    roughnessFactor = mix(roughnessFactor, max(0.14, roughnessFactor * 0.44), yiheRainWet * (0.35 + 0.65 * yiheWetUp));
  }
}`;
    }

    if (waterIce) {
      postNormalInject += `
{
  // 低频舒缓长波，彻底消除高频碎波噪点与摩尔纹
  vec2 wp = vYiheWorldPos.xz;
  float liquid = 1.0 - smoothstep(0.18, 0.85, uIceFactor);
  float wBoost = (0.55 + uWindStrength * 0.70) * liquid;

  vec2 d1 = vec2(0.866, 0.500);
  vec2 d2 = vec2(-0.520, 0.854);

  float p1 = dot(wp, d1) * 1.45 + uTime * 0.65;
  float p2 = dot(wp, d2) * 2.05 - uTime * 0.52;

  vec2 grad = d1 * cos(p1) * 0.011
            + d2 * cos(p2) * 0.008;
  float yiheRainRing = 0.0;
  if (uRainAmount > 0.01 && liquid > 0.01) {
    vec3 r1 = yiheRainRippleLayer(wp * 2.35, uTime * 1.05);
    vec3 r2 = yiheRainRippleLayer(wp * 3.60 + vec2(4.7, 2.3), uTime * 1.32);
    grad += (r1.xy + r2.xy) * (0.14 * uRainAmount * liquid);
    yiheRainRing = (r1.z + r2.z * 0.8) * 0.52;
  }
  vec3 yiheWaveWorldN = normalize(vec3(-grad.x * wBoost, 1.0, -grad.y * wBoost));
  normal = normalize(mix(normal, normalize((viewMatrix * vec4(yiheWaveWorldN, 0.0)).xyz), 0.48 * liquid));

  float yiheDepthN = clamp(vWaterDepth / 0.80, 0.0, 1.0);
  float yiheBeer = 1.0 - exp(-vWaterDepth * 3.1);
  vec3 yiheWaterCol = mix(uWaterShallowColor, uWaterMidColor, smoothstep(0.0, 0.45, yiheBeer));
  yiheWaterCol = mix(yiheWaterCol, uWaterDeepColor, smoothstep(0.40, 1.0, yiheBeer));

  // 柔润浅岸清透边缘光晕（无碎点噪点）
  float yiheShoreRim = (1.0 - smoothstep(0.004, 0.095, vWaterDepth))
    * (0.72 + 0.28 * sin(dot(wp, vec2(0.7, 0.7)) * 1.2 + uTime * 0.6));
  yiheWaterCol = mix(yiheWaterCol, vec3(0.82, 0.91, 0.88), yiheShoreRim * 0.16 * (1.0 - uIceFactor));

  // 主题感知菲涅尔天光泛白反射
  vec3 yiheWorldWaterN = normalize(inverseTransformDirection(normal, viewMatrix));
  vec3 yiheViewDirW = normalize(cameraPosition - vYiheWorldPos);
  vec3 yiheSkyReflect = mix(vec3(0.85, 0.91, 0.91), vec3(0.28, 0.38, 0.48), uThemeDark);
  float yiheFresnel = pow(1.0 - max(dot(yiheViewDirW, yiheWorldWaterN), 0.0), 3.6);
  yiheWaterCol = mix(yiheWaterCol, yiheSkyReflect, yiheFresnel * 0.30 * (1.0 - uIceFactor * 0.55));

  if (yiheRainRing > 0.001) {
    vec3 yiheRingTint = mix(vec3(0.84, 0.92, 0.94), vec3(0.42, 0.56, 0.66), uThemeDark);
    yiheWaterCol = mix(yiheWaterCol, yiheRingTint, clamp(yiheRainRing * 0.16 * uRainAmount * liquid, 0.0, 0.22));
  }

  // 冬日冻冰 + 冰裂纹 + 浮雪斑块（保留冰面幽蓝质感与冰裂纹对比，避免纯白融成一片）
  float yiheCrackA = abs(yiheNoise21(wp * 1.15) - 0.5);
  float yiheCrackB = abs(yiheNoise21(wp * 2.65 + 9.2) - 0.5);
  float yiheCrack = 1.0 - smoothstep(0.014, 0.055, min(yiheCrackA, yiheCrackB * 1.15));
  vec3 yiheIceBase = mix(vec3(0.45, 0.60, 0.72), vec3(0.62, 0.74, 0.83), yiheDepthN * 0.45);
  vec3 yiheIceCol = mix(yiheIceBase, vec3(0.91, 0.95, 0.98), yiheCrack * 0.78);
  float yiheIceDriftSnow = smoothstep(0.62, 0.88, yiheNoise21(wp * 0.42 + 4.1)) * uSnowAmount;
  yiheIceCol = mix(yiheIceCol, vec3(0.94, 0.96, 0.99), yiheIceDriftSnow * 0.34);

  float yiheIceMask = smoothstep(0.05, 0.92, uIceFactor + (1.0 - yiheDepthN) * 0.16 * uIceFactor);
  diffuseColor.rgb = mix(yiheWaterCol, yiheIceCol, yiheIceMask);

  float yiheLiquidAlpha = mix(0.26, 0.86, clamp(yiheBeer * 1.06, 0.0, 1.0));
  diffuseColor.a = mix(yiheLiquidAlpha, 0.95, yiheIceMask);

  float yiheIceRough = mix(0.32, 0.72, yiheIceDriftSnow);
  roughnessFactor = mix(0.135, yiheIceRough, yiheIceMask);

  // 冬至 9.0° 金光穿洞与昆明湖金波倒影（柔和暮色冻冰 + 视角对齐显现 + 二次反解 17 孔精确对位）
  if (uSolsticeGlow > 0.005) {
    float gGlow = smoothstep(0.0, 1.0, uSolsticeGlow);
    float duskAtten = mix(0.62, 0.42, uThemeDark);
    diffuseColor.rgb = mix(
      diffuseColor.rgb,
      diffuseColor.rgb * duskAtten + vec3(0.04, 0.06, 0.11),
      gGlow * 0.76
    );

    vec2 lakeViewXZ = normalize(yiheViewDirW.xz + vec2(1e-5));
    vec2 normDir = vec2(-0.8480, 0.5299);
    float lakeAzim = smoothstep(0.64, 0.94, abs(dot(lakeViewXZ, normDir)));
    float lakeElev = 1.0 - smoothstep(0.35, 0.58, yiheViewDirW.y);
    float lakeAngleReveal = lakeAzim * lakeElev;

    // 1. 低斜落日金辉反射廊带（温润暮金）
    vec3 yiheReflSun = reflect(-normalize(uSunDir), yiheWorldWaterN);
    float yiheSpecDot = max(dot(yiheReflSun, yiheViewDirW), 0.0);
    float yiheWaveMod = 0.72 + 0.28 * sin(dot(wp, vec2(-0.848, 0.530)) * 12.0 + uTime * 1.35);
    float yiheSunPath = pow(yiheSpecDot, 16.0) * yiheWaveMod * 0.26 + pow(yiheSpecDot, 56.0) * 0.34;
    float sunPathTint = clamp(yiheSunPath * gGlow * (0.28 + 0.72 * lakeElev), 0.0, 0.72);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 0.74, 0.32) + vec3(0.46, 0.24, 0.03), sunPathTint * 0.75);

    // 2. 十七孔桥局部 17 道金波倒影（|s(k)| = 0.98k - 0.03k² 闭式反解，局部压蓝显金防发灰发白）
    vec2 bOffset = wp - vec2(19.6, 9.8);
    vec2 spanDir = vec2(0.5299, 0.8480);
    float sCoord = dot(bOffset, spanDir);
    float nCoord = dot(bOffset, normDir);
    float spanEnv = smoothstep(6.18, 5.75, abs(sCoord)) * (0.52 + 0.48 * cos(clamp(sCoord / 6.1, -1.0, 1.0) * 1.45));
    float frontDecay = smoothstep(0.28, 0.62, nCoord) * exp(-max(nCoord - 0.58, 0.0) * 1.05);
    float backDecay = smoothstep(-0.28, -0.62, nCoord) * exp(-max(-nCoord - 0.58, 0.0) * 1.0);
    float absS = min(abs(sCoord), 6.08);
    float archIdx = (0.98 - sqrt(max(0.0, 0.9604 - 0.12 * absS))) / 0.06;
    float archBand = pow(0.5 + 0.5 * cos(archIdx * 6.2831853 + sin(nCoord * 5.2 - uTime * 1.0) * 0.18), 3.0);
    float archRefl = spanEnv * (frontDecay * 0.88 + backDecay * 0.96) * archBand * (1.0 - yiheIceDriftSnow * 0.38);
    float archVis = (0.04 + 0.96 * lakeAngleReveal) * (0.58 + 0.42 * yiheFresnel);
    float warmMask = clamp(archRefl * gGlow * archVis * 0.95, 0.0, 0.84);
    diffuseColor.rgb = mix(
      diffuseColor.rgb,
      diffuseColor.rgb * vec3(1.15, 0.68, 0.24) + vec3(0.46, 0.22, 0.02),
      warmMask
    );
    diffuseColor.rgb += vec3(0.42, 0.19, 0.01) * (archRefl * gGlow * archVis * 0.42);
    roughnessFactor = mix(roughnessFactor, 0.18, clamp(warmMask, 0.0, 0.58));
  }
}`;
    }

    if (postNormalInject) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
${postNormalInject}`
      );
    }

    if (foliageTrans) {
      // 柔和的树冠背光透射提亮，消除交叉双面片背光生硬发黑
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
{
  vec3 yiheSunTint = vec3(1.06, 0.99, 0.85);
  float yiheCanopySun = (0.35 + 0.65 * clamp(uSunDir.y * 1.4, 0.0, 1.0)) * (1.0 - uSnowAmount * 0.65);
  reflectedLight.indirectDiffuse += diffuseColor.rgb * yiheSunTint * (0.24 * yiheCanopySun);
}`
      );
    }
  };

  material.needsUpdate = true;

  let customDepthMaterial: THREE.MeshDepthMaterial | undefined;
  if (wind) {
    customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      alphaMap: material.alphaMap ?? undefined,
      alphaTest: material.alphaTest,
      side: material.side,
    });
    // 透传 map 以支持 RGBA 漫反射贴图通道 alphaTest 镂空阴影（P08）
    if (material.map) {
      (customDepthMaterial as THREE.MeshDepthMaterial & { map: THREE.Texture | null }).map = material.map;
    }
    const hasAlpha = material.alphaTest > 0 ? 1 : 0;
    customDepthMaterial.customProgramCacheKey = () =>
      `yihe-depth-w1-a${hasAlpha}-${Math.round(windAmp * 1000)}-${Math.round(windHeightScale * 100)}`;
    customDepthMaterial.onBeforeCompile = (shader) => {
      injectWindVertexChunk(shader, windAmp, windHeightScale);
    };
    if (opts.mesh) {
      opts.mesh.customDepthMaterial = customDepthMaterial;
    }
  }

  return { material, customDepthMaterial };
}
