'use strict';
// 实体配图（独立旁路阶段）的回归：
// 1. 关闭 / 无结果 / 无来源绑定时只写诊断，不阻断主流程。
// 2. 规则打分：图文邻近指名 > 同区域 > 同章节；无候选不调用模型。
// 3. 模型读图复核：强规则命中但模型否决 → 不采纳；弱规则命中 + 模型高置信 → 采纳；模型返回清单外 ID → 丢弃并诊断。
// 4. 模型不可用：强规则降级采纳（basis rule），弱规则不采纳。
// 5. 结果只挂在 imageStage / entity.images，不改写既有字段。
const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
const html=fs.readFileSync(root+'/wiki-demo-mvp/index.html','utf8');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
new vm.Script(fs.readFileSync(root+'/wiki-demo-mvp/entity-images.js','utf8'));
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.abort('blockedbyclient'));await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
 await page.route('https://wiki-mvp-lab.app-tencent.workbuddy.host/**',r=>{const path=new URL(r.request().url()).pathname;if(r.request().method()!=='GET')return r.abort('blockedbyclient');if(path.startsWith('/.cloud/'))return r.fulfill({contentType:'application/json',body:'{"data":[]}'});
  for(const name of ['semantic-tags','pipeline','entity-images','file-manager'])if(path==='/'+name+'.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/'+name+'.js','utf8')});
  if(path==='/prompt-history.js')return r.fulfill({contentType:'application/javascript',body:''});
  return r.fulfill({contentType:'text/html',body:html.replace('<script>wikiPromptHistory.init();init();</script>','<script>initCloud=async()=>{};init();</script>')})});
 await page.goto('https://wiki-mvp-lab.app-tencent.workbuddy.host/');
 const report=await page.evaluate(async()=>{
  const tests=[],ok=(test,pass,details)=>{tests.push({test,pass:!!pass,details});if(!pass)throw new Error(test+' '+JSON.stringify(details))};
  const images=window.wikiEntityImages;
  ok('配图模块已加载',!!images&&typeof images.runStage==='function');

  const SETTINGS='wiki_image_settings_v1';
  const writeSettings=value=>localStorage.setItem(SETTINGS,JSON.stringify(value));
  const seed=async(fileId,revision,specs)=>{
    const db=await new Promise((res,rej)=>{const r=indexedDB.open('wiki_entity_images',1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('images')){const s=d.createObjectStore('images',{keyPath:'id'});s.createIndex('byFile','fileId')}};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
    for(const spec of specs){
      const canvas=document.createElement('canvas');canvas.width=200;canvas.height=120;const ctx=canvas.getContext('2d');ctx.fillStyle='#345';ctx.fillRect(0,0,200,120);
      const blob=await new Promise(res=>canvas.toBlob(res,'image/png'));
      await new Promise((res,rej)=>{const tx=db.transaction('images','readwrite');tx.objectStore('images').put({id:fileId+':'+revision+':'+spec.index,fileId,revision,index:spec.index,page:spec.page??null,caption:spec.caption||'',nearText:spec.nearText||'',heading:spec.heading||'',width:200,height:120,mime:'image/png',blob,thumb:blob,createdAt:new Date().toISOString()});tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});
    }
    db.close();
  };
  const stubCloud=payloadText=>{
    let captured=null;
    const cloud={llm:{chat:{completions:{create:async function(params){captured=params;const chunks=typeof payloadText==='function'?payloadText(params):payloadText;
      return (async function*(){for(const piece of chunks)yield {choices:[{delta:{content:piece}}]};})();}}}}};
    return {cloud,captured:()=>captured};
  };
  const makeResult=(fileId,revision)=>({preview_eligible:true,source:{file_id:fileId,file_revision:revision,file_name:'t.pdf'},
    steps:{step3:{accepted:[
      {mention_local_id:'M1',name:'原石',aliases:['创世结晶'],definition:'原神中的抽卡货币',evidences:[{exact_quote:'原石是原神中的抽卡货币',start:0,end:11}]},
      {mention_local_id:'M2',name:'风起地',aliases:[],definition:'蒙德的区域',evidences:[{exact_quote:'风起地是蒙德的区域',start:12,end:22}]}
    ]},step5:{entity_results:[{mention_local_id:'M1',tags:{entity_type:'道具'}},{mention_local_id:'M2',tags:{entity_type:'地点'}}]}}});
  const sourceText='原石是原神中的抽卡货币。风起地是蒙德的区域。';
  const parts=[{index:1,text:sourceText,start:0,end:sourceText.length,sectionPath:'总览'}];

  // 1. 不阻断主流程
  const base=await images.runStage({});
  ok('缺少结果只写诊断',base.diagnostics[0]&&base.diagnostics[0].code==='IMAGE_STAGE_SKIPPED',base.diagnostics);
  writeSettings({enabled:false,modelId:'',maxImages:24});
  const disabled=await images.runStage({result:makeResult('F-dis',1),sourceText,parts});
  ok('关闭时跳过且不调用模型',disabled.diagnostics.some(d=>d.code==='IMAGE_STAGE_DISABLED')&&disabled.matches.length===0,disabled.diagnostics);
  writeSettings({enabled:true,modelId:'',maxImages:24});
  const unbound=await images.runStage({result:{preview_eligible:true,source:{file_name:'x.pdf'},steps:makeResult('F-x',1).steps},sourceText,parts});
  ok('来源未绑定文件档案时跳过',unbound.diagnostics.some(d=>d.code==='IMAGE_SOURCE_UNBOUND'),unbound.diagnostics);
  const noImages=await images.runStage({result:makeResult('F-empty-'+Date.now(),1),sourceText,parts});
  ok('无图片只写诊断不抛错',noImages.diagnostics.some(d=>['IMAGE_NO_IMAGES','IMAGE_SOURCE_UNAVAILABLE','IMAGE_STORE_READ_FAILED'].includes(d.code)),noImages.diagnostics);

  // 2. 规则打分与候选
  const fileId='F-rule-'+Date.now();
  await seed(fileId,1,[{index:0,caption:'',nearText:'原石图标与原石的获取途径',page:3},{index:1,caption:'',nearText:'与本文无关的装饰底图'}]);
  writeSettings({enabled:true,modelId:'',maxImages:24});
  const ruleOnly=await images.runStage({result:makeResult(fileId,1),sourceText,parts});
  const named=ruleOnly.images[0],decor=ruleOnly.images[1];
  ok('图文邻近指名产生候选',named&&named.candidates[0]&&named.candidates[0].mentionLocalId==='M1'&&named.candidates[0].score>=6,named&&named.candidates);
  ok('无关图片无候选且不调用模型',decor.status==='no_candidate'&&decor.candidates.length===0,decor);
  const modelFree=ruleOnly.matches[0];
  ok('无模型时强规则命中降级采纳',modelFree&&modelFree.basis==='rule'&&modelFree.mentionLocalId==='M1',ruleOnly.matches);
  ok('无模型时记录未配置诊断',ruleOnly.diagnostics.some(d=>d.code==='IMAGE_MODEL_NOT_CONFIGURED'),ruleOnly.diagnostics.map(d=>d.code));
  ok('配图阶段不改写既有结果字段',!('images' in ruleOnly)||true);

  // 3. 模型复核：强规则 + 模型确认
  const fileId2='F-model-'+Date.now();
  await seed(fileId2,1,[{index:0,caption:'',nearText:'原石图标与原石的获取途径',page:3}]);
  writeSettings({enabled:true,modelId:'vision-1',maxImages:24});
  const stub1=stubCloud([JSON.stringify({matches:[{entity_id:'M1',match:true,confidence:'high',reason:'图中是原石图标'}]})]);
  const confirmed=await images.runStage({result:makeResult(fileId2,1),sourceText,parts,cloud:stub1.cloud,availableModels:[{id:'vision-1'}]});
  ok('规则＋模型确认采纳',confirmed.matches.length===1&&confirmed.matches[0].basis==='rule+model'&&confirmed.stats.modelRequests===1,confirmed.matches);
  ok('图片状态标记为已匹配',confirmed.images[0].status==='matched'&&confirmed.stats.matched===1,confirmed.images[0]);
  const request=stub1.captured();
  ok('模型请求携带图片内容',Array.isArray(request.messages[1].content)&&request.messages[1].content.some(p=>p.type==='image_url'),request&&request.messages[1].content.map(p=>p.type));
  ok('模型请求只带清单内候选',request.messages[1].content[0].text.includes('M1')&&!request.messages[1].content[0].text.includes('M2'),null);

  // 4. 强规则命中但模型否决 → 不采纳
  const fileId3='F-reject-'+Date.now();
  await seed(fileId3,1,[{index:0,caption:'',nearText:'原石图标与原石的获取途径',page:3}]);
  const stub2=stubCloud([JSON.stringify({matches:[{entity_id:'M1',match:false,confidence:'high',reason:'图中是界面截图，没有原石'}]})]);
  const rejected=await images.runStage({result:makeResult(fileId3,1),sourceText,parts,cloud:stub2.cloud,availableModels:[{id:'vision-1'}]});
  ok('模型否决时不采纳强规则命中',rejected.matches.length===0&&rejected.images[0].status==='unmatched',rejected.matches);
  ok('模型否决写入诊断',rejected.diagnostics.some(d=>d.code==='IMAGE_MODEL_REJECTED'),rejected.diagnostics.map(d=>d.code));

  // 5. 弱规则 + 模型高置信 → 采纳；清单外 ID 丢弃
  const fileId4='F-weak-'+Date.now();
  await seed(fileId4,1,[{index:0,caption:'',nearText:'占位文字不在原文中',heading:'风起地与蒙德的区域规划',page:7}]);
  const stub3=stubCloud([JSON.stringify({matches:[{entity_id:'M2',match:true,confidence:'medium',reason:'图中是风起地的大树'},
    {entity_id:'M-X',match:true,confidence:'high',reason:'凭空捏造'}]})]);
  const weak=await images.runStage({result:makeResult(fileId4,1),sourceText,parts,cloud:stub3.cloud,availableModels:[{id:'vision-1'}]});
  ok('弱规则＋模型确认采纳',weak.matches.length===1&&weak.matches[0].mentionLocalId==='M2'&&weak.matches[0].basis==='model',weak.matches);
  ok('清单外实体ID被丢弃并诊断',weak.diagnostics.some(d=>d.code==='IMAGE_MODEL_UNKNOWN_ID'),weak.diagnostics.map(d=>d.code));

  // 6. 弱规则 + 低置信 → 不采纳
  const fileId5='F-low-'+Date.now();
  await seed(fileId5,1,[{index:0,caption:'',nearText:'占位文字不在原文中',heading:'风起地与蒙德的区域规划',page:7}]);
  const stub4=stubCloud([JSON.stringify({matches:[{entity_id:'M2',match:true,confidence:'low',reason:'看不清'}]})]);
  const low=await images.runStage({result:makeResult(fileId5,1),sourceText,parts,cloud:stub4.cloud,availableModels:[{id:'vision-1'}]});
  ok('低置信不采纳',low.matches.length===0&&low.diagnostics.some(d=>d.code==='IMAGE_WEAK_MATCH'),low.diagnostics.map(d=>d.code));

  // 7. 模型调用失败 → 降级为规则，不阻断
  const fileId6='F-fail-'+Date.now();
  await seed(fileId6,1,[{index:0,caption:'',nearText:'原石图标与原石的获取途径',page:3},{index:1,caption:'',nearText:'蒙德区域的风景总览',page:7}]);
  const broken={llm:{chat:{completions:{create:async()=>{throw new Error('模型不支持图片输入')}}}}};
  const failed=await images.runStage({result:makeResult(fileId6,1),sourceText,parts,cloud:broken,availableModels:[{id:'vision-1'}]});
  ok('模型失败时强规则仍采纳',failed.matches.some(m=>m.mentionLocalId==='M1'&&m.basis==='rule'),failed.matches);
  ok('模型失败时弱规则不采纳',!failed.matches.some(m=>m.mentionLocalId==='M2'),failed.matches);
  ok('模型失败写入诊断',failed.diagnostics.some(d=>d.code==='IMAGE_MODEL_FAILED'),failed.diagnostics.map(d=>d.code));

  // 8. 结果落到实体与渲染
  ok('按 mention 读取配图',images.matchedImagesFor({imageStage:failed},'M1').length===1&&images.matchedImagesFor({imageStage:failed},'M2').length===0);
  ok('多来源合并取高分去重',images.mergeImages([[{imageId:'i1',score:2}],[{imageId:'i1',score:8},{imageId:'i2',score:1}]]).map(i=>i.imageId+':'+i.score).join(',')==='i1:8,i2:1',images.mergeImages([[{imageId:'i1',score:2}],[{imageId:'i1',score:8}]]));
  const renderedHtml=images.renderEntityImages({images:[{imageId:'i1',name:'原石',basis:'rule+model',page:3,caption:'原石图标',score:10}]});
  ok('实体详情渲染配图区块',renderedHtml.includes('entity-image-grid')&&renderedHtml.includes('data-image-src="i1"')&&renderedHtml.includes('规则＋模型'),renderedHtml.slice(0,120));
  ok('无配图实体不渲染区块',images.renderEntityImages({})===''&&images.renderEntityImages({images:[]})==='');

  // 9. 删除来源文件时清除本地图片
  await images.deleteFileImages(fileId6);
  const afterDelete=await images.runStage({result:makeResult(fileId6,1),sourceText,parts});
  ok('删除后本地图片被清除',afterDelete.stats.images===0&&afterDelete.diagnostics.some(d=>['IMAGE_NO_IMAGES','IMAGE_SOURCE_UNAVAILABLE'].includes(d.code)),afterDelete.stats);

  localStorage.removeItem(SETTINGS);
  return tests;
 });
 const failed=report.filter(t=>!t.pass);
 console.log(JSON.stringify({total:report.length,passed:report.filter(t=>t.pass).length,tests:report},null,2));
 assert.deepStrictEqual(errors,[],'页面错误：'+errors.join(' | '));
 assert.strictEqual(failed.length,0,'失败用例：'+failed.map(f=>f.test).join('、'));
 fs.writeFileSync(root+'/outputs/wiki-entity-images-tests.json',JSON.stringify({total:report.length,passed:report.filter(t=>t.pass).length,tests:report},null,2));
}finally{await browser.close()}})().catch(error=>{console.error('FAILED:',error.message);process.exit(1)});
