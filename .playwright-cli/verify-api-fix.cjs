const { chromium } = require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs = require('fs');
const path = 'C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25/wiki-demo-mvp/index.html';
const origin = 'https://wiki-mvp-lab.app-tencent.workbuddy.host';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    const requestStats = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('response', response => { if (response.url().includes('/llm/chat/')) requestStats.push({ status: response.status(), type: response.headers()['content-type'] }); });
    // Only replace the HTML document with the saved local revision. Cloud SDK and API requests remain live and untouched.
    await page.route(origin + '/', route => route.request().resourceType() === 'document' ? route.fulfill({status:200,contentType:'text/html',body:fs.readFileSync(path,'utf8')}) : route.continue());
    await page.goto(origin + '/', {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => document.getElementById('modelSelect').disabled === false, null, {timeout:30000});
    await page.getByRole('button', {name:/入库测试/}).click();
    const results = [];
    for (const label of ['GLM-5.3-Flash','Claude-Haiku-4.5']) {
      await page.getByLabel('选择在线模型').selectOption({label});
      await page.getByRole('button', {name:'运行当前提示词'}).click();
      await page.waitForFunction(() => !document.getElementById('runBtn').disabled, null, {timeout:200000});
      results.push(await page.evaluate(() => ({label:document.getElementById('modelSelect').selectedOptions[0].textContent,status:document.getElementById('apiStatus').textContent,time:document.getElementById('runTime').textContent,metrics:state.current?.metrics||null,telemetry:state.current?.model||null,error:document.getElementById('currentResult').innerText.slice(0,300)}))); console.log('MODEL_RESULT',JSON.stringify(results[results.length-1]));
    }
    await page.getByLabel('选择在线模型').selectOption({label:'GLM-5.3-Flash'});
    await page.getByRole('button', {name:'宽松版',exact:true}).click();
    await page.getByRole('button', {name:'运行当前提示词'}).click();
    await page.waitForFunction(() => !document.getElementById('runBtn').disabled, null, {timeout:380000});
    results.push(await page.evaluate(() => ({test:'edited-prompt',status:document.getElementById('apiStatus').textContent,baseline:state.baseline?.metrics,current:state.current?.metrics,diff:document.getElementById('diffList').textContent})));
    await page.screenshot({path:'C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25/.playwright-cli/api-fix.png',fullPage:true});
    console.log(JSON.stringify({results,requestStats,pageErrors},null,2));
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
