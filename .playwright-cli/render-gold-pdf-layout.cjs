const fs=require('fs'),path=require('path'),http=require('http'),crypto=require('crypto');
const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const ROOT='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25',OUT=path.join(ROOT,'outputs');
const registerPath=path.join(OUT,'wiki-gold-source-register.json');
const reg=JSON.parse(fs.readFileSync(registerPath,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
(async()=>{let browser,server;try{
server=http.createServer((req,res)=>{
 const hit=reg.samples.find(r=>req.url==='/'+r.sample_id+'.pdf');
 if(hit){res.writeHead(200,{'Content-Type':'application/pdf'});fs.createReadStream(hit.input_path).pipe(res);return;}
 if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><html><head><style>html,body{margin:0;background:white}canvas{display:block}</style></head><body><canvas id="pdf"></canvas></body></html>');return;}
 res.writeHead(404);res.end();
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
const origin='http://127.0.0.1:'+server.address().port;
browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1400,height:2000},deviceScaleFactor:1});
const page=await context.newPage();await page.goto(origin);
await page.addScriptTag({url:'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'});
await page.evaluate(()=>{pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';});
const parserRows=[];
for(const row of reg.samples){
 await page.evaluate(async sid=>{window.currentPdf=await pdfjsLib.getDocument({url:'/'+sid+'.pdf'}).promise;},row.sample_id);
 const parsed=await page.evaluate(async()=>{const pages=[];for(let n=1;n<=currentPdf.numPages;n++){const p=await currentPdf.getPage(n),c=await p.getTextContent(),ops=await p.getOperatorList();const names=['paintImageXObject','paintInlineImageXObject','paintImageMaskXObject','paintImageXObjectRepeat','paintImageMaskXObjectRepeat'];const codes=names.map(k=>pdfjsLib.OPS[k]);pages.push({page:n,text:c.items.map(i=>i.str||'').join(' '),imagePaintOps:ops.fnArray.filter(v=>codes.includes(v)).length});}return pages;});
 parserRows.push({sample_id:row.sample_id,pages:parsed,role:'same PDF.js 3.11.174 and item join method as wiki, standalone read only; not a previous model-run snapshot'});
 row.pdfjs_text_chars=parsed.map(p=>p.text).join('\n').length;
 row.image_paint_ops_total=parsed.reduce((n,p)=>n+p.imagePaintOps,0);
 for(const p of row.pages){p.image_paint_ops=parsed[p.page-1].imagePaintOps;}
 fs.writeFileSync(path.join(OUT,'wiki-gold-pdfjs-'+row.sample_id+'.txt'),parsed.map(p=>'=== PDF第'+p.page+'页 ===\n'+p.text).join('\n\n'));
 const renderPages=row.sample_id==='D01'?[1,2,3,4,5]:row.sample_id==='D02'?[1,2]:[5,15];
 for(const n of renderPages){const size=await page.evaluate(async n=>{const p=await currentPdf.getPage(n),v=p.getViewport({scale:1.25}),c=document.getElementById('pdf');c.width=Math.ceil(v.width);c.height=Math.ceil(v.height);await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise;return {width:c.width,height:c.height};},n);
 await page.setViewportSize({width:Math.max(390,size.width),height:Math.max(500,size.height)});
 const dest=path.join(OUT,'wiki-gold-layout-'+row.sample_id+'-p'+n+'.png');await page.locator('canvas').screenshot({path:dest});row.pages[n-1].layout_image_path=dest;
 }
 row.source_unchanged=hash(row.input_path)===row.sha256;if(!row.source_unchanged)throw Error('Source changed');
 await page.evaluate(async()=>{await currentPdf.destroy();});
}
fs.writeFileSync(registerPath,JSON.stringify(reg,null,2));fs.writeFileSync(path.join(OUT,'wiki-gold-pdfjs-inputs.json'),JSON.stringify({model_calls:0,samples:parserRows},null,2));
console.log(JSON.stringify(reg.samples.map(r=>({sample:r.sample_id,pages:r.pages_count,pdfjs_chars:r.pdfjs_text_chars,image_paint_ops:r.image_paint_ops_total,image_pages:r.pages.filter(p=>p.image_paint_ops).map(p=>p.page),source_unchanged:r.source_unchanged})),null,2));
}finally{if(browser)await browser.close();if(server)await new Promise(ok=>server.close(ok));}})().catch(e=>{console.error(e);process.exitCode=1;});
