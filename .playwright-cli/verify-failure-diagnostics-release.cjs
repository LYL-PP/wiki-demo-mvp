'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25',phase=process.argv[2],url='https://wiki-mvp-lab.app-tencent.workbuddy.host/';
if(!['before','after'].includes(phase))throw Error('expected before/after');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});const report={phase,kind:'线上真实SDK只读验收；无模型请求，无云写',errors:[],blocked:[],tests:[]};try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}});
 await context.route('**/*',r=>{const q=r.request();if(!['GET','HEAD','OPTIONS'].includes(q.method())){report.blocked.push({method:q.method(),path:new URL(q.url()).pathname});return r.abort()}return r.continue()});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>availableModels.length>0&&workbookReady&&wikiPromptHistory.getController().status().ready,null,{timeout:90000});
 const data=await page.evaluate(async()=>{const rows=await cloud.database.from('wiki_prompt_versions').select('*').order('revision',{ascending:true});if(rows.error)throw Error(rows.error.message);return{workbook:savedWorkbook,revision:workbookRevision,promptRows:rows.data,types:controlledTypes().length,models:availableModels.length,promptReady:wikiPromptHistory.getController().status().ready}});
 report.workbookFingerprint=hash(data.workbook);report.workbookRevision=data.revision;report.promptFingerprint=hash(data.promptRows);report.promptVersions=data.promptRows.length;report.types=data.types;report.models=data.models;report.promptReady=data.promptReady;
 if(phase==='after'){
  const prior=JSON.parse(fs.readFileSync(root+'/outputs/wiki-failure-diagnostics-release-before.json','utf8'));
  assert.equal(report.workbookFingerprint,prior.workbookFingerprint);assert.equal(report.workbookRevision,prior.workbookRevision);assert.equal(report.promptFingerprint,prior.promptFingerprint);report.tests.push('共享词表与完整Prompt历史读回指纹未变');
  report.resources=[];
  for(const name of ['index.html','pipeline.js','semantic-tags.js','file-manager.js','prompt-history.js']){const response=await page.request.get(url+name);assert.ok(response.ok());const text=(await response.text()).replace(/\r\n/g,'\n'),local=fs.readFileSync(root+'/wiki-demo-mvp/'+name,'utf8').replace(/\r\n/g,'\n');assert.equal(text,local,name);report.resources.push({name,matchesLocal:true})}
  await page.evaluate(()=>setPage('lab'));
  report.diagnostics=await page.evaluate(()=>({api:typeof wikiFailureDiagnostics.capture==='function',current:wikiFailureDiagnostics.current(),hidden:document.getElementById('failureDiagnostics').hidden,clearButton:!!document.getElementById('clearFailureDiagnostics'),between:!!(document.getElementById('runTiming').compareDocumentPosition(document.getElementById('failureDiagnostics'))&Node.DOCUMENT_POSITION_FOLLOWING)&&!!(document.getElementById('failureDiagnostics').compareDocumentPosition(document.getElementById('metrics'))&Node.DOCUMENT_POSITION_FOLLOWING)}));
  assert.equal(report.diagnostics.api,true);assert.equal(report.diagnostics.current,null);assert.equal(report.diagnostics.hidden,true);assert.equal(report.diagnostics.clearButton,true);assert.equal(report.diagnostics.between,true);report.tests.push('诊断API、清除入口及耗时与结果指标之间位置正确；未运行时隐藏');
  report.layouts=[];for(const width of [1440,760,390]){await page.setViewportSize({width,height:1000});const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(layout.scroll<=layout.width+2);report.layouts.push(layout)}
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:root+'/outputs/知识Wiki失败诊断-线上.png',fullPage:true});
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.blocked,[]);report.status='passed';console.log(JSON.stringify(report,null,2));
 }catch(e){report.status='failed';report.error=e.message;console.error(e);process.exitCode=1}finally{fs.writeFileSync(root+'/outputs/wiki-failure-diagnostics-release-'+phase+'.json',JSON.stringify(report,null,2));await browser.close()}})();
