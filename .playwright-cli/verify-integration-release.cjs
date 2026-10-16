const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs=require('fs'),crypto=require('crypto');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25',stage=process.argv[2];
const thresholdMode=stage?.startsWith('threshold-'),navigationMode=stage?.startsWith('navigation-'),prefix=thresholdMode?'threshold-':navigationMode?'navigation-':'',phase=prefix?stage.slice(prefix.length):stage;
if(!['before','after'].includes(phase))throw new Error('Stage must be before or after, optionally prefixed threshold- or navigation-');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],blocked=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{const q=r.request();if(q.url().includes('/.cloud/')&&!['GET','HEAD','OPTIONS'].includes(q.method())){blocked.push({method:q.method(),path:new URL(q.url()).pathname});return r.abort()}return r.continue()});
 await page.goto('https://wiki-mvp-lab.app-tencent.workbuddy.host/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>availableModels.length>0&&workbookReady&&window.wikiPromptHistory?.getController()?.status().ready,null,{timeout:90000});
 const wb=await page.evaluate(()=>({revision:workbookRevision,workbook:savedWorkbook}));
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify(wb.workbook)).digest('hex');
 await page.evaluate(()=>setPage('lab'));
 await page.setInputFiles('#fileInput',{name:'发布检查.txt',mimeType:'text/plain',buffer:Buffer.from('游戏角色测试材料，仅检查按钮，不调用模型。')});
 await page.waitForFunction(()=>!fileReading);
 const state=await page.evaluate(()=>({runDisabled:document.getElementById('runBtn').disabled,fileAdded:!!state.source,modelCount:availableModels.length,model:document.getElementById('modelSelect').value,workbookReady,workbookRevision,types:controlledTypes().length,sheetCount:savedWorkbook.sheets.length,integrationTab:!!document.querySelector('[data-prompt="integration"]'),pipelineLoaded:typeof assembleIntegratedResult==='function',readiness:document.getElementById('runReadinessText')?.textContent||null}));
 const promptRows=await page.evaluate(async()=>{const result=await cloud.database.from('wiki_prompt_versions').select('*').order('revision',{ascending:true});if(result.error)throw result.error;return result.data});
 const promptHistoryFingerprint=crypto.createHash('sha256').update(JSON.stringify(promptRows)).digest('hex');
 const report={stage,state,workbookFingerprint:fingerprint,promptHistoryFingerprint,promptVersions:promptRows.length,errors,blocked};
 if(phase==='after'){
  const before=JSON.parse(fs.readFileSync(root+'/outputs/wiki-integration-release-'+prefix+'before.json','utf8'));
  report.workbookUnchanged=before.workbookFingerprint===fingerprint&&before.state.workbookRevision===state.workbookRevision;
  report.promptHistoryUnchanged=before.promptHistoryFingerprint===promptHistoryFingerprint;
  if(thresholdMode){
   const pipeline=await page.request.get('https://wiki-mvp-lab.app-tencent.workbuddy.host/pipeline.js');
   if(!pipeline.ok())throw new Error('线上pipeline不可读');
   report.pipelineMatchesLocal=(await pipeline.text()).replace(/\r\n/g,'\n')===fs.readFileSync(root+'/wiki-demo-mvp/pipeline.js','utf8').replace(/\r\n/g,'\n');
   report.threshold=await page.evaluate(()=>{const candidates={topics:[],entities:[]},context={snapshot:{workbook:savedWorkbook},historySnapshot:{topics:[]},documentContext:{}},prompts={step2:'粒度',integration:'整合'};const base=integrationModelInput(prompts,candidates,context).length;const input=integrationModelInput({...prompts,integration:prompts.integration+'a'.repeat(100000-base)},candidates,context);const atLimit={length:input.length,stats:structuredClone(context.integrationInputStats)};let error='';try{integrationModelInput({...prompts,integration:prompts.integration+'a'.repeat(100001-base)},candidates,context)}catch(e){error=e.message}return{limit:WIKI_INTEGRATION_CHAR_LIMIT,atLimit,error}});
   if(!report.pipelineMatchesLocal||report.threshold.limit!==100000||report.threshold.atLimit.length!==100000||!report.threshold.error.includes('100,001 / 100,000')||!report.promptHistoryUnchanged)throw new Error('线上阈值或配置验证失败');
  }
  await page.click('[data-prompt="integration"]');
  report.twoIntegrationEditors=await page.evaluate(()=>!!document.getElementById('baselinePromptEditor').value&&!!document.getElementById('promptEditor').value);
  await page.screenshot({path:root+'/outputs/'+(thresholdMode?'知识Wiki整合阈值线上验证.png':'知识Wiki全局整合线上发布验证.png'),fullPage:true});
  if(!report.workbookUnchanged||!state.integrationTab||!state.pipelineLoaded||!report.twoIntegrationEditors)process.exitCode=1;
 }
 fs.writeFileSync(root+'/outputs/wiki-integration-release-'+stage+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(state.runDisabled||errors.length||blocked.length)process.exitCode=1;
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
