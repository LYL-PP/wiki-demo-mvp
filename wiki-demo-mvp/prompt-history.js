'use strict';

// 云端只追加完整快照；本地记录同时保存父版本、草稿和未决请求，刷新不丢稿。
(function(root){
  const STEPS=['step2','step3','step4','step5','integration'];
  const SIDES=['baseline','current'];
  const TABLE='wiki_prompt_versions';
  const clone=value=>structuredClone(value);
  const same=(a,b)=>SIDES.every(side=>STEPS.every(step=>a?.[side]?.[step]===b?.[side]?.[step]));
  const problem=(message,code)=>Object.assign(new Error(message),{code});
  function validate(snapshot){
    if(!snapshot||Object.keys(snapshot).length!==2)throw problem('快照必须包含完整的基线版和新版。','23514');
    for(const side of SIDES){
      if(!snapshot[side]||Object.keys(snapshot[side]).length!==5)throw problem('每版必须包含 STEP 2–5 和全局整合。','23514');
      for(const step of STEPS){const value=snapshot[side][step];if(typeof value!=='string'||!value.trim()||[...value].length<1||[...value].length>50000||value.includes('\u0000'))throw problem(`${side}.${step} 需为 1–50000 字，不能含空字符。`,'23514')}
    }
    if(new TextEncoder().encode(JSON.stringify(snapshot)).length>700000)throw problem('完整快照超过 700000 bytes，请缩短提示词。','23514');
    return snapshot;
  }
  function diff(before,after){
    const a=Array.from(before),b=Array.from(after);let start=0,end=0;
    while(start<a.length&&start<b.length&&a[start]===b[start])start++;
    while(end<a.length-start&&end<b.length-start&&a[a.length-1-end]===b[b.length-1-end])end++;
    return {prefix:a.slice(0,start).join(''),removed:a.slice(start,a.length-end).join(''),added:b.slice(start,b.length-end).join(''),suffix:end?a.slice(a.length-end).join(''):''};
  }
  function nextRevision(value){try{return (BigInt(value)+1n).toString()}catch(error){throw problem('云端版本号无效。','23514')}}
  function createController(options){
    const {storage,key,getDatabase,uuid,onChange=()=>{},defaults,isKnownDefault=()=>false}=options;
    const legacyDraft=key+'promptHistoryDraftV1',tabStorage=options.sessionStorage;
    // sessionStorage 隔离标签页并支持刷新；独立 localStorage 槽位另存备份，复制标签页也不共写。
    const draftKey=legacyDraft+':'+(options.draftId||uuid());
    const keys={draft:draftKey,cloud:key+'promptHistoryCloudV1',backup:draftKey+':backup',legacyBackup:key+'promptHistoryLegacyBackupV1',session:legacyDraft,legacyDraft};
    let base=null,cloudHead=null,draft=clone(options.localSnapshot),pending=null,generation=0,ready=false,blocked='',error='',timer=null,flight=null,loadFlight=null,action='edit',note='',editor='',localError='',cacheError='';
    const read=(k,source=storage)=>{try{return JSON.parse(source?.getItem(k))}catch(e){return null}};
    const cached=read(keys.cloud),sessionRecord=read(keys.session,tabStorage),record=sessionRecord||read(keys.draft)||read(keys.legacyDraft);
    let needsInitialChoice=!record,recordValid=false;
    const localBackups=()=>{const drafts=[];for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k===keys.legacyDraft||k?.startsWith(keys.legacyDraft+':'))drafts.push({key:k,raw:storage.getItem(k)})}return {drafts,legacyRaw:clone(options.legacyRaw??null),legacyBackupRaw:storage.getItem(keys.legacyBackup)}};
    if(cached?.snapshot){try{validate(cached.snapshot);base=cached;cloudHead=cached}catch(e){}}
    if(record?.snapshot){try{if(!SIDES.every(side=>STEPS.every(step=>typeof record.snapshot?.[side]?.[step]==='string')))throw problem('草稿结构无效','23514');draft=clone(record.snapshot);pending=record.pending||null;generation=record.generation||0;blocked=record.blocked||'';action=record.action||'edit';note=record.note||'';editor=record.editor||'';if(base&&String(base.revision)!==String(record.baseRevision))blocked='choice';recordValid=true}catch(e){error='本地草稿格式无效，原记录仍保留；请导出备份后处理。';blocked='choice'}}
    if(recordValid&&record?.base){try{validate(record.base.snapshot);if(String(record.base.revision)!==String(record.baseRevision))throw problem('草稿父版本无效','23514');base=clone(record.base);blocked=record.blocked||''}catch(e){blocked='choice'}}
    else if(record&&base&&String(base.revision)!==String(record.baseRevision)){base=null;blocked='choice'}
    const notify=()=>onChange(status());
    function status(){return {base:base&&clone(base),cloudHead:cloudHead&&clone(cloudHead),snapshot:clone(draft),pending:pending&&clone(pending),generation,ready,blocked,error:localError||cacheError||error,dirty:!base||!same(draft,base.snapshot)||!!pending,keys:clone(keys),note,editor,action,busy:!!flight}}
    function exportBackup(){return {...status(),localBackups:localBackups()}}
    function persist(){
      const record={schema:1,baseRevision:base?.revision??null,base,snapshot:draft,pending,generation,blocked,action,note,editor,dirty:!base||!same(draft,base.snapshot)||!!pending,updatedAt:new Date().toISOString()};
      const raw=JSON.stringify(record);let failed=false;
      try{storage.setItem(keys.draft,raw)}catch(e){failed=true}
      try{tabStorage?.setItem(keys.session,raw)}catch(e){failed=true}
      localError=failed?'本地草稿保存失败，未同步；请立即导出草稿，释放浏览器空间后重试。':'';
      notify();return !localError;
    }
    async function query(builder){const result=await builder;if(result.error)throw result.error;return result.data}
    function database(){const db=getDatabase();if(!db)throw problem('云 SDK 尚未就绪，请重试连接。','not_ready');return db}
    async function latest(){const rows=await query(database().from(TABLE).select('*').order('revision',{ascending:false}).limit(1));if(!rows?.length)throw problem('提示词历史暂无版本（0 行）。请等待管理员建立默认 v1 后重新读取；不会自动 seed。','empty');validate(rows[0].snapshot);return rows[0]}
    async function byRequest(id){return query(database().from(TABLE).select('*').eq('request_id',id).maybeSingle())}
    function cache(row){base=clone(row);try{storage.setItem(keys.cloud,JSON.stringify(base));cacheError=''}catch(e){cacheError='云版已保存，但本地云版本缓存失败；请导出草稿备份。'}}
    function backup(reason){
      const old=read(keys.backup)||[];
      old.push({at:new Date().toISOString(),reason,snapshot:clone(draft),baseRevision:base?.revision??null,pending:clone(pending),legacy:options.legacyRaw||null});
      try{storage.setItem(keys.backup,JSON.stringify(old))}catch(e){throw problem('无法保存旧草稿备份；未替换当前提示词，请先导出草稿。','local_storage')}
    }
    function custom(snapshot,cloudSnapshot){return SIDES.some(side=>STEPS.some(step=>snapshot?.[side]?.[step]!==undefined&&snapshot[side][step]!==cloudSnapshot?.[side]?.[step]&&snapshot[side][step]!==defaults[step]&&!isKnownDefault(step,snapshot[side][step])))}
    function changed(snapshot,kind='edit',metadata={}){
      draft=clone(snapshot);generation++;action=kind;note=metadata.note??note;editor=metadata.editor??editor;error='';persist();
      clearTimeout(timer);
      if(ready&&!blocked&&!localError)timer=setTimeout(()=>{timer=null;flush(false).catch(()=>{})},750);
    }
    function metadata(values){note=values.note??note;editor=values.editor??editor;persist()}
    function fail(e){error=e.code==='empty'?e.message:e.code==='40001'?'云端已有新版本，草稿未覆盖云端。请比较后显式载入云版，或以我的草稿新建版本。':e.code==='23514'?'提示词格式不合法或没有变化；未同步。'+(e.message||''):e.code==='42501'?'没有提示词历史读写权限，草稿仍保留。':'云端同步失败，草稿保留且未同步；可重试或查看云新版。';if(e.code==='40001')blocked='conflict';if(e.code==='23514'){pending=null;if(action==='restore')action='edit'}persist()}
    async function load(){
      if(loadFlight)return loadFlight;
      const epoch=generation;
      loadFlight=(async()=>{try{
        if(flight)await flight.catch(()=>{});
        let row=await latest();
        if(pending&&await byRequest(pending.payload.request_id)){await commitPending();row=await latest()}
        cloudHead=clone(row);ready=true;
        if(!base||needsInitialChoice){
          if(!same(draft,row.snapshot)&&(pending||generation!==epoch||generation>0||custom(draft,row.snapshot)||blocked||options.allowAutoLoad?.()===false)){blocked='choice';backup('首次载入：保留旧本地草稿');}
          else{backup('采用共享默认：备份旧本地记录');draft=clone(row.snapshot);cache(row);blocked='';}
        }else if(String(row.revision)!==String(base.revision)){
          if(generation!==epoch||pending||!same(draft,base.snapshot)||blocked||options.allowAutoLoad?.()===false){blocked=blocked||'conflict';}
          else{draft=clone(row.snapshot);cache(row);blocked='';}
        }
        needsInitialChoice=false;error='';persist();return row;
      }catch(e){ready=false;fail(e);throw e}finally{loadFlight=null;notify()}})();
      return loadFlight;
    }
    async function viewCloud(){const row=await latest();cloudHead=clone(row);if(base&&String(row.revision)!==String(base.revision)){blocked=blocked||'conflict';persist()}notify();return row}
    async function commitPending(){
      const request=pending;
      validate(request.payload.snapshot);
      if([...request.payload.note].length>2000||[...request.payload.editor_label].length>120)throw problem('备注最多 2000 字，匿名署名最多 120 字。','23514');
      let row=await byRequest(request.payload.request_id);
      if(!row){
        const head=await latest();cloudHead=clone(head);
        if(String(head.revision)!==String(request.payload.parent_revision))throw problem('父版本已变化。','40001');
        try{const rows=await query(database().from(TABLE).insert(request.payload).select('*'));row=rows?.[0];if(!row)throw problem('云端未返回已写入版本。','write_missing')}
        catch(e){if(e.code!=='23505')throw e;row=await byRequest(request.payload.request_id);if(!row)throw problem('重复请求未能读回，请重试。','duplicate_unreadable')}
      }
      validate(row.snapshot);
      if(!same(row.snapshot,request.payload.snapshot)||String(row.parent_revision)!==String(request.payload.parent_revision))throw problem('请求编号对应的版本不一致，请保留草稿并检查。','23514');
      cache(row);cloudHead=clone(row);pending=null;error='';if(!persist()||cacheError)throw problem(localError||cacheError,'local_storage');return row;
    }
    async function performFlush(drain){
      if(!ready)throw problem(error||'提示词历史尚未从云端加载，请重试。','not_ready');
      if(blocked)throw problem('请先处理保留草稿与云端版本的选择；未运行。','40001');
      if(cacheError&&base)cache(base);
      if(!persist()||cacheError)throw problem(localError||cacheError,'local_storage');
      let target=clone(draft),targetGeneration=generation,targetAction=action,targetNote=note,targetEditor=editor;
      if(pending)await commitPending();
      do{
        const head=await latest();cloudHead=clone(head);
        if(!base||String(head.revision)!==String(base.revision))throw problem('云端出现新版本。','40001');
        if(!same(target,base.snapshot)){
          const snapshot=validate(target),revision=base.revision;
          if([...targetNote].length>2000||[...targetEditor].length>120)throw problem('备注最多 2000 字，匿名署名最多 120 字。','23514');
          pending={generation:targetGeneration,payload:{revision:nextRevision(revision),parent_revision:revision,snapshot,request_id:uuid(),action:targetAction,note:targetNote,editor_label:targetEditor||'匿名',restored_from:null}};
          if(!persist())throw problem(localError,'local_storage');
          await commitPending();
        }
        target=clone(draft);targetGeneration=generation;targetAction=action;targetNote=note;targetEditor=editor;
        error='';persist();
      }while(drain&&!same(draft,base.snapshot));
    }
    function flush(drain=true){
      clearTimeout(timer);timer=null;
      if(flight)return flight.then(()=>flush(drain));
      const job=performFlush(drain).catch(e=>{fail(e);throw e});
      flight=job.finally(()=>{flight=null;notify()});notify();return flight;
    }
    async function resolvePending(){
      if(!pending)return;
      const row=await byRequest(pending.payload.request_id);
      if(row){await commitPending();return}
      // 查询成功且明确不存在后，才可由用户的显式选择放弃旧请求。
      pending=null;persist();
    }
    async function adoptCloud(confirm){
      clearTimeout(timer);if(flight)await flight.catch(()=>{});
      const epoch=generation,row=await latest();cloudHead=clone(row);
      if(!confirm(`载入共享云版 v${row.revision}？当前草稿会先备份，不会删除任何历史。`))return false;
      if(epoch!==generation)throw problem('确认期间草稿已变化，请重新比较后操作。','40001');
      await resolvePending();if(epoch!==generation)throw problem('草稿已变化，请重新操作。','40001');
      backup('用户显式载入云版');draft=clone(row.snapshot);cache(row);blocked='';ready=true;error='';generation++;persist();return true;
    }
    async function publishDraft(confirm){
      clearTimeout(timer);if(flight)await flight.catch(()=>{});
      const epoch=generation,row=await latest();cloudHead=clone(row);
      if(!confirm(`以我的完整草稿新建版本？\n最新父版本为 v${row.revision}，将新增 v${nextRevision(row.revision)}，其中与云版不同的全部字段采用草稿值。\n不会合并他人改动或强行覆盖已有历史；提交期间再有新版本将继续报冲突。请先比较云与草稿。`))return false;
      if(epoch!==generation)throw problem('确认期间草稿已变化，请重新比较。','40001');
      await resolvePending();if(epoch!==generation)throw problem('草稿已变化，请重新操作。','40001');
      backup('用户显式以草稿追加最新父版本');cache(row);blocked='';ready=true;error='';action='import';persist();await flush();return true;
    }
    async function restore(row,side,step,confirm){
      const epoch=generation;await flush();if(epoch!==generation)throw problem('恢复等待期间草稿已变化，未替换新编辑。','40001');
      const target=clone(draft);
      if(side)target[side][step]=row.snapshot[side][step];else SIDES.forEach(s=>target[s]=clone(row.snapshot[s]));
      validate(target);if([...note].length>2000||[...editor].length>120)throw problem('备注最多 2000 字，匿名署名最多 120 字。','23514');if(same(target,draft))throw problem('所选内容与当前版本相同，没有新增恢复版本。','23514');
      if(!confirm(`恢复历史 v${row.revision} 的${side?`${side==='baseline'?'基线':'新版'} ${step}`:'完整两版'}？\n以当前 v${base.revision} 为父版本新增 restore，原版本不删除，不改变知识文件或词表。`))return false;
      if(epoch!==generation)throw problem('确认期间草稿已变化，请重新恢复。','40001');
      const head=await latest();cloudHead=clone(head);if(String(head.revision)!==String(base.revision)){const e=problem('恢复前云版本变化。','40001');fail(e);throw e}
      if(epoch!==generation)throw problem('恢复等待期间草稿已变化，未替换新编辑。','40001');
      backup('恢复前完整快照');draft=target;generation++;action='restore';
      pending={generation,payload:{revision:nextRevision(base.revision),parent_revision:base.revision,snapshot:clone(target),request_id:uuid(),action:'restore',note,editor_label:editor||'匿名',restored_from:row.revision}};
      persist();await flush();return true;
    }
    function page(before){let builder=database().from(TABLE).select('revision,parent_revision,created_at,action,editor_label,note,changed_steps,restored_from').order('revision',{ascending:false}).limit(30);if(before!=null)builder=builder.lt('revision',before);return query(builder)}
    async function detail(revision){const row=await query(database().from(TABLE).select('*').eq('revision',revision).single());validate(row.snapshot);const previous=row.parent_revision==null||String(row.parent_revision)==='0'?null:await query(database().from(TABLE).select('*').eq('revision',row.parent_revision).maybeSingle());if(previous)validate(previous.snapshot);return {row,previous}}
    function cancelTimer(){clearTimeout(timer);timer=null}
    return {status,exportBackup,changed,metadata,load,viewCloud,flush,adoptCloud,publishDraft,restore,page,detail,cancelTimer,persist};
  }
  const API={STEPS,SIDES,same,validate,diff,createController};
  if(typeof module==='object'&&module.exports){module.exports=API;return}

  const $=id=>document.getElementById(id);
  let controller,initialized=false,uiReady=false,runWaiting=false,mutating=false,applying=false,modalFocus=null,detailEpoch=0,pageEpoch=0,selected=null,rows=[],cursorStack=[null],pageIndex=0,composition=false;
  const snapshot=()=>({baseline:clone(state.baselinePrompts),current:clone(state.prompts)});
  function element(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el}
  function button(text,fn){const el=element('button',text,'btn');el.type='button';el.onclick=()=>guard(fn);return el}
  async function guard(fn){try{return await fn()}catch(e){toast(e.code==='40001'?'版本冲突：请保留草稿并在提示词历史中比较选择。':e.message||'操作失败，草稿仍保留。');refreshStatus();return false}}
  function applySnapshot(){
    if(uiReady)capture();
    const s=controller.status().snapshot;if(uiReady&&same(snapshot(),s)){refreshStatus();return}
    // 显式恢复/载入后的绑定必须指向新快照，避免旧共享框在下一次 capture 时回写旧值。
    if(sharedPromptBinding&&!sharedPromptBinding.dirty)sharedPromptBinding=null;
    applying=true;try{state.baselinePrompts=clone(s.baseline);state.prompts=clone(s.current);try{save(STORE+'baseline',s.baseline);save(STORE+'prompts',s.current)}catch(e){toast('兼容缓存保存失败；历史草稿另存，建议导出备份。')}renderPromptEditor();markResultsStale()}finally{applying=false}
  }
  function record(kind='edit'){if(applying)return;controller.changed(snapshot(),kind);markResultsStale();refreshStatus()}
  function capture(){
    if(!uiReady||applying||runWaiting||comparisonRunWaiting||isRunning)return;
    const merged=controller.status().snapshot,key=state.promptKey;let edited=false;
    if(captureComparisonConfig().mode==='models'){
      const binding=sharedPromptBinding,side=binding?.source,dirty=!!binding?.dirty;
      syncSharedPromptEditor();
      if(dirty&&merged[side][binding.key]!==binding.value){merged[side][binding.key]=binding.value;state[side==='baseline'?'baselinePrompts':'prompts'][binding.key]=binding.value;edited=true}
    }else{
      for(const [side,id,field] of [['baseline','baselinePromptEditor','baselinePrompts'],['current','promptEditor','prompts']]){const value=$(id).value;if(value!==state[field][key]){merged[side][key]=value;state[field][key]=value;edited=true}}
    }
    if(edited){controller.changed(merged);markResultsStale();refreshStatus()}
  }
  async function flush(){capture();if(composition)throw problem('输入法组合输入尚未结束，请完成输入后再运行或操作。','composing');return controller.flush()}
  function controls(){
    if(!uiReady)return;const busy=isRunning||runWaiting||comparisonRunWaiting||mutating;
    updateComparisonControls(mutating||runWaiting);
    if(!busy){$('modelSelect').disabled=!availableModels.length;for(const id of ['fileInput','replaceFileBtn','clearFileBtn'])$(id).disabled=false;const drop=$('fileDrop');drop.classList.remove('disabled');drop.setAttribute('aria-disabled','false')}
    for(const id of ['baselinePromptEditor','promptEditor','resetBaselineBtn','resetPromptBtn','copyBaselineBtn','saveBaselineBtn'])$(id).disabled=busy||captureComparisonConfig().mode==='models';
    document.querySelectorAll('[data-prompt]').forEach(el=>el.disabled=busy);
    document.querySelectorAll('[data-prompt-restore]').forEach(el=>el.disabled=busy||!controller.status().ready||!!controller.status().blocked);
    for(const id of ['promptHistoryAdopt','promptHistoryPublish','promptHistoryRetry'])$(id).disabled=busy;
  }
  function refreshStatus(){
    if(!uiReady||!controller)return;
    const s=controller.status();let message=s.error||(!s.ready?'正在等待云 SDK 和共享提示词历史…':s.blocked?'发现保留草稿与共享云版不同，请比较并选择；未同步。':s.busy?'正在同步完整提示词快照…':s.dirty?'本地草稿已保存 · 未同步到云端':'已同步共享提示词 v'+s.base?.revision);
    $('promptHistoryStatusText').textContent=message;$('promptHistoryStatus').classList.toggle('synced',s.ready&&!s.dirty&&!s.blocked&&!s.error);
    for(const id of ['baselinePromptState','promptState']){$(id).textContent=s.ready&&!s.dirty&&!s.blocked&&!s.error?'已同步 v'+s.base?.revision:s.error?'未同步 · 草稿保留':s.blocked?'未同步 · 待选择':'本地草稿 · 未同步';$(id).className='pill '+(s.ready&&!s.dirty&&!s.blocked&&!s.error?'green':'amber')}
    $('promptHistoryAdopt').hidden=!s.blocked;$('promptHistoryPublish').hidden=!s.blocked;$('promptHistoryRetry').hidden=!!s.blocked&&s.ready;
    controls();updateRunReadiness();
  }
  async function copyText(node){await navigator.clipboard.writeText(node.textContent);toast('已复制完整版本')}
  function exportJSON(value,name){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=element('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  function fullText(s){return SIDES.map(side=>`${side==='baseline'?'基线版':'新版'}\n`+STEPS.map(step=>`${promptLabels[step]}\n${s[side][step]}`).join('\n\n')).join('\n\n')}
  function metadataText(row){return `v${row.revision} · 父版本 ${row.parent_revision??'无'}\n${new Date(row.created_at).toLocaleString('zh-CN')} · ${row.action}\n署名：${row.editor_label||'匿名'}（匿名未验证，不能视为认证身份）\n修改步骤：${(row.changed_steps||[]).join('、')||'无'}${row.restored_from!=null?'\n恢复来源：v'+row.restored_from:''}\n备注：${row.note||'无'}`}
  function renderVersions(host,current,previous,leftLabel='基线版',rightLabel='新版'){
    const grid=element('div',undefined,'prompt-history-columns');host.append(grid);
    for(const [i,side] of SIDES.entries()){
      const col=element('section');col.append(element('h3',i?rightLabel:leftLabel));grid.append(col);
      for(const step of STEPS){const block=element('article',undefined,'prompt-history-step');block.append(element('h4',promptLabels[step]));block.append(element('pre',current[side][step]));
        if(previous){const d=diff(previous[side][step],current[side][step]),details=element('details');details.append(element('summary',d.removed||d.added?'与上一版的差异（公共前后缀，中间块非最短 diff）':'与上一版相同'));const pre=element('pre');pre.append(document.createTextNode(d.prefix));if(d.removed)pre.append(element('del',d.removed));if(d.added)pre.append(element('ins',d.added));pre.append(document.createTextNode(d.suffix));details.append(pre);block.append(details)}else block.append(element('p','没有上一版本，展示原始全文。','small muted'));
        col.append(block);
      }
    }
  }
  async function showComparison(){
    capture();const epoch=++detailEpoch;$('promptHistoryDetail').replaceChildren(element('p','正在读取云新版…'));
    let cloudRow;try{cloudRow=await controller.viewCloud()}catch(e){if(epoch===detailEpoch)$('promptHistoryDetail').replaceChildren(element('p','读取云版失败：'+(e.message||'请重试。')),button('重试读取',showComparison));throw e}if(epoch!==detailEpoch)return;
    const draft=controller.status().snapshot,host=$('promptHistoryDetail');host.replaceChildren(element('h3','云新版与我的草稿'),element('p',`云版 v${cloudRow.revision}；右侧为本地草稿。未自动覆盖或合并。`));
    // 每个字段并排展示，两侧都是原文；差异只标注公共前后缀间的真实替换块。
    for(const side of SIDES){host.append(element('h3',side==='baseline'?'基线版':'新版'));for(const step of STEPS){const grid=element('div',undefined,'prompt-history-columns');host.append(grid);for(const [label,text] of [['云版 · '+promptLabels[step],cloudRow.snapshot[side][step]],['我的草稿 · '+promptLabels[step],draft[side][step]]]){const box=element('article',undefined,'prompt-history-step');box.append(element('h4',label),element('pre',text));grid.append(box)}const d=diff(cloudRow.snapshot[side][step],draft[side][step]);const delta=element('details');delta.append(element('summary','查看真实差异（云 → 草稿）'));const pre=element('pre');pre.append(document.createTextNode(d.prefix),element('del',d.removed),element('ins',d.added),document.createTextNode(d.suffix));delta.append(pre);host.append(delta)}}
    host.prepend(button('导出我的草稿',()=>exportJSON(controller.exportBackup(),'提示词草稿备份.json')));refreshStatus();
  }
  async function showDetail(revision){
    const epoch=++detailEpoch;selected=null;$('promptHistoryDetail').replaceChildren(element('p','正在读取完整版本…'));
    let result;try{result=await controller.detail(revision)}catch(e){if(epoch===detailEpoch)$('promptHistoryDetail').replaceChildren(element('p','读取历史详情失败：'+(e.message||'请重试。')),button('重试读取详情',()=>showDetail(revision)));throw e}if(epoch!==detailEpoch)return;const {row,previous}=result;selected=row;
    const host=$('promptHistoryDetail');host.replaceChildren(element('pre',metadataText(row),'prompt-history-meta'));
    const toolbar=element('div',undefined,'row'),textNode=element('pre',fullText(row.snapshot));textNode.hidden=true;host.append(textNode,toolbar);
    toolbar.append(button('复制版本全文',()=>copyText(textNode)),button('导出版本 JSON',()=>exportJSON(row,'提示词-v'+row.revision+'.json')));
    let restoreStep=state.promptKey;
    const restore=async side=>{if(isRunning||runWaiting||comparisonRunWaiting||mutating)throw problem('运行或同步期间不能恢复。','busy');capture();if(composition)throw problem('请先完成输入法组合输入。','composing');mutating=true;controls();try{if(await controller.restore(row,side,side?restoreStep:null,window.confirm.bind(window))){toast('已新增恢复版本，历史未删除');await loadPage(true)}}finally{applySnapshot();mutating=false;refreshStatus()}};
    for(const [label,side] of [['恢复完整两版',null],['恢复基线当前 STEP','baseline'],['恢复新版当前 STEP','current']]){const b=button(label,()=>restore(side));b.dataset.promptRestore='true';toolbar.append(b)}
    const select=element('select');select.dataset.promptRestore='true';select.setAttribute('aria-label','选择恢复的 STEP');STEPS.forEach(step=>{const option=element('option',promptLabels[step]);option.value=step;select.append(option)});select.value=state.promptKey;select.onchange=()=>{restoreStep=select.value};toolbar.append(select);
    host.append(element('p','删除块为浅红色，新增块为浅绿色；差异保留原文，不是行级或最短编辑 diff。','small muted'));renderVersions(host,row.snapshot,previous?.snapshot);renderList();controls();
  }
  function renderList(){const list=$('promptHistoryList');list.replaceChildren();for(const row of rows){const b=button(metadataText(row),()=>showDetail(row.revision));b.className='prompt-history-item'+(String(selected?.revision)===String(row.revision)?' selected':'');list.append(b)}if(!rows.length)list.append(element('p','暂无历史；请等待默认 v1 建立后重新读取。'));$('promptHistoryPageText').textContent='第 '+(pageIndex+1)+' 页 · 每页 30 版';$('promptHistoryPrevious').disabled=pageIndex===0;$('promptHistoryNext').disabled=rows.length<30}
  async function loadPage(reset=false){if(reset){cursorStack=[null];pageIndex=0}const epoch=++pageEpoch;let items;try{items=await controller.page(cursorStack[pageIndex])}catch(e){if(epoch===pageEpoch)$('promptHistoryList').replaceChildren(element('p','读取历史列表失败：'+(e.message||'请重试。')),button('重试读取列表',()=>loadPage()));throw e}if(epoch!==pageEpoch)return;rows=items||[];renderList();if(rows.length)await showDetail(rows[0].revision)}
  function closeModal(){detailEpoch++;pageEpoch++;$('promptHistoryModal').classList.remove('show');modalFocus?.focus()}
  async function openModal(compare=false){capture();modalFocus=document.activeElement;$('promptHistoryModal').classList.add('show');$('promptHistoryClose').focus();await guard(()=>compare?showComparison():loadPage(true))}
  async function mutate(kind,fn){
    if(isRunning||runWaiting||comparisonRunWaiting||mutating)return;mutating=true;controls();
    try{await flush();const before=snapshot();fn();if(!same(before,snapshot())){record(kind);renderPromptEditor();await controller.flush()}}
    finally{mutating=false;refreshStatus()}
  }
  function wireEditor(){
    const shared=$('sharedPromptEditor');shared.addEventListener('compositionstart',()=>{composition=true;controller.cancelTimer()});shared.addEventListener('input',()=>{capture();if(composition)controller.cancelTimer()});shared.addEventListener('compositionend',()=>{composition=false;capture();controller.changed(controller.status().snapshot,'edit')});shared.addEventListener('blur',()=>{if(!composition&&!comparisonRunWaiting&&!runWaiting&&!isRunning)guard(flush)});
    for(const [id,side,count] of [['baselinePromptEditor','baseline','baselineCharCount'],['promptEditor','current','charCount']]){
      const el=$(id);el.oninput=()=>{if(isRunning||runWaiting||comparisonRunWaiting||captureComparisonConfig().mode==='models')return;const next=controller.status().snapshot;next[side][state.promptKey]=el.value;state[side==='baseline'?'baselinePrompts':'prompts'][state.promptKey]=el.value;$(count).textContent=el.value.length+' 字';controller.changed(next);markResultsStale();refreshStatus();if(composition)controller.cancelTimer()};
      el.addEventListener('compositionstart',()=>{composition=true;controller.cancelTimer()});el.addEventListener('compositionend',()=>{composition=false;capture();controller.changed(controller.status().snapshot,'edit')});
      el.addEventListener('blur',()=>{if(!composition)guard(flush)});
    }
    $('resetBaselineBtn').onclick=()=>guard(()=>mutate('reset',()=>{state.baselinePrompts[state.promptKey]=DEFAULT_PROMPTS[state.promptKey]}));
    $('resetPromptBtn').onclick=()=>guard(()=>mutate('reset',()=>{state.prompts[state.promptKey]=DEFAULT_PROMPTS[state.promptKey]}));
    $('saveBaselineBtn').onclick=()=>guard(()=>mutate('copy',()=>{if(!same({baseline:state.baselinePrompts,current:state.baselinePrompts},{baseline:state.prompts,current:state.prompts})&&window.confirm('将整版新版设为基线？修改前完整快照已保存于云端历史，不删除历史。'))state.baselinePrompts=clone(state.prompts)}));
    $('copyBaselineBtn').onclick=()=>guard(()=>mutate('copy',()=>{if(window.confirm('将整版基线复制到新版？修改前完整快照已保存于云端历史，不删除历史。'))state.prompts=clone(state.baselinePrompts)}));
  }
  function buildUI(){
    const banner=element('section',undefined,'prompt-history-status');banner.id='promptHistoryStatus';banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');const p=element('p');p.id='promptHistoryStatusText';banner.append(p);const tools=element('div',undefined,'row');banner.append(tools);
    const retry=button('重试同步',async()=>{capture();if(!controller.status().ready){if(!cloud?.database)await initCloud();else{await controller.load();applySnapshot()}}if(!controller.status().blocked)await flush()});retry.id='promptHistoryRetry';
    const compare=button('查看云新版 / 比较草稿',()=>openModal(true));
    const adopt=button('显式载入云版',async()=>{if(isRunning||runWaiting||comparisonRunWaiting||mutating)return;capture();mutating=true;controls();try{if(await controller.adoptCloud(window.confirm.bind(window)))applySnapshot()}finally{mutating=false;refreshStatus()}});adopt.id='promptHistoryAdopt';
    const publish=button('以我的草稿新建版本',async()=>{if(isRunning||runWaiting||comparisonRunWaiting||mutating)return;capture();mutating=true;controls();try{await controller.publishDraft(window.confirm.bind(window));applySnapshot()}finally{mutating=false;refreshStatus()}});publish.id='promptHistoryPublish';
    tools.append(retry,compare,adopt,publish,button('导出草稿备份',()=>{capture();exportJSON(controller.exportBackup(),'提示词草稿备份.json')}));$('runReadiness').after(banner);
    const modal=element('div',undefined,'modal');modal.id='promptHistoryModal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','promptHistoryTitle');
    const card=element('div',undefined,'modal-card prompt-history-card'),head=element('div',undefined,'modal-head'),title=element('b','提示词历史 · 共享完整快照');title.id='promptHistoryTitle';const close=button('关闭',closeModal);close.id='promptHistoryClose';head.append(title,button('比较云新版与草稿',showComparison),close);card.append(head);
    const settings=element('div',undefined,'prompt-history-settings');for(const [id,label,max] of [['promptHistoryEditor','匿名署名（未验证）',120],['promptHistoryNote','下一版本备注',2000]]){const l=element('label',label),input=element('input');input.id=id;input.maxLength=max;input.value=id==='promptHistoryEditor'?controller.status().editor:controller.status().note;input.oninput=()=>controller.metadata({editor:$('promptHistoryEditor').value,note:$('promptHistoryNote').value});l.append(input);if(max===2000)l.className='prompt-history-note';settings.append(l)}card.append(settings);
    const layout=element('div',undefined,'prompt-history-layout'),sidebar=element('aside',undefined,'prompt-history-sidebar'),nav=element('div',undefined,'row');const prev=button('较新一页',async()=>{if(pageIndex>0){pageIndex--;await loadPage()}});prev.id='promptHistoryPrevious';const next=button('较旧一页',async()=>{if(rows.length===30){cursorStack[pageIndex+1]=rows.at(-1).revision;pageIndex++;await loadPage()}});next.id='promptHistoryNext';const pageText=element('p',undefined,'small muted');pageText.id='promptHistoryPageText';const list=element('div');list.id='promptHistoryList';nav.append(prev,next,button('刷新列表',()=>loadPage(true)));sidebar.append(nav,pageText,list);const detail=element('div',undefined,'prompt-history-detail');detail.id='promptHistoryDetail';layout.append(sidebar,detail);card.append(layout);modal.append(card);document.body.append(modal);
    modal.onclick=e=>{if(e.target===modal)closeModal()};document.addEventListener('keydown',e=>{if(!modal.classList.contains('show'))return;if(e.key==='Escape'){e.preventDefault();closeModal()}if(e.key==='Tab'){const nodes=[...modal.querySelectorAll('button,input,select,summary,[tabindex]')].filter(el=>!el.disabled&&!el.hidden&&el.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(!modal.contains(document.activeElement)){e.preventDefault();first?.focus()}else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}});
    $('promptHistoryBtn').onclick=()=>openModal();
  }
  function init(){
    if(initialized)return;initialized=true;
    const known=(step,value)=>value===promptHistoryOriginalDefaults[step]||step==='step2'&&PREVIOUS_STEP2_DEFAULTS.has(value)||step==='step5'&&PREVIOUS_STEP5_DEFAULTS.has(value)||step==='integration'&&value===PREVIOUS_INTEGRATION_DEFAULT;
    controller=createController({storage:localStorage,sessionStorage:sessionStorage,key:STORE,getDatabase:()=>cloud?.database,uuid:()=>crypto.randomUUID(),localSnapshot:snapshot(),defaults:DEFAULT_PROMPTS,isKnownDefault:known,legacyRaw:promptHistoryLegacyRaw,allowAutoLoad:()=>!uiReady||!isRunning&&!runWaiting&&!mutating&&!comparisonRunWaiting&&!sharedPromptBinding?.dirty&&!['baselinePromptEditor','promptEditor','sharedPromptEditor'].includes(document.activeElement?.id),onChange:refreshStatus});
    const originalInit=initCloud,originalRender=renderPromptEditor,originalSync=syncPrompt,originalRun=runCurrent,originalRunning=setRunning,originalBlockers=runBlockers,originalAppInit=window.init,originalExport=exportResult;
    initCloud=async function(){try{await originalInit()}finally{await guard(async()=>{await controller.load();if(uiReady)applySnapshot()})}};
    syncPrompt=function(){if(uiReady)capture();else originalSync()};
    root.wikiPromptHistory.ensureSynced=async function(runControl){if(composition)throw problem('输入法组合输入尚未结束，请完成输入后再运行。','composing');checkWikiCancelled({runControl});await controller.flush();checkWikiCancelled({runControl});const s=controller.status();if(s.dirty||s.blocked||s.error)throw problem('提示词仍未同步，禁止运行。','40001');applySnapshot();return clone(s.snapshot)};
    renderPromptEditor=function(){if(uiReady&&captureComparisonConfig().mode==='models'&&sharedPromptBinding?.dirty)capture();originalRender();if(!uiReady)return;document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>{if(isRunning||runWaiting||comparisonRunWaiting||mutating)return;capture();guard(flush);state.promptKey=b.dataset.prompt;renderPromptEditor()});refreshStatus()};
    runBlockers=function(){const reasons=originalBlockers();if(uiReady){const s=controller.status();if(!s.ready||s.blocked||s.error)reasons.push(s.error||'提示词历史未就绪或存在未处理草稿选择');if(runWaiting)reasons.push('正在等待提示词同步，尚未调用模型')}return reasons};
    setRunning=function(running,label){originalRunning(running,label);controls()};
    runCurrent=async function(options={}){
      if(isRunning||runWaiting||mutating||comparisonRunWaiting&&!options.comparisonFrozen||options.runControl?.cancelled)return false;
      // 外层计时包装已在点击时 capture；后续只同步该草稿，不再读取可被强改的 DOM。
      if(!options.comparisonFrozen)capture();runWaiting=true;controls();updateRunReadiness();
      try{return await originalRun(options)}finally{runWaiting=false;controls();updateRunReadiness()}
    };
    exportResult=function(){capture();guard(flush);return originalExport()};
    window.init=function(){originalAppInit();buildUI();uiReady=true;applySnapshot();renderPromptEditor();wireEditor();refreshStatus();window.addEventListener('pagehide',()=>{capture();controller.persist()});window.addEventListener('beforeunload',e=>{capture();if(controller.status().dirty){e.preventDefault();e.returnValue=''}});window.addEventListener('storage',e=>{if(e.key===controller.status().keys.cloud){guard(async()=>{await controller.viewCloud();refreshStatus()});toast('另一标签页更新提示词；当前草稿不替换，请查看云新版。')}})};
  }
  root.wikiPromptHistory={init,getController:()=>controller,...API};
})(typeof window==='object'?window:globalThis);
