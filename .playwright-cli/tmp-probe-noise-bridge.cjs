// 原型（只读，不改生产代码）：验证「噪声识别 + 定位时跳过」能否救回水蓝蓝
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, 'tmp-luoke-source.txt'), 'utf8');

// ---------- 线上现有实现（照抄，用于对照） ----------
function alignQuoteToSource(quote, source) {
  if (typeof quote !== 'string' || !quote.trim()) return null;
  if (source.includes(quote)) return { text: quote, aligned: false };
  const ignorable = /[\s\u00ad\u200b-\u200d\ufeff]/u;
  const chars = Array.from(quote).filter(char => !ignorable.test(char));
  if (chars.length < 8) return null;
  const text = chars.join('');
  const compact = [], positions = [];
  for (let i = 0; i < source.length;) {
    const char = String.fromCodePoint(source.codePointAt(i));
    if (!ignorable.test(char)) { compact.push(char); positions.push(i); }
    i += char.length;
  }
  const haystack = compact.join(''), first = haystack.indexOf(text);
  if (first < 0) return null;
  const start = Array.from(haystack.slice(0, first)).length;
  const end = start + chars.length - 1;
  const matched = source.slice(positions[start], positions[end] + compact[end].length);
  return matched && source.includes(matched) ? { text: matched, aligned: true } : null;
}

// ---------- 候选噪声识别器（原型） ----------
// 判据 1：周期性重复行 —— 页眉页脚的本质是"每隔一页原样重复一次"
function repeatedLines(text, minCount = 3, minLen = 4) {
  const lines = text.split('\n'), counter = new Map();
  lines.forEach((line, i) => {
    const raw = line.trim();
    if (raw.length < minLen) return;
    // 两遍统计：原样（抓"599 1194 20"这类完全相同的页脚）与数字归一（抓"… N/17"这类只差页码的页眉）
    for (const key of new Set([raw, raw.replace(/\d+/g, '#')])) {
      if (!counter.has(key)) counter.set(key, []);
      counter.get(key).push(i);
    }
  });
  const noiseLines = new Set(), samples = new Set();
  for (const [key, idxs] of counter) {
    const uniq = [...new Set(idxs)];
    if (uniq.length < minCount) continue;
    // 周期性：命中位置必须分散在文档前后，而不是挤在一段里
    if (uniq.at(-1) - uniq[0] < lines.length * 0.5) continue;
    uniq.forEach(i => noiseLines.add(i));
    if (key.length >= 6) samples.add(key);   // 升级为可片段级清除的"已知页眉页脚样本"
  }
  return { lines, noiseLines, samples };
}
// 判据 2：片段级正则 —— URL + 页码、时间戳页眉
const FRAGMENT_RULES = [
  /https?:\/\/\S+\s+\d{1,3}\/\d{1,3}/g,              // URL 紧跟 N/M 页码
  /\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}/g          // 抓取时间戳
];
function noiseRanges(text) {
  const ranges = [];
  const { lines, noiseLines, samples } = repeatedLines(text);
  // 已确认为页眉页脚的样本，在正文里以"片段"形式出现时同样清除（页脚常被挤到正文同一行）
  for (const sample of samples) {
    let from = 0, at;
    while ((at = text.indexOf(sample, from)) >= 0) {
      const before = at ? text[at - 1] : '\n', after = text[at + sample.length] || '\n';
      if (/\s/.test(before) && /\s/.test(after)) ranges.push([at, at + sample.length]);
      from = at + 1;
    }
  }
  let at = 0;
  for (let i = 0; i < lines.length; i++) {
    if (noiseLines.has(i)) ranges.push([at, at + lines[i].length]);
    at += lines[i].length + 1;
  }
  for (const rule of FRAGMENT_RULES) {
    for (const m of text.matchAll(rule)) ranges.push([m.index, m.index + m[0].length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

// ---------- 方案 A：清洗时删掉 ----------
function cleaned(text, ranges) {
  let out = '', cur = 0;
  for (const [s, e] of ranges) { out += text.slice(cur, s); cur = e; }
  return out + text.slice(cur);
}
// ---------- 方案 B：定位时在"跳过噪声"的投影上再比一次 ----------
function alignQuoteSkippingNoise(quote, text, ranges) {
  const direct = alignQuoteToSource(quote, text);
  if (direct) return { mode: '直接命中', hit: direct };
  // 投影：把噪声区间挖空，同时保留位置映射，命中后映射回原文本
  const parts = [], map = [];
  let cur = 0;
  for (const [s, e] of ranges) { parts.push(text.slice(cur, s)); for (let i = cur; i < s; i++) map.push(i); cur = e; }
  parts.push(text.slice(cur)); for (let i = cur; i < text.length; i++) map.push(i);
  const reduced = parts.join('');
  const hit = alignQuoteToSource(quote, reduced);
  if (!hit) return null;
  const at = reduced.indexOf(hit.text);
  const start = map[at], end = map[at + hit.text.length - 1] + 1;
  // 红线：返回值必须是原 source 的连续切片，绝不拼接
  const bridged = text.slice(start, end);
  return { mode: '跳过噪声（含噪声原切片）', hit: { text: bridged, aligned: true } };
}

const ranges = noiseRanges(source);
console.log('识别出噪声区间 ' + ranges.length + ' 段，共 ' + ranges.reduce((s, [a, b]) => s + b - a, 0) + ' 字符');
console.log('前 6 段：');
for (const [s, e] of ranges.slice(0, 6)) console.log('  [' + s + ',' + e + '] ' + JSON.stringify(source.slice(s, e).slice(0, 70)));

const quotes = {
  '火花': '【火花】「火系」高爆发输出，前期克制大量草系精灵',
  '喵喵': '【喵喵】「草系」自带回血，坦度高，容错率极高',
  '水蓝蓝': '【水蓝蓝】「水系」技能能耗低，续航能力强，防御和特攻成长优秀'
};
console.log('\n=== 现状（线上实现） ===');
for (const [n, q] of Object.entries(quotes)) console.log(n + ': ' + (alignQuoteToSource(q, source) ? '可定位' : '失败 → 隔离'));

const clean = cleaned(source, ranges).replace(/\n{3,}/g, '\n\n');
console.log('\n=== 方案 A：清洗后（' + source.length + ' → ' + clean.length + ' 字） ===');
for (const [n, q] of Object.entries(quotes)) console.log(n + ': ' + (alignQuoteToSource(q, clean) ? '可定位' : '失败 → 隔离'));
console.log('水蓝蓝处清洗后原文：' + JSON.stringify(clean.slice(clean.indexOf('【水蓝蓝】'), clean.indexOf('【水蓝蓝】') + 60)));

console.log('\n=== 方案 B：定位时跳过噪声 ===');
for (const [n, q] of Object.entries(quotes)) {
  const r = alignQuoteSkippingNoise(q, source, ranges);
  console.log(n + ': ' + (r ? r.mode + ' → ' + JSON.stringify(r.hit.text.slice(0, 46)) : '失败 → 隔离'));
}
