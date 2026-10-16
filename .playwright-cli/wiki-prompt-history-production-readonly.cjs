'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {createHash}=require('node:crypto');
const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const root=path.resolve(__dirname,'..'),source=path.join(root,'wiki-demo-mvp');
const expected=JSON.parse(fs.readFileSync(path.join(root,'outputs/wiki-prompt-history-initial-snapshot.json'),'utf8'));
const validation=JSON.parse(fs.readFileSync(path.join(root,'outputs/wiki-prompt-history-initial-validation.json'),'utf8'));
const html=fs.readFileSync(path.join(source,'index.html'),'utf8');
const configLine=html.split('\n').find(line=>line.startsWith('const publicConfig='));
assert.ok(configLine,'当前 index 缺少 publicConfig');
const publicConfig=vm.runInNewContext(configLine+';publicConfig');
const origin=new URL(publicConfig.endpoint).origin;
const steps=['step2','step3','step4','step5','integration'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const canonical=snapshot=>JSON.stringify(Object.fromEntries(['baseline','current'].map(side=>[side,Object.fromEntries(steps.map(step=>[step,snapshot[side][step]]))])));
const online=process.argv.includes('--online');
const resourceMatches={};
const requests=[],historyResponses=[],blocked=[],mocked=[],errors=[];
async function main(){
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1500,height:1100},serviceWorkers:'block'});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{const url=new URL(response.url());if(url.pathname==='/'+'.cloud/database/rest/wiki_prompt_versions')historyResponses.push({status:response.status(),query:url.searchParams.toString()});});
  try{
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url()),method=request.method(),headers=await request.allHeaders();
      const item={method,path:url.pathname,origin:headers.origin||null,refererOrigin:headers.referer?new URL(headers.referer).origin:null,authorizationPresent:!!headers.authorization};requests.push(item);
      if(url.pathname.startsWith('/.cloud/database/rest/')&&method!=='GET'){blocked.push({...item,reason:'拦截所有非 GET 表请求'});return route.abort('blockedbyclient');}
      if(url.pathname.startsWith('/.cloud/llm/')){if(method==='GET'){mocked.push({...item,reason:'仅模型列表 mock'});return route.fulfill({contentType:'application/json',body:JSON.stringify({data:[]})});}blocked.push({...item,reason:'禁止模型调用'});return route.abort('blockedbyclient');}
      if(url.pathname.startsWith('/.cloud/')){
        if(method!=='GET'){blocked.push({...item,reason:'禁止其他云写入或登录请求'});return route.abort('blockedbyclient');}
        assert.equal(url.origin,origin,'云请求 Origin 必须是原应用');
        if(url.pathname.startsWith('/.cloud/database/rest/wiki_prompt_versions'))assert.equal(headers.authorization,undefined,'历史必须无登录读取');
        return route.continue();
      }
      if(url.origin===origin){
        const name=decodeURIComponent(url.pathname).replace(/^\/+/,''),target=path.resolve(source,name||'index.html');
        if(target!==source&&!target.startsWith(source+path.sep))return route.abort('blockedbyclient');
        if(online){
          if(['index.html','semantic-tags.js','pipeline.js','file-manager.js','prompt-history.js'].includes(name||'index.html')){
            const response=await route.fetch();
            assert.equal(response.status(),200,'线上资源必须可读 '+name);
            const actual=(await response.body()).toString('utf8').replace(/\r\n/g,'\n');
            const local=fs.readFileSync(target,'utf8').replace(/\r\n/g,'\n');
            assert.equal(actual,local,'线上资源必须与本地一致 '+name);
            resourceMatches[name||'index.html']=true;
            return route.fulfill({response});
          }
          return route.continue();
        }
        if(fs.existsSync(target)&&fs.statSync(target).isFile())return route.fulfill({path:target});
        return route.fulfill({status:404,body:''});
      }
      if(request.resourceType()==='script'&&url.href===html.match(/<script src="([^"]*workbuddy-cloud-sdk[^"]*)"/)[1])return route.continue();
      return route.abort('blockedbyclient');
    });
    assert.equal((await context.cookies()).length,0);
    await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>window.wikiPromptHistory?.getController()?.status().ready,{},{timeout:90000});
    const initial=await page.evaluate(()=>({origin:location.origin,status:wikiPromptHistory.getController().status(),defaults:structuredClone(DEFAULT_PROMPTS),files:localStorage.getItem(FILE_WORKSPACE_KEY),previews:JSON.stringify(state.previews),topics:JSON.stringify(state.previewTopics),workbook:JSON.stringify(savedWorkbook)}));
    assert.equal(initial.origin,origin);assert.equal(initial.status.blocked,'');assert.equal(initial.status.dirty,false);
    assert.equal(await page.locator('#weakPresetBtn').count(),0);
    assert.equal(await page.getByRole('button',{name:'此 STEP 宽松版',exact:true}).count(),0);
    await page.evaluate(()=>{setRunning(true);setRunning(false)});
    const row=await page.evaluate(async()=>{const {data:session,error:sessionError}=await cloud.auth.getSession();if(sessionError)throw sessionError;if(session!==null)throw Error('浏览器存在登录 session');const result=await cloud.database.from('wiki_prompt_versions').select('*').order('revision',{ascending:false}).limit(1);if(result.error)throw result.error;return result.data?.[0];});
    assert.ok(row,'真实 SDK latest 没有返回记录');
    assert.equal(String(row.revision),'1');assert.equal(String(row.parent_revision),'0');assert.equal(row.request_id,validation.request_id);assert.equal(row.action,'initial');
    assert.equal(row.note,'启用共享提示词历史；从此版本开始记录修改，过去已覆盖的版本无法追溯');assert.equal(row.editor_label,'初始系统默认');assert.equal(row.restored_from,null);assert.ok(Number.isFinite(Date.parse(row.created_at)));
    assert.deepEqual(row.snapshot,expected);assert.deepEqual(initial.status.base,row);assert.deepEqual(initial.status.snapshot,expected);assert.deepEqual(initial.defaults,expected.current);
    assert.deepEqual(row.changed_steps,['baseline','current'].flatMap(side=>steps.map(step=>side+'.'+step)));
    await page.evaluate(()=>setPage('lab'));await page.locator('#promptHistoryBtn').click();
    await page.waitForFunction(()=>document.querySelectorAll('#promptHistoryDetail .prompt-history-step').length===10);
    assert.match(await page.locator('#promptHistoryDetail').innerText(),/初始系统默认/);assert.match(await page.locator('#promptHistoryDetail').innerText(),/过去已覆盖的版本无法追溯/);
    for(const width of [1440,760,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'历史弹窗视口不能横向溢出 '+width);assert.equal(await page.locator('#promptHistoryClose').isVisible(),true);}await page.setViewportSize({width:1500,height:1100});await page.screenshot({path:path.join(root,'outputs/wiki-prompt-history-preview.png'),fullPage:false});
    const blocks=await page.locator('#promptHistoryDetail .prompt-history-step > pre').allTextContents();assert.deepEqual(blocks,['baseline','current'].flatMap(side=>steps.map(step=>expected[side][step])));
    const after=await page.evaluate(()=>({files:localStorage.getItem(FILE_WORKSPACE_KEY),previews:JSON.stringify(state.previews),topics:JSON.stringify(state.previewTopics),workbook:JSON.stringify(savedWorkbook),status:wikiPromptHistory.getController().status()}));
    for(const key of ['files','previews','topics','workbook'])assert.equal(after[key],initial[key],key+' 不得因读历史改变');
    assert.equal(after.status.dirty,false);assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);assert.ok(historyResponses.length>=2&&historyResponses.every(r=>r.status===200));
    assert.ok(requests.filter(r=>r.path.startsWith('/.cloud/database/rest/')).every(r=>r.method==='GET'));
    const report={applicationId:validation.applicationId,verifiedAt:new Date().toISOString(),browserOriginMatchesOriginal:true,realSDK:true,historyMocked:false,session:null,record:row,allFieldsMatch:true,snapshotSha256:hash(canonical(row.snapshot)),latestGetVerified:true,controllerAutoLoaded:true,historyDetailTenStringsMatch:true,knowledgeAndLocalWorkbookUnchanged:true,historyResponses,blocked,modelCalls:0,mocked,requests,pageErrors:errors,sourceHashesAfter:Object.fromEntries(Object.keys(validation.sourceHashes).map(file=>[file,hash(fs.readFileSync(path.join(source,file)))]))};
    assert.equal(report.snapshotSha256,validation.snapshotSha256);
    report.sourceFilesUnchanged=Object.entries(validation.sourceHashes).every(([file,digest])=>report.sourceHashesAfter[file]===digest);
    report.online=online;report.resourceMatches=resourceMatches;report.weakButtonRemoved=true;
    if(online)assert.deepEqual(Object.keys(resourceMatches).sort(),['index.html','semantic-tags.js','pipeline.js','file-manager.js','prompt-history.js'].sort());
    fs.writeFileSync(path.join(root,online?'outputs/wiki-prompt-history-online-verification.json':'outputs/wiki-prompt-history-final-browser-readback.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({revision:row.revision,parent_revision:row.parent_revision,request_id:row.request_id,action:row.action,editor_label:row.editor_label,note:row.note,created_at:row.created_at,restored_from:row.restored_from,changed_steps:row.changed_steps,snapshotSha256:report.snapshotSha256,allFieldsMatch:true,session:null,historyMocked:false,historyResponses,blocked,modelCalls:0,knowledgeAndLocalWorkbookUnchanged:true,sourceFilesUnchanged:report.sourceFilesUnchanged,online,resourceMatches,weakButtonRemoved:true,pageErrors:errors},null,2));
  }finally{await context.close();await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
