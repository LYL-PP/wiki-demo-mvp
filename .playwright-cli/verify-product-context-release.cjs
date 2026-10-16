'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const {chromium} = require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const root = 'C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25', app = path.join(root, 'wiki-demo-mvp');
const url = 'https://wiki-mvp-lab.app-tencent.workbuddy.host/', phase = process.argv[2], suffix = process.argv[3] || '';
if (!['before', 'after'].includes(phase) || suffix && !/^[a-z0-9-]{1,40}$/.test(suffix)) throw Error('invalid phase/suffix');
const assets = ['index.html','semantic-tags.js','pipeline.js','file-manager.js','prompt-history.js'];
const output = path.join(root, 'outputs', `wiki-product-context-release-${phase}${suffix ? '-' + suffix : ''}.json`);
if (fs.existsSync(output)) throw Error('Existing report will not be overwritten');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, (_key, item) => item instanceof Set ? [...item] : item instanceof Map ? [...item] : item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key,item[key]])) : item);
const digest = value => sha(canonical(value));
const hashes = () => Object.fromEntries(assets.map(name => [name, sha(fs.readFileSync(path.join(app,name)))]));
const suitePath = path.join(root, 'outputs/wiki-product-context-tests-recheck.json'), suiteHash = sha(fs.readFileSync(suitePath));
const protectedFiles = {};
for (const dir of ['outputs','.playwright-cli']) for (const entry of fs.readdirSync(path.join(root,dir), {withFileTypes:true})) {
  if (!entry.isFile()) continue;
  const file = path.join(root,dir,entry.name);
  if (file === output) continue;
  protectedFiles[file] = sha(fs.readFileSync(file));
}
const report = {phase,status:'running',startedAt:new Date().toISOString(),assertions:0,passedAssertions:0,tests:[],resources:[],layouts:[],pageerrors:[],blockedWrites:[],modelRequests:[],webSockets:[],downloads:0,runClicks:0,promptInputEvents:0,oldTestsExecuted:0,realCloudWrites:0,sdkMocked:false,fixtureKind:'人工内存夹具；不读用户浏览器profile，不写知识或shared配置'};
function eq(a,b,label) {report.assertions++; try {assert.deepEqual(a,b);} catch {throw Error('验收断言失败：'+label);} report.passedAssertions++;report.tests.push(label);}
function ok(value,label) {eq(!!value,true,label);}
function verifySuite() {
  const suite = JSON.parse(fs.readFileSync(suitePath));
  eq(suite.status,'passed','新专项已通过'); eq([suite.scenarioCount,suite.passed,suite.failed,suite.blocked],[70,70,0,0],'70场景统计');
  eq(suite.assertions,1373,'1373真实断言'); eq(suite.assertionResults.length,1373,'完整断言记录');
  ok(suite.assertionResults.every(x=>x.status==='passed'),'逐条断言通过');eq(suite.harnessErrors,[],'专项无框架错误');
  ok(suite.protection.unchanged,'新专项保护指纹不变');eq(suite.protection.before,suite.protection.after,'新专项双份指纹相同');
  report.testedSourceFingerprint = hashes();report.localSuiteFingerprint=suiteHash;
  for (const name of assets) for (const side of ['before','after']) eq(report.testedSourceFingerprint[name],suite.protection[side]['wiki-demo-mvp/'+name],name+'对应已测试源码 '+side);
}
async function readShared(page,prefixCount=0) {
  return page.evaluate(async prefixCount => {
    const canonical = value => JSON.stringify(value, (_key,item) => item && typeof item==='object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])) : item);
    const fingerprint = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value))))).map(x=>x.toString(16).padStart(2,'0')).join('');
    const readWorkbook = async () => {const r=await cloud.database.from('wiki_shared_tag_workbook').select('id,workbook,revision').eq('id',1).maybeSingle();if(r.error||!r.data)throw Error('workbook read');return r.data;};
    const first=await readWorkbook(),versions=[],seen=new Set();let cursor=null,pages=0;
    while(true) {
      let query=cloud.database.from('wiki_prompt_versions').select('*').order('revision',{ascending:false}).limit(100);
      if(cursor!==null)query=query.lt('revision',cursor);
      const r=await query;pages++;if(r.error||!Array.isArray(r.data))throw Error('history read');if(!r.data.length)break;
      let previous=cursor===null?null:BigInt(cursor);
      for(const row of r.data){if(!/^\d+$/.test(String(row.revision)))throw Error('revision');const rev=BigInt(row.revision),key=rev.toString();if(seen.has(key)||previous!==null&&rev>=previous)throw Error('cursor');seen.add(key);versions.push(row);previous=rev;}
      cursor=previous.toString();
    }
    if(!versions.length)throw Error('empty history');
    const head=await cloud.database.from('wiki_prompt_versions').select('*').order('revision',{ascending:false}).limit(1);
    if(head.error||canonical(head.data?.[0])!==canonical(versions[0])||canonical(first)!==canonical(await readWorkbook()))throw Error('concurrent config');
    if(canonical(savedWorkbook)!==canonical(first.workbook)||String(workbookRevision)!==String(first.revision))throw Error('loaded workbook');
    const history=wikiPromptHistory.getController().status();
    if(!history.ready||history.busy||history.dirty||history.blocked||history.error||String(history.base?.revision)!==String(versions[0].revision))throw Error('history readiness');
    if(canonical({baseline:state.baselinePrompts,current:state.prompts})!==canonical(versions[0].snapshot))throw Error('loaded prompts');
    versions.reverse();return {workbookFingerprint:await fingerprint(savedWorkbook),workbookRevision:first.revision,types:controlledTypes().length,promptFingerprint:await fingerprint(versions),promptPrefixFingerprint:await fingerprint(versions.slice(0,prefixCount)),promptVersions:versions.length,promptHeadRevision:versions.at(-1).revision,historyPagination:{pages,uniqueVersions:seen.size,terminalEmptyPage:true}};
  },prefixCount);
}
async function memory(page) {
  return page.evaluate(async () => {
    const history=wikiPromptHistory.getController().status();
    const value={state,nav:knowledgeNav,workbook:savedWorkbook,draftWorkbook,workbookRevision,workbookDraftRevision,workbookDirty,fileWorkspaceRaw,fileRevision,history:{snapshot:history.snapshot,base:history.base,cloudHead:history.cloudHead,pending:history.pending,generation:history.generation,dirty:history.dirty,blocked:history.blocked,error:history.error}};
    const str=JSON.stringify(value,(_key,item)=>item instanceof Set?[...item]:item instanceof Map?[...item]:item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item);
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  });
}
async function stateFields(page) {
  return page.evaluate(async()=>{const result={};for(const [key,value] of Object.entries(state)){const str=JSON.stringify(value,(_key,item)=>item instanceof Set?[...item]:item instanceof Map?[...item]:item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item);result[key]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str)))).map(x=>x.toString(16).padStart(2,'0')).join('');}return result;});
}
async function memorySections(page) {
  return page.evaluate(async()=>{
    const history=wikiPromptHistory.getController().status();
    const parts={state,nav:knowledgeNav,workbook:savedWorkbook,draftWorkbook,workbookRevision,workbookDraftRevision,workbookDirty,fileWorkspaceRaw,fileRevision,history:{snapshot:history.snapshot,base:history.base,cloudHead:history.cloudHead,pending:history.pending,generation:history.generation,dirty:history.dirty,blocked:history.blocked,error:history.error}};
    const result={};for(const [key,value] of Object.entries(parts)){const str=JSON.stringify(value,(_key,item)=>item instanceof Set?[...item]:item instanceof Map?[...item]:item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item);result[key]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str)))).map(x=>x.toString(16).padStart(2,'0')).join('');}return result;
  });
}
async function storage(page,context) {
  return {web:await page.evaluate(()=>{const entries=s=>Object.fromEntries(Object.keys(s).sort().map(k=>[k,s.getItem(k)]));return {local:entries(localStorage),session:entries(sessionStorage)};}),context:await context.storageState({indexedDB:true})};
}
async function restore(page) {
  return page.evaluate(()=>{
    const original=window.__productReleaseOriginal;if(!original)return false;
    Object.assign(state,original.state);knowledgeNav.topicId=original.nav.topicId;knowledgeNav.expanded=original.nav.expanded;
    document.getElementById('entitySearch').value=original.search;document.getElementById('knowledgeExportScope').value=original.exportScope;
    setPage(original.state.page);document.querySelectorAll('#knowledgePage details').forEach((el,i)=>{if(i<original.details.length)el.open=original.details[i];});
    delete window.__productReleaseFixture;delete window.__productReleaseOriginal;return true;
  });
}
async function installFixture(page) {
  return page.evaluate(()=>{
    const types=savedWorkbook.sheets[0].rows.slice(4).filter(r=>String(r[7]||'').trim()==='active').map(r=>({id:String(r[0]).trim(),label:String(r[2]).trim()}));
    const type=types.find(t=>/^(道具|资源|材料|武器|技能|成长系统)$/.test(t.label))||types.find(t=>t.id!=='ET-PROD-GAME');
    const gameType=types.find(t=>t.id==='ET-PROD-GAME');if(!type||!gameType)throw Error('active fixture types');
    window.__productReleaseOriginal={state:{...state},nav:{topicId:knowledgeNav.topicId,expanded:knowledgeNav.expanded},search:document.getElementById('entitySearch').value,exportScope:document.getElementById('knowledgeExportScope').value,details:[...document.querySelectorAll('#knowledgePage details')].map(x=>x.open)};
    window.__productReleaseAudit={runClicks:0,promptInputEvents:0};document.getElementById('runBtn').addEventListener('click',()=>__productReleaseAudit.runClicks++);
    for(const id of ['sharedPromptEditor','baselinePromptEditor','promptEditor'])document.getElementById(id).addEventListener('input',()=>__productReleaseAudit.promptInputEvents++);
    const product='燕云十六声',text='# 燕云十六声：道具研究\n《燕云十六声》是一款游戏，本节讨论道具作用。\n佛光玉可以提升角色的战斗能力。\n破竹樽可以用于战斗组合。\n《燕云十六声》提供角色成长玩法。';
    const file={id:'REL-PC-F',revision:1,name:'人工产品归属验收.txt',text,legacy:false};
    const proof=quote=>{const start=text.indexOf(quote);return {exact_quote:quote,quote,start,end:start+quote.length,fileId:file.id,revision:1,file:file.name};};
    const topic={id:'REL-PC-T',name:'燕云十六声：道具玩法',object_anchor:product,desc:'人工验收话题，非真实用户知识',evidences:[proof('《燕云十六声》是一款游戏，本节讨论道具作用。')]};
    const boundTopic={...structuredClone(topic),fileContributions:[{fileId:file.id,revision:1,data:structuredClone(topic)}]};
    const make=(id,name,quote,scope,tag)=>{
      const data={id,name,summary:'人工产品补全验收',aliases:[],disambiguator:'',identityAnchors:{ontologyType:tag.label,realityDomain:'游戏虚构',productIpScope:scope,version:null,identityAttributes:{}},identityDecision:'confirmed',primaryTopic:topic.id,topics:[topic.id],tags:{type:[tag.label],typeId:tag.id},reviewReasons:[],semanticFacetsRecognized:true,suggestedFacets:{product:[],discipline:[],version:[]},semanticFacetDetails:[],candidateTags:[],sources:[proof(quote)],facts:[quote],relations:[]};
      return {...structuredClone(data),fileContributions:[{fileId:file.id,revision:1,data:structuredClone(data)}]};
    };
    const entityA=make('REL-PC-A','佛光玉','佛光玉可以提升角色的战斗能力。',product,type),entityB=make('REL-PC-B','破竹樽','破竹樽可以用于战斗组合。',null,type),game=make('REL-PC-G',product,'《燕云十六声》提供角色成长玩法。',product,gameType);
    state.previews=[entityA,entityB,game];state.previewTopics=[boundTopic];state.files=[file];state.selectedEntity=null;state.relatedDetailId=null;
    state.filters={...state.filters,...Object.fromEntries(['topic','type','product','discipline','version','candidate'].map(k=>[k,new Set()])),relation:''};knowledgeNav.topicId=null;knowledgeNav.expanded=new Set();document.getElementById('entitySearch').value='';document.getElementById('knowledgeExportScope').value='all';
    window.__productReleaseFixture={file,topic:boundTopic,entities:state.previews,proof,product};setPage('knowledge');
    return {typeId:type.id,typeLabel:type.label,gameTypeId:gameType.id};
  });
}
async function exercise(page,context) {
  report.fixtureTypes=await installFixture(page);
  const fixtureMemory=await memory(page),fixtureStorage=await storage(page,context);
  const initial=await page.evaluate(()=>state.previews.map(e=>({id:e.id,facets:entitySemanticFacets(e,knowledgeSemanticContexts())})));
  for(const id of ['REL-PC-A','REL-PC-B']){
    const r=initial.find(e=>e.id===id).facets;eq(r.suggestedFacets.product,['燕云十六声'],id+'主话题有证据补全产品');eq(r.suggestedFacets.version,[],id+'不继承版本');
    ok(r.facetDetails.some(d=>d.basis==='contextual'&&d.entityQuote&&!d.entityQuote.includes('燕云十六声')&&d.context.topicEvidences.length),id+'分离产品与实体原文证据');
  }
  const boundaries=await page.evaluate(()=>{
    const f=__productReleaseFixture,base=structuredClone({entity:f.entities[0],entities:f.entities,topics:[f.topic],files:[f.file]}),resolve=x=>entitySemanticFacets(x.entity,{...x,workbook:savedWorkbook});
    const cases={};
    for(const mutation of ['file','revision','topic']){const x=structuredClone(base);if(mutation==='file')x.files=[];if(mutation==='revision')x.files[0].revision++;if(mutation==='topic')x.topics=[];cases[mutation]=resolve(x).suggestedFacets.product;}
    const conflict=structuredClone(base);conflict.entity.fileContributions[0].data.identityAnchors.productIpScope='另一款游戏';cases.conflict=resolve(conflict).suggestedFacets.product;
    const legacy=structuredClone(base);legacy.files[0].text=null;legacy.files[0].legacy=true;const lr=resolve(legacy);cases.legacy={products:lr.suggestedFacets.product,diagnostic:lr.productContextIssues.some(i=>i.code==='PRODUCT_CONTEXT_EVIDENCE_UNVERIFIABLE')};
    const direct=structuredClone(base),data=direct.entity.fileContributions[0].data,quote='直接明示产品中的佛光玉仅为人工测试对象。';direct.files[0].text+='\n'+quote;const start=direct.files[0].text.indexOf(quote),q={quote,exact_quote:quote,start,end:start+quote.length,fileId:f.file.id,revision:1};data.sources=[q];data.suggestedFacets.product=['直接明示产品'];data.semanticFacetDetails=[{dimension:'product',value:'直接明示产品',basis:'explicit',quote,evidences:[q],source:{fileId:f.file.id,revision:1}}];const dr=resolve(direct);cases.direct={products:dr.suggestedFacets.product,contextual:dr.facetDetails.some(d=>d.basis==='contextual')};
    const cached=structuredClone(base),cd=cached.entity.fileContributions[0].data,old=resolve(cached);cd.suggestedFacets=old.suggestedFacets;cd.semanticFacetDetails=old.facetDetails;normalizeStoredEntityTags(cd,savedWorkbook);cached.files=[];cached.topics=[];cases.cache=resolve(cached).suggestedFacets.product;
    const assoc=structuredClone(base),ad=assoc.entity.fileContributions[0].data;ad.identityAnchors.productIpScope=null;ad.primaryTopic='REL-PC-OTHER';ad.topics=['REL-PC-OTHER',f.topic.id];assoc.topics.push({id:'REL-PC-OTHER',name:'共享对象',object_anchor:'共享能力',fileContributions:[{fileId:f.file.id,revision:1,data:{name:'共享对象',object_anchor:'共享能力',evidences:[f.proof('佛光玉可以提升角色的战斗能力。')]}}]});cases.associated=resolve(assoc).suggestedFacets.product;
    return cases;
  });
  for(const key of ['file','revision','topic','conflict','cache','associated'])eq(boundaries[key],[],key+'失效或冲突不补全');
  eq(boundaries.legacy,{products:[],diagnostic:true},'缺少正文历史诊断而非猜产品');eq(boundaries.direct,{products:['直接明示产品'],contextual:false},'直接明示产品优先');
  eq(await memory(page),fixtureMemory,'纯读取与边界夹具不修改业务内存');eq(await storage(page,context),fixtureStorage,'纯读取不修改任何storage');
  await page.locator('[data-entity="REL-PC-A"]').click();
  const detail=await page.locator('#entityDetail').innerText();ok(detail.includes('燕云十六声')&&detail.includes('主话题上下文'),'线上详情显示产品与依据');ok(detail.includes('产品证据：')&&detail.includes('实体证据：'),'线上详情分离两类证据');
  async function openFilters(){const d=page.locator('#filterGroups').locator('xpath=ancestor::details[1]');if(!await d.evaluate(el=>el.open))await d.locator('summary').click();ok(await page.locator('[data-filter-key="product"][data-filter-value="燕云十六声"]').isVisible(),'普通点击展开产品筛选');}
  const XLSX=require(path.join(root,'.playwright-cli/xlsx-0.18.5-export-test.min.js'));
  for(const scope of ['all','filtered']){
    if(scope==='filtered'){await openFilters();await page.locator('[data-filter-key="product"][data-filter-value="燕云十六声"]').click();await page.locator('#entitySearch').fill('破竹樽');}
    await page.locator('#knowledgeExportScope').selectOption(scope);
    const snap=await page.evaluate(scope=>knowledgeExportSnapshot(scope),scope),sheet=snap.sheets.find(s=>s.name==='实体清单'),row=sheet.rows.find(r=>r[sheet.headers.indexOf('实体ID')]==='REL-PC-B');
    eq(snap.counts.entities,scope==='all'?3:1,scope+'导出实体范围');eq(row[sheet.headers.indexOf('产品')],'燕云十六声',scope+'Excel产品与页面一致');
    ok(JSON.parse(row[sheet.headers.indexOf('分面依据详情JSON')]).some(d=>d.basis==='contextual'&&d.context.roles.some(r=>r.kind==='confirmed-game-entity')),scope+'筛选保留全库锚点支持');
    const beforeMemory=await memory(page),beforeStorage=await storage(page,context);
    const promise=page.waitForEvent('download');await page.locator('#knowledgeExportBtn').click();const download=await promise;
    const file=path.join(root,'outputs',`wiki-product-context-release-${scope}${suffix?'-'+suffix:''}.xlsx`);if(fs.existsSync(file))throw Error('Existing xlsx');await download.saveAs(file);await page.waitForFunction(()=>!knowledgeExportBusy);
    eq(await download.failure(),null,scope+'真实xlsx下载成功');const book=XLSX.read(fs.readFileSync(file),{type:'buffer',cellFormula:true});eq(book.SheetNames,snap.sheets.map(s=>s.name),scope+'五表读回');
    for(const table of snap.sheets){const rows=XLSX.utils.sheet_to_json(book.Sheets[table.name],{header:1,defval:'',raw:true}),expected=[table.headers,...table.rows];if(table.name==='导出说明'){const clock=rows.find(r=>r[0]==='导出时间'),expectedClock=expected.find(r=>r[0]==='导出时间');ok(typeof clock?.[1]==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(clock[1])&&clock[1]>=snap.exportedAt,scope+'真实点击生成导出时间');ok(download.suggestedFilename().includes(clock[1].replace(/[:.]/g,'-')),scope+'导出时间与下载名一致');expectedClock[1]=clock[1];}eq(rows,expected,scope+'/'+table.name+'逐单元格读回一致（仅实时导出时间独立校验）');
      for(const [address,cell]of Object.entries(book.Sheets[table.name]))if(!address.startsWith('!')){eq(cell.t,'s',scope+'强制文本');eq(cell.f,undefined,scope+'无公式');eq(cell.l,undefined,scope+'无超链接');}}
    eq(await memory(page),beforeMemory,scope+'导出不修改业务');eq(await storage(page,context),beforeStorage,scope+'导出不修改storage');
  }
  await page.locator('#clearFiltersBtn').click();await page.locator('#entitySearch').fill('');
  for(const width of [1440,760,390]){
    await page.setViewportSize({width,height:1050});await openFilters();await page.locator('[data-filter-key="product"][data-filter-value="燕云十六声"]').click();
    eq(await page.evaluate(()=>knowledgeScopedEntities().map(e=>e.id)),['REL-PC-A','REL-PC-B','REL-PC-G'],width+'产品筛选可匹配补全实体');
    await page.locator('[data-entity="REL-PC-B"]').focus();await page.locator('[data-entity="REL-PC-B"]').press('Enter');eq(await page.evaluate(()=>state.selectedEntity),'REL-PC-B',width+'键盘打开实体');
    ok((await page.locator('#entityDetail').innerText()).includes('主话题上下文'),width+'实体详情依据可见');
    const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,panels:['topicStrip','entityRows','entityDetail'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return{id,left:r.left,right:r.right,width:r.width};})}));
    ok(layout.scrollWidth<=width+1,width+'无页面横向溢出');for(const p of layout.panels)ok(p.width>0&&p.left>=-1&&p.right<=width+1,width+'/'+p.id+'布局正常');report.layouts.push(layout);await page.locator('#clearFiltersBtn').click();
  }
  await page.setViewportSize({width:1440,height:1050});await page.locator('[data-entity="REL-PC-A"]').click();await page.evaluate(()=>{scrollTo(0,0);document.getElementById('toast').classList.remove('show');});
  const screenshot=path.join(root,'outputs',`知识Wiki产品归属-线上${suffix?'-'+suffix:''}.png`);if(fs.existsSync(screenshot))throw Error('Existing screenshot');
  await page.screenshot({path:screenshot,fullPage:true,mask:[page.locator('textarea')],maskColor:'#e5e7eb'});report.screenshot=screenshot;
  const audit=await page.evaluate(()=>__productReleaseAudit);report.runClicks=audit.runClicks;report.promptInputEvents=audit.promptInputEvents;eq(audit,{runClicks:0,promptInputEvents:0},'不运行模型不编辑提示词');
  eq(await storage(page,context),fixtureStorage,'全部人工验收结束storage不变');
}
(async()=>{
  let browser,context,page,baselineStorage,baselineMemory,initialShared,restored=false;
  const loaded=new Map(),jobs=[];
  try{
    verifySuite();let before;
    if(phase==='after'){before=JSON.parse(fs.readFileSync(path.join(root,'outputs/wiki-product-context-release-before-recheck.json')));eq(before.status,'passed','发布前基线通过');eq(before.testedSourceFingerprint,report.testedSourceFingerprint,'发布前后源码相同');eq(before.localSuiteFingerprint,suiteHash,'已完成专项未改变');}
    browser=await chromium.launch({channel:'chrome',headless:true});context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1050},acceptDownloads:true});
    const isModel=pathname=>/\/(?:chat\/completions|completions|responses|embeddings|rerank|inference|invoke)(?:\/|$)/i.test(pathname);
    await context.route('**/*',route=>{const req=route.request(),pathname=new URL(req.url()).pathname,method=req.method();if(isModel(pathname))report.modelRequests.push({method,path:pathname});if(!['GET','HEAD','OPTIONS'].includes(method))report.blockedWrites.push({method,path:pathname});if(isModel(pathname)||!['GET','HEAD','OPTIONS'].includes(method))return route.abort('blockedbyclient');return route.continue();});
    ok(typeof context.routeWebSocket==='function','支持强制WS拦截');await context.routeWebSocket('**/*',socket=>{report.webSockets.push('blocked');socket.close();});
    page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.pageerrors.push({name:e.name,fingerprint:sha(e.message)}));page.on('dialog',d=>d.dismiss());page.on('download',()=>report.downloads++);
    page.on('response',response=>{const u=new URL(response.url());if(u.origin!==new URL(url).origin)return;const name=u.pathname==='/'?'index.html':u.pathname.slice(1);if(!assets.includes(name)||!['document','script'].includes(response.request().resourceType()))return;jobs.push((async()=>loaded.set(name,{status:response.status(),hash:sha(await response.body())}))().catch(()=>loaded.set(name,{error:true})));});
    const response=await page.goto(url,{waitUntil:'domcontentloaded'});ok(response?.ok(),'线上主页面HTTP成功');
    await page.waitForFunction(()=>availableModels.length>0&&workbookReady&&fileManagerReady&&wikiPromptHistory.getController()?.status().ready&&!wikiPromptHistory.getController().status().busy&&!cloudLoading&&!workbookBusy,null,{timeout:90000});
    initialShared=await readShared(page,phase==='after'?before.shared.promptVersions:0);report.shared=initialShared;ok(initialShared.types>0,'真实active词表就绪');ok(initialShared.historyPagination.terminalEmptyPage,'完整提示词历史读至空页');
    baselineMemory=await memory(page);const baselineSections=await memorySections(page),baselineFields=await stateFields(page);baselineStorage=await storage(page,context);report.memoryInitial=baselineMemory;report.storageInitial=digest(baselineStorage);await Promise.all(jobs);
    for(const name of assets){const fetched=await page.evaluate(async name=>{const r=await fetch(new URL(name,location.href),{method:'GET',cache:'no-store'}),b=await r.arrayBuffer();return {status:r.status,hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b))).map(x=>x.toString(16).padStart(2,'0')).join('')};},name);
      eq(fetched.status,200,name+'线上GET成功');eq(loaded.get(name)?.status,200,name+'实际浏览器加载');eq(loaded.get(name)?.hash,fetched.hash,name+'加载与实时GET逐字节相同');
      const matchesLocal=fetched.hash===report.testedSourceFingerprint[name];if(phase==='after')ok(matchesLocal,name+'线上与已测源码逐字节一致');report.resources.push({name,online:fetched.hash,local:report.testedSourceFingerprint[name],matchesLocal});}
    if(phase==='after'){eq(initialShared.workbookFingerprint,before.shared.workbookFingerprint,'发布前后共享词表不变');eq(initialShared.workbookRevision,before.shared.workbookRevision,'词表版本不变');eq(initialShared.promptPrefixFingerprint,before.shared.promptFingerprint,'发布前提示词历史版本全保留');ok(initialShared.promptVersions>=before.shared.promptVersions,'提示词历史仅追加');report.promptHistoryChangedDuringRelease=initialShared.promptVersions!==before.shared.promptVersions;await exercise(page,context);restored=await restore(page);ok(restored,'人工夹具引用全部恢复');}
    report.memoryFinal=await memory(page);if(report.memoryFinal!==baselineMemory){const finalSections=await memorySections(page);report.changedMemorySections=Object.keys(baselineSections).filter(k=>baselineSections[k]!==finalSections[k]);const finalFields=await stateFields(page);report.changedStateFields=[...new Set([...Object.keys(baselineFields),...Object.keys(finalFields)])].filter(k=>baselineFields[k]!==finalFields[k]);}eq(report.memoryFinal,baselineMemory,'验收结束所有业务内存不变');const finalStorage=await storage(page,context);report.storageFinal=digest(finalStorage);eq(finalStorage,baselineStorage,'验收结束local/session/cookies/indexeddb完整不变');
    report.sharedFinal=await readShared(page,phase==='after'?before.shared.promptVersions:0);eq(report.sharedFinal,initialShared,'验收结束真实共享配置不变');eq(hashes(),report.testedSourceFingerprint,'源码验收前后未改变');eq(sha(fs.readFileSync(suitePath)),suiteHash,'原专项报告未覆盖');
    eq(report.pageerrors,[],'零页面错误');eq(report.blockedWrites,[],'零云写尝试');eq(report.modelRequests,[],'零模型请求');eq(report.webSockets,[],'零WS尝试');eq(report.downloads,phase==='after'?2:0,'实际下载次数');report.status='passed';
  }catch(error){report.status='failed';const message=String(error.message||'');report.error=message.startsWith('验收断言失败：')?message:'执行失败（外部错误已脱敏）';report.errorFingerprint=sha(String(error.stack||message));console.error(report.error);process.exitCode=1;}
  finally{
    if(page&&phase==='after'&&!restored){try{report.fixtureRestored=await restore(page);if(baselineMemory)eq(await memory(page),baselineMemory,'失败收尾业务还原');if(baselineStorage)eq(await storage(page,context),baselineStorage,'失败收尾storage不变');}catch(e){report.cleanupErrorFingerprint=sha(String(e.message));report.status='failed';process.exitCode=1;}}
    if(browser)await browser.close();
    report.protectedFilesCount=Object.keys(protectedFiles).length;report.protectedFilesUnchanged=Object.entries(protectedFiles).every(([file,hash])=>fs.existsSync(file)&&sha(fs.readFileSync(file))===hash);
    if(!report.protectedFilesUnchanged||report.blockedWrites.length||report.modelRequests.length||report.pageerrors.length||report.webSockets.length){report.status='failed';process.exitCode=1;}
    report.finishedAt=new Date().toISOString();fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({status:report.status,phase,assertions:report.assertions,passedAssertions:report.passedAssertions,shared:report.shared,downloads:report.downloads,error:report.error,output},null,2));
  }
})();
