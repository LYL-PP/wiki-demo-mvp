'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25',APP=path.join(ROOT,'wiki-demo-mvp'),ORIGIN='http://127.0.0.1:19438';
const modules=['index.html','semantic-tags.js','pipeline.js','file-manager.js','prompt-history.js'];
const source=Object.fromEntries(modules.map(n=>[n,fs.readFileSync(path.join(APP,n),'utf8')]));
const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
function initCode(){
  const old=fs.readFileSync(path.join(ROOT,'.playwright-cli/test-run-timing.cjs'),'utf8'),start=old.indexOf('function installMock(){'),end=old.indexOf('\nlet browser,shotPage;',start);
  let code=old.slice(start,end).trim();
  const needle="'active','玩家角色']]},";
  const rows=[['ET-PROD-GAME','产品','游戏产品','具名游戏作品','人工游戏','非技能','按身份','active','交互游戏作品'],['ET-CONTENT-SKILL','玩法','技能','具名能力','人工技能','非游戏产品','按具体身份','active','具名能力']];
  code=code.replace(needle,"'active','玩家角色'],"+rows.map(r=>JSON.stringify(r)).join(',')+']},');return code+'\ninstallMock();';
}
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({acceptDownloads:true});
  await context.addInitScript({content:initCode()});
  const asset=source['index.html'].match(/const\s+WORKBOOK_ASSET\s*=\s*['"]([^'"]+)['"]/)[1];const assetPath=new URL(asset,ORIGIN).pathname;
  await context.route('**/*',r=>{const req=r.request(),u=new URL(req.url());if(req.method()==='GET'&&u.origin===ORIGIN){const n=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname.slice(1));if(Object.hasOwn(source,n))return r.fulfill({contentType:n.endsWith('.html')?'text/html':'application/javascript',body:source[n]});if(u.pathname===assetPath)return r.fulfill({body:Buffer.from('mock-workbook')});if(u.pathname==='/favicon.ico')return r.fulfill({status:204});}if(req.method()==='GET'&&req.resourceType()==='script'){if(u.pathname.endsWith('/xlsx.full.min.js'))return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(ROOT,'.playwright-cli/xlsx-0.18.5-export-test.min.js'))});return r.fulfill({contentType:'application/javascript',body:''});}return r.abort('blockedbyclient');});
  const page=await context.newPage();page.on('pageerror',e=>console.log('PAGEERROR',e.message));page.on('console',m=>console.log('CONSOLE',m.type(),m.text()));
  await page.goto(ORIGIN,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>workbookReady&&!cloudLoading&&fileManagerReady&&wikiPromptHistory.getController().status().ready);
  const probe=await page.evaluate(async()=>{
    const out={};
    try{
      state.source={id:'F',revision:1,name:'人工.pdf',text:'人工来源正文：用于导出测试的人工文本。'};
      const topic={id:'T1',name:'人工话题',definition:'d',scope:'s',object_anchor:'人工游戏',core_question:'q',includes:['i'],excludes:['e'],evidences:[{exact_quote:'人工证据1',start:0,end:5}]};
      const accepted=[{mention_local_id:'M1',name:'人工实体',definition:'dd',aliases:['a'],evidences:[{exact_quote:'人工证据1',start:0,end:5}],topic_ids:['T1'],primary_topic_id:'T1'}];
      const norm=[{mention_local_id:'M1',candidate:'人工实体',decision:'create_new',disambiguation_label:'x',reason:'r',identity_anchors:{ontology_type:'技能',reality_domain:'游戏虚构',product_ip_scope:'人工游戏',version:'v1',identity_attributes:{}}}];
      const marks=[{mention_local_id:'M1',candidate:'人工实体',primary_topic_id:'T1',associated_topic_ids:[],tags:{entity_type:'技能',entity_type_id:'ET-CONTENT-SKILL',facets:['产品:人工游戏'],candidate_tags:['c'],semantic_facets:[{dimension:'product',value:'人工游戏',basis:'explicit',reason:'r',evidences:[{exact_quote:'人工证据1',start:0,end:5}]},{dimension:'discipline',value:'策划',basis:'inferred',reason:'r',evidences:[{exact_quote:'人工证据1',start:0,end:5}]}]},relations:[]}];
      const base={preview_eligible:true,topics:[topic],source:{file_name:'人工.pdf',file_id:'F',file_revision:1},workbook_revision:3,
        model:{id:'m',name:'mn',elapsed_ms:1000,content_chars:10,stream_chunks:1,segment_count:1,usage:{total_tokens:5}},
        steps:{step1:{blocks:1},step2:{decision:'candidate',candidate_topic:{name:'人工话题'},evidence:{},associated_topic_ids:[]},step3:{accepted,review:[]},step4:{normalization_results:norm},step5:{entity_results:marks},step6:{decision:'ready',hard_failures:[],review_reasons:[],review_items:[]}},
        metrics:{topics:1,entities:1,tags:1,relations:0,reviews:0,hardFails:0},reconciliation:{aligned:0,excludedEntities:[],discardedRelations:[],topicValid:true},
        integration:{topic_candidates:1,entity_candidates:1,topic_merges:0,isolated_topic_count:0,entity_merges:0,review_count:0,complete_candidates:true},
        diagnostics:{candidate_issues:[],isolated_relations:[],isolated_topics:[],coverage:{expected_sections:1,reported:1,missing:[]}}};
      state.baseline=structuredClone(base);
      state.current=structuredClone(base);state.current.comparison={mode:'prompts',branch:'B',model_id:'m',workbook_revision:3,source:{id:'F',name:'人工.pdf',revision:1},prompt_snapshot:comparisonPromptSnapshot(state.prompts)};
      updateCompareExportState();
      out.snapshot=compareExportSnapshot().sheets.map(s=>({name:s.name,rows:s.rows.length}));
      out.facets=JSON.stringify(semanticFacetStorage(marks[0].tags).suggestedFacets);
      const XLSX=await excelParser();out.xlsxType=typeof XLSX;
      const book=compareExportWorkbook(compareExportSnapshot(),XLSX);out.sheets=book.SheetNames;
      const bytes=XLSX.write(book,{bookType:'xlsx',type:'array',compression:true});out.bytes=bytes.byteLength||bytes.length;
      return out;
    }catch(e){out.error=e.message;out.stack=(e.stack||'').split('\n').slice(0,4);return out}
  });
  console.log(JSON.stringify(probe,null,2));
  await browser.close();
})();
