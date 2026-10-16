'use strict';
// 线上核验：本次发布的五个资源与本地逐字节一致，且两版对比导出按钮与函数可用（不调用模型）。
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const ROOT='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25',APP=path.join(ROOT,'wiki-demo-mvp'),OUT=path.join(ROOT,'outputs');
const BASE='https://wiki-mvp-lab.app-tencent.workbuddy.host/';
const assets=['index.html','semantic-tags.js','pipeline.js','file-manager.js','prompt-history.js'];
const report={url:BASE,startedAt:new Date().toISOString(),checks:[],pageErrors:[],modelRequests:0,status:'running'};
const ok=(label,pass,detail)=>{report.checks.push({label,pass:!!pass,detail:detail??null});if(!pass)report.status='failed';};
(async()=>{
try{
  const fetched={};
  for(const name of assets){
    const url=BASE+(name==='index.html'?'':name+'?v=20261016b');
    const res=await fetch(url,{cache:'no-store'});const body=Buffer.from(await res.arrayBuffer());
    fetched[name]=body;const local=fs.readFileSync(path.join(APP,name));
    ok('线上 '+name+' 与本地一致（'+body.length+' 字节）',res.ok&&body.equals(local),{http:res.status});
  }
  const html=fetched['index.html'].toString('utf8');
  ok('线上含导出按钮 exportCompareBtn / exportCompareJsonBtn',html.includes('id="exportCompareBtn"')&&html.includes('id="exportCompareJsonBtn"'));
  ok('线上含 compareExportSnapshot / compareExportPayload',html.includes('function compareExportSnapshot()')&&html.includes('function compareExportPayload()'));
  ok('线上版本戳 v=20261016b',(html.match(/v=20261016b/g)||[]).length===4,(html.match(/v=20261016b/g)||[]).length);
  const browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
  page.on('request',r=>{if(/chat\/completions|llm\//.test(r.url()))report.modelRequests++;});
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof compareExportSnapshot==='function'&&typeof exportCompareJson==='function',null,{timeout:20000});
  const ui=await page.evaluate(()=>({excel:!!document.getElementById('exportCompareBtn'),json:!!document.getElementById('exportCompareJsonBtn'),disabled:document.getElementById('exportCompareBtn').disabled,
    text:document.getElementById('exportCompareBtn').textContent.trim(),jsonText:document.getElementById('exportCompareJsonBtn').textContent.trim(),
    refused:(()=>{try{compareExportSnapshot();return null}catch(e){return e.message}})()}));
  ok('按钮已渲染且未运行时禁用',ui.excel&&ui.json&&ui.disabled===true,ui);
  ok('无结果时导出被拒绝而不是给空文件',(ui.refused||'').includes('还没有可导出'),ui.refused);
  const overflow=await page.evaluate(()=>{setPage('lab');const w=innerWidth,sw=document.documentElement.scrollWidth;return {w,sw}});
  ok('对比页无横向溢出',overflow.sw<=overflow.w+1,overflow);
  await page.screenshot({path:path.join(OUT,'线上两版对比导出按钮.png')});
  report.pageErrorsCount=report.pageErrors.length;ok('无 JS 异常',report.pageErrors.length===0,report.pageErrors);
  ok('核验过程未调用模型',report.modelRequests===0,report.modelRequests);
  await browser.close();
  if(report.status==='running')report.status='passed';
}catch(e){report.status='failed';report.error=e.stack;}finally{
  fs.writeFileSync(path.join(OUT,'线上两版对比导出核验-20261016b.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:report.status,checks:report.checks.length,passed:report.checks.filter(c=>c.pass).length,pageErrors:report.pageErrors,modelRequests:report.modelRequests,error:report.error},null,1));
  if(report.status!=='passed')process.exitCode=1;
}
})();
