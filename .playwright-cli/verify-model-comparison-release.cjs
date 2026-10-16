'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');

const root = 'C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
const url = 'https://wiki-mvp-lab.app-tencent.workbuddy.host/';
const phase = process.argv[2], outputSuffix = process.argv[3] || '';
if (!['before', 'after'].includes(phase)) throw Error('仅支持 before / after');
if (outputSuffix && !/^[a-z0-9][a-z0-9-]{0,39}$/.test(outputSuffix)) throw Error('输出后缀只允许安全的小写字母、数字及连字符，最长 40 字符');
const assets = ['index.html', 'semantic-tags.js', 'pipeline.js', 'file-manager.js', 'prompt-history.js'];
const output = path.join(root, 'outputs', `wiki-model-comparison-release-${phase}${outputSuffix ? '-' + outputSuffix : ''}.json`);
// 不覆盖任何已有报告，包括本脚本先前产出的发布基线。
if (fs.existsSync(output)) throw Error('报告已存在，拒绝覆盖：' + output);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const digest = value => sha(stable(value));
const report = {
  phase, kind: '本轮模型比较发布验收；真实线上浏览器与 SDK 只读；不运行模型、不模拟 SDK、不部署、不修改应用',
  startedAt: new Date().toISOString(), assertions: 0, passedAssertions: 0, tests: [],
  pageerrors: [], blockedWrites: [], modelRequests: [], webSockets: [], dialogs: 0, downloads: 0,
  realCloudWrites: 0, oldTestsExecuted: 0, runClicks: 0, promptInputEvents: 0,
  resources: [], layouts: [], outputSuffix, harnessRevision: 'native-select-popup-recheck-1', controlDiagnostics: [],
};
const protectedReleaseReports = Object.fromEntries(fs.readdirSync(path.join(root, 'outputs'))
  .filter(name => /^wiki-model-comparison-release-(?:before|after)(?:-[a-z0-9-]+)?\.json$/.test(name))
  .map(name => [name, sha(fs.readFileSync(path.join(root, 'outputs', name)))]));
// 断言只附带标签和指纹，不将 Prompt、文件正文或 SDK 敏感响应写入失败报告。
function check(label, fn) {
  report.assertions++;
  try { fn(); } catch { throw Error('验收断言失败：' + label); }
  report.passedAssertions++;
}
const eq = (a, b, label) => check(label, () => assert.deepEqual(a, b));
const ok = (value, label) => check(label, () => assert.ok(value));
const localHashes = () => Object.fromEntries(assets.map(name => [name, sha(fs.readFileSync(path.join(root, 'wiki-demo-mvp', name)))]));
const localReportPath = path.join(root, 'outputs', 'wiki-model-comparison-tests.json');
let localReportHash;

function verifyCompletedSuite() {
  const bytes = fs.readFileSync(localReportPath);
  localReportHash = sha(bytes);
  const suite = JSON.parse(bytes);
  eq(suite.status, 'passed', '已完成专项总状态');
  eq(suite.sourceReady, true, '已完成专项源码就绪');
  eq(suite.modules, assets, '专项真实五模块');
  eq([suite.executedScenarios, suite.passedScenarios, suite.failedScenarios], [67, 67, 0], '67 场景统计');
  eq([suite.assertionCount, suite.passedAssertions, suite.failedAssertions], [3179, 3179, 0], '3179 断言统计');
  eq(suite.scenarios.length, 67, '场景记录数量');
  eq(suite.assertions.length, 3179, '完整断言记录数量');
  ok(suite.scenarios.every(item => item.pass === true && (item.errors || []).length === 0), '所有场景通过且无错误');
  ok(suite.assertions.every(item => item.pass === true), '所有断言逐条通过');
  eq(suite.harnessErrors, [], '专项测试框架无错误');
  eq(suite.sourceHashesBefore, suite.sourceHashesAfter, '专项所有保护指纹前后相同');
  const actual = localHashes();
  for (const name of assets) {
    const key = 'wiki-demo-mvp/' + name;
    eq(actual[name], suite.sourceHashesBefore[key], name + ' 对应 sourceHashesBefore');
    eq(actual[name], suite.sourceHashesAfter[key], name + ' 对应 sourceHashesAfter');
  }
  report.localScenarios = 67;
  report.localAssertions = 3179;
  report.localReportFingerprint = localReportHash;
  report.sourceFingerprintFields = ['sourceHashesBefore', 'sourceHashesAfter'];
  report.testedSourceFingerprint = actual;
  report.sourceFingerprintsConfirmed = true;
  report.tests.push('只读取已完成专项：67 场景 / 3179 断言；真实本地五模块与双份保护指纹一致');
}

async function readShared(page) {
  return page.evaluate(async () => {
    const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
    const fingerprint = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)))))
      .map(byte => byte.toString(16).padStart(2, '0')).join('');
    const readWorkbook = async () => {
      const result = await cloud.database.from('wiki_shared_tag_workbook').select('id,workbook,revision').eq('id', 1).maybeSingle();
      if (result.error || !result.data) throw Error('共享词表只读查询失败');
      return result.data;
    };
    const firstWorkbook = await readWorkbook();
    const versions = [], seen = new Set();
    let cursor = null, pages = 0, nonEmptyPages = 0;
    // 即使服务器将 limit 缩小，也继续查询直到空页；用整数游标防止大版本号精度丢失。
    while (true) {
      let query = cloud.database.from('wiki_prompt_versions').select('*').order('revision', { ascending: false }).limit(100);
      if (cursor !== null) query = query.lt('revision', cursor);
      const result = await query;
      pages++;
      if (result.error || !Array.isArray(result.data)) throw Error('Prompt 历史分页只读查询失败');
      if (!result.data.length) break;
      nonEmptyPages++;
      let previous = cursor === null ? null : BigInt(cursor);
      for (const row of result.data) {
        if (!/^\d+$/.test(String(row.revision))) throw Error('Prompt 版本游标不是整数');
        const revision = BigInt(row.revision), key = revision.toString();
        if (seen.has(key) || previous !== null && revision >= previous) throw Error('Prompt 分页重复或游标未严格推进');
        seen.add(key); versions.push(row); previous = revision;
      }
      cursor = previous.toString();
    }
    if (!versions.length) throw Error('共享 Prompt 历史为空');
    const head = await cloud.database.from('wiki_prompt_versions').select('*').order('revision', { ascending: false }).limit(1);
    if (head.error || !head.data?.length || canonical(head.data[0]) !== canonical(versions[0])) throw Error('读取期间 Prompt 历史发生变化');
    const lastWorkbook = await readWorkbook();
    if (canonical(firstWorkbook) !== canonical(lastWorkbook)) throw Error('读取期间共享词表发生变化');
    if (canonical(savedWorkbook) !== canonical(firstWorkbook.workbook) || String(workbookRevision) !== String(firstWorkbook.revision)) throw Error('真实 SDK 与已加载 savedWorkbook 不一致');
    const history = wikiPromptHistory.getController().status();
    if (!history.ready || history.dirty || history.blocked || history.busy || history.error) throw Error('共享 Prompt 控制器不是就绪的只读同步状态');
    if (canonical({ baseline: state.baselinePrompts, current: state.prompts }) !== canonical(versions[0].snapshot)) throw Error('已加载 Prompt 与真实云端最新完整快照不一致');
    if (String(history.base?.revision) !== String(versions[0].revision)) throw Error('Prompt 控制器版本与完整分页头版本不一致');
    versions.reverse();
    const workbookFingerprint = await fingerprint(savedWorkbook), promptFingerprint = await fingerprint(versions);
    const shared = {
      workbookFingerprint, workbookRevision: firstWorkbook.revision, types: controlledTypes().length,
      promptFingerprint, promptVersions: versions.length, promptHeadRevision: versions.at(-1).revision,
    };
    return { ...shared, sharedFingerprint: await fingerprint(shared), historyPagination: { pageSize: 100, pages, nonEmptyPages, terminalEmptyPage: true, uniqueVersions: seen.size } };
  });
}

async function protectedMemory(page) {
  return page.evaluate(async () => {
    const history = wikiPromptHistory.getController().status();
    const data = {
      prompts: state.prompts, baselinePrompts: state.baselinePrompts, source: state.source,
      entities: state.previews, topics: state.previewTopics, files: state.files,
      baselineResult: state.baseline, currentResult: state.current,
      workbook: savedWorkbook, draftWorkbook, workbookRevision, workbookDraftRevision, workbookDirty,
      fileWorkspaceRaw, fileRevision,
      history: { snapshot: history.snapshot, base: history.base, cloudHead: history.cloudHead, pending: history.pending,
        generation: history.generation, dirty: history.dirty, blocked: history.blocked, error: history.error },
    };
    const canonical = JSON.stringify(data, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)));
    return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
  });
}

async function storageSnapshot(page, context) {
  const web = await page.evaluate(() => {
    const entries = storage => Object.fromEntries(Object.keys(storage).sort().map(key => [key, storage.getItem(key)]));
    return { local: entries(localStorage), session: entries(sessionStorage) };
  });
  return { web, context: await context.storageState({ indexedDB: true }) };
}

async function settleHistory(page) {
  await page.waitForFunction(() => !wikiPromptHistory.getController().status().busy, null, { timeout: 30000 });
}

async function restoreOwnOptions(page) {
  await settleHistory(page);
  return page.evaluate(() => {
    const original = window.__modelReleaseOriginal;
    if (!original) return { restored: true, fixtureRestored: true };
    state.source = original.source;
    // 只恢复自身隔离 context；不清空 storage，不回写任何变化了的 Prompt 或业务数据。
    // 普通 STEP 点击会调用只读 flush，但 persist 仍刷新草稿 updatedAt。
    // 仅当整条草稿除时间戳外完全一致时，精准恢复该自动测试元数据；业务变化必须失败。
    let readOnlyDraftMetadataRestored = 0;
    for (const record of original.readOnlyDraftRecords) {
      const storage = record.kind === 'local' ? localStorage : sessionStorage;
      const current = storage.getItem(record.key);
      if (current === record.raw) continue;
      if (current === null || record.raw === null) throw Error('只读测试期间草稿记录增删');
      const oldValue = JSON.parse(record.raw), newValue = JSON.parse(current);
      delete oldValue.updatedAt; delete newValue.updatedAt;
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) throw Error('只读测试期间草稿业务内容改变，拒绝回写');
      storage.setItem(record.key, record.raw); readOnlyDraftMetadataRestored++;
    }
    if (original.optionRaw === null) localStorage.removeItem(COMPARISON_OPTIONS_KEY);
    else localStorage.setItem(COMPARISON_OPTIONS_KEY, original.optionRaw);
    comparisonOptions = original.options;
    document.getElementById('comparisonMode').value = original.mode;
    document.getElementById('comparisonPromptSource').value = original.promptSource;
    document.getElementById('modelSelect').value = original.modelA;
    document.getElementById('comparisonModelA').value = original.modelAControl;
    document.getElementById('comparisonModelB').value = original.modelB;
    state.promptKey = original.promptKey; state.page = original.page; state.resultsStale = original.resultsStale;
    sharedPromptBinding = original.binding;
    setPage(original.page); renderPromptEditor();
    // 渲染可能重新建立无脏改动的绑定，恢复原引用即可，不编辑任何 Prompt。
    sharedPromptBinding = original.binding;
    const restored = localStorage.getItem(COMPARISON_OPTIONS_KEY) === original.optionRaw;
    delete window.__modelReleaseFrozen;
    delete window.__modelReleaseOriginal;
    return { restored, fixtureRestored: true, readOnlyDraftMetadataRestored };
  });
}

async function exerciseAfter(page, context) {
  await settleHistory(page);
  await page.evaluate(() => {
    const keys = wikiPromptHistory.getController().status().keys;
    window.__modelReleaseOriginal = {
      readOnlyDraftRecords: [{ kind: 'local', key: keys.draft, raw: localStorage.getItem(keys.draft) },
        { kind: 'session', key: keys.session, raw: sessionStorage.getItem(keys.session) }],
      optionRaw: localStorage.getItem(COMPARISON_OPTIONS_KEY), options: comparisonOptions,
      source: state.source, mode: document.getElementById('comparisonMode').value,
      promptSource: document.getElementById('comparisonPromptSource').value,
      modelA: document.getElementById('modelSelect').value, modelAControl: document.getElementById('comparisonModelA').value,
      modelB: document.getElementById('comparisonModelB').value, promptKey: state.promptKey,
      page: state.page, resultsStale: state.resultsStale, binding: sharedPromptBinding,
    };
    window.__modelReleaseAudit = { runClicks: 0, promptInputEvents: 0 };
    document.getElementById('runBtn').addEventListener('click', () => window.__modelReleaseAudit.runClicks++);
    for (const id of ['sharedPromptEditor', 'baselinePromptEditor', 'promptEditor']) {
      document.getElementById(id).addEventListener('input', () => window.__modelReleaseAudit.promptInputEvents++);
    }
  });
  const modelIds = await page.evaluate(() => availableModels.filter(model => model.disabled !== true && model.enabled !== false).map(model => model.id));
  ok(new Set(modelIds).size >= 2, '至少两个真实 active 模型支持独立对比');
  const first = modelIds[0], second = modelIds[1];
  report.activeModels = modelIds.length;
  const navigation = page.locator('[data-page="lab"]').first();
  await navigation.click();
  ok(await page.locator('#labPage').isVisible(), '普通点击进入线上测试页面');
  async function chooseKeyboard(selector, value) {
    const control = page.locator(selector);
    const values = await control.locator('option').evaluateAll(options => options.filter(option => !option.disabled).map(option => option.value));
    const index = values.indexOf(value);
    ok(index >= 0, selector + ' 的目标为真实可选选项');
    await control.focus();
    // 在关闭的原生 select 上 Home / ArrowDown 会正常触发选择；Enter 反而可能重开 popup。
    await control.press('Escape');
    await control.press('Home');
    for (let i = 0; i < index; i++) await control.press('ArrowDown');
    await control.press('Tab');
    const actual = await control.inputValue();
    const detail = selector === '#comparisonMode' ? ` actual=${actual} expected=${value}` : '';
    eq(actual, value, selector + ' 普通键盘选择' + detail);
  }
  async function chooseClick(selector, value) {
    const control = page.locator(selector);
    const snapshot = async () => ({ selected: await control.inputValue(), mode: await page.evaluate(() => captureComparisonConfig().mode) });
    // 单次诊断旧 harness 的原顺序，记录安全 mode 值；不将应用先判为有问题。
    const legacy = { selector, expected: value, before: await snapshot() };
    await control.click(); legacy.afterClick = await snapshot();
    await control.selectOption(value); legacy.afterSelectOption = await snapshot();
    await control.press('Tab'); legacy.afterTab = await snapshot();
    legacy.stalePopupOverwriteObserved = legacy.afterSelectOption.selected === value && legacy.afterTab.selected !== value;
    report.controlDiagnostics.push({ kind: '旧 harness 原生 popup 顺序诊断', ...legacy });
    // 普通 click 只验证可交互，Escape 关闭原生 popup 后再交给 selectOption，不能混用两套选择状态。
    await control.click();
    await control.press('Escape');
    await control.selectOption(value);
    const afterSelection = await snapshot();
    await control.press('Tab');
    const afterTab = await snapshot();
    report.controlDiagnostics.push({ kind: '修正 harness：click / Escape / selectOption / Tab', selector, expected: value, afterSelection, afterTab });
    eq(afterSelection.selected, value, selector + ` 原生控件选择后 actual=${afterSelection.selected} expected=${value}`);
    eq(afterTab.selected, value, selector + ` 原生控件失焦后 actual=${afterTab.selected} expected=${value}`);
    eq(afterTab.mode, value, selector + ' 原生选择后应用捕获模式一致');
  }
  async function verifyMode(mode) {
    eq(await page.evaluate(() => captureComparisonConfig().mode), mode, '捕获当前模式');
    eq(await page.locator('#sharedPromptPane').isVisible(), mode === 'models', '共享 Editor 显示');
    eq(await page.locator('.prompt-compare-grid').isVisible(), mode === 'prompts', '双 Prompt Editor 显示');
    for (const id of ['comparisonPromptSource', 'comparisonModelA', 'comparisonModelB']) eq(await page.locator('#' + id).isVisible(), mode === 'models', id + ' 随模式显示');
  }
  await chooseKeyboard('#comparisonMode', 'prompts'); await verifyMode('prompts');
  await chooseClick('#comparisonMode', 'models'); await verifyMode('models');
  await chooseKeyboard('#comparisonMode', 'prompts'); await verifyMode('prompts');
  await chooseKeyboard('#comparisonMode', 'models'); await verifyMode('models');
  report.tests.push('普通点击与键盘切换 models / prompts，控件与编辑区正确显示');

  const steps = ['step2', 'step3', 'step4', 'step5', 'integration'];
  report.promptEditorChecks = [];
  for (const source of ['current', 'baseline']) {
    await chooseKeyboard('#comparisonPromptSource', source);
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i], tab = page.locator('[data-prompt="' + step + '"]');
      if (i % 2) { await tab.focus(); await tab.press('Enter'); } else await tab.click();
      await settleHistory(page);
      const actual = await page.evaluate(({ source, step }) => {
        const expected = state[source === 'baseline' ? 'baselinePrompts' : 'prompts'][step];
        return { stepMatches: state.promptKey === step, existing: typeof expected === 'string' && expected.length > 0,
          valueMatches: document.getElementById('sharedPromptEditor').value === expected,
          bindingMatches: sharedPromptBinding?.source === source && sharedPromptBinding?.key === step && !sharedPromptBinding?.dirty };
      }, { source, step });
      eq(actual, { stepMatches: true, existing: true, valueMatches: true, bindingMatches: true }, source + ' / ' + step + ' 对应已有 Prompt 且未编辑');
      report.promptEditorChecks.push({ source, step, matchesExistingPrompt: true });
    }
  }
  report.tests.push('current / baseline 完整五项共享 Editor 逐项逐字验证，仅比对、不输出或编辑 Prompt');

  await chooseKeyboard('#comparisonModelB', second);
  await chooseKeyboard('#comparisonModelA', first);
  eq(await page.locator('#modelSelect').inputValue(), first, 'A 同步顶部模型');
  eq(await page.locator('#comparisonModelB').inputValue(), second, 'A 改动不改变 B');
  await chooseKeyboard('#modelSelect', second);
  eq(await page.locator('#comparisonModelA').inputValue(), second, '顶部同步 A');
  eq(await page.locator('#comparisonModelB').inputValue(), second, '顶部改动不改变 B');
  const sameModels = await page.evaluate(() => {
    try { captureComparisonRun(); return { rejected: false }; }
    catch { return { rejected: true, same: captureComparisonConfig().modelA === captureComparisonConfig().modelB }; }
  });
  eq(sameModels, { rejected: true, same: true }, '同 Prompt 模式禁止选择相同模型冻结');
  await chooseKeyboard('#comparisonModelB', first);
  eq(await page.locator('#modelSelect').inputValue(), second, '独立选择 B 不改变顶部模型');
  eq(await page.locator('#comparisonModelA').inputValue(), second, '独立选择 B 不改变 A');
  eq(await page.evaluate(() => { const config = captureComparisonConfig(); return config.modelA !== config.modelB && !!comparisonModel(config.modelA) && !!comparisonModel(config.modelB); }), true, 'A / B 为不同真实 active 模型');
  report.tests.push('A 与顶部双向同步，B 独立、真实 active 且必须不同；不发模型请求');

  // 唯一人工夹具仅替换 state.source 内存，不导入档案、不渲染结果、不点击 run。
  const fixture = await page.evaluate(() => {
    const text = '人工发布验收文本：对象甲使用工具乙。';
    state.source = { id: 'ART-MODEL-RELEASE', name: '人工模型比较只读夹具.txt', text, size: new TextEncoder().encode(text).length, revision: 1 };
    return { synthetic: true, inMemoryOnly: true };
  });
  report.sourceFixture = fixture;
  for (const source of ['current', 'baseline']) {
    await chooseKeyboard('#comparisonPromptSource', source);
    const memoryBeforeCapture = await protectedMemory(page), storageBeforeCapture = digest(await storageSnapshot(page, context));
    const capture = await page.evaluate(() => {
      const frozen = captureComparisonRun(); window.__modelReleaseFrozen = frozen;
      const deeplyFrozen = item => !item || typeof item !== 'object' || Object.isFrozen(item) && Object.values(item).every(deeplyFrozen);
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const promptValuesMatch = field => ['step2', 'step3', 'step4', 'step5', 'integration'].every(key => frozen[field][key] === state[field][key]);
      const before = JSON.stringify(frozen);
      const mutationRejected = (object, key) => {
        const value = object[key]; try { Reflect.set(object, key, '__禁止变更__'); } catch { /* 冻结对象拒绝变更。 */ }
        return object[key] === value;
      };
      return { deeplyFrozen: deeplyFrozen(frozen), distinctSource: frozen.source !== state.source,
        sourceMatches: same(frozen.source, state.source), historyMatches: same(frozen.historySnapshot, { topics: state.previewTopics, entities: state.previews }),
        promptsMatch: promptValuesMatch('prompts') && promptValuesMatch('baselinePrompts'),
        modelAReal: same(frozen.modelConfigs.A, comparisonModel(frozen.modelA)), modelBReal: same(frozen.modelConfigs.B, comparisonModel(frozen.modelB)),
        mutationRejected: mutationRejected(frozen, 'mode') && mutationRejected(frozen.source, 'text') && mutationRejected(frozen.prompts, 'step2') && mutationRejected(frozen.modelConfigs.A, 'id'),
        unchanged: JSON.stringify(frozen) === before, mode: frozen.mode, promptSource: frozen.promptSource };
    });
    eq(capture, { deeplyFrozen: true, distinctSource: true, sourceMatches: true, historyMatches: true, promptsMatch: true,
      modelAReal: true, modelBReal: true, mutationRejected: true, unchanged: true, mode: 'models', promptSource: source }, 'captureComparisonRun 冻结完整配置 ' + source);
    eq(await protectedMemory(page), memoryBeforeCapture, '冻结配置不改变 Prompt / 实体 / 话题 / 文件 / 共享词表');
    eq(digest(await storageSnapshot(page, context)), storageBeforeCapture, '冻结配置不写任何 storage');
    await chooseKeyboard('#comparisonPromptSource', source === 'current' ? 'baseline' : 'current');
    const isolated = await page.evaluate(() => ({
      oldSource: __modelReleaseFrozen.promptSource,
      differentFromLive: __modelReleaseFrozen.promptSource !== captureComparisonConfig().promptSource,
      sourceStillFrozen: Object.isFrozen(__modelReleaseFrozen.source),
    }));
    eq(isolated, { oldSource: source, differentFromLive: true, sourceStillFrozen: true }, '冻结来源不随后续 UI 切换改变');
  }
  await page.evaluate(() => { state.source = __modelReleaseOriginal.source; delete window.__modelReleaseFrozen; });
  report.tests.push('单一 state.source 人工内存夹具验证 captureComparisonRun 深冻结、能力与完整 Prompt / 数据快照，不执行模型或云写');

  for (const width of [1440, 760, 390]) {
    await page.setViewportSize({ width, height: 1050 });
    for (const mode of ['models', 'prompts']) {
      await chooseKeyboard('#comparisonMode', mode); await verifyMode(mode);
      if (mode === 'models') await chooseKeyboard('#comparisonPromptSource', 'current');
      await page.evaluate(() => scrollTo(0, 0));
      const layout = await page.evaluate(() => {
        const ids = ['comparisonMode', 'comparisonPromptSource', 'comparisonModelA', 'comparisonModelB', 'sharedPromptPane', 'promptTabs'];
        const visible = ids.map(id => document.getElementById(id)).filter(element => element.getClientRects().length);
        const overflow = visible.filter(element => { const rect = element.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1; }).map(element => element.id);
        return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth, controlOverflow: overflow };
      });
      ok(layout.scrollWidth <= width + 1 && layout.bodyScrollWidth <= width + 1, width + ' / ' + mode + ' 页面无水平溢出');
      eq(layout.controlOverflow, [], width + ' / ' + mode + ' 比较控件无溢出');
      await page.locator('#comparisonMode').click({ trial: true });
      report.layouts.push({ mode, ...layout });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
  await chooseKeyboard('#comparisonMode', 'models');
  await chooseKeyboard('#comparisonPromptSource', 'current');
  await chooseKeyboard('#comparisonModelA', first); await chooseKeyboard('#comparisonModelB', second);
  await page.locator('[data-prompt="step2"]').click();
  await settleHistory(page);
  const screenshot = path.join(root, 'outputs', `知识Wiki模型对比-线上${outputSuffix ? '-' + outputSuffix : ''}.png`);
  if (fs.existsSync(screenshot)) throw Error('线上截图已存在，拒绝覆盖');
  await page.evaluate(() => { document.getElementById('toast').classList.remove('show'); scrollTo(0, 0); });
  await page.screenshot({ path: screenshot, fullPage: true, mask: [page.locator('textarea'), page.locator('#sourcePreviewText')], maskColor: '#e5e7eb' });
  report.screenshot = screenshot;
  report.screenshotKind = '真实线上模型比较控件；未运行、未伪造结果；完整 Prompt 和文件正文遮罩';
  const audit = await page.evaluate(() => window.__modelReleaseAudit);
  report.runClicks = audit.runClicks; report.promptInputEvents = audit.promptInputEvents;
  eq(audit, { runClicks: 0, promptInputEvents: 0 }, '不点击 run、不编辑 Prompt');
  report.tests.push('1440 / 760 / 390 两种模式布局与真实线上截图；不包含完整 Prompt');
}

(async () => {
  let browser, context, page, baselineStorage, baselineMemory, initialShared, finalShared;
  const loaded = new Map(), responseJobs = [];
  let cleanupDone = false;
  try {
    verifyCompletedSuite();
    let before;
    if (phase === 'after') {
      before = JSON.parse(fs.readFileSync(path.join(root, 'outputs', 'wiki-model-comparison-release-before.json'), 'utf8'));
      eq(before.status, 'passed', 'before 已通过');
      eq(before.testedSourceFingerprint, report.testedSourceFingerprint, '待发布源码与 before 完全一致');
      eq(before.localReportFingerprint, localReportHash, '原专项报告自 before 未改变');
    }
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1050 }, acceptDownloads: false });
    const modelRequest = pathname => /\/(?:chat\/completions|completions|responses|embeddings|rerank|audio|images|generations|generate|inference|invoke)(?:\/|$)/i.test(pathname);
    await context.route('**/*', async route => {
      const request = route.request(), pathname = new URL(request.url()).pathname, method = request.method();
      // 不记录 URL 参数、请求正文、header、凭证或原始 Prompt。
      if (modelRequest(pathname)) report.modelRequests.push({ method, path: pathname });
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) report.blockedWrites.push({ method, path: pathname });
      if (modelRequest(pathname) || !['GET', 'HEAD', 'OPTIONS'].includes(method)) return route.abort('blockedbyclient');
      return route.continue();
    });
    ok(typeof context.routeWebSocket === 'function', '已安装 Playwright 支持强制禁止 WS');
    await context.routeWebSocket('**/*', socket => { report.webSockets.push('已阻止 WebSocket'); socket.close(); });
    report.networkPolicy = { allowedMethods: ['GET', 'HEAD', 'OPTIONS'], modelCallsBlocked: true, webSocketsBlocked: true, serviceWorkersBlocked: true, sdkMocked: false, isolatedContext: true };
    page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', error => report.pageerrors.push({ name: error.name, messageFingerprint: sha(error.message) }));
    page.on('dialog', async dialog => { report.dialogs++; await dialog.dismiss(); });
    page.on('download', () => report.downloads++);
    page.on('response', response => {
      const parsed = new URL(response.url());
      if (parsed.origin !== new URL(url).origin) return;
      const name = parsed.pathname === '/' ? 'index.html' : parsed.pathname.slice(1);
      if (!assets.includes(name) || response.request().resourceType() !== (name === 'index.html' ? 'document' : 'script')) return;
      responseJobs.push((async () => { const bytes = await response.body(); loaded.set(name, { status: response.status(), fingerprint: sha(bytes) }); })().catch(() => { loaded.set(name, { bodyReadFailed: true }); }));
    });
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    ok(response?.ok(), '真实线上主文档 HTTP 成功');
    await page.waitForFunction(() => availableModels.length > 0 && workbookReady && fileManagerReady && wikiPromptHistory.getController()?.status().ready
      && !wikiPromptHistory.getController().status().busy && !cloudLoading && !workbookBusy, null, { timeout: 90000 });
    initialShared = await readShared(page); report.shared = initialShared;
    ok(initialShared.types > 0, '真实共享 active 类型数大于零');
    ok(initialShared.historyPagination.terminalEmptyPage, '完整历史分页到空页');
    eq(initialShared.historyPagination.uniqueVersions, initialShared.promptVersions, '完整历史无重复版本');
    baselineStorage = await storageSnapshot(page, context); baselineMemory = await protectedMemory(page);
    report.storageInitialFingerprint = digest(baselineStorage);
    report.protectedMemoryInitialFingerprint = baselineMemory;
    await Promise.all(responseJobs);
    for (const name of assets) {
      const fetched = await page.evaluate(async name => {
        const response = await fetch(new URL(name, location.href), { method: 'GET', cache: 'no-store' });
        const bytes = new Uint8Array(await response.arrayBuffer());
        const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(byte => byte.toString(16).padStart(2, '0')).join('');
        return { status: response.status, fingerprint };
      }, name);
      ok(fetched.status === 200, name + ' 真实线上只读资源成功');
      ok(loaded.has(name) && loaded.get(name).status === 200, name + ' 由浏览器实际加载');
      eq(loaded.get(name).fingerprint, fetched.fingerprint, name + ' 浏览器加载资源与实时 GET 相同');
      const matchesLocal = fetched.fingerprint === report.testedSourceFingerprint[name];
      if (phase === 'after') ok(matchesLocal, name + ' 已加载 / 线上 / 本地逐字节一致（不归一换行）');
      report.resources.push({ name, loadedFingerprint: loaded.get(name).fingerprint, onlineFingerprint: fetched.fingerprint, localFingerprint: report.testedSourceFingerprint[name], matchesLocal });
    }
    report.tests.push('真实线上页面加载；SDK savedWorkbook / 版本 / active 类型数 / 完整分页历史只读指纹');
    if (phase === 'after') {
      for (const key of ['workbookFingerprint', 'workbookRevision', 'types', 'promptFingerprint', 'promptVersions', 'promptHeadRevision', 'sharedFingerprint']) eq(initialShared[key], before.shared[key], '与 before 共享完整指纹一致：' + key);
      report.tests.push('发布后共享配置与 before 完整指纹一致；五源码浏览器加载 / 线上 / 本地逐字节一致');
      await exerciseAfter(page, context);
      report.optionsRestore = await restoreOwnOptions(page);
      cleanupDone = true;
      ok(report.optionsRestore.restored && report.optionsRestore.fixtureRestored, '精准恢复自身 comparisonOptions 与单一内存 source 夹具');
      report.tests.push('自身 context 的普通 STEP 只读 flush 时间戳仅在业务内容完全一致时精准还原；其他 storage 不回写');
    }
    report.protectedMemoryFinalFingerprint = await protectedMemory(page);
    eq(report.protectedMemoryFinalFingerprint, baselineMemory, '验收结束 Prompt / 实体 / 话题 / 文件档案 / 词表内存不变');
    const finalStorage = await storageSnapshot(page, context);
    report.storageFinalFingerprint = digest(finalStorage);
    eq(finalStorage, baselineStorage, '恢复后所有 localStorage / sessionStorage / cookie / IndexedDB 完整不变');
    finalShared = await readShared(page); report.sharedFinal = finalShared;
    eq(finalShared, initialShared, '验收结束真实 SDK 共享完整指纹与分页结果不变');
    eq(localHashes(), report.testedSourceFingerprint, '本地五源码验收前后未改变');
    eq(sha(fs.readFileSync(localReportPath)), localReportHash, '原专项报告未覆盖或修改');
    eq(report.pageerrors, [], '零 pageerror'); eq(report.blockedWrites, [], '零非只读请求尝试 / 云写');
    eq(report.modelRequests, [], '零模型请求'); eq(report.webSockets, [], '零 WebSocket 尝试');
    eq([report.dialogs, report.downloads, report.runClicks, report.promptInputEvents], [0, 0, 0, 0], '零意外弹窗 / 下载 / run 点击 / Prompt 输入');
    report.tests.push('收尾：共享完整指纹、业务内存和全部 storage 不变；零 pageerror / 云写 / 模型请求；应用及原报告未修改');
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    // 错误文本仅允许本脚本自己的安全标签；外部 SDK / 浏览器详情只保存摘要。
    const message = String(error.message || '');
    report.error = message.startsWith('验收断言失败：') ? message : '执行失败，原始错误已脱敏';
    report.errorFingerprint = sha(String(error.stack || message));
    process.exitCode = 1;
  } finally {
    if (phase === 'after' && page && !cleanupDone) {
      try {
        report.optionsRestore = await restoreOwnOptions(page);
        if (baselineMemory) eq(await protectedMemory(page), baselineMemory, '失败收尾业务内存仍不变');
        if (baselineStorage) eq(await storageSnapshot(page, context), baselineStorage, '失败收尾只精准恢复本 context 的选项，其他 storage 不变');
        if (initialShared) eq(await readShared(page), initialShared, '失败收尾共享完整指纹不变');
      } catch (error) { report.status = 'failed'; report.cleanupErrorFingerprint = sha(String(error.message)); process.exitCode = 1; }
    }
    if (browser) {
      try { await browser.close(); } catch { report.status = 'failed'; report.closeError = true; process.exitCode = 1; }
    }
    // 浏览器清理结束后再检查网络记录，避免迟到事件漏报。
    if (report.pageerrors.length || report.blockedWrites.length || report.modelRequests.length || report.webSockets.length) { report.status = 'failed'; process.exitCode = 1; }
    report.preservedReleaseReports = Object.keys(protectedReleaseReports);
    report.preservedReportsUnchanged = Object.entries(protectedReleaseReports).every(([name, fingerprint]) =>
      fs.existsSync(path.join(root, 'outputs', name)) && sha(fs.readFileSync(path.join(root, 'outputs', name))) === fingerprint);
    if (!report.preservedReportsUnchanged) { report.status = 'failed'; report.reportProtectionError = true; process.exitCode = 1; }
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ status: report.status, phase, assertions: report.assertions, passedAssertions: report.passedAssertions,
      localScenarios: report.localScenarios, localAssertions: report.localAssertions, sourceFingerprintsConfirmed: report.sourceFingerprintsConfirmed,
      shared: report.shared, pageerrors: report.pageerrors.length, blockedWrites: report.blockedWrites.length,
      realCloudWrites: report.realCloudWrites, modelRequests: report.modelRequests.length, webSockets: report.webSockets.length,
      oldTestsExecuted: report.oldTestsExecuted, output, error: report.error }, null, 2));
  }
})();
