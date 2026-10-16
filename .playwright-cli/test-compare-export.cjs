'use strict';
// 两版对比导出（Excel / JSON）测试：全部使用人工构造的运行结果，不调用模型、不写云、不读取真实知识。
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const ROOT='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25',APP=path.join(ROOT,'wiki-demo-mvp'),OUT=path.join(ROOT,'outputs'),ORIGIN='http://127.0.0.1:19437';
const modules=['index.html','semantic-tags.js','pipeline.js','file-manager.js','prompt-history.js'];
const source=Object.fromEntries(modules.map(n=>[n,fs.readFileSync(path.join(APP,n),'utf8')]));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const protectedFiles=fs.readdirSync(APP).filter(n=>fs.statSync(path.join(APP,n)).isFile()).map(n=>path.join(APP,n));
const before=Object.fromEntries(protectedFiles.map(p=>[p,hash(p)]));
for(const m of source['index.html'].matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
for(const n of modules.slice(1))new vm.Script(source[n]);
if(!process.argv.includes('--source-ready')){console.log('Syntax passed; no scenarios run. Use --source-ready after saving application.');process.exit(0);}
const XLSX=require('./xlsx-0.18.5-export-test.min.js');
const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const report={kind:'Two-branch comparison export: artificial run fixtures; no user knowledge',status:'running',tests:[],pageErrors:[],network:[],layouts:[],applicationFingerprints:before,modelAttempts:0,sdkWrites:0,downloads:0};
let current,total=0,browser,page,context,downloadCount=0;
process.on('unhandledRejection',e=>{report.unhandledRejection=String(e&&e.message||e);});
const A=new Proxy(assert,{get(t,k){if(typeof t[k]!=='function')return t[k];return(...args)=>{total++;current.assertions++;return t[k](...args)}}});
async function test(name,fn,seed=true){current={name,assertions:0,status:'running'};try{if(seed)await page.evaluate(()=>exportFixtures.seed());await fn();current.status='passed';}catch(e){current.status='failed';current.error=e.stack;console.error(name+': '+e.message);}finally{report.tests.push(current);}}
const sheet=(s,n)=>s.sheets.find(x=>x.name===n);
const objects=s=>s.rows.map(row=>Object.fromEntries(s.headers.map((h,i)=>[h,row[i]])));
const snapshot=()=>page.evaluate(()=>compareExportSnapshot());
function isolation(){
  window.exportAudit={model:0,writes:0};const create=WorkBuddyCloud.createWorkBuddyCloud;
  WorkBuddyCloud.createWorkBuddyCloud=function(...args){const c=create(...args);c.llm.chat.completions.create=function(){exportAudit.model++;throw Error('Model forbidden in export tests')};const from=c.database.from.bind(c.database);c.database.from=t=>{const q=from(t);for(const op of ['insert','upsert','update','delete'])q[op]=()=>{exportAudit.writes++;throw Error('Cloud writes forbidden')};return q};return c;};
}
function fixtures(){
  window.exportFixtures={};const f=exportFixtures;
  f.proof=(text,quote)=>{const start=text.indexOf(quote);return {exact_quote:quote,start,end:start+quote.length}};
  f.topic=(id,name,extra={})=>({id,name,definition:'人工话题定义 '+id,scope:'人工范围 '+id,object_anchor:'人工游戏',core_question:'人工问题 '+id,includes:['纳入'+id],excludes:['排除'+id],evidences:[{exact_quote:'人工话题证据 '+id,start:10,end:20}],...extra});
  f.result=(branch,topics,entities,extra={})=>{
    const accepted=entities.map(e=>({mention_local_id:e.id,name:e.name,definition:'人工实体说明 '+e.id,aliases:['别名 '+e.id],evidences:[{exact_quote:'人工实体证据 '+e.id,start:30,end:42}],topic_ids:e.topics,primary_topic_id:e.topics[0],member_ids:[e.id]}));
    const normalizations=entities.map(e=>({mention_local_id:e.id,candidate:e.name,decision:'create_new',disambiguation_label:'消歧 '+e.id,reason:'人工归并理由',identity_anchors:{ontology_type:e.type==='游戏产品'?'游戏作品':'技能',reality_domain:'游戏虚构',product_ip_scope:'人工游戏',version:'v1',identity_attributes:{定位:e.name}}}));
    const marks=entities.map(e=>({mention_local_id:e.id,candidate:e.name,primary_topic_id:e.topics[0],associated_topic_ids:e.topics.slice(1),
      tags:{entity_type:e.type,entity_type_id:e.typeId,...(e.type?{}:{type_resolution:{reason:'未命中受控主类型'},typeIssue:{reason:'未命中受控主类型'}}),facets:['产品:人工游戏'],candidate_tags:['候选 '+e.id],
        semantic_facets:[{dimension:'product',value:'人工游戏',basis:'explicit',reason:'原文明示',evidences:[{exact_quote:'人工实体证据 '+e.id,start:30,end:42}]},{dimension:'discipline',value:'策划',basis:'inferred',reason:'语义推断',quote:'人工实体证据 '+e.id,evidences:[{exact_quote:'人工实体证据 '+e.id,start:30,end:42}]}]},
      relations:e.relations||[]}));
    return {preview_eligible:true,topics,isolated_topics:[{id:'ISO-'+branch,name:'人工无实体话题',reason:'无有效实体关联'}],workbook_revision:3,
      source:{file_name:'人工测试文件.pdf',file_id:'FILE-A',file_revision:2},
      model:{id:'人工模型',name:'人工模型名',elapsed_ms:12000,extraction_elapsed_ms:9000,integration_elapsed_ms:3000,content_chars:4321,stream_chunks:55,segment_count:2,reused_segments:0,concurrency:2,usage:{total_tokens:6789},integration_input:{total_chars:12345,limit_chars:120000}},
      steps:{step1:{blocks:2},step2:{decision:'candidate',candidate_topic:{name:'人工主话题'},evidence:{exact_quote:'人工话题证据'},associated_topic_ids:[]},step3:{accepted,review:[{name:'人工复核实体',field:'identity',reason:'人工复核理由'}]},step4:{normalization_results:normalizations},step5:{entity_results:marks},step6:{decision:'ready',hard_failures:[],review_reasons:[],review_items:[]}},
      diagnostics:{candidate_issues:[{name:'人工问题实体',field:'entity_type',reason:'人工候选问题理由'}],isolated_relations:[{from:'人工实体A',to:'人工实体B',reason:'人工隔离关系理由'}],isolated_topics:[{id:'ISO-'+branch,name:'人工无实体话题',reason:'无有效实体关联'}],coverage:{expected_sections:4,reported:3,missing:['人工章节甲','人工章节乙']}},
      metrics:{topics:topics.length,entities:entities.length,tags:entities.length*2,relations:entities.reduce((n,e)=>n+(e.relations||[]).length,0),reviews:1,hardFails:0},
      reconciliation:{aligned:2,excludedEntities:['人工证据不足实体'],discardedRelations:[{from:'x',to:'y',reason:'r'}],topicValid:true},
      integration:{topic_candidates:topics.length+1,entity_candidates:entities.length+2,topic_merges:1,isolated_topic_count:1,entity_merges:2,review_count:1,complete_candidates:true},
      comparison:{mode:'prompts',branch,model_id:'人工模型',workbook_revision:3,source:{id:'FILE-A',name:'人工测试文件.pdf',revision:2},prompt_snapshot:comparisonPromptSnapshot(state[branch==='A'?'baselinePrompts':'prompts'])},
      ...extra};
  };
  f.seed=()=>{
    const source='人工来源正文：用于导出测试的人工文本。';
    state.source={id:'FILE-A',revision:2,name:'人工测试文件.pdf',text:source};
    const topicsA=[f.topic('T-A1','人工话题甲'),f.topic('T-A2','人工话题乙')];
    const topicsB=[f.topic('T-B1','人工话题甲'),f.topic('T-B2','人工话题乙'),f.topic('T-B3','人工话题丙')];
    const entitiesA=[{id:'M-A1',name:'人工实体A',topics:['T-A1'],type:'技能',typeId:'ET-CONTENT-SKILL'}];
    const entitiesB=[{id:'M-B1',name:'人工实体A',topics:['T-B1','T-B2'],type:'技能',typeId:'ET-CONTENT-SKILL',relations:[{predicate:'包含',relation_type_id:'RT-PART',target_name:'人工实体B',target_mention_local_id:'M-B2',strength:'strong',direction:'out',evidences:[{exact_quote:'人工关系证据',start:5,end:11}]}]},{id:'M-B2',name:'人工实体B',topics:['T-B3'],type:null,typeId:null}];
    state.baseline=f.result('A',topicsA,entitiesA);
    state.current=f.result('B',topicsB,entitiesB);
    state.baselinePrompts={...structuredClone(state.baselinePrompts),step2:'人工基线提示词 step2'};
    state.prompts={...structuredClone(state.prompts),step2:'人工新版提示词 step2'};
    window.fakeTiming={id:7,started_at:'2026-10-15T08:00:00.000Z',start:0,end:4200,status:'success',outcome_status:'success',stale:false,message:'',
      events:[{scope:'shared',key:'prompt_sync',label:'提示词同步',start:0,end:200,status:'success'},{scope:'baseline',key:'input',label:'提炼输入构造',start:200,end:320,status:'success'},
        {scope:'baseline',key:'extraction_request',label:'提炼接口',start:320,end:1400,status:'success'},{scope:'baseline',key:'assembly',label:'全文归一与校验',start:1400,end:1500,status:'success'},
        {scope:'current',key:'baseline_clone',label:'复用基线',start:1500,end:1510,status:'success'},{scope:'current',key:'integration_request',label:'整合接口',start:2000,end:3900,status:'success'},
        {scope:'current',key:'display',label:'结果展示',start:3900,end:4000,status:'failed'}],
      branches:{baseline:{start:200,end:1500,status:'success'},current:{start:1500,end:4000,status:'success'}},
      caches:{shared:{},baseline:{extraction:1},current:{baseline:2}}};
    if(!window.savedTiming){window.savedTiming=window.wikiRunTiming}
    window.wikiRunTiming={current:()=>window.fakeTiming,markStale(){},beginEvent:()=>null,endEvent(){},cache(){},outcome(){},aggregate:(record,scope,key)=>{const events=record.events.filter(e=>e.scope===scope&&e.key===key);const wall=events.reduce((n,e)=>n+((e.end==null?record.end:e.end)-e.start),0);return {events,wall_ms:wall,request_count:events.filter(e=>/_request$/.test(e.key)).length,request_ms:wall};}};
    updateCompareExportState();
  };
  f.signature=()=>JSON.stringify({baseline:state.baseline,current:state.current,prompts:state.prompts,baselinePrompts:state.baselinePrompts,source:state.source,storage:Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]))});
  f.seed();
}
function initCode(){
  const old=fs.readFileSync(path.join(ROOT,'.playwright-cli/test-run-timing.cjs'),'utf8'),start=old.indexOf('function installMock(){'),end=old.indexOf('\nlet browser,shotPage;',start);if(start<0||end<start)throw Error('Pure mock function boundary changed');
  let code=old.slice(start,end).trim();if(/\brequire\s*\(|chromium\.launch|child_process|process\./.test(code))throw Error('Not a pure mock');
  const fn=new vm.Script('('+code+')').runInNewContext();if(typeof fn!=='function'||fn.toString().trim()!==code)throw Error('Extra mock execution denied');
  const needle="'active','玩家角色']]},";if(code.split(needle).length!==2)throw Error('Artificial workbook insertion boundary changed');
  const rows=[['ET-PROD-GAME','产品','游戏产品','具名游戏作品','人工游戏','非技能','按身份','active','交互游戏作品'],['ET-CONTENT-SKILL','玩法','技能','具名能力','人工技能','非游戏产品','按具体身份','active','具名能力']];
  code=code.replace(needle,"'active','玩家角色'],"+rows.map(r=>JSON.stringify(r)).join(',')+']},');return code+'\ninstallMock();\n('+isolation.toString()+')();';
}
async function downloadExcel(){await page.evaluate(()=>setPage('lab'));const promise=page.waitForEvent('download',{timeout:12000});await page.locator('#exportCompareBtn').click();
  let d;try{d=await promise}catch(e){throw new Error('no download; toast='+(await page.locator('#toast').innerText())+' busy='+(await page.evaluate(()=>compareExportBusy))+' disabled='+(await page.locator('#exportCompareBtn').isDisabled()))}
  const file=await d.path();A.ok(d.suggestedFilename().endsWith('.xlsx'));const bytes=fs.readFileSync(file);A.equal(bytes.subarray(0,2).toString(),'PK');return {book:XLSX.read(bytes,{type:'buffer',cellFormula:true}),bytes,name:d.suggestedFilename()};}
async function downloadJson(){await page.evaluate(()=>setPage('lab'));const promise=page.waitForEvent('download',{timeout:12000});await page.locator('#exportCompareJsonBtn').click();
  let d;try{d=await promise}catch(e){throw new Error('no download; toast='+(await page.locator('#toast').innerText())+' disabled='+(await page.locator('#exportCompareJsonBtn').isDisabled()))}const file=await d.path();A.equal(await d.failure(),null);A.ok(d.suggestedFilename().endsWith('.json'));return JSON.parse(fs.readFileSync(file,'utf8'));}
(async()=>{
try{
  browser=await chromium.launch({channel:'chrome',headless:true});context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',acceptDownloads:true});
  await context.addInitScript({content:initCode()});await context.routeWebSocket('**/*',s=>s.close());
  const asset=source['index.html'].match(/const\s+WORKBOOK_ASSET\s*=\s*['"]([^'"]+)['"]/)[1];const assetPath=new URL(asset,ORIGIN).pathname;
  await context.route('**/*',r=>{const req=r.request(),u=new URL(req.url());report.network.push({method:req.method(),url:req.url()});if(req.method()==='GET'&&u.origin===ORIGIN){const n=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname.slice(1));if(Object.hasOwn(source,n))return r.fulfill({contentType:n.endsWith('.html')?'text/html':'application/javascript',body:source[n]});if(u.pathname===assetPath)return r.fulfill({body:Buffer.from('mock-workbook')});if(u.pathname==='/favicon.ico')return r.fulfill({status:204});}if(req.method()==='GET'&&req.resourceType()==='script'){if(u.pathname.endsWith('/xlsx.full.min.js'))return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(ROOT,'.playwright-cli/xlsx-0.18.5-export-test.min.js'))});return r.fulfill({contentType:'application/javascript',body:''});}return r.abort('blockedbyclient');});
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('download',()=>downloadCount++);page.on('dialog',d=>d.dismiss());
  await page.goto(ORIGIN,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>workbookReady&&!cloudLoading&&fileManagerReady&&wikiPromptHistory.getController().status().ready);await page.evaluate(fixtures);
  await test('No run yet: export refused and buttons disabled',async()=>{await page.evaluate(()=>{state.baseline=null;state.current=null;updateCompareExportState()});
    A.equal(await page.locator('#exportCompareBtn').isDisabled(),true);A.equal(await page.locator('#exportCompareJsonBtn').isDisabled(),true);
    const message=await page.evaluate(()=>{try{compareExportSnapshot();return null}catch(e){return e.message}});
    A.ok(message&&message.includes('还没有可导出'),message);
    const json=await page.evaluate(()=>{try{compareExportPayload();return null}catch(e){return e.message}});A.ok(json&&json.includes('还没有可导出'));},false);
  await test('Sheet set, headers and row widths',async()=>{const s=await snapshot();
    A.deepEqual(s.sheets.map(x=>x.name),['对比总览','分支耗时','耗时明细','话题清单','实体清单','关系清单','差异清单','诊断与隔离','Prompt快照','导出说明']);
    for(const t of s.sheets)for(const row of t.rows)A.equal(row.length,t.headers.length);
    A.equal(s.counts.topics,5);A.equal(s.counts.entities,3);A.equal(s.counts.relations,1);A.ok(s.counts.diffs>0);A.ok(s.counts.issues>=5);});
  await test('Overview pairs both branches and computes numeric diff',async()=>{const rows=objects(sheet(await snapshot(),'对比总览'));
    const topics=rows.find(r=>r['项目']==='话题数');A.equal(topics['基线版'],'2');A.equal(topics['新版'],'3');A.equal(topics['差异 / 说明'],'+1');
    const entities=rows.find(r=>r['项目']==='实体数');A.equal(entities['基线版'],'1');A.equal(entities['新版'],'2');A.equal(entities['差异 / 说明'],'+1');
    A.equal(rows.find(r=>r['项目']==='来源文件')['基线版'],'人工测试文件.pdf');
    A.equal(rows.find(r=>r['项目']==='模型总耗时（秒）')['基线版'],'12');
    A.ok(rows.find(r=>r['项目']==='Prompt 指纹')['基线版'].length>0);
    A.ok(rows.find(r=>r['项目']==='总耗时（秒）')['差异 / 说明'].length>0);
    A.ok(rows.find(r=>r['项目']==='未覆盖章节')['新版'].includes('人工章节甲'));});
  await test('Timing: branch rows and stage rows from this run only',async()=>{const s=await snapshot(),branches=objects(sheet(s,'分支耗时')),stages=objects(sheet(s,'耗时明细'));
    A.deepEqual(branches.map(r=>r['分支']),['基线版','新版']);A.equal(branches[0]['独立处理（秒）'],'1.300');A.equal(branches[0]['结果'],'成功');A.equal(branches[1]['缓存命中'],'基线复用 2 次');
    A.equal(stages.filter(r=>r['范围']==='基线版').length,3);A.equal(stages.filter(r=>r['范围']==='共享流程').length,1);
    A.equal(stages.find(r=>r['阶段标识']==='extraction_request')['请求次数'],'1');A.equal(stages.find(r=>r['阶段标识']==='extraction_request')['墙钟（秒）'],'1.080');
    A.equal(stages.find(r=>r['阶段标识']==='display')['状态'],'1 次未完成');});
  await test('Missing timing keeps results and leaves timing sheets empty',async()=>{await page.evaluate(()=>{window.fakeTiming=null});
    const s=await snapshot();A.equal(sheet(s,'耗时明细').rows.length,0);A.equal(sheet(s,'分支耗时').rows.length,0);
    A.equal(sheet(s,'话题清单').rows.length,5);A.ok(objects(sheet(s,'对比总览')).some(r=>r['项目']==='运行耗时'));});
  await test('Topics include scope, boundaries, evidence offsets and entity counts',async()=>{const rows=objects(sheet(await snapshot(),'话题清单'));
    A.equal(rows.filter(r=>r['分支']==='基线版').length,2);A.equal(rows.filter(r=>r['分支']==='新版').length,3);
    const first=rows.find(r=>r['话题ID']==='T-B1');A.equal(first['话题名'],'人工话题甲');A.equal(first['对象锚点'],'人工游戏');A.equal(first['纳入边界'],'纳入T-B1');A.equal(first['证据偏移'],'10–20');A.equal(first['关联实体数'],'1');
    A.equal(rows.find(r=>r['话题ID']==='T-B3')['关联实体数'],'1');});
  await test('Entities carry type, facets, aliases, relations and evidence',async()=>{const rows=objects(sheet(await snapshot(),'实体清单'));
    A.equal(rows.length,3);const b1=rows.find(r=>r['实体名']==='人工实体A'&&r['分支']==='新版');
    A.equal(b1['消歧说明'],'消歧 M-B1');A.equal(b1['本体类型'],'技能');A.equal(b1['主类型'],'技能');A.equal(b1['主类型ID'],'ET-CONTENT-SKILL');A.ok(b1['主类型状态'].includes('非人工批准'));
    A.equal(b1['产品分面'],'人工游戏');A.equal(b1['专业分面'],'策划');A.equal(b1['版本分面'],'');A.equal(b1['候选Tag'],'候选 M-B1');A.equal(b1['别名'],'别名 M-B1');
    A.equal(b1['主话题'],'人工话题甲');A.ok(b1['全部话题'].includes('人工话题乙'));A.equal(b1['关系数'],'1');A.ok(b1['关系概况'].includes('包含 → 人工实体B（强）'));
    A.equal(b1['证据偏移'],'30–42');const b2=rows.find(r=>r['实体名']==='人工实体B');A.equal(b2['主类型'],'待复核');A.ok(b2['主类型状态'].startsWith('待复核：'));});
  await test('Relations sheet keeps predicate, strength and offsets',async()=>{const rows=objects(sheet(await snapshot(),'关系清单'));
    A.equal(rows.length,1);A.equal(rows[0]['分支'],'新版');A.equal(rows[0]['源实体'],'人工实体A');A.equal(rows[0]['谓词'],'包含');A.equal(rows[0]['目标实体'],'人工实体B');A.equal(rows[0]['强弱'],'强关系');A.equal(rows[0]['证据偏移'],'5–11');});
  await test('Diagnostics keep coverage, candidate issues, isolated items and review',async()=>{const rows=objects(sheet(await snapshot(),'诊断与隔离'));
    const kinds=new Set(rows.map(r=>r['类别']));for(const k of ['候选问题','无实体隔离话题','隔离关系','复核项','覆盖率自检'])A.ok(kinds.has(k),k);
    const coverage=rows.find(r=>r['类别']==='覆盖率自检');A.ok(coverage['字段']==='topic_coverage');A.ok(coverage['说明'].includes('人工章节甲'));A.ok(coverage['对象'].includes('4'));
    A.equal(rows.filter(r=>r['类别']==='覆盖率自检').length,2);A.ok(rows.every(r=>r['分支']));});
  await test('Diff sheet reuses page diffSummary output',async()=>{const expected=await page.evaluate(()=>diffSummary(state.baseline,state.current).map(d=>d.text)),rows=objects(sheet(await snapshot(),'差异清单'));
    A.deepEqual(rows.map(r=>r['说明']),expected);A.ok(rows.length>0);A.ok(rows.every(r=>r['变化类型'].length>0));});
  await test('Prompt snapshot sheet records the frozen prompt',async()=>{const rows=objects(sheet(await snapshot(),'Prompt快照'));
    const base=rows.find(r=>r['分支']==='基线版'&&r['STEP']==='step2'),now=rows.find(r=>r['分支']==='新版'&&r['STEP']==='step2');
    A.equal(base['提示词全文'],'人工基线提示词 step2');A.equal(now['提示词全文'],'人工新版提示词 step2');A.equal(base['字符数'],String('人工基线提示词 step2'.length));});
  await test('Only one branch available still exports with 本轮无结果',async()=>{await page.evaluate(()=>{state.current=null;updateCompareExportState()});
    const rows=objects(sheet(await snapshot(),'对比总览'));A.equal(rows.find(r=>r['项目']==='话题数')['新版'],'本轮无结果');A.equal(sheet(await snapshot(),'话题清单').rows.length,2);
    A.equal(objects(sheet(await snapshot(),'差异清单'))[0]['说明'],'只有一版结果，未计算差异');},false);
  await test('Actual XLSX download reads back as inert text',async()=>{await page.evaluate(()=>{delete window.XLSX;for(const k of Object.keys(parserPromises))delete parserPromises[k]});
    const d=await downloadExcel();A.deepEqual(d.book.SheetNames,['对比总览','分支耗时','耗时明细','话题清单','实体清单','关系清单','差异清单','诊断与隔离','Prompt快照','导出说明']);
    for(const n of d.book.SheetNames){const s=d.book.Sheets[n];A.ok(s['!autofilter']);for(const [a,c]of Object.entries(s))if(!a.startsWith('!')){A.equal(c.t,'s');A.equal(c.f,undefined);A.equal(c.l,undefined);}}
    const entities=XLSX.utils.sheet_to_json(d.book.Sheets['实体清单'],{defval:''});A.equal(entities.length,3);A.equal(entities[0]['实体名'],'人工实体A');
    A.equal(XLSX.utils.sheet_to_json(d.book.Sheets['话题清单']).length,5);
    fs.writeFileSync(path.join(OUT,'wiki-compare-export-fixture.xlsx'),d.bytes);});
  await test('JSON download carries run timing, topics, entities and diff',async()=>{const data=await downloadJson();
    A.equal(data.branches.length,2);A.equal(data.run.attempt,7);A.equal(data.run.total_seconds,4.2);A.ok(data.run.stages.length>=6);A.ok(data.run.branches.length===2);
    A.equal(data.source.name,'人工测试文件.pdf');A.equal(data.source.chars,await page.evaluate(()=>state.source.text.length));
    const base=data.branches.find(b=>b.key==='baseline'),now=data.branches.find(b=>b.key==='current');
    A.equal(base.topics.length,2);A.equal(now.topics.length,3);A.equal(now.entities.length,2);
    A.equal(now.entities[0].type.label,'技能');A.deepEqual(now.entities[0].facets.product,['人工游戏']);A.equal(now.entities[0].relations.length,1);
    A.equal(now.entities[1].type.status,'待复核');A.ok(now.entities[1].type.reason.length>0);
    A.equal(now.diagnostics.coverage.missing.length,2);A.equal(base.metrics.topics,2);A.equal(now.metrics.topics,3);
    A.ok(now.prompts.step2==='人工新版提示词 step2');A.ok(now.prompt_fingerprint);A.ok(data.diff.length>0);});
  await test('Snapshot and export never mutate results, prompts or storage',async()=>{const before=await page.evaluate(()=>exportFixtures.signature());
    await page.evaluate(()=>{compareExportSnapshot();compareExportPayload();updateCompareExportState()});
    A.equal(await page.evaluate(()=>exportFixtures.signature()),before);});
  await test('Parser failure downloads nothing and restores the button',async()=>{const before=downloadCount;
    await page.evaluate(async()=>{window.savedExcelParser=excelParser;excelParser=async()=>{throw Error('人工依赖失败')};await exportCompareExcel();excelParser=window.savedExcelParser;});
    A.equal(downloadCount,before);A.equal(await page.locator('#exportCompareBtn').isDisabled(),false);A.ok((await page.locator('#toast').innerText()).includes('未修改任何数据'));
    await downloadExcel();});
  await test('Buttons enabled after results exist and layout stays inside viewport',async()=>{for(const width of [1440,760,390]){
    await page.setViewportSize({width,height:1000});const size=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
    A.ok(size.scrollWidth<=size.width+1);A.equal(await page.locator('#exportCompareBtn').isDisabled(),false);report.layouts.push(size);}
    await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{scrollTo(0,0);document.getElementById('toast').classList.remove('show')});
    await page.screenshot({path:path.join(OUT,'两版对比导出-本地.png')});});
  await test('No model calls, SDK writes, page errors or protected file changes',async()=>{const a=await page.evaluate(()=>exportAudit);A.equal(a.model,0);A.equal(a.writes,0);report.modelAttempts=a.model;report.sdkWrites=a.writes;
    A.deepEqual(report.pageErrors,[]);for(const [p,h]of Object.entries(before))A.equal(hash(p),h);},false);
  report.status=report.tests.every(t=>t.status==='passed')?'passed':'failed';report.assertions=total;report.scenarios=report.tests.length;report.passed=report.tests.filter(t=>t.status==='passed').length;report.downloads=downloadCount;
}catch(e){report.status='failed';report.harnessError=e.stack;console.error(e);}finally{if(browser)await browser.close();fs.writeFileSync(path.join(OUT,'wiki-compare-export-tests.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,scenarios:report.scenarios,passed:report.passed,assertions:report.assertions,downloads:report.downloads,harnessError:report.harnessError}));if(report.status!=='passed')process.exitCode=1;}
})();
