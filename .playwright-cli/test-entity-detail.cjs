const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25',base='https://wiki-mvp-lab.app-tencent.workbuddy.host/',mode=process.argv[2]||'local';
const html=fs.readFileSync(root+'/wiki-demo-mvp/index.html','utf8');
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],blocked=[],tests=[];
  const ok=(test,pass)=>{tests.push({test,pass:!!pass});if(!pass)throw Error(test)};
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{const q=r.request();if(q.url().includes('/.cloud/')&&!['GET','HEAD','OPTIONS'].includes(q.method())){blocked.push(q.url());return r.abort()}return mode==='local'?r.abort('blockedbyclient'):r.continue()});
  if(mode==='local'){
    await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
    await page.route(base+'**',r=>{const p=new URL(r.request().url()).pathname;if(r.request().method()!=='GET')return r.abort('blockedbyclient');if(p.startsWith('/.cloud/'))return p.startsWith('/.cloud/llm/')?r.abort('blockedbyclient'):r.fulfill({contentType:'application/json',body:'{"data":[]}'});/* 仅隔离旧逻辑回归，不代表全应用；新模块仍请求加载但返回空脚本。 */if(p==='/prompt-history.js')return r.fulfill({contentType:'application/javascript',body:''});if(['/semantic-tags.js','/pipeline.js','/file-manager.js'].includes(p))return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp'+p,'utf8')});return r.fulfill({contentType:'text/html',body:html.replace('<script>wikiPromptHistory.init();init();</script>','<script>initCloud=async()=>{};init();</script>')})});
  }
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const report={mode,tests};
  if(mode!=='local'){
    await page.waitForFunction(()=>workbookReady&&availableModels.length>0,null,{timeout:45000});
    const workbook=await page.evaluate(()=>({revision:workbookRevision,data:savedWorkbook,types:controlledTypes().length}));
    report.workbook={revision:workbook.revision,types:workbook.types,fingerprint:crypto.createHash('sha256').update(JSON.stringify(workbook.data)).digest('hex')};
    if(mode==='before'){fs.writeFileSync(root+'/outputs/wiki-entity-detail-before.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));return}
    const before=JSON.parse(fs.readFileSync(root+'/outputs/wiki-entity-detail-before.json','utf8'));
    ok('云端词表版本与内容保持不变',JSON.stringify(before.workbook)===JSON.stringify(report.workbook));
    report.assets=[];
    for(const name of ['index.html','pipeline.js','file-manager.js','游戏研发知识Wiki受控索引标签词表.xlsx']){
      const response=await page.request.get(base+encodeURIComponent(name)+'?detail=20261010');const body=await response.body();
      const same=response.ok()&&body.equals(fs.readFileSync(root+'/wiki-demo-mvp/'+name));report.assets.push({name,status:response.status(),same});ok('线上资产与本地一致 '+name,same);
    }
  }
  await page.evaluate(()=>{
    const topic={id:'test-topic',name:'巫师3怪物掉落与炼金材料获取',scope:'用于测试交互的示例话题',desc:'以下内容仅为布局测试数据',preview:true};
    const make=(id,name,summary)=>({id,name,summary,preview:true,primaryTopic:topic.id,topics:[topic.id],tags:{type:[]},suggestedFacets:{product:['巫师3'],discipline:[],version:[]},candidateTags:[],sources:[{file:'界面测试示例.txt',quote:summary}],facts:[summary],relations:[],reviewReasons:['UI_TEST_FIXTURE'],identityAnchors:{ontologyType:'测试对象',realityDomain:'虚构',productIpScope:'巫师3：狂猎'}});
    const resource=make('test-resource','绿宝石之尘','用于炼金与制作的材料。测试示例，不代表真实模型解析结果。');
    const enemy=make('test-enemy','妖灵','怪物实体；此处只用于验证关联实体介绍与跳转。');enemy.disambiguator='巫师3怪物类妖灵（wraith）';
    resource.relations=[{type:'由…掉落',targetId:enemy.id,targetName:enemy.name,strength:'strong',evidence:'示例证据：妖灵掉落绿宝石之尘。'},{type:'共现',targetId:'missing-id',targetName:'已不可用实体',strength:'weak',evidence:'示例共现证据。'}];
    enemy.relations=[{type:'掉落',targetId:resource.id,strength:'strong',evidence:'示例证据：妖灵掉落绿宝石之尘。'}];
    commitFileWorkspace([], [topic], [resource,enemy]);state.selectedEntity=resource.id;state.relatedDetailId=null;setPage('knowledge');
  });
  ok('相关实体首行是名称超链接',await page.locator('.relation').first().evaluate(el=>el.firstElementChild.tagName==='A'&&el.firstElementChild.textContent==='妖灵'));
  ok('关系和简介在实体链接之后',await page.locator('.relation').first().evaluate(el=>el.querySelector('.relation-summary').textContent.includes('怪物实体')&&el.querySelector('.relation-top').textContent.includes('由…掉落')&&el.querySelector('.relation-evidence').textContent.includes('示例证据')));
  ok('未解析目标没有伪造链接',await page.locator('.relation').nth(1).evaluate(el=>!el.querySelector('a')&&el.textContent.includes('暂不能跳转')));
  await page.locator('.relation').first().screenshot({path:root+'/outputs/知识Wiki相关实体-'+mode+'.png'});await page.evaluate(()=>document.getElementById('entityDetail').scrollTop=0);
  const bounds=await page.evaluate(()=>{const p=document.getElementById('entityDetail'),g=p.parentElement,b=p.getBoundingClientRect(),gb=g.getBoundingClientRect();return {width:b.width,rightGap:gb.right-b.right,height:b.height,viewport:innerHeight,grid:getComputedStyle(g).gridTemplateColumns,bodyWidth:p.firstElementChild.getBoundingClientRect().width}});
  report.desktopBounds=bounds;ok('1920宽屏详情铺满右侧栏',bounds.width>600&&bounds.rightGap<2&&Math.abs(bounds.width-bounds.bodyWidth)<20);ok('详情使用视口可用高度',bounds.height>850&&bounds.height<bounds.viewport);
  await page.locator('.browse-grid').screenshot({path:root+'/outputs/知识Wiki实体详情-'+mode+'-宽屏.png'});
  await page.locator('[data-jump="test-enemy"]').click();
  ok('鼠标点击跳到目标实体详情',await page.locator('.detail-title').textContent()==='妖灵');
  ok('跳转重置详情滚动并聚焦',await page.evaluate(()=>document.getElementById('entityDetail').scrollTop===0&&document.activeElement.id==='entityDetail'));
  await page.locator('[data-jump="test-resource"]').focus();await page.keyboard.press('Enter');ok('键盘Enter支持关联跳转',await page.locator('.detail-title').textContent()==='绿宝石之尘');
  await page.fill('#entitySearch','绿宝石之尘');await page.evaluate(()=>renderKnowledge());
  await page.evaluate(()=>{state.filters.type.add('不存在的类型');renderKnowledge();openRelatedEntity('test-resource')});
  const filterBefore=await page.evaluate(()=>knowledgeFilterKey());await page.locator('[data-jump="test-enemy"]').click();
  ok('目标被筛选隐藏仍能打开',await page.locator('.detail-title').textContent()==='妖灵');
  ok('关联跳转不清除筛选条件',await page.evaluate(()=>knowledgeFilterKey())===filterBefore);
  ok('跳转显示筛选外查看提示',await page.locator('.detail-filter-notice').isVisible());
  await page.locator('[data-return-filter]').click();ok('可返回原筛选结果',await page.evaluate(()=>state.relatedDetailId===null&&document.querySelector('#entityDetail .empty')!==null&&knowledgeFilterKey())===filterBefore);
  await page.evaluate(()=>{state.filters.type.clear();document.getElementById('entitySearch').value='';renderKnowledge();openRelatedEntity('test-enemy')});
  await page.locator('[data-entity="test-resource"]').click();ok('点击列表实体退出关联查看',await page.evaluate(()=>state.relatedDetailId===null&&state.selectedEntity==='test-resource'));
  await page.evaluate(()=>{state.filters.type.add('不存在');renderKnowledge();openRelatedEntity('test-resource')});await page.fill('#entitySearch','改变查询');await page.evaluate(()=>renderKnowledge());ok('改变筛选后不会锁死关联详情',await page.evaluate(()=>state.relatedDetailId===null));
  await page.evaluate(()=>{clearFilters();state.selectedEntity='test-resource';renderKnowledge()});
  const safe=await page.evaluate(()=>{const copy=structuredClone(state.previews[0]);copy.relations=[{targetId:'missing',targetName:'<img src=x onerror=alert(1)>',type:'<script>x</script>',strength:'weak',evidence:'<svg onload=alert(1)>'}];renderEntityDetail(copy);return !document.getElementById('entityDetail').querySelector('img,svg,script')});ok('名称关系和证据安全转义',safe);await page.evaluate(()=>renderKnowledge());
  await page.evaluate(()=>{location.hash='entity=test-enemy'});await page.waitForFunction(()=>state.selectedEntity==='test-enemy');ok('实体锚点链接可导航',await page.locator('.detail-title').textContent()==='妖灵');
  await page.reload();await page.waitForFunction(()=>state.selectedEntity==='test-enemy');ok('同浏览器刷新实体链接仍可定位',await page.locator('.detail-title').textContent()==='妖灵');
  await page.evaluate(()=>{history.replaceState(null,'',location.pathname);state.relatedDetailId=null;state.selectedEntity='test-resource';renderKnowledge()});
  report.responsive=[];
  for(const width of [1920,1440,1300,1280,1180,960,760,390]){
    await page.setViewportSize({width,height:1080});const metrics=await page.evaluate(()=>{const p=document.getElementById('entityDetail'),r=p.getBoundingClientRect(),g=p.parentElement.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,width:r.width,gridWidth:g.width,rightGap:g.right-r.right,innerOverflow:p.scrollWidth>p.clientWidth+1}});report.responsive.push({viewport:width,...metrics});ok(width+'宽度页面与详情均无横向溢出',!metrics.overflow&&!metrics.innerOverflow);if(width>=1300)ok(width+'详情填满右侧栏',metrics.rightGap<2&&metrics.width>350);else ok(width+'详情自适应为整行',Math.abs(metrics.width-metrics.gridWidth)<2);
  }
  await page.setViewportSize({width:1440,height:1080});await page.locator('.browse-grid').screenshot({path:root+'/outputs/知识Wiki实体详情-'+mode+'-1440.png'});
  report.pageErrors=errors;report.blockedCloudWrites=blocked.length;ok('浏览器无运行错误',errors.length===0);ok('没有调用模型或写云端词表',blocked.length===0);
  report.passed=tests.filter(t=>t.pass).length;report.total=tests.length;fs.writeFileSync(root+'/outputs/wiki-entity-detail-'+mode+'-tests.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
