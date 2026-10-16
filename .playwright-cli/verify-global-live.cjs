const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs=require('fs');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://wiki-mvp-lab.app-tencent.workbuddy.host/**',r=>{const p=new URL(r.request().url()).pathname;if(p==='/'||p==='/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(root+'/wiki-demo-mvp/index.html','utf8')});if(p==='/pipeline.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/pipeline.js','utf8')});return r.continue()});
 await page.goto('https://wiki-mvp-lab.app-tencent.workbuddy.host/');
 await page.waitForFunction(()=>availableModels.length>0&&workbookReady,null,{timeout:45000});
 await page.evaluate(()=>setPage('lab'));
 const info=await page.evaluate(()=>({model:document.getElementById('modelSelect').value,modelCount:availableModels.length,workbook:workbookRevision}));
 if(!info.model)throw new Error('默认模型不可用，未擅自换模型。');
 await page.setInputFiles('#fileInput','C:/Users/louisxzlu/Downloads/游戏攻略/《巫师3：狂猎》新手向指南&轻攻略&念叨 - 知乎.pdf');
 await page.waitForFunction(()=>!fileReading,null,{timeout:45000});
 const source=await page.evaluate(()=>state.source?{name:state.source.name,characters:state.source.text.length,parts:splitSourceForModel(state.source.text).length}:null);if(!source)throw new Error(await page.locator('#sourceStatus').textContent());
 const attempts=[];
 for(let attempt=1;attempt<=2;attempt++){await page.evaluate(async()=>{await runCurrent()});const status=await page.evaluate(()=>({success:!!state.current,error:state.current?null:document.getElementById('currentResult').textContent,cached:[...wikiCandidateCache.values()].map(c=>({completed:c.parts.size,counts:[...c.parts.values()].map(p=>({topics:p.topics.length,entities:p.entities.length})),candidates:{topics:[...c.parts.values()].flatMap(p=>p.topics),entities:[...c.parts.values()].flatMap(p=>p.entities),review:[...c.parts.values()].flatMap(p=>p.review),discardedRelations:[...c.parts.values()].flatMap(p=>p.discardedRelations)}}))}));attempts.push(status);if(status.success||!status.error.includes('再次点击运行'))break}
 const report=await page.evaluate(()=>({kind:'real-user-pdf-real-cloud-model-local-source-not-published',source:{name:state.source?.name,characters:state.source?.text.length},status:document.getElementById('apiStatus').textContent,current:state.current,baseline:state.baseline,error:state.current?null:document.getElementById('currentResult').textContent,previewTopics:state.previewTopics.map(t=>({name:t.name,scope:t.scope})),previewEntities:state.previews.length}));report.pageErrors=errors;report.attempts=attempts;
 fs.writeFileSync(root+'/outputs/wiki-global-integration-live.json',JSON.stringify(report,null,2));await page.screenshot({path:root+'/outputs/知识Wiki全局整合真实PDF验证.png',fullPage:true});
 console.log(JSON.stringify({info,source,attempts:attempts.map(a=>({success:a.success,error:a.error,cached:a.cached.map(c=>({completed:c.completed,counts:c.counts}))})),status:report.status,error:report.error,metrics:report.current?.metrics,integration:report.current?.integration,model:report.current?.model,topics:report.current?.topics?.map(t=>({name:t.name,scope:t.scope})),entities:report.current?.steps.step3.accepted.map(e=>e.name),pageErrors:errors},null,2));if(!report.current||errors.length)process.exitCode=1;
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
