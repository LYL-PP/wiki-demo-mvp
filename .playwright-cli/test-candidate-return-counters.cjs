'use strict';
// A topic collapse can originate either in the model (it returned few topics) or in the
// program (evidence alignment dropped valid topics). Both must be observable separately,
// otherwise every collapse has to be guessed at.
const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs=require('fs'),assert=require('assert');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
const html=fs.readFileSync(root+'/wiki-demo-mvp/index.html','utf8');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new(require('vm').Script)(match[1]);
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.abort('blockedbyclient'));await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
 await page.route('https://wiki-mvp-lab.app-tencent.workbuddy.host/**',r=>{const path=new URL(r.request().url()).pathname;if(r.request().method()!=='GET')return r.abort('blockedbyclient');if(path.startsWith('/.cloud/'))return r.fulfill({contentType:'application/json',body:'{"data":[]}'});if(path==='/prompt-history.js')return r.fulfill({contentType:'application/javascript',body:''});if(path==='/semantic-tags.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/semantic-tags.js','utf8')});if(path==='/file-manager.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/file-manager.js','utf8')});if(path==='/pipeline.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/pipeline.js','utf8')});return r.fulfill({contentType:'text/html',body:html.replace('<script>wikiPromptHistory.init();init();</script>','<script>initCloud=async()=>{};init();</script>')})});
 await page.goto('https://wiki-mvp-lab.app-tencent.workbuddy.host/');
 const report=await page.evaluate(()=>{
  const tests=[],ok=(test,pass,details)=>{tests.push({test,pass:!!pass,details});if(!pass)throw new Error(test+' '+JSON.stringify(details))};
  const workbook={sheets:[{rows:[[],[],[],['ID','group','label','def','inc','bound','assign','status'],['ET1','content','角色','角色','','','','active'],['ET2','content','武器','武器','','','','active']]},{rows:[[],[],[],[]]},{rows:[[],[],[],[]]}]};
  workbook.sheets.push(defaultRelationSheet());savedWorkbook=workbook;draftWorkbook=structuredClone(workbook);workbookReady=true;workbookRowId=1;workbookRevision=3;
  const source='巫师3新手指南介绍战斗与角色。杰洛特是猎魔人。杰洛特使用银剑。银剑攻击怪物。';
  const part={index:1,text:source,start:0,end:source.length};
  const context={modelId:'test',sourceName:'计数器回归.txt',snapshot:{revision:3,workbook},parts:[part],historySnapshot:{topics:[],entities:[]},runControl:{cancelled:false}};
  const anchors={ontology_type:'角色',reality_domain:'虚构',product_ip_scope:'巫师3'};
  const topic=(id,name,quote)=>({id,name,definition:'新手攻略',scope:'新手入门',object_anchor:'巫师3',core_question:'入门',includes:['入门'],excludes:['高阶'],quote});
  const entity=(id,name,topicId,quote,type='角色')=>({id,name,definition:'设计',quote,anchors:type==='武器'?{...anchors,ontology_type:'武器'}:anchors,topic_ids:[topicId],primary_topic_id:topicId,type,facets:[],candidate_tags:[],relations:[]});
  // Scenario A: the model returned 3 topics / 3 entities, the program dropped one of each.
  const rawA={topics:[topic('T1','巫师3新手指南','巫师3新手指南介绍战斗与角色。'),topic('T2','猎魔人战斗','杰洛特是猎魔人。'),topic('TBAD','证据落空话题','原文里不存在的句子')],
   entities:[entity('M1','杰洛特','T1','杰洛特是猎魔人。'),entity('M2','银剑','T2','银剑攻击怪物。','武器'),entity('MBAD','无证据项','T1','原文里不存在的句子')],review:[]};
  const candA=validateChunkCandidates(rawA,part,source);
  ok('话题阶段回传模型原始返回条数',candA.topicReturned===3,candA.topicReturned);
  ok('实体阶段回传模型原始返回条数',candA.entityReturned===3,candA.entityReturned);
  ok('证据落空话题/实体被隔离但未计入保留',candA.topics.length===2&&candA.entities.length===2,{t:candA.topics.length,e:candA.entities.length});
  const mapA={topic_groups:[{id:'GT1',members:['P1-T1'],name:'巫师3新手指南',decision:'keep',reason:'独立'},{id:'GT2',members:['P1-T2'],name:'猎魔人战斗',decision:'keep',reason:'独立'}],
   entity_groups:[{id:'GE1',members:['P1-M1'],name:'杰洛特',decision:'keep',reason:'独立',topics:['GT1'],primary_topic:'GT1'},{id:'GE2',members:['P1-M2'],name:'银剑',decision:'keep',reason:'独立',topics:['GT2'],primary_topic:'GT2'}]};
  const resA=assembleIntegratedResult(candA,mapA,source,context);
  ok('整合后保留模型原始返回条数',resA.metrics.topicCandidatesReturned===3&&resA.metrics.entityCandidatesReturned===3,resA.metrics);
  ok('整合后保留校验后候选条数',resA.metrics.topicCandidatesKept===2&&resA.metrics.entityCandidatesKept===2,resA.metrics);
  ok('丢弃量 = 原始返回 - 校验后保留',resA.metrics.topicCandidatesReturned-resA.metrics.topicCandidatesKept===1&&resA.metrics.entityCandidatesReturned-resA.metrics.entityCandidatesKept===1,resA.metrics);
  // Scenario B: the model itself returned only 2 topics / 2 entities, nothing was dropped.
  const rawB={topics:[topic('T1','巫师3新手指南','巫师3新手指南介绍战斗与角色。'),topic('T2','猎魔人战斗','杰洛特是猎魔人。')],
   entities:[entity('M1','杰洛特','T1','杰洛特是猎魔人。'),entity('M2','银剑','T2','银剑攻击怪物。','武器')],review:[]};
  const candB=validateChunkCandidates(rawB,part,source);
  ok('模型少给时原始返回条数如实为 2',candB.topicReturned===2&&candB.entityReturned===2&&candB.topics.length===2,{r:candB.topicReturned,k:candB.topics.length});
  const resB=assembleIntegratedResult(candB,structuredClone(mapA),source,context);
  ok('两轮最终话题数相同',resA.metrics.topics===resB.metrics.topics&&resA.metrics.entities===resB.metrics.entities,{a:resA.metrics.topics,b:resB.metrics.topics});
  ok('计数器能区分「模型少给」与「程序丢弃」',resB.metrics.topicCandidatesReturned===2&&resB.metrics.topicCandidatesReturned!==resA.metrics.topicCandidatesReturned,{a:resA.metrics.topicCandidatesReturned,b:resB.metrics.topicCandidatesReturned});
  // Export rows must carry the discriminator, otherwise the spreadsheet cannot answer the question.
  state.baseline=resA;state.current=resB;state.resultsStale=false;
  const snap=compareExportSnapshot(),rows=snap.sheets.find(s=>s.name==='对比总览').rows,row=label=>rows.find(r=>r[0]===label);
  ok('导出含话题候选原始返回行',!!row('话题候选 · 模型原始返回'),snap.sheets.map(s=>s.name));
  ok('导出原始返回值正确',String(row('话题候选 · 模型原始返回')[1])==='3'&&String(row('话题候选 · 模型原始返回')[2])==='2',row('话题候选 · 模型原始返回'));
  ok('导出含保留值与丢弃值',String(row('话题候选 · 校验后保留')[1])==='2'&&String(row('话题候选 · 证据定位丢弃')[1])==='1'&&String(row('话题候选 · 证据定位丢弃')[2])==='0',[row('话题候选 · 校验后保留'),row('话题候选 · 证据定位丢弃')]);
  ok('导出含实体候选原始返回行',String(row('实体候选 · 模型原始返回')[1])==='3'&&String(row('实体候选 · 模型原始返回')[2])==='2',row('实体候选 · 模型原始返回'));
  ok('旧结果缺计数器时导出不报错',(()=>{const legacy=structuredClone(resA);delete legacy.metrics.topicCandidatesReturned;delete legacy.metrics.entityCandidatesReturned;state.baseline=legacy;const s=compareExportSnapshot();return s.sheets.find(x=>x.name==='对比总览').rows.some(r=>r[0]==='话题候选 · 模型原始返回')})());
  state.baseline=null;state.current=null;
  return tests;
 });
 assert(!errors.length,errors.join('\n'));
 const output={kind:'mock-browser-regression-not-real-model',passed:report.filter(t=>t.pass).length,failed:report.filter(t=>!t.pass).length,total:report.length,tests:report,pageErrors:errors,modelAttempts:0};
 fs.writeFileSync(root+'/outputs/wiki-candidate-return-counters-tests.json',JSON.stringify(output,null,2));
 console.log('scenarios '+output.total+' passed '+output.passed+' failed '+output.failed);
 for(const t of report)if(!t.pass)console.error('FAILED '+t.test+' '+JSON.stringify(t.details));
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
