'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../wiki-demo-mvp');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const guarded = ['pipeline.js', 'semantic-tags.js'];
const hashes = () => guarded.map(name => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex'));
const before = hashes();
const custom = {step2: '自定义话题', step3: '自定义实体', step4: '自定义归一', step5: '自定义标签', integration: '自定义整合'};
const store = new Map(['prompts', 'baseline'].map(key => ['wiki_preview_v1_' + key, JSON.stringify(custom)]));
const c = vm.createContext({console, structuredClone, crypto: crypto.webcrypto, TextEncoder, DOMException, performance,
  setTimeout, clearTimeout, document: {}, location: {hash: ''}, addEventListener() {},
  localStorage: {getItem: key => store.get(key) ?? null, setItem(key, value) {
    assert(!['wiki_preview_v1_prompts', 'wiki_preview_v1_baseline'].includes(key), '不得覆写自定义Prompt'); store.set(key, value);
  }, removeItem: key => store.delete(key)}, fetch() {throw Error('专项断言禁止访问网络');}});
c.window = c;
for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  new vm.Script(match[1]);
  if (match[1].trim() && match[1].trim() !== 'init();') vm.runInContext(match[1], c);
}
for (const name of ['semantic-tags.js', 'pipeline.js', 'file-manager.js']) vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), c, {filename: name});
const run = code => vm.runInContext(code, c);
const row = (id, label, aliases = '', status = 'active') => [id, '测试', label, '定义', '示例', '边界', '单选', status, aliases];
const workbook = {sheets: [
  {name: '实体类型标签', rows: [[], [], [], ['类型 ID', '管理分组', '正式标签', '定义', '包含示例', '排除与边界', '赋值规则', '状态', '同义词'], row('ET-WEAPON', '武器', '兵器;weapon'), row('ET-SKILL', '技能', 'skill'), row('ET-OLD', '旧类型', '', 'deprecated')]},
  {name: '业务分面', rows: [[], [], [], ['分面 ID', '分面名称', '正式取值', '值类型', '基数', '值来源', '主要用途', '未命中处理'], ['F1', '产品', '开放', '文本', '多值', '原文', '索引', '建议']]},
  {name: '赋值与治理规则', rows: [[], [], [], ['规则 ID', '场景', '规则', '程序门控', '处理方式'], ['G1', '测试', '单选', '校验', '复核']]}
]};
c.workbook = workbook; run('savedWorkbook=workbook');
const plain = value => JSON.parse(JSON.stringify(value));
const contribution = (fileId, tags, extra = {}) => ({fileId, revision: 2, data: {
  id: 'E1', name: '银剑', tags, sources: [{file: fileId + '.txt', fileId, revision: 2, quote: fileId + '原文'}],
  topics: [], aliases: [], facts: [fileId + '原文'], summary: fileId + '摘要', relations: [], ...extra
}});
const detail = (fileId, dimension, value, basis = 'explicit') => ({dimension, value, basis, quote: fileId + '原文',
  evidences: [{exact_quote: fileId + '原文', start: 200, end: 204}], source: {fileId, file: fileId + '.txt', revision: 2}, reason: ''});
const valid = extra => contribution('A', {type: ['武器'], typeId: 'ET-WEAPON'}, extra);
const missing = extra => contribution('B', {type: [], typeId: null}, extra);
const entity = contributions => ({id: 'E1', name: '银剑', fileContributions: structuredClone(contributions)});
const rebuild = (contributions, extra = {}) => c.rebuildFileKnowledge([], [{...entity(contributions), ...extra}], workbook).entities[0];
const tests = [], failures = [];
function check(name, fn) {try {fn(); tests.push({name, pass: true});} catch (error) {tests.push({name, pass: false}); failures.push({name, error: error.message});}}
check('唯一合法类型加真正缺类型来源保留合法类型', () => {
  const e = rebuild([valid(), missing()]); assert.deepEqual(plain(e.tags), {type: ['武器'], typeId: 'ET-WEAPON'}); assert(!e.typeIssue); assert.equal(c.entityTypeReviewNeeded(e, workbook), false);
});
check('缺类型来源排第一仍保留合法类型', () => {const e = rebuild([missing(), valid()]); assert.equal(e.tags.typeId, 'ET-WEAPON'); assert(!e.typeIssue);});
check('缺失诊断保留来源但不能覆盖合法类型', () => {
  const e = rebuild([valid(), missing()]); assert.equal(e.typeSourceIssues.length, 1); assert.equal(e.typeSourceIssues[0].source.fileId, 'B'); assert.equal(e.typeSourceIssues[0].source.revision, 2); assert(!e.typeIssue);
});
check('两个不同合法类型是真冲突并进入复核', () => {
  const e = rebuild([valid(), contribution('B', {type: ['技能'], typeId: 'ET-SKILL'})]); assert.equal(e.tags.type.length, 0); assert.equal(e.tags.typeId, null); assert.match(e.typeIssue.reason, /冲突/); assert(c.entityTypeReviewNeeded(e, workbook));
});
check('标准名不得覆盖不匹配ID掩盖单来源冲突', () => {
  const e = contribution('B', {type: ['技能'], typeId: 'ET-WEAPON'}).data; c.normalizeStoredEntityTags(e, workbook); assert.equal(e.tags.type.length, 0); assert.match(e.typeIssue.reason, /不等价/); assert.deepEqual(plain(e.typeIssue.raw), {id: 'ET-WEAPON', label: '技能'});
});
check('合法来源不能掩盖其他来源ID与标签冲突', () => {
  const e = rebuild([valid(), contribution('B', {type: ['技能'], typeId: 'ET-WEAPON'})]); assert.equal(e.tags.type.length, 0); assert.match(e.typeIssue.reason, /不等价|冲突/);
});
check('停用ID不得借合法标准名复活', () => {const e = valid().data; e.tags.typeId = 'ET-OLD'; c.normalizeStoredEntityTags(e, workbook); assert.equal(e.tags.type.length, 0); assert.match(e.typeIssue.reason, /无效/);});
check('冲突来源重复归一和重建仍然阻塞', () => {
  let e = rebuild([valid(), contribution('B', {type: ['技能'], typeId: 'ET-WEAPON'})]); const raw = JSON.stringify(e.fileContributions[1].data.typeIssue.raw);
  for (let i = 0; i < 3; i++) e = c.rebuildFileKnowledge([], [e], workbook).entities[0];
  assert.equal(e.tags.type.length, 0); assert.equal(JSON.stringify(e.fileContributions[1].data.typeIssue.raw), raw);
});
check('单来源多类型冲突不能被其他合法来源掩盖', () => {assert.equal(rebuild([valid(), contribution('B', {type: ['武器', '技能']})]).tags.type.length, 0);});
check('无法识别的非空类型来源不会被当成缺失放行', () => {assert.equal(rebuild([valid(), contribution('B', {type: ['未知类别']})]).tags.type.length, 0);});
check('存量无原始值冲突诊断仍阻塞', () => {
  const e = rebuild([valid(), missing({typeIssue: {reason: '主类型 ID 与标签不等价', raw: null}})]); assert.equal(e.tags.type.length, 0);
});
check('旧来源含未选择或无效的模糊诊断不能冒充明确缺失', () => {
  const e = rebuild([valid(), missing({typeIssue: '主类型未选择/无效'})]); assert.equal(e.tags.type.length, 0); assert(e.typeIssue);
});
const pipelineMissingIssue = () => ({reason: '原候选未选择主类型', raw: {members: [{id: 'P1-M1', type: null, type_id: null,
  type_resolution: {label: null, id: null, reason: '模型未选择主类型', raw: {id: null, label: null}}}], integration: {type_id: null, type_reason: null, type_quote: null}}});
check('pipeline嵌套成员全空的缺类型来源不覆盖合法类型', () => {
  const e = rebuild([valid(), missing({typeIssue: pipelineMissingIssue()})]); assert.equal(e.tags.typeId, 'ET-WEAPON'); assert(!e.typeIssue); assert.equal(e.typeSourceIssues.length, 1);
});
check('嵌套成员冲突不能借外层缺失诊断放行', () => {
  const issue = pipelineMissingIssue(); issue.raw.members[0].type_resolution.reason = '主类型 ID 与标签不等价'; issue.raw.members[0].type_resolution.raw = {id: 'ET-WEAPON', label: '技能'};
  assert.equal(rebuild([valid(), missing({typeIssue: issue})]).tags.type.length, 0);
});
check('嵌套非空原始成员或整合建议仍阻塞', () => {
  for (const field of ['type', 'type_id', 'integration']) {const issue = pipelineMissingIssue(); if (field === 'integration') issue.raw.integration.type_id = 'ET-SKILL'; else issue.raw.members[0][field] = field === 'type' ? '技能' : 'ET-SKILL'; assert.equal(rebuild([valid(), missing({typeIssue: issue})]).tags.type.length, 0);}
});
check('合法别名与标准名多来源归一为唯一类型', () => {
  const e = rebuild([valid(), contribution('B', {type: ['ｗｅａｐｏｎ'], typeId: 'ET-WEAPON'})]); assert.deepEqual(plain(e.tags.type), ['武器']); assert(!e.typeIssue);
});
check('8列旧存量标准名无ID仍兼容', () => {const e = valid().data; delete e.tags.typeId; c.normalizeStoredEntityTags(e, workbook); assert.equal(e.tags.typeId, 'ET-WEAPON');});
check('存量ID单独存在不从身份锚点填入标签', () => {
  const e = missing().data; e.tags.typeId = 'ET-WEAPON'; e.anchors = {ontology_type: '武器'}; c.normalizeStoredEntityTags(e, workbook); assert.equal(e.tags.type.length, 0); assert(e.typeIssue);
});
check('有效类型恢复时清除类型复核标记而保留身份复核', () => {
  const e = rebuild([valid(), missing({reviewReasons: ['LEGACY_TYPE_REVIEW_REQUIRED', 'ENTITY_TYPE_REVIEW_REQUIRED', 'TYPE_TAG_CONFLICT', 'ENTITY_IDENTITY_REVIEW']})]);
  assert.deepEqual(plain(e.reviewReasons), ['ENTITY_IDENTITY_REVIEW']); assert(!e.typeIssue);
});
const facetContributions = () => [valid({semanticFacetDetails: [detail('A', 'product', '星河'), detail('A', 'version', 'v1')], semanticFacetsRecognized: true}),
  missing({semanticFacetDetails: [detail('B', 'product', '星海'), detail('B', 'discipline', 'QA')], semanticFacetsRecognized: true})];
function prepare(contributions) {
  c.testEntities = [rebuild(contributions)]; run("state.files=[{id:'A',name:'A.txt',revision:2},{id:'B',name:'B.txt',revision:2}];state.previews=testEntities;state.previewTopics=[]");
}
check('删除缺类型来源清理诊断和该来源分面', () => {
  prepare(facetContributions()); const e = c.planFileRemoval('B').entities[0]; assert.equal(e.tags.typeId, 'ET-WEAPON'); assert(!e.typeIssue); assert.equal(e.typeSourceIssues.length, 0);
  assert.deepEqual(plain(e.suggestedFacets), {product: ['星河'], discipline: [], version: ['v1']}); assert(e.semanticFacetDetails.every(d => d.source.fileId === 'A'));
});
check('删除唯一合法来源后留下缺类型来源必须复核', () => {
  prepare(facetContributions()); const e = c.planFileRemoval('A').entities[0]; assert.equal(e.tags.type.length, 0); assert(e.typeIssue); assert(c.entityTypeReviewNeeded(e, workbook));
  assert.deepEqual(plain(e.suggestedFacets), {product: ['星海'], discipline: ['QA'], version: []}); assert(e.semanticFacetDetails.every(d => d.source.fileId === 'B'));
});
check('删除冲突来源后合法类型与非类型复核恢复', () => {
  prepare([valid(), contribution('B', {type: ['技能'], typeId: 'ET-WEAPON'})]); const e = c.planFileRemoval('B').entities[0]; assert.equal(e.tags.typeId, 'ET-WEAPON'); assert(!e.typeIssue); assert(!e.reviewReasons.includes('TYPE_TAG_CONFLICT'));
});
check('删除不同合法类型的冲突来源后唯一合法类型恢复', () => {
  prepare([valid(), contribution('B', {type: ['技能'], typeId: 'ET-SKILL'})]); const e = c.planFileRemoval('B').entities[0];
  assert.equal(e.tags.typeId, 'ET-WEAPON'); assert(!e.typeIssue); assert(!e.reviewReasons.includes('TYPE_TAG_CONFLICT'));
});
check('同值分面保留各自来源，删除一份仅留下另一份证据', () => {
  prepare([valid({semanticFacetDetails: [detail('A', 'product', '星河')]}), missing({semanticFacetDetails: [detail('B', 'product', '星河')]})]);
  assert.equal(run('state.previews[0].semanticFacetDetails.length'), 2); const e = c.planFileRemoval('B').entities[0];
  assert.equal(e.semanticFacetDetails.length, 1); assert.equal(e.semanticFacetDetails[0].source.fileId, 'A'); assert.deepEqual(plain(e.suggestedFacets.product), ['星河']);
});
check('实体级来源诊断不泄漏到后续单来源快照', () => {
  const e = rebuild([valid(), missing()]), copy = c.fileSnapshot(e); assert(!Object.hasOwn(copy, 'fileContributions')); assert(!Object.hasOwn(copy, 'typeSourceIssues'));
});
check('来源删除不污染剩余分面或重定位全局证据', () => {
  prepare(facetContributions()); const prior = JSON.stringify(run('state.previews')); const e = c.planFileRemoval('B').entities[0];
  assert.equal(JSON.stringify(run('state.previews')), prior); assert.equal(e.semanticFacetDetails[0].evidences[0].start, 200);
  const again = c.rebuildFileKnowledge([], [e], workbook).entities[0]; assert.equal(JSON.stringify(again), JSON.stringify(e));
});
check('旧tags分面迁移和候选前缀重建幂等', () => {
  const e = rebuild([valid({tags: {type: ['武器'], product: ['星河'], custom: ['版本:v1', '探索词']}})]);
  assert.deepEqual(plain(e.tags), {type: ['武器'], typeId: 'ET-WEAPON'}); assert.deepEqual(plain(e.suggestedFacets), {product: ['星河'], discipline: [], version: ['v1']});
  assert(e.semanticFacetDetails.every(d => d.basis === 'legacy' && d.evidences.length === 0)); assert.deepEqual(plain(e.candidateTags), ['探索词']);
  assert.equal(JSON.stringify(c.rebuildFileKnowledge([], [e], workbook).entities[0]), JSON.stringify(e));
});
check('无贡献历史迁移保留缺类型诊断和分面删除归属', () => {
  store.delete('wiki_preview_v1_fileWorkspaceV1'); run('fileWorkspaceRaw=null');
  c.legacy = {id: 'E-old', name: '历史实体', tags: {type: []}, sources: [{file: '旧A.txt', quote: '旧A原文'}, {file: '旧B.txt', quote: '旧B原文'}], semanticFacetDetails: [
    {...detail('旧A', 'product', '星河'), source: {file: '旧A.txt'}}, {...detail('旧B', 'version', 'v2'), source: {file_name: '旧B.txt'}}], relations: []};
  run('state.previews=[legacy];state.previewTopics=[];migrateFileWorkspace()');
  const migrated = run('state.previews[0]'); assert.equal(migrated.fileContributions.length, 2); assert(migrated.typeIssue);
  const id = run("state.files.find(f=>f.name==='旧A.txt').id"); const e = c.planFileRemoval(id).entities[0];
  assert.deepEqual(plain(e.suggestedFacets), {product: [], discipline: [], version: ['v2']}); assert(e.typeIssue); assert(e.semanticFacetDetails.every(d => d.source.file !== '旧A.txt'));
});
check('已有schema1贡献迁移后归一不借顶层旧冲突覆盖唯一合法来源', () => {
  const e = entity([valid(), missing()]); e.tags = {type: []}; e.typeIssue = {reason: '过期顶层冲突', raw: null};
  store.set('wiki_preview_v1_fileWorkspaceV1', JSON.stringify({schema: 1, revision: 'legacy', files: [], topics: [], entities: [e]}));
  run('migrateFileWorkspace();fileManagerReady=true;normalizeStoredPreviews()'); assert.equal(run('state.previews[0].tags.typeId'), 'ET-WEAPON'); assert.equal(run('state.previews[0].typeIssue'), undefined);
});
check('8列旧词表校验兼容且不自动加列', () => {
  const w = structuredClone(workbook); w.sheets[0].rows = w.sheets[0].rows.map(r => r.slice(0, 8)); const prior = JSON.stringify(w); c.validateWorkbook(w); assert.equal(JSON.stringify(w), prior);
});
check('9列唯一别名校验兼容且无修改', () => {const prior = JSON.stringify(workbook); c.validateWorkbook(workbook); assert.equal(JSON.stringify(workbook), prior);});
const collision = (aliases, change) => {const w = structuredClone(workbook); w.sheets[0].rows[5][8] = aliases; if (change) change(w); assert.throws(() => c.validateWorkbook(w), /冲突|重复|唯一/);};
check('active别名跨类型重复拒绝', () => collision('weapon'));
check('active别名NFKC大小写空白归一后重复拒绝', () => collision(' ＷＥＡ ＰＯＮ '));
check('active别名与另一类型标准名冲突拒绝', () => collision('武器'));
check('active别名与另一类型ID冲突拒绝', () => collision('ET-WEAPON'));
check('反向行顺序仍拦截别名与标准名或ID冲突', () => {
  for (const aliases of ['技能', 'ET-SKILL']) {const w = structuredClone(workbook); w.sheets[0].rows[4][8] = aliases; assert.throws(() => c.validateWorkbook(w), /冲突|重复|唯一/);}
});
check('单类型同义词自重复不产生多义，数组格式兼容', () => {
  const w = structuredClone(workbook); w.sheets[0].rows[4][8] = ['兵器', 'ｗｅａｐｏｎ', 'weapon', '武器']; c.validateWorkbook(w); assert.equal(c.tagTypeDefinition('weapon', w).id, 'ET-WEAPON');
});
check('逗号顿号竖线换行分隔的别名也参与唯一校验', () => {
  for (const aliases of ['other,weapon', 'other，weapon', 'other、weapon', 'other|weapon', 'other\nweapon', 'other；weapon']) collision(aliases);
});
check('inactive别名不与active词表产生多义', () => {
  const w = structuredClone(workbook); w.sheets[0].rows[6][8] = 'weapon'; c.validateWorkbook(w); assert.equal(c.tagTypeDefinition('weapon', w).id, 'ET-WEAPON');
});
check('active标准名格式归一后多义拒绝', () => {
  const w = structuredClone(workbook); w.sheets[0].rows[4][2] = 'Weapon'; w.sheets[0].rows[4][8] = ''; w.sheets[0].rows[5][2] = 'ｗｅａｐｏｎ'; assert.throws(() => c.validateWorkbook(w), /冲突|重复|唯一/);
});
check('禁改文件指纹与两版自定义Prompt均未变', () => {
  assert.deepEqual(hashes(), before); for (const key of ['prompts', 'baseline']) {assert.equal(store.get('wiki_preview_v1_' + key), JSON.stringify(custom)); assert.deepEqual(plain(run('state.' + (key === 'prompts' ? 'prompts' : 'baselinePrompts'))), custom);}
});
console.log(JSON.stringify({passed: tests.filter(t => t.pass).length, total: tests.length, failures, tests,
  kind: '本地Node VM断言；禁止网络、写云、发布及自定义Prompt写入', guardedFiles: Object.fromEntries(guarded.map((name, i) => [name, before[i]]))}, null, 2));
if (failures.length) process.exitCode = 1;
