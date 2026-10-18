'use strict';
// 提示词与程序契约对齐的四项回归：
// 1. STEP 5 的语义分面门禁只能注入一次（默认值与云端快照末尾已含该段，旧代码每段请求都重复发送）。
// 2. STEP 4 不再让模型输出 reuse_existing/create_new；decision 只有 review 会被程序采纳，且有 schema 落点。
// 3. 整合提示词说明 scope_equivalent / boundary_basis / existing_topic_id 的用法，且不含题材特有范例。
// 4. STEP 5 让模型放进 review 的 candidate_relation 必须被解析进诊断，不能静默丢弃。
const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
const html=fs.readFileSync(root+'/wiki-demo-mvp/index.html','utf8');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.abort('blockedbyclient'));await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
 await page.route('https://wiki-mvp-lab.app-tencent.workbuddy.host/**',r=>{const path=new URL(r.request().url()).pathname;if(r.request().method()!=='GET')return r.abort('blockedbyclient');if(path.startsWith('/.cloud/'))return r.fulfill({contentType:'application/json',body:'{"data":[]}'});if(path==='/prompt-history.js')return r.fulfill({contentType:'application/javascript',body:''});if(path==='/semantic-tags.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/semantic-tags.js','utf8')});if(path==='/file-manager.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/file-manager.js','utf8')});if(path==='/pipeline.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/pipeline.js','utf8')});return r.fulfill({contentType:'text/html',body:html.replace('<script>wikiPromptHistory.init();init();</script>','<script>initCloud=async()=>{};init();</script>')})});
 await page.goto('https://wiki-mvp-lab.app-tencent.workbuddy.host/');
 const report=await page.evaluate(()=>{
  const tests=[],ok=(test,pass,details)=>{tests.push({test,pass:!!pass,details});if(!pass)throw new Error(test+' '+JSON.stringify(details))};
  const workbook={sheets:[{rows:[[],[],[],['ID','group','label','def','inc','bound','assign','status'],['ET1','content','角色','角色','','','','active'],['ET2','content','武器','武器','','','','active']]},{rows:[[],[],[],[]]},{rows:[[],[],[],[]]}]};
  workbook.sheets.push(defaultRelationSheet());savedWorkbook=workbook;draftWorkbook=structuredClone(workbook);workbookReady=true;workbookRowId=1;workbookRevision=3;
  const source='杰洛特是猎魔人。银剑是武器。杰洛特使用银剑。';
  const part={index:1,text:source,start:0,end:source.length};
  const anchors={ontology_type:'角色',reality_domain:'虚构',product_ip_scope:'巫师3'};
  const snapshot={revision:3,workbook};
  const context={documentContext:{},historySnapshot:{topics:[],entities:[]},part,segmentIndex:1,segmentCount:1};

  // 1. 门禁只注入一次
  const gate='不可覆盖的主类型与语义分面门禁';
  const input=buildEntityStageInput(DEFAULT_PROMPTS,source,snapshot,context,[]);
  const hits=input.split(gate).length-1;
  ok('STEP5分面门禁只注入一次',hits===1,{hits});
  const legacy=buildEntityStageInput({...DEFAULT_PROMPTS,step5:'用户自定义STEP5'},source,snapshot,context,[]);
  ok('自定义STEP5缺失时仍补齐门禁',legacy.split(gate).length-1===1,{hits:legacy.split(gate).length-1});
  // 第一道门：产品/版本分面必须告诉模型挑哪一句，否则攻略正文里永远填不出产品。
  ok('分面门禁说明挑哪一句',SEMANTIC_STEP5_RULES.includes('优先在本段选用同时指名该实体')&&SEMANTIC_STEP5_RULES.includes('并把这句同时作为该实体的证据与分面的quote'),SEMANTIC_STEP5_RULES.slice(0,60));
  ok('schema同步给出分面quote口径',input.includes('可与实体证据同一句'));
  ok('仍禁止只凭标题背景填产品',/只有文档标题、文档背景或全局版本.*不得填/.test(SEMANTIC_STEP5_RULES));
  const oldStep5=PRIOR_CURRENT_STEP5_DEFAULT+PREVIOUS_SEMANTIC_STEP5_RULES;
  ok('旧分面门禁按逐字一致升级',(()=>{const target={step5:oldStep5};wikiUpgradePromptDefaults(target,'新版');return target.step5===DEFAULT_PROMPTS.step5})());
  const migrated=buildEntityStageInput({...DEFAULT_PROMPTS,step5:oldStep5},source,snapshot,context,[]);
  ok('旧门禁在请求中被替换而非新旧并存',migrated.split(gate).length-1===1&&!migrated.includes('不能把文档标题、背景或版本无条件继承给所有实体'),{gate:migrated.split(gate).length-1});

  // 2. STEP 4 契约
  ok('STEP4不再要求模型做三值决策',!/只允许\s*reuse_existing/.test(DEFAULT_PROMPTS.step4)&&DEFAULT_PROMPTS.step4.includes('不要输出 reuse_existing/create_new'),DEFAULT_PROMPTS.step4.slice(0,80));
  ok('STEP4说明decision落点',DEFAULT_PROMPTS.step4.includes('decision:"review"'));
  ok('实体schema含decision字段',/"decision":"create_new或review/.test(input));
  ok('旧STEP4按逐字一致升级',(()=>{const target={step4:'你是 Entity 身份归一与同名消歧判定器。先区分来源中的 Mention 与知识库中的稳定 Entity，只允许 reuse_existing、create_new、review。\n名称和别名索引是一对多的；同名、向量相似或共同出现都不能单独授权合并。必须比较本体类型、现实或虚构世界、产品/IP 范围、关键属性、版本和关系邻域。\n若身份锚点冲突，应创建新的同名 Entity 候选；若上下文不足，应进入 review。实体出现在多个话题时引用同一 ID，不复制实体；人工锁定字段不得覆盖。'};wikiUpgradePromptDefaults(target,'基线');return target.step4===DEFAULT_PROMPTS.step4})());
  ok('自定义STEP4不被升级',(()=>{const custom='我的自定义归一规则';const target={step4:custom};wikiUpgradePromptDefaults(target,'基线');return target.step4===custom})());

  // 3. 整合提示词
  ok('整合提示词领域无关',!/王者荣耀|巫师3|射程与命中反馈|法印/.test(DEFAULT_PROMPTS.integration));
  ok('整合提示词给出归并字段用法',['scope_equivalent','boundary_basis','existing_topic_id'].every(k=>DEFAULT_PROMPTS.integration.includes(k)));
  ok('旧整合提示词按逐字一致升级',(()=>{const target={integration:PREVIOUS_CURRENT_INTEGRATION_DEFAULT};wikiUpgradePromptDefaults(target,'新版');return target.integration===DEFAULT_PROMPTS.integration})());
  ok('自定义整合提示词不被升级',(()=>{const custom='我的整合规则';const target={integration:custom};wikiUpgradePromptDefaults(target,'新版');return target.integration===custom})());

  // 4. review 中的候选关系不再静默丢弃
  const raw={topics:[{id:'T1',name:'武器使用',definition:'使用',scope:'使用',object_anchor:'巫师3',core_question:'使用',includes:['使用'],excludes:[],quote:'杰洛特使用银剑。'}],
   entities:[
    {id:'M1',name:'杰洛特',definition:'猎魔人',quote:'杰洛特是猎魔人。',anchors,topic_ids:['T1'],primary_topic_id:'T1',type:'角色',relations:[]},
    {id:'M2',name:'银剑',definition:'武器',quote:'银剑是武器。',anchors:{...anchors,ontology_type:'武器'},topic_ids:['T1'],primary_topic_id:'T1',type:'武器',relations:[]}],
   review:[{name:'杰洛特',field:'relation',reason:'词表无对应关系',candidate_relation:{predicate:'师从',target:'M2',quote:'杰洛特使用银剑。'}}]};
  const candidates=validateChunkCandidates(raw,part,source);
  const harvested=candidates.discardedRelations.filter(r=>r.reason&&r.reason.includes('未命中受控关系词表'));
  ok('review中的候选关系进入诊断',harvested.length===1&&harvested[0].candidate_relation.predicate==='师从',candidates.discardedRelations.map(r=>r.reason));
  ok('候选关系仍不进入正式关系索引',candidates.entities.every(e=>!e.relations.length));
  ok('无candidate_relation的review不误增诊断',validateChunkCandidates({...raw,review:[{name:'杰洛特',reason:'证据不足'}]},part,source).discardedRelations.length===0);
  return tests;
 });
 assert(!errors.length,errors.join('\n'));
 const output={kind:'mock-browser-regression-not-real-model',passed:report.filter(t=>t.pass).length,failed:report.filter(t=>!t.pass).length,total:report.length,tests:report,pageErrors:errors,modelAttempts:0};
 fs.writeFileSync(root+'/outputs/wiki-prompt-contract-alignment-tests.json',JSON.stringify(output,null,2));
 console.log('scenarios '+output.total+' passed '+output.passed+' failed '+output.failed);
 for(const t of report)if(!t.pass)console.error('FAILED '+t.test+' '+JSON.stringify(t.details));
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
