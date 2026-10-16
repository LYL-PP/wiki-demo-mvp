'use strict';
// One-shot source transform: parameterize buildModelInput into buildModelInputCore(options)
// so the entity stage can reuse the same template without the topic rule/schema/history payload.
const fs = require('node:fs');
const file = 'wiki-demo-mvp/pipeline.js';
let src = fs.readFileSync(file, 'utf8');
const head = 'function buildModelInput(prompts,source,snapshot,context={}){';
const start = src.indexOf(head);
if (start < 0) throw Error('buildModelInput not found');
const nextFn = src.indexOf('\nfunction ', start + head.length);
if (nextFn < 0) throw Error('function end not found');
let core = src.slice(start, nextFn);

core = core.replace(head, 'function buildModelInputCore(prompts,source,snapshot,context={},options={}){');

const marker = '只输出完整JSON：';
const mIdx = core.indexOf(marker);
const entIdx = core.indexOf('],"entities":[', mIdx);
if (mIdx < 0 || entIdx < 0) throw Error('schema markers not found');
// The topics array is followed by a comma: {"topics":[...],"entities":[...]}.
// For the entity stage we drop it entirely, so the comma must be swallowed too.
const topicSchema = core.slice(mIdx + marker.length, entIdx + 1) + ',';
if (!topicSchema.startsWith('{"topics":[') || !topicSchema.endsWith('}],')) throw Error('unexpected topic schema: ' + topicSchema.slice(0, 40) + ' … ' + topicSchema.slice(-30));
if (topicSchema.includes('`') || topicSchema.includes('${') || topicSchema.includes("'")) throw Error('topic schema needs escaping');
core = core.slice(0, mIdx + marker.length) + '${topicSchema}' + core.slice(entIdx + 2);

// The history payload must be a single variable: a nested ${} inside a ${} expression is not valid JS.
const hStart = core.indexOf('${JSON.stringify({topics:arr');
const hEndMark = 'identityAnchors}))})}';
const hEnd = core.indexOf(hEndMark, hStart);
if (hStart < 0 || hEnd < 0) throw Error('history payload not found');
core = core.slice(0, hStart) + '${JSON.stringify(historyBrief)}' + core.slice(hEnd + hEndMark.length);
const historyBrief = 'const historyBrief=entitiesOnly?{entities:arr(context.historySnapshot?.entities).map(e=>({name:e.name,disambiguator:e.disambiguator,anchors:e.identityAnchors}))}:{topics:arr(context.historySnapshot?.topics).map(t=>({name:t.name,scope:t.scope,object_anchor:t.object_anchor,core_question:t.core_question})),entities:arr(context.historySnapshot?.entities).map(e=>({name:e.name,disambiguator:e.disambiguator,anchors:e.identityAnchors}))};';

const openingOld = 'return `这是候选提炼阶段，不是最终入库。无话题/实体/关系业务条数上限：只输出有实质内容、可明确指代且可复用的候选，不复述所有名词；短文可多个话题，长文不得把分段当话题边界。\\n';
if (!core.includes(openingOld)) throw Error('opening not found');
core = core.replace(openingOld, 'return opening+`');
if (!core.includes('${JSON.stringify(rules)}')) throw Error('rules payload not found');
core = core.replace('${JSON.stringify(rules)}', '${JSON.stringify(payload)}');

const retIdx = core.lastIndexOf('  return opening+`');
const defs = [
  '  const entitiesOnly=options.entitiesOnly===true,stageTopics=arr(options.topics);',
  "  const topicSchema=entitiesOnly?'':'" + topicSchema + "';",
  '  ' + historyBrief,
  '  const payload=entitiesOnly?{step3:rules.step3,step4:rules.step4,step5:rules.step5}:rules;',
  '  const opening=entitiesOnly',
  '    ?`这是候选提炼第二阶段：本段话题已确定，只抽取实体（Mention），不再输出话题。无实体业务条数上限：只输出有实质内容、可明确指代且可复用的候选，不复述所有名词。\\n本段已确认话题（共 ${stageTopics.length} 个；topic_ids 与 primary_topic_id 只能取这些 id）：${JSON.stringify(stageTopics.map(t=>({id:t.local_id||t.id,name:t.name,scope:t.scope})))}\\n`',
  '    :\'这是候选提炼阶段，不是最终入库。无话题/实体/关系业务条数上限：只输出有实质内容、可明确指代且可复用的候选，不复述所有名词；短文可多个话题，长文不得把分段当话题边界。\\n\';',
  ''
].join('\n');
core = core.slice(0, retIdx) + defs + core.slice(retIdx);

const wrapper = 'function buildModelInput(prompts,source,snapshot,context={}){return buildModelInputCore(prompts,source,snapshot,context,{})}\n';
src = src.slice(0, start) + wrapper + core + src.slice(nextFn);
fs.writeFileSync(file, src, 'utf8');
console.log('transform ok; topic schema chars', topicSchema.length);
