'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25',phase=process.argv[2],url='https://wiki-mvp-lab.app-tencent.workbuddy.host/';
if(!['before','after'].includes(phase))throw Error('expected before/after');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'),sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const assets=['index.html','semantic-tags.js','pipeline.js','file-manager.js','prompt-history.js'];
const report={phase,kind:'本轮内容简介真实线上SDK只读验收；人工知识仅页面内存',startedAt:new Date().toISOString(),tests:[],assertions:0,passedAssertions:0,errors:[],blockedWrites:[],modelRequests:[],resources:[],layouts:[]};
const A=new Proxy(assert,{get(target,key){if(typeof target[key]!=='function')return target[key];return(...args)=>{report.assertions++;const result=target[key](...args);report.passedAssertions++;return result}}});
function memoryFixture(){
  const storage=()=>Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)]));
  window.introReleaseOriginal={topics:state.previewTopics,entities:state.previews,selected:state.selectedEntity,related:state.relatedDetailId,relatedKey:state.relatedFilterKey,topic:knowledgeNav.topicId,expanded:[...knowledgeNav.expanded],filters:Object.fromEntries(Object.entries(state.filters).map(([key,value])=>[key,value instanceof Set?[...value]:value])),query:document.getElementById('entitySearch').value,storage:storage()};
  const other=controlledTypes().map(label=>tagTypeDefinition(label)).find(t=>t&&t.id!=='ET-PROD-GAME'),game=tagTypeDefinition('ET-PROD-GAME');if(!other||!game)throw Error('缺少真实active主类型');
  const type=other,topic=(id,name,desc)=>({id,name,desc}),entity=(id,name,primary,extra={})=>({id,name,summary:'人工线上内容说明｜'+id,disambiguator:'',primaryTopic:primary,topics:primary?[primary]:[],tags:{type:[type.label],typeId:type.id},sources:[],facts:[],relations:[],aliases:[],semanticFacetsRecognized:true,semanticFacetDetails:[],suggestedFacets:{product:[],discipline:[],version:[]},...extra});
  window.introReleaseFixture={game,type,topic,entity,seed(mode='full'){
    state.previewTopics=[topic('I-COMBAT','人工验收·战斗内容','人工战斗话题摘要｜反馈与技能效果'),topic('I-GROWTH','人工验收·成长内容','人工成长话题摘要｜资源与能力成长'),topic('I-EMPTY','人工孤立话题','人工孤立摘要不要展示')];
    const value='人工明示产品KI',quote=value+'包含该具体能力。';
    state.previews=[entity('I-A','人工战斗能力','I-COMBAT',{topics:['I-COMBAT','I-GROWTH'],semanticFacetDetails:[{dimension:'product',value,basis:'explicit',quote,evidences:[{exact_quote:quote,start:0,end:quote.length}]}]}),entity('I-B','人工成长能力','I-GROWTH',{suggestedFacets:{product:['人工旧产品KI'],discipline:[],version:[]}}),entity('I-C','人工第二战斗能力','I-COMBAT')];
    if(mode==='empty'){state.previewTopics=[];state.previews=[]}
    if(mode==='game'){state.previews=[entity('I-GAME','人工游戏产品','I-COMBAT',{tags:{type:[game.label],typeId:game.id}})]}
    if(mode==='no-topic'){state.previewTopics=[];state.previews=[entity('I-NONE','人工无话题知识',null)]}
    if(mode==='long'){for(let n=0;n<4;n++){const id='I-L'+n;state.previewTopics.push(topic(id,'人工长内容组'+n,'长说明。'.repeat(80)+'话题尾部'+n));state.previews.push(entity('I-LE'+n,'人工长实体'+n,id,{summary:'LongUnbrokenDescription'.repeat(30)+'实体尾部'+n}))}}
    knowledgeNav.topicId=null;knowledgeNav.expanded.clear();state.selectedEntity=null;state.relatedDetailId=null;state.relatedFilterKey=null;for(const key of Object.keys(state.filters))if(state.filters[key] instanceof Set)state.filters[key].clear();state.filters.relation='';document.getElementById('entitySearch').value='';setPage('knowledge');renderKnowledge();return knowledgeIntroduction();
  }};
  return window.introReleaseFixture.seed();
}
async function restore(page){return page.evaluate(()=>{
  const original=window.introReleaseOriginal;if(!original)return true;
  state.previewTopics=original.topics;state.previews=original.entities;state.selectedEntity=original.selected;state.relatedDetailId=original.related;state.relatedFilterKey=original.relatedKey;knowledgeNav.topicId=original.topic;knowledgeNav.expanded=new Set(original.expanded);for(const [key,value]of Object.entries(original.filters))state.filters[key]=Array.isArray(value)?new Set(value):value;document.getElementById('entitySearch').value=original.query;renderKnowledge();
  const now=Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)]));const unchanged=JSON.stringify(now)===JSON.stringify(original.storage);delete window.introReleaseOriginal;delete window.introReleaseFixture;return unchanged;
})}
(async()=>{
 let browser,page,fixtureInstalled=false;
 try{
  const local=JSON.parse(fs.readFileSync(root+'/outputs/wiki-knowledge-introduction-tests.json','utf8'));A.equal(local.status,'passed');
  for(const name of assets)A.equal(sha(fs.readFileSync(root+'/wiki-demo-mvp/'+name)),local.fingerprints.after.application[name],name+' tested source fingerprint');
  report.testedSourceFingerprint=local.fingerprints.after.application;report.localScenarios=local.passed;report.localAssertions=local.assertions.passed;
  browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1080}});
  await context.route('**/*',route=>{const request=route.request(),p=new URL(request.url()).pathname;if(p.includes('/chat/completions')){report.modelRequests.push(p);return route.abort()}if(!['GET','HEAD','OPTIONS'].includes(request.method())){report.blockedWrites.push({method:request.method(),path:p});return route.abort()}return route.continue()});
  if(context.routeWebSocket)await context.routeWebSocket('**/*',socket=>{report.errors.push('unexpected websocket');socket.close()});
  page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));page.on('dialog',dialog=>dialog.dismiss());
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>availableModels.length>0&&workbookReady&&wikiPromptHistory.getController().status().ready,null,{timeout:90000});
  const data=await page.evaluate(async()=>{const versions=[];let cursor=null;while(true){let query=cloud.database.from('wiki_prompt_versions').select('*').order('revision',{ascending:false}).limit(100);if(cursor!==null)query=query.lt('revision',cursor);const response=await query;if(response.error)throw Error(response.error.message);const rows=response.data||[];if(!rows.length)break;versions.push(...rows);const next=Math.min(...rows.map(row=>Number(row.revision)));if(!Number.isFinite(next)||cursor!==null&&next>=cursor)throw Error('历史分页游标异常');cursor=next}versions.sort((a,b)=>Number(a.revision)-Number(b.revision));return{workbook:savedWorkbook,revision:workbookRevision,promptRows:versions,types:controlledTypes().length}});
  report.workbookFingerprint=hash(data.workbook);report.workbookRevision=data.revision;report.promptFingerprint=hash(data.promptRows);report.promptVersions=data.promptRows.length;report.types=data.types;report.tests.push('真实SDK只读词表与完整分页Prompt历史');
  if(phase==='after'){
   const before=JSON.parse(fs.readFileSync(root+'/outputs/wiki-knowledge-introduction-release-before.json','utf8'));A.equal(before.status,'passed');for(const key of ['workbookFingerprint','workbookRevision','promptFingerprint','promptVersions','types'])A.equal(report[key],before[key],key);A.deepEqual(report.testedSourceFingerprint,before.testedSourceFingerprint);report.tests.push('共享配置及测试源码指纹不变');
   for(const name of assets){const response=await page.request.get(url+name);A.ok(response.ok());A.equal((await response.text()).replace(/\r\n/g,'\n'),fs.readFileSync(root+'/wiki-demo-mvp/'+name,'utf8').replace(/\r\n/g,'\n'),name);report.resources.push({name,matchesLocal:true})}
   report.tests.push('五资源与已验证本地版本一致');fixtureInstalled=true;const model=await page.evaluate(memoryFixture),allText=JSON.stringify(model);
   A.ok(allText.includes('人工战斗话题摘要'));A.ok(allText.includes('人工成长话题摘要'));A.ok(allText.includes('人工线上内容说明｜I-A'));A.ok(model.lead.includes('人工明示产品KI'));A.equal(allText.includes('人工旧产品KI'),false);A.equal(allText.includes('人工孤立'),false);A.equal(model.sections.flatMap(s=>s.items).filter(e=>e.id==='I-A').length,1);
   const intro=page.locator('[data-knowledge-introduction]');A.equal(await intro.count(),1);if(await intro.locator('details > summary').count())await intro.locator('details > summary').click();A.ok((await intro.innerText()).includes('人工线上内容说明｜I-A'));report.tests.push('内容简介来源/产品证据/孤立话题/跨ID去重');
   await page.fill('#entitySearch','人工零匹配验收');A.deepEqual(await page.evaluate(()=>knowledgeIntroduction()),model);A.equal(await page.locator('#entityRows [data-entity]').count(),0);
   await page.evaluate(()=>{document.getElementById('entitySearch').value='';state.filters.product.add('人工明示产品KI');renderKnowledge()});A.deepEqual(await page.evaluate(()=>knowledgeIntroduction()),model);A.equal(await page.locator('#entityRows [data-entity]').count(),1);report.tests.push('全库简介不受实际搜索和分面筛选影响');
   const changed=await page.evaluate(()=>{state.previews=state.previews.filter(e=>e.id!=='I-A');state.previews.find(e=>e.id==='I-B').summary='人工新版知识说明KI';renderKnowledge();return knowledgeIntroduction()});A.equal(JSON.stringify(changed).includes('人工线上内容说明｜I-A'),false);A.equal(changed.lead.includes('人工明示产品KI'),false);A.ok(JSON.stringify(changed).includes('人工新版知识说明KI'));report.tests.push('内存增删替换即时更新无旧内容缓存');
   for(const mode of ['empty','game','no-topic']){const fallback=await page.evaluate(mode=>introReleaseFixture.seed(mode),mode);A.ok(fallback.lead.trim());A.equal(fallback.sections.flatMap(s=>s.items).length,mode==='empty'?0:1);A.equal(await intro.count(),1)}report.tests.push('空库/仅游戏/无话题内容兜底');
   await page.evaluate(()=>introReleaseFixture.seed());await page.locator('[data-nav-topic="I-COMBAT"]').click();A.equal(await intro.count(),0);A.ok((await page.locator('.overview-lead').innerText()).includes('人工战斗话题摘要'));report.tests.push('话题页原有摘要不变');
   for(const width of [1440,760,390]){
    await page.setViewportSize({width,height:1080});await page.evaluate(()=>{introReleaseFixture.seed('long');window.scrollTo(0,0)});
    const summary=intro.locator('details > summary');await summary.click({trial:true});await summary.click();A.equal(await intro.locator('details').evaluate(e=>e.open),true);A.ok((await intro.innerText()).includes('实体尾部3'));await summary.focus();await summary.press('Enter');A.equal(await intro.locator('details').evaluate(e=>e.open),false);await summary.press('Space');A.equal(await intro.locator('details').evaluate(e=>e.open),true);
    const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,intro:(()=>{const e=document.querySelector('[data-knowledge-introduction]');return{client:e.clientWidth,scroll:e.scrollWidth}})()}));A.ok(layout.scroll<=width+2);A.ok(layout.intro.scroll<=layout.intro.client+2);report.layouts.push(layout);
   }report.tests.push('1440/760/390普通展开、键盘与全文尾部、无横溢出');
   await page.setViewportSize({width:1440,height:1080});await page.evaluate(()=>introReleaseFixture.seed());await page.screenshot({path:root+'/outputs/知识Wiki内容简介-线上.png',fullPage:true});report.fixtureRestored=await restore(page);fixtureInstalled=false;A.equal(report.fixtureRestored,true);report.tests.push('人工夹具恢复、localStorage未变化');
  }
  A.deepEqual(report.errors,[]);A.deepEqual(report.blockedWrites,[]);A.deepEqual(report.modelRequests,[]);report.status='passed';
 }catch(error){report.status='failed';report.error=error.message;process.exitCode=1}
 finally{if(fixtureInstalled&&page){try{report.fixtureRestored=await restore(page);if(!report.fixtureRestored){report.status='failed';report.restoreError='localStorage changed'}}catch(error){report.restoreError=error.message;report.status='failed'}}report.finishedAt=new Date().toISOString();if(browser)await browser.close();fs.writeFileSync(root+'/outputs/wiki-knowledge-introduction-release-'+phase+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))}
})();
