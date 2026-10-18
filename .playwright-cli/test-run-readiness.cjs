const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs=require('fs'),vm=require('vm');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
const html=fs.readFileSync(root+'/wiki-demo-mvp/index.html','utf8');
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
(async()=>{const browser=await chromiumium();try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.abort('blockedbyclient'));await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
 await page.route('https://wiki-mvp-lab.app-tencent.workbuddy.host/**',r=>{const p=new URL(r.request().url()).pathname;if(r.request().method()!=='GET')return r.abort('blockedbyclient');if(p.startsWith('/.cloud/'))return p.startsWith('/.cloud/llm/')?r.abort('blockedbyclient'):r.fulfill({contentType:'application/json',body:'{"data":[]}'});/* 仅隔离旧逻辑回归，不代表全应用；新模块仍请求加载但返回空脚本。 */if(p==='/prompt-history.js')return r.fulfill({contentType:'application/javascript',body:''});if(p==='/semantic-tags.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/semantic-tags.js','utf8')});if(p==='/file-manager.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/file-manager.js','utf8')});return r.fulfill((p==='/pipeline.js'||p==='/entity-images.js')?{contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/pipeline.js','utf8')}:{contentType:'text/html',body:html.replace('<script>wikiPromptHistory.init();init();</script>','<script>initCloud=async()=>{};init();</script>')})});
 await page.goto('https://wiki-mvp-lab.app-tencent.workbuddy.host/');
 const report=await page.evaluate(async()=>{
  const tests=[],ok=(name,pass)=>{tests.push({name,pass:!!pass});if(!pass)throw new Error(name)};
  const btn=document.getElementById('runBtn'),text=()=>document.getElementById('runReadinessText').textContent;
  const workbook={sheets:[{name:WORKBOOK_SHEETS[0],rows:[[],[],[],['类型 ID','管理分组','正式标签','定义','包含示例','排除与边界','赋值规则','状态'],['ET-1','角色','NPC','非玩家角色','','不含玩家角色','','active']]},{name:WORKBOOK_SHEETS[1],rows:[[],[],[],['分面 ID','分面名称','正式取值','值类型','基数','值来源','主要用途','未命中处理'],['F1','产品','测试游戏']]},{name:WORKBOOK_SHEETS[2],rows:[[],[],[],['规则 ID','场景','规则','程序门控','处理方式'],['R1','测试','规则']]}]};
  savedWorkbook=workbook;draftWorkbook=structuredClone(workbook);assetWorkbook=workbook;workbookReady=true;workbookRowId=1;workbookRevision=1;availableModels=[{id:'test',name:'回归模型'}];document.getElementById('modelSelect').innerHTML='<option value="test">回归模型</option>';cloud={};
  updateRunReadiness();ok('没有文件禁用并说明原因',btn.disabled&&text().includes('请先添加'));
  await handleSourceFile(new File(['按钮回归正文'], '测试.txt',{type:'text/plain'}));ok('文件与云条件就绪自动启用',!btn.disabled&&text().includes('已就绪'));
  fileReading=true;renderSourceUI();ok('读取未完成阻止运行',btn.disabled&&text().includes('文件仍在读取'));fileReading=false;
  workbookReady=false;workbookRowId=null;workbookLoadError='模拟网络中断';renderSourceUI();ok('词表加载失败原因始终显示',btn.disabled&&text().includes('模拟网络中断')&&!document.getElementById('retryReadinessBtn').hidden);ok('文件状态不再虚报可运行',!document.getElementById('sourceStatus').textContent.includes('可运行模型测试'));
  markResultsStale();ok('编辑规则不会掩盖词表错误',text().includes('模拟网络中断'));
  let reads=0,writes=0,fail=false,release=null;
  cloud={database:{from(){return {select(){return this},eq(){return this},maybeSingle:async()=>{reads++;if(release)await new Promise(r=>release=r);return fail?{error:{message:'模拟云读取失败'}}:{data:{id:1,workbook,revision:2}}},insert(){writes++;throw new Error('不得写入')}}}}};
  await retryRunReadiness();ok('重试读回词表后按钮恢复',!btn.disabled&&workbookRevision===2&&!workbookLoadError);ok('重试只读取不写共享数据',reads===1&&writes===0);
  workbookBusy=true;renderSourceUI();ok('词表操作中保持运行互斥',btn.disabled&&text().includes('读取或保存'));workbookBusy=false;
  document.getElementById('modelSelect').innerHTML='<option value="">请选择模型</option><option value="test">回归模型</option>';updateRunReadiness();ok('模型未选择显示原因',btn.disabled&&text().includes('选择一个可用模型'));document.getElementById('modelSelect').value='test';markResultsStale();ok('选择模型立即刷新按钮',!btn.disabled);
  cloudLoadError='模拟SDK连接失败';updateRunReadiness();ok('模型连接错误阻止误运行',btn.disabled&&text().includes('模拟SDK连接失败'));cloudLoadError='';
  setRunning(true);ok('运行中禁用且停止可用',btn.disabled&&!document.getElementById('stopBtn').disabled);setRunning(false);ok('结束运行恢复按钮',!btn.disabled);
  const preserved=state.source.text;fail=true;await runCurrent();ok('运行前云读取失败明确阻止',btn.disabled&&text().includes('未能确认云端最新词表'));ok('云读取失败保留文件且不假运行',state.source.text===preserved&&!isRunning&&!workbookBusy);
  fail=false;await retryRunReadiness();ok('运行前失败可重试恢复',!btn.disabled&&!workbookLoadError);
  const prompt=state.prompts.step2;document.getElementById('viewWorkbookBtn').click();ok('查看词表入口切换正确页面',state.page==='workbook');setPage('lab');ok('重试不改用户规则',state.prompts.step2===prompt);
  state.source=null;updateRunReadiness();ok('移除文件重新禁用',btn.disabled&&text().includes('请先添加'));
  state.source={name:'按钮回归.txt',size:30,text:preserved};renderSourceUI();return {kind:'mock-browser-no-paid-model-calls',tests,writes,reads};
 });
 await page.screenshot({path:root+'/outputs/知识Wiki运行条件提示回归.png',fullPage:true});report.pageErrors=errors;
 fs.writeFileSync(root+'/outputs/wiki-run-readiness-tests.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(errors.length)process.exitCode=1;
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
async function chromiumium(){return chromium.launch({channel:'chrome',headless:true})}
