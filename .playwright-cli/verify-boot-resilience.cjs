// 本地验证：新页面 + 旧 semantic-tags.js + 已有数据，是否仍可正常初始化
const {chromium} = require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'wiki-demo-mvp');
const MIME = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css'};

const server = http.createServer((req, res) => {
  const name = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(ROOT, name);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'Content-Type': MIME[path.extname(file)] || 'text/plain'});
  res.end(fs.readFileSync(file));
});

function makeStale(s) {
  return s.replace(/Object\.assign\(globalThis,\s*\{[^}]*\}\);/,
    m => m.replace(/clearDerivedSemanticStorage,\s*/, '').replace(/entitySemanticFacets,\s*/, ''));
}

const seed = () => {
  const product = '燕云十六声';
  const entity = (id, name, topic) => ({
    id, name, primaryTopic: topic, topics: [topic], summary: '测试',
    tags: {type: ['道具'], typeId: 'ET-ITEM-PROP'}, aliases: [], facts: [], relations: [],
    identityAnchors: {ontologyType: '虚构对象', realityDomain: '虚构', productIpScope: product},
    sources: [{file: product + '.pdf', fileId: 'F1', revision: 1, quote: name + '是道具', start: 0, end: 6}],
    fileContributions: []
  });
  const topics = [0, 1].map(i => ({
    id: 'PT-' + i, name: product + '的玩法' + i, desc: 'd', scope: 's',
    object_anchor: product, core_question: 'c', includes: [], excludes: [], quote: 'q', evidences: [], sources: []
  }));
  const entities = [];
  for (let i = 0; i < 30; i++) entities.push(entity('EN-' + i, '佛光玉' + i, 'PT-' + (i % 2)));
  localStorage.setItem('wiki_preview_v1_topics', JSON.stringify(topics));
  localStorage.setItem('wiki_preview_v1_previews', JSON.stringify(entities));
};

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const stale = makeStale(fs.readFileSync(path.join(ROOT, 'semantic-tags.js'), 'utf8'));
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const out = {};
  try {
    for (const mode of ['current-js', 'stale-js']) {
      const context = await browser.newContext();
      await context.addInitScript(seed);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      if (mode === 'stale-js') {
        await context.route('**/semantic-tags.js*', r =>
          r.fulfill({status: 200, contentType: 'application/javascript', body: stale}));
      }
      await page.goto(base, {waitUntil: 'domcontentloaded'});
      await page.waitForTimeout(3500);
      out[mode] = {
        pageErrors: errors,
        entities: await page.evaluate(() => (typeof state === 'undefined' ? null : state.previews.length)),
        knowledgeHtml: await page.evaluate(() => document.getElementById('knowledgeList')?.innerHTML.length ?? -1),
        topicStrip: await page.evaluate(() => document.getElementById('topicStrip')?.innerHTML.length ?? -1),
        navBound: await page.evaluate(() => [...document.querySelectorAll('[data-page]')].filter(b => typeof b.onclick === 'function').length),
        navTotal: await page.evaluate(() => document.querySelectorAll('[data-page]').length),
        runBound: await page.evaluate(() => typeof document.getElementById('runBtn')?.onclick === 'function'),
        pickerBound: await page.evaluate(() => typeof document.getElementById('fileInput')?.onchange === 'function'),
        bannerVisible: await page.evaluate(() => { const b = document.getElementById('bootErrors'); return b ? !b.hidden : null; }),
        bannerText: await page.evaluate(() => document.getElementById('bootErrors')?.textContent?.slice(0, 120) || '')
      };
      // 真实点击导航
      try {
        await page.locator('[data-page]').nth(1).click({timeout: 3000});
        out[mode].navAfterClick = await page.evaluate(() => document.querySelector('.page.active')?.id || null);
      } catch (e) { out[mode].navAfterClick = 'CLICK_FAILED'; }
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FATAL', e.message); process.exitCode = 1; server.close(); });
