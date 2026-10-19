// 对照：在真实抽取文本上，新增的片段级清除到底删了什么
const fs=require('fs'),vm=require('vm');
const root='C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
const raw=JSON.parse(fs.readFileSync(root+'/.playwright-cli/tmp-live/pdf-text.json','utf8'));
const source=fs.readFileSync(root+'/wiki-demo-mvp/pipeline.js','utf8');
const block=source.slice(source.indexOf('// Site chrome'),source.indexOf('\n',source.indexOf('function wikiDocumentContext')));
const ctx={console,arr:v=>Array.isArray(v)?v:[],wikiHeadingLevel:()=>0,wikiUnique:(v)=>[...new Map(v.map(i=>[JSON.stringify(i),i])).values()]};
ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(block,ctx);ctx.arguments0='';
const {wikiCleanSourceNoise,wikiRepeatingNoiseSamples,wikiNoiseRanges}=ctx;
const base=wikiCleanSourceNoise(raw);
const samples=wikiRepeatingNoiseSamples(raw),ranges=wikiNoiseRanges(raw,samples);
console.log('原文',raw.length,'→ 旧口径',base.length,'→ 新口径',wikiCleanSourceNoise(raw).length);
console.log('样本 '+samples.size+' 种：');
for(const s of samples)console.log('  '+JSON.stringify(s.slice(0,110)));
console.log('\n区间 '+ranges.length+' 段，逐段内容：');
const seen=new Set();
for(const [a,b] of ranges){
  const t=raw.slice(a,b).replace(/\d+/g,'#');
  if(seen.has(t))continue;seen.add(t);
  console.log('  ['+a+','+b+'] '+JSON.stringify(raw.slice(a,b).slice(0,110)));
}
