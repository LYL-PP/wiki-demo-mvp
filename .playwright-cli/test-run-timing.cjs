'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const vm=require('node:vm');
const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
const app=path.join(root,'wiki-demo-mvp');
const names=['index.html','semantic-tags.js','pipeline.js','file-manager.js','prompt-history.js'];
const sources=Object.fromEntries(names.map(name=>[name,fs.readFileSync(path.join(app,name),'utf8')]));
const hashes=()=>Object.fromEntries(names.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(app,name))).digest('hex')]));
const beforeHashes=hashes();
for(const match of sources['index.html'].matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
for(const name of names.slice(1))new vm.Script(sources[name],{filename:name});
const report={kind:'本地全模块模拟浏览器回归；非真实模型、非真实云写入、非真实PDF',managedNode:process.execPath,modules:names,sourceHashes:beforeHashes,tests:[],scenarios:[],network:[],pageErrors:[],harnessErrors:[]};
const check=(name,fn)=>{try{const details=fn();report.tests.push({name,pass:true,details:details??null})}catch(e){report.tests.push({name,pass:false,reason:e.message});console.error('断言失败：'+name+'；'+e.message)}};
const sample='巫师3新手指南介绍角色玩法。杰洛特是巫师3中玩家可以操控的猎魔人。杰洛特使用银剑。';

function installMock(){
  const clone=value=>structuredClone(value);
  const mock=window.timingMock={promptRows:[],queries:[],writes:[],calls:[],active:0,maxActive:0,promptDelay:0,workbookDelay:0,modelDelay:15,failPrompt:false,failWorkbook:false,failPhase:'',holdPrompt:false,promptRelease:null,archiveFail:false,archiveTriggered:0,archiveBefore:null,archiveOutcome:null,seedLoads:0,tokenValue:123456,parseDelay:0};
  const delay=(ms,signal)=>new Promise((resolve,reject)=>{if(signal?.aborted)return reject(new DOMException('模拟停止','AbortError'));const abort=()=>{clearTimeout(timer);reject(new DOMException('模拟停止','AbortError'))};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve()},ms);signal?.addEventListener('abort',abort,{once:true})});
  const workbook=()=>({sheets:[
    {name:'实体类型标签',rows:[['模拟词表'],[],[],['类型 ID','管理分组','正式标签','定义','包含示例','排除与边界','赋值规则','状态','同义名称'],['ET-CHAR-PLAYABLE','人物与角色','可玩角色','玩家可以直接操控的具名角色。','杰洛特','不可操控的剧情人物不属于本类型。','选最具体类型','active','玩家角色']]},
    {name:'业务分面',rows:[['模拟分面'],[],[],['分面 ID','分面名称','正式取值','值类型','基数','值来源','主要用途','未命中处理'],['F-PRODUCT','所属产品','开放值','string','multiple','证据','检索','建议']]},
    {name:'赋值与治理规则',rows:[['模拟规则'],[],[],['规则 ID','场景','规则','程序门控','处理方式'],['R-1','抽取','证据校验','启用','隔离']]},
    defaultRelationSheet()
  ]});
  window.XLSX={read(){const wb=workbook();return {SheetNames:wb.sheets.map(s=>s.name),Sheets:Object.fromEntries(wb.sheets.map(s=>[s.name,s.rows]))}},utils:{sheet_to_json:rows=>clone(rows)}};
  const database={from(table){
    if(!['wiki_prompt_versions','wiki_shared_tag_workbook'].includes(table))throw Error('禁止访问非模拟表：'+table);
    const query={filters:[],max:Infinity,one:false,payload:null,select(){return this},order(){return this},limit(n){this.max=n;return this},eq(k,v){this.filters.push([k,v,'eq']);return this},lt(k,v){this.filters.push([k,v,'lt']);return this},single(){this.one=true;return this},maybeSingle(){this.one=true;return this},insert(p){this.payload=clone(p);return this},then(resolve,reject){return execute(table,this).then(resolve,reject)}};
    return query;
  }};
  async function execute(table,q){
    const entry={table,write:!!q.payload,start:performance.now(),end:null,filters:clone(q.filters)};mock.queries.push(entry);
    try{
      if(table==='wiki_shared_tag_workbook'){
        if(q.payload)throw Error('模拟共享词表不允许写入');
        await delay(mock.workbookDelay);if(mock.failWorkbook)throw Error('模拟词表读取故障');
        return {data:{id:1,revision:1,workbook:workbook()}};
      }
      if(mock.holdPrompt){mock.holdPrompt=false;await new Promise(r=>{mock.promptRelease=()=>{mock.promptRelease=null;r()}})}
      await delay(mock.promptDelay);if(mock.failPrompt)throw Error('模拟提示词同步断网');
      if(q.payload){
        const p=q.payload,latest=mock.promptRows.at(-1);
        if(mock.promptRows.some(r=>r.request_id===p.request_id))return {error:{code:'23505'}};
        if(String(latest.revision)!==String(p.parent_revision))return {error:{code:'40001'}};
        wikiPromptHistory.validate(p.snapshot);
        if(wikiPromptHistory.same(latest.snapshot,p.snapshot))return {error:{code:'23514'}};
        if(String(p.revision)!==String(BigInt(latest.revision)+1n))throw Error('模拟版本号契约错误');
        const changed=wikiPromptHistory.SIDES.flatMap(side=>wikiPromptHistory.STEPS.filter(step=>latest.snapshot[side][step]!==p.snapshot[side][step]).map(step=>side+'.'+step));
        const row={...p,created_at:new Date().toISOString(),changed_steps:changed};mock.promptRows.push(clone(row));mock.writes.push(clone(row));return {data:[clone(row)]};
      }
      const rows=mock.promptRows.filter(row=>q.filters.every(([k,v,op])=>op==='lt'?BigInt(row[k])<BigInt(v):String(row[k])===String(v))).sort((a,b)=>BigInt(a.revision)>BigInt(b.revision)?-1:1).slice(0,q.max);
      return {data:clone(q.one?rows[0]||null:rows)};
    }finally{entry.end=performance.now()}
  }
  const llm={models:{list:async()=>[{id:'mock-timing',name:'GLM 5.3 Flash',enabled:true}]},chat:{completions:{create:async function*(options){
    const input=options.messages[1].content,phase=input.includes('\n全局整合规则：')?'integration':'extraction';
    const record=wikiRunTiming.current(),scope=record.branches.current.start!==null?'current':'baseline';
    const call={phase,scope,recordId:record.id,start:performance.now(),end:null,status:'running',inputChars:input.length,tokens:mock.tokenValue};mock.calls.push(call);mock.active++;mock.maxActive=Math.max(mock.maxActive,mock.active);
    try{
      if(options.messages[0].role!=='system'||options.stream!==true)throw Error('模拟模型收到不合法请求协议');
      await delay(mock.modelDelay,options.signal);if(mock.failPhase===phase)throw Error('模拟'+phase+'请求故障');
      let raw;
      if(phase==='extraction'){
        const quote='杰洛特是巫师3中玩家可以操控的猎魔人。';
        if(!input.includes(quote))throw Error('模拟段中缺少杰洛特证据');
        raw={topics:[{id:'T1',name:'巫师3新手角色玩法',definition:'新手理解角色玩法',scope:'新手角色玩法',object_anchor:'巫师3',core_question:'角色入门玩法',includes:['入门'],excludes:['高阶竞技'],quote}],entities:[{id:'M1',name:'杰洛特',definition:'玩家可操控的猎魔人',quote,aliases:[],type_id:'ET-CHAR-PLAYABLE',type:'可玩角色',anchors:{ontology_type:'可玩角色',reality_domain:'虚构',product_ip_scope:'巫师3',identity_attributes:{}},topic_ids:['T1'],primary_topic_id:'T1',facets:{product:[],discipline:[],version:[]},candidate_tags:[],relations:[]}],review:[]};
      }else{
        const topics=JSON.parse(input.split('全部有效话题候选：')[1].split('\n全部有效实体候选：')[0]);
        const entities=JSON.parse(input.split('全部有效实体候选：')[1].split('\n冻结历史话题')[0]);
        raw={topic_groups:[{id:'GT1',members:topics.map(t=>t.id),name:'巫师3新手角色玩法',decision:'keep',reason:'同一具体问题和范围',scope_equivalent:true,boundary_basis:'均为新手角色入门，排除高阶竞技'}],entity_groups:[{id:'GE1',members:entities.map(e=>e.id),name:'杰洛特',topics:['GT1'],primary_topic:'GT1',decision:'keep',reason:'同一虚构游戏中的可玩猎魔人'}]};
      }
      const body=JSON.stringify(raw),mid=Math.floor(body.length/2);
      yield {choices:[{delta:{content:body.slice(0,mid)},finish_reason:null}]};
      await delay(1,options.signal);
      yield {choices:[{delta:{content:body.slice(mid)},finish_reason:'stop'}],usage:{total_tokens:mock.tokenValue}};
      call.status='success';
    }catch(e){call.status=e.name==='AbortError'?'stopped':'failed';throw e}finally{call.end=performance.now();mock.active--}
  }}}};
  window.WorkBuddyCloud={createWorkBuddyCloud(){
    mock.seedLoads++;
    if(!mock.promptRows.length)mock.promptRows.push({revision:'1',parent_revision:'0',snapshot:{baseline:clone(DEFAULT_PROMPTS),current:clone(DEFAULT_PROMPTS)},request_id:crypto.randomUUID(),action:'initial',note:'模拟种子',editor_label:'模拟匿名',changed_steps:[],created_at:new Date().toISOString(),restored_from:null});
    return {database,llm};
  }};
  const originalSet=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
    const record=window.wikiRunTiming?.current();
    const archive=record?.status==='running'&&record.events.some(e=>e.scope==='shared'&&e.key==='archive'&&e.end===null);
    if(mock.archiveFail&&archive&&key===STORE+'files'&&!mock.archiveBefore){mock.archiveBefore=[STORE+'files',STORE+'topics',STORE+'previews',FILE_WORKSPACE_KEY].map(k=>localStorage.getItem(k))}
    if(mock.archiveFail&&archive&&key===FILE_WORKSPACE_KEY){mock.archiveFail=false;mock.archiveTriggered++;mock.archiveOutcome=record.outcome_status;throw new DOMException('模拟档案后置保存失败','QuotaExceededError')}
    return originalSet.call(this,key,value);
  };
  const originalText=File.prototype.text;
  File.prototype.text=async function(){await delay(mock.parseDelay);return originalText.call(this)};
}

let browser,shotPage;
const sessions=[];
async function createSession(){
  const context=await browser.newContext({viewport:{width:1440,height:1100},serviceWorkers:'block'});
  sessions.push(context);await context.addInitScript(installMock);
  const network=[],errors=[],loaded=[];
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url()),entry={method:request.method(),url:request.url(),action:''};network.push(entry);
    if(request.method()!=='GET'){entry.action='禁止';return route.abort('blockedbyclient')}
    if(url.hostname==='127.0.0.1'&&url.port==='19431'){
      const name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
      if(Object.hasOwn(sources,name)){entry.action='真实本地模块';loaded.push(name);return route.fulfill({contentType:name.endsWith('.html')?'text/html':'application/javascript',body:sources[name]})}
      if(name.endsWith('.xlsx')){entry.action='模拟Excel资产';return route.fulfill({contentType:'application/octet-stream',body:Buffer.from('mock-workbook')})}
      entry.action='禁止未知本地资源';return route.abort('blockedbyclient');
    }
    entry.action='模拟外部资源';return route.fulfill({contentType:'application/javascript',body:''});
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
  report.network.push(network);report.pageErrors.push(errors);
  await page.goto('http://127.0.0.1:19431/');
  try{await page.waitForFunction(()=>wikiPromptHistory.getController().status().ready&&workbookReady&&!cloudLoading)}catch(e){const diagnostics=await page.evaluate(()=>({prompt:window.wikiPromptHistory?.getController()?.status(),workbookStatus:document.getElementById('workbookStatus')?.textContent,readiness:document.getElementById('runReadinessText')?.textContent,api:document.getElementById('apiStatus')?.textContent})).catch(()=>null);throw Error('真实初始化未就绪：'+JSON.stringify({errors,diagnostics})+'；'+e.message)}
  await page.evaluate(()=>setPage('lab'));
  check('真实五模块完整加载',()=>assert.deepEqual([...new Set(loaded)].sort(),names.slice().sort()));
  const init=await page.evaluate(()=>({sdk:timingMock.seedLoads,ready:wikiPromptHistory.getController().status().ready,dirty:wikiPromptHistory.getController().status().dirty,writes:timingMock.writes.length,binding:document.getElementById('runBtn').onclick===runCurrent,record:wikiRunTiming.current(),validated:!!validateWorkbook(savedWorkbook),resolved:resolveTagType({type_id:'ET-CHAR-PLAYABLE',type:'可玩角色'},savedWorkbook)}));
  check('SDK初始化、真实controller加载、类型合法、无初始化云写',()=>{assert.equal(init.sdk,1);assert.equal(init.ready,true);assert.equal(init.dirty,false);assert.equal(init.writes,0);assert.equal(init.binding,true);assert.equal(init.record,null);assert.equal(init.validated,true);assert.equal(init.resolved.id,'ET-CHAR-PLAYABLE')});
  return {page,context,network,errors};
}
async function prepare(page,{different=true,parallel=false,parseDelay=0}={}){
  const text=parallel?sample+'\n'+('杰洛特是巫师3中玩家可以操控的猎魔人。\n'.repeat(315))+sample:sample;
  await page.evaluate(ms=>{timingMock.parseDelay=ms;window.parseStarted=performance.now()},parseDelay);
  await page.locator('#fileInput').setInputFiles({name:'杰洛特-模拟回归.txt',mimeType:'text/plain',buffer:Buffer.from(text,'utf8')});
  await page.waitForFunction(()=>!!state.source?.id&&!fileReading);
  const parsed=await page.evaluate(()=>({end:performance.now(),start:parseStarted,record:wikiRunTiming.current(),parts:splitSourceForModel(state.source.text).length}));
  check('运行前真实文件解析不创建计时record',()=>{assert.equal(parsed.record,null);assert.equal(parsed.parts,parallel?2:1);if(parseDelay)assert.ok(parsed.end-parsed.start>=parseDelay)});
  await page.evaluate(diff=>{const c=wikiPromptHistory.getController(),s=c.status().snapshot;if(diff)s.current.step2+='\n模拟回归：保持具体问题粒度。';state.baselinePrompts=structuredClone(s.baseline);state.prompts=structuredClone(s.current);renderPromptEditor();c.changed(s);c.cancelTimer();markResultsStale();timingMock.promptDelay=35;timingMock.workbookDelay=20;timingMock.calls=[];timingMock.maxActive=0},different);
  return parsed;
}
async function startClick(page){
  const before=await page.evaluate(()=>performance.now());await page.locator('#runBtn').click();
  await page.waitForFunction(()=>wikiRunTiming.current()!==null);
  return before;
}
async function finish(page){await page.waitForFunction(()=>{const record=wikiRunTiming.current();return record!==null&&record.end!==null&&record.status!=='running'});return capture(page)}
async function capture(page){return page.evaluate(()=>{const record=structuredClone(wikiRunTiming.current());return {record,cleanup:{activeRequests:wikiRequests.size,activeMockRequests:timingMock.active,isRunning,activeRunControl:activeRunControl!==null},calls:structuredClone(timingMock.calls),queries:structuredClone(timingMock.queries),writes:structuredClone(timingMock.writes),aggregates:record?Object.fromEntries(['baseline','current'].map(scope=>[scope,Object.fromEntries(['extraction_request','integration_request'].map(key=>{const a=wikiRunTiming.aggregate(record,scope,key);return [key,{wall_ms:a.wall_ms,request_ms:a.request_ms,request_count:a.request_count}]}))])):null,maxActive:timingMock.maxActive,ui:{total:document.getElementById('timingTotal').textContent,current:document.getElementById('timingCurrentTotal').textContent,status:document.getElementById('timingStatus').textContent,before:document.getElementById('timingSharedBefore').textContent,after:document.getElementById('timingSharedAfter').textContent},results:{baseline:!!state.baseline,current:!!state.current,eligible:state.current?.preview_eligible,type:state.current?.steps.step5.entity_results[0]?.tags.entity_type,model:state.current?.model}}})}
function intervalsUnion(events){const spans=events.map(e=>[e.start,e.end]).sort((a,b)=>a[0]-b[0]);let end=-Infinity,total=0;for(const [start,stop] of spans){total+=Math.max(0,stop-Math.max(start,end));end=Math.max(end,stop)}return total}
function verifyRecord(name,data,before,status){
  const r=data.record;report.scenarios.push({name,...data});
  check(name+'：真实请求集合、模型请求和运行状态已清理',()=>{assert.equal(data.cleanup.activeRequests,0);assert.equal(data.cleanup.activeMockRequests,0);assert.equal(data.cleanup.isRunning,false);assert.equal(data.cleanup.activeRunControl,false)});
  check(name+'：record字段、点击起点和精确墙钟',()=>{for(const k of ['start','end','elapsed_ms','status','outcome_status','events','branches','caches'])assert.ok(Object.hasOwn(r,k),k);assert.equal(r.status,status);assert.equal(r.outcome_status,status);assert.ok(r.start>=before);assert.ok(r.end>=r.start);assert.equal(r.elapsed_ms,r.end-r.start)});
  check(name+'：最外结算覆盖所有本轮事件',()=>{assert.ok(r.events.length>0);for(const e of r.events){for(const k of ['scope','key','start','end','status','meta'])assert.ok(Object.hasOwn(e,k),k);assert.ok(e.start>=r.start,e.key+'早于本轮');assert.ok(e.end!==null&&e.end>=e.start&&e.end<=r.end,e.key+'未正确结束');assert.notEqual(e.status,'running');assert.equal(e.attempt_id,r.id)}});
  check(name+'：总墙钟覆盖事件union且请求累计不是总耗时',()=>{assert.ok(r.elapsed_ms+0.001>=intervalsUnion(r.events));const requests=r.events.filter(e=>/(?:^|_)request$/.test(e.key));if(requests.length){assert.notEqual(r.elapsed_ms,requests.reduce((n,e)=>n+e.end-e.start,0));assert.ok(r.start<=Math.min(...requests.map(e=>e.start)));assert.ok(r.end>=Math.max(...requests.map(e=>e.end)))}});
  check(name+'：aggregate与实际模型请求次数及union独立核算一致',()=>{for(const scope of ['baseline','current'])for(const [phase,key] of [['extraction','extraction_request'],['integration','integration_request']]){const events=r.events.filter(e=>e.scope===scope&&e.key===key),a=data.aggregates[scope][key],calls=data.calls.filter(c=>c.scope===scope&&c.phase===phase&&c.recordId===r.id);assert.equal(a.request_count,calls.length);assert.ok(Math.abs(a.wall_ms-intervalsUnion(events))<0.001);assert.ok(Math.abs(a.request_ms-events.reduce((n,e)=>n+e.end-e.start,0))<0.001);assert.ok(a.wall_ms<=a.request_ms+0.001)}});
}
async function success(){
  const {page}=await createSession();shotPage=page;
  const initialUI=await page.locator('#runTiming').innerText();check('运行前未执行阶段真实UI',()=>{assert.match(initialUI,/未执行/);assert.match(initialUI,/文件正文已在运行前提取，不计入/)});
  const parsed=await prepare(page,{parseDelay:90});
  const before=await startClick(page),data=await finish(page);verifyRecord('不同Prompt两路成功',data,before,'success');
  const actualParsedText=await page.evaluate(()=>state.source.text);
  check('真实上传文件原文完整且run前解析说明不混同输入长度',()=>{assert.equal(actualParsedText,sample);assert.ok(data.record.start-parsed.start>=90);assert.ok(data.record.events.every(e=>!/pdf|docx|文件解析/i.test(e.key)));assert.notEqual(data.record.elapsed_ms,actualParsedText.length)});
  check('成功：提示词flush至少30ms且词表refresh至少20ms',()=>{const p=data.record.events.find(e=>e.key==='prompt_sync'),w=data.record.events.find(e=>e.key==='workbook_sync');assert.ok(p.end-p.start>=30);assert.ok(w.end-w.start>=20);assert.ok(p.end<=w.start);assert.ok(w.end<=data.record.branches.baseline.start);assert.ok(data.writes.length>=1);assert.ok(data.record.start>=parsed.end)});
  check('成功：串行分支、JSON、输入、校验和展示均有真实计时',()=>{const r=data.record;assert.ok(r.branches.current.start>=r.branches.baseline.end);for(const scope of ['baseline','current']){assert.equal(r.branches[scope].status,'success');for(const key of ['source','input','extraction_request','json_parse','chunk_validation','candidate_assembly','integration_input','integration_request','assembly','display'])assert.ok(r.events.some(e=>e.scope===scope&&e.key===key),scope+'/'+key);assert.equal(data.aggregates[scope].extraction_request.request_count,1);assert.equal(data.aggregates[scope].integration_request.request_count,1)}assert.equal(data.calls.length,4);assert.equal(data.results.eligible,true);assert.equal(data.results.type,'可玩角色');for(const c of data.calls)assert.ok(c.end-c.start>=15)});
  check('成功：全部收尾和档案包含在总耗时，非token及历史模型耗时',()=>{const r=data.record;for(const key of ['version_check','save','final_display','cleanup','archive'])assert.ok(r.events.some(e=>e.scope==='shared'&&e.key===key&&e.meta.phase==='after'));const archive=r.events.find(e=>e.key==='archive'),cleanup=r.events.find(e=>e.key==='cleanup');assert.ok(archive.start>=cleanup.end);assert.ok(r.elapsed_ms>=archive.end-r.start);assert.notEqual(r.elapsed_ms,data.results.model.usage.total_tokens);assert.notEqual(r.elapsed_ms,data.results.model.integration_input.total_chars);assert.notEqual(r.elapsed_ms,data.results.model.elapsed_ms)});
  await page.evaluate(()=>{document.querySelectorAll('#runTiming details').forEach(d=>d.open=true);document.querySelector('.compare-card .card-head h2').textContent='本地模拟耗时对比 · 非真实模型 / 云端';document.getElementById('timingAttempt').prepend('模拟回归 · ')});
  for(const width of [1440,760,390]){await page.setViewportSize({width,height:1100});const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,details:[...document.querySelectorAll('#runTiming details')].every(d=>d.open),rect:document.getElementById('runTiming').getBoundingClientRect().toJSON()}));check('成功结果响应式无溢出 '+width,()=>{assert.ok(layout.scroll<=layout.width+2,JSON.stringify(layout));assert.ok(layout.rect.right<=layout.width+2);assert.equal(layout.details,true)})}
  await page.setViewportSize({width:1440,height:1100});await page.screenshot({path:path.join(root,'outputs/知识Wiki耗时对比-本地.png'),fullPage:true});report.screenshot='outputs/知识Wiki耗时对比-本地.png';
  await page.evaluate(()=>{document.getElementById('promptEditor').value+='\n输入已修改';document.getElementById('promptEditor').dispatchEvent(new Event('input'));wikiPromptHistory.getController().cancelTimer()});
  const stale=await page.evaluate(()=>({record:wikiRunTiming.current(),ui:document.getElementById('timingStatus').textContent}));check('输入改变只标记上轮stale、不重算耗时',()=>{assert.equal(stale.record.stale,true);assert.equal(stale.record.id,data.record.id);assert.equal(stale.record.elapsed_ms,data.record.elapsed_ms);assert.match(stale.ui,/上次运行.*输入已变更/)});
  await page.evaluate(()=>{timingMock.failPrompt=true;timingMock.calls=[]});
  const failedBefore=await startClick(page),failed=await finish(page);verifyRecord('同步失败保留旧结果不冒充成功',failed,failedBefore,'failed');
  check('同步失败：无模型、无分支，即使旧state结果存在',()=>{assert.equal(failed.calls.length,0);assert.equal(failed.results.current,true);assert.equal(failed.results.baseline,true);for(const b of Object.values(failed.record.branches))assert.equal(b.start,null);assert.equal(failed.record.events.find(e=>e.key==='prompt_sync').status,'failed');assert.equal(failed.ui.current,'未执行');assert.match(failed.record.message,/模拟提示词同步断网/)});
}
async function caches(){
  const {page}=await createSession();await prepare(page,{different:false});let before=await startClick(page),data=await finish(page);verifyRecord('相同Prompt复用基线',data,before,'success');
  check('相同Prompt：current cache为1、无请求无复制历史时间',()=>{assert.equal(data.record.caches.current.baseline,1);assert.equal(data.calls.length,2);assert.equal(data.record.events.filter(e=>e.scope==='current'&&/request|json_parse|chunk_validation/.test(e.key)).length,0);assert.ok(data.record.events.some(e=>e.scope==='current'&&e.key==='baseline_clone'));assert.ok(data.record.branches.current.start>=data.record.branches.baseline.end)});
  // 成功保存改变了historySnapshot。先暖当前真实历史键，下一次才是严格相同键的缓存重跑。
  before=await startClick(page);const warm=await finish(page);verifyRecord('当前历史快照缓存暖机',warm,before,'success');
  const historyBefore=await page.evaluate(()=>JSON.stringify([state.previewTopics,state.previews]));
  before=await startClick(page);data=await finish(page);verifyRecord('缓存重跑',data,before,'success');
  const historyAfter=await page.evaluate(()=>JSON.stringify([state.previewTopics,state.previews]));
  check('缓存重跑：baseline命中提炼整合且本轮请求严格为0',()=>{assert.equal(historyAfter,historyBefore);assert.equal(data.record.caches.baseline.extraction,1);assert.equal(data.record.caches.baseline.integration,1);assert.equal(data.record.caches.current.baseline,1);assert.equal(data.calls.filter(c=>c.recordId===data.record.id).length,0);assert.equal(data.record.events.filter(e=>/request|json_parse/.test(e.key)).length,0);assert.equal(data.aggregates.baseline.extraction_request.request_ms,0);assert.equal(data.aggregates.baseline.integration_request.request_ms,0)});
}
async function requestFailure(phase){
  const {page}=await createSession();await prepare(page);await page.evaluate(p=>{timingMock.failPhase=p},phase);const before=await startClick(page),data=await finish(page);verifyRecord(phase+'请求失败',data,before,'failed');
  check(phase+'失败：阶段timer失败且current未开始',()=>{const key=phase==='extraction'?'extraction_request':'integration_request';assert.equal(data.record.events.find(e=>e.key===key).status,'failed');assert.equal(data.record.branches.baseline.status,'failed');assert.equal(data.record.branches.current.start,null);assert.equal(data.results.current,false);assert.match(data.record.message,new RegExp('模拟'+phase+'请求故障'));if(phase==='extraction')assert.equal(data.calls.filter(c=>c.phase==='integration').length,0)});
}
async function parallel(){
  const {page}=await createSession();await prepare(page,{parallel:true});const before=await startClick(page),data=await finish(page);verifyRecord('双段并行聚合',data,before,'success');
  check('两段并行：请求次数等于mock且union严格小于累计',()=>{assert.equal(data.maxActive,2);assert.equal(data.calls.length,6);for(const scope of ['baseline','current']){const a=data.aggregates[scope].extraction_request;assert.equal(a.request_count,2);assert.ok(a.wall_ms<a.request_ms);const events=data.record.events.filter(e=>e.scope===scope&&e.key==='extraction_request');assert.ok(Math.max(...events.map(e=>e.start))<Math.min(...events.map(e=>e.end)))}assert.ok(data.record.branches.current.start>=data.record.branches.baseline.end)});
}
async function stopAndLive(){
  const {page}=await createSession();await prepare(page);await page.evaluate(()=>{timingMock.modelDelay=1500});const before=await startClick(page);
  await page.waitForFunction(()=>timingMock.active===1);
  // 基线阶段默认展开；先验证可折叠，再实际点击重新展开。
  if(await page.locator('#runTiming details').first().evaluate(d=>d.open)){
    await page.locator('#runTiming details').first().locator('summary').click();
    const folded=await page.locator('#runTiming details').first().evaluate(d=>d.open);
    check('阶段明细可手动折叠',()=>assert.equal(folded,false));
  }
  await page.locator('#runTiming details').first().locator('summary').click();
  const first=await page.evaluate(()=>({id:wikiRunTiming.current().id,text:document.getElementById('timingTotal').textContent,open:document.querySelector('#runTiming details').open}));
  await page.waitForFunction(text=>document.getElementById('timingTotal').textContent!==text,first.text);
  const live=await page.evaluate(()=>({status:wikiRunTiming.current().status,open:document.querySelector('#runTiming details').open,text:document.getElementById('timingBaselineStages').textContent}));
  check('live总耗时更新且details不合上、请求显示进行中',()=>{assert.equal(first.open,true);assert.equal(live.open,true);assert.equal(live.status,'running');assert.match(live.text,/进行中/)});
  await page.locator('#stopBtn').click();const data=await finish(page);verifyRecord('实际停止按钮',data,before,'stopped');
  check('停止：所有在途请求终止，timer stopped且清理结束',()=>{assert.equal(data.record.events.find(e=>e.key==='extraction_request').status,'stopped');assert.equal(data.record.branches.baseline.status,'stopped');assert.equal(data.record.branches.current.start,null);assert.equal(data.calls[0].status,'stopped');assert.equal(data.results.current,false);assert.ok(data.record.events.some(e=>e.key==='cleanup'));assert.equal(first.id,data.record.id)});
}
async function repeated(){
  const {page}=await createSession();await prepare(page);await page.evaluate(()=>{timingMock.holdPrompt=true});const before=await startClick(page);await page.waitForFunction(()=>!!timingMock.promptRelease);
  const repeat=await page.evaluate(()=>{const record=wikiRunTiming.current();document.getElementById('runBtn').dispatchEvent(new MouseEvent('click',{bubbles:true}));return {same:wikiRunTiming.current()===record,id:record.id,end:record.end,status:record.status,branches:record.branches,modelCalls:timingMock.calls.length}});
  check('同步等待时重复点击不替换或提前结束record',()=>{assert.equal(repeat.same,true);assert.equal(repeat.end,null);assert.equal(repeat.status,'running');assert.equal(repeat.modelCalls,0)});
  await page.evaluate(()=>{timingMock.modelDelay=120;timingMock.promptRelease()});
  await page.waitForFunction(()=>timingMock.active>0);
  const duringModel=await page.evaluate(()=>{const record=wikiRunTiming.current();document.getElementById('runBtn').dispatchEvent(new MouseEvent('click',{bubbles:true}));return {same:wikiRunTiming.current()===record,id:record.id,end:record.end,status:record.status}});
  check('模型执行时重复点击也不替换或提前结束record',()=>{assert.equal(duringModel.same,true);assert.equal(duringModel.id,repeat.id);assert.equal(duringModel.end,null);assert.equal(duringModel.status,'running')});
  const data=await finish(page);verifyRecord('重复点击后正常完成',data,before,'success');check('重复点击：最终同一record且仅一轮模型',()=>{assert.equal(data.record.id,repeat.id);assert.equal(data.calls.length,4)});
}
async function archiveFailure(){
  const {page}=await createSession();await prepare(page);await page.evaluate(()=>{timingMock.archiveFail=true});const before=await startClick(page),data=await finish(page);verifyRecord('后置archive底层commit失败',data,before,'failed');
  const archive=await page.evaluate(()=>({triggered:timingMock.archiveTriggered,priorOutcome:timingMock.archiveOutcome,before:timingMock.archiveBefore,after:[STORE+'files',STORE+'topics',STORE+'previews',FILE_WORKSPACE_KEY].map(k=>localStorage.getItem(k))}));
  check('archive：仅底层故障、覆盖先前success且事务回滚',()=>{assert.equal(archive.triggered,1);assert.equal(archive.priorOutcome,'success');assert.deepEqual(archive.after,archive.before);assert.equal(data.record.events.find(e=>e.key==='archive').status,'failed');assert.equal(data.results.current,true);assert.equal(data.record.branches.current.status,'success');assert.match(data.record.message,/文件档案处理失败.*保存失败/)});
}
async function workbookFailure(){
  const {page}=await createSession();await prepare(page);await page.evaluate(()=>{timingMock.failWorkbook=true});const before=await startClick(page),data=await finish(page);verifyRecord('词表同步失败',data,before,'failed');check('词表失败：模型与分支不启动',()=>{assert.equal(data.calls.length,0);assert.equal(data.record.branches.baseline.start,null);assert.equal(data.record.events.find(e=>e.key==='workbook_sync').status,'failed')});
}
(async()=>{
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    for(const [name,fn] of [['成功及同步失败',success],['同Prompt及缓存',caches],['提炼失败',()=>requestFailure('extraction')],['整合失败',()=>requestFailure('integration')],['并行聚合',parallel],['停止与live UI',stopAndLive],['重复点击',repeated],['档案后置失败',archiveFailure],['词表失败',workbookFailure]]){
      try{await fn();console.log('已执行场景：'+name)}catch(e){report.harnessErrors.push({scenario:name,reason:e.message,stack:e.stack});console.error('场景执行失败：'+name+'；'+e.message)}
    }
    check('所有页面无JS异常',()=>assert.deepEqual(report.pageErrors.flat(),[]));
    check('全部网络均由route处理且无生产API/模型请求',()=>{const all=report.network.flat();assert.ok(all.length>0);assert.ok(all.every(e=>e.method==='GET'));assert.equal(all.filter(e=>/\/.cloud\//.test(e.url)).length,0);assert.ok(all.every(e=>['真实本地模块','模拟Excel资产','模拟外部资源'].includes(e.action)),JSON.stringify(all.filter(e=>!['真实本地模块','模拟Excel资产','模拟外部资源'].includes(e.action))))});
  }catch(e){report.harnessErrors.push({scenario:'启动',reason:e.message,stack:e.stack})}
  finally{
    check('五个应用文件SHA256完全不变',()=>assert.deepEqual(hashes(),beforeHashes));
    if(!report.screenshot&&shotPage){try{await shotPage.evaluate(()=>{document.querySelector('.compare-card .card-head h2').textContent='本地模拟回归 · 当前失败现场 · 非真实模型 / 云端';document.querySelectorAll('#runTiming details').forEach(d=>d.open=true)});await shotPage.setViewportSize({width:1440,height:1100});await shotPage.screenshot({path:path.join(root,'outputs/知识Wiki耗时对比-本地.png'),fullPage:true});report.screenshot='outputs/知识Wiki耗时对比-本地.png';report.screenshotKind='模拟失败现场'}catch(e){report.harnessErrors.push({scenario:'失败现场截图',reason:e.message})}}
    report.passed=report.tests.filter(t=>t.pass).length;report.failed=report.tests.filter(t=>!t.pass).length;report.status=report.failed||report.harnessErrors.length?'failed':'passed';
    fs.writeFileSync(path.join(root,'outputs/wiki-run-timing-tests.json'),JSON.stringify(report,null,2));
    if(browser)await browser.close();
    console.log(JSON.stringify({status:report.status,passed:report.passed,failed:report.failed,harnessErrors:report.harnessErrors,failures:report.tests.filter(t=>!t.pass)},null,2));
    if(report.status==='failed')process.exitCode=1;
  }
})();
