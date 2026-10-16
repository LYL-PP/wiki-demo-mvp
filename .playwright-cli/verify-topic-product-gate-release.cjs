'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25',phase=process.argv[2],url='https://wiki-mvp-lab.app-tencent.workbuddy.host/';
if(!['before','after'].includes(phase))throw Error('expected before/after');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const report={phase,kind:'真实线上SDK只读配置与本轮显示门槛验收；人工夹具仅页面内存，不修改用户档案',startedAt:new Date().toISOString(),errors:[],blockedWrites:[],modelRequests:[],tests:[]};
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}});
  await context.route('**/*',route=>{const request=route.request(),p=new URL(request.url()).pathname;if(p.includes('/chat/completions')){report.modelRequests.push(p);return route.abort()}if(!['GET','HEAD','OPTIONS'].includes(request.method())){report.blockedWrites.push({method:request.method(),path:p});return route.abort()}return route.continue()});
  const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>availableModels.length>0&&workbookReady&&wikiPromptHistory.getController().status().ready,null,{timeout:90000});
  const data=await page.evaluate(async()=>{
   const versions=[];let cursor=null;
   while(true){let query=cloud.database.from('wiki_prompt_versions').select('*').order('revision',{ascending:false}).limit(100);if(cursor!==null)query=query.lt('revision',cursor);const response=await query;if(response.error)throw Error(response.error.message);const rows=response.data||[];if(!rows.length)break;versions.push(...rows);const next=Math.min(...rows.map(row=>Number(row.revision)));if(!Number.isFinite(next)||cursor!==null&&next>=cursor)throw Error('历史分页游标异常');cursor=next}
   versions.sort((a,b)=>Number(a.revision)-Number(b.revision));
   return{workbook:savedWorkbook,revision:workbookRevision,promptRows:versions,types:controlledTypes().length,models:availableModels.length};
  });
  report.workbookFingerprint=hash(data.workbook);report.workbookRevision=data.revision;report.promptFingerprint=hash(data.promptRows);report.promptVersions=data.promptRows.length;report.types=data.types;report.models=data.models;
  if(phase==='after'){
   const before=JSON.parse(fs.readFileSync(root+'/outputs/wiki-topic-product-gate-release-before.json','utf8'));assert.equal(before.status,'passed');
   assert.equal(report.workbookFingerprint,before.workbookFingerprint);assert.equal(report.workbookRevision,before.workbookRevision);assert.equal(report.promptFingerprint,before.promptFingerprint);assert.equal(report.promptVersions,before.promptVersions);
   report.tests.push('共享词表与分页读取的完整Prompt历史指纹不变');
   report.resources=[];
   for(const name of ['index.html','pipeline.js','semantic-tags.js','file-manager.js','prompt-history.js']){
    const response=await page.request.get(url+name);assert.ok(response.ok());assert.equal((await response.text()).replace(/\r\n/g,'\n'),fs.readFileSync(root+'/wiki-demo-mvp/'+name,'utf8').replace(/\r\n/g,'\n'),name);report.resources.push({name,matchesLocal:true});
   }
   report.tests.push('五资源与通过本地专项的版本一致');
   const original=await page.evaluate(()=>{
    const game=tagTypeDefinition('ET-PROD-GAME'),other=arr(savedWorkbook.sheets[0].rows).map(row=>tagTypeDefinition(row[0])).find(def=>def&&def.id!=='ET-PROD-GAME');if(!game||!other)throw Error('真实词表缺少游戏或非游戏类型');
    window.productReleaseOriginal={topics:state.previewTopics,entities:state.previews,storage:Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)]))};
    const topic=id=>({id,name:'线上人工验收 · '+id,desc:'只验证显示规则，非用户知识、非模型结果'});
    const entity=(id,name,type,topics,primary)=>({id,name,summary:'人工隔离夹具；不写来源档案',topics,primaryTopic:primary,tags:type?{type:[type.label],typeId:type.id}:{type:[]},sources:[],facts:[],relations:[],aliases:[],candidateTags:[]});
    state.previewTopics=['RG','R2G','RS','RM','RP','RU','R0'].map(topic);
    state.previews=[entity('G1','燕云十六声',game,['RG','R2G','RM'],'RG'),entity('G2','第二个游戏产品',game,['R2G'],'R2G'),entity('S1','醉拳',other,['RS','RM'],'RS'),entity('P1','仅主话题的非游戏实体',other,[],'RP'),entity('U1','待确认实体',null,['RU'],'RU')];
    clearFilters();openKnowledgeOverview();setPage('knowledge');
    return{gameType:game.id,otherType:other.id,all:allTopics().length,browse:browseTopics().map(t=>t.id),nav:[...document.querySelectorAll('#topicStrip [data-nav-topic]')].map(n=>n.dataset.navTopic),metrics:[...document.querySelectorAll('.overview-metric strong')].map(n=>Number(n.textContent)),summary:[...document.querySelectorAll('[data-overview-topic]')].map(n=>n.dataset.overviewTopic)};
   });
   assert.equal(original.all,7);assert.deepEqual(original.browse,['RS','RM','RP']);assert.deepEqual(original.nav,original.browse);assert.deepEqual(original.summary,original.browse);assert.deepEqual(original.metrics,[3,5,0,0]);report.fixture=original;
   report.tests.push('单游戏/多游戏/无实体/未确认类型话题隐藏，醉拳与混合及仅primary话题显示，概览一致');
   report.layouts=[];
   for(const width of [1440,760,390]){
    await page.setViewportSize({width,height:1000});await page.evaluate(()=>{clearFilters();openKnowledgeOverview();window.scrollTo(0,0)});
    await page.locator('[data-nav-topic="RM"]').click();assert.equal(await page.locator('[data-parent-topic="RM"]').count(),2);
    await page.locator('[data-nav-entity="S1"][data-parent-topic="RM"]').click();assert.equal(await page.locator('.detail-title').textContent(),'醉拳');
    await page.evaluate(()=>{document.getElementById('entitySearch').value='燕云十六声';renderKnowledge()});assert.equal(await page.locator('[data-nav-topic="RM"] .tree-count').textContent(),'1/2');assert.equal(await page.locator('[data-nav-topic]').count(),3);
    await page.evaluate(()=>{document.getElementById('entitySearch').value='无法匹配的验收文字';renderKnowledge()});assert.equal(await page.locator('[data-nav-topic="RM"] .tree-count').textContent(),'0/2');assert.equal(await page.locator('[data-nav-topic]').count(),3);
    const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(layout.scroll<=layout.width+2);report.layouts.push(layout);
   }
   report.tests.push('1440/760/390普通点击、混合话题所有成员、只匹配游戏与0/N资格保留，无横向溢出');
   const stale=await page.evaluate(()=>{clearFilters();knowledgeNav.topicId='RM';knowledgeNav.expanded.add('RM');state.filters.topic.add('RM');state.previews.find(e=>e.id==='S1').tags={type:[]};renderKnowledge();return{topic:knowledgeNav.topicId,expanded:[...knowledgeNav.expanded],filters:[...state.filters.topic],browse:browseTopics().map(t=>t.id),all:allTopics().length,entities:allEntities().length}});
   assert.equal(stale.topic,null);assert.ok(!stale.expanded.includes('RM'));assert.deepEqual(stale.filters,[]);assert.deepEqual(stale.browse,['RP']);assert.equal(stale.all,7);assert.equal(stale.entities,5);
   report.tests.push('失去唯一确认非游戏成员后隐藏并清理导航/话题筛选，话题实体数据不删除');
   await page.evaluate(()=>{state.previews.find(e=>e.id==='S1').tags=structuredClone(state.previews.find(e=>e.id==='P1').tags);clearFilters();openKnowledgeOverview()});
   await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:root+'/outputs/知识Wiki话题显示门槛-线上.png',fullPage:true});
   const restored=await page.evaluate(()=>{const original=window.productReleaseOriginal;state.previewTopics=original.topics;state.previews=original.entities;clearFilters();openKnowledgeOverview();const storage=Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)]));const unchanged=JSON.stringify(storage)===JSON.stringify(original.storage);delete window.productReleaseOriginal;return unchanged});assert.equal(restored,true);report.tests.push('内存夹具已恢复，localStorage未变化');
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.blockedWrites,[]);assert.deepEqual(report.modelRequests,[]);report.status='passed';console.log(JSON.stringify(report,null,2));
 }catch(error){report.status='failed';report.error=error.message;console.error(error);process.exitCode=1}
 finally{report.finishedAt=new Date().toISOString();fs.writeFileSync(root+'/outputs/wiki-topic-product-gate-release-'+phase+'.json',JSON.stringify(report,null,2));await browser.close()}
})();
