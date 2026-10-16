'use strict';
const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25',base='https://wiki-mvp-lab.app-tencent.workbuddy.host/',mode=process.argv[2]||'local';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{const q=r.request(),u=new URL(q.url());if(q.url().includes('/.cloud/')&&!['GET','HEAD','OPTIONS'].includes(q.method())){if(mode==='smoke'&&u.pathname==='/'+'.cloud/llm/chat/completions')return r.continue();writes.push(q.method()+' '+u.pathname);return r.abort()}if(mode!=='online'&&u.origin===new URL(base).origin){const name=u.pathname==='/'?'index.html':u.pathname.slice(1);if(['index.html','semantic-tags.js','pipeline.js','file-manager.js'].includes(name))return r.fulfill({contentType:name.endsWith('.js')?'application/javascript':'text/html',body:fs.readFileSync(root+'/wiki-demo-mvp/'+name,'utf8')})}return r.continue()});
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>workbookReady&&availableModels.length>0,null,{timeout:60000});
 const expected=JSON.parse(fs.readFileSync(root+'/outputs/wiki-semantic-workbook-v3.json','utf8'));
 if(mode!=='online')await page.evaluate(w=>{validateWorkbook(w);validateWorkbookEvolution(w,savedWorkbook);savedWorkbook=structuredClone(w);draftWorkbook=structuredClone(w);workbookRevision=3;workbookDirty=false;const realCloud=cloud;cloud={...realCloud,database:{from(){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:{id:1,revision:3,workbook:structuredClone(w)}})};return q}}}},expected.workbook);
 const actual=await page.evaluate(async()=>{const snapshot=await refreshWorkbookForRun();validateWorkbook(snapshot.workbook);return snapshot});
 assert.equal(actual.revision,3);assert.deepEqual(actual.workbook,expected.workbook);
 const tests=await page.evaluate(()=>{const tests=[],ok=(name,value)=>{assertion(value,name);tests.push(name)},assertion=(value,name)=>{if(!value)throw Error(name)};
 ok('104个active主类型',controlledTypes().length===104);ok('21条受控Relation保持',controlledRelations().length===21);
 for(const [name,id] of [['游戏','ET-PROD-GAME'],['武学系统','ET-SYS-SKILL'],['Buff','ET-CONTENT-STATUS'],['属性','ET-CONTENT-ATTRIBUTE'],['招式','ET-CONTENT-SKILL'],['BGM资产','ET-AUDIO-MUSIC-ASSET']])ok(name+'唯一归一',tagTypeDefinition(name)?.id===id);
 for(const id of ['ET-CONTENT-STATUS','ET-SYS-SKILL','ET-CONTENT-BUILD']){const t=tagTypeDefinition(id);ok(id+'标准名保真且无需误复核',controlledTypes().includes(t.label)&&!entityTypeReviewNeeded({tags:{type:[t.label],typeId:id}}));}
 ok('空主类型仍不强填',!resolveTagType({name:'燕云十六声',type:null,type_id:null}).id);
 const snap=workbookSnapshot(),input=buildModelInput(DEFAULT_PROMPTS,'测试游戏中银剑施加中毒。',snap,{historySnapshot:{topics:[],entities:[]}});ok('完整定义和别名进入冻结请求',input.includes('ET-CONTENT-STATUS')&&input.includes('武学系统')&&input.includes('inferred'));
 draftWorkbook.sheets[0].rows.find(r=>r[0]==='ET-PROD-GAME')[2]='未保存草稿';workbookDirty=true;ok('未保存草稿不生效',tagTypeDefinition('游戏')?.label==='游戏产品');draftWorkbook=structuredClone(savedWorkbook);workbookDirty=false;
 setPage('workbook');workbookSheet=0;renderWorkbook();ok('第九列同义名称可编辑',document.getElementById('workbookTable').textContent.includes('同义名称'));return tests;});
 const report={mode,revision:3,types:104,relations:21,tests,assets:[],model:null};
 if(mode==='online')for(const name of ['index.html','semantic-tags.js','pipeline.js','file-manager.js','游戏研发知识Wiki受控索引标签词表.xlsx']){const r=await page.request.get(base+encodeURIComponent(name)+'?semantic=v3');assert(r.ok());assert((await r.body()).equals(fs.readFileSync(root+'/wiki-demo-mvp/'+name)),name);report.assets.push({name,same:true})}
 if(mode==='smoke')report.model=await page.evaluate(async()=>{
 const source='示例游戏《星河》在v2版本中，银剑是装备在手中的武器。银剑攻击命中后施加中毒；中毒是一种每秒造成5点伤害、持续3秒的减益状态。生命值是角色承受伤害的数值属性。武学系统管理技能学习、配置与升级。';
 const snapshot=workbookSnapshot(),part={index:1,start:0,end:source.length,text:source};
 const model=availableModels.find(m=>m.id.includes('GLM-5.3-Flash'))||availableModels.find(m=>/glm.*flash/i.test(m.id));if(!model)throw Error('无合适smoke模型');
 const context={snapshot,parts:[part],part,sourceName:'语义标签真实冒烟样本.txt',modelId:model.id,segmentIndex:1,segmentCount:1,historySnapshot:{topics:[],entities:[]},runControl:{cancelled:false}};
 const extracted=await requestWikiJson(buildModelInput(DEFAULT_PROMPTS,source,snapshot,context),context,'标签真实冒烟');const c=validateChunkCandidates(extracted.raw,part,source,snapshot.workbook);
 const integrated=await requestWikiJson(integrationModelInput(DEFAULT_PROMPTS,c,context),context,'标签整合冒烟');const r=assembleIntegratedResult(c,integrated.raw,source,context);
 return {id:model.id,extractionFinish:extracted.model.finish_reason,integrationFinish:integrated.model.finish_reason,metrics:r.metrics,entities:r.steps.step5.entity_results.map(e=>({name:e.name,id:e.tags.entity_type_id,type:e.tags.entity_type,facets:e.tags.semantic_facets})),diagnostics:r.steps.diagnostics,calls:2,savedKnowledge:false};
 });
 await page.screenshot({path:root+'/outputs/知识Wiki语义标签-'+mode+'.png',fullPage:true});await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(expectedTypes=>workbookReady&&controlledTypes().length===expectedTypes,mode==='online'?104:actual.workbook.sheets[0].rows.length===108?104:74,{timeout:60000});assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);report.reloadPersisted=mode==='online';report.cloudUnchanged=mode!=='online';report.pageErrors=errors;report.blockedWrites=writes;fs.writeFileSync(root+'/outputs/wiki-semantic-'+mode+'-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
