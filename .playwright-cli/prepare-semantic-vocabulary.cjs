'use strict';
const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25',base='https://wiki-mvp-lab.app-tencent.workbuddy.host/';
const additions=[
['ET-PROD-GAME','产品与作品','游戏产品','可独立识别的具名游戏作品或产品。','燕云十六声、王者荣耀、巫师3','不是话题；版本、IP、玩法模式和开发项目不等于游戏作品。','只有描述游戏本身且有实质证据时建实体，不因标题自动建。','active','游戏;游戏作品;电子游戏;游戏产品'],
['ET-PROD-IP','产品与作品','IP／系列','具有共同世界观或品牌身份的具名作品系列、知识产权作品集合。','具名游戏系列、跨媒介IP','单部游戏用游戏产品；虚构组织不是IP。','需有明确系列或IP身份；不能因同文档出现自动认定同源。','active','IP系列;作品系列;游戏系列'],
['ET-CONTENT-CLASS','玩法内容','职业／角色类别','具有明确能力、定位或成长配置的游戏职业、角色类别。','具名职业、战斗职业类别','具体角色用可玩角色/NPC；门派组织用组织；职能职责用角色／职责。','类别须有稳定称谓和实质规则，不能将所有人物泛称实体化。','active','游戏职业;角色职业;职业类别'],
['ET-CONTENT-BUILD','玩法内容','配装／构筑','可稳定指代且可复用的装备、技能或天赋组合配置。','具名流派构筑、明确配装方案','单件装备或技能用对应类型；只有临时建议而无完整组合不建实体。','证据须支持组合成员或配置用途；不从若干共现物品拼造构筑。','active','配装;构筑;Build;角色构筑'],
['ET-CONTENT-STATUS','玩法内容','状态／效果','可施加、持续或解除且有稳定规则的游戏状态或效果。','中毒、眩晕、具名增益和减益','状态转移规则用状态机制；效果表现资产用特效资产；技能本体用技能。','需有状态/效果身份及作用证据，具体状态不泛填机制。','active','状态效果;Buff;Debuff;增益效果;减益效果;Gameplay Effect'],
['ET-CONTENT-ATTRIBUTE','玩法内容','游戏属性','具有稳定定义、影响计算或表现的游戏数值属性。','生命值、内力、攻击力、韧性','孤立数值不建实体；可持有交易资源用资源／货币；研发统计用指标。','只有属性定义/用途有实质证据时准入，不将每个数字建实体。','active','属性;角色属性;战斗属性;Gameplay Attribute'],
['ET-CONTENT-INTERACTABLE','玩法内容','交互物／机关','具名或有稳定种类定义、可操作并触发玩法行为的环境对象。','机关、可交互设施、开关','可携带物用道具；关注空间位置的点位用POI；交互规则用交互机制。','依据对象本体而非位置分类，须有交互功能证据。','active','交互物;机关;交互机关;可交互设施'],
['ET-CONTENT-PUZZLE','玩法内容','谜题／挑战','具有明确目标、条件和解法的可复用谜题或独立挑战内容。','具名机关谜题、独立解谜挑战','承载任务流程用任务；大型活动用活动；具体机关用交互物／机关。','必须有稳定称谓及实质目标/规则，不从标题制造挑战。','active','谜题;解谜挑战;机关谜题'],
['ET-CONTENT-MODE','玩法内容','玩法模式','具有明确参与形式、规则与胜负/完成条件的具名游戏模式。','具名竞技模式、合作模式、生存模式','游戏产品不是模式；具体机制用机制类型；场景副本按空间身份分类。','须有模式整体身份与规则证据。','active','游戏模式;对战模式;玩法模式'],
['ET-MECH-MOVEMENT','机制','移动机制','控制移动、位移、攀爬或运动状态的明确玩法规则。','轻功位移规则、攀爬规则','具体轻功招式用技能；系统集合用相应系统；动画资产不属于机制。','分类的是规则，不因名称含轻功自动赋值。','active','位移机制;运动机制;攀爬机制'],
['ET-MECH-EXPLORATION','机制','探索机制','控制发现、探索进度、区域揭示或探索互动的明确规则。','发现规则、区域探索进度规则','具体地点/POI用空间类型；奖励规则用奖励／惩罚机制。','需有探索规则证据，不把攻略章节当实体。','active','发现机制;探索规则'],
['ET-MECH-CRAFTING','机制','制作／合成机制','材料、配方、成功条件及产出转换的玩法规则。','锻造规则、合成规则、烹饪规则','完整系统用制作／合成系统；材料用资源／货币或道具。','规则层优先本类型，不能推断未明确的配方产出关系。','active','合成机制;制作机制;锻造机制'],
['ET-MECH-STEALTH','机制','潜行机制','侦测、隐蔽、警觉和潜行行为的明确玩法规则。','警觉值判定规则、隐蔽条件','具体潜行技能用技能；敌人行为整体用AI行为规则。','须有潜行/侦测规则本体证据。','active','隐蔽机制;潜行规则'],
['ET-SYS-SKILL','系统','技能／武学系统','组织技能的学习、配置、升级或施放管理的具名玩法系统。','具名技能系统、武学系统','单个招式/法术用技能；技术框架或组件用引擎／模块；状态用状态／效果。','依据系统整体职责选择，不从包含技能自动推定系统。','active','技能系统;武学系统;能力系统'],
['ET-SYS-CRAFTING','系统','制作／合成系统','统一管理配方、材料、制作过程和产出的具名玩法系统。','锻造系统、烹饪系统','单条转换规则用制作／合成机制；工具链制作流程用工作流／流水线。','有系统整体职责才赋值。','active','制作系统;合成系统;锻造系统;烹饪系统'],
['ET-SYS-TRADING','系统','交易系统','管理买卖、拍卖、交易撮合或商品流通的具名玩法系统。','拍卖行系统、玩家交易系统','完整资源经济用经济系统；交易手续费规则用经济机制。','明确交易职责且有来源支持。','active','拍卖系统;买卖系统'],
['ET-SYS-HOUSING','系统','家园／建造系统','管理玩家家园、设施建造、布局与建设进度的具名玩法系统。','家园系统、建设系统','空间场景用关卡／场景；资产生产工具用开发工具。','不将某栋建筑名称直接归系统。','active','家园系统;建造系统'],
['ET-SYS-MATCHMAKING','系统','匹配系统','按条件组织玩家进入对局或队伍的具名玩法系统。','排位匹配系统、组队匹配系统','网络基础设施用引擎／模块；公会组织用团队／公会。','需有匹配职责或规则证据。','active','对局匹配系统;组队匹配系统'],
['ET-SYS-SAVE','系统','存档系统','保存、恢复或管理玩家游戏进度的具名功能系统。','具名存读档系统','单个存档文件或数据格式用数据格式／协议；产品发布节点不属存档。','需描述存档功能整体，不把备份文件自动建实体。','active','存读档系统;游戏存档系统'],
['ET-SYS-TUTORIAL','系统','教学／引导系统','协调新手教学、操作引导及渐进提示的具名玩法系统。','新手引导系统、教学系统','具体教学任务用任务；提示资产用UI资产；攻略文章不是系统。','有系统职责与机制证据，不凭新手攻略标题赋值。','active','教学系统;引导系统;新手引导系统'],
['ET-SYS-ACHIEVEMENT','系统','成就系统','统一管理成就目标、进度和解锁的具名玩法系统。','成就管理系统','单个成就用成就；奖励算法用奖励／惩罚机制。','系统与其中具体成就分开建模。','active','成就管理系统'],
['ET-ART-MODEL','美术资产','模型资产','可稳定指代的三维模型资产或可复用模型资源。','具名角色模型、道具模型','角色身份不是模型；模型制作要求用对应美术规范。','只有资产本身具有稳定身份与证据时建实体。','active','三维模型;3D模型;美术模型'],
['ET-ART-TEXTURE','美术资产','贴图资产','可稳定指代的纹理或贴图资源。','具名纹理、贴图资源','材质着色规则用材质资产；制作规范用资产制作规范。','必须是资产身份，不把泛称贴图或单个像素建实体。','active','纹理资产;Texture'],
['ET-ART-MATERIAL','美术资产','材质资产','可稳定指代的材质配置与表面表现资源。','具名角色材质、环境材质','技术着色算法方案用技术方案；贴图本体用贴图资产。','有材质资源身份和表现/配置证据。','active','美术材质;Material'],
['ET-ART-ANIMATION','美术资产','动画资产','可稳定指代的动作动画、动画片段或动画资源。','具名攻击动画、动作片段','动画制作标准用动画规范；技能身份不是动画。','不把动词本身建资产，需明确资源身份。','active','动作动画;动画片段;动画资源'],
['ET-ART-EFFECT','美术资产','特效资产','可稳定指代的视觉特效资源。','具名技能特效、粒子效果资产','增益/减益用状态／效果；特效制作要求用特效规范。','按视觉资源身份赋值，不能与Gameplay效果混淆。','active','视觉特效资产;粒子特效资产;VFX资产'],
['ET-ART-UI-ASSET','美术资产','UI 资产','可稳定指代的界面视觉资源或界面组件资产。','具名图标资源、界面组件资产','整体界面交互用UI系统；视觉规则用UI视觉规范。','有资产身份和复用内容，不把截图文件自动建实体。','active','界面资产;UI资源;界面视觉资产'],
['ET-AUDIO-MUSIC-ASSET','音频资产','音乐资产','可稳定指代的音乐曲目或背景音乐资源。','具名BGM曲目','风格要求用音乐风格规范；播放与混音规则不是曲目。','有作品/资源身份和实质证据。','active','BGM资产;背景音乐资产;音乐曲目'],
['ET-AUDIO-SFX-ASSET','音频资产','音效资产','可稳定指代的非语言音效资源。','具名脚步音效、技能音效资源','音效制作要求用音效规范；语音台词用语音资产。','按资源身份赋值，不从泛称声音自动建实体。','active','声音效果资产;SFX资产;音效资源'],
['ET-AUDIO-VOICE-ASSET','音频资产','语音资产','可稳定指代的语音录音、台词音频或语音资源。','具名角色语音资源','角色身份不是语音；语音制作要求用语音规范。','具备稳定资源称谓与实质证据。','active','对白音频;台词音频;配音资产']
];
const aliases={
'ET-CHAR-PLAYABLE':'玩家角色;可操控角色','ET-CHAR-NPC':'非玩家角色;非玩家人物','ET-CHAR-ENEMY':'敌人/怪物;普通怪物;敌对单位','ET-ITEM-WEAPON':'兵器','ET-ITEM-EQUIPMENT':'穿戴装备','ET-ITEM-CONSUMABLE':'消耗道具','ET-ITEM-RESOURCE':'资源/货币;游戏资源;游戏货币','ET-ORG-ORG':'门派组织;游戏组织','ET-ORG-GUILD':'团队/公会;公会组织','ET-SPACE-WORLD':'世界/区域','ET-SPACE-LEVEL':'关卡/场景;游戏关卡','ET-SPACE-POI':'兴趣点;探索点位','ET-CONTENT-QUEST':'游戏任务;任务内容','ET-CONTENT-SKILL':'武学技能;招式;法术技能;Gameplay Ability','ET-CONTENT-ACHIEVEMENT':'游戏成就','ET-MECH-STATE':'状态规则;状态转换机制','ET-MECH-SPAWN':'生成/掉落机制;掉落机制','ET-MECH-REWARD':'奖励/惩罚机制','ET-MECH-AI':'AI行为规则;人工智能行为规则','ET-SYS-INVENTORY':'装备/背包系统;背包系统;库存系统','ET-SYS-AI':'AI系统;人工智能系统','ET-SYS-UI':'UI系统;界面系统','ET-TECH-MODULE':'引擎/模块;技术模块;游戏引擎','ET-TECH-PROTOCOL':'数据格式/协议','ET-TECH-PIPELINE':'工作流/流水线;技术流水线','ET-TECH-BUILD':'构建/打包方案','ET-TECH-PERF':'性能/兼容方案','ET-TECH-MONITOR':'监控/诊断方案','ET-PROD-DEMO':'原型/Demo;游戏原型'
};
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
const page=await browser.newPage(),errors=[],blocked=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const q=route.request(),u=new URL(q.url());if(q.url().includes('/.cloud/')&&!['GET','HEAD','OPTIONS'].includes(q.method())){blocked.push(q.method());return route.abort()}if(u.origin===new URL(base).origin){const file=u.pathname==='/'?'index.html':u.pathname.slice(1);if(['index.html','semantic-tags.js','pipeline.js','file-manager.js'].includes(file))return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':'text/html',body:fs.readFileSync(root+'/wiki-demo-mvp/'+file,'utf8')})}return route.continue()});
await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>workbookReady&&availableModels.length>0,null,{timeout:60000});
const before=await page.evaluate(()=>({id:workbookRowId,revision:workbookRevision,workbook:structuredClone(savedWorkbook)}));assert.equal(before.id,1);assert.equal(before.revision,2);assert.equal(before.workbook.sheets.length,4);
fs.writeFileSync(root+'/outputs/wiki-shared-workbook-before-semantic.json',JSON.stringify(before,null,2));
const workbook=structuredClone(before.workbook),types=workbook.sheets[0];types.rows.forEach(r=>{while(r.length<9)r.push('')});types.rows[3][8]='同义名称';types.rows.push(...additions);types.rows[1][0]=`共 ${types.rows.slice(4).length} 个正式类型。每个Entity单选最具体类型；主类型ID优先，标准名和唯一同义名称可归一。分面维度固定、语义取值开放。`;
for(const row of types.rows.slice(4))if(aliases[row[0]])row[8]=[row[8],aliases[row[0]]].filter(Boolean).join(';');
const facets=workbook.sheets[1];facets.rows[1][0]='测试台固定产品、专业、版本三维度，取值由LLM依据原文识别，不要求命中枚举或主数据；其余分面保留为扩展参考，未自动启用。';
for(const row of facets.rows.slice(4)){
if(row[0]==='FAC-PROJECT')row.splice(1,7,'所属／适用产品','product[].value','开放语义文本','可多选','原文明示及当前实体级逐字关联证据','语义筛选、范围理解；不授予权限或自动创建主数据','无依据留空；旧值标记未验证，不增加人工复核');
if(/^FAC-DISC-/.test(row[0])){row[1]='相关研发专业';row[3]='开放语义文本（该值仅示例）';row[5]='原文明示或有逐字证据和理由的语义推断';row[7]='不限定这十个示例值；无依据留空，不增加人工复核';}
if(row[0]==='FAC-VERSION-ID')row.splice(1,7,'内容适用版本','version[].value','开放语义文本','可多选','原文明示及当前实体级适用证据','保留来源明确的版本条件；不猜测最新版本','无依据留空；不无条件继承文档版本，不增加人工复核');
if(/^FAC-LIFE-/.test(row[0])){row[5]='扩展参考；测试台未启用此审批状态机';row[7]='不为全部新话题/实体增加默认审批';}
if(/^FAC-TRUST-/.test(row[0]))row[5]='来源与验证元数据；非测试台统一人审门禁';
}
const rules=workbook.sheets[2];rules.rows[1][0]='主类型与Relation受控；产品/专业/版本固定维度、开放语义取值；candidate_tags只作补充描述。测试台仅缺失/无效主类型进入复核，其余异常由程序诊断和门禁处理。';
const updates={
'GOV-001':['话题与标签','话题按具体问题语义生成；主类型与关系只选active词表；分面取值开放。','维度固定，禁止将话题名称直接当主类型或由模型创建正式类型。','话题服务阅读，类型与分面服务筛选，不恢复统一人工审批。'],
'GOV-002':['实体主类型','每个Entity单选最具体active ET-*主类型；ID优先，标准名或唯一别名可安全归一。','无效ID、标签/ID冲突或多义别名拒绝；缺类型不得从名称或锚点强填。','仅主类型缺失/无效进入类型复核；全文整合可依据已定位成员证据重新选择。'],
'GOV-004':['禁用宽泛类型','对象、其他、系统等宽泛类别不得作为正式主类型兜底。','选择当前active具体类型；不得为提高命中率虚填。','类型无法判断时复核，保留原建议和原因。'],
'GOV-005':['业务分面','所属／适用产品、相关研发专业、内容适用版本不混入主类型。','facets固定product/discipline/version；每值记录value、basis、quote、reason。','跨维度AND，同维度OR；不因值不在示例词表而复核。'],
'GOV-008':['产品与版本语义','产品和版本仅原文明示，且逐字证据关联当前实体；专业可有依据推断。','产品/版本禁止猜测或文档全量继承；推断专业须quote与reason。','值可留空；只做语义筛选，不自动创建主数据，不用分面值授权。'],
'GOV-012':['实体别名与类型同义词','实体别名召回一对多；主类型第九列同义名称必须唯一等价归一。','不以实体名称或类型同义词代替身份消歧；active类型同义名称不得跨ID冲突。','维护标准名、稳定ID和边界；多义不自动赋值。'],
'GOV-013':['证据','类型选择有来源；新语义分面与Relation须可回溯逐字证据。','校验原文与偏移、实体级关联、引用、词表和端点；定位不等于语义已审核。','异常进入程序诊断或隔离；旧分面仅legacy未验证，不补造证据。']
};for(const row of rules.rows.slice(4))if(updates[row[0]])row.splice(1,4,...updates[row[0]]);
await page.evaluate(w=>{validateWorkbook(w);validateWorkbookEvolution(w,savedWorkbook)},workbook);assert.deepEqual(workbook.sheets[3],before.workbook.sheets[3]);assert.equal(types.rows.slice(4).length,104);
const report={revision:before.revision+1,addedTypes:additions.length,totalTypes:104,existingIdsPreserved:true,relationsUnchanged:true,aliases:types.rows.slice(4).filter(r=>r[8]).length,newTypes:additions.map(r=>({id:r[0],label:r[2]})),sources:['https://dev.epicgames.com/documentation/en-us/unreal-engine/gameplay-ability-system-for-unreal-engine','https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/GameplayAbilities'],sha256:crypto.createHash('sha256').update(JSON.stringify(workbook)).digest('hex')};
fs.writeFileSync(root+'/outputs/wiki-semantic-workbook-v3.json',JSON.stringify({id:1,revision:3,workbook,report},null,2));assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);console.log(JSON.stringify(report,null,2));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
