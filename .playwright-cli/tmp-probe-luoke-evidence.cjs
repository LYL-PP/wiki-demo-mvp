// 用线上同一份 alignQuoteToSource 逻辑，验证三只御三家的证据能否定位
const fs = require('fs');
const path = require('path');

function alignQuoteToSource(quote, source) {
  if (typeof quote !== 'string' || !quote.trim()) return null;
  if (source.includes(quote)) return { text: quote, aligned: false, ambiguous: source.indexOf(quote) !== source.lastIndexOf(quote) };
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
  const ambiguous = haystack.indexOf(text, first + 1) >= 0;
  const start = Array.from(haystack.slice(0, first)).length;
  const end = start + chars.length - 1;
  const matched = source.slice(positions[start], positions[end] + compact[end].length);
  return matched && source.includes(matched) ? { text: matched, aligned: true, ambiguous } : null;
}

const source = fs.readFileSync(path.join(__dirname, 'tmp-luoke-source.txt'), 'utf8');
// 模型最可能给出的 quote：名字 + 紧邻的描述句（视觉上是同一个对比表单元格）
const quotes = {
  '火花': '【火花】「火系」高爆发输出，前期克制大量草系精灵，清图效率极高',
  '喵喵': '【喵喵】「草系」自带回血，坦度高，容错率极高',
  '水蓝蓝': '【水蓝蓝】「水系」技能能耗低，续航能力强，防御和特攻成长优秀'
};
for (const [name, quote] of Object.entries(quotes)) {
  const hit = alignQuoteToSource(quote, source);
  console.log(`${name}: ${hit ? '定位成功 → ' + JSON.stringify(hit.text.slice(0, 40)) : '❌ 定位失败（会被隔离）'}`);
}
const at = source.indexOf('【水蓝蓝】'), desc = source.indexOf('技能能耗低');
console.log('\n【水蓝蓝】@' + at + '，其描述句"技能能耗低…"@' + desc + '，中间隔着 ' + (desc - at) + ' 字符：');
console.log(JSON.stringify(source.slice(at, desc)));
