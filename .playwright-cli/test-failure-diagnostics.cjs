'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto');
const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25',app=path.join(root,'wiki-demo-mvp');
const names=['index.html','semantic-tags.js','pipeline.js','file-manager.js','prompt-history.js'];
const sources=Object.fromEntries(names.map(n=>[n,fs.readFileSync(path.join(app,n),'utf8')]));
const hashes=()=>Object.fromEntries(names.map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(app,n))).digest('hex')]));
const before=hashes();
for(const m of sources['index.html'].matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
for(const n of names.slice(1))new vm.Script(sources[n],{filename:n});
// Reuse only the existing harness function; never execute the old completed test suite.
const old=fs.readFileSync(path.join(root,'.playwright-cli/test-run-timing.cjs'),'utf8');
const mockCode=old.slice(old.indexOf('function installMock(){'),old.indexOf('\nlet browser,shotPage;'))+'\ninstallMock();';
const report={kind:'真实应用五模块 + 隔离模拟SDK专项；无真实模型或生产云写；非性能测量',modules:names,hashes:before,tests:[],scenarios:[],network:[],pageErrors:[],harnessErrors:[]};
function check(name,fn){try{fn();report.tests.push({name,pass:true})}catch(e){report.tests.push({name,pass:false,reason:e.message});console.error(name+': '+e.message)}}
const sample='巫师3新手指南介绍角色玩法。杰洛特是巫师3中玩家可以操控的猎魔人。杰洛特使用银剑。';
const unsafe='\n  ```json\n{\n"text":"</textarea><img src=x onerror=window.diagnosticXss=1>",\n"bad" 1}\n```  ';
function extraMock(){
  const m=window.diagnosticMock={mode:'ok',phase:'extraction',scope:'baseline',segment:null,raw:'',calls:[],copied:null};
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{m.copied=text}}});
  const originalFactory=WorkBuddyCloud.createWorkBuddyCloud;
  WorkBuddyCloud.createWorkBuddyCloud=function(...args){
    const client=originalFactory(...args),original=client.llm.chat.completions.create;
    client.llm.chat.completions.create=async function*(options){
      const input=options.messages[1].content,phase=input.includes('\n全局整合规则：')?'integration':'extraction';
      const timing=wikiRunTiming.current(),scope=timing.branches.current.start===null?'baseline':'current';
      const segment=phase==='extraction'?Number(input.match(/当前段 (\d+)\//)?.[1]||1):null;
      m.calls.push({phase,scope,segment});
      if(m.mode==='ok'||phase!==m.phase||scope!==m.scope||m.segment!==null&&m.segment!==segment)return yield*original(options);
      const sleep=ms=>new Promise((resolve,reject)=>{const id=setTimeout(resolve,ms);options.signal.addEventListener('abort',()=>{clearTimeout(id);reject(new DOMException('模拟停止','AbortError'))},{once:true})});
      if(m.mode==='preflight'){throw Error('不应调用：容量预检未生效')}
      if(m.mode==='network'){const e=new Error('模拟接口断网');e.requestId='mock-public-request';e.error={code:'gateway_stream_interrupted'};e.status=503;throw e}
      if(m.mode==='empty'){yield {choices:[{delta:{content:''},finish_reason:'stop'}]};return}
      if(m.mode==='chunk'){yield {choices:[{delta:{content:'{"topics":[]}'},finish_reason:'stop'}]};return}
      if(m.mode==='assembly'){yield {choices:[{delta:{content:'{"topic_groups":[]}'},finish_reason:'stop'}]};return}
      const text=m.raw||'{"broken":';yield {choices:[{delta:{content:text},finish_reason:m.mode==='length'?'length':m.mode==='filter'?'content_filter':m.mode==='malformed'?'stop':null}]};
      if(m.mode==='stop'||m.mode==='timeout'){await sleep(1500);return}
      if(m.mode==='partial'){const e=new Error('模拟正文后断流');e.requestId='mock-partial-request';e.error={code:'gateway_stream_interrupted'};e.status=502;throw e}
    };
    return client;
  };
  const realSetTimeout=window.setTimeout;
  window.setTimeout=function(fn,ms,...args){return realSetTimeout(fn,m.mode==='timeout'&&[90000,180000].includes(ms)?20:ms,...args)};
}
let browser;
async function session({different=false,parallel=false}={}){
  const context=await browser.newContext({viewport:{width:1440,height:1100},serviceWorkers:'block',acceptDownloads:true});
  await context.addInitScript({content:mockCode});await context.addInitScript(extraMock);
  const errors=[],loaded=[];report.pageErrors.push(errors);
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());const entry={method:req.method(),url:req.url(),action:''};report.network.push(entry);
    if(req.method()!=='GET'){entry.action='禁止';return route.abort()}
    if(url.hostname==='127.0.0.1'&&url.port==='19431'){
      const name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
      if(Object.hasOwn(sources,name)){entry.action='真实本地模块';loaded.push(name);return route.fulfill({contentType:name.endsWith('.html')?'text/html':'application/javascript',body:sources[name]})}
      if(name.endsWith('.xlsx')){entry.action='模拟工作簿';return route.fulfill({body:Buffer.from('mock')})}
      entry.action='未知';return route.abort();
    }
    entry.action='模拟外部脚本';return route.fulfill({contentType:'application/javascript',body:''});
  });
  const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:19431/');
  await page.waitForFunction(()=>wikiPromptHistory.getController().status().ready&&workbookReady&&!cloudLoading);
  await page.evaluate(()=>setPage('lab'));
  check('五模块实际初始化与诊断初态',()=>assert.deepEqual([...new Set(loaded)].sort(),names.slice().sort()));
  const initial=await page.evaluate(()=>({diagnostic:wikiFailureDiagnostics.current(),hidden:document.getElementById('failureDiagnostics').hidden,writes:timingMock.writes.length}));
  check('无初始化诊断与生产写',()=>{assert.equal(initial.diagnostic,null);assert.equal(initial.hidden,true);assert.equal(initial.writes,0)});
  const text=parallel?sample+'\n'+('杰洛特是巫师3中玩家可以操控的猎魔人。\n'.repeat(315))+sample:sample;
  await page.locator('#fileInput').setInputFiles({name:'诊断-模拟.txt',mimeType:'text/plain',buffer:Buffer.from(text)});
  await page.waitForFunction(()=>!!state.source?.id&&!fileReading);
  if(different)await page.evaluate(()=>{const c=wikiPromptHistory.getController(),s=c.status().snapshot;s.current.step2+='\n诊断专项差异';state.baselinePrompts=structuredClone(s.baseline);state.prompts=structuredClone(s.current);renderPromptEditor();c.changed(s);c.cancelTimer()});
  return {page,context};
}
async function configure(page,mode,{phase='extraction',scope='baseline',segment=null,raw=''}={}){await page.evaluate(v=>Object.assign(diagnosticMock,v),{mode,phase,scope,segment,raw})}
async function start(page){await page.locator('#runBtn').click();await page.waitForFunction(()=>wikiRunTiming.current()?.status==='running'||wikiRunTiming.current()?.end!==null)}
async function finish(page){await page.waitForFunction(()=>wikiRunTiming.current()?.end!=null);return page.evaluate(()=>({record:wikiFailureDiagnostics.current(),timing:wikiRunTiming.current(),current:!!state.current,baseline:!!state.baseline,previews:state.previews.length,calls:diagnosticMock.calls,cache:[...wikiCandidateCache.values()].map(c=>({parts:c.parts.size,integrationHasRaw:Object.hasOwn(c.integration||{},'raw_response')})),requests:wikiRequests.size,running:isRunning,hidden:document.getElementById('failureDiagnostics').hidden}))}
async function run(page){await start(page);return finish(page)}
async function downloads(page,selector){const waiting=page.waitForEvent('download');await page.locator(selector).first().click();const download=await waiting,stream=await download.createReadStream(),buffers=[];for await(const b of stream)buffers.push(b);return Buffer.concat(buffers).toString('utf8')}
async function simple(mode,options={}){
  const {page,context}=await session(options);await configure(page,mode,options);
  if(mode==='preflight')await page.evaluate(()=>availableModels[0].maxInputTokens=1);
  if(mode==='stop'){
    await start(page);await page.waitForFunction(()=>document.getElementById('apiStatus').textContent.includes('接收正文'));await page.locator('#stopBtn').click();
  }
  const data=mode==='stop'?await finish(page):await run(page),item=data.record.items[0];report.scenarios.push({mode,options,data});
  check(mode+'：单条本轮失败且无非法结果',()=>{assert.equal(data.record.items.length,1);assert.equal(data.record.attempt_id,data.timing.id);assert.equal(data.record.status,mode==='stop'?'stopped':'failed');assert.equal(data.current,false);assert.equal(data.previews,0);assert.equal(data.requests,0);assert.equal(data.running,false);assert.equal(data.hidden,false);assert.equal(item.scope,options.scope||'baseline');assert.equal(item.source_name,'诊断-模拟.txt')});
  check(mode+'：阶段与真实分段信息',()=>{assert.equal(item.stage,mode==='malformed'?'json_parse':mode==='chunk'?'chunk_validation':mode==='assembly'?'assembly':mode==='preflight'?'preflight':'stream');assert.equal(item.model_id,'mock-timing');assert.equal(item.model_name,'GLM 5.3 Flash');if((options.phase||'extraction')==='extraction'){assert.equal(item.segment_index,options.segment||1);assert.equal(item.segment_count,options.parallel?2:1)}else assert.equal(item.segment_index,null)});
  if(mode==='malformed'&&!options.parallel){
    check('保留原文与原生位置（围栏映射到原文）',()=>{assert.equal(item.raw_response,unsafe);assert.equal(item.content_chars,unsafe.length);assert.equal(item.finish_reason,'stop');assert.equal(item.stream_chunks,1);assert.ok(item.parse_error.message);assert.ok(item.parse_error.position>=0);assert.equal(item.parse_error.raw_position,item.parse_error.position+item.parse_error.input_offset);assert.equal(unsafe[item.parse_error.raw_position],'1');assert.equal(item.parse_error.line,3)});
    await page.locator('#failureDiagnostics .diagnostic-item details summary').click();
    const ui=await page.evaluate(()=>({readonly:document.querySelector('[data-diagnostic-raw]').readOnly,value:document.querySelector('[data-diagnostic-raw]').value,xss:window.diagnosticXss,images:document.querySelectorAll('#failureDiagnostics img').length}));
    check('原文DOM只读和XSS不执行',()=>{assert.equal(ui.readonly,true);assert.equal(ui.value,unsafe);assert.equal(ui.xss,undefined);assert.equal(ui.images,0)});
    await page.locator('[data-diagnostic-copy]').click();const copied=await page.evaluate(()=>diagnosticMock.copied);check('复制原文逐字一致',()=>assert.equal(copied,unsafe));
    const rawDownload=await downloads(page,'[data-diagnostic-download]'),diagnostic=JSON.parse(await downloads(page,'[data-diagnostic-export]'));
    check('真实下载事件：txt原文与json诊断一致',()=>{assert.equal(rawDownload,unsafe);assert.deepEqual(diagnostic.item,item);assert.equal(diagnostic.attempt_id,data.record.attempt_id)});
    for(const width of [1440,760,390]){await page.setViewportSize({width,height:1100});const layout=await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth,right:document.getElementById('failureDiagnostics').getBoundingClientRect().right}));check('失败原文响应式无溢出 '+width,()=>{assert.ok(layout.scroll<=layout.w+2);assert.ok(layout.right<=layout.w+2)})}
    await page.setViewportSize({width:1440,height:1100});await page.screenshot({path:path.join(root,'outputs/知识Wiki失败诊断-本地.png'),fullPage:true});
    const storage=await page.evaluate(()=>Object.values(localStorage).join(' '));check('未持久化失败正文',()=>assert.ok(!storage.includes('</textarea><img')));
    await page.evaluate(()=>{document.getElementById('promptEditor').value+='\n变更';document.getElementById('promptEditor').dispatchEvent(new Event('input'));wikiPromptHistory.getController().cancelTimer()});
    const stale=await page.evaluate(()=>wikiFailureDiagnostics.current());check('输入变更保留原文仅标旧',()=>{assert.equal(stale.stale,true);assert.equal(stale.attempt_id,data.record.attempt_id);assert.equal(stale.items[0].raw_response,unsafe)});
    await page.locator('#clearFailureDiagnostics').click();const clear=await page.evaluate(()=>({record:wikiFailureDiagnostics.current(),text:document.getElementById('failureDiagnosticList').textContent,hidden:document.getElementById('failureDiagnostics').hidden}));check('清除内存及DOM原文',()=>{assert.equal(clear.record.items.length,0);assert.equal(clear.text,'');assert.equal(clear.hidden,true)});
    await configure(page,'network');const rerun=await run(page);check('重跑新轮不挪用旧原文',()=>{assert.ok(rerun.record.attempt_id>data.record.attempt_id);assert.equal(rerun.record.stale,false);assert.equal(rerun.record.items[0].raw_response,'');assert.equal(rerun.record.items[0].stream_chunks,0)});
    await configure(page,'ok');const success=await run(page);check('失败后成功清空诊断并保持门禁',()=>{assert.equal(success.record.status,'success');assert.equal(success.record.items.length,0);assert.equal(success.hidden,true);assert.equal(success.current,true);assert.equal(success.previews,1);assert.ok(success.cache.every(c=>!c.integrationHasRaw))});
  }
  if(['network','partial'].includes(mode))check('公开接口诊断字段 '+mode,()=>{assert.equal(item.request_id,mode==='partial'?'mock-partial-request':'mock-public-request');assert.equal(item.error_code,'gateway_stream_interrupted');assert.equal(item.http_status,mode==='partial'?502:503);assert.equal(item.raw_response,mode==='partial'?'{"broken":':'')});
  if(mode==='length')check('截断不冒充JSON解析错误',()=>{assert.equal(item.finish_reason,'length');assert.equal(item.parse_error,null);assert.match(item.error_message,/截断/)});
  if(mode==='timeout')check('真实超时分支（模拟短计时器，非180秒性能测试）',()=>assert.match(item.error_message,/已超时/));
  if(options.scope==='current')check('新版失败保留本轮成功基线',()=>assert.equal(data.baseline,true));
  if(mode==='assembly'||options.parallel){await configure(page,'ok');const count=data.calls.length,retry=await run(page),calls=retry.calls.slice(count);check('重试保留有效完成段 '+mode,()=>{assert.equal(retry.record.status,'success');assert.equal(retry.record.items.length,0);if(mode==='assembly')assert.equal(calls.filter(c=>c.phase==='extraction').length,0);else{assert.equal(calls.filter(c=>c.phase==='extraction').length,1);assert.equal(calls.find(c=>c.phase==='extraction').segment,2)}})}
  await context.close();
}
async function sharedFailure(kind){
  const {page,context}=await session({different:kind==='prompt_sync'});
  await page.evaluate(k=>{if(k==='prompt_sync')timingMock.failPrompt=true;else if(k==='workbook_sync')timingMock.failWorkbook=true;else timingMock.archiveFail=true},kind);
  const data=await run(page);report.scenarios.push({kind,data});
  check(kind+'：共享错误无错误模型正文归因',()=>{assert.equal(data.record.status,'failed');assert.equal(data.record.items.length,1);const i=data.record.items[0];assert.equal(i.stage,kind);assert.equal(i.scope,'shared');assert.equal(i.raw_response,'');assert.equal(i.model_id,null);assert.equal(i.parse_error,null);if(kind!=='archive')assert.equal(data.calls.length,0);else assert.equal(data.current,true)});
  await context.close();
}
async function parserAndCache(){
  const {page,context}=await session();
  const parsing=await page.evaluate(()=>{const valid=parseModelJson('prefix {"ok":true} suffix');let a,b,c;try{parseModelJson('{"unfinished":')}catch(e){a=e.parse_error}try{parseModelJson('prefix {"bad": } suffix')}catch(e){b=e.parse_error}try{parseModelJson('{"x": }')}catch(e){c=e.parse_error}return {valid,a,b,c}});
  check('解析成功策略不变/末尾与提取对象位置基准',()=>{assert.equal(parsing.valid.ok,true);assert.equal(parsing.a.raw_position,14);assert.match(parsing.a.location_basis,/输入末尾/);assert.match(parsing.b.input_basis,/首个平衡/);assert.equal(parsing.b.input_offset,7);assert.equal(parsing.c.position,null);assert.equal(parsing.c.raw_position,null);assert.match(parsing.c.message,/Unexpected token/)});
  const first=await run(page);check('正常调用无失败诊断/缓存不包含原文',()=>{assert.equal(first.record.status,'success');assert.equal(first.record.items.length,0);assert.equal(first.hidden,true);assert.ok(first.cache.every(c=>!c.integrationHasRaw))});
  await run(page);const count=await page.evaluate(()=>diagnosticMock.calls.length);const cached=await run(page);
  check('原缓存命中且未复制失败信息',()=>{assert.equal(cached.calls.length,count);assert.equal(cached.record.items.length,0);assert.equal(cached.record.status,'success');assert.ok(cached.timing.caches.baseline.extraction>0);assert.ok(cached.timing.caches.current.baseline>0)});
  await context.close();
}
(async()=>{
 try{browser=await chromium.launch({channel:'chrome',headless:true});
 const scenarios=[['malformed',()=>simple('malformed',{raw:unsafe})],['length',()=>simple('length')],['empty',()=>simple('empty')],['missing stop',()=>simple('missing')],['network',()=>simple('network')],['partial',()=>simple('partial')],['filter',()=>simple('filter')],['stop',()=>simple('stop')],['timeout',()=>simple('timeout')],['preflight',()=>simple('preflight')],['chunk',()=>simple('chunk')],['assembly',()=>simple('assembly',{phase:'integration'})],['parallel second part',()=>simple('malformed',{parallel:true,segment:2,raw:unsafe})],['current failure',()=>simple('network',{different:true,scope:'current'})],...['prompt_sync','workbook_sync','archive'].map(k=>[k,()=>sharedFailure(k)]),['parser/cache',parserAndCache]];
 for(const [name,fn] of scenarios){try{await fn();console.log('场景完成：'+name)}catch(e){report.harnessErrors.push({name,error:e.message,stack:e.stack});console.error(name+': '+e.message)}}
 check('无页面JS异常',()=>assert.deepEqual(report.pageErrors.flat(),[]));
 check('全部请求隔离，无真实模型或云写',()=>{assert.ok(report.network.length);assert.ok(report.network.every(e=>e.method==='GET'&&['真实本地模块','模拟工作簿','模拟外部脚本'].includes(e.action)));assert.equal(report.network.filter(e=>e.url.includes('/.cloud/')).length,0)});
 }catch(e){report.harnessErrors.push({name:'启动',error:e.message})}
 finally{check('专项测试不修改五模块',()=>assert.deepEqual(hashes(),before));report.passed=report.tests.filter(t=>t.pass).length;report.failed=report.tests.filter(t=>!t.pass).length;report.status=report.failed||report.harnessErrors.length?'failed':'passed';fs.writeFileSync(path.join(root,'outputs/wiki-failure-diagnostics-tests.json'),JSON.stringify(report,null,2));if(browser)await browser.close();console.log(JSON.stringify({status:report.status,passed:report.passed,failed:report.failed,failures:report.tests.filter(t=>!t.pass),harnessErrors:report.harnessErrors},null,2));if(report.status==='failed')process.exitCode=1}
})();
