'use strict';
// 真实文件冒烟：用 Chrome 生成带内嵌图的 PDF，并手工构造带内嵌图的 DOCX，
// 走通 extractPdfImages / extractDocxImages → 本地图片库 → 缩略图 的完整链路。
const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs=require('fs'),assert=require('assert');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
const moduleSource=fs.readFileSync(root+'/wiki-demo-mvp/entity-images.js','utf8');

function zipStore(entries){
  const chunks=[],central=[];let offset=0;
  const crcTable=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
  const crc32=buf=>{let c=0xFFFFFFFF;for(const b of buf)c=crcTable[(c^b)&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0};
  for(const entry of entries){
    const name=entry[0],data=entry[1];
    const nameBuf=Buffer.from(name,'utf8'),crc=crc32(data);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0,6);local.writeUInt16LE(0,8);
    local.writeUInt16LE(0,10);local.writeUInt16LE(0,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);
    local.writeUInt16LE(nameBuf.length,26);local.writeUInt16LE(0,28);
    chunks.push(local,nameBuf,data);
    const cd=Buffer.alloc(46);cd.writeUInt32LE(0x02014b50,0);cd.writeUInt16LE(20,4);cd.writeUInt16LE(20,6);cd.writeUInt16LE(0,8);cd.writeUInt16LE(0,10);
    cd.writeUInt16LE(0,12);cd.writeUInt16LE(0,14);cd.writeUInt32LE(crc,16);cd.writeUInt32LE(data.length,20);cd.writeUInt32LE(data.length,24);
    cd.writeUInt16LE(nameBuf.length,28);cd.writeUInt16LE(0,30);cd.writeUInt16LE(0,32);cd.writeUInt16LE(0,34);cd.writeUInt16LE(0,36);cd.writeUInt32LE(0,38);cd.writeUInt32LE(offset,42);
    central.push(cd,nameBuf);
    offset+=local.length+nameBuf.length+data.length;
  }
  const before=Buffer.concat(chunks),cdBuf=Buffer.concat(central);
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(0,4);end.writeUInt16LE(0,6);
  end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(cdBuf.length,12);end.writeUInt32LE(offset,16);end.writeUInt16LE(0,20);
  return Buffer.concat([before,cdBuf,end]);
}

(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:900,height:700}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const pngBase64=await page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=200;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#12406b';ctx.fillRect(0,0,320,200);
   ctx.fillStyle='#ffd166';ctx.font='bold 34px sans-serif';ctx.fillText('原石',40,110);
   return canvas.toDataURL('image/png').split(',')[1];
 });
 const png=Buffer.from(pngBase64,'base64');
 const pdfPage=await browser.newPage();
 await pdfPage.setContent('<body style="margin:0"><h1>原石</h1><p>原石是原神中的抽卡货币，用于祈愿。</p><img src="data:image/png;base64,'+pngBase64+'" style="width:320px;height:200px"></body>');
 const pdf=await pdfPage.pdf({width:'600px',height:'800px',printBackground:true});
 await pdfPage.close();
 fs.writeFileSync(root+'/outputs/wiki-image-smoke-source.pdf',pdf);

 const documentXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'+
  '<w:body><w:p><w:r><w:t>风起地</w:t></w:r></w:p><w:p><w:r><w:t>风起地是蒙德的区域，有一棵巨大的树。</w:t></w:r></w:p>'+
  '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="3048000" cy="1905000"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId5"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'+
  '<w:p><w:r><w:t>图：风起地的大树</w:t></w:r></w:p></w:body></w:document>';
 const docx=zipStore([
  ['[Content_Types].xml',Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')],
  ['_rels/.rels',Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')],
  ['word/document.xml',Buffer.from(documentXml)],
  ['word/_rels/document.xml.rels',Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>')],
  ['word/media/image1.png',png]
 ]);
 fs.writeFileSync(root+'/outputs/wiki-image-smoke-source.docx',docx);

 await page.route('https://smoke.local/**',r=>{
   const p=new URL(r.request().url()).pathname;
   if(p==='/entity-images.js')return r.fulfill({contentType:'application/javascript',body:moduleSource});
   return r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"></head><body><div id="toast"></div><div class="modal" id="imageModal"><b id="imageModalTitle"></b><img id="imageModalImg"><p id="imageModalMeta"></p></div></body></html>'});
 });
 await page.goto('https://smoke.local/');
 await page.addScriptTag({url:'https://smoke.local/entity-images.js'});
 await page.evaluate(()=>{window.loadBrowserParser=(name,url)=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=()=>window[name]?resolve(window[name]):reject(new Error('解析器未初始化'));s.onerror=()=>reject(new Error('无法加载解析器'));document.head.appendChild(s)})});
 const probe=await page.evaluate(async()=>{
   try{const p=await loadBrowserParser('pdfjsLib','https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js');return {pdfjs:!!p,OPS:!!(p&&p.OPS)}}
   catch(e){return {error:String(e&&e.message||e)}}
 });
 console.log('PROBE pdfjs',JSON.stringify(probe));

 const report=await page.evaluate(async(payload)=>{
  const out=[];
  const make=(bytes,name)=>new File([new Uint8Array(bytes)],name);
  const run=async(label,file)=>{
    let error=null,items=[];
    try{items=await window.wikiEntityImages.extractImages(file,24)}
    catch(e){error=String(e&&e.message||e)}
    let records=null;
    if(!error){window.wikiEntityImages.attach({id:'F-'+label,revision:1},file);records=await window.wikiEntityImages.prepareSource({id:'F-'+label,revision:1})}
    out.push({label,extracted:items.length,error,stored:(records||[]).length,
      first:records&&records[0]?{id:records[0].id,page:records[0].page,width:records[0].width,height:records[0].height,mime:records[0].mime,nearText:(records[0].nearText||'').slice(0,60),caption:(records[0].caption||'').slice(0,60),heading:(records[0].heading||'').slice(0,40)}:null});
    return records;
  };
  const pdfRecords=await run('pdf',make(payload.pdf,'smoke.pdf'));
  const docxRecords=await run('docx',make(payload.docx,'smoke.docx'));
  let reread=null;
  if(pdfRecords&&pdfRecords[0]){
    const url=await window.wikiEntityImages.thumbUrl(pdfRecords[0].id);
    reread={thumb:!!url,prefix:url?url.slice(0,5):null};
  }
  return {out,reread};
 },{pdf:Array.from(pdf),docx:Array.from(docx)});

 console.log(JSON.stringify(report,null,2));
 assert.deepStrictEqual(errors,[],'页面错误：'+errors.join(' | '));
 assert.ok(report.out[0].stored>=1,'PDF 未抽出图片：'+JSON.stringify(report.out[0]));
 assert.ok(report.out[1].stored>=1,'DOCX 未抽出图片：'+JSON.stringify(report.out[1]));
 assert.ok(report.reread&&report.reread.thumb,'缩略图回读失败');
 fs.writeFileSync(root+'/outputs/wiki-entity-images-smoke.json',JSON.stringify(report,null,2));
 console.log('SMOKE OK');
}finally{await browser.close()}})().catch(error=>{console.error('FAILED:',error.message);process.exit(1)});
