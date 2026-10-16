'use strict';
const {chromium} = require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const url = 'https://wiki-mvp-lab.app-tencent.workbuddy.host/';
const target = Number(process.argv[2] || 6);
(async()=>{
  let browser,context,page;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    context=await browser.newContext({serviceWorkers:'block'});
    await context.route('**/*',route=>{const req=route.request(),p=new URL(req.url()).pathname;
      if(/\/(?:chat\/completions|completions|responses|embeddings|rerank|inference|invoke)(?:\/|$)/i.test(p))return route.abort();
      return route.continue();});
    page=await context.newPage();
    const writes=[];
    page.on('request',r=>{if(['POST','PATCH','PUT','DELETE'].includes(r.method()))writes.push(r.method()+' '+new URL(r.url()).pathname)});
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof cloud!=='undefined'&&cloud&&typeof savedWorkbook!=='undefined'&&savedWorkbook,null,{timeout:60000});
    const out=await page.evaluate(async target=>{
      const versions=[],seen=new Set();let cursor=null;
      while(true){
        let q=cloud.database.from('wiki_prompt_versions').select('*').order('revision',{ascending:false}).limit(100);
        if(cursor!==null)q=q.lt('revision',cursor);
        const r=await q;if(r.error||!Array.isArray(r.data)||!r.data.length)break;
        for(const row of r.data){const rev=String(row.revision);if(!seen.has(rev)){seen.add(rev);versions.push(row)}cursor=row.revision;}
        if(versions.length>=200)break;
      }
      versions.sort((a,b)=>Number(a.revision)-Number(b.revision));
      const pick=versions.find(v=>Number(v.revision)===target);
      const head=versions[versions.length-1];
      const brief=v=>({revision:String(v.revision),changedStep:v.changedStep??v.changed_step??null,note:v.note??null,createdAt:v.createdAt??v.created_at??null,steps:Object.keys(v.snapshot?.current||{})});
      return {targetRevision:String(target),
        found:!!pick,
        targetMeta:pick?brief(pick):null,
        targetStep2:pick?.snapshot?.current?.step2??null,
        headMeta:brief(head),
        headStep2:head?.snapshot?.current?.step2??null,
        revisions:versions.map(v=>String(v.revision))};
    },target);
    console.log(JSON.stringify({...out,writes},null,1));
  }catch(e){console.log(JSON.stringify({error:String(e.message||e)}))}
  finally{if(context)await context.close().catch(()=>{});if(browser)await browser.close().catch(()=>{});}
})();
