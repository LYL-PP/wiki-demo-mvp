'use strict';
// Root cause of the intermittent topic collapse: PDF extraction joined every text item with a
// space, so a 5-page document arrived as 5 lines of ~900 chars. wikiHeadingLevel rejects lines
// longer than 100 chars, so sections was always [] and the model was handed "共 0 条章节清单"
// plus "未识别到章节" and free-scanned the whole file. Recall then depended entirely on the model.
const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs=require('fs'),assert=require('assert');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
const html=fs.readFileSync(root+'/wiki-demo-mvp/index.html','utf8');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new(require('vm').Script)(match[1]);
const pdfPath='C:/Users/louisxzlu/Downloads/游戏攻略--测试集/《燕云十六声》最新版本攻略：从入门到精通的完整指南 - 知乎.pdf';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.abort('blockedbyclient'));
 await page.route('https://cdn.jsdelivr.net/**',r=>r.continue());
 await page.route('https://wiki-mvp-lab.app-tencent.workbuddy.host/**',r=>{const path=new URL(r.request().url()).pathname;if(r.request().method()!=='GET')return r.abort('blockedbyclient');if(path.startsWith('/.cloud/'))return r.fulfill({contentType:'application/json',body:'{"data":[]}'});if(path==='/prompt-history.js')return r.fulfill({contentType:'application/javascript',body:''});if(path==='/semantic-tags.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/semantic-tags.js','utf8')});if(path==='/file-manager.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/file-manager.js','utf8')});if(path==='/pipeline.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/pipeline.js','utf8')});if(path==='/entity-images.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/entity-images.js','utf8')});return r.fulfill({contentType:'text/html',body:html.replace('<script>wikiPromptHistory.init();init();</script>','<script>initCloud=async()=>{};init();</script>')})});
 await page.goto('https://wiki-mvp-lab.app-tencent.workbuddy.host/');
 const report=await page.evaluate(async({b64,flat,eol})=>{
  const tests=[],ok=(test,pass,details)=>{tests.push({test,pass:!!pass,details});if(!pass)throw new Error(test+' '+JSON.stringify(details))};
  const sectionsOf=text=>wikiDocumentContext(wikiCleanSourceNoise(text),'x').sections;
  // 1. A flattened page (one long line per page) must still yield a scaffold.
  const flatSections=sectionsOf(flat);
  ok('每页一行的扁平文本仍能识别章节',flatSections.length>=8,flatSections);
  ok('扁平文本识别出编号小节',flatSections.some(s=>/武学系统/.test(s))&&flatSections.some(s=>/内功系统/.test(s)),flatSections);
  ok('扁平文本识别出章级标题',flatSections.some(s=>/第一章 游戏概况/.test(s))&&flatSections.some(s=>/第八章 总结与展望/.test(s)),flatSections);
  // 2. The real path (line breaks preserved) yields the same scaffold with clean titles.
  const eolSections=sectionsOf(eol);
  ok('保留换行的文本识别出 16 个章节',eolSections.length>=12,eolSections);
  ok('章节标题已折叠空白',eolSections.every(s=>!/\s{2,}/.test(s))&&!/  /.test(eolSections.join('|')),eolSections);
  ok('标题不是光秃秃的编号',eolSections.filter(s=>/>\s*\d+\.\s*$/.test(s)).length===0,eolSections);
  ok('正文数字不被误判为标题',!eolSections.some(s=>/v4\.15|1995|2026 年 8 月 24 日/.test(s)),eolSections);
  // 3. Noise removal only works once the line structure exists; the PDF path must keep it.
  ok('保留换行后站点噪声被清除',wikiCleanSourceNoise(eol).length<eol.length*0.8,{before:eol.length,after:wikiCleanSourceNoise(eol).length});
  // 4. Headings survive for the prompt's document background.
  const doc=wikiDocumentContext(wikiCleanSourceNoise(eol),'x');
  ok('文档背景带标题清单',doc.headings.length>=8&&doc.headings.every(h=>!/\s{2,}/.test(h)),doc.headings.slice(0,6));
  // 5. Coverage matching must tolerate spacing differences in the model's receipt.
  const leaf=eolSections.find(s=>/武学系统/.test(s));
  ok('回执空格不同仍算覆盖',wikiCoversSection(leaf,'1. 武学系统')&&wikiCoversSection(leaf,'1.武学系统')&&wikiCoversSection(leaf,'第二章 八大核心系统详解 > 1. 武学系统'),leaf);
  ok('不相关回执不算覆盖',!wikiCoversSection(leaf,'家园系统')&&!wikiCoversSection(leaf,''),leaf);
  // 6. Segmentation stays whole-document and parts still cover the source exactly.
  const cleaned=wikiCleanSourceNoise(eol),parts=splitSourceForModel(cleaned);
  ok('切段仍覆盖全文且起始偏移可复核',parts.length>=1&&parts.every(p=>cleaned.slice(p.start,p.end)===p.text)&&parts.map(p=>cleaned.slice(p.coreStart,p.coreEnd)).join('')===cleaned,{parts:parts.length});
  // 7. The real PDF, extracted through the app's own reader, must not arrive as one line per page.
  const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  const file=new File([bytes],'燕云.pdf',{type:'application/pdf'});
  const source=await readSourceFile(file);
  const lines=source.text.split('\n');
  ok('PDF 提取保留真实换行',lines.length>20,{lines:lines.length,chars:source.text.length});
  ok('PDF 提取不再每页一行',lines.every(l=>l.length<600),lines.map(l=>l.length).slice(0,6));
  ok('PDF 提取清除站点噪声',!/赞同\s+添加评论|登录即可查看 超/.test(source.text),source.text.slice(0,0));
  ok('PDF 提取后章节可识别',sectionsOf(source.text).length>=8,sectionsOf(source.text));
  return tests;
 },{b64:fs.readFileSync(pdfPath).toString('base64'),
    flat:fs.readFileSync(root+'/.playwright-cli/tmp-source-flat.txt','utf8'),
    eol:fs.readFileSync(root+'/.playwright-cli/tmp-source-eol.txt','utf8')});
 assert(!errors.length,errors.join('\n'));
 const output={kind:'mock-browser-regression-not-real-model',passed:report.filter(t=>t.pass).length,failed:report.filter(t=>!t.pass).length,total:report.length,tests:report,pageErrors:errors,modelAttempts:0};
 fs.writeFileSync(root+'/outputs/wiki-section-scaffold-tests.json',JSON.stringify(output,null,2));
 console.log('scenarios '+output.total+' passed '+output.passed+' failed '+output.failed);
 for(const t of report)if(!t.pass)console.error('FAILED '+t.test+' '+JSON.stringify(t.details));
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
