const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs=require('fs'),assert=require('assert'),crypto=require('crypto');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25',app=root+'/wiki-demo-mvp',origin='https://wiki-mvp-lab.app-tencent.workbuddy.host',mode=process.argv[2]||'local';
const digest=data=>crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const tests=[];const ok=(name,value)=>{assert(value,name);tests.push({name,pass:true})};
  if(mode==='local'){
   const context=await browser.newContext();
   await context.route('**/*',r=>r.abort('blockedbyclient'));await context.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
   await context.route(origin+'/**',r=>{const p=new URL(r.request().url()).pathname;if(r.request().method()!=='GET')return r.abort('blockedbyclient');if(p.startsWith('/.cloud/'))return p.startsWith('/.cloud/llm/')?r.abort('blockedbyclient'):r.fulfill({contentType:'application/json',body:'{"data":[]}'});/* 仅隔离旧逻辑回归，不代表全应用；新模块仍请求加载但返回空脚本。 */if(p==='/prompt-history.js')return r.fulfill({contentType:'application/javascript',body:''});const file=p==='/'?'/index.html':p;const path=app+file;if(!fs.existsSync(path))return r.fulfill({status:404,body:''});let body=fs.readFileSync(path);if(file==='/index.html')body=body.toString().replace('<script>wikiPromptHistory.init();init();</script>','<script>initCloud=async()=>{};init();</script>');return r.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.xlsx')?'application/octet-stream':'text/html',body})});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/');
   const old=await page.evaluate(()=>({step2:PREVIOUS_STEP2_BASE,step2Chunk:PREVIOUS_STEP2_BASE+PREVIOUS_STEP2_CHUNK,step2Latest:PREVIOUS_STEP2_BASE+PREVIOUS_STEP2_CHUNK+PREVIOUS_STEP2_BOUNDARY,integration:PREVIOUS_INTEGRATION_DEFAULT}));
   const defaults=await page.evaluate(()=>structuredClone(DEFAULT_PROMPTS));
   ok('默认STEP2明确禁止纯项目名',defaults.step2.includes('禁止仅以“王者荣耀”')&&!defaults.step2.includes('既可暂时使用'));
   ok('以项目内具体研发问题形成最小可复用问题簇',defaults.step2.includes('最小可复用的问题簇')&&defaults.step2.includes('不要求至少两个实体'));
   ok('粒度基于证据且不推断开发者设计意图',defaults.step2.includes('不得强行从玩家攻略推导开发者设计意图')&&defaults.step2.includes('证据不足时复核'));
   ok('整合不合回项目级大话题',defaults.integration.includes('禁止把细话题合回')&&defaults.integration.includes('同一项目中的不同研发问题保留独立'));
   ok('整合提示词领域无关',!/王者荣耀|巫师3|射程与命中反馈|法印|综合攻略/.test(defaults.integration),defaults.integration.slice(0,120));
   ok('整合提示词说明归并字段用法',defaults.integration.includes('scope_equivalent')&&defaults.integration.includes('boundary_basis')&&defaults.integration.includes('existing_topic_id'));
   const input=await page.evaluate(()=>integrationModelInput({...state.prompts,step2:'自定义具体问题测试标记'},{topics:[],entities:[]},{historySnapshot:{topics:[]},documentContext:{},snapshot:{workbook:{sheets:[]}}}));
   ok('全局整合读取本次STEP2而非独立旧粒度',input.includes('自定义具体问题测试标记'));
   for(const [label,step2] of [['早期默认',old.step2],['分段默认',old.step2Chunk],['完整旧默认',old.step2Latest]]){
    await page.evaluate(({step2,integration})=>{localStorage.setItem(STORE+'prompts',JSON.stringify({step2,integration,step3:'用户STEP3'}));localStorage.setItem(STORE+'baseline',JSON.stringify({step2,integration}));localStorage.setItem('topic-test-unrelated','untouched')},{step2,integration:old.integration});
    await page.reload();const values=await page.evaluate(()=>({newer:state.prompts,base:state.baselinePrompts,persisted:JSON.parse(localStorage.getItem(STORE+'prompts')),other:localStorage.getItem('topic-test-unrelated')}));
    ok(label+'两版STEP2精确匹配自动升级',values.newer.step2===defaults.step2&&values.base.step2===defaults.step2);
    ok(label+'两版整合升级及持久化',values.newer.integration===defaults.integration&&values.base.integration===defaults.integration&&values.persisted.step2===defaults.step2);
    ok(label+'其他步骤与无关数据不动',values.newer.step3==='用户STEP3'&&values.other==='untouched');
   }
   await page.evaluate(old=>{localStorage.setItem(STORE+'prompts',JSON.stringify({step2:old.step2+'\n用户自定义一句',integration:old.integration+'\n用户整合规则'}));localStorage.setItem(STORE+'baseline',JSON.stringify({step2:old.step2Latest,integration:'自定义基线整合'}))},old);await page.reload();
   const custom=await page.evaluate(()=>({newer:state.prompts,base:state.baselinePrompts}));
   ok('自定义STEP2字节保持原样',custom.newer.step2===old.step2+'\n用户自定义一句');
   ok('自定义整合字节保持原样',custom.newer.integration===old.integration+'\n用户整合规则'&&custom.base.integration==='自定义基线整合');
   ok('两版及两个步骤独立迁移',custom.base.step2===defaults.step2);
   await page.evaluate(()=>{localStorage.setItem(STORE+'prompts',JSON.stringify({step2:'只保留自定义STEP2'}));localStorage.removeItem(STORE+'baseline')});await page.reload();
   ok('缺失整合补新默认且不覆盖自定义STEP2',await page.evaluate(()=>state.prompts.step2==='只保留自定义STEP2'&&state.prompts.integration===DEFAULT_PROMPTS.integration));
   await page.evaluate(()=>{setPage('lab');state.promptKey='step2';renderPromptEditor()});
   ok('编辑器渲染且无脚本异常',await page.locator('#promptEditor').count()>0&&errors.length===0);
   fs.writeFileSync(root+'/outputs/wiki-topic-default-tests.json',JSON.stringify({tests,errors},null,2));console.log(JSON.stringify({passed:tests.length,errors}));
  }else{
   assert(['before','after'].includes(mode));const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],blocked=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>{const q=r.request();if(q.url().includes('/.cloud/')&&!['GET','HEAD','OPTIONS'].includes(q.method())){blocked.push(q.url());return r.abort()}return r.continue()});
   await page.goto(origin+'/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>availableModels.length>0&&workbookReady,null,{timeout:45000});
   const info=await page.evaluate(()=>({revision:workbookRevision,types:controlledTypes().length,workbook:savedWorkbook,defaults:DEFAULT_PROMPTS,modelCount:availableModels.length}));
   const report={stage:mode,revision:info.revision,types:info.types,fingerprint:digest(info.workbook),modelCount:info.modelCount,errors,blocked};
   if(mode==='after'){
    const before=JSON.parse(fs.readFileSync(root+'/outputs/wiki-topic-release-before.json','utf8'));report.workbookUnchanged=before.fingerprint===report.fingerprint&&before.revision===report.revision;assert(report.workbookUnchanged);
    assert(info.defaults.step2.includes('禁止仅以“王者荣耀”'));assert(info.defaults.integration.includes('禁止把细话题合回'));assert(info.defaults.integration.includes('existing_topic_id'));report.fineDefaultsLoaded=true;
    await page.setInputFiles('#fileInput',{name:'话题默认规则验收.txt',mimeType:'text/plain',buffer:Buffer.from('仅检查页面和文件管理，不请求模型。')});await page.waitForFunction(()=>!fileReading&&state.files.length===1);report.runEnabled=await page.evaluate(()=>!document.getElementById('runBtn').disabled);assert(report.runEnabled);
    await page.click('[data-page="lab"]');await page.evaluate(()=>{state.promptKey='step2';renderPromptEditor()});report.step2Editor=await page.locator('#promptEditor').inputValue();assert(report.step2Editor===info.defaults.step2);
    await page.evaluate(()=>{state.promptKey='integration';renderPromptEditor()});assert((await page.locator('#promptEditor').inputValue())===info.defaults.integration);
    await page.screenshot({path:root+'/outputs/知识Wiki细粒度默认规则线上验证.png',fullPage:true});
   }
   assert(errors.length===0);assert(blocked.length===0);fs.writeFileSync(root+'/outputs/wiki-topic-release-'+mode+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,step2Editor:report.step2Editor?'已验证':undefined}));
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
