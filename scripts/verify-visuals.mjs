import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const artifactsDir = path.join(projectRoot, 'artifacts');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const ALL_CAMS = [
  {
    id: 'Cam-1',
    pos: [24.0, 29.5, 43.0],
    target: [0.0, 1.8, -2.0],
    preset: 'spring',
    theme: 'xuan-light',
    spotId: 'overview',
    showPoi: true,
    weatherPanelOpen: false,
    audioPanelOpen: false,
    frozenTime: 2.0,
  },
  {
    id: 'Cam-2',
    pos: [4.2, 3.6, -2.5],
    target: [0.0, 1.4, -7.8],
    preset: 'spring',
    theme: 'xuan-light',
    spotId: 'paiyunPier',
    showPoi: false,
    frozenTime: 2.0,
  },
  {
    id: 'Cam-3',
    pos: [8.8, 13.6, -3.2],
    target: [0.0, 9.2, -13.6],
    preset: 'summer',
    theme: 'xuan-light',
    spotId: 'foxiangge',
    showPoi: true,
    frozenTime: 4.0,
  },
  {
    id: 'Cam-4',
    pos: [24.0, 29.5, 43.0],
    target: [0.0, 1.8, -2.0],
    season: 'autumn',
    weather: 'snow',
    weatherIntensity: 0.85,
    temperatureC: -1.0,
    theme: 'xuan-light',
    spotId: 'overview',
    weatherPanelOpen: true,
    showPoi: true,
    frozenTime: 6.0,
  },
  {
    id: 'Cam-5',
    pos: [-18.0, 22.0, 32.0],
    target: [0.0, 3.2, -8.0],
    preset: 'winter',
    theme: 'xuan-light',
    spotId: 'overview',
    showPoi: true,
    frozenTime: 8.0,
  },
  {
    id: 'Cam-6',
    pos: [6.2, 6.8, 20.5],
    target: [19.6, 0.7, 9.8],
    preset: 'solstice',
    theme: 'ink-gold',
    spotId: 'seventeenArch',
    weatherPanelOpen: false,
    showPoi: true,
    frozenTime: 10.0,
  },
  {
    id: 'Cam-6-Side',
    pos: [27.5, 11.5, 22.8],
    target: [19.6, 0.7, 9.8],
    preset: 'solstice',
    theme: 'ink-gold',
    spotId: 'seventeenArch',
    weatherPanelOpen: false,
    showPoi: true,
    frozenTime: 10.0,
  },
  {
    id: 'Cam-Rain',
    pos: [24.0, 29.5, 43.0],
    target: [0.0, 1.8, -2.0],
    preset: 'rain',
    theme: 'xuan-light',
    spotId: 'overview',
    audioPanelOpen: true,
    showPoi: true,
    frozenTime: 3.5,
  },
];

function parseCliArgs() {
  const args = process.argv.slice(2);
  let milestone = 'm1';
  let maxDrawCalls = 14;
  let camIds = ['Cam-1', 'Cam-2'];
  const hasCamsArg = args.some((a) => a.startsWith('--cams='));
  const hasMaxDcArg = args.some((a) => a.startsWith('--max-draw-calls='));

  for (const a of args) {
    if (a.startsWith('--milestone=')) {
      milestone = a.split('=')[1];
    } else if (a.startsWith('--cams=')) {
      camIds = a.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith('--max-draw-calls=')) {
      maxDrawCalls = Number(a.split('=')[1]);
    }
  }

  if (milestone === 'm2') {
    if (!hasCamsArg) camIds = ['Cam-1', 'Cam-2', 'Cam-3', 'Cam-4'];
    if (!hasMaxDcArg) maxDrawCalls = 58;
  } else if (milestone === 'm3') {
    if (!hasCamsArg) camIds = ['Cam-1', 'Cam-3', 'Cam-4', 'Cam-5'];
    if (!hasMaxDcArg) maxDrawCalls = 74;
  } else if (milestone === 'm4') {
    if (!hasCamsArg) camIds = ['Cam-1', 'Cam-3', 'Cam-4', 'Cam-5', 'Cam-Rain', 'Cam-6'];
    if (!hasMaxDcArg) maxDrawCalls = 74;
  } else if (milestone === 'm5') {
    if (!hasCamsArg) camIds = ['Cam-1', 'Cam-2', 'Cam-3', 'Cam-4', 'Cam-5', 'Cam-6', 'Cam-6-Side', 'Cam-Rain'];
    if (!hasMaxDcArg) maxDrawCalls = 75;
  }
  return { milestone, maxDrawCalls, camIds };
}

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqUrl = (req.url || '/').split('?')[0];
      const rel = reqUrl === '/' ? 'index.html' : reqUrl.replace(/^\/+/, '');
      const filePath = path.resolve(rootDir, rel);
      if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
      fs.createReadStream(filePath).pipe(res);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, url: `http://127.0.0.1:${addr.port}/` });
    });
  });
}

async function launchBrowser() {
  const webglArgs = [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
  ];

  const attempts = [
    { label: 'Playwright Chromium', options: { headless: true, args: webglArgs } },
    { label: 'System Chrome', options: { headless: true, channel: 'chrome', args: webglArgs } },
    {
      label: 'Chrome Executable',
      options: {
        headless: true,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: webglArgs,
      },
    },
    { label: 'System Edge', options: { headless: true, channel: 'msedge', args: webglArgs } },
  ];

  let lastErr = null;
  for (const attempt of attempts) {
    try {
      if (attempt.options.executablePath && !fs.existsSync(attempt.options.executablePath)) {
        continue;
      }
      const browser = await chromium.launch(attempt.options);
      console.log(`[verify] Launched browser via: ${attempt.label}`);
      return browser;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('Unable to launch Chromium/Chrome/Edge with WebGL');
}

async function main() {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    console.error(`[verify] Missing ${path.join(distDir, 'index.html')}. Run "npm run build" first.`);
    process.exit(1);
  }

  fs.mkdirSync(artifactsDir, { recursive: true });
  const { milestone, maxDrawCalls, camIds } = parseCliArgs();
  const targetCams = ALL_CAMS.filter((c) => camIds.includes(c.id));
  if (targetCams.length === 0) {
    console.error(`[verify] No matching camera specs for: ${camIds.join(', ')}`);
    process.exit(1);
  }

  const { server, url } = await startStaticServer(distDir);
  let browser = null;

  try {
    browser = await launchBrowser();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    const errors = [];
    page.on('pageerror', (err) => {
      errors.push(`[pageerror] ${err.message}`);
    });
    page.on('requestfailed', (req) => {
      errors.push(`[requestfailed] ${req.url()} -> ${req.failure()?.errorText || 'unknown'}`);
    });
    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') {
        errors.push(`[console.error] ${text}`);
      } else if (
        type === 'warning' &&
        !text.includes('GPU stall due to ReadPixels') &&
        /(shader error|glsl|program info log|three\.webglprogram|gl_invalid|webgl context|compile|link error)/i.test(
          text
        )
      ) {
        errors.push(`[console.webgl-warn] ${text}`);
      }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.__YIHE_READY__ === true, { timeout: 30000 });

    // E2E 交互断言 1：点击「冬雪」后切换「春色」绝不能残留雪景与低温
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#hud-root button'));
      const winterBtn = btns.find((b) => (b.textContent || '').trim() === '冬雪');
      winterBtn?.click();
    });
    const winterState = await page.evaluate(() => window.__YIHE_DEBUG__.getAppState());
    if (
      winterState.season !== 'winter' ||
      winterState.weather !== 'snow' ||
      winterState.snowAmount <= 0.5 ||
      winterState.iceFactor <= 0.5
    ) {
      errors.push(
        `[e2e] Expected winter snow state after clicking 冬雪, got ${JSON.stringify({
          season: winterState.season,
          weather: winterState.weather,
          snowAmount: winterState.snowAmount,
          iceFactor: winterState.iceFactor,
        })}`
      );
    }

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#hud-root button'));
      const springBtn = btns.find((b) => (b.textContent || '').trim() === '春色');
      springBtn?.click();
    });
    const springResetState = await page.evaluate(() => window.__YIHE_DEBUG__.getAppState());
    if (
      springResetState.season !== 'spring' ||
      springResetState.weather !== 'clear' ||
      springResetState.snowAmount !== 0 ||
      springResetState.iceFactor !== 0
    ) {
      errors.push(
        `[e2e] Expected clear unfrozen spring after leaving 冬雪, got ${JSON.stringify({
          season: springResetState.season,
          weather: springResetState.weather,
          snowAmount: springResetState.snowAmount,
          iceFactor: springResetState.iceFactor,
        })}`
      );
    }

    // E2E 交互断言 2：昼夜与四季自动流转开关可真实推进并在点击后暂停（按 rAF 帧推进确保兼容软件渲染帧率）
    const beforeCycle = await page.evaluate(() => window.__YIHE_DEBUG__.getAppState());
    await page.click('.hud-cycle-btn');
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 0;
          const step = () => {
            frames++;
            if (frames >= 4) resolve();
            else requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        })
    );
    const duringCycle = await page.evaluate(() => window.__YIHE_DEBUG__.getAppState());
    await page.click('.hud-cycle-btn');
    const afterPause = await page.evaluate(() => window.__YIHE_DEBUG__.getAppState());

    if (
      !duringCycle.autoCycleEnabled ||
      duringCycle.timeHour === beforeCycle.timeHour ||
      duringCycle.seasonProgress === beforeCycle.seasonProgress
    ) {
      errors.push(
        `[e2e] Auto-cycle did not advance smoothly: before=(${beforeCycle.timeHour.toFixed(3)}, ${beforeCycle.seasonProgress.toFixed(4)}) during=(${duringCycle.timeHour.toFixed(3)}, ${duringCycle.seasonProgress.toFixed(4)})`
      );
    }
    if (afterPause.autoCycleEnabled) {
      errors.push('[e2e] Auto-cycle did not pause on second click');
    }

    // E2E 交互断言 3：冬至金光进入/退出时必须同步切换并清理暗墨主题与时辰，禁止卡死在暗墨状态
    await page.click('.hud-weather-trigger');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#hud-root button'));
      const solsticeBtn = btns.find((b) => (b.textContent || '').trim() === '冬至金光');
      solsticeBtn?.click();
    });
    const solsticeEnterState = await page.evaluate(() => window.__YIHE_DEBUG__.getAppState());
    if (
      !solsticeEnterState.solsticeMode ||
      solsticeEnterState.season !== 'winter' ||
      solsticeEnterState.theme !== 'ink-gold' ||
      solsticeEnterState.timeOfDay !== 'night'
    ) {
      errors.push(
        `[e2e] Expected winter+ink-gold+night after clicking 冬至金光, got ${JSON.stringify({
          solsticeMode: solsticeEnterState.solsticeMode,
          season: solsticeEnterState.season,
          theme: solsticeEnterState.theme,
          timeOfDay: solsticeEnterState.timeOfDay,
        })}`
      );
    }

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#hud-root button'));
      const sunnyBtn = btns.find((b) => (b.textContent || '').trim() === '放晴');
      sunnyBtn?.click();
    });
    const solsticeExitClearState = await page.evaluate(() => window.__YIHE_DEBUG__.getAppState());
    if (
      solsticeExitClearState.solsticeMode ||
      solsticeExitClearState.theme !== 'xuan-light' ||
      solsticeExitClearState.timeOfDay !== 'afternoon' ||
      solsticeExitClearState.weather !== 'clear'
    ) {
      errors.push(
        `[e2e] Expected xuan-light+afternoon+clear after 冬至金光->放晴, got ${JSON.stringify({
          solsticeMode: solsticeExitClearState.solsticeMode,
          theme: solsticeExitClearState.theme,
          timeOfDay: solsticeExitClearState.timeOfDay,
          weather: solsticeExitClearState.weather,
        })}`
      );
    }

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#hud-root button'));
      const solsticeBtn = btns.find((b) => (b.textContent || '').trim() === '冬至金光');
      const springBtn = btns.find((b) => (b.textContent || '').trim() === '春色');
      solsticeBtn?.click();
      springBtn?.click();
    });
    const solsticeExitSpringState = await page.evaluate(() => window.__YIHE_DEBUG__.getAppState());
    if (
      solsticeExitSpringState.solsticeMode ||
      solsticeExitSpringState.season !== 'spring' ||
      solsticeExitSpringState.theme !== 'xuan-light' ||
      solsticeExitSpringState.timeOfDay !== 'afternoon' ||
      solsticeExitSpringState.snowAmount !== 0 ||
      solsticeExitSpringState.iceFactor !== 0
    ) {
      errors.push(
        `[e2e] Expected spring+xuan-light+afternoon+clear after 冬至金光->春色, got ${JSON.stringify({
          solsticeMode: solsticeExitSpringState.solsticeMode,
          season: solsticeExitSpringState.season,
          theme: solsticeExitSpringState.theme,
          timeOfDay: solsticeExitSpringState.timeOfDay,
          snowAmount: solsticeExitSpringState.snowAmount,
          iceFactor: solsticeExitSpringState.iceFactor,
        })}`
      );
    }
    await page.click('.hud-weather-trigger');

    console.log(
      `[verify] E2E passed: winter->spring clear (snow=${springResetState.snowAmount}, ice=${springResetState.iceFactor}), autoCycle delta=(+${((duringCycle.timeHour - beforeCycle.timeHour + 24) % 24).toFixed(2)}h, +${(duringCycle.seasonProgress - beforeCycle.seasonProgress).toFixed(4)}季), solstice->放晴/春色 clean exit`
    );

    for (const cam of targetCams) {
      const stats = await page.evaluate(async (spec) => {
        return await window.__YIHE_DEBUG__.captureView({
          pos: spec.pos,
          target: spec.target,
          preset: spec.preset,
          season: spec.season,
          weather: spec.weather,
          weatherIntensity: spec.weatherIntensity,
          temperatureC: spec.temperatureC,
          theme: spec.theme,
          spotId: spec.spotId,
          weatherPanelOpen: spec.weatherPanelOpen,
          audioPanelOpen: spec.audioPanelOpen,
          showPoi: spec.showPoi,
          frozenTime: spec.frozenTime,
        });
      }, cam);

      const uiCheck = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('#hud-root button'));
        const hasForbiddenButtons = btns.some((b) => {
          const t = (b.textContent || '').trim();
          return t === '旋转' || t === '平移';
        });
        const visiblePoiCount = document.querySelectorAll('.poi-pin:not(.is-hidden)').length;
        return { hasForbiddenButtons, visiblePoiCount };
      });
      if (uiCheck.hasForbiddenButtons) {
        errors.push(`[gate] ${cam.id} found forbidden 旋转/平移 button in HUD`);
      }
      if (cam.showPoi && cam.id === 'Cam-1' && uiCheck.visiblePoiCount < 3) {
        errors.push(`[gate] ${cam.id} visiblePoiCount=${uiCheck.visiblePoiCount} < 3`);
      }

      const outPath = path.join(artifactsDir, `${milestone}-${cam.id}.png`);
      await page.screenshot({ path: outPath, animations: 'disabled', timeout: 60000 });
      console.log(
        `[verify] Captured ${cam.id} -> ${outPath} | sceneDrawCalls=${stats.sceneDrawCalls}, renderPassCalls=${stats.renderPassCalls}, triangles=${stats.triangles}, steps=${stats.stepsCount}, trees=${stats.treesCount ?? 0}`
      );

      if (stats.sceneDrawCalls > maxDrawCalls) {
        errors.push(
          `[gate] ${cam.id} sceneDrawCalls=${stats.sceneDrawCalls} exceeds limit <= ${maxDrawCalls}`
        );
      }
      if (stats.stepsCount !== 420) {
        errors.push(`[gate] ${cam.id} stepsCount=${stats.stepsCount} !== 420`);
      }
      if (['m3', 'm4', 'm5'].includes(milestone) && (stats.treesCount ?? 0) < 1900) {
        errors.push(`[gate] ${cam.id} treesCount=${stats.treesCount} < 1900`);
      }
      if (milestone === 'm5' && cam.id === 'Cam-6') {
        if (stats.archAnchorsCount !== 17) {
          errors.push(`[gate] Cam-6 archAnchorsCount=${stats.archAnchorsCount} !== 17`);
        }
        if (!stats.solsticeBeamsVisible) {
          errors.push('[gate] Cam-6 solsticeBeamsVisible must be true');
        }
      }
    }

    if (errors.length > 0) {
      console.error('[verify] FAILED with errors:');
      for (const e of errors) console.error('  ' + e);
      process.exit(1);
    }

    console.log(`[verify] PASSED all ${targetCams.length} visual gates with 0 errors!`);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error('[verify] Fatal error:', err);
  process.exit(1);
});
