// 验证「新 index.html + 旧 semantic-tags.js」是否导致页面空白且按钮失效
const {chromium} = require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const https = require('https');

const BASE = 'https://wiki-mvp-lab.app-tencent.workbuddy.host/';

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// 模拟发布前的旧 semantic-tags.js：不含本轮新增的两个导出
function makeStale(source) {
  const before = source;
  const stale = source.replace(
    /Object\.assign\(globalThis,\s*\{[^}]*\}\);/,
    m => m.replace(/clearDerivedSemanticStorage,\s*/, '').replace(/entitySemanticFacets,\s*/, '')
  );
  return {stale, changed: stale !== before};
}

(async () => {
  const live = await fetchText(BASE + 'semantic-tags.js');
  const {stale, changed} = makeStale(live);
  if (!changed) throw Error('未能构造旧版脚本，导出语句未匹配');
  const removed = ['clearDerivedSemanticStorage', 'entitySemanticFacets']
    .filter(name => !new RegExp('globalThis[\\s\\S]{0,400}' + name).test(stale));

  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const out = {};
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await context.route('**/semantic-tags.js', route =>
      route.fulfill({status: 200, contentType: 'application/javascript', body: stale}));

    await page.goto(BASE, {waitUntil: 'domcontentloaded'});
    await page.waitForTimeout(4000);

    out.removedExports = removed;
    out.pageErrors = errors;
    out.functionsMissing = await page.evaluate(() => ({
      entitySemanticFacets: typeof entitySemanticFacets,
      clearDerivedSemanticStorage: typeof clearDerivedSemanticStorage,
      stateAlive: typeof state !== 'undefined'
    }));
    out.dom = await page.evaluate(() => ({
      activePage: document.querySelector('.page.active')?.id || null,
      topicStripLength: document.getElementById('topicStrip')?.innerHTML.length ?? -1,
      knowledgeLength: document.getElementById('knowledgeList')?.innerHTML.length ?? -1,
      navBound: [...document.querySelectorAll('[data-page]')].filter(b => typeof b.onclick === 'function').length,
      navTotal: document.querySelectorAll('[data-page]').length,
      runBound: typeof document.getElementById('runBtn')?.onclick === 'function',
      exportBound: typeof document.getElementById('knowledgeExportBtn')?.onclick === 'function',
      filePickerBound: typeof document.getElementById('fileInput')?.onchange === 'function'
    }));

    // 真实点击导航与运行按钮
    out.clickTest = {};
    try {
      await page.locator('[data-page]').nth(1).click({timeout: 3000});
      out.clickTest.nav = await page.evaluate(() => document.querySelector('.page.active')?.id || null);
    } catch (e) { out.clickTest.nav = 'CLICK_FAILED: ' + e.message.split('\n')[0]; }
    try {
      await page.locator('#knowledgeExportBtn').click({timeout: 3000});
      out.clickTest.export = 'clicked';
    } catch (e) { out.clickTest.export = 'CLICK_FAILED: ' + e.message.split('\n')[0]; }

    out.buttonDead = out.clickTest.nav === 'CLICK_FAILED' || !out.dom.navBound;
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FATAL', e.message); process.exitCode = 1; });
