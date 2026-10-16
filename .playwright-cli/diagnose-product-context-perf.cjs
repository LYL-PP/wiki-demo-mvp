// 诊断：发布版 entitySemanticFacets 在真实规模历史数据下的性能/异常。
// 纯 Node，不联网、不调用模型、不写任何文件（除 stdout）。
const fs = require('fs'), path = require('path'), vm = require('vm');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'wiki-demo-mvp', 'semantic-tags.js'), 'utf8');
const sandbox = {console, JSON, Math, Date, Object, Array, String, Number, RegExp, Set, Map, Symbol, isNaN, parseInt, parseFloat, structuredClone, TypeError, Error};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const {entitySemanticFacets} = sandbox;

// ---- 构造接近真实的历史知识：一份长攻略 + 多话题 + 多实体 ----
function buildFixture({lines = 1500, topics = 30, entities = 200, product = '燕云十六声'}) {
  const bodyLines = [];
  bodyLines.push('# ' + product + ' 最新版本攻略：从入门到精通');
  for (let i = 1; i < lines; i++) bodyLines.push('第' + i + '段：本段介绍' + product + '中的战斗与探索内容，包含若干机制说明与操作建议。');
  const text = bodyLines.join('\n');
  const offsets = [];
  let cursor = 0;
  for (const line of bodyLines) {offsets.push([cursor, cursor + line.length]); cursor += line.length + 1;}
  const quoteAt = index => ({exact_quote: bodyLines[index], start: offsets[index][0], end: offsets[index][1]});

  const file = {id: 'F1', name: '燕云十六声攻略.pdf', revision: 1, size: text.length, text};
  const sourceOf = index => ({...quoteAt(index), fileId: 'F1', revision: 1, file: file.name});

  const topicList = [];
  for (let t = 0; t < topics; t++) {
    const name = product + '的' + ['江湖弈玩法', '流派选择', '武学修炼与搭配', '家园建设与庄客招募', '开荒顺序与任务探索'][t % 5] + (t >= 5 ? '·' + t : '');
    const evidenceIndex = 1 + (t * 7) % (lines - 2);
    topicList.push({
      id: 'PT-' + t, name, desc: name + '的范围说明', scope: '本话题覆盖' + name, object_anchor: product + '中的相关内容',
      core_question: '如何在' + product + '中处理该类内容', includes: ['相关内容'], excludes: ['无关内容'],
      quote: bodyLines[evidenceIndex], evidences: [sourceOf(evidenceIndex)], sources: [sourceOf(evidenceIndex)],
      fileContributions: [{fileId: 'F1', revision: 1, data: {name, primaryTopic: 'PT-' + t, topics: ['PT-' + t], evidences: [sourceOf(evidenceIndex)], sources: [sourceOf(evidenceIndex)], quote: bodyLines[evidenceIndex]}}]
    });
  }

  // 一个已确认的游戏产品锚点实体，使同话题具备可确认产品角色
  const gameIndex = 3;
  const gameEntity = {
    id: 'EN-GAME', name: product, primaryTopic: 'PT-0', topics: ['PT-0'], summary: '一款开放世界武侠游戏',
    tags: {type: ['游戏产品'], typeId: 'ET-PROD-GAME'}, aliases: [], facts: [], relations: [],
    identityAnchors: {ontologyType: '产品', realityDomain: '现实产品', productIpScope: product},
    sources: [sourceOf(gameIndex)],
    fileContributions: [{fileId: 'F1', revision: 1, data: {name: product, primaryTopic: 'PT-0', topics: ['PT-0'], tags: {type: ['游戏产品'], typeId: 'ET-PROD-GAME'}, identityAnchors: {ontologyType: '产品', realityDomain: '现实产品', productIpScope: product}, sources: [sourceOf(gameIndex)], summary: '一款开放世界武侠游戏'}}]
  };

  const entityList = [gameEntity];
  for (let i = 0; i < entities; i++) {
    const index = 10 + (i * 11) % (lines - 12), topic = topicList[i % topics], name = '佛光玉' + i;
    const data = {
      name, primaryTopic: topic.id, topics: [topic.id], tags: {type: ['道具'], typeId: 'ET-ITEM-PROP'},
      identityAnchors: {ontologyType: '虚构对象', realityDomain: '虚构世界', productIpScope: product},
      sources: [sourceOf(index)], summary: name + '是' + product + '中的道具，用于战斗与养成。'
    };
    entityList.push({id: 'EN-' + i, name, primaryTopic: topic.id, topics: [topic.id], summary: data.summary,
      tags: {type: ['道具'], typeId: 'ET-ITEM-PROP'}, aliases: [], facts: [], relations: [],
      identityAnchors: data.identityAnchors, sources: [sourceOf(index)],
      fileContributions: [{fileId: 'F1', revision: 1, data}]});
  }
  return {file, topics: topicList, entities: entityList};
}

function measure(label, fixture) {
  const contexts = {topics: fixture.topics, entities: fixture.entities, files: [fixture.file], workbook: null, productContextIndex: {}};
  const start = process.hrtime.bigint();
  let error = null, completed = 0, contextual = 0;
  try {
    for (const entity of fixture.entities) {
      const result = entitySemanticFacets(entity, contexts);
      if (result.facetDetails.some(d => d.basis === 'contextual')) contextual++;
      completed++;
      if (Number(process.hrtime.bigint() - start) / 1e9 > 60) {error = 'TIMEOUT_GUARD_60s'; break;}
    }
  } catch (e) {error = e && e.message || String(e);}
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  return {label, ms: Math.round(ms), completed, total: fixture.entities.length, contextual, error};
}

const scenarios = [
  {label: 'lines=300 topics=10 entities=50', options: {lines: 300, topics: 10, entities: 50}},
  {label: 'lines=1500 topics=30 entities=200', options: {lines: 1500, topics: 30, entities: 200}},
  {label: 'lines=3000 topics=60 entities=400', options: {lines: 3000, topics: 60, entities: 400}}
];
const results = [];
for (const scenario of scenarios) {
  const fixture = buildFixture(scenario.options);
  results.push(measure(scenario.label, fixture));
  console.log(JSON.stringify(results.at(-1)));
}
console.log(JSON.stringify({results}, null, 2));
