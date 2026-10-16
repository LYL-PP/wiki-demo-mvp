const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
const html=fs.readFileSync(root+'/wiki-demo-mvp/index.html','utf8');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
for(const name of ['pipeline.js','semantic-tags.js'])new vm.Script(fs.readFileSync(root+'/wiki-demo-mvp/'+name,'utf8'));
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let modelAttempts=0;
 await page.route('**/*',r=>r.abort('blockedbyclient'));await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
 await page.route('https://wiki-mvp-lab.app-tencent.workbuddy.host/**',r=>{const path=new URL(r.request().url()).pathname;if(r.request().method()!=='GET')return r.abort('blockedbyclient');if(path.startsWith('/.cloud/'))return path.startsWith('/.cloud/llm/')?r.abort('blockedbyclient'):r.fulfill({contentType:'application/json',body:'{"data":[]}'});if(path==='/prompt-history.js')return r.fulfill({contentType:'application/javascript',body:''});if(path==='/semantic-tags.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/semantic-tags.js','utf8')});if(path==='/file-manager.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/file-manager.js','utf8')});if(path==='/pipeline.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/pipeline.js','utf8')});return r.fulfill({contentType:'text/html',body:html.replace('<script>wikiPromptHistory.init();init();</script>','<script>initCloud=async()=>{};init();</script>')})});
 await page.goto('https://wiki-mvp-lab.app-tencent.workbuddy.host/');
 const report=await page.evaluate(async()=>{
  const tests=[],ok=(test,pass,details)=>{tests.push({test,pass:!!pass,details});if(!pass)throw new Error(test+' '+JSON.stringify(details))};
  const workbook={sheets:[{rows:[[],[],[],['ID','group','label','def','inc','bound','assign','status'],['ET1','content','角色','角色','','','','active'],['ET2','content','武器','武器','','','','active']]},{rows:[[],[],[],[]]},{rows:[[],[],[],[]]}]};
  workbook.sheets.push(defaultRelationSheet());savedWorkbook=workbook;draftWorkbook=structuredClone(workbook);workbookReady=true;workbookRowId=1;workbookRevision=1;availableModels=[{id:'test',name:'模拟回归模型'}];
  const source='巫师3新手指南介绍战斗与角色。杰洛特是猎魔人。花木兰是现实历史人物。银剑攻击怪物。';
  const anchors={ontology_type:'角色',reality_domain:'虚构',product_ip_scope:'巫师3'};
  const part={index:1,text:source,start:0,end:source.length};
  const topic=(id,name)=>({id,name,definition:'新手攻略',scope:'新手入门',object_anchor:'巫师3',core_question:'新手入门',includes:['入门'],excludes:['高阶'],quote:'巫师3新手指南介绍战斗与角色。'});
  const entity=(id,name,quote,extra={})=>({id,name,definition:'人物设计',quote,anchors:{...anchors},topic_ids:['T1'],primary_topic_id:'T1',type:'角色',facets:[],candidate_tags:[],relations:[],...extra});
  const raw={topics:[topic('T1','巫师3新手指南')],entities:[
    entity('M1','杰洛特','杰洛特是猎魔人。'),
    entity('M2','花木兰','花木兰是现实历史人物。'),
    entity('M3','银剑','银剑攻击怪物。',{anchors:{...anchors,ontology_type:'武器'},type:'武器'})],review:[]};
  const candidates=validateChunkCandidates(raw,part,source);
  const context={modelId:'test',sourceName:'身份复核回归.txt',snapshot:{revision:1,workbook},parts:[part],historySnapshot:{topics:[],entities:[]},runControl:{cancelled:false}};
  const mapping={topic_groups:[{id:'GT1',members:['P1-T1'],name:'巫师3新手指南',decision:'keep',reason:'同一范围'}],entity_groups:[
    {id:'GE1',members:['P1-M1'],name:'杰洛特',topics:['GT1'],primary_topic:'GT1',decision:'review',reason:'本段无杰洛特相关描述，证据不足复核'},
    {id:'GE2',members:['P1-M2'],name:'花木兰',topics:['GT1'],primary_topic:'GT1',decision:'review',reason:'上下文不足，需人工确认是否为同一人'},
    {id:'GE3',members:['P1-M3'],name:'银剑',topics:['GT1'],primary_topic:'GT1',decision:'keep',reason:'身份明确'}]};
  const result=assembleIntegratedResult(candidates,mapping,source,context);
  const issues=arr(result.diagnostics.candidate_issues);
  const identity=issues.filter(i=>i.field==='entity_identity'),conflicts=issues.filter(i=>i.field==='entity_review_reason_conflict');

  ok('实体级 review 上浮为可见诊断',identity.length===2&&identity.every(i=>/归一决策 review/.test(i.reason)),identity.map(i=>i.reason));
  ok('诊断带上实体名与归并组 ID',identity.map(i=>i.name).sort().join('|')==='杰洛特|花木兰'&&identity.every(i=>/^GE\d$/.test(i.mention_id)),identity.map(i=>i.mention_id));
  ok('矛盾理由被单独隔离且不多报',conflicts.length===1&&conflicts[0].name==='杰洛特',conflicts.map(i=>[i.name,i.reason]));
  ok('矛盾诊断同时给出理由与已定位证据',/本段无杰洛特相关描述/.test(conflicts[0].reason)&&/杰洛特是猎魔人。/.test(conflicts[0].reason)&&/1 条证据/.test(conflicts[0].reason),conflicts[0].reason);
  ok('矛盾诊断不改判 review',result.steps.step4.normalization_results.find(n=>n.mention_local_id==='GE1').decision==='review');
  ok('keep 实体不产生身份复核诊断',!identity.some(i=>i.name==='银剑')&&!conflicts.some(i=>i.name==='银剑'));
  ok('指标计入身份复核与矛盾数',result.metrics.entityIdentityReviews===2&&result.metrics.contradictoryReviewReasons===1,result.metrics);
  ok('复核条目数包含身份复核',result.integration.review_count>=3,result.integration.review_count);
  ok('主类型待复核口径未变',typeof result.metrics.reviews==='number'&&result.steps.step6.decision==='ready',[result.metrics.reviews,result.steps.step6.decision]);
  const noTopic=assembleIntegratedResult({...candidates,topics:[]},structuredClone(mapping),source,context);
  ok('有实体无话题时显式告警而非静默 0/0',noTopic.metrics.topics===0&&noTopic.metrics.entities===0&&arr(noTopic.diagnostics.candidate_issues).some(i=>i.field==='topic_stage_empty'),noTopic.metrics);
  ok('实体全被隔离时身份复核仍计数不漏报',noTopic.metrics.entityIdentityReviews===2,noTopic.metrics);
  ok('自检函数对无证据组不误报',wikiReviewReasonContradictsEvidence('本段无描述，证据不足复核',[])===false);
  ok('自检函数对空理由不误报',wikiReviewReasonContradictsEvidence('',[{exact_quote:'有证据'}])===false);
  ok('自检函数识别未提及类断言',wikiReviewReasonContradictsEvidence('原文未提及该对象',[{exact_quote:'有证据'}])===true);
  ok('自检函数不误伤非缺失类理由',wikiReviewReasonContradictsEvidence('上下文不足，需人工确认',[{exact_quote:'有证据'}])===false);

  state.previews=[];state.previewTopics=[];addLocalPreview(result);
  const reviewFlags=state.previews.filter(e=>arr(e.reviewReasons).includes('ENTITY_IDENTITY_REVIEW'));
  ok('入库后保留身份未裁决标记',reviewFlags.length===2&&reviewFlags.map(e=>e.name).sort().join('|')==='杰洛特|花木兰',reviewFlags.map(e=>e.name));
  const items=typeReviewItems();
  ok('复核队列纳入身份未裁决项',items.length===2&&items.every(i=>i.kind==='identity'),items.map(i=>i.kind));
  updateReviewCount();ok('复核计数徽标包含身份未裁决',document.getElementById('reviewCount').textContent==='2',document.getElementById('reviewCount').textContent);
  renderReview();const body=document.getElementById('reviewBody').textContent;
  ok('复核队列文案区分身份未裁决',(body.match(/身份未裁决/g)||[]).length===2&&!body.includes('主类型待复核'),body.slice(0,200));
  ok('复核理由说明用中文而非代码',reviewReasonText('ENTITY_IDENTITY_REVIEW')==='身份归一未裁决（decision=review）'&&reviewReasonText('ENTITY_TYPE_REVIEW_REQUIRED')==='主类型待复核');

  state.source={id:'FILE-A',revision:1,name:'身份复核回归.txt',text:source};
  state.baseline=structuredClone(result);state.current=structuredClone(result);
  state.baselinePrompts={...state.baselinePrompts,step2:'人工基线'};state.prompts={...state.prompts,step2:'人工新版'};
  window.wikiRunTiming={current:()=>null};
  const snapshot=compareExportSnapshot(),overview=snapshot.sheets.find(s=>s.name==='对比总览');
  const rows=overview.rows.map(r=>Object.fromEntries(overview.headers.map((h,i)=>[h,r[i]])));
  ok('对比总览新增实体身份复核两行',!!rows.find(r=>r['项目']==='实体身份复核')&&!!rows.find(r=>r['项目']==='其中理由与证据矛盾'),rows.map(r=>r['项目']).filter(n=>/复核/.test(n)));
  ok('对比总览身份复核数值正确',rows.find(r=>r['项目']==='实体身份复核')['新版']==='2'&&rows.find(r=>r['项目']==='其中理由与证据矛盾')['新版']==='1');
  ok('原待复核项改名为主类型待复核',!!rows.find(r=>r['项目']==='主类型待复核')&&!rows.find(r=>r['项目']==='待复核项'));
  const diag=snapshot.sheets.find(s=>s.name==='诊断与隔离'),diagRows=diag.rows.map(r=>Object.fromEntries(diag.headers.map((h,i)=>[h,r[i]])));
  ok('诊断页导出含身份复核与矛盾条目',diagRows.filter(r=>r['字段']==='entity_identity').length>=2&&diagRows.filter(r=>r['字段']==='entity_review_reason_conflict').length>=1,diagRows.map(r=>r['字段']));
  for(const s of snapshot.sheets)for(const row of s.rows)if(row.length!==s.headers.length)throw new Error('行宽不一致 '+s.name);
  renderCompare();renderKnowledge();
  return tests;
 });
 assert(!errors.length,errors.join('\n'));
 for(const width of [1440,760,390]){await page.setViewportSize({width,height:1100});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);assert(!overflow,'overflow '+width)}
 const output={kind:'mock-browser-regression-not-real-model',passed:report.filter(t=>t.pass).length,failed:report.filter(t=>!t.pass).length,total:report.length,tests:report,pageErrors:errors,modelAttempts:0};
 fs.writeFileSync(root+'/outputs/wiki-entity-identity-review-tests.json',JSON.stringify(output,null,2));
 console.log('scenarios '+report.length+' passed '+output.passed+' failed '+output.failed);
 for(const t of report)if(!t.pass)console.error('FAILED '+t.test+' '+JSON.stringify(t.details));
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
