'use strict';
// Current-browser workspace; shared vocabulary is intentionally outside this transaction.
const FILE_WORKSPACE_KEY=STORE+'fileWorkspaceV1';
let fileWorkspaceRaw=null,fileWorkspaceBusy=false,fileEditId=null,fileManagerReady=false;
function fileMutationAllowed(){return fileManagerReady&&!isRunning&&!comparisonRunWaiting&&!comparisonHistoryBusy&&!fileReading&&!workbookBusy&&!fileWorkspaceBusy}
function fileContributionIds(item){return arr(item.fileContributions).map(c=>c.fileId)}
function fileSnapshot(item){const copy=structuredClone(item);delete copy.fileContributions;delete copy.typeSourceIssues;return copy}
function commitFileWorkspace(files,topics,entities){
  if(localStorage.getItem(FILE_WORKSPACE_KEY)!==fileWorkspaceRaw)throw new Error('另一标签页已修改文件记录，请刷新页面后再操作；本次未覆盖。');
  const keys=[STORE+'files',STORE+'topics',STORE+'previews',FILE_WORKSPACE_KEY],old=keys.map(k=>localStorage.getItem(k));
  const payload=JSON.stringify({schema:1,revision:crypto.randomUUID(),files,topics,entities});
  try{save(keys[0],files);save(keys[1],topics);save(keys[2],entities);localStorage.setItem(FILE_WORKSPACE_KEY,payload)}catch(error){
    try{keys.forEach((key,i)=>old[i]===null?localStorage.removeItem(key):localStorage.setItem(key,old[i]))}catch(rollback){throw new Error('浏览器保存与回滚失败，请立即导出备份。')}
    throw new Error('浏览器空间不足或保存失败，文件和知识未改变。');
  }
  fileWorkspaceRaw=payload;state.files=files;state.previewTopics=topics;state.previews=entities;
}
function migrateFileWorkspace(){
  const raw=localStorage.getItem(FILE_WORKSPACE_KEY);
  if(raw){const data=JSON.parse(raw);if(data.schema!==1||!Array.isArray(data.files)||!Array.isArray(data.topics)||!Array.isArray(data.entities))throw new Error('文件档案结构无法识别，请先导出备份。');fileWorkspaceRaw=raw;state.files=data.files;state.previewTopics=data.topics;state.previews=data.entities;return}
  const files=[],topics=structuredClone(state.previewTopics),entities=structuredClone(state.previews);
  const getFile=name=>{name=String(name||'历史来源未标明');let f=files.find(f=>f.originalName===name);if(!f){f={id:'F-'+crypto.randomUUID(),name,originalName:name,text:null,size:0,revision:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:'历史记录 · 正文需重新添加',legacy:true};files.push(f)}return f};
  for(const entity of entities){const sources=arr(entity.sources);if(!sources.length)sources.push({file:'历史来源未标明',quote:''});entity.fileContributions=[];
    for(const name of new Set(sources.map(s=>s.file||'历史来源未标明'))){const f=getFile(name),own=sources.filter(s=>(s.file||'历史来源未标明')===name).map(s=>({...s,file:f.name,fileId:f.id,revision:1}));
      const data=fileSnapshot(entity);normalizeStoredEntityTags(data,savedWorkbook);
      data.semanticFacetDetails=data.semanticFacetDetails.filter(detail=>!detail.source||(detail.source.file||detail.source.file_name)===name).map(detail=>({...detail,source:{fileId:f.id,file:f.name,revision:1},...(!detail.source?{basis:'legacy',reason:'历史值来源未归属，旧值未验证'}:{})}));
      data.suggestedFacets=Object.fromEntries(['product','discipline','version'].map(key=>[key,[...new Set(data.semanticFacetDetails.filter(detail=>detail.dimension===key).map(detail=>detail.value))]]));
      data.semanticFacetsRecognized=false;data.sources=own;data.facts=own.map(s=>s.quote).filter(Boolean);data.summary=data.facts.join('；');data.reviewReasons=[...new Set([...arr(data.reviewReasons),'LEGACY_SOURCE_ATTRIBUTION_REVIEW'])];data.relations=arr(data.relations).filter(r=>own.some(s=>s.quote&&s.quote===r.evidence)).map(r=>({...r,fileId:f.id}));entity.fileContributions.push({fileId:f.id,revision:1,legacy:true,data});
    }
  }
  for(const topic of topics){const owners=new Set(entities.filter(e=>e.primaryTopic===topic.id||arr(e.topics).includes(topic.id)).flatMap(fileContributionIds));if(!owners.size)owners.add(getFile('历史话题来源待核对').id);
    topic.fileContributions=[...owners].map(fileId=>({fileId,revision:1,legacy:true,data:{...fileSnapshot(topic),evidences:[]}}));topic.sourceAttributionReview=true;
  }
  const rebuilt=rebuildFileKnowledge(topics,entities);
  commitFileWorkspace(files,rebuilt.topics,rebuilt.entities);
}
function rebuildFileKnowledge(topics,entities,workbook=savedWorkbook){
  topics=topics.filter(t=>!Array.isArray(t.fileContributions)||t.fileContributions.length).map(t=>{if(!Array.isArray(t.fileContributions))return t;const contributions=t.fileContributions,base={...t,...contributions[0].data,id:t.id,fileContributions:contributions};base.evidences=wikiUnique(contributions.flatMap(c=>arr(c.data.evidences)));return base});
  const topicIds=new Set(topics.map(t=>t.id));
  entities=entities.filter(e=>!Array.isArray(e.fileContributions)||e.fileContributions.length).map(e=>{
    if(!Array.isArray(e.fileContributions)){normalizeStoredEntityTags(e,workbook);e.topics=entityTopicIds(e,topicIds);e.primaryTopic=topicIds.has(e.primaryTopic)?e.primaryTopic:e.topics[0]||null;return e}
    const contributions=e.fileContributions;
    for(const c of contributions){
      normalizeStoredEntityTags(c.data,workbook);
      c.data.topics=entityTopicIds(c.data,topicIds);c.data.primaryTopic=topicIds.has(c.data.primaryTopic)?c.data.primaryTopic:c.data.topics[0]||null;
      c.data.semanticFacetDetails=c.data.semanticFacetDetails.map(detail=>({...detail,source:{...(detail.source||{}),fileId:c.fileId,revision:c.revision,file:c.data.sources?.[0]?.file||state.files.find(f=>f.id===c.fileId)?.name||detail.source?.file||detail.source?.file_name||''}}));
    }
    const data=contributions.map(c=>c.data),base={...e,...data[0],id:e.id,fileContributions:contributions};
    base.sources=wikiUnique(data.flatMap(d=>arr(d.sources)));base.summary=[...new Set(data.map(d=>d.summary).filter(Boolean))].join('；');base.facts=[...new Set(data.flatMap(d=>arr(d.facts)))];base.aliases=[...new Set(data.flatMap(d=>arr(d.aliases)))];base.topics=[...new Set(data.flatMap(d=>arr(d.topics)))].filter(id=>topicIds.has(id));base.primaryTopic=topicIds.has(data[0].primaryTopic)?data[0].primaryTopic:base.topics[0]||null;
    base.candidateTags=[...new Set(data.flatMap(d=>arr(d.candidateTags)))];base.reviewReasons=[...new Set(data.flatMap(d=>arr(d.reviewReasons)))];
    const types=[...new Set(data.flatMap(d=>arr(d.tags?.type)))];
    const typeIssues=wikiUnique(contributions.filter(c=>c.data.typeIssue).map(c=>({reason:entityTypeIssueText(c.data),raw:typeof c.data.typeIssue==='object'?c.data.typeIssue.raw:null,source:{fileId:c.fileId,revision:c.revision,file:c.data.sources?.[0]?.file||state.files.find(f=>f.id===c.fileId)?.name||''}})));
    base.typeSourceIssues=typeIssues;
    // 只放行已知缺失协议中的真正空值；嵌套成员冲突和非空整合建议仍阻塞。
    const empty=value=>value==null||typeof value==='string'&&!value.trim()||Array.isArray(value)&&value.every(empty);
    const missingIssue=issue=>{
      if(!/^(模型未选择主类型$|原候选未选择主类型$|主类型缺失[：:])/.test(issue?.reason||''))return false;
      const raw=issue.raw;
      if(raw==null)return true;
      if(typeof raw!=='object'||Array.isArray(raw))return false;
      if(!Object.hasOwn(raw,'members'))return Object.entries(raw).every(([key,value])=>['id','label'].includes(key)&&empty(value));
      return Object.keys(raw).every(key=>['members','integration'].includes(key))&&Array.isArray(raw.members)&&raw.members.every(member=>
        member&&typeof member==='object'&&Object.keys(member).every(key=>['id','type','type_id','type_resolution'].includes(key))&&empty(member.type)&&empty(member.type_id)&&
        (!member.type_resolution||empty(member.type_resolution.id)&&empty(member.type_resolution.label)&&missingIssue(member.type_resolution)))&&
        (raw.integration==null||typeof raw.integration==='object'&&!Array.isArray(raw.integration)&&Object.entries(raw.integration).every(([key,value])=>
          ['type_id','type_reason','type_quote'].includes(key)&&empty(value)));
    };
    const hasTypeConflict=typeIssues.some(issue=>!missingIssue(issue));
    const validType=types.length===1&&!hasTypeConflict;
    base.tags={type:validType?types:[],typeId:validType?data.find(d=>arr(d.tags?.type).includes(types[0]))?.tags.typeId:null};
    if(types.length>1){base.reviewReasons=[...new Set([...base.reviewReasons,'TYPE_TAG_CONFLICT'])];base.typeIssue={reason:'多来源主类型冲突：'+types.join('、')+'；主类型已置空，请复核各来源。',raw:{types:contributions.map(c=>({fileId:c.fileId,revision:c.revision,tags:structuredClone(c.data.tags)})),issues:typeIssues}}}
    else if(!validType&&typeIssues.length)base.typeIssue={reason:[...new Set(typeIssues.map(issue=>issue.reason).filter(Boolean))].join('；')||'来源未选择有效主类型，请复核。',raw:typeIssues};
    else if(!types.length)base.typeIssue={reason:'主类型缺失：各来源均未选择有效的受控主类型。',raw:null};
    else delete base.typeIssue;
    if(validType)base.reviewReasons=base.reviewReasons.filter(reason=>!['LEGACY_TYPE_REVIEW_REQUIRED','ENTITY_TYPE_REVIEW_REQUIRED','TYPE_TAG_CONFLICT'].includes(reason));
    base.suggestedFacets=Object.fromEntries(['product','discipline','version'].map(k=>[k,[...new Set(data.flatMap(d=>arr(d.suggestedFacets?.[k])))]]));
    base.semanticFacetDetails=wikiUnique(data.flatMap(d=>arr(d.semanticFacetDetails)));
    base.semanticFacetsRecognized=data.every(d=>d.semanticFacetsRecognized===true);
    base.images=window.wikiEntityImages?wikiEntityImages.mergeImages(data.map(d=>arr(d.images))):[];
    const relations=new Map();for(const d of data)for(const r of arr(d.relations)){const key=JSON.stringify([r.typeId||r.type,r.targetId,r.strength]);if(relations.has(key)){const prior=relations.get(key);prior.evidences=wikiUnique([...arr(prior.evidences),...arr(r.evidences)]);prior.sources=wikiUnique([...arr(prior.sources),...arr(r.sources)])}else relations.set(key,structuredClone(r))}base.relations=[...relations.values()];return base;
  });
  const entityIds=new Set(entities.map(e=>e.id));for(const e of entities){e.relations=e.relations.filter(r=>!r.targetId||entityIds.has(r.targetId));for(const c of arr(e.fileContributions))c.data.relations=arr(c.data.relations).filter(r=>!r.targetId||entityIds.has(r.targetId))}
  return {topics,entities};
}
function planFileRemoval(id){
  const file=state.files.find(f=>f.id===id);if(!file)throw new Error('文件已不存在。');
  const topics=structuredClone(state.previewTopics),entities=structuredClone(state.previews),affectedTopics=topics.filter(t=>fileContributionIds(t).includes(id)),affectedEntities=entities.filter(e=>fileContributionIds(e).includes(id));
  for(const item of [...topics,...entities])item.fileContributions=arr(item.fileContributions).filter(c=>c.fileId!==id);
  const rebuilt=rebuildFileKnowledge(topics,entities),deletedIds=new Set(entities.filter(e=>!fileContributionIds(e).length).map(e=>e.id));
  return {file,...rebuilt,affectedTopics,affectedEntities,deletedTopics:affectedTopics.filter(t=>fileContributionIds(t).length===0),deletedEntities:affectedEntities.filter(e=>deletedIds.has(e.id)),sharedTopics:affectedTopics.filter(t=>fileContributionIds(t).length>0),sharedEntities:affectedEntities.filter(e=>fileContributionIds(e).length>0)};
}
function fileImpactMessage(plan,verb){return `${verb}「${plan.file.name}」？\n\n删除 ${plan.deletedTopics.length} 个独有话题、${plan.deletedEntities.length} 个独有实体；保留 ${plan.sharedTopics.length} 个共享话题、${plan.sharedEntities.length} 个共享实体，仅撤销本文件贡献及无来源关系。\n受影响话题：${plan.affectedTopics.map(t=>t.name+' ['+t.id+']').join('、')||'无'}\n受影响实体：${plan.affectedEntities.map(e=>e.name+' ['+e.id+']').join('、')||'无'}\n\n撤销后不能恢复原解析结果；不删除电脑上的原始文件，也不改变共享词表。`}
function invalidateFileSession(id){
  wikiCandidateCache.clear();if(state.source?.id===id){state.source=null;resetSourceResults();renderSourceUI()}
  if(state.baseline?.source.file_id===id||state.current?.source.file_id===id)resetSourceResults();
  state.filters.topic=new Set([...state.filters.topic].filter(id=>state.previewTopics.some(t=>t.id===id)));renderKnowledge();renderFiles();
}
function deleteArchiveFile(id,confirmed=false){
  if(!fileMutationAllowed())throw new Error('正在读取文件、词表或运行模型，请完成后再编辑删除。');const plan=planFileRemoval(id);if(!confirmed&&!window.confirm(fileImpactMessage(plan,'删除文件并撤销其知识')))return false;
  commitFileWorkspace(state.files.filter(f=>f.id!==id),plan.topics,plan.entities);invalidateFileSession(id);window.wikiEntityImages?.deleteFileImages(id);toast('文件及其独有知识已删除；共享内容保留其他来源');return true;
}
function updateArchiveFile(id,name,text,size,confirmed=false){
  if(!fileMutationAllowed())throw new Error('正在读取文件、词表或运行模型，请完成后再编辑删除。');name=String(name||'').trim();if(!name||name.length>240)throw new Error('名称需为 1–240 字。');
  const old=state.files.find(f=>f.id===id);if(!old)throw new Error('文件已不存在。');if(text!==null&&(typeof text!=='string'||!text.trim()||text.length>30000||text.includes('\u0000')))throw new Error('正文需为非空文本，不超过 30000 字，不能包含空字符。');
  const changed=text!==old.text,files=structuredClone(state.files),file=files.find(f=>f.id===id);let topics=structuredClone(state.previewTopics),entities=structuredClone(state.previews);
  if(changed){const plan=planFileRemoval(id);if(!confirmed&&!window.confirm(fileImpactMessage(plan,'修改正文并撤销旧版本知识，保存后需重新解析')))return false;topics=plan.topics;entities=plan.entities;file.revision++;file.status='待解析';file.legacy=false;file.lastRun=null;window.wikiEntityImages?.deleteFileImages(id)}
  file.name=name;file.text=text;file.size=size??old.size;file.updatedAt=new Date().toISOString();
  for(const t of topics)for(const c of arr(t.fileContributions).filter(c=>c.fileId===id))c.data.evidences=arr(c.data.evidences).map(q=>({...q,file:name}));
  for(const e of entities)for(const c of arr(e.fileContributions).filter(c=>c.fileId===id)){
    c.data.sources=arr(c.data.sources).map(s=>({...s,file:name}));
    c.data.semanticFacetDetails=arr(c.data.semanticFacetDetails).map(detail=>({...detail,source:{...(detail.source||{}),fileId:id,file:name,revision:c.revision},evidences:arr(detail.evidences).map(q=>({...q,file:name}))}));
    if(c.data.typeIssue&&typeof c.data.typeIssue==='object')c.data.typeIssue.source={fileId:id,file:name,revision:c.revision};
    for(const r of arr(c.data.relations))r.sources=arr(r.sources).map(s=>({...s,file:name}));
  }
  const rebuilt=rebuildFileKnowledge(topics,entities);commitFileWorkspace(files,rebuilt.topics,rebuilt.entities);
  const selected=state.source?.id===id;if(changed)invalidateFileSession(id);else{for(const r of [state.baseline,state.current])if(r?.source.file_id===id)r.source.file_name=name;renderKnowledge();renderFiles()}
  if(selected){state.source=structuredClone(file);renderSourceUI()}wikiCandidateCache.clear();return true;
}
function registerArchiveSource(source){
  let file=state.files.find(f=>f.originalName===source.name&&f.text===source.text);
  if(!file){file={...source,id:'F-'+crypto.randomUUID(),originalName:source.name,revision:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:'待解析'};commitFileWorkspace([...state.files,file],state.previewTopics,state.previews)}
  return structuredClone(file);
}
function prepareSourceImages(source,file){
  const images=window.wikiEntityImages;if(!images||!source?.id)return;
  images.attach(source,file);
  images.prepareSource(source).then(records=>{if(records&&records.length)renderFiles()}).catch(()=>{});
}
async function handleSourceFile(file){
  if(!fileMutationAllowed()||!file)return;const oldSource=state.source,revision=++fileRevision;fileReading=true;renderFiles();updateRunReadiness();setSourceStatus('正在读取并提取 '+file.name+' …');
  try{const source=await readSourceFile(file);if(revision!==fileRevision)return;state.source=registerArchiveSource(source);resetSourceResults();setPage('lab');renderSourceUI();prepareSourceImages(state.source,file)}
  catch(error){state.source=oldSource;setSourceStatus(error.message||'文件读取失败；旧文件仍保留。',true);toast(error.message||'文件保存失败')}
  finally{if(revision===fileRevision){fileReading=false;renderFiles();renderSourceUI()}}
}
function selectArchiveFile(id){if(!fileMutationAllowed())return toast('请先完成当前运行或读取');const f=state.files.find(f=>f.id===id);if(!f?.text)return toast('历史记录未保存正文，请点击编辑并重新添加正文');state.source=structuredClone(f);resetSourceResults();renderSourceUI();setPage('lab');renderFiles()}
function stageWikiFileResult(result,newTopics,newEntities,topicMap,entityMap){
  const id=result.source.file_id;if(!id)return false;const file=state.files.find(f=>f.id===id);if(!file||file.revision!==result.source.file_revision)throw new Error('源文件已删除或版本变化，本轮结果未写入。');
  // 来源贡献只使用当前 Mention 的身份锚点；兼容的同来源证据在提交前聚合。
  const {step3,step4,step5,step6}=result.steps;
  const storedTopicIds=new Set(newTopics.map(t=>t.id)),mappedTopicIds=new Set(result.topics.map(t=>topicMap.get(t.id)));
  if(result.topics.some(t=>!topicMap.get(t.id)||!storedTopicIds.has(topicMap.get(t.id))))throw new Error('来源贡献话题映射或目标话题不存在，未写入。');
  for(const m of step3.accepted){const primary=topicMap.get(m.primary_topic_id),ids=arr(m.topic_ids).map(t=>topicMap.get(t));if(!primary||!ids.includes(primary)||ids.some(t=>!t||!mappedTopicIds.has(t)))throw new Error('来源贡献话题引用不完整或主话题未包含在关联列表。');}
  for(const topic of newTopics)if(fileContributionIds(topic).includes(id))topic.fileContributions=topic.fileContributions.filter(c=>c.fileId!==id);
  for(const entity of newEntities)if(fileContributionIds(entity).includes(id))entity.fileContributions=entity.fileContributions.filter(c=>c.fileId!==id);
  for(const t of result.topics){const topic=newTopics.find(t2=>t2.id===topicMap.get(t.id)),data={...fileSnapshot(topic),...structuredClone(t),id:topic.id,desc:t.definition,evidences:t.evidences.map(q=>({...q,fileId:id,file:file.name,revision:file.revision}))};topic.fileContributions=[...arr(topic.fileContributions),{fileId:id,revision:file.revision,data}]}
  for(const m of step3.accepted){const entity=newEntities.find(e=>e.id===entityMap.get(m.mention_local_id)),n=step4.normalization_results.find(e=>e.mention_local_id===m.mention_local_id),marked=step5.entity_results.find(e=>e.mention_local_id===m.mention_local_id),semantic=semanticFacetStorage(marked.tags);
    const data=fileSnapshot(entity),a=n.identity_anchors||{};data.identityAnchors={ontologyType:a.ontology_type||'',realityDomain:a.reality_domain||'',productIpScope:a.product_ip_scope||null,version:a.version||null,identityAttributes:structuredClone(a.identity_attributes||{})};data.identityDecision=n.decision;data.disambiguator=n.disambiguation_label||'';data.name=m.name;data.summary=m.definition;data.aliases=m.aliases;data.topics=m.topic_ids.map(t=>topicMap.get(t));data.primaryTopic=topicMap.get(m.primary_topic_id);if(!data.primaryTopic||!data.topics.includes(data.primaryTopic)||data.topics.some(t=>!t))throw new Error('来源贡献话题引用不完整或主话题未包含在关联列表。');data.sources=m.evidences.map(q=>({fileId:id,file:file.name,revision:file.revision,quote:q.exact_quote,start:q.start,end:q.end}));data.facts=data.sources.map(s=>s.quote);data.tags={type:marked.tags.entity_type?[marked.tags.entity_type]:[],typeId:marked.tags.entity_type_id};data.candidateTags=semantic.candidateTags;data.suggestedFacets=semantic.suggestedFacets;
    data.semanticFacetDetails=semantic.facetDetails.map(detail=>({...structuredClone(detail),source:{fileId:id,file:file.name,revision:file.revision},evidences:arr(detail.evidences).map(q=>({...q,fileId:id,file:file.name,revision:file.revision}))}));
    data.semanticFacetsRecognized=marked.tags.semanticFacetsRecognized===true||Array.isArray(marked.tags.semantic_facets)&&!semantic.facetDetails.some(detail=>detail.basis==='legacy');
    const resolution=marked.tags.type_resolution||resolveTagType(marked.tags,result.workbook||savedWorkbook);
    if(!marked.tags.entity_type)data.typeIssue={reason:(marked.tags.typeIssue?entityTypeIssueText({typeIssue:marked.tags.typeIssue}):resolution.reason)||'主类型缺失：未选择有效的受控主类型。',raw:structuredClone(marked.tags.typeIssue?.raw??resolution.raw??null),source:{fileId:id,file:file.name,revision:file.revision}};else delete data.typeIssue;
    for(const key of ['facets','facetDetails','semantic_facets','candidate_tags'])delete data[key];
    data.reviewReasons=[...(!marked.tags.entity_type?['ENTITY_TYPE_REVIEW_REQUIRED']:[]),...(n.decision==='review'?['ENTITY_IDENTITY_REVIEW']:[])];
    data.relations=marked.relations.map(r=>({type:r.predicate,typeId:r.relation_type_id,direction:r.direction,vocabRevision:result.workbook_revision,targetId:entityMap.get(r.target_mention_local_id),targetName:r.target_name,strength:r.strength,evidence:r.evidence.exact_quote,fileId:id,evidences:r.evidences.map(q=>({...q,fileId:id,file:file.name})),sources:r.evidences.map(q=>({fileId:id,file:file.name,quote:q.exact_quote}))}));
    data.images=window.wikiEntityImages?wikiEntityImages.matchedImagesFor(result,m.mention_local_id):[];entity.fileContributions=[...arr(entity.fileContributions),{fileId:id,revision:file.revision,data}];
  }
  for(const entity of newEntities){const own=arr(entity.fileContributions).filter(c=>c.fileId===id&&c.revision===file.revision);if(own.length>1){const data=mergeSourceContributionData(own.map(c=>c.data));if(data)entity.fileContributions=[...entity.fileContributions.filter(c=>c.fileId!==id),{fileId:id,revision:file.revision,data}]}}
  const rebuilt=rebuildFileKnowledge(newTopics,newEntities),files=structuredClone(state.files),f=files.find(f=>f.id===id);f.status='已解析';f.lastRun=fileRunSnapshot(result);commitFileWorkspace(files,rebuilt.topics,rebuilt.entities);renderKnowledge();renderFiles();return true;
}
function fileCounts(id){return {topics:state.previewTopics.filter(t=>fileContributionIds(t).includes(id)).length,entities:state.previews.filter(e=>fileContributionIds(e).includes(id)).length}}
function imageCountOf(file){return window.wikiEntityImages?wikiEntityImages.countFor(file.id,file.revision)||0:0}
function renderFiles(){
  if(!document.getElementById('fileList'))return;const files=arr(state.files),query=document.getElementById('archiveSearch').value.trim().toLowerCase(),shown=files.filter(f=>f.name.toLowerCase().includes(query)),busy=!fileMutationAllowed();
  document.getElementById('fileArchiveCount').textContent=files.length;document.getElementById('fileListSummary').textContent=`共 ${files.length} 个文件 · 显示 ${shown.length} 个`;document.getElementById('archiveAddBtn').disabled=busy;
  document.getElementById('fileList').innerHTML=shown.length?shown.map(f=>{const c=fileCounts(f.id);return `<article class="file-record" data-file-id="${escapeHtml(f.id)}"><div><h3>${escapeHtml(f.name)} ${state.source?.id===f.id?'<span class="pill blue">当前输入</span>':''}</h3><p class="small">${escapeHtml(f.status==='已解析 · 待复核'?'已解析':f.status)} · v${f.revision} · ${f.text===null?'历史正文未保存':f.text.length+' 字'} · ${(f.size/1024).toFixed(1)} KB</p><p class="small">${c.topics} 个关联话题 · ${c.entities} 个关联实体${imageCountOf(f)?' · '+imageCountOf(f)+' 张本地图片':''} · ${escapeHtml(new Date(f.updatedAt).toLocaleString('zh-CN'))}</p>${f.legacy?'<p class="small">历史来源按原文件名恢复；同名历史文件无法可靠区分，来源归属待核对。</p>':''}</div><div class="row"><button class="btn primary" data-file-action="select" ${busy||!f.text?'disabled':''}>用于测试</button><button class="btn" data-file-action="edit" ${busy?'disabled':''}>编辑</button><button class="btn danger" data-file-action="delete" ${busy?'disabled':''}>删除</button></div></article>`}).join(''):'<div class="empty">'+(files.length?'没有匹配的文件':'尚未导入文件；添加文件后会在这里持续保留')+'</div>';
  for(const button of document.querySelectorAll('[data-file-action]'))button.onclick=()=>{const id=button.closest('[data-file-id]').dataset.fileId;try{if(button.dataset.fileAction==='select')selectArchiveFile(id);else if(button.dataset.fileAction==='edit')openFileEditor(id);else deleteArchiveFile(id)}catch(e){toast(e.message)}};
  for(const id of ['saveFileEditBtn','replaceArchiveFileBtn'])document.getElementById(id).disabled=busy;
}
function openFileEditor(id){if(!fileMutationAllowed())return;const f=state.files.find(f=>f.id===id);if(!f)return;fileEditId=id;document.getElementById('fileEditName').value=f.name;document.getElementById('fileEditText').value=f.text||'';document.getElementById('fileEditHint').textContent=f.legacy?'历史记录缺少正文，可补正文后重新解析；空白正文只允许改名。':'仅改名保留知识；正文变化会撤销旧解析结果，保存后需再次运行。';document.getElementById('fileEditError').textContent='';document.getElementById('fileEditModal').classList.add('show');document.getElementById('fileEditName').focus()}
const fileOriginalBlockers=runBlockers;
runBlockers=function(){const reasons=fileOriginalBlockers();if(fileWorkspaceBusy)reasons.push('正在替换文件内容，请稍候');if(!fileManagerReady)reasons.push('文件档案未能加载，请刷新或导出备份');return reasons};
const fileOriginalInit=init,fileOriginalSetPage=setPage,fileOriginalSetRunning=setRunning,fileOriginalNormalize=normalizeStoredPreviews,fileOriginalRun=runCurrent,fileOriginalExport=exportResult;
setPage=function(page){fileOriginalSetPage(page);if(page==='files')renderFiles()};
setRunning=function(running,label){fileOriginalSetRunning(running,label);updateComparisonControls();renderFiles()};
normalizeStoredPreviews=function(workbook=savedWorkbook){
  if(fileManagerReady&&localStorage.getItem(FILE_WORKSPACE_KEY)!==fileWorkspaceRaw){toast('另一标签页已更改文件档案，请刷新后再运行');return}
  fileOriginalNormalize(workbook);
  if(fileManagerReady)try{
    for(const e of state.previews)for(const c of arr(e.fileContributions))normalizeStoredEntityTags(c.data,workbook);
    const rebuilt=rebuildFileKnowledge(state.previewTopics,state.previews,workbook);
    commitFileWorkspace(state.files,rebuilt.topics,rebuilt.entities);
  }catch(e){toast(e.message)}
};
function fileRunSnapshot(result){const comparison=result.comparison?{...structuredClone(result.comparison),A:structuredClone(state.baseline?.comparison||null),B:structuredClone(result.comparison)}:null;return {at:new Date().toISOString(),model:result.model.id,source:{...structuredClone(result.comparison?.source||{id:result.source.file_id,name:result.source.file_name,revision:result.source.file_revision}),comparison:structuredClone(comparison)},comparison}}
runCurrent=async function(options={}){
  if(!fileManagerReady||isRunning||fileReading||workbookBusy||fileWorkspaceBusy||options.runControl?.cancelled)return false;const file=structuredClone(options.comparisonFrozen?.source||state.source);
  try{
    const executed=await fileOriginalRun(options);if(executed===false||options.runControl?.cancelled)return false;if(!file?.id)return;
    if(!state.baseline&&!state.current)return;
    const finishArchive=()=>{const files=structuredClone(state.files),f=files.find(f=>f.id===file.id);if(!f||f.revision!==file.revision||f.name!==file.name)throw new Error('源文件在运行期间变化，禁止更新旧快照档案。');if(!state.current){f.status=state.baseline?'新版未完成 · 保留原知识':'解析未完成 · 保留原知识'}else if(!state.current.preview_eligible){f.status='已解析 · 无有效知识';f.lastRun=fileRunSnapshot(state.current);const plan=planFileRemoval(file.id);commitFileWorkspace(files,plan.topics,plan.entities);renderKnowledge();return}commitFileWorkspace(files,state.previewTopics,state.previews)};
    if(globalThis.wikiRunTiming)globalThis.wikiRunTiming.sync('shared','archive','文件档案提交',finishArchive,{phase:'after'});else finishArchive();
  }catch(e){globalThis.wikiRunTiming?.outcome('failed','文件档案处理失败；'+e.message);toast(e.message)}finally{renderFiles()}
};
exportResult=function(){const data={files:state.files,topics:state.previewTopics,entities:state.previews,source:state.source,prompts:state.prompts,baselinePrompts:state.baselinePrompts,current:state.current,baseline:state.baseline};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='知识Wiki文件与结果备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
init=function(){
  try{migrateFileWorkspace();fileManagerReady=true}catch(e){toast('文件档案未能加载：'+e.message);state.files=[]}
  if(fileManagerReady)normalizeStoredPreviews();
  fileOriginalInit();document.getElementById('clearFileBtn').textContent='取消当前选择';document.getElementById('replaceFileBtn').textContent='添加另一个文件';
  document.getElementById('archiveAddBtn').onclick=()=>{if(fileMutationAllowed())document.getElementById('fileInput').click()};document.getElementById('archiveSearch').oninput=renderFiles;
  document.getElementById('closeFileEditBtn').onclick=()=>document.getElementById('fileEditModal').classList.remove('show');document.getElementById('fileEditModal').onclick=e=>{if(e.target.id==='fileEditModal')e.currentTarget.classList.remove('show')};
  document.getElementById('saveFileEditBtn').onclick=()=>{try{const f=state.files.find(f=>f.id===fileEditId),text=document.getElementById('fileEditText').value;if(updateArchiveFile(fileEditId,document.getElementById('fileEditName').value,f?.text===null&&!text.trim()?null:text)){document.getElementById('fileEditModal').classList.remove('show');toast('修改已保存；正文变化时请重新解析')}}catch(e){document.getElementById('fileEditError').textContent=e.message}};
  document.getElementById('replaceArchiveFileBtn').onclick=()=>{if(fileMutationAllowed())document.getElementById('archiveReplaceInput').click()};
  document.getElementById('archiveReplaceInput').onchange=async e=>{const file=e.target.files[0],id=fileEditId;e.target.value='';if(!file||!fileMutationAllowed())return;fileWorkspaceBusy=true;renderFiles();updateRunReadiness();try{const source=await readSourceFile(file);fileWorkspaceBusy=false;if(updateArchiveFile(id,source.name,source.text,source.size)){document.getElementById('fileEditModal').classList.remove('show');toast('文件内容已替换，请重新解析')}}catch(error){document.getElementById('fileEditError').textContent=error.message}finally{fileWorkspaceBusy=false;renderFiles();updateRunReadiness()}};
  window.addEventListener('storage',e=>{if(e.key!==FILE_WORKSPACE_KEY)return;if(isRunning||comparisonRunWaiting||fileReading){toast('另一标签页修改了文件；当前结果将禁止覆盖，请稍后刷新');return}try{migrateFileWorkspace();normalizeStoredPreviews();state.source=null;resetSourceResults();renderSourceUI();renderKnowledge();renderFiles()}catch(error){toast(error.message)}});
  renderFiles();
};
