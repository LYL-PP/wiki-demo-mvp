'use strict';
// PDF 抽取会在字间插入空格（"崩 坏 ： 星 穹 铁 道"），产品名的所有校验都是逐字 indexOf/startsWith，
// 于是显式分面与上下文补全同时失效，界面表现为"身份锚点明明写了产品，所属产品仍是未识别"。
// 修法只在比对层：逐字形式不命中时再比一次去空格形式。原文、偏移量、已存证据一律不动。
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
  const CLEAN='崩坏：星穹铁道新手指南\n你将扮演开拓者——一位在星穹列车上苏醒的失忆者。';
  const SPACED=[...CLEAN].join(' ');
  const run=(text,topicName,anchor)=>{
   const title=text.split('\n')[0], body=text.split('\n')[1];
   const bodyStart=text.indexOf(body);
   const file={id:'F1',revision:1,name:'guide.pdf',text};
   const topic={id:'PT1',fileContributions:[{fileId:'F1',revision:1,data:{name:topicName,object_anchor:anchor,scope:'世界观与入门',desc:'入门',
     evidences:[{exact_quote:title,start:0,end:title.length,fileId:'F1',revision:1}],primaryTopic:'PT1',topics:['PT1']}}]};
   const entity={id:'E1',name:'开拓者',primaryTopic:'PT1',topics:['PT1'],fileContributions:[{fileId:'F1',revision:1,data:{name:'开拓者',
     primaryTopic:'PT1',topics:['PT1'],facetDetails:[],identityAnchors:{productIpScope:anchor},
     sources:[{exact_quote:body,start:bodyStart,end:bodyStart+body.length,fileId:'F1',revision:1}]}}]};
   const out=entitySemanticFacets(entity,{topics:[topic],entities:[entity],files:[file],workbook:null,productContextIndex:{}});
   return {values:out.suggestedFacets.product,bases:out.facetDetails.filter(d=>d.dimension==='product').map(d=>d.basis),codes:out.productContextIssues.map(i=>i.code)};
  };
  const good='崩坏：星穹铁道的游戏世界观与入门设定';
  // 1. 逐字空格原文现在能补全产品（这是本次修的目标场景）
  const spaced=run(SPACED,good,'崩坏：星穹铁道');
  ok('逐字空格原文补全产品为 contextual',spaced.values.length===1&&spaced.bases[0]==='contextual'&&!spaced.codes.length,spaced);
  // 2. 无空格原文行为不变（已命中场景不受影响）
  const clean=run(CLEAN,good,'崩坏：星穹铁道');
  ok('无空格原文行为不变',clean.values.length===1&&clean.bases[0]==='contextual'&&!clean.codes.length,clean);
  ok('两种原文得到同一产品值',JSON.stringify(clean.values)===JSON.stringify(spaced.values),[clean.values,spaced.values]);
  // 3. 跨产品/并列话题仍拒绝：去空格后"与原神对比"的并列后缀必须照样识别出来
  const parallel='崩坏：星穹铁道与原神对比', rejectCodes=['PRODUCT_CONTEXT_TOPIC_AMBIGUOUS','PRODUCT_CONTEXT_SCOPE_CONFLICT'];
  const spacedParallel=run(SPACED,parallel,'崩坏：星穹铁道');
  const cleanParallel=run(CLEAN,parallel,'崩坏：星穹铁道');
  ok('并列话题在空格原文下仍拒绝',!spacedParallel.values.length&&spacedParallel.codes.some(c=>rejectCodes.includes(c)),spacedParallel);
  ok('并列话题在干净原文下仍拒绝',!cleanParallel.values.length&&cleanParallel.codes.some(c=>rejectCodes.includes(c)),cleanParallel);
  // 4. 身份锚点为空时不猜产品（去空格/去冒号比对不得放宽成"从话题名猜产品"）
  const noScope=run(SPACED,good,'');
  ok('无身份产品范围时仍不猜产品',!noScope.values.length,noScope);
  // 5. 冒号写法不一致：identity anchor 带全角冒号、话题名不带，仍须对齐
  const colonScope='崩坏：星穹铁道', colonTopic='崩坏星穹铁道的沉浸奖励双倍分配';
  const spacedColon=run(SPACED,colonTopic,colonScope);
  const cleanColon=run(CLEAN,colonTopic,colonScope);
  ok('话题名不带冒号时仍能对齐（空格原文）',spacedColon.values.length===1&&spacedColon.bases[0]==='contextual'&&!spacedColon.codes.length,spacedColon);
  ok('话题名不带冒号时仍能对齐（干净原文）',cleanColon.values.length===1&&cleanColon.bases[0]==='contextual'&&!cleanColon.codes.length,cleanColon);
  // 6. 去冒号不得把不同产品混为一谈：A 的副标题形态仍要被拒绝
  const suffixTopic='崩坏：星穹铁道外传的沉浸奖励';
  ok('续作后缀仍被拒绝',!run(CLEAN,suffixTopic,colonScope).values.length,run(CLEAN,suffixTopic,colonScope));
  return tests;
 });
 const passed=report.filter(t=>t.pass).length;
 fs.writeFileSync(root+'/outputs/wiki-product-spacing-tests.json',JSON.stringify({kind:'mock-browser-regression-not-real-model',passed,failed:report.length-passed,total:report.length,tests:report,pageErrors:errors,modelAttempts:0},null,2));
 console.log('scenarios '+report.length+' passed '+passed+' failed '+(report.length-passed));
 for(const t of report)if(!t.pass)console.error('FAILED '+t.test+' '+JSON.stringify(t.details));
 if(errors.length)console.error('PAGEERROR',errors.join('\n'));
 if(passed!==report.length)process.exitCode=1;
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
