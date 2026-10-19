'use strict';
// extractPdfText 原来在每个 pdf.js item 后无条件补空格，中文 PDF 的逐字 item 于是变成
// "崩 坏 ： 星 穹 铁 道"。这里锁定 wikiJoinPdfItems 的拼接口径：中文不拆、拉丁/数字分词、
// 标点前不补空格、hasEOL 仍是换行。
const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs=require('fs');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
const html=fs.readFileSync(root+'/wiki-demo-mvp/index.html','utf8');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new(require('vm').Script)(match[1]);
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.abort('blockedbyclient'));await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
 await page.route('https://wiki-mvp-lab.app-tencent.workbuddy.host/**',r=>{const path=new URL(r.request().url()).pathname;if(r.request().method()!=='GET')return r.abort('blockedbyclient');if(path.startsWith('/.cloud/'))return r.fulfill({contentType:'application/json',body:'{"data":[]}'});if(path==='/prompt-history.js')return r.fulfill({contentType:'application/javascript',body:''});for(const n of ['semantic-tags','pipeline','entity-images','file-manager'])if(path==='/'+n+'.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/'+n+'.js','utf8')});return r.fulfill({contentType:'text/html',body:html.replace('<script>wikiPromptHistory.init();init();</script>','<script>initCloud=async()=>{};init();</script>')})});
 await page.goto('https://wiki-mvp-lab.app-tencent.workbuddy.host/');
 const report=await page.evaluate(()=>{
  const tests=[],ok=(test,pass,details)=>tests.push({test,pass:!!pass,details});
  const chars=value=>[...value].map(ch=>({str:ch}));
  const join=items=>wikiJoinPdfItems(items);
  // 1. 中文逐字 item 必须拼回连续文本（本次修的核心）
  ok('中文逐字 item 拼回连续文本',join(chars('崩坏：星穹铁道'))==='崩坏：星穹铁道',join(chars('崩坏：星穹铁道')));
  ok('标题整行还原',join([...chars('崩坏：星穹铁道'),{str:'——'},{str:'2026'},{str:'完整新手攻略',hasEOL:true}])==='崩坏：星穹铁道—— 2026 完整新手攻略\n',join([...chars('崩坏：星穹铁道'),{str:'——'},{str:'2026'},{str:'完整新手攻略',hasEOL:true}]));
  // 2. 拉丁词之间仍要分词（不得退化成连写）
  ok('拉丁词之间保留空格',join([{str:'Roguelite'},{str:'玩法'}])==='Roguelite 玩法',join([{str:'Roguelite'},{str:'玩法'}]));
  ok('数字与中文之间保留空格',join([{str:'228'},{str:'次浏览'}])==='228 次浏览',join([{str:'228'},{str:'次浏览'}]));
  // 3. 标点前不补空格
  ok('中文标点前不补空格',join([...chars('遗器就是你的装备套装'),{str:'，'},...chars('从侵蚀隧洞刷取'),{str:'。'}])==='遗器就是你的装备套装，从侵蚀隧洞刷取。',join([...chars('遗器就是你的装备套装'),{str:'，'},...chars('从侵蚀隧洞刷取'),{str:'。'}]));
  // 4. hasEOL 仍产出换行，且不因拼接规则丢失
  ok('hasEOL 仍是换行',join([{str:'第一行',hasEOL:true},{str:'第二行'}])==='第一行\n第二行',join([{str:'第一行',hasEOL:true},{str:'第二行'}]));
  // 5. item 自带前导空格时不重复补空格
  ok('自带空格不重复补',join([{str:'Hello'},{str:' world'}])==='Hello world',join([{str:'Hello'},{str:' world'}]));
  // 6. 空输入不炸
  ok('空输入返回空串',join([])===''&&join(null)==='',[join([]),join(null)]);
  return tests;
 });
 const passed=report.filter(t=>t.pass).length;
 fs.writeFileSync(root+'/outputs/wiki-pdf-text-spacing-tests.json',JSON.stringify({kind:'mock-browser-regression-not-real-model',passed,failed:report.length-passed,total:report.length,tests:report,pageErrors:errors,modelAttempts:0},null,2));
 console.log('scenarios '+report.length+' passed '+passed+' failed '+(report.length-passed));
 for(const t of report)if(!t.pass)console.error('FAILED '+t.test+' '+JSON.stringify(t.details));
 if(errors.length)console.error('PAGEERROR',errors.join('\n'));
 if(passed!==report.length)process.exitCode=1;
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
