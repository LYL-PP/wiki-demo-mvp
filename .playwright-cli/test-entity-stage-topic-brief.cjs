'use strict';
// The entity stage must hand the model the confirmed topics' definition and includes,
// otherwise the STEP3 "逐条排查" clause has nothing to scan against.
const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
const html=fs.readFileSync(root+'/wiki-demo-mvp/index.html','utf8');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
for(const name of ['pipeline.js','semantic-tags.js'])new vm.Script(fs.readFileSync(root+'/wiki-demo-mvp/'+name,'utf8'));
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.abort('blockedbyclient'));
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
 await page.route('https://wiki-mvp-lab.app-tencent.workbuddy.host/**',r=>{const path=new URL(r.request().url()).pathname;if(r.request().method()!=='GET')return r.abort('blockedbyclient');if(path.startsWith('/.cloud/'))return r.fulfill({contentType:'application/json',body:'{"data":[]}'});if(path==='/prompt-history.js')return r.fulfill({contentType:'application/javascript',body:''});if(path==='/semantic-tags.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/semantic-tags.js','utf8')});if(path==='/file-manager.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/file-manager.js','utf8')});if(path==='/pipeline.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/pipeline.js','utf8')});if(path==='/entity-images.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/entity-images.js','utf8')});return r.fulfill({contentType:'text/html',body:html.replace('<script>wikiPromptHistory.init();init();</script>','<script>initCloud=async()=>{};init();</script>')})});
 await page.goto('https://wiki-mvp-lab.app-tencent.workbuddy.host/');
 const report=await page.evaluate(()=>{
  const tests=[],ok=(test,pass,details)=>{tests.push({test,pass:!!pass,details});if(!pass)throw new Error(test+' '+JSON.stringify(details))};
  const workbook={sheets:[{rows:[[],[],[],['ID','group','label','def','inc','bound','assign','status'],['ET1','content','角色','角色','','','','active']]},{rows:[[],[],[],[]]},{rows:[[],[],[],[]]}]};
  workbook.sheets.push(defaultRelationSheet());savedWorkbook=workbook;draftWorkbook=structuredClone(workbook);workbookReady=true;workbookRowId=1;workbookRevision=3;
  const source='1. 武学系统\n武学是燕云十六声的核心战斗系统。玩家可学习多种武学流派。\n2. 家园系统\n家园系统允许玩家建造和装饰自己的庄园。';
  const parts=splitSourceForModel(source);
  const snapshot={revision:workbookRevision,workbook:savedWorkbook};
  const ctx={snapshot,sourceName:'x',modelId:'t',documentContext:wikiDocumentContext(source,'x'),
   historySnapshot:{topics:[],entities:[]},segmentIndex:1,segmentCount:parts.length,part:parts[0]};
  const topics=[{local_id:'T1',id:'P1-T1',name:'燕云十六声的武学系统与真实体质',
   definition:'武学流派的修炼机制与真实体质影响。',scope:'武学流派与招式',
   includes:['剑法、刀法、拳法等流派连招招式','真实体质对修炼的影响','走火入魔的负面状态'],excludes:['内功搭配']}];
  const input=buildEntityStageInput(DEFAULT_PROMPTS,source,snapshot,ctx,topics);
  const brief=/本段已确认话题（共 1 个[^）]*）：([\s\S]*?)\n/.exec(input);
  ok('实体阶段输入解析出已确认话题清单',!!brief,input.slice(0,80));
  const parsed=JSON.parse(brief[1]);
  ok('话题清单带 id/name/scope',parsed[0].id==='T1'&&parsed[0].name==='燕云十六声的武学系统与真实体质'&&parsed[0].scope==='武学流派与招式',parsed[0]);
  ok('话题清单带上 definition',parsed[0].definition==='武学流派的修炼机制与真实体质影响。',parsed[0].definition);
  ok('话题清单带上 includes 且内容完整',Array.isArray(parsed[0].includes)&&parsed[0].includes.length===3&&parsed[0].includes[0]==='剑法、刀法、拳法等流派连招招式',parsed[0].includes);
  ok('includes 原文出现在模型输入中',input.includes('走火入魔的负面状态'),input.includes('走火入魔的负面状态'));
  ok('话题清单不泄露 excludes',!JSON.stringify(parsed[0]).includes('内功搭配'),parsed[0]);
  const empty=buildEntityStageInput(DEFAULT_PROMPTS,source,snapshot,ctx,[{local_id:'T2',id:'P1-T2',name:'无边界话题',scope:'s'}]);
  ok('话题缺 definition/includes 时不报错',/本段已确认话题（共 1 个/.test(empty)&&!!JSON.parse(/）：([\s\S]*?)\n/.exec(empty)[1])[0].includes,empty.slice(0,0));
  ok('空 includes 序列化为空数组而非 undefined',JSON.parse(/）：([\s\S]*?)\n/.exec(empty)[1])[0].includes.length===0,JSON.parse(/）：([\s\S]*?)\n/.exec(empty)[1])[0]);
  const topicInput=buildTopicStageInput(DEFAULT_PROMPTS,source,snapshot,ctx);
  ok('话题阶段输入不含已确认话题清单',!topicInput.includes('本段已确认话题'),topicInput.includes('本段已确认话题'));
  return tests;
 });
 assert(!errors.length,errors.join('\n'));
 const output={kind:'mock-browser-regression-not-real-model',passed:report.filter(t=>t.pass).length,failed:report.filter(t=>!t.pass).length,total:report.length,tests:report,pageErrors:errors,modelAttempts:0};
 fs.writeFileSync(root+'/outputs/wiki-entity-stage-topic-brief-tests.json',JSON.stringify(output,null,2));
 console.log('scenarios '+report.length+' passed '+output.passed+' failed '+output.failed);
 for(const t of report)if(!t.pass)console.error('FAILED '+t.test+' '+JSON.stringify(t.details));
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
