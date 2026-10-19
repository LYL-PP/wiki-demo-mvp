'use strict';
// 分段阶段只接受本段已确认话题的绑定：topic_ids 漏填或填错会被整体清空，且不打诊断。
// 整合阶段原本又把"整合补回的话题"当成未受支持的建议拒掉，于是同一批实体被杀两次，
// 最终因没有 primary_topic_id 进不了知识浏览。放宽后：程序只校验外键（建议ID必须命中
// 本轮已确认话题），归属语义交给整合；不存在的ID仍然拒绝，实体不得挂在凭空话题下。
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
  const workbook={sheets:[{rows:[[],[],[],['ID','group','label','def','inc','bound','assign','status'],['ET1','content','角色','角色','','','','active'],['ET2','content','机制','机制','','','','active']]},{rows:[[],[],[],[]]},{rows:[[],[],[],[]]}]};
  workbook.sheets.push(defaultRelationSheet());savedWorkbook=workbook;draftWorkbook=structuredClone(workbook);workbookReady=true;workbookRowId=1;workbookRevision=3;
  const source='星穹铁道新手指南。命途决定角色定位。巡猎是单体伤害专精。开拓者是主角。雅利洛是首个星球。';
  const part={index:1,text:source,start:0,end:source.length};
  const context={modelId:'test',sourceName:'话题归属放宽.txt',snapshot:{revision:3,workbook},parts:[part],historySnapshot:{topics:[],entities:[]},runControl:{cancelled:false}};
  const anchors={ontology_type:'角色',reality_domain:'虚构',product_ip_scope:'星穹铁道'};
  // 本段两个话题：单话题兜底不成立，M2 漏填、M3 错填都会被分段阶段清空绑定。
  const raw={topics:[
    {id:'T1',name:'星穹铁道命途体系',definition:'命途',scope:'命途',object_anchor:'星穹铁道',core_question:'定位',includes:['命途'],excludes:[],quote:'命途决定角色定位。'},
    {id:'T2',name:'星穹铁道世界观',definition:'世界观',scope:'世界观',object_anchor:'星穹铁道',core_question:'世界观',includes:['星球'],excludes:[],quote:'星穹铁道新手指南。'}],
   entities:[
    {id:'M1',name:'巡猎',definition:'单体伤害',quote:'巡猎是单体伤害专精。',anchors,topic_ids:['T1'],primary_topic_id:'T1',type:'机制',relations:[]},
    {id:'M2',name:'开拓者',definition:'主角',quote:'开拓者是主角。',anchors,topic_ids:[],primary_topic_id:null,type:'角色',relations:[]},
    {id:'M3',name:'雅利洛',definition:'星球',quote:'雅利洛是首个星球。',anchors,topic_ids:['T9'],primary_topic_id:'T9',type:'角色',relations:[]}],
   review:[]};
  const candidates=validateChunkCandidates(raw,part,source);
  ok('分段阶段确实清空了漏填/错填的绑定',JSON.stringify(candidates.entities.map(e=>[e.name,e.topic_ids.length,e.primary_topic_id]))==='[["巡猎",1,"P1-T1"],["开拓者",0,null],["雅利洛",0,null]]',candidates.entities.map(e=>[e.name,e.topic_ids,e.primary_topic_id]));
  const topicGroups=[{id:'GT1',members:['P1-T1'],name:'星穹铁道命途体系',decision:'keep',reason:'独立'},{id:'GT2',members:['P1-T2'],name:'星穹铁道世界观',decision:'keep',reason:'独立'}];
  const run=groups=>assembleIntegratedResult(candidates,{topic_groups:structuredClone(topicGroups),entity_groups:groups},source,context);
  const good=[{id:'GE1',members:['P1-M1'],name:'巡猎',decision:'keep',reason:'独立',topics:['GT1'],primary_topic:'GT1'},
    {id:'GE2',members:['P1-M2'],name:'开拓者',decision:'keep',reason:'独立',topics:['GT2'],primary_topic:'GT2'},
    {id:'GE3',members:['P1-M3'],name:'雅利洛',decision:'keep',reason:'独立',topics:['GT2'],primary_topic:'GT2'}];
  const repaired=run(good);
  const byName=r=>Object.fromEntries(r.steps.step3.accepted.map(e=>[e.name,e]));
  ok('整合修复后三个实体全部进入知识浏览',repaired.metrics.entities===3&&repaired.metrics.entityCandidatesKept===3,repaired.metrics);
  ok('漏填/错填都拿到整合修复的主话题',byName(repaired)['开拓者'].primary_topic_id==='GT2'&&byName(repaired)['雅利洛'].primary_topic_id==='GT2',repaired.steps.step3.accepted.map(e=>[e.name,e.primary_topic_id]));
  ok('修复的归属依据标记为 integration',byName(repaired)['开拓者'].topic_basis==='integration'&&byName(repaired)['雅利洛'].topic_basis==='integration'&&byName(repaired)['巡猎'].topic_basis==='segment',repaired.steps.step3.accepted.map(e=>[e.name,e.topic_basis]));
  ok('不再出现没有有效话题证据的隔离',!repaired.diagnostics.candidate_issues.some(i=>/没有有效话题证据/.test(i.reason||'')),repaired.diagnostics.candidate_issues.map(i=>i.reason));
  ok('不再出现未经分段证据支持的拒绝',!repaired.diagnostics.candidate_issues.some(i=>/未经分段证据支持/.test(i.reason||'')),repaired.diagnostics.candidate_issues.map(i=>i.reason));
  ok('修复计数进指标',repaired.metrics.topicBindingRepairs===2&&repaired.metrics.topicBindingRejected===0,repaired.metrics);
  ok('修复后两个话题都可浏览',repaired.metrics.topics===2&&repaired.topics.map(t=>t.id).join()==='GT1,GT2',repaired.topics.map(t=>t.id));
  ok('step5 的归属依据同步带上 integration',repaired.steps.step5.entity_results.find(e=>e.candidate==='雅利洛').topic_basis==='integration',repaired.steps.step5.entity_results.map(e=>[e.candidate,e.topic_basis]));
  // 凭空造话题仍然拒绝：GT9 不是本轮任何已确认话题。
  const fabricated=run([good[0],good[1],{id:'GE3',members:['P1-M3'],name:'雅利洛',decision:'keep',reason:'独立',topics:['GT9'],primary_topic:'GT9'}]);
  ok('不存在的建议话题ID仍被拒绝',fabricated.metrics.topicBindingRejected===1&&fabricated.diagnostics.candidate_issues.some(i=>/不存在的话题ID/.test(i.reason||'')&&/GT9/.test(i.reason||'')),fabricated.diagnostics.candidate_issues.map(i=>i.reason));
  ok('凭空话题下没有实体入知识浏览',fabricated.metrics.entities===2&&!fabricated.steps.step3.accepted.some(e=>e.name==='雅利洛'),fabricated.steps.step3.accepted.map(e=>e.name));
  ok('凭空话题也不进可浏览话题',fabricated.topics.every(t=>t.id!=='GT9')&&fabricated.diagnostics.isolated_topics.every(t=>t.id!=='GT9'),fabricated.topics.map(t=>t.id));
  // 整合不给任何归属时保持原样：不猜话题。
  const silent=run([{id:'GE1',members:['P1-M1'],name:'巡猎',decision:'keep',reason:'独立',topics:['GT1'],primary_topic:'GT1'},{id:'GE2',members:['P1-M2'],name:'开拓者',decision:'keep',reason:'独立'},{id:'GE3',members:['P1-M3'],name:'雅利洛',decision:'keep',reason:'独立',topics:[],primary_topic:null}]);
  ok('整合不给归属时程序不猜话题',silent.metrics.entities===1&&silent.metrics.topicBindingRepairs===0&&silent.diagnostics.candidate_issues.filter(i=>/没有有效话题证据/.test(i.reason||'')).length===2,silent.metrics);
  return tests;
 });
 const passed=report.filter(t=>t.pass).length;
 fs.writeFileSync(root+'/outputs/wiki-topic-binding-repair-tests.json',JSON.stringify({kind:'mock-browser-regression-not-real-model',passed,failed:report.length-passed,total:report.length,tests:report,pageErrors:errors,modelAttempts:0},null,2));
 console.log('scenarios '+report.length+' passed '+passed+' failed '+(report.length-passed));
 for(const t of report)if(!t.pass)console.error('FAILED '+t.test+' '+JSON.stringify(t.details));
 if(errors.length)console.error('PAGEERROR',errors.join('\n'));
 if(passed!==report.length)process.exitCode=1;
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
