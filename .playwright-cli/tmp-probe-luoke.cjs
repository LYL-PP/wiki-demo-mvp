// 复现线上 PDF 正文，检查 火花 / 喵喵 / 水蓝蓝 在原文中的真实形态
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');

const FILE = 'C:/Users/louisxzlu/Downloads/游戏攻略--测试集/【开荒必看】《洛克王国：世界》保姆级新手入门攻略 - 洛克王国：世界游戏攻略 - TapTap 洛克王国：世界论坛.pdf';
const NAMES = ['火花', '喵喵', '水蓝蓝', '水灵', '洛克王国'];

function wikiJoinPdfItems(items) {
  let out = '';
  for (const item of items || []) {
    const text = item?.str || '', prev = out.slice(-1), next = text.slice(0, 1);
    if (out && next && !/\s/.test(prev) && !/\s/.test(next) &&
      (/[A-Za-z0-9]/.test(prev) || /[A-Za-z0-9]/.test(next)) &&
      !/^[，。、；：！？）》」』…·,.;:!?)\]]/.test(next)) out += ' ';
    out += text + (item?.hasEOL ? '\n' : '');
  }
  return out;
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.goto('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js');
  await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js' });
  const items = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const out = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      for (const it of content.items) out.push({ str: it.str || '', hasEOL: !!it.hasEOL });
    }
    return out;
  }, fs.readFileSync(FILE).toString('base64'));

  const joined = wikiJoinPdfItems(items);
  const rawJoin = items.map(i => (i.str || '') + (i.hasEOL ? '\n' : '')).join('');
  console.log('页数 items:', items.length, '| 拼接后长度:', joined.length, '| 无空格拼接长度:', rawJoin.length);

  for (const name of NAMES) {
    const hits = [];
    let at = joined.indexOf(name);
    while (at >= 0) { hits.push(at); at = joined.indexOf(name, at + 1); }
    console.log(`\n【${name}】出现 ${hits.length} 次`);
    for (const pos of hits.slice(0, 6)) {
      console.log('  @' + pos + ': …' + JSON.stringify(joined.slice(Math.max(0, pos - 60), pos + 60)) + '…');
    }
  }
  fs.writeFileSync(path.join(__dirname, 'tmp-luoke-source.txt'), joined, 'utf8');
  console.log('\n原文已写入 .playwright-cli/tmp-luoke-source.txt');
  await browser.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
