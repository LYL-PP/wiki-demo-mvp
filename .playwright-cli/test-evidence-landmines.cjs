'use strict';
// Two silent evidence landmines used to delete valid topics/entities:
//  1. a wrong start/end from the model discarded the whole evidence instead of relocating it;
//  2. a quote occurring more than once in the source was discarded when it needed normalization.
// Both must now be rescued and flagged, never silently dropped.
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
  const source='巫师3新手指南介绍战斗与角色。杰洛特是猎魔人。杰洛特使用银剑。银剑攻击怪物。杰洛特是猎魔人。';
  // --- unit level ---------------------------------------------------------
  const once='银剑攻击怪物。',twice='杰洛特是猎魔人。';
  ok('逐字命中不标记歧义',(()=>{const m=alignQuoteToSource(once,source);return m&&m.aligned===false&&m.ambiguous===false})(),alignQuoteToSource(once,source));
  ok('逐字命中但多处同文时标记歧义',(()=>{const m=alignQuoteToSource(twice,source);return m&&m.aligned===false&&m.ambiguous===true})(),alignQuoteToSource(twice,source));
  // Space-normalized AND duplicated: the old code returned null (dropped the evidence).
  const spaced=twice.slice(0,4)+' '+twice.slice(4); // 仅空白不同，需归一化才能命中
  // The quote differs from the source only by whitespace, so it needs normalization, and the
  // normalized form occurs twice: the old code returned null and deleted the evidence.
  ok('需归一化且多处同文：不再丢弃，取首次并标记',(()=>{const m=alignQuoteToSource(spaced,source);return !!m&&m.aligned===true&&m.ambiguous===true&&m.text===twice&&source.includes(m.text)})(),alignQuoteToSource(spaced,source));
  ok('文本根本不存在仍返回 null',alignQuoteToSource('原文里根本不存在的句子',source)===null);
  ok('偏移正确时不纠正',(()=>{const e=wikiEvidence([{exact_quote:once,start:source.indexOf(once),end:source.indexOf(once)+once.length}],source);return e.length===1&&e[0].offset_corrected===undefined&&e[0].aligned===false})(),wikiEvidence([{exact_quote:once,start:source.indexOf(once),end:source.indexOf(once)+once.length}],source));
  ok('模型偏移错位时纠正而非丢弃',(()=>{const e=wikiEvidence([{exact_quote:once,start:source.indexOf(once)+1,end:source.indexOf(once)+1+once.length}],source);return e.length===1&&e[0].offset_corrected===true&&source.slice(e[0].start,e[0].end)===e[0].exact_quote})(),wikiEvidence([{exact_quote:once,start:source.indexOf(once)+1,end:source.indexOf(once)+1+once.length}],source));
  ok('模型 end 不一致时同样纠正',(()=>{const e=wikiEvidence([{exact_quote:once,start:0,end:999}],source);return e.length===1&&e[0].offset_corrected===true})(),wikiEvidence([{exact_quote:once,start:0,end:999}],source));
  ok('偏移错位且文本不存在仍丢弃',wikiEvidence([{exact_quote:'查无此句',start:3,end:7}],source).length===0);
  ok('多处同文取首次出现',(()=>{const e=wikiEvidence([{exact_quote:twice}],source);return e.length===1&&e[0].start===source.indexOf(twice)&&e[0].ambiguous===true})(),wikiEvidence([{exact_quote:twice}],source));
  // --- pipeline level -----------------------------------------------------
  const part={index:1,text:source,start:0,end:source.length};
  const context={modelId:'test',sourceName:'证据回归.txt',snapshot:{revision:3,workbook},parts:[part],historySnapshot:{topics:[],entities:[]},runControl:{cancelled:false}};
  const anchors={ontology_type:'角色',reality_domain:'虚构',product_ip_scope:'巫师3'};
  const topic=(id,name,quote,extra={})=>({id,name,definition:'新手攻略',scope:'新手入门',object_anchor:'巫师3',core_question:'入门',includes:['入门'],excludes:['高阶'],quote,...extra});
  const entity=(id,name,topicId,quote,type='角色')=>({id,name,definition:'设计',quote,anchors:type==='武器'?{...anchors,ontology_type:'武器'}:anchors,topic_ids:[topicId],primary_topic_id:topicId,type,facets:[],candidate_tags:[],relations:[]});
  // T2 carries a wrong offset: the old code dropped the topic entirely.
  const raw={topics:[topic('T1','巫师3新手指南','巫师3新手指南介绍战斗与角色。'),topic('T2','猎魔人战斗',twice,{start:99,end:99+twice.length})],
   entities:[entity('M1','杰洛特','T1',twice),entity('M2','银剑','T2','银剑攻击怪物。','武器')],review:[]};
  const cand=validateChunkCandidates(raw,part,source);
  ok('偏移错位的话题不再被丢弃',cand.topics.length===2&&cand.topicReturned===2,{kept:cand.topics.length,returned:cand.topicReturned});
  ok('纠正确实写入证据对象',cand.topics.some(t=>t.evidences.some(e=>e.offset_corrected))&&cand.entities.some(e=>e.evidences.some(q=>q.ambiguous)),cand.topics.map(t=>t.evidences));
  const mapping={topic_groups:[{id:'GT1',members:['P1-T1'],name:'巫师3新手指南',decision:'keep',reason:'独立'},{id:'GT2',members:['P1-T2'],name:'猎魔人战斗',decision:'keep',reason:'独立'}],
   entity_groups:[{id:'GE1',members:['P1-M1'],name:'杰洛特',decision:'keep',reason:'独立',topics:['GT1'],primary_topic:'GT1'},{id:'GE2',members:['P1-M2'],name:'银剑',decision:'keep',reason:'独立',topics:['GT2'],primary_topic:'GT2'}]};
  const result=assembleIntegratedResult(cand,mapping,source,context);
  ok('两个话题都可浏览',result.metrics.topics===2&&result.metrics.entities===2,result.metrics);
  ok('偏移纠正数进指标',result.metrics.evidenceOffsetCorrected===1,result.metrics);
  ok('多处同文数进指标',result.metrics.evidenceAmbiguous===2,result.metrics);
  ok('证据仍满足逐字定位不变式',result.topics.every(t=>t.evidences.every(q=>source.slice(q.start,q.end)===q.exact_quote))&&result.steps.step3.accepted.every(e=>e.evidences.every(q=>source.slice(q.start,q.end)===q.exact_quote)));
  state.baseline=result;state.current=structuredClone(result);state.resultsStale=false;
  const snap=compareExportSnapshot(),rows=snap.sheets.find(s=>s.name==='对比总览').rows,row=label=>rows.find(r=>r[0]===label);
  ok('导出含证据偏移已纠正行',String(row('证据偏移已纠正')[2])==='1',row('证据偏移已纠正'));
  ok('导出含多处同文行',String(row('证据多处同文（取首次）')[2])==='2',row('证据多处同文（取首次）'));
  state.baseline=null;state.current=null;
  return tests;
 });
 assert(!errors.length,errors.join('\n'));
 const output={kind:'mock-browser-regression-not-real-model',passed:report.filter(t=>t.pass).length,failed:report.filter(t=>!t.pass).length,total:report.length,tests:report,pageErrors:errors,modelAttempts:0};
 fs.writeFileSync(root+'/outputs/wiki-evidence-landmine-tests.json',JSON.stringify(output,null,2));
 console.log('scenarios '+output.total+' passed '+output.passed+' failed '+output.failed);
 for(const t of report)if(!t.pass)console.error('FAILED '+t.test+' '+JSON.stringify(t.details));
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
