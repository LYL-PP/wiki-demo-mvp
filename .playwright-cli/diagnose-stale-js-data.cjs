// 旧 semantic-tags.js + 已有知识数据：是否会抛错并中断初始化
const {chromium} = require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const https = require('https');
const BASE = 'https://wiki-mvp-lab.app-tencent.workbuddy.host/';

function fetchText(url){return new Promise((res,rej)=>{https.get(url,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d))}).on('error',rej)})}
function makeStale(s){return s.replace(/Object\.assign\(globalThis,\s*\{[^}]*\}\);/,m=>m.replace(/clearDerivedSemanticStorage,\s*/,'').replace(/entitySemanticFacets,\s*/,''))}

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
  const live = await fetchText(BASE + 'semantic-tags.js');
  const stale = makeStale(live);
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
        await context.route('**/semantic-tags.js', r =>
          r.fulfill({status: 200, contentType: 'application/javascript', body: stale}));
      }
      await page.goto(BASE, {waitUntil: 'domcontentloaded'});
      await page.waitForTimeout(4000);
      out[mode] = {
        pageErrors: errors,
        entities: await page.evaluate(() => (typeof state === 'undefined' ? null : state.previews.length)),
        topics: await page.evaluate(() => (typeof state === 'undefined' ? null : state.previewTopics.length)),
        knowledgeHtml: await page.evaluate(() => document.getElementById('knowledgeList')?.innerHTML.length ?? -1),
        topicStrip: await page.evaluate(() => document.getElementById('topicStrip')?.innerHTML.length ?? -1),
        navBound: await page.evaluate(() => [...document.querySelectorAll('[data-page]')].filter(b => typeof b.onclick === 'function').length),
        runBound: await page.evaluate(() => typeof document.getElementById('runBtn')?.onclick === 'function'),
        pickerBound: await page.evaluate(() => typeof document.getElementById('fileInput')?.onchange === 'function')
      };
      await context.close();
    }
  } finally { await browser.close(); }
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FATAL', e.message); process.exitCode = 1; });
