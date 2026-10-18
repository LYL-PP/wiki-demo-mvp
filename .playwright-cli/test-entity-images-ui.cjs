'use strict';
// 校验入库测试页的实体配图设置默认可见（非折叠），且模型选项能被填充。：实体配图设置在入库测试页默认可见（非折叠），且模型选项能被填充。
const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs=require('fs');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
const html=fs.readFileSync(root+'/wiki-demo-mvp/index.html','utf8');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.abort('blockedbyclient'));await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
 await page.route('https://wiki-mvp-lab.app-tencent.workbuddy.host/**',r=>{const path=new URL(r.request().url()).pathname;if(r.request().method()!=='GET')return r.abort('blockedbyclient');if(path.startsWith('/.cloud/'))return r.fulfill({contentType:'application/json',body:'{"data":[]}'});
  for(const name of ['semantic-tags','pipeline','entity-images','file-manager'])if(path==='/'+name+'.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/'+name+'.js','utf8')});
  if(path==='/prompt-history.js')return r.fulfill({contentType:'application/javascript',body:''});
  return r.fulfill({contentType:'text/html',body:html.replace('<script>wikiPromptHistory.init();init();</script>','<script>initCloud=async()=>{window.availableModels=[{id:"m1",name:"视觉模型 A"},{id:"m2",name:"文本模型 B"}];window.wikiEntityImages.fillModelOptions(window.availableModels);};wikiPromptHistory={init(){},getController(){return {status(){return {ready:true}}}}};init();</script>')})});
 await page.goto('https://wiki-mvp-lab.app-tencent.workbuddy.host/');
 const result=await page.evaluate(()=>{setPage('lab');
  const select=document.getElementById('imageModelSelect');
  const rect=select.getBoundingClientRect();
  const style=getComputedStyle(select);
  return {present:!!select,visible:rect.width>0&&rect.height>0&&style.display!=='none',options:Array.from(select.options).map(o=>o.textContent),
    enabled:document.getElementById('imageStageEnabled').checked,max:document.getElementById('imageMaxInput').value,
    hint:document.getElementById('imageSettingsHint').textContent,insideLab:!!select.closest('#labPage')};
 });
 console.log(JSON.stringify(result,null,2));
 if(!result.present||!result.visible)throw new Error('图片判定模型选择器在入库测试页不可见');
 if(!result.options.some(o=>o.includes('视觉模型 A')))throw new Error('模型选项未填充');
 if(errors.length)throw new Error('页面错误：'+errors.join(' | '));
 console.log('IMAGE UI VISIBLE OK');
}finally{await browser.close()}})().catch(e=>{console.error('FAILED:',e.message);process.exit(1)});
