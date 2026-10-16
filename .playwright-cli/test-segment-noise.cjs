'use strict';
const fs = require('node:fs'), vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const PY = 'C:/Users/louisxzlu/.workbuddy/binaries/python/envs/default/Scripts/python.exe';
const PDF = 'C:/Users/louisxzlu/Downloads/游戏攻略--测试集/《燕云十六声》最新版本攻略：从入门到精通的完整指南 - 知乎.pdf';
const py = `
from pypdf import PdfReader
import json
r=PdfReader(r"${PDF}")
t="\\n".join((p.extract_text() or "") for p in r.pages)
print(json.dumps(t))
`;
const raw = JSON.parse(fs.readFileSync('.playwright-cli/tmp-live/pdf-text.json','utf8'));
// Extract just the self-contained noise/segmentation block; the full file needs browser globals.
const source = fs.readFileSync('wiki-demo-mvp/pipeline.js','utf8');
const from = source.indexOf('// Site chrome');
const marker = 'function wikiDocumentContext';
const to = source.indexOf('\n', source.indexOf(marker));
if (from < 0 || to < 0) throw Error('未找到分片代码块');
const block = source.slice(from, to);
const ctx = {console, arr:v=>Array.isArray(v)?v:[]};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(block, ctx);
ctx.arguments0 = '';
const {wikiCleanSourceNoise, splitSourceForModel, wikiSectionBlocks, wikiDocumentContext} = ctx;

const clean = wikiCleanSourceNoise(raw);
const noiseLines = clean.split('\n').filter(l=>/登录即可查看|推荐阅读|大家都在搜|切换模|zhuanlan\.zhihu\.com|超 5 千万/.test(l));
console.log('原始字符', raw.length, '清洗后', clean.length, '去除', raw.length-clean.length, '('+((raw.length-clean.length)/raw.length*100).toFixed(1)+'%)');
console.log('残留噪声行', noiseLines.length, JSON.stringify(noiseLines.slice(0,3)));
console.log('正文保留检查(关键句):', ['八大核心系统详解','10步开荒','破竹·樽','江湖弈','庄客','照影庙','杭州西境'].filter(k=>clean.includes(k)).length + '/7');

ctx.arguments0 = clean;
const dbg = vm.runInContext('(()=>{const lines=arguments0.split("\\n");const out=[];for(let i=0;i<lines.length;i++){const l=wikiHeadingLevel(lines[i]);if(l)out.push(l+" :: "+lines[i].trim().slice(0,30))}return out})()', ctx);
console.log('\n识别到的标题行数', dbg.length);
for (const d of dbg.slice(0,8)) console.log('  ', d);
const anchorDbg = vm.runInContext('(()=>{const lines=arguments0.split("\\n"),offsets=[];let c=0;for(const l of lines){offsets.push(c);c+=l.length+1}const out=[],stack=[];for(let i=0;i<lines.length;i++){const lv=wikiHeadingLevel(lines[i]);if(!lv)continue;while(stack.length&&stack[stack.length-1].level>=lv)stack.pop();stack.push({level:lv,title:lines[i].trim()});out.push({start:offsets[i],path:stack.map(s=>s.title).join(" > ")})}return out})()', ctx);
console.log('\nanchors', anchorDbg.length, JSON.stringify(anchorDbg.slice(0,6).map(a=>a.start+':'+a.path)));
console.log('anchors 全部 start', JSON.stringify(anchorDbg.map(a=>a.start)));

const blocks = wikiSectionBlocks(clean);
console.log('\n章节块', blocks.length);
console.log('块路径序列', JSON.stringify(blocks.map(b => (b.path ? b.path : '(导言)') + '[' + (b.end-b.start) + ']')));

const parts = splitSourceForModel(clean);
console.log('\n分片数', parts.length);
for (const p of parts) console.log('  #'+p.index, p.start+'-'+p.end, 'len'+(p.end-p.start), 'core',p.coreStart+'-'+p.coreEnd, 'path='+JSON.stringify((p.sectionPath||'').slice(0,40)));

// 契约校验：每段 text 必须可由 start 还原；core 区间必须首尾相接覆盖全文
let ok = true, cursor = 0;
for (const p of parts) {
  if (clean.slice(p.start, p.start + p.text.length) !== p.text) { ok = false; console.log('FAIL 切片不可还原 #' + p.index); }
  if (p.coreStart !== cursor) { ok = false; console.log('FAIL core 不连续 #' + p.index, p.coreStart, cursor); }
  cursor = p.coreEnd;
}
if (cursor !== clean.length) { ok = false; console.log('FAIL core 未覆盖全文', cursor, clean.length); }
console.log('\n契约校验', ok ? 'PASS' : 'FAIL');
console.log('documentContext.sections', wikiDocumentContext(clean,'x.pdf').sections.length);

// 长文场景：合成一篇 30000 字符的多章节文档，确认不切断章节
const chapter = n => `\n第${n}章 章节标题${n}\n` + `本节内容${n}。` .repeat(120) + '\n';
let long = '';
for (let n = 1; n <= 24; n++) long += chapter(n);
long = long.slice(0, 30000);
const longParts = splitSourceForModel(long);
console.log('\n长文', long.length, '字符 ->', longParts.length, '段');
let longOk = true, c = 0;
for (const p of longParts) { if (long.slice(p.start, p.start+p.text.length) !== p.text) longOk = false; if (p.coreStart !== c) longOk = false; c = p.coreEnd; }
if (c !== long.length) longOk = false;
console.log('长文契约', longOk ? 'PASS' : 'FAIL', '段长', longParts.map(p=>p.end-p.start).join(','));
console.log('长文每段章节路径', JSON.stringify(longParts.map(p=>(p.sectionPath||'').split(' / ').length)));
