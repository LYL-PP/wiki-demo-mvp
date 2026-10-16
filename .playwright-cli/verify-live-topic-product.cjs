'use strict';
const path = require('node:path');
const {chromium} = require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const root = 'C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
const url = 'https://wiki-mvp-lab.app-tencent.workbuddy.host/';
const report = {status:'running',startedAt:new Date().toISOString(),checks:[],pageerrors:[],modelRequests:0,writeRequests:[]};
function ok(value,label,detail){report.checks.push({label,pass:!!value,detail:detail??null});if(!value)report.status='failed';}
const fixture = () => {
  const types = savedWorkbook.sheets[0].rows.slice(4).filter(r=>String(r[7]||'').trim()==='active').map(r=>({id:String(r[0]).trim(),label:String(r[2]).trim()}));
  const type = types.find(t=>/^(道具|资源|材料|武器|技能|成长系统)$/.test(t.label))||types.find(t=>t.id!=='ET-PROD-GAME');
  const gameType = types.find(t=>/游戏(产品|作品)/.test(t.label))||types.find(t=>t.id==='ET-PROD-GAME')||types.find(t=>/^ET-PROD-/.test(t.id));
  if(!type||!gameType) throw Error('active fixture types: '+JSON.stringify(types.map(t=>t.id+':'+t.label)));
  const product = '燕云十六声';
  const text = '# 燕云十六声：道具研究\n《燕云十六声》是一款游戏，本节讨论道具作用。\n佛光玉可以提升角色的战斗能力。\n破竹樽可以用于战斗组合。';
  const file = {id:'LIVE-TOPIC-F',revision:1,name:'线上产品承接核验.txt',text,legacy:false};
  const proof = quote => {const start=text.indexOf(quote);return {exact_quote:quote,quote,start,end:start+quote.length,fileId:file.id,revision:1,file:file.name};};
  const topic = {id:'LIVE-TOPIC-T',name:'燕云十六声：道具玩法',object_anchor:product,desc:'人工核验话题',evidences:[proof('《燕云十六声》是一款游戏，本节讨论道具作用。')]};
  const boundTopic = {...structuredClone(topic),fileContributions:[{fileId:file.id,revision:1,data:structuredClone(topic)}]};
  const make = (id,name,quote,scope,tag) => {
    const data = {id,name,summary:'线上产品承接核验',aliases:[],disambiguator:'',identityAnchors:{ontologyType:tag.label,realityDomain:'游戏虚构',productIpScope:scope,version:null,identityAttributes:{}},identityDecision:'confirmed',primaryTopic:topic.id,topics:[topic.id],tags:{type:[tag.label],typeId:tag.id},reviewReasons:[],semanticFacetsRecognized:true,suggestedFacets:{product:[],discipline:[],version:[]},semanticFacetDetails:[],candidateTags:[],sources:[proof(quote)],facts:[quote],relations:[]};
    return {...structuredClone(data),fileContributions:[{fileId:file.id,revision:1,data:structuredClone(data)}]};
  };
  const entityA = make('LIVE-TOPIC-A','佛光玉','佛光玉可以提升角色的战斗能力。',product,type);
  const entityB = make('LIVE-TOPIC-B','破竹樽','破竹樽可以用于战斗组合。',null,type);
  const game = make('LIVE-TOPIC-G',product,'《燕云十六声》是一款游戏，本节讨论道具作用。',product,gameType);
  state.previews=[entityA,entityB,game];state.previewTopics=[boundTopic];state.files=[file];state.selectedEntity=null;state.relatedDetailId=null;
  state.filters={...state.filters,...Object.fromEntries(['topic','type','product','discipline','version','candidate'].map(k=>[k,new Set()])),relation:''};
  knowledgeNav.topicId=null;knowledgeNav.expanded=new Set();document.getElementById('entitySearch').value='';
  setPage('knowledge');
  return {product,typeLabel:type.label,gameTypeLabel:gameType.label,gameTypeId:gameType.id,activeTypeCount:types.length,
    hasGameProductType:types.some(t=>t.id==='ET-PROD-GAME'||/游戏(产品|作品)/.test(t.label)),
    workbookRevision:String(workbookRevision),controlledTypeCount:controlledTypes().length,
    prodTypes:types.filter(t=>/^ET-PROD-/.test(t.id)).map(t=>t.id+':'+t.label)};
};
(async()=>{
  let browser,context,page;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1050}});
    const isModel=p=>/\/(?:chat\/completions|completions|responses|embeddings|rerank|inference|invoke)(?:\/|$)/i.test(p);
    await context.route('**/*',route=>{const req=route.request(),p=new URL(req.url()).pathname,m=req.method();
      if(isModel(p)){report.modelRequests++;return route.abort();}
      if(['POST','PATCH','PUT','DELETE'].includes(m))report.writeRequests.push(m+' '+p);
      return route.continue();});
    page=await context.newPage();
    page.on('pageerror',e=>report.pageerrors.push(String(e.message||e)));
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof savedWorkbook!=='undefined'&&savedWorkbook&&typeof allEntities==='function',null,{timeout:60000});
    await page.waitForFunction(()=>String(workbookRevision)!=='0'&&String(workbookRevision)!=='',null,{timeout:60000}).catch(()=>{});
    ok(String(await page.evaluate(()=>String(workbookRevision)))!=='0','已加载云端共享词表（revision>0）',await page.evaluate(()=>String(workbookRevision)));
    ok(await page.evaluate(()=>typeof entitySemanticFacets)==='function','线上 semantic-tags.js 为新版（含产品上下文投影）');
    const meta=await page.evaluate(fixture);
    report.fixtureTypes=meta;
    await page.waitForTimeout(300);
    const facets=await page.evaluate(()=>state.previews.filter(e=>e.id!=='LIVE-TOPIC-G').map(e=>{const f=entitySemanticFacets(e,knowledgeSemanticContexts());return {id:e.id,name:e.name,product:f.suggestedFacets.product,version:f.suggestedFacets.version,contextual:f.facetDetails.filter(d=>d.basis==='contextual'),issues:f.productContextIssues.map(i=>({code:i.code,reason:i.reason}))}}));
    for(const f of facets) ok(f.product.includes(meta.product),`实体「${f.name}」主话题产品上下文承接为所属／适用产品`,JSON.stringify({product:f.product,issues:f.issues}));
    ok(facets.every(f=>f.version.length===0),'产品承接不连带继承版本',JSON.stringify(facets.map(f=>f.version)));
    for(const f of facets) ok(f.contextual.length>0&&f.contextual.every(d=>!String(d.entityQuote||'').includes(meta.product)&&d.context?.topicEvidences?.length>0),`实体「${f.name}」产品来自话题上下文而非实体原文`,JSON.stringify(f.contextual.map(d=>({basis:d.basis,entityQuote:d.entityQuote,topicEvidenceCount:d.context?.topicEvidences?.length}))));
    const rows=await page.locator('#entityRows').innerText();
    ok(rows.includes('所属／适用产品：'+meta.product),'实体列表显示所属／适用产品',rows.split('\n').filter(l=>l.includes('所属／适用产品')).join(' | '));
    await page.locator('#entityRows [data-entity]').first().click();
    await page.waitForTimeout(200);
    const detail=await page.locator('#entityDetail').innerText();
    ok(detail.includes('所属／适用产品'),'实体详情显示所属／适用产品',detail.split('\n').filter(l=>l.includes('产品')).slice(0,3).join(' | '));
    const filterOptions=await page.evaluate(()=>filterValues('product'));
    ok(filterOptions.includes(meta.product),'产品筛选维度包含承接出的产品',JSON.stringify(filterOptions));
    const filtered=await page.evaluate(p=>{toggleFilter('product',p);renderKnowledge();const n=document.querySelectorAll('#entityRows [data-entity]').length;clearFilters();renderKnowledge();return n},meta.product);
    ok(filtered===3,'按承接产品筛选命中全部三个实体',String(filtered));
    ok(report.pageerrors.length===0,'无页面错误',JSON.stringify(report.pageerrors));
  }catch(error){
    report.status='failed';report.error=String(error.message||error);
  }finally{
    report.finishedAt=new Date().toISOString();
    if(report.status==='running')report.status='passed';
    if(context)await context.close().catch(()=>{});
    if(browser)await browser.close().catch(()=>{});
    console.log(JSON.stringify({status:report.status,error:report.error||null,fixtureTypes:report.fixtureTypes||null,modelRequests:report.modelRequests,writeRequests:report.writeRequests,pageerrors:report.pageerrors,
      passed:report.checks.filter(c=>c.pass).length,total:report.checks.length,
      checks:report.checks.map(c=>(c.pass?'PASS':'FAIL')+' '+c.label+(c.detail?' :: '+String(c.detail).slice(0,160):''))},null,1));
  }
})();
