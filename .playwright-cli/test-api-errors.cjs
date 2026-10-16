const { chromium } = require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page = await browser.newPage();
    await page.route('https://wiki-mvp-lab.app-tencent.workbuddy.host/', route => route.fulfill({contentType:'text/html',body:fs.readFileSync('C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25/wiki-demo-mvp/index.html','utf8')}));
    await page.goto('https://wiki-mvp-lab.app-tencent.workbuddy.host/');
    await page.waitForFunction(() => !document.getElementById('modelSelect').disabled);
    const report = await page.evaluate(async () => {
      // Fault injection only: these artificial streams test failure handling, not actual connectivity.
      const originalCloud = cloud;
      const tests = [];
      const context = {modelId:availableModels[0].id,sampleKey:'archer'};
      const setStream = fn => { cloud = {llm:{chat:{completions:{create:fn}}}}; };
      setStream(async function*(){yield {choices:[{delta:{reasoning_content:'processing'},finish_reason:'length'}]};});
      try { await callOnlineModel(DEFAULT_PROMPTS,SAMPLES.archer.text,context); tests.push({test:'length',pass:false}); } catch(e) { tests.push({test:'length',pass:e.message.includes('截断'),message:e.message}); }
      setStream(async function*(){yield {choices:[{delta:{content:'{"ok":true}'},finish_reason:'stop'}]};});
      try { await callOnlineModel(DEFAULT_PROMPTS,SAMPLES.archer.text,context); tests.push({test:'missing-schema',pass:false}); } catch(e) { tests.push({test:'missing-schema',pass:e.message.includes('step2'),message:e.message}); }
      setStream(async function*(){yield {choices:[{delta:{content:'{"step2":'},finish_reason:'stop'}]};});
      try { await callOnlineModel(DEFAULT_PROMPTS,SAMPLES.archer.text,context); tests.push({test:'invalid-json',pass:false}); } catch(e) { tests.push({test:'invalid-json',pass:e.message.includes('JSON'),message:e.message}); }
      setStream(async function*({signal}){ await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('cancel','AbortError')),{once:true})); });
      const pending = callOnlineModel(DEFAULT_PROMPTS,SAMPLES.archer.text,context);
      activeController.abort();
      try { await pending; tests.push({test:'abort',pass:false}); } catch(e) { tests.push({test:'abort',pass:e.name==='AbortError'}); }
      tests.push({test:'auth-message',pass:modelErrorMessage({error:{code:'auth_invalid_origin',message:'denied'},requestId:'test-request'}).includes('test-request')});
      tests.push({test:'quota-message',pass:modelErrorMessage({error:{code:'quota_exhausted',message:'quota'}}).includes('额度不足')});
      cloud = originalCloud;
      activeController=null;
      return tests;
    });
    console.log(JSON.stringify(report,null,2));
    if(report.some(test=>!test.pass))process.exitCode=1;
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
