'use strict';
// A long document produces many integration groups. One group missing a reason, or reusing a
// group id, used to throw and invalidate the entire run even though every candidate was fine.
// Malformed groups must be isolated; candidates must always keep a destination.
const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs=require('fs'),assert=require('assert');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
const html=fs.readFileSync(root+'/wiki-demo-mvp/index.html','utf8');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new(require('vm').Script)(match[1]);
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.abort('blockedbyclient'));await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
 await page.route('https://wiki-mvp-lab.app-tencent.workbuddy.host/**',r=>{const path=new URL(r.request().url()).pathname;if(r.request().method()!=='GET')return r.abort('blockedbyclient');if(path.startsWith('/.cloud/'))return r.fulfill({contentType:'application/json',body:'{"data":[]}'});if(path==='/prompt-history.js')return r.fulfill({contentType:'application/javascript',body:''});if(path==='/semantic-tags.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/semantic-tags.js','utf8')});if(path==='/file-manager.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/file-manager.js','utf8')});if(path==='/pipeline.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/pipeline.js','utf8')});if(path==='/entity-images.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/entity-images.js','utf8')});return r.fulfill({contentType:'text/html',body:html.replace('<script>wikiPromptHistory.init();init();</script>','<script>initCloud=async()=>{};init();</script>')})});
 await page.goto('https://wiki-mvp-lab.app-tencent.workbuddy.host/');
 const report=await page.evaluate(()=>{
  const tests=[],ok=(test,pass,details)=>{tests.push({test,pass:!!pass,details});if(!pass)throw new Error(test+' '+JSON.stringify(details))};
  const workbook={sheets:[{rows:[[],[],[],['ID','group','label','def','inc','bound','assign','status'],['ET1','content','角色','角色','','','','active'],['ET2','content','武器','武器','','','','active']]},{rows:[[],[],[],[]]},{rows:[[],[],[],[]]}]};
  workbook.sheets.push(defaultRelationSheet());savedWorkbook=workbook;draftWorkbook=structuredClone(workbook);workbookReady=true;workbookRowId=1;workbookRevision=3;
  const source='巫师3新手指南介绍战斗与角色。杰洛特是猎魔人。杰洛特使用银剑。银剑攻击怪物。';
  const part={index:1,text:source,start:0,end:source.length};
  const context={modelId:'test',sourceName:'整合组回归.txt',snapshot:{revision:3,workbook},parts:[part],historySnapshot:{topics:[],entities:[]},runControl:{cancelled:false}};
  const anchors={ontology_type:'角色',reality_domain:'虚构',product_ip_scope:'巫师3'};
  const raw={topics:[{id:'T1',name:'巫师3新手指南',definition:'新手攻略',scope:'新手入门',object_anchor:'巫师3',core_question:'入门',includes:['入门'],excludes:['高阶'],quote:'巫师3新手指南介绍战斗与角色。'}],
   entities:[
    {id:'M1',name:'杰洛特',definition:'猎魔人',quote:'杰洛特是猎魔人。',anchors,topic_ids:['T1'],primary_topic_id:'T1',type:'角色',facets:[],candidate_tags:[],relations:[]},
    {id:'M2',name:'杰洛特',definition:'猎魔人',quote:'杰洛特使用银剑。',anchors,topic_ids:['T1'],primary_topic_id:'T1',type:'角色',facets:[],candidate_tags:[],relations:[]},
    {id:'M3',name:'银剑',definition:'武器',quote:'银剑攻击怪物。',anchors:{...anchors,ontology_type:'武器'},topic_ids:['T1'],primary_topic_id:'T1',type:'武器',facets:[],candidate_tags:[],relations:[]}],review:[]};
  const candidates=validateChunkCandidates(raw,part,source);
  const topicGroups=[{id:'GT1',members:['P1-T1'],name:'巫师3新手指南',decision:'keep',reason:'独立'}];
  const build=entityGroups=>({topic_groups:structuredClone(topicGroups),entity_groups:entityGroups});
  const run=entityGroups=>assembleIntegratedResult(candidates,build(entityGroups),source,context);
  const good=extra=>[{id:'GE1',members:['P1-M1','P1-M2'],name:'杰洛特',decision:'keep',reason:'同一身份',topics:['GT1'],primary_topic:'GT1'},
    Object.assign({id:'GE2',members:['P1-M3'],name:'银剑',decision:'keep',topics:['GT1'],primary_topic:'GT1'},extra)];
  // 1. Missing reason: keep the group, keep the decision, record a diagnostic.
  const noReason=run(good({reason:''}));
  ok('缺理由不再整轮失败',noReason.metrics.entities===2&&noReason.metrics.integrationGroupRepairs===1,noReason.metrics);
  ok('缺理由的组保留原决策',noReason.steps.step3.accepted.find(e=>e.name==='银剑')&&noReason.steps.step4.normalization_results.find(n=>n.candidate==='银剑').decision==='create_new',noReason.steps.step4.normalization_results.map(n=>[n.candidate,n.decision]));
  ok('正常归并组不受影响',noReason.steps.step3.accepted.find(e=>e.name==='杰洛特').evidences.length===2);
  // 2. Invalid decision is downgraded, never trusted.
  const badDecision=run(good({reason:'独立',decision:'merge'}));
  ok('非法 decision 降级为复核',badDecision.metrics.integrationGroupRepairs===1&&badDecision.steps.step4.normalization_results.find(n=>n.candidate==='银剑').decision==='review',badDecision.steps.step4.normalization_results.map(n=>[n.candidate,n.decision]));
  // 3. Duplicate group id isolates the later group and recovers its member.
  const dup=run([good({reason:'独立'})[0],{id:'GE1',members:['P1-M3'],name:'银剑',decision:'keep',reason:'独立',topics:['GT1'],primary_topic:'GT1'}]);
  ok('组ID重复隔离后组但保留候选',dup.metrics.entities===2&&dup.metrics.integrationGroupRepairs===1&&dup.steps.step3.accepted.some(e=>e.name==='银剑'),dup.metrics);
  // 4. Structural defects isolate the group; the member is still recovered as a review entry.
  const noId=run([good({reason:'独立'})[0],{members:['P1-M3'],name:'银剑',decision:'keep',reason:'独立',topics:['GT1'],primary_topic:'GT1'}]);
  ok('缺组ID的候选被回收为复核条目',noId.metrics.entities===2&&noId.steps.step3.review.some(r=>/隔离该组/.test(r.reason)),noId.steps.step3.review.map(r=>r.reason));
  const emptyMembers=run([good({reason:'独立'})[0],{id:'GE2',members:[],name:'银剑',decision:'keep',reason:'独立'}]);
  ok('空成员组不判死整轮',emptyMembers.metrics.entities===2,emptyMembers.metrics);
  const notObject=run([good({reason:'独立'})[0],null]);
  ok('非对象组不判死整轮',notObject.metrics.entities===2,notObject.metrics);
  // 5. Every group broken: still no throw, every candidate keeps a destination.
  const allBroken=run([{members:['P1-M1'],name:'x'},{id:'GE2',members:[],name:'y'}]);
  ok('全部组损坏仍不抛错且候选全部保留',allBroken.metrics.entities===3&&allBroken.metrics.integrationGroupRepairs>=2,allBroken.metrics);
  // 6. History from another product is dropped; anchor-less history is kept.
  const histCtx=extra=>({...context,historySnapshot:{topics:extra,entities:[]},documentContext:{}});
  const histInput=integrationModelInput(DEFAULT_PROMPTS,candidates,histCtx([
   {id:'H1',name:'燕云话题',scope:'s',object_anchor:'燕云十六声',core_question:'q',includes:[],excludes:[]},
   {id:'H2',name:'巫师话题',scope:'s',object_anchor:'巫师3',core_question:'q',includes:[],excludes:[]}]));
  ok('跨产品历史话题不进整合输入',histInput.includes('巫师话题')&&!histInput.includes('燕云话题'),{witcher:histInput.includes('巫师话题'),yanyun:histInput.includes('燕云话题')});
  ok('无锚点历史话题仍保留',integrationModelInput(DEFAULT_PROMPTS,candidates,histCtx([{id:'H3',name:'无锚点话题',scope:'s',object_anchor:'',core_question:'q',includes:[],excludes:[]}])).includes('无锚点话题'));
  // 7. Repair count reaches the export.
  state.baseline=noReason;state.current=badDecision;state.resultsStale=false;
  const snap=compareExportSnapshot(),rows=snap.sheets.find(s=>s.name==='对比总览').rows,row=label=>rows.find(r=>r[0]===label);
  ok('导出含整合归并组修复数',String(row('整合归并组修复数')[1])==='1'&&String(row('整合归并组修复数')[2])==='1',row('整合归并组修复数'));
  state.baseline=null;state.current=null;
  return tests;
 });
 assert(!errors.length,errors.join('\n'));
 const output={kind:'mock-browser-regression-not-real-model',passed:report.filter(t=>t.pass).length,failed:report.filter(t=>!t.pass).length,total:report.length,tests:report,pageErrors:errors,modelAttempts:0};
 fs.writeFileSync(root+'/outputs/wiki-integration-group-repair-tests.json',JSON.stringify(output,null,2));
 console.log('scenarios '+output.total+' passed '+output.passed+' failed '+output.failed);
 for(const t of report)if(!t.pass)console.error('FAILED '+t.test+' '+JSON.stringify(t.details));
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
