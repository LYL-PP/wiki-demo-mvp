// 用生产同一条 pdf.js 链路读取 PRD 正文
const fs = require('fs');
const { chromium } = require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const FILE = process.argv[2];
const OUT = process.argv[3] || '.playwright-cli/tmp-prd.txt';

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
      const p = await pdf.getPage(n);
      const c = await p.getTextContent();
      out.push({ page: n, items: c.items.map(it => ({ str: it.str || '', hasEOL: !!it.hasEOL })) });
    }
    return out;
  }, fs.readFileSync(FILE).toString('base64'));
  let text = '';
  for (const { page, items: list } of items) {
    text += `\n<<<PAGE ${page}>>>\n` + wikiJoinPdfItems(list) + '\n';
  }
  fs.writeFileSync(OUT, text, 'utf8');
  console.log('页数', items.length, '字符', text.length, '→', OUT);
  await browser.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
