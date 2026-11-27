import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import type { ThemeId } from '../config/sceneConfig';
import { APP_STATE } from '../config/stateStore';

export interface RenderPipeline {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  gtaoPass: GTAOPass;
  envTextures: Record<ThemeId, THREE.Texture>;
  lastRenderPassCalls: number;
  lastTriangles: number;
  requestShadowUpdate: () => void;
  resize: (width: number, height: number) => void;
  renderFrame: (scene: THREE.Scene, camera: THREE.Camera) => void;
  setThemeEnvironment: (scene: THREE.Scene, theme: ThemeId) => void;
  dispose: () => void;
}

function buildThemeEnvironment(
  pmrem: THREE.PMREMGenerator,
  theme: ThemeId
): THREE.Texture {
  const envScene = new THREE.Scene();

  // 使用纯色球穹顶与四面棚拍柔光软箱烘焙新中式温润天光环境反射
  const domeGeo = new THREE.SphereGeometry(20, 32, 16);
  const pos = domeGeo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const cTop = new THREE.Color(theme === 'xuan-light' ? 0xfaf8f2 : 0x202a3b);
  const cMid = new THREE.Color(theme === 'xuan-light' ? 0xebeae2 : 0x151c27);
  const cBot = new THREE.Color(theme === 'xuan-light' ? 0xb4afa0 : 0x0c0f15);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const ny = pos.getY(i) / 20;
    if (ny >= 0) {
      tmp.copy(cMid).lerp(cTop, Math.pow(ny, 0.75));
    } else {
      tmp.copy(cMid).lerp(cBot, Math.pow(-ny, 0.65));
    }
    cols[i * 3] = tmp.r;
    cols[i * 3 + 1] = tmp.g;
    cols[i * 3 + 2] = tmp.b;
  }
  domeGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const domeMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
  });
  envScene.add(new THREE.Mesh(domeGeo, domeMat));

  const addSoftbox = (
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
    color: THREE.Color
  ): { geo: THREE.BufferGeometry; mat: THREE.Material } => {
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const panel = new THREE.Mesh(geo, mat);
    panel.position.set(x, y, z);
    panel.lookAt(0, 0, 0);
    envScene.add(panel);
    return { geo, mat };
  };

  const panels = [
    // 顶部大面积暖白柔光箱（赋予亭台琉璃与湖面奶润均匀光泽，微偏中心保证 lookAt 切线稳健）
    addSoftbox(
      24,
      18,
      0.01,
      14,
      0.01,
      theme === 'xuan-light' ? new THREE.Color(1.85, 1.82, 1.72) : new THREE.Color(0.95, 1.05, 1.25)
    ),
    // 主暖柔光软箱（西南斜侧）
    addSoftbox(
      16,
      12,
      -13,
      10,
      11,
      theme === 'xuan-light' ? new THREE.Color(2.65, 2.52, 2.25) : new THREE.Color(2.1, 1.7, 1.15)
    ),
    // 冷青轮廓补光面片（东北方）
    addSoftbox(
      18,
      9,
      13,
      8,
      -11,
      theme === 'xuan-light' ? new THREE.Color(1.55, 1.74, 1.8) : new THREE.Color(0.9, 1.15, 1.5)
    ),
    // 底部温润展台桌面反射片（柔和提亮檐底斗拱暗部）
    addSoftbox(
      22,
      18,
      0,
      -9,
      2,
      theme === 'xuan-light' ? new THREE.Color(0.92, 0.88, 0.78) : new THREE.Color(0.38, 0.34, 0.3)
    ),
  ];

  const rt = pmrem.fromScene(envScene, 0.04);
  domeGeo.dispose();
  domeMat.dispose();
  for (const p of panels) {
    p.geo.dispose();
    p.mat.dispose();
  }
  return rt.texture;
}

/** 精确统计场景中可见网格与实例化网格占据的 DrawCall 数与三角面数 */
export function countSceneMetrics(scene: THREE.Scene): { sceneDrawCalls: number; triangles: number } {
  let sceneDrawCalls = 0;
  let triangles = 0;
  scene.traverse((obj) => {
    if (!obj.visible) return;
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      const mat = mesh.material;
      const groups = mesh.geometry.groups;
      const callsForMesh = Array.isArray(mat) && groups.length > 0 ? groups.length : 1;
      sceneDrawCalls += callsForMesh;

      const geo = mesh.geometry;
      const baseTris = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
      const count = (mesh as THREE.InstancedMesh).isInstancedMesh
        ? (mesh as THREE.InstancedMesh).count
        : 1;
      triangles += Math.round(baseTris * count);
    }
  });
  return { sceneDrawCalls, triangles };
}

export function createRenderPipeline(
  container: HTMLElement,
  scene: THREE.Scene,
  camera: THREE.Camera
): RenderPipeline {
  // 离屏 EffectComposer 已启用 samples:4 MSAA，画布主缓冲关闭冗余抗锯齿以节省显存解析带宽
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance',
  });

  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose();
    throw new Error('WebGL2 is required for MSAA EffectComposer + GTAOPass pipeline');
  }

  const getClampedDpr = () => Math.min(window.devicePixelRatio || 1, 1.5);
  const width = Math.max(container.clientWidth, 1);
  const height = Math.max(container.clientHeight, 1);
  const pixelRatio = getClampedDpr();

  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  container.appendChild(renderer.domElement);

  // PMREMGenerator 烘焙双主题 IBL 环境贴图
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envTextures: Record<ThemeId, THREE.Texture> = {
    'xuan-light': buildThemeEnvironment(pmrem, 'xuan-light'),
    'ink-gold': buildThemeEnvironment(pmrem, 'ink-gold'),
  };
  pmrem.dispose();
  scene.environment = envTextures[APP_STATE.theme];

  // WebGL2 MSAA RenderTarget (samples: 4)，构造后先调用 setSize(width, height) 锁定逻辑尺寸防止 pixelRatio² 瞬时倍增
  const samples = Math.min(4, renderer.capabilities.maxSamples || 0);
  const renderTarget = new THREE.WebGLRenderTarget(
    Math.max(1, Math.floor(width * pixelRatio)),
    Math.max(1, Math.floor(height * pixelRatio)),
    {
      type: THREE.HalfFloatType,
      samples,
    }
  );

  const composer = new EffectComposer(renderer, renderTarget);
  composer.setSize(width, height);

  const pipeline: RenderPipeline = {
    renderer,
    composer,
    gtaoPass: null as unknown as GTAOPass,
    envTextures,
    lastRenderPassCalls: 0,
    lastTriangles: 0,
    requestShadowUpdate: () => {
      renderer.shadowMap.needsUpdate = true;
    },
    resize: () => {},
    renderFrame: () => {},
    setThemeEnvironment: (s, theme) => {
      s.environment = envTextures[theme];
    },
    dispose: () => {},
  };

  // 1. RenderPass（包装 render 以精确捕获主场景 DrawCall，不被后续全屏 Pass 混淆）
  const renderPass = new RenderPass(scene, camera);
  const origRenderPassRender = renderPass.render.bind(renderPass);
  renderPass.render = (r, writeBuffer, readBuffer, deltaTime, maskActive) => {
    origRenderPassRender(r, writeBuffer, readBuffer, deltaTime, maskActive);
    pipeline.lastRenderPassCalls = r.info.render.calls;
    pipeline.lastTriangles = r.info.render.triangles;
  };
  composer.addPass(renderPass);

  // 2. GTAOPass（半分辨率运行，缓存排除列表跳过细树枝/望柱/透明/透空材质，零每帧全树遍历与 AO 污染）
  const gtaoPass = new GTAOPass(
    scene,
    camera,
    Math.max(1, Math.floor(width * pixelRatio * 0.5)),
    Math.max(1, Math.floor(height * pixelRatio * 0.5))
  );
  gtaoPass.output = GTAOPass.OUTPUT.Default;
  gtaoPass.blendIntensity = 0.56;
  gtaoPass.updateGtaoMaterial({
    radius: 0.58,
    distanceExponent: 1.75,
    thickness: 0.9,
    scale: 1.0,
    samples: 8,
    distanceFallOff: 1.0,
  });
  gtaoPass.updatePdMaterial({
    lumaPhi: 10.0,
    depthPhi: 2.0,
    normalPhi: 3.0,
    radius: 6.0,
    rings: 2,
    samples: 8,
  });

  let cachedAoSceneCount = -1;
  let aoExcludedObjs: THREE.Object3D[] = [];
  let aoSavedVis = new Uint8Array(0);
  let savedSceneBackground: THREE.Color | THREE.Texture | THREE.CubeTexture | null = null;

  const rebuildAoCache = () => {
    aoExcludedObjs = [];
    scene.traverse((obj) => {
      if (obj instanceof THREE.Points || obj instanceof THREE.Line) {
        aoExcludedObjs.push(obj);
        return;
      }
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        if (
          mesh.userData.excludeFromAO ||
          (mat && (mat.transparent || mat.depthWrite === false || mat.alphaTest > 0))
        ) {
          aoExcludedObjs.push(mesh);
        }
      }
    });
    aoSavedVis = new Uint8Array(aoExcludedObjs.length);
    cachedAoSceneCount = scene.children.length;
  };

  gtaoPass.overrideVisibility = () => {
    // 关键防穿帮：当 scene.background 为 Texture 时，Three.js r170 会在原点(0,0,0)绘制无 normal 属性的 PlaneGeometry(2,2)，
    // 若不在 GTAOPass.renderOverride 期间临时置空 background，会被 overrideMaterial 误染为居中黑框！
    savedSceneBackground = scene.background;
    scene.background = null;
    if (cachedAoSceneCount !== scene.children.length) {
      rebuildAoCache();
    }
    for (let i = 0; i < aoExcludedObjs.length; i++) {
      const obj = aoExcludedObjs[i];
      aoSavedVis[i] = obj.visible ? 1 : 0;
      obj.visible = false;
    }
  };

  gtaoPass.restoreVisibility = () => {
    scene.background = savedSceneBackground;
    for (let i = 0; i < aoExcludedObjs.length; i++) {
      aoExcludedObjs[i].visible = aoSavedVis[i] === 1;
    }
  };

  const baseGtaoSetSize = gtaoPass.setSize.bind(gtaoPass);
  gtaoPass.setSize = (w: number, h: number) => {
    baseGtaoSetSize(Math.max(1, Math.floor(w * 0.5)), Math.max(1, Math.floor(h * 0.5)));
  };

  composer.addPass(gtaoPass);
  pipeline.gtaoPass = gtaoPass;

  // 3. OutputPass（强制执行 ACESFilmicToneMapping + sRGB 输出转换）
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  pipeline.resize = (newW: number, newH: number) => {
    const safeW = Math.max(1, newW);
    const safeH = Math.max(1, newH);
    const pr = getClampedDpr();
    renderer.setPixelRatio(pr);
    renderer.setSize(safeW, safeH);
    composer.setSize(safeW, safeH);
    composer.setPixelRatio(pr);
  };

  pipeline.renderFrame = (sc: THREE.Scene, cam: THREE.Camera) => {
    if (APP_STATE.powerSave) {
      renderer.render(sc, cam);
      pipeline.lastRenderPassCalls = renderer.info.render.calls;
      pipeline.lastTriangles = renderer.info.render.triangles;
      return;
    }
    gtaoPass.enabled = APP_STATE.gtaoEnabled;
    composer.render();
  };

  pipeline.dispose = () => {
    composer.dispose();
    renderTarget.dispose();
    envTextures['xuan-light'].dispose();
    envTextures['ink-gold'].dispose();
    renderer.dispose();
  };

  return pipeline;
}
