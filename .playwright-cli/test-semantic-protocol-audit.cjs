'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../wiki-demo-mvp');
const guarded = ['index.html', 'file-manager.js'];
const hashes = () => guarded.map(name => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex'));
const before = hashes();
const scripts = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
function sandbox(stored = {}) {
  const data = new Map(Object.entries(stored));
  const context = vm.createContext({console, structuredClone, crypto: crypto.webcrypto, TextEncoder, DOMException,
    setTimeout, clearTimeout, performance,
    localStorage: {getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key)},
    addEventListener() {}, document: {}, location: {hash: ''},
    fetch() {throw Error('专项测试禁止网络访问');}});
  context.window = context;
  for (const script of scripts) if (script.trim() && script.trim() !== 'init();') vm.runInContext(script, context);
  for (const name of ['semantic-tags.js', 'pipeline.js']) vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context, {filename: name});
  return context;
}
const c = sandbox(), tests = [];
function check(name, run) {run(); tests.push(name);}
const row = (id, label, aliases = '', status = 'active') => [id, '测试', label, '定义', '准入', '边界', '指派', status, aliases];
const workbook = {sheets: [{name: '实体类型标签', rows: [[], [], [], [],
  row('ET-WEAPON', '武器', '兵器;weapon'), row('ET-SKILL', '技能', 'skill'), row('ET-OLD', '旧类型', '', 'deprecated'),
  row('ET-BROAD', '系统'), row('ET-OBJECT', '对象'), row('ET-OTHER', '其他')]},
  {name: '业务分面', rows: []}, {name: '赋值与治理规则', rows: []}, vm.runInContext('defaultRelationSheet()', c)]};
c.testWorkbook = workbook; vm.runInContext('savedWorkbook=testWorkbook', c);
check('主类型ID仅精确匹配，唯一别名格式归一', () => {
  assert.equal(c.resolveTagType({type_id: ' ET-WEAPON ', type: 'ｗｅａｐｏｎ'}, workbook).id, 'ET-WEAPON');
  assert.equal(c.resolveTagType({type_id: 'et-weapon', type: '武器'}, workbook).id, null);
  assert.equal(c.resolveTagType({type_id: 'ET-OLD', type: '武器'}, workbook).id, null);
});
check('主类型冲突和非字符串不得借名称兜底', () => {
  for (const item of [{type_id: 'ET-WEAPON', type: '技能'}, {type_id: 1}, {type: ['武器', '技能']}, {name: '武器', anchors: {ontology_type: '武器'}}]) assert.equal(c.resolveTagType(item, workbook).id, null);
});
check('宽泛系统/对象/其他连active ID也拒绝', () => {
  for (const [id, label] of [['ET-BROAD', '系统'], ['ET-OBJECT', '对象'], ['ET-OTHER', '其他']]) {
    assert.equal(c.tagTypeDefinition(id, workbook), null); assert.equal(c.tagTypeDefinition(label, workbook), null);
  }
  assert(!c.wikiActiveTypeDefinitions(workbook).some(item => ['系统', '对象', '其他'].includes(item.label)));
});
check('多义别名与重复ID不能归一', () => {
  const w = structuredClone(workbook); w.sheets[0].rows.push(row('ET-SECOND', '道具', 'weapon'));
  assert.equal(c.tagTypeDefinition('weapon', w), null);
  w.sheets[0].rows.push(row('ET-WEAPON', '重复武器')); assert.equal(c.tagTypeDefinition('ET-WEAPON', w), null);
});
const source = '《星河》v2中银剑使用着色器。其他对象由QA测试。';
const explicit = (value, quote = source, extra = {}) => ({value, basis: 'explicit', quote, ...extra});
const inferred = (quote = '《星河》v2中银剑使用着色器。', extra = {}) => ({value: '图形渲染', basis: 'inferred', quote, reason: '实体涉及着色器实现', ...extra});
const poisoned = ['产品:错误产品', '版本：v9', '专业:错误专业', 'product:bad', '所属／适用产品：bad', '探索词'];
check('新对象协议误放candidate_tags只诊断，不生成分面或候选筛选', () => {
  const r = c.extractSemanticFacets({facets: {product: [], discipline: [], version: []}, candidate_tags: poisoned}, source);
  assert.equal(r.facetDetails.length, 0); assert.equal(r.facets.length, 0);
  assert.equal(r.candidateTags.join(), '探索词'); assert.equal(r.issues.length, 5);
  assert(r.issues.every(item => item.code === 'MISPLACED_FACET'));
});
check('空facets数组不把新candidate_tags降级为旧协议', () => {
  const r = c.extractSemanticFacets({facets: [], candidate_tags: poisoned}, source);
  assert.equal(r.facets.length, 0); assert.equal(r.issues.length, 5);
});
check('未提供facets的新helper协议也隔离误放前缀', () => {
  assert.equal(c.extractSemanticFacets({candidate_tags: poisoned}, source).facets.length, 0);
});
check('旧facets字符串数组兼容，但不携带新candidate_tags污染', () => {
  const r = c.extractSemanticFacets({facets: ['产品:星河', '专业:测试', '版本:v1', '旧探索词'], candidate_tags: ['产品:错误产品']});
  assert.equal(r.facets.join(), '产品:星河,专业:QA,版本:v1'); assert.equal(r.issues.length, 1);
  assert(r.facetDetails.every(item => item.basis === 'legacy' && !item.quote && !item.evidences.length));
});
check('明确旧存量兼容candidate_tags，只标legacy且无伪造证据', () => {
  const r = c.extractSemanticFacets({candidate_tags: ['产品:星河', '版本:v1']}, '', {legacy: true});
  assert.equal(r.facetDetails.length, 2); assert(r.facetDetails.every(item => item.basis === 'legacy' && !item.evidences.length));
});
check('新facets数组对象与混合旧字符串兼容且证据门禁不降级', () => {
  const r = c.extractSemanticFacets({facets: [{dimension: 'product', ...explicit('星河')}, {dimension: 'discipline', ...inferred()}, '版本:v1', {dimension: 'version', value: 'v8', basis: 'legacy'}, {dimension: 'platform', ...explicit('PC')}, '探索词'], candidate_tags: ['产品:bad']}, source);
  assert.equal(r.facetDetails.length, 3); assert.equal(r.issues.length, 3);
  assert.equal(r.facetDetails.find(item => item.dimension === 'product').basis, 'explicit');
});
check('产品版本值开放，无需命中参考词表', () => {
  const r = c.extractSemanticFacets({facets: {product: [explicit('《星河》')], version: [explicit('v2')], discipline: [inferred()]}}, source);
  assert.equal(r.facets.join(), '产品:星河,专业:图形渲染,版本:v2'); assert.equal(r.issues.length, 0);
});
check('产品/版本推断拒绝，专业推断必须quote+reason', () => {
  for (const [dimension, entry] of [['product', inferred()], ['version', inferred()], ['discipline', inferred(undefined, {reason: ''})], ['discipline', inferred('不存在的原文')]]) {
    const r = c.extractSemanticFacets({facets: {[dimension]: [entry]}}, source); assert.equal(r.facets.length, 0); assert.equal(r.issues.length, 1);
  }
});
check('明示值必须在quote中，专业同义词不伪造原文', () => {
  const r = c.extractSemanticFacets({facets: {discipline: [explicit('测试', '其他对象由QA测试。'), explicit('程序', '《星河》v2中银剑使用着色器。')]}}, source);
  assert.equal(r.facets.join(), '专业:QA'); assert.equal(r.issues.length, 1);
});
check('未知维度/非数组/占位值/新字符串条目只诊断', () => {
  const r = c.extractSemanticFacets({facets: {platform: [explicit('PC')], product: '星河', discipline: ['测试'], version: [explicit('未说明')]}}, source);
  assert.equal(r.facets.length, 0); assert.equal(r.issues.length, 4);
});
const repeatedQuote = '银剑属于《星河》v2。', repeated = repeatedQuote + '间隔😀' + repeatedQuote, second = repeated.lastIndexOf(repeatedQuote);
check('分面重复quote尊重第二处UTF-16 start/end', () => {
  const r = c.extractSemanticFacets({facets: {product: [explicit('星河', repeatedQuote, {start: second, end: second + repeatedQuote.length})]}}, repeated);
  assert.equal(r.facetDetails[0].evidences[0].start, second);
  assert.equal(c.extractSemanticFacets({facets: {version: [explicit('v2', repeatedQuote, {end: second + repeatedQuote.length})]}}, repeated).facetDetails[0].evidences[0].start, second);
});
check('非法offset不回退第一次出现', () => {
  for (const extra of [{start: second + 1}, {start: '0'}, {end: '12'}, {start: -1}, {start: second, end: second + 1}]) assert.equal(c.extractSemanticFacets({facets: {product: [explicit('星河', repeatedQuote, extra)]}}, repeated).facets.length, 0);
});
check('实体证据重复quote尊重start/end，错offset隔离', () => {
  assert.equal(c.wikiEvidence([{exact_quote: repeatedQuote, start: second, end: second + repeatedQuote.length}], repeated)[0].start, second);
  assert.equal(c.wikiEvidence([{quote: repeatedQuote, start: 1}], repeated).length, 0);
  assert.equal(c.wikiEvidence([{quote: repeatedQuote, end: second + repeatedQuote.length}], repeated)[0].start, second);
});
check('存储helper新语义标记跨root/tags边界隔离candidate污染', () => {
  for (const item of [{facets: {}, candidate_tags: poisoned}, {semantic_facets: [], candidate_tags: poisoned}, {semanticFacetDetails: [], candidateTags: poisoned}, {semanticFacetsRecognized: true, candidateTags: poisoned}, {semanticFacetDetails: [], tags: {candidate_tags: poisoned}}, {candidateTags: poisoned, tags: {semantic_facets: []}}]) {
    const r = c.semanticFacetStorage(item); assert.equal(r.facetDetails.length, 0); assert.equal(r.candidateTags.join(), '探索词');
  }
});
check('存储helper旧candidate兼容不伪造依据', () => {
  const r = c.semanticFacetStorage({candidateTags: ['产品:星河', '版本:v1', '探索词']});
  assert.equal(r.suggestedFacets.product.join(), '星河'); assert.equal(r.suggestedFacets.version.join(), 'v1');
  assert(r.facetDetails.every(item => item.basis === 'legacy' && !item.quote && !item.evidences.length));
});
check('存量legacy与explicit并存，保留全局offset和来源不重定位', () => {
  const detail = {dimension: 'product', value: '星河', basis: 'explicit', quote: repeatedQuote, evidences: [{exact_quote: repeatedQuote, start: 200, end: 200 + repeatedQuote.length}], source: {file_id: 'A'}};
  const r = c.semanticFacetStorage({facets: ['版本:v1'], semantic_facets: [detail], candidate_tags: ['产品:bad']});
  assert.equal(r.facetDetails.length, 2); assert.equal(r.facetDetails[0].evidences[0].start, 200); assert.equal(r.suggestedFacets.product.join(), '星河');
  const two = c.semanticFacetStorage({semanticFacetDetails: [detail, {...detail, source: {file_id: 'B'}, reason: '另一适用条件'}]}); assert.equal(two.facetDetails.length, 2);
});
check('存储helper不把无证据新对象或错误新字符串降级为legacy', () => {
  assert.equal(c.semanticFacetStorage({facets: {product: [explicit('星河')]}}).facetDetails.length, 0);
  assert.equal(c.semanticFacetStorage({facets: {product: ['错误新字符串']}}).facetDetails.length, 0);
});
const partText = '《星河》v2中银剑使用着色器。其他对象由QA测试。', prefix = '前言😀\n', full = prefix + partText;
const part = {index: 2, text: partText, start: prefix.length, end: full.length};
const entity = (extra = {}) => ({id: 'M1', name: '银剑', type: '武器', quote: '《星河》v2中银剑使用着色器。', definition: '测试实体', aliases: [], topic_ids: ['T1'], primary_topic_id: 'T1', anchors: {ontology_type: '武器', reality_domain: '虚构', product_ip_scope: '星河'}, facets: {}, candidate_tags: [], relations: [], ...extra});
const raw = (extra = {}) => ({topics: [{id: 'T1', name: '星河银剑着色器', quote: partText, scope: '着色器', object_anchor: '星河', core_question: '着色器'}], entities: [entity(extra)], review: []});
const mapping = {topic_groups: [{id: 'GT1', members: ['P2-T1'], decision: 'keep', reason: '同问题'}], entity_groups: [{id: 'GE1', members: ['P2-M1'], decision: 'keep', reason: '独立身份', topics: ['GT1'], primary_topic: 'GT1'}]};
const context = {parts: [part], snapshot: {workbook, revision: 1}, sourceName: '专项样本.txt', historySnapshot: {topics: [], entities: []}};
check('pipeline产品版本逐字且实体关联，专业语义推断有效', () => {
  const r = c.validateChunkCandidates(raw({facets: {product: [explicit('星河', entity().quote)], version: [explicit('v2', entity().quote)], discipline: [inferred()]}}), part, full, workbook);
  assert.equal(r.entities[0].facetDetails.length, 3);
  for (const detail of r.entities[0].facetDetails) {const q = detail.evidences[0]; assert.equal(full.slice(q.start, q.end), q.exact_quote); assert.equal(q.start, prefix.length);}
});
check('pipeline文档背景产品/版本及其他实体专业不能继承', () => {
  const unrelated = '其他对象在星海v8中由QA测试。'; const text = entity().quote + unrelated;
  const p = {...part, text, end: prefix.length + text.length};
  const r = c.validateChunkCandidates(raw({facets: {product: [explicit('星海', unrelated)], version: [explicit('v8', unrelated)], discipline: [inferred(unrelated)]}}), p, prefix + text, workbook);
  assert.equal(r.entities[0].facetDetails.length, 0); assert.equal(r.diagnostics.candidate_issues.length, 3);
});
check('pipeline错source offset明确拦截', () => {assert.throws(() => c.validateChunkCandidates(raw(), {...part, start: 0}, full, workbook), /起始位置/);});
check('新输出candidate污染经过整合存储仍不进入筛选，异常只诊断', () => {
  const candidates = c.validateChunkCandidates(raw({candidate_tags: poisoned}), part, full, workbook);
  const r = c.assembleIntegratedResult(candidates, structuredClone(mapping), full, context);
  assert.equal(r.steps.step6.decision, 'ready'); assert.equal(r.metrics.reviews, 0); assert.equal(r.steps.diagnostics.candidate_issues.length, 5);
  assert.equal(c.semanticFacetStorage(r.steps.step5.entity_results[0].tags).facetDetails.length, 0);
  assert.equal(c.semanticFacetStorage(r.steps.step5.entity_results[0].tags).candidateTags.join(), '探索词');
});
check('只缺有效主类型进入type_review，不丢候选身份', () => {
  const candidates = c.validateChunkCandidates(raw({type: null, candidate_tags: poisoned}), part, full, workbook);
  const r = c.assembleIntegratedResult(candidates, structuredClone(mapping), full, context);
  assert.equal(r.metrics.entities, 1); assert.equal(r.metrics.reviews, 1); assert.equal(r.steps.step6.review_items[0].field, 'entity_type');
  assert.equal(r.steps.step6.review_reasons.join(), 'ENTITY_TYPE_REVIEW_REQUIRED');
});
const member = (id, type = null, extra = {}) => ({id, name: '银剑', type, evidences: [{exact_quote: entity().quote, start: part.start, end: part.start + entity().quote.length}], ...extra});
const group = {name: '银剑', type_id: 'ET-WEAPON', type_reason: '成员原文支持武器身份', type_quote: '银剑使用着色器'};
const resolveGroup = (members, g = group) => c.wikiResolveGroupType(members, g, workbook, full, []);
check('组类型空值可用active ID+reason+已定位组证据整合', () => {
  const r = resolveGroup([member('A')]); assert.equal(r.id, 'ET-WEAPON'); assert.equal(full.slice(r.evidences[0].start, r.evidences[0].end), group.type_quote);
});
check('组类型多个有效类型冲突必须有完整新证据整合', () => {
  const members = [member('A', '武器'), member('B', '技能')];
  assert.equal(resolveGroup(members).id, 'ET-WEAPON'); assert.equal(resolveGroup(members, {name: '武器'}).id, null);
});
check('组内单个残存有效类型不能掩盖其他成员ID/标签冲突', () => {
  const members = [member('A', '武器'), member('B', null, {type_resolution: {reason: '主类型 ID 与标签不等价'}, raw_type: '技能', raw_type_id: 'ET-WEAPON'})];
  assert.equal(resolveGroup(members, {name: '银剑'}).id, null); assert.equal(resolveGroup(members).id, 'ET-WEAPON');
});
check('一致有效组类型保留，不能被新建议覆盖', () => {
  const issues = [], r = c.wikiResolveGroupType([member('A', '武器')], {...group, type_id: 'ET-SKILL'}, workbook, full, issues);
  assert.equal(r.id, 'ET-WEAPON'); assert.equal(issues.length, 1);
});
check('一致有效+真正空值保留原有效类型', () => {assert.equal(resolveGroup([member('A', '武器'), member('B')], {name: '技能'}).id, 'ET-WEAPON');});
for (const [name, extra] of [['名字不能强填', {type_id: null, name: '武器'}], ['标准名不可冒充active ID', {type_id: '武器'}], ['停用ID', {type_id: 'ET-OLD'}], ['缺reason', {type_reason: ''}], ['外组quote', {type_quote: '其他对象由QA测试。'}], ['伪造quote', {type_quote: '不存在'}], ['宽泛ID', {type_id: 'ET-BROAD'}]]) {
  check('组类型整合拒绝：' + name, () => assert.equal(resolveGroup([member('A')], {...group, ...extra}).id, null));
}
check('组证据offset错误/越界/非整数不能充当新类型证据', () => {
  for (const evidence of [{exact_quote: entity().quote, start: 0, end: entity().quote.length}, {exact_quote: entity().quote, start: -1, end: entity().quote.length - 1}, {exact_quote: entity().quote, start: String(part.start), end: part.start + entity().quote.length}]) assert.equal(resolveGroup([member('A', null, {evidences: [evidence]})]).id, null);
});
const relation = (extra = {}) => ({relation_type_id: 'RT-uses', predicate: '采用', strength: 'strong', ...extra});
check('Relation精确ID与唯一格式别名安全归一', () => {
  assert.equal(c.normalizeControlledRelation(relation({predicate: ' 采 用 '}), workbook).definition.id, 'RT-uses');
  assert.equal(c.normalizeControlledRelation(relation({relation_type_id: 'rt-uses'}), workbook).ok, false);
});
check('Relation多ID/标签冲突与错误强弱方向拒绝', () => {
  for (const extra of [{typeId: 'RT-depends-on'}, {type: '依赖'}, {relation_type_id: 1}, {predicate: '未知谓词'}, {strength: 'weak'}, {direction: 'symmetric'}]) assert.equal(c.normalizeControlledRelation(relation(extra), workbook).ok, false);
});
check('Relation停用ID不能借相同别名复活；多义和重复ID拒绝', () => {
  const w = structuredClone(workbook); w.sheets[3].rows.find(row => row[0] === 'RT-uses')[7] = 'deprecated';
  w.sheets[3].rows.find(row => row[0] === 'RT-depends-on')[11] += ';RT-uses';
  assert.equal(c.normalizeControlledRelation(relation(), w).ok, false);
  const dup = structuredClone(workbook); dup.sheets[3].rows.find(row => row[0] === 'RT-depends-on')[11] += ';采用';
  assert.equal(c.normalizeControlledRelation(relation(), dup).ok, false);
  dup.sheets[3].rows.push(dup.sheets[3].rows.find(row => row[0] === 'RT-uses').slice());
  assert.equal(c.normalizeControlledRelation(relation({predicate: '使用'}), dup).ok, false);
});
check('Relation端点必须有效类型，可解析唯一别名，不靠错误label', () => {
  const definition = {sourceTypes: 'ET-WEAPON', targetTypes: 'skill'};
  assert.equal(c.validateRelationEndpoints(definition, {type_id: 'ET-WEAPON'}, {type: '技能'}, workbook), true);
  assert.equal(c.validateRelationEndpoints(definition, {type_id: 'ET-WEAPON', type: '技能'}, {type: '技能'}, workbook), false);
});
check('非法Relation对象只诊断，不中断其他有效候选', () => {
  const r = c.validateChunkCandidates(raw({relations: [null, 7, '使用']}), part, full, workbook);
  assert.equal(r.entities.length, 1); assert.equal(r.discardedRelations.length, 3);
});
check('旧对比字符串facets及新结构对象可比较，不改输入', () => {
  const candidates = c.validateChunkCandidates(raw(), part, full, workbook), a = c.assembleIntegratedResult(candidates, structuredClone(mapping), full, context), b = structuredClone(a);
  a.steps.step5.entity_results[0].tags = {entity_type: '武器', facets: ['产品:星河', '版本:v1', '探索词']};
  const q = a.steps.step3.accepted[0].evidences[0];
  b.steps.step5.entity_results[0].tags = {entity_type: '武器', facets: {product: [{value: '星河', basis: 'explicit', quote: q.exact_quote, evidences: [q]}]}, candidate_tags: ['探索词']};
  const original = JSON.stringify([a, b]); const diffs = c.diffSummary(a, b);
  assert(diffs.some(item => item.text.includes('分面语义识别 移除：版本:v1')));
  assert(!diffs.some(item => item.text.includes('产品:星河') || item.text.includes('候选 Tag')));
  assert.equal(JSON.stringify([a, b]), original);
});
check('渲染保留新详情与旧字符串legacy详情，不被新数组覆盖', () => {
  const candidates = c.validateChunkCandidates(raw(), part, full, workbook), r = c.assembleIntegratedResult(candidates, structuredClone(mapping), full, context);
  const q = r.steps.step3.accepted[0].evidences[0];
  r.steps.step5.entity_results[0].tags.facets = ['版本:v1'];
  r.steps.step5.entity_results[0].tags.semantic_facets = [{dimension: 'product', value: '星河', basis: 'explicit', quote: q.exact_quote, evidences: [q]}];
  const element = {}; c.renderResult(element, r); assert(element.innerHTML.includes('旧版建议（未验证证据）')); assert(element.innerHTML.includes('原文明示'));
});
check('自定义Prompt两版不覆写，buildModelInput附加门禁但不改变对象', () => {
  const custom = {step2: '自定义细粒度', step3: '自定义抽取', step4: '自定义归并', step5: '自定义标签', integration: '自定义整合'};
  const other = sandbox({'wiki_preview_v1_prompts': JSON.stringify(custom), 'wiki_preview_v1_baseline': JSON.stringify({...custom, step5: '另一套自定义'})});
  assert.equal(vm.runInContext('state.prompts.step5', other), custom.step5); assert.equal(vm.runInContext('state.baselinePrompts.step5', other), '另一套自定义');
  const original = JSON.stringify(custom); const input = other.buildModelInput(custom, partText, {workbook, revision: 1}, {});
  assert(input.includes('自定义标签') && input.includes('不可覆盖的主类型与语义分面门禁')); assert.equal(JSON.stringify(custom), original);
});
check('pipeline新数组对象逐字校验，不因兼容旧字符串而放行新candidate', () => {
  const candidates = c.validateChunkCandidates(raw({facets: [{dimension: 'product', ...explicit('星河', entity().quote)}, {dimension: 'discipline', ...inferred()}, '版本:v1'], candidate_tags: ['版本:v9']}), part, full, workbook);
  assert.equal(candidates.entities[0].facetDetails.length, 3);
  assert.equal(candidates.entities[0].facets.join(), '产品:星河,专业:图形渲染,版本:v1');
  assert.equal(candidates.diagnostics.candidate_issues.length, 1);
});
check('pipeline重复quote第二处局部offset只转换一次为全局offset', () => {
  const p = {index: 2, start: prefix.length, text: repeated, end: prefix.length + repeated.length};
  const input = raw({quote: repeatedQuote, start: second, end: second + repeatedQuote.length, facets: {product: [explicit('星河', repeatedQuote, {start: second, end: second + repeatedQuote.length})]}});
  input.topics[0].quote = repeatedQuote;
  const candidates = c.validateChunkCandidates(input, p, prefix + repeated, workbook), e = candidates.entities[0];
  assert.equal(e.evidences[0].start, prefix.length + second);
  assert.equal(e.facetDetails[0].evidences[0].start, prefix.length + second);
});
check('pipeline有效Relation提炼/整合保留受控ID、端点、方向和offset', () => {
  const text = '星河银剑使用火球。', p = {...part, text, end: prefix.length + text.length};
  const input = raw({quote: text, relations: [relation({target: 'M2', quote: text})]}); input.topics[0].quote = text;
  input.entities.push(entity({id: 'M2', name: '火球', type: '技能', quote: text}));
  const w = structuredClone(workbook); const use = w.sheets[3].rows.find(row => row[0] === 'RT-uses'); use[9] = 'ET-WEAPON'; use[10] = 'ET-SKILL';
  const candidates = c.validateChunkCandidates(input, p, prefix + text, w);
  assert.equal(candidates.entities[0].relations.length, 1);
  const groups = structuredClone(mapping); groups.entity_groups.push({id: 'GE2', members: ['P2-M2'], decision: 'keep', reason: '独立身份', topics: ['GT1'], primary_topic: 'GT1'});
  const result = c.assembleIntegratedResult(candidates, groups, prefix + text, {...context, snapshot: {workbook: w, revision: 1}, parts: [p]});
  assert.equal(result.metrics.relations, 1); const r = result.steps.step5.entity_results[0].relations[0];
  assert.equal(r.relation_type_id, 'RT-uses'); assert.equal(r.target_mention_local_id, 'GE2'); assert.equal(r.direction, 'directed'); assert.equal(r.evidence.start, prefix.length);
});
check('有效Relation整合后再次校验，无效端点不能绕过', () => {
  const text = '星河银剑使用火球。', p = {...part, text, end: prefix.length + text.length};
  const input = raw({quote: text, relations: [relation({target: 'M2', quote: text})]}); input.topics[0].quote = text; input.entities.push(entity({id: 'M2', name: '火球', type: '技能', quote: text}));
  const w = structuredClone(workbook); w.sheets[3].rows.find(row => row[0] === 'RT-uses')[10] = 'ET-SKILL';
  const candidates = c.validateChunkCandidates(input, p, prefix + text, w); candidates.entities[1].type = '武器';
  const groups = structuredClone(mapping); groups.entity_groups.push({id: 'GE2', members: ['P2-M2'], decision: 'keep', reason: '独立身份', topics: ['GT1'], primary_topic: 'GT1'});
  assert.equal(c.assembleIntegratedResult(candidates, groups, prefix + text, {...context, snapshot: {workbook: w, revision: 1}, parts: [p]}).metrics.relations, 0);
});
check('组空类型整合缺type_quote仍不准入，类型证据不能引用整组外背景', () => {
  assert.equal(resolveGroup([member('A')], {...group, type_quote: ''}).id, null);
  assert.equal(resolveGroup([member('A')], {...group, type_quote: source}).id, null);
});
check('一致有效主类型的无效整合建议只诊断不产生复核', () => {
  const candidates = c.validateChunkCandidates(raw(), part, full, workbook), groups = structuredClone(mapping);
  Object.assign(groups.entity_groups[0], {type_id: 'ET-SKILL', type_reason: '', type_quote: ''});
  const r = c.assembleIntegratedResult(candidates, groups, full, context);
  assert.equal(r.steps.step5.entity_results[0].tags.entity_type_id, 'ET-WEAPON'); assert.equal(r.metrics.reviews, 0); assert.equal(r.steps.diagnostics.candidate_issues.length, 1);
});
check('已知旧默认精确升级，近似自定义不升级', () => {
  const old = vm.runInContext('PREVIOUS_STEP5_DEFAULT', c);
  const upgraded = sandbox({'wiki_preview_v1_prompts': JSON.stringify({step5: old}), 'wiki_preview_v1_baseline': JSON.stringify({step5: old + '\n自定义'})});
  assert.equal(vm.runInContext('state.prompts.step5===DEFAULT_PROMPTS.step5', upgraded), true);
  assert.equal(vm.runInContext('state.baselinePrompts.step5', upgraded), old + '\n自定义');
});
check('禁止修改的业务文件指纹保持不变', () => assert.deepEqual(hashes(), before));
console.log(JSON.stringify({passed: tests.length, tests, kind: '本地Node VM专项断言；不初始化云、不访问网络、不发布、不写云', guardedFiles: Object.fromEntries(guarded.map((name, index) => [name, before[index]]))}, null, 2));
