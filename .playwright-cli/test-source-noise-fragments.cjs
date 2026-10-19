'use strict';
// PDF 抽取常把页眉页脚留在正文里；水蓝蓝那页的页脚被挤到正文同一行，夹在名字与描述句之间，
// 导致跨它的 quote 无法逐字定位、实体被整条隔离。这里锁定片段级页眉页脚清除的口径：
// 周期性重复才判为 chrome，且必须在正文里片段级清除；标题、正文、聚集型重复、重复小标题都不能删。
const {chromium}=require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs=require('fs');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
const html=fs.readFileSync(root+'/wiki-demo-mvp/index.html','utf8');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new(require('vm').Script)(match[1]);
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.abort('blockedbyclient'));await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
 await page.route('https://wiki-mvp-lab.app-tencent.workbuddy.host/**',r=>{const path=new URL(r.request().url()).pathname;if(r.request().method()!=='GET')return r.abort('blockedbyclient');if(path.startsWith('/.cloud/'))return r.fulfill({contentType:'application/json',body:'{"data":[]}'});if(path==='/prompt-history.js')return r.fulfill({contentType:'application/javascript',body:''});for(const n of ['semantic-tags','pipeline','entity-images','file-manager'])if(path==='/'+n+'.js')return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(root+'/wiki-demo-mvp/'+n+'.js','utf8')});return r.fulfill({contentType:'text/html',body:html.replace('<script>wikiPromptHistory.init();init();</script>','<script>initCloud=async()=>{};init();</script>')})});
 await page.goto('https://wiki-mvp-lab.app-tencent.workbuddy.host/');
 const report=await page.evaluate(()=>{
  const tests=[],ok=(test,pass,details)=>tests.push({test,pass:!!pass,details});
  const HEADER='2026/10/19 14:08 【开荒必看】《洛克王国：世界》保姆级新手入门攻略 - 洛克王国：世界游戏攻略 - TapTap 洛克王国：世界论坛';
  const FOOTER='599 1194 20';
  const URL='https://www.taptap.cn/moment/786338894562987753';
  const TITLE='【开荒必看】《洛克王国：世界》保姆级新手入门攻略';
  // 第 3 页（index 2）页脚被挤到正文同一行，正是水蓝蓝出问题的形态
  // 每页正文量按真实攻略比例构造（真实文档清洗后约占 58%，安全阀要求 ≥40%）
  const P=[
   TITLE+'\n修改于 03/27 2.8 万浏览 游戏攻略\n一、 开局定乾坤：御三家该怎么选？\n进入游戏后，第一件大事就是选择你的初始伙伴。这次三只精灵给的都是满资质的，非常良心，未被选择的另外两只后续可以去好友的世界里捕捉，所以不用太纠结了。下面把三只精灵的定位、优势与适配人群逐个拆开讲清楚，方便你按自己的玩法习惯做决定。',
   '为了让大家更直观，我做了一个简单的对比：\n【火花】「火系」\n高爆发输出，前期克制大量草系精灵，清图效率极高，被动增伤机制优秀 。 追求效率的PVE开荒党、新手首选。火系在开荒期的优势在于清图速度，配合被动增伤可以在前期把等级优势滚起来，缺点是对水系副本乏力。',
   '【水蓝蓝】「水系」 599 1194 20',
   '技能能耗低，续航能力强，防御和特攻成长优秀，后期在PVP中表现不俗 。 喜欢稳健战术、有PVP意向的玩家。水系在持久战里的价值非常高，技能循环短，配合回复类精灵可以长期站场，缺点是前期爆发不足，清图速度慢于火系。',
   '【喵喵】「草系」\n自带回血，坦度高，容错率极高，公测版本得到加强，非常适合消耗战 。 情怀党、操作不太熟练的萌新。草系的优势是几乎不会翻车，自带回血让你在开荒期省下大量回复道具，缺点是输出节奏偏慢，需要耐心。',
   '一句话总结：纯新手无脑选火花，开荒体验最顺滑！如果你想打PVP就选水蓝蓝，如果你只是想轻松体验剧情就选喵喵。三只精灵后期都能通过好友世界补齐，所以第一次选择完全不需要纠结太久。'
  ];
  let src='';
  for(let i=0;i<P.length;i++){
   if(i)src+=URL+' '+i+'/17 ';
   src+=P[i]+'\n';
   if(i!==2)src+=FOOTER+'\n';
   src+=HEADER+'\n';
  }
  src+=URL+' '+P.length+'/17 ';
  const samples=[];
  const clean=wikiCleanSourceNoise(src,samples);
  const locates=quote=>!!alignQuoteToSource(quote,clean);

  // 1. 核心：名字与描述句之间的页眉页脚清掉后，跨它们的 quote 可以逐字定位
  ok('水蓝蓝：跨页眉页脚的 quote 可定位',locates('【水蓝蓝】「水系」技能能耗低，续航能力强，防御和特攻成长优秀'),clean.slice(clean.indexOf('【水蓝蓝】'),clean.indexOf('【水蓝蓝】')+40));
  // 2. 原本就能定位的不能被动坏
  ok('火花：quote 仍可定位',locates('【火花】「火系」高爆发输出，前期克制大量草系精灵'));
  ok('喵喵：quote 仍可定位',locates('【喵喵】「草系」自带回血，坦度高'));
  // 3. 三类 chrome 全部清除
  ok('页脚计数行已清除',!clean.includes(FOOTER),clean.slice(0,60));
  ok('页眉行已清除',!clean.includes(HEADER));
  ok('URL+页码已清除',!clean.includes(URL)&&!/\d+\/17/.test(clean));
  // 4. 不得误删正文
  ok('标题保留',clean.includes(TITLE));
  ok('正文关键句保留',clean.includes('防御和特攻成长优秀')&&clean.includes('一句话总结：纯新手无脑选火花'));
  ok('章节小标题保留',clean.includes('一、 开局定乾坤：御三家该怎么选？'));
  // 5. 回传的是去重样本，供界面展示"删了什么"
  ok('回传去重样本',samples.includes(FOOTER)&&samples.includes(HEADER),samples);
  ok('样本长度受控',samples.every(s=>typeof s==='string'&&s.length>=6),samples.map(s=>s.length));
  // 6. 排版：不留行尾空格、不留三连空行
  ok('无行尾空格',!/[ \t]\n/.test(clean));
  ok('无三连空行',!/\n{3,}/.test(clean));

  // 7. 干净文档（没有周期性重复）必须原样返回
  const plainDoc='# 标题\n\n第一段讲机制。\n\n第二段讲配装。\n\n第三段讲节奏。';
  const plainSamples=[];
  ok('无重复片段的文档原样返回',wikiCleanSourceNoise(plainDoc,plainSamples)===plainDoc.trim(),wikiCleanSourceNoise(plainDoc));
  ok('干净文档不回传样本',plainSamples.length===0,plainSamples);

  // 8. 重复但聚集在一段的正文行不能删（不是页眉页脚）
  const clustered=['重复提示：先看这里','重复提示：先看这里','重复提示：先看这里'];
  for(let i=0;i<30;i++)clustered.push('正文第'+i+'行讲具体内容。');
  ok('聚集型重复不删',wikiCleanSourceNoise(clustered.join('\n')).includes('重复提示：先看这里'));

  // 9. 反复出现的正文短句（无页码/时间戳/URL）是内容，不能当成页眉删掉
  const tip=[];
  for(let i=0;i<12;i++)tip.push('正文段落'+i+'讲具体内容。','小技巧：优先开古币机，零氪党必看。');
  ok('重复的正文提示句不删',wikiCleanSourceNoise(tip.join('\n')).includes('小技巧：优先开古币机'));
  // 10. 重复出现的小标题是结构不是 chrome，删了会毁掉章节骨架
  const headings=[];
  for(let i=0;i<3;i++)headings.push('一、前言','正文段落'+i+'讲具体内容。','正文段落'+i+'的第二行。');
  ok('重复小标题不删',wikiCleanSourceNoise(headings.join('\n')).includes('一、前言'));

  // 10. 安全阀：chrome 占比过高时判定检测器失手，整体回退为原文
  const heavy=[];
  for(let i=0;i<12;i++)heavy.push('正文'+i,HEADER,FOOTER);
  ok('清除超过 60% 时回退原文',wikiCleanSourceNoise(heavy.join('\n'))===heavy.join('\n').trim());
  return tests;
 });
 const passed=report.filter(t=>t.pass).length;
 fs.writeFileSync(root+'/outputs/wiki-source-noise-fragments-tests.json',JSON.stringify({kind:'mock-browser-regression-not-real-model',passed,failed:report.length-passed,total:report.length,tests:report,pageErrors:errors,modelAttempts:0},null,2));
 console.log('scenarios '+report.length+' passed '+passed+' failed '+(report.length-passed));
 for(const t of report)if(!t.pass)console.error('FAILED '+t.test+' '+JSON.stringify(t.details));
 if(errors.length)console.error('PAGEERROR',errors.join('\n'));
 if(passed!==report.length)process.exitCode=1;
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
