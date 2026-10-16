'use strict';

// 只编写后交接；必须由主代理显式提供 --source-ready 才能执行浏览器回归。
if (!process.argv.includes('--source-ready')) {
  console.error('未提供 --source-ready；不启动浏览器、不读取应用、不生成报告。语法检查请使用 node --check。');
  process.exitCode = 2;
} else {
  main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
}

async function main() {
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const crypto = require('node:crypto');
  const nativeAssert = require('node:assert/strict');
  const vm = require('node:vm');
  const root = path.resolve(__dirname, '..');
  const app = path.join(root, 'wiki-demo-mvp');
  const outputs = path.join(root, 'outputs');
  const names = ['index.html', 'semantic-tags.js', 'pipeline.js', 'file-manager.js', 'prompt-history.js'];
  const sample = '巫师3新手指南介绍角色玩法。杰洛特是巫师3中玩家可以操控的猎魔人。杰洛特使用银剑。';
  // 长文仍只重复这三句人工文本，不读取其他资料。
  const longSample = (sample + '\n').repeat(180).trim();
  const steps = ['step2', 'step3', 'step4', 'step5', 'integration'];
  const origin = 'http://127.0.0.1:19432';
  const reportFile = path.join(outputs, 'wiki-model-comparison-tests.json');
  const screenshotFile = path.join(outputs, '知识Wiki模型对比-本地.png');
  const allowedOutputs = new Set([path.basename(reportFile), path.basename(screenshotFile)]);
  const report = {
    kind: '真实本地五模块与真实 pipeline；人工文本；仅模拟 SDK；非云端、非真实模型、非用户数据',
    sourceReady: true, managedNode: process.execPath, modules: names, scenarios: [],
    assertions: [], network: [], harnessErrors: [], startedAt: new Date().toISOString()
  };
  let browser, sources, protectedBefore, outputBefore, currentScenario, lastPage;
  const sessions = [];
  // 每次实际调用一个断言方法才计数；不使用预计场景数或预计断言数。
  const a = new Proxy(nativeAssert, {
    get(target, key) {
      if (typeof target[key] !== 'function') return target[key];
      return (...args) => {
        const entry = { scenario: currentScenario?.name || '收尾', method: String(key), pass: false };
        report.assertions.push(entry);
        if (currentScenario) currentScenario.assertions++;
        try { const result = target[key](...args); entry.pass = true; return result; }
        catch (error) { entry.reason = error.message; throw error; }
      };
    }
  });
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  function protectedHashes() {
    const files = names.map(name => path.join(app, name));
    files.push(path.join(app, '游戏研发知识Wiki受控索引标签词表.xlsx'));
    // 只读取脚本字节用于保护哈希；不会 require 或执行任何旧专项。
    for (const entry of fs.readdirSync(__dirname, { withFileTypes: true })) {
      if (entry.isFile() && /\.(?:cjs|mjs|js|py|sql)$/.test(entry.name) && entry.name !== path.basename(__filename))
        files.push(path.join(__dirname, entry.name));
    }
    return Object.fromEntries(files.sort().map(file => [path.relative(root, file).replace(/\\/g, '/'), hash(file)]));
  }
  function outputInventory() {
    const result = {};
    function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, e.name), relative = path.relative(outputs, file).replace(/\\/g, '/');
        if (e.isDirectory()) walk(file);
        // 既有输出只看元信息，不读取真实测试报告或用户内容。
        else if (!allowedOutputs.has(relative)) {
          const stat = fs.statSync(file); result[relative] = [stat.size, stat.mtimeMs];
        }
      }
    }
    walk(outputs); return result;
  }

  function installMock() {
    const clone = value => structuredClone(value);
    const mock = window.comparisonMock = {
      promptRows: [], queries: [], writes: [], calls: [], allCalls: [], active: 0, maxActive: 0, seedLoads: 0,
      promptDelay: 0, workbookDelay: 0, modelDelay: 24, workbookRevision: 1,
      failPrompt: false, failWorkbook: false, holdPrompt: false, holdWorkbook: false,
      promptRelease: null, workbookRelease: null, failure: null, downloads: [],
      delays: {}, previewBranches: [], archiveSnapshots: [], storageWrites: []
    };
    const delay = (ms, signal) => new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException('模拟停止', 'AbortError'));
      const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new DOMException('模拟停止', 'AbortError')); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
      signal?.addEventListener('abort', abort, { once: true });
    });
    const workbook = () => ({ sheets: [
      { name: '实体类型标签', rows: [['人工模拟词表'], [], [], ['类型 ID', '管理分组', '正式标签', '定义', '包含示例', '排除与边界', '赋值规则', '状态', '同义名称'], ['ET-CHAR-PLAYABLE', '人物与角色', '可玩角色', '玩家可以直接操控的具名角色。', '杰洛特', '不可操控的剧情人物不属于本类型。', '选最具体类型', 'active', '玩家角色']] },
      { name: '业务分面', rows: [['人工模拟分面'], [], [], ['分面 ID', '分面名称', '正式取值', '值类型', '基数', '值来源', '主要用途', '未命中处理'], ['F-PRODUCT', '所属产品', '开放值', 'string', 'multiple', '证据', '检索', '建议']] },
      { name: '赋值与治理规则', rows: [['人工模拟规则'], [], [], ['规则 ID', '场景', '规则', '程序门控', '处理方式'], ['R-1', '抽取', '证据校验', '启用', '隔离']] },
      defaultRelationSheet()
    ] });
    window.XLSX = {
      read() { const w = workbook(); return { SheetNames: w.sheets.map(s => s.name), Sheets: Object.fromEntries(w.sheets.map(s => [s.name, s.rows])) }; },
      utils: { sheet_to_json: rows => clone(rows) }
    };
    const database = { from(table) {
      if (!['wiki_prompt_versions', 'wiki_shared_tag_workbook'].includes(table)) throw Error('禁止访问非模拟表：' + table);
      return {
        filters: [], max: Infinity, one: false, payload: null,
        select() { return this; }, order() { return this; }, limit(n) { this.max = n; return this; },
        eq(k, v) { this.filters.push([k, v, 'eq']); return this; },
        lt(k, v) { this.filters.push([k, v, 'lt']); return this; },
        single() { this.one = true; return this; }, maybeSingle() { this.one = true; return this; },
        insert(p) { this.payload = clone(p); return this; },
        then(resolve, reject) { return execute(table, this).then(resolve, reject); }
      };
    } };
    async function execute(table, q) {
      const event = { table, write: !!q.payload, filters: clone(q.filters), start: performance.now(), end: null };
      mock.queries.push(event);
      try {
        if (table === 'wiki_shared_tag_workbook') {
          if (q.payload) throw Error('禁止写模拟词表');
          if (mock.holdWorkbook) { mock.holdWorkbook = false; await new Promise(resolve => { mock.workbookRelease = () => { mock.workbookRelease = null; resolve(); }; }); }
          await delay(mock.workbookDelay);
          if (mock.failWorkbook) throw Error('模拟词表读取故障');
          return { data: { id: 1, revision: mock.workbookRevision, workbook: workbook() } };
        }
        if (mock.holdPrompt) { mock.holdPrompt = false; await new Promise(resolve => { mock.promptRelease = () => { mock.promptRelease = null; resolve(); }; }); }
        await delay(mock.promptDelay);
        if (mock.failPrompt) throw Error('模拟提示词同步读取故障');
        if (q.payload) {
          const p = q.payload, latest = mock.promptRows.at(-1);
          if (mock.promptRows.some(row => row.request_id === p.request_id)) return { error: { code: '23505' } };
          if (String(latest.revision) !== String(p.parent_revision)) return { error: { code: '40001' } };
          wikiPromptHistory.validate(p.snapshot);
          if (wikiPromptHistory.same(latest.snapshot, p.snapshot)) return { error: { code: '23514' } };
          if (String(p.revision) !== String(BigInt(latest.revision) + 1n)) throw Error('模拟版本号契约错误');
          const changed = wikiPromptHistory.SIDES.flatMap(side => wikiPromptHistory.STEPS.filter(step => latest.snapshot[side][step] !== p.snapshot[side][step]).map(step => side + '.' + step));
          const row = { ...p, changed_steps: changed, created_at: new Date().toISOString() };
          mock.promptRows.push(clone(row)); mock.writes.push(clone(row)); return { data: [clone(row)] };
        }
        const rows = mock.promptRows.filter(row => q.filters.every(([k, v, op]) => op === 'lt' ? BigInt(row[k]) < BigInt(v) : String(row[k]) === String(v)))
          .sort((x, y) => BigInt(x.revision) > BigInt(y.revision) ? -1 : 1).slice(0, q.max);
        return { data: clone(q.one ? rows[0] || null : rows) };
      } finally { event.end = performance.now(); }
    }
    const models = [
      { id: 'mock-timing', name: 'GLM 5.3 Flash', enabled: true, maxInputTokens: 1000000, reasoning: { supportedEfforts: ['low', 'medium'] } },
      { id: 'mock-second', name: 'Model B', enabled: true, maxInputTokens: 1000000, reasoning: { supportedEfforts: [] } },
      { id: 'mock-disabled', name: 'Disabled Model', enabled: false, disabled: true, maxInputTokens: 1000000 }
    ];
    const llm = { models: { list: async () => clone(models) }, chat: { completions: { create: async function* (options) {
      const input = options.messages[1]?.content || '';
      const phase = input.includes('\n全局整合规则：') ? 'integration' : 'extraction';
      const record = window.wikiRunTiming?.current();
      const branch = record?.status === 'running' ? (record.branches.current.start !== null ? 'B' : 'A') : (options.model === 'mock-second' ? 'B' : 'A');
      const segment = Number(input.match(/\n当前段 (\d+)\/\d+，全局字符位置 /)?.[1] || 1);
      const call = {
        order: mock.allCalls.length + 1, branch, phase, segment, model: options.model,
        messages: clone(options.messages), reasoning_effort: options.reasoning_effort ?? null,
        reasoningKeys: Object.keys(options).filter(k => /reasoning|thinking/i.test(k)),
        stream: options.stream, response_format: clone(options.response_format), stream_options: clone(options.stream_options),
        recordId: record?.status === 'running' ? record.id : null, start: performance.now(), end: null, status: 'running'
      };
      mock.calls.push(call); mock.allCalls.push(call); mock.active++; mock.maxActive = Math.max(mock.maxActive, mock.active);
      try {
        if (options.messages[0]?.role !== 'system' || options.stream !== true || options.response_format?.type !== 'json_object') throw Error('模拟 SDK 请求协议错误');
        await delay(mock.delays[branch + ':' + phase + ':' + segment] ?? mock.modelDelay, options.signal);
        const f = mock.failure;
        if (f && (!f.branch || f.branch === branch) && (!f.phase || f.phase === phase) && (!f.segment || f.segment === segment)) {
          if (f.once) mock.failure = null;
          throw Error('模拟' + branch + '/' + phase + '/' + segment + '请求故障');
        }
        let raw;
        if (phase === 'extraction') {
          const quote = '杰洛特是巫师3中玩家可以操控的猎魔人。';
          // 小分段可能没有完整证据；合法空候选，不在段外伪造证据。
          const partText = input.match(/\n当前段 \d+\/\d+，全局字符位置 [^\n]+\n([\s\S]*?)\n只输出完整JSON：/)?.[1];
          if (typeof partText !== 'string') throw Error('模拟模型无法解析真实分段输入协议');
          raw = partText.includes(quote) ? {
            topics: [{ id: 'T1', name: '巫师3新手角色玩法', definition: '新手理解角色玩法', scope: '新手角色玩法', object_anchor: '巫师3', core_question: '角色入门玩法', includes: ['入门'], excludes: ['高阶竞技'], quote }],
            entities: [{ id: 'M1', name: '杰洛特', definition: '玩家可操控的猎魔人', quote, aliases: [], type_id: 'ET-CHAR-PLAYABLE', type: '可玩角色', anchors: { ontology_type: '可玩角色', reality_domain: '虚构', product_ip_scope: '巫师3', identity_attributes: {} }, topic_ids: ['T1'], primary_topic_id: 'T1', facets: { product: [], discipline: [], version: [] }, candidate_tags: [], relations: [] }], review: []
          } : { topics: [], entities: [], review: [] };
        } else {
          const topics = JSON.parse(input.split('全部有效话题候选：')[1].split('\n全部有效实体候选：')[0]);
          const entities = JSON.parse(input.split('全部有效实体候选：')[1].split('\n冻结历史话题')[0]);
          raw = {
            topic_groups: topics.length ? [{ id: 'GT1', members: topics.map(t => t.id), name: '巫师3新手角色玩法', decision: 'keep', reason: '同一具体问题和范围', scope_equivalent: true, boundary_basis: '均为新手角色入门，排除高阶竞技' }] : [],
            entity_groups: entities.length ? [{ id: 'GE1', members: entities.map(e => e.id), name: '杰洛特', topics: ['GT1'], primary_topic: 'GT1', decision: 'keep', reason: '同一虚构游戏中的可玩猎魔人' }] : []
          };
        }
        const body = JSON.stringify(raw), mid = Math.floor(body.length / 2);
        yield { choices: [{ delta: { content: body.slice(0, mid) }, finish_reason: null }] };
        await delay(1, options.signal);
        yield { choices: [{ delta: { content: body.slice(mid) }, finish_reason: 'stop' }], usage: { total_tokens: 321 } };
        call.status = 'success';
      } catch (error) { call.status = error.name === 'AbortError' ? 'stopped' : 'failed'; throw error; }
      finally { call.end = performance.now(); mock.active--; }
    } } } };
    window.WorkBuddyCloud = { createWorkBuddyCloud() {
      mock.seedLoads++;
      if (!mock.promptRows.length) mock.promptRows.push({ revision: '1', parent_revision: '0', snapshot: { baseline: clone(DEFAULT_PROMPTS), current: clone(DEFAULT_PROMPTS) }, request_id: crypto.randomUUID(), action: 'initial', note: '人工模拟种子', editor_label: '模拟匿名', changed_steps: [], created_at: new Date().toISOString(), restored_from: null });
      return { database, llm };
    } };
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      mock.storageWrites.push({ key, at: performance.now(), activeModels: mock.active });
      return originalSet.call(this, key, value);
    };
    // 拦截真正的 export Blob，仅在浏览器内存中读取，不触发下载文件。
    const blobs = new Map(), originalURL = URL.createObjectURL.bind(URL), originalRevoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = originalURL(blob); blobs.set(url, blob); return url; };
    URL.revokeObjectURL = url => { blobs.delete(url); originalRevoke(url); };
    const anchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) {
        const entry = { name: this.download, text: null, error: null }; mock.downloads.push(entry);
        const blob = blobs.get(this.href);
        if (!blob) { entry.error = '未捕获导出 Blob'; return; }
        blob.text().then(text => { entry.text = text; }, error => { entry.error = error.message; });
        return;
      }
      return anchorClick.call(this);
    };
  }

  async function session() {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, serviceWorkers: 'block', acceptDownloads: false });
    sessions.push(context);
    await context.addInitScript(installMock);
    const network = [], errors = [], loaded = [];
    report.network.push(network);
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      const entry = { method: request.method(), url: request.url(), action: '禁止' }; network.push(entry);
      if (request.method() !== 'GET') return route.abort('blockedbyclient');
      if (url.origin === origin) {
        const name = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
        if (Object.hasOwn(sources, name)) {
          entry.action = '真实本地模块'; loaded.push(name);
          return route.fulfill({ contentType: name.endsWith('.html') ? 'text/html;charset=utf-8' : 'application/javascript;charset=utf-8', body: sources[name] });
        }
        if (name === '游戏研发知识Wiki受控索引标签词表.xlsx') {
          entry.action = '人工词表占位'; return route.fulfill({ contentType: 'application/octet-stream', body: Buffer.from('mock-workbook') });
        }
        if (name === 'favicon.ico') { entry.action = '空图标'; return route.fulfill({ status: 204, body: '' }); }
        return route.abort('blockedbyclient');
      }
      // 只允许源码声明的外部静态脚本占位；绝不 continue/fetch 外网。
      if (request.resourceType() === 'script' && staticScripts.has(request.url())) {
        entry.action = '静态脚本本地占位'; return route.fulfill({ contentType: 'application/javascript', body: '' });
      }
      return route.abort('blockedbyclient');
    });
    const page = await context.newPage(); lastPage = page;
    currentScenario.page = page;
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.type() === 'confirm' ? dialog.accept() : dialog.dismiss());
    page.on('download', () => errors.push('禁止产生真实浏览器下载'));
    await page.goto(origin + '/');
    await page.waitForFunction(() => wikiPromptHistory.getController().status().ready && workbookReady && !cloudLoading && fileManagerReady);
    await page.evaluate(() => setPage('lab'));
    const initial = await page.evaluate(() => ({ defaults: structuredClone(DEFAULT_PROMPTS), seeded: comparisonMock.seedLoads, writes: comparisonMock.writes.length, bound: document.getElementById('runBtn').onclick === runCurrent }));
    a.deepEqual([...new Set(loaded)].sort(), names.slice().sort());
    a.equal(initial.seeded, 1); a.equal(initial.writes, 0); a.equal(initial.bound, true);
    currentScenario.resources = [...new Set(loaded)];
    currentScenario.defaultsHash = crypto.createHash('sha256').update(JSON.stringify(initial.defaults)).digest('hex');
    currentScenario.errors = errors;
    currentScenario.defaults = initial.defaults;
    return page;
  }
  let staticScripts = new Set();
  async function scenario(name, fn) {
    const entry = { name, pass: false, assertions: 0, start: new Date().toISOString() };
    report.scenarios.push(entry); currentScenario = entry;
    try { await fn(); a.ok(entry.assertions > 0, '场景必须发生实际断言'); entry.pass = true; }
    catch (error) { entry.reason = error.message; entry.stack = error.stack; console.error('场景失败：' + name + '；' + error.message); }
    finally {
      const page = entry.page;
      if (page && !page.isClosed()) {
        try {
          entry.evidence = await capture(page);
          if (entry.defaults) {
            const defaults = await page.evaluate(() => structuredClone(DEFAULT_PROMPTS));
            a.deepEqual(defaults, entry.defaults, '测试不得改变 Prompt 默认值');
          }
          a.deepEqual(entry.errors || [], [], '页面不得出现未处理异常');
          a.deepEqual(entry.evidence.allCalls.map(c => c.order), entry.evidence.allCalls.map((_, i) => i + 1), '包括失败、停止和重试在内的实际 SDK 请求顺序不得丢失');
        } catch (error) { entry.pass = false; entry.cleanupError = error.message; }
        if (!entry.pass) {
          try { await page.screenshot({ path: screenshotFile, fullPage: true }); report.screenshotKind = '最后一个失败场景'; }
          catch (error) { entry.screenshotError = error.message; }
        }
        try {
          // 释放测试屏障并中止模型，防止失败场景影响后续隔离上下文。
          await page.evaluate(() => { comparisonMock.promptRelease?.(); comparisonMock.workbookRelease?.(); stopAllModelRequests(); wikiPromptHistory.getController().cancelTimer(); });
        } catch (error) { entry.pass = false; entry.releaseError = error.message; }
        try { await page.context().close(); } catch (error) { entry.pass = false; entry.closeError = error.message; }
      }
      delete entry.page; delete entry.defaults;
      entry.end = new Date().toISOString(); currentScenario = null;
      console.log('已执行场景：' + name + '；' + (entry.pass ? 'pass' : 'fail') + '；实际断言 ' + entry.assertions);
    }
  }
  async function prepare(page, { mode = 'models', promptSource = 'current', long = false, different = false } = {}) {
    await page.locator('#fileInput').setInputFiles({ name: '杰洛特-人工模型对比.txt', mimeType: 'text/plain', buffer: Buffer.from(long ? longSample : sample, 'utf8') });
    await page.waitForFunction(() => !!state.source?.id && !fileReading);
    await page.locator('#comparisonMode').selectOption(mode);
    if (mode === 'models') {
      await page.locator('#comparisonPromptSource').selectOption(promptSource);
      await page.locator('#comparisonModelB').selectOption('mock-second');
    }
    if (different) {
      await page.evaluate(() => {
        const c = wikiPromptHistory.getController(), s = c.status().snapshot;
        s.current.integration += '\n人工回归：只归并相同身份。';
        state.prompts = structuredClone(s.current); state.baselinePrompts = structuredClone(s.baseline);
        sharedPromptBinding = null; renderPromptEditor(); c.changed(s); c.cancelTimer();
      });
      await page.evaluate(() => wikiPromptHistory.ensureSynced());
    }
    await page.evaluate(() => {
      comparisonMock.calls = []; comparisonMock.maxActive = 0;
      window.comparisonHistoryFixture = { files: structuredClone(state.files), topics: structuredClone(state.previewTopics), entities: structuredClone(state.previews) };
    });
    const source = await page.evaluate(() => ({ source: structuredClone(state.source), parts: splitSourceForModel(state.source.text).length }));
    a.equal(source.source.text, long ? longSample : sample);
    a.ok(source.source.id.startsWith('F-')); a.equal(source.source.revision, 1);
    if (long) a.ok(source.parts >= 2);
  }
  async function capture(page) {
    return page.evaluate(() => ({
      record: structuredClone(wikiRunTiming.current()), calls: structuredClone(comparisonMock.calls), allCalls: structuredClone(comparisonMock.allCalls),
      queries: structuredClone(comparisonMock.queries), writes: structuredClone(comparisonMock.writes),
      maxActive: comparisonMock.maxActive, baseline: structuredClone(state.baseline), current: structuredClone(state.current),
      previews: structuredClone(state.previews), topics: structuredClone(state.previewTopics), files: structuredClone(state.files),
      previewBranches: structuredClone(comparisonMock.previewBranches), archiveSnapshots: structuredClone(comparisonMock.archiveSnapshots),
      downloads: structuredClone(comparisonMock.downloads), stale: state.resultsStale,
      cleanup: { requests: wikiRequests.size, active: comparisonMock.active, running: isRunning, waiting: comparisonRunWaiting, runControl: !!activeRunControl },
      ui: { timing: document.getElementById('timingStatus').textContent, a: document.getElementById('baselineResultTitle').textContent, b: document.getElementById('currentResultTitle').textContent }
    }));
  }
  async function start(page) {
    const id = await page.evaluate(() => wikiRunTiming.current()?.id || null);
    a.equal(await page.locator('#runBtn').isEnabled(), true, '运行前按钮应可用');
    await page.locator('#runBtn').click();
    await page.waitForFunction(previous => !!wikiRunTiming.current() && wikiRunTiming.current().id !== previous, id);
  }
  async function finish(page) {
    await page.waitForFunction(() => wikiRunTiming.current()?.end !== null && wikiRunTiming.current()?.end !== undefined && wikiRunTiming.current().status !== 'running');
    const data = await capture(page);
    a.deepEqual(data.cleanup, { requests: 0, active: 0, running: false, waiting: false, runControl: false });
    return data;
  }
  async function run(page) { await start(page); return finish(page); }
  function success(data, count = 4) {
    a.equal(data.record.status, 'success'); a.equal(data.calls.length, count);
    a.ok(data.baseline?.preview_eligible); a.ok(data.current?.preview_eligible);
    a.equal(data.baseline.steps.step5.entity_results[0].tags.entity_type, '可玩角色');
    a.equal(data.current.steps.step5.entity_results[0].tags.entity_type, '可玩角色');
    a.ok(data.record.branches.current.start >= data.record.branches.baseline.end);
    for (const branch of ['baseline', 'current']) a.equal(data.record.branches[branch].status, 'success');
  }
  async function restoreHistory(page) {
    await page.evaluate(() => {
      const h = comparisonHistoryFixture;
      commitFileWorkspace(structuredClone(h.files), structuredClone(h.topics), structuredClone(h.entities));
      comparisonMock.calls = []; comparisonMock.maxActive = 0;
    });
  }
  async function spyPersistence(page) {
    // 只观察并调用原函数，绝不替换 processSource 或跳过真实保存。
    await page.evaluate(() => {
      const preview = addLocalPreview, archive = fileRunSnapshot;
      addLocalPreview = function (result) { comparisonMock.previewBranches.push(result.comparison?.branch); return preview(result); };
      fileRunSnapshot = function (result) { const value = archive(result); comparisonMock.archiveSnapshots.push(structuredClone(value)); return value; };
    });
  }
  function metadata(data, promptSource) {
    const frozen = data.record.comparisonConfig;
    for (const [branch, result] of [['A', data.baseline], ['B', data.current]]) {
      const m = result.comparison;
      a.deepEqual(Object.keys(m).sort(), ['mode', 'branch', 'prompt_source', 'model_id', 'prompt_snapshot', 'source', 'workbook_revision', 'model_config'].sort());
      a.equal(m.mode, frozen.mode); a.equal(m.branch, branch);
      a.equal(m.model_id, frozen[branch === 'A' ? 'modelA' : 'modelB']);
      a.equal(m.prompt_source, frozen.mode === 'models' ? promptSource : null);
      a.deepEqual(m.prompt_snapshot, frozen.mode === 'models' ? frozen[promptSource === 'baseline' ? 'baselinePrompts' : 'prompts'] : frozen[branch === 'A' ? 'baselinePrompts' : 'prompts']);
      a.deepEqual(Object.keys(m.prompt_snapshot).sort(), steps.slice().sort());
      a.deepEqual(m.source, { id: frozen.source.id, name: frozen.source.name, revision: frozen.source.revision });
      a.equal(m.workbook_revision, 1); a.deepEqual(m.model_config, frozen.modelConfigs[branch]);
    }
  }
  async function blockedSelection(kind) {
    const page = await session(); await prepare(page);
    const result = await page.evaluate(kind => {
      const b = document.getElementById('comparisonModelB');
      if (kind === 'missing') b.value = '';
      if (kind === 'same') b.value = document.getElementById('modelSelect').value;
      if (kind === 'disabled') {
        availableModels.push({ id: 'mock-disabled', name: 'Disabled Model', enabled: false, disabled: true });
        refreshComparisonModels();
        comparisonOptions.modelB = 'mock-disabled'; b.value = 'mock-disabled';
      }
      if (kind === 'noB') { availableModels = availableModels.filter(m => m.id === 'mock-timing'); refreshComparisonModels(); }
      if (kind === 'noA') document.getElementById('modelSelect').value = '';
      updateRunReadiness();
      let error = ''; try { captureComparisonRun(); } catch (e) { error = e.message; }
      return { error, disabled: document.getElementById('runBtn').disabled, calls: comparisonMock.calls.length };
    }, kind);
    a.ok(result.error); a.equal(result.disabled, true); a.equal(result.calls, 0);
    // 强行 DOM click 也不能绕过真实 capture 检查。
    await page.evaluate(() => document.getElementById('runBtn').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForFunction(() => wikiRunTiming.current()?.end !== null && wikiRunTiming.current()?.end !== undefined);
    const d = await capture(page); a.equal(d.calls.length, 0); a.equal(d.record.status, 'failed');
  }
  async function drift(waitAt, lowCapacity = false) {
    const page = await session(); await prepare(page);
    await page.evaluate(({ waitAt, lowCapacity }) => {
      if (lowCapacity) availableModels.find(m => m.id === 'mock-timing').maxInputTokens = 1;
      comparisonMock[waitAt === 'prompt' ? 'holdPrompt' : 'holdWorkbook'] = true;
    }, { waitAt, lowCapacity });
    await start(page);
    await page.waitForFunction(at => !!comparisonMock[at === 'prompt' ? 'promptRelease' : 'workbookRelease'], waitAt);
    const frozen = await page.evaluate(() => structuredClone(wikiRunTiming.current().comparisonConfig));
    const locks = await page.evaluate(() => ({
      ids: ['comparisonMode', 'comparisonPromptSource', 'comparisonModelA', 'comparisonModelB', 'sharedPromptEditor', 'modelSelect', 'fileInput', 'replaceFileBtn', 'clearFileBtn', 'archiveAddBtn', 'saveFileEditBtn', 'replaceArchiveFileBtn'].map(id => [id, document.getElementById(id).disabled]),
      drop: document.getElementById('fileDrop').getAttribute('aria-disabled'),
      tabs: [...document.querySelectorAll('[data-prompt]')].every(n => n.disabled),
      fileButtons: [...document.querySelectorAll('[data-file-action]')].every(n => n.disabled),
      allowed: fileMutationAllowed()
    }));
    for (const [id, disabled] of locks.ids) a.equal(disabled, true, id);
    a.equal(locks.drop, 'true'); a.equal(locks.tabs, true); a.equal(locks.fileButtons, true); a.equal(locks.allowed, false);
    const guard = await page.evaluate(() => {
      const before = JSON.stringify([state.source, state.files]);
      clearUploadedFile(); selectArchiveFile(state.source.id);
      let error = ''; try { updateArchiveFile(state.source.id, '禁止等待中改名.txt', state.source.text, state.source.size); } catch (e) { error = e.message; }
      return { same: before === JSON.stringify([state.source, state.files]), error };
    });
    a.equal(guard.same, true); a.ok(guard.error);
    await page.evaluate(({ waitAt, lowCapacity }) => {
      document.getElementById('comparisonPromptSource').value = 'baseline';
      document.getElementById('comparisonModelB').value = 'mock-timing';
      document.getElementById('modelSelect').value = 'mock-second';
      document.getElementById('sharedPromptEditor').value = '等待期间强改 DOM，不得进入请求';
      state.source.name = '漂移名称.txt'; state.source.text = '漂移正文';
      state.prompts.step2 = '漂移规则';
      const model = availableModels.find(m => m.id === 'mock-timing');
      model.name = '漂移模型名称'; model.maxInputTokens = lowCapacity ? 1000000 : 1; model.reasoning.supportedEfforts = [];
      const second = availableModels.find(m => m.id === 'mock-second');
      second.maxInputTokens = 1; second.reasoning.supportedEfforts = ['low'];
      state.previewTopics.push({ id: '人工漂移历史', name: '不得进入冻结输入', scope: '人工范围', includes: [], excludes: [], fileContributions: [] });
      comparisonMock[waitAt === 'prompt' ? 'promptRelease' : 'workbookRelease']();
    }, { waitAt, lowCapacity });
    const d = await finish(page);
    a.deepEqual(d.record.comparisonConfig.source, frozen.source);
    a.deepEqual(d.record.comparisonConfig.modelConfigs, frozen.modelConfigs);
    a.deepEqual(d.record.comparisonConfig.historySnapshot, frozen.historySnapshot);
    a.equal(d.record.stale, true); a.equal(d.stale, true); a.match(d.ui.timing, /上次运行|输入已变更/);
    if (lowCapacity) { a.equal(d.record.status, 'failed'); a.equal(d.calls.length, 0); a.match(d.record.message, /容量/); }
    else {
      success(d);
      metadata(d, 'current');
      for (const c of d.calls) {
        a.ok(!c.messages[1].content.includes('漂移')); a.ok(!c.messages[1].content.includes('不得进入冻结输入'));
        a.equal(c.model, c.branch === 'A' ? 'mock-timing' : 'mock-second');
        a.equal(c.reasoning_effort, c.branch === 'A' ? 'low' : null);
      }
      a.equal(d.current.source.file_name, frozen.source.name);
    }
  }
  async function failedBranch(branch, phase) {
    const page = await session(); await prepare(page); await spyPersistence(page);
    const before = await page.evaluate(() => JSON.stringify([state.previewTopics, state.previews]));
    await page.evaluate(failure => { comparisonMock.failure = failure; }, { branch, phase });
    const d = await run(page);
    a.equal(d.record.status, 'failed'); a.equal(d.current, null);
    a.equal(!!d.baseline, branch === 'B');
    a.equal(d.record.branches[branch === 'A' ? 'baseline' : 'current'].status, 'failed');
    if (branch === 'A') { a.equal(d.record.branches.current.start, null); a.equal(d.calls.filter(c => c.branch === 'B').length, 0); }
    a.equal(await page.evaluate(() => JSON.stringify([state.previewTopics, state.previews])), before);
    a.deepEqual(d.previewBranches, []); a.ok(d.files.every(f => !f.lastRun));
    if (phase === 'extraction') a.equal(d.calls.filter(c => c.branch === branch && c.phase === 'integration').length, 0);
  }
  async function cacheFixture(page) {
    await page.evaluate(() => {
      const f = captureComparisonRun();
      window.directFixture = {
        prompts: structuredClone(f.prompts), source: f.source.text,
        context: { sourceName: f.source.name, sourceId: f.source.id, sourceRevision: f.source.revision, modelId: f.modelA, modelConfig: structuredClone(f.modelConfigs.A), snapshot: workbookSnapshot(), historySnapshot: structuredClone(f.historySnapshot), parts: splitSourceForModel(f.source.text), timingScope: 'baseline', runControl: { cancelled: false } }
      };
    });
  }
  async function directProcess(page) {
    return page.evaluate(async () => {
      const f = directFixture;
      try { return await processSource(structuredClone(f.prompts), f.source, structuredClone(f.context), '人工缓存隔离'); }
      finally { setRunning(false); }
    });
  }
  async function cacheDimension(dimension) {
    const page = await session(); await prepare(page); await cacheFixture(page);
    const first = await directProcess(page); a.ok(first.preview_eligible);
    a.equal(await page.evaluate(() => comparisonMock.calls.length), 2);
    const keyBefore = await page.evaluate(() => wikiCandidateCacheKey(directFixture.prompts, directFixture.source, directFixture.context));
    await page.evaluate(dimension => {
      const f = directFixture;
      if (dimension === 'id') f.context.sourceId += '-人工新ID';
      if (dimension === 'name') f.context.sourceName = '杰洛特-人工改名.txt';
      if (dimension === 'revision') f.context.sourceRevision++;
      if (dimension === 'text') { f.source += '\n'; f.context.parts = splitSourceForModel(f.source); }
      // 改真实 splitter 参数产生不同 parts；仍调用真实 processSource，不 stub pipeline。
      if (dimension === 'parts') f.context.parts = splitSourceForModel(f.source, 25);
      if (dimension === 'model_config') f.context.modelConfig.maxInputTokens--;
      if (dimension === 'model_id') { f.context.modelId = 'mock-second'; f.context.modelConfig = structuredClone(availableModels.find(m => m.id === 'mock-second')); }
      if (dimension === 'prompts') f.prompts.integration += '\n人工缓存键规则。';
      if (dimension === 'history') f.context.historySnapshot.topics.push({ id: '人工历史话题', name: '人工历史候选', scope: '人工范围' });
      if (dimension === 'workbook_revision') f.context.snapshot.revision++;
      if (dimension === 'workbook_content') f.context.snapshot.workbook.sheets[0].rows[4][3] += '人工定义变化。';
      comparisonMock.calls = [];
    }, dimension);
    const keyAfter = await page.evaluate(() => wikiCandidateCacheKey(directFixture.prompts, directFixture.source, directFixture.context));
    a.notEqual(keyAfter, keyBefore);
    await directProcess(page);
    const calls = await page.evaluate(() => structuredClone(comparisonMock.calls));
    a.ok(calls.some(c => c.phase === 'extraction'), dimension + '必须实际缓存未命中');
    a.equal(await page.evaluate(() => wikiCandidateCache.has(wikiCandidateCacheKey(directFixture.prompts, directFixture.source, directFixture.context))), true);
    a.equal(await page.evaluate(key => wikiCandidateCache.has(key), keyBefore), true, '单维度变化不得删除原缓存键');
  }

  try {
    if (!fs.statSync(outputs).isDirectory()) throw Error('报告父目录不存在；不自动创建额外目录');
    outputBefore = outputInventory(); protectedBefore = protectedHashes(); report.sourceHashesBefore = protectedBefore;
    sources = Object.fromEntries(names.map(name => [name, fs.readFileSync(path.join(app, name), 'utf8')]));
    staticScripts = new Set([...sources['index.html'].matchAll(/<script\s+[^>]*src=['"](https:\/\/[^'"]+)['"]/g)].map(m => m[1]));
    // 源码语法由 VM 只编译、不执行；旧测试从未加载。
    for (const match of sources['index.html'].matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
    for (const name of names.slice(1)) new vm.Script(sources[name], { filename: name });
    const modulePath = require.resolve('playwright', { paths: [root, path.join(os.homedir(), '.workbuddy/binaries/node/workspace')] });
    report.playwrightModule = modulePath;
    const { chromium } = require(modulePath);
    browser = await chromium.launch({ channel: 'chrome', headless: true });

    await scenario('五模块初始化与 active 模型列表', async () => {
      const page = await session();
      const d = await page.evaluate(() => ({ ids: availableModels.map(m => m.id), top: document.getElementById('modelSelect').value, b: [...document.getElementById('comparisonModelB').options].map(o => o.value), ready: wikiPromptHistory.getController().status().ready }));
      a.deepEqual(d.ids, ['mock-timing', 'mock-second']); a.equal(d.top, 'mock-timing'); a.ok(!d.b.includes('mock-disabled')); a.equal(d.ready, true);
    });
    await scenario('模式与来源切换不写入完整 Prompt', async () => {
      const page = await session();
      const before = await page.evaluate(() => wikiPromptHistory.getController().status().snapshot);
      await page.locator('#comparisonMode').selectOption('models');
      a.equal(await page.locator('#sharedPromptPane').isVisible(), true); a.equal(await page.locator('.prompt-compare-grid').isVisible(), false);
      await page.locator('#comparisonPromptSource').selectOption('baseline');
      await page.locator('#comparisonPromptSource').selectOption('current');
      await page.locator('#comparisonMode').selectOption('prompts');
      a.equal(await page.locator('#sharedPromptPane').isVisible(), false); a.equal(await page.locator('.prompt-compare-grid').isVisible(), true);
      a.deepEqual(await page.evaluate(() => wikiPromptHistory.getController().status().snapshot), before);
      a.equal(await page.evaluate(() => comparisonMock.writes.length), 0);
    });
    for (const side of ['current', 'baseline']) {
      for (const step of steps) await scenario('共享编辑 ' + side + '/' + step + ' 经真实 blur 保存', async () => {
        const page = await session(); await prepare(page, { promptSource: side });
        await page.locator('[data-prompt="' + step + '"]').click();
        await page.waitForFunction(() => !wikiPromptHistory.getController().status().busy);
        const before = await page.evaluate(() => wikiPromptHistory.getController().status().snapshot);
        const value = before[side][step] + '\n人工共享编辑：' + side + '/' + step;
        await page.locator('#sharedPromptEditor').fill(value);
        await page.locator('#sharedPromptEditor').press('Tab');
        await page.waitForFunction(() => comparisonMock.writes.length === 1 && !wikiPromptHistory.getController().status().busy && !wikiPromptHistory.getController().status().dirty);
        const d = await page.evaluate(() => ({ snapshot: wikiPromptHistory.getController().status().snapshot, writes: structuredClone(comparisonMock.writes), backup: wikiPromptHistory.getController().exportBackup() }));
        const expected = structuredClone(before); expected[side][step] = value;
        a.deepEqual(d.snapshot, expected); a.deepEqual(d.writes[0].snapshot, expected);
        a.deepEqual(d.writes[0].changed_steps, [side + '.' + step]); a.equal(d.writes[0].parent_revision, '1'); a.equal(d.writes[0].revision, '2');
        a.ok(d.writes[0].request_id); a.deepEqual(Object.keys(d.snapshot).sort(), ['baseline', 'current']);
        for (const s of ['baseline', 'current']) a.deepEqual(Object.keys(d.snapshot[s]).sort(), steps.slice().sort());
        a.ok(JSON.stringify(d.backup).includes(value.replace(/\n/g, '\\n')));
      });
    }
    await scenario('共享编辑点击 STEP tab 调用真实 history flush', async () => {
      const page = await session(); await prepare(page);
      const before = await page.evaluate(() => wikiPromptHistory.getController().status().snapshot);
      const value = before.current.step2 + '\n人工 tab 保存';
      await page.locator('#sharedPromptEditor').fill(value);
      // dispatch 实际 tab handler，避免单靠 blur 已保存而冒充 tab 覆盖。
      await page.evaluate(() => document.querySelector('[data-prompt="step3"]').click());
      await page.waitForFunction(() => comparisonMock.writes.length === 1 && !wikiPromptHistory.getController().status().dirty);
      const d = await page.evaluate(() => ({ key: state.promptKey, editor: document.getElementById('sharedPromptEditor').value, row: structuredClone(comparisonMock.writes[0]) }));
      a.equal(d.key, 'step3'); a.equal(d.editor, before.current.step3); a.equal(d.row.snapshot.current.step2, value); a.deepEqual(d.row.changed_steps, ['current.step2']);
    });
    await scenario('模型 A 与顶部选择双向同步', async () => {
      const page = await session(); await prepare(page);
      await page.locator('#comparisonModelA').selectOption('mock-second');
      a.equal(await page.locator('#modelSelect').inputValue(), 'mock-second');
      await page.locator('#modelSelect').selectOption('mock-timing');
      a.equal(await page.locator('#comparisonModelA').inputValue(), 'mock-timing');
      a.deepEqual(await page.evaluate(() => captureComparisonConfig()), { mode: 'models', promptSource: 'current', modelA: 'mock-timing', modelB: 'mock-second' });
    });
    await scenario('captureComparisonRun 深克隆与递归冻结', async () => {
      const page = await session(); await prepare(page);
      const d = await page.evaluate(() => {
        const f = captureComparisonRun();
        const recursive = x => !x || typeof x !== 'object' || Object.isFrozen(x) && Object.values(x).every(recursive);
        const before = JSON.stringify(f); state.source.name = '捕获后修改.txt'; availableModels[0].name = '捕获后能力变化';
        let prevented = false; try { f.modelConfigs.A.reasoning.supportedEfforts.push('high'); } catch { prevented = true; }
        return { frozen: recursive(f), unchanged: before === JSON.stringify(f), prevented, keys: Object.keys(f), prompts: Object.keys(f.prompts) };
      });
      a.equal(d.frozen, true); a.equal(d.unchanged, true); a.equal(d.prevented, true); a.ok(d.keys.includes('historySnapshot')); a.deepEqual(d.prompts.sort(), steps.slice().sort());
    });
    for (const kind of ['missing', 'same', 'disabled', 'noB', 'noA']) await scenario('不合法模型选择阻止请求：' + kind, () => blockedSelection(kind));
    for (const side of ['current', 'baseline']) await scenario('完整共享 ' + side + ' Prompt 双模型真实 pipeline 与 metadata', async () => {
      const page = await session(); await prepare(page, { promptSource: side, different: true }); await spyPersistence(page);
      const d = await run(page); success(d); metadata(d, side);
      a.deepEqual(d.calls.map(c => [c.branch, c.phase, c.model]), [['A', 'extraction', 'mock-timing'], ['A', 'integration', 'mock-timing'], ['B', 'extraction', 'mock-second'], ['B', 'integration', 'mock-second']]);
      for (const phase of ['extraction', 'integration']) {
        const calls = d.calls.filter(c => c.phase === phase); a.deepEqual(calls[0].messages, calls[1].messages);
        a.ok(calls[1].start >= d.calls.filter(c => c.branch === 'A').at(-1).end);
      }
      a.deepEqual(d.previewBranches, ['B']); a.ok(d.previews.length > 0); a.ok(d.archiveSnapshots.length >= 1);
      a.deepEqual(d.files[0].lastRun.comparison.A, d.baseline.comparison); a.deepEqual(d.files[0].lastRun.comparison.B, d.current.comparison);
      a.deepEqual(d.files[0].lastRun.source.comparison, d.files[0].lastRun.comparison);
      for (const c of d.calls) { a.equal(c.reasoning_effort, c.branch === 'A' ? 'low' : null); a.deepEqual(c.reasoningKeys, c.branch === 'A' ? ['reasoning_effort'] : []); }
      a.equal(d.current.model.reused_baseline, undefined);
      // 逐条解析真实 SDK 输入，验证四项提炼规则和第五项整合规则。
      const selected = d.record.comparisonConfig[side === 'baseline' ? 'baselinePrompts' : 'prompts'];
      for (const c of d.calls.filter(c => c.phase === 'extraction')) {
        const rules = JSON.parse(c.messages[1].content.split('可编辑规则：')[1].split('\n')[0]);
        for (const step of steps.slice(0, 4)) a.ok(rules[step].startsWith(selected[step]), step);
      }
      for (const c of d.calls.filter(c => c.phase === 'integration')) { a.ok(c.messages[1].content.includes(selected.integration)); a.ok(c.messages[1].content.includes(selected.step2)); }
    });
    await scenario('B 预览及真实 backup/export 保留 A/B 完整 metadata', async () => {
      const page = await session(); await prepare(page); const d = await run(page); success(d);
      await page.evaluate(() => exportResult());
      await page.waitForFunction(() => comparisonMock.downloads.some(d => d.text !== null));
      const exports = await page.evaluate(() => structuredClone(comparisonMock.downloads));
      a.equal(exports.length, 1); a.equal(exports[0].name, '知识Wiki文件与结果备份.json'); a.equal(exports[0].error, null);
      const backup = JSON.parse(exports[0].text);
      a.deepEqual(backup.baseline.comparison, d.baseline.comparison); a.deepEqual(backup.current.comparison, d.current.comparison);
      a.deepEqual(backup.files[0].lastRun.comparison.A, d.baseline.comparison); a.deepEqual(backup.files[0].lastRun.comparison.B, d.current.comparison);
      a.deepEqual(backup.prompts, d.record.comparisonConfig.prompts); a.deepEqual(backup.baselinePrompts, d.record.comparisonConfig.baselinePrompts);
    });
    await scenario('多段 A 后 B 串行且段内真实并发为 2', async () => {
      const page = await session(); await prepare(page, { long: true });
      const parts = await page.evaluate(() => splitSourceForModel(state.source.text).length);
      const d = await run(page); success(d, 2 * (parts + 1)); a.equal(d.maxActive, 2);
      for (const branch of ['A', 'B']) {
        const extraction = d.calls.filter(c => c.branch === branch && c.phase === 'extraction');
        a.equal(extraction.length, parts);
        a.ok(extraction[0].start < extraction[1].end && extraction[1].start < extraction[0].end);
        const integration = d.calls.find(c => c.branch === branch && c.phase === 'integration');
        a.ok(integration.start >= Math.max(...extraction.map(c => c.end)));
      }
      a.ok(Math.min(...d.calls.filter(c => c.branch === 'B').map(c => c.start)) >= Math.max(...d.calls.filter(c => c.branch === 'A').map(c => c.end)));
      const aInputs = d.calls.filter(c => c.branch === 'A').map(c => c.messages), bInputs = d.calls.filter(c => c.branch === 'B').map(c => c.messages);
      a.deepEqual(aInputs, bInputs); a.equal(d.current.model.concurrency, 2);
    });
    await scenario('旧模式同模型同完整 Prompt 才 clone', async () => {
      const page = await session(); await prepare(page, { mode: 'prompts' });
      const d = await run(page); success(d, 2); metadata(d, null);
      a.equal(d.current.model.reused_baseline, true); a.equal(d.record.caches.current.baseline, 1);
      a.ok(d.record.events.some(e => e.key === 'baseline_clone')); a.equal(d.calls.filter(c => c.branch === 'B').length, 0);
    });
    await scenario('旧模式仅第五项不同也独立运行', async () => {
      const page = await session(); await prepare(page, { mode: 'prompts', different: true });
      const d = await run(page); success(d); metadata(d, null);
      a.equal(d.current.model.reused_baseline, undefined); a.equal(d.calls.filter(c => c.branch === 'B').length, 2);
      a.ok(d.calls.every(c => c.model === 'mock-timing'));
    });
    await scenario('恢复冻结 history 后同键重跑严格零 SDK 请求', async () => {
      const page = await session(); await prepare(page); success(await run(page));
      await restoreHistory(page);
      const d = await run(page); success(d, 0);
      a.equal(d.record.caches.baseline.extraction, 1); a.equal(d.record.caches.current.extraction, 1);
      a.equal(d.record.caches.baseline.integration, 1); a.equal(d.record.caches.current.integration, 1);
      a.deepEqual(d.record.comparisonConfig.historySnapshot, { topics: [], entities: [] });
      a.equal(d.record.events.filter(e => /(?:extraction|integration)_request/.test(e.key)).length, 0);
    });
    await scenario('只改 B 能力时只使 B 缓存失效', async () => {
      const page = await session(); await prepare(page); success(await run(page)); await restoreHistory(page);
      await page.evaluate(() => { availableModels.find(m => m.id === 'mock-second').maxInputTokens--; });
      const d = await run(page); success(d, 2); a.ok(d.calls.every(c => c.branch === 'B'));
      a.equal(d.record.caches.baseline.extraction, 1); a.equal(d.record.caches.baseline.integration, 1);
      a.equal(d.record.caches.current.extraction ?? 0, 0); a.equal(d.record.caches.current.integration ?? 0, 0);
    });
    for (const dimension of ['id', 'name', 'revision', 'text', 'parts', 'model_config', 'model_id', 'prompts', 'history', 'workbook_revision', 'workbook_content'])
      await scenario('真实 pipeline 缓存隔离：' + dimension, () => cacheDimension(dimension));
    await scenario('缓存键逐字段保存完整 source/parts/能力/Prompt/history/词表', async () => {
      const page = await session(); await prepare(page); await cacheFixture(page);
      const d = await page.evaluate(() => ({ f: structuredClone(directFixture), key: JSON.parse(wikiCandidateCacheKey(directFixture.prompts, directFixture.source, directFixture.context)) }));
      a.equal(d.key[0], d.f.source); a.deepEqual(d.key[1], { id: d.f.context.sourceId, name: d.f.context.sourceName, revision: d.f.context.sourceRevision });
      a.deepEqual(d.key[2], d.f.context.parts); a.equal(d.key[3], d.f.context.modelId); a.deepEqual(d.key[4], d.f.context.modelConfig);
      a.deepEqual(d.key[5], d.f.prompts); a.deepEqual(d.key[6], d.f.context.snapshot); a.deepEqual(d.key[7], d.f.context.historySnapshot);
    });
    await scenario('未同步完整五项在点击时 capture，真实 flush 权威快照不受等待期 DOM 干扰', async () => {
      const page = await session(); await prepare(page);
      const expected = await page.evaluate(() => {
        const c = wikiPromptHistory.getController(), s = c.status().snapshot;
        for (const key of wikiPromptHistory.STEPS) s.current[key] += '\n人工点击快照标记：' + key;
        state.prompts = structuredClone(s.current); state.baselinePrompts = structuredClone(s.baseline);
        sharedPromptBinding = null; renderPromptEditor(); c.changed(s); c.cancelTimer();
        comparisonMock.holdPrompt = true;
        return structuredClone(s);
      });
      // 不改变焦点，真实按钮 onclick 先 capture，避免 blur 预先 flush 造成假覆盖。
      await page.evaluate(() => document.getElementById('runBtn').click());
      await page.waitForFunction(() => !!comparisonMock.promptRelease);
      const initial = await page.evaluate(() => structuredClone(wikiRunTiming.current().comparisonConfig));
      a.deepEqual(initial.prompts, expected.current); a.deepEqual(initial.baselinePrompts, expected.baseline);
      await page.evaluate(() => {
        document.getElementById('sharedPromptEditor').value = '点击后 DOM 强改';
        document.getElementById('comparisonPromptSource').value = 'baseline';
        state.prompts.integration = '点击后 state 强改';
        comparisonMock.promptRelease();
      });
      const d = await finish(page); success(d); metadata(d, 'current');
      a.equal(d.writes.length, 1); a.deepEqual(d.writes[0].snapshot, expected);
      a.deepEqual(d.writes[0].changed_steps.slice().sort(), steps.map(step => 'current.' + step).sort());
      a.deepEqual(d.record.comparisonConfig.prompts, expected.current); a.equal(d.record.stale, true);
      for (const call of d.calls) a.ok(!call.messages[1].content.includes('点击后'));
      for (const step of steps) a.ok(d.calls.some(call => call.messages[1].content.includes('人工点击快照标记：' + step)));
    });
    for (const waitAt of ['prompt', 'workbook']) await scenario('等待 ' + waitAt + ' 时冻结、防 DOM/source/能力漂移与控件锁', () => drift(waitAt));
    await scenario('点击低容量快照不能被等待期间提高能力绕过', () => drift('workbook', true));
    for (const branch of ['A', 'B']) for (const phase of ['extraction', 'integration'])
      await scenario(branch + '/' + phase + ' 失败不写 partial 知识', () => failedBranch(branch, phase));
    await scenario('单段失败只重试失败段，完成段保留且 A 失败跳过 B', async () => {
      const page = await session(); await prepare(page, { long: true }); await spyPersistence(page);
      await page.evaluate(() => { comparisonMock.failure = { branch: 'A', phase: 'extraction', segment: 2, once: true }; });
      const failed = await run(page); a.equal(failed.record.status, 'failed'); a.equal(failed.current, null); a.equal(failed.previews.length, 0);
      a.equal(failed.calls.filter(c => c.phase === 'integration').length, 0); a.deepEqual(failed.previewBranches, []);
      const completed = failed.calls.filter(c => c.status === 'success').length; a.ok(completed >= 1);
      await restoreHistory(page); const d = await run(page);
      const parts = d.baseline?.model.segment_count;
      success(d, 1 + 1 + parts + 1); a.equal(d.baseline.model.reused_segments, completed);
      a.equal(d.calls.filter(c => c.branch === 'A' && c.phase === 'extraction').length, 1);
    });
    await scenario('B 整合失败保留 A，重试只请求 B 整合', async () => {
      const page = await session(); await prepare(page); await spyPersistence(page);
      await page.evaluate(() => { comparisonMock.failure = { branch: 'B', phase: 'integration', once: true }; });
      const failed = await run(page); a.equal(failed.record.status, 'failed'); a.ok(failed.baseline); a.equal(failed.current, null); a.deepEqual(failed.previewBranches, []);
      await restoreHistory(page); const d = await run(page); success(d, 1);
      a.equal(d.calls[0].branch, 'B'); a.equal(d.calls[0].phase, 'integration'); a.equal(d.baseline.model.reused_segments, 1); a.equal(d.current.model.reused_segments, 1);
    });
    for (const stopBranch of ['A', 'B']) await scenario('停止 ' + stopBranch + ' 清理在途请求并可重试', async () => {
      const page = await session(); await prepare(page, { long: true }); await spyPersistence(page);
      await page.evaluate(branch => {
        if (branch === 'A') { comparisonMock.delays['A:extraction:1'] = 5; comparisonMock.delays['A:extraction:2'] = 30000; }
        else comparisonMock.delays['B:extraction:1'] = comparisonMock.delays['B:extraction:2'] = 30000;
      }, stopBranch);
      await start(page);
      await page.waitForFunction(branch => comparisonMock.calls.some(c => c.branch === branch && c.status === 'running') && (branch !== 'A' || comparisonMock.calls.some(c => c.branch === 'A' && c.status === 'success')), stopBranch);
      await page.locator('#stopBtn').click(); const stopped = await finish(page);
      a.equal(stopped.record.status, 'stopped'); a.equal(stopped.current, null); a.equal(!!stopped.baseline, stopBranch === 'B');
      a.equal(stopped.previews.length, 0); a.deepEqual(stopped.previewBranches, []); a.ok(stopped.calls.some(c => c.status === 'stopped'));
      if (stopBranch === 'A') a.equal(stopped.calls.filter(c => c.branch === 'B').length, 0);
      await restoreHistory(page); await page.evaluate(() => { comparisonMock.delays = {}; });
      const d = await run(page); a.equal(d.record.status, 'success'); a.ok(d.current?.preview_eligible); a.deepEqual(d.previewBranches, ['B']);
      if (stopBranch === 'A') a.ok(d.baseline.model.reused_segments >= 1);
      else a.equal(d.calls.filter(c => c.branch === 'A').length, 0);
    });
    for (const kind of ['prompt', 'workbook']) await scenario(kind + ' 同步读取失败禁止模型调用', async () => {
      const page = await session(); await prepare(page);
      await page.evaluate(kind => { comparisonMock[kind === 'prompt' ? 'failPrompt' : 'failWorkbook'] = true; }, kind);
      const d = await run(page); a.equal(d.record.status, 'failed'); a.equal(d.calls.length, 0);
      a.equal(d.record.branches.baseline.start, null); a.equal(d.record.branches.current.start, null); a.equal(d.previews.length, 0);
      a.equal(d.record.events.find(e => e.key === (kind === 'prompt' ? 'prompt_sync' : 'workbook_sync')).status, 'failed');
    });
    await scenario('共享框输入法组合停顿不会自动同步半成品', async () => {
      const page = await session(); await prepare(page);
      const original = await page.locator('#sharedPromptEditor').inputValue();
      await page.locator('#sharedPromptEditor').dispatchEvent('compositionstart');
      await page.locator('#sharedPromptEditor').fill(original + '\n人工未确认拼音 nihao');
      await page.evaluate(() => { window.imeObservationComplete = false; setTimeout(() => { window.imeObservationComplete = true; }, 1000); });
      await page.waitForFunction(() => window.imeObservationComplete);
      a.equal(await page.evaluate(() => comparisonMock.writes.length), 0);
      a.equal(await page.evaluate(() => wikiPromptHistory.getController().status().dirty), true);
      await page.locator('#sharedPromptEditor').fill(original + '\n人工确认中文：你好');
      await page.locator('#sharedPromptEditor').dispatchEvent('compositionend');
      await page.locator('#sharedPromptEditor').press('Tab');
      await page.waitForFunction(() => comparisonMock.writes.length === 1 && !wikiPromptHistory.getController().status().dirty);
      const row = await page.evaluate(() => structuredClone(comparisonMock.writes[0]));
      a.equal(row.snapshot.current.step2, original + '\n人工确认中文：你好');
      a.ok(!JSON.stringify(row).includes('nihao'));
      a.deepEqual(row.changed_steps, ['current.step2']);
    });
    for (const waitAt of ['prompt', 'workbook']) await scenario('停止前置 ' + waitAt + ' 等待后禁止请求且可重新运行', async () => {
      const page = await session(); await prepare(page);
      await page.evaluate(at => { comparisonMock[at === 'prompt' ? 'holdPrompt' : 'holdWorkbook'] = true; }, waitAt);
      await start(page);
      await page.waitForFunction(at => !!comparisonMock[at === 'prompt' ? 'promptRelease' : 'workbookRelease'], waitAt);
      a.equal(await page.locator('#stopBtn').isEnabled(), true);
      const id = await page.evaluate(() => wikiRunTiming.current().id);
      await page.locator('#stopBtn').click();
      a.equal(await page.locator('#stopBtn').isEnabled(), false);
      a.equal(await page.evaluate(() => activeRunControl?.cancelled), true);
      a.equal(await page.locator('#comparisonMode').isEnabled(), false);
      await page.evaluate(() => document.getElementById('runBtn').dispatchEvent(new MouseEvent('click', {bubbles:true})));
      a.equal(await page.evaluate(() => wikiRunTiming.current().id), id);
      a.equal(await page.evaluate(() => comparisonMock.calls.length), 0);
      await page.evaluate(at => comparisonMock[at === 'prompt' ? 'promptRelease' : 'workbookRelease'](), waitAt);
      const stopped = await finish(page);
      a.equal(stopped.record.status, 'stopped'); a.equal(stopped.calls.length, 0);
      a.equal(stopped.record.branches.baseline.start, null);
      a.equal(stopped.record.branches.current.start, null); a.equal(stopped.previews.length, 0);
      a.ok(stopped.files.every(f => !f.lastRun));
      a.equal(await page.locator('#comparisonMode').isEnabled(), true);
      const retried = await run(page); success(retried);
    });
    await scenario('输入法 composition 未结束不得请求模型', async () => {
      const page = await session(); await prepare(page);
      await page.locator('#sharedPromptEditor').dispatchEvent('compositionstart');
      await page.locator('#sharedPromptEditor').fill('输入法组合中的人工规则');
      await page.evaluate(() => { document.getElementById('runBtn').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await page.waitForFunction(() => wikiRunTiming.current()?.end !== null && wikiRunTiming.current()?.end !== undefined);
      const d = await capture(page); a.equal(d.calls.length, 0); a.equal(d.record.status, 'failed'); a.match(d.record.message, /组合输入/);
      await page.locator('#sharedPromptEditor').dispatchEvent('compositionend');
    });
    await scenario('Prompt mutating 完成后源档案可操作且不会阻挡正常 archive', async () => {
      const page = await session(); await prepare(page, { mode: 'prompts', different: true });
      // 真实可用的旧模式 copy 操作进入闭包 mutating，不强改禁用状态。
      await page.evaluate(() => { comparisonMock.holdPrompt = true; });
      await page.locator('#copyBaselineBtn').click();
      await page.waitForFunction(() => !!comparisonMock.promptRelease);
      a.equal(await page.evaluate(() => comparisonHistoryBusy), true); a.equal(await page.evaluate(() => fileMutationAllowed()), false);
      await page.evaluate(() => comparisonMock.promptRelease());
      await page.waitForFunction(() => !comparisonHistoryBusy && !wikiPromptHistory.getController().status().busy);
      a.equal(await page.evaluate(() => fileMutationAllowed()), true);
      const d = await run(page); success(d, 2); a.ok(d.files[0].lastRun); a.deepEqual(d.files[0].lastRun.comparison.B, d.current.comparison);
    });
    await scenario('运行中重复 click 不替换冻结 record', async () => {
      const page = await session(); await prepare(page); await page.evaluate(() => { comparisonMock.holdPrompt = true; }); await start(page);
      await page.waitForFunction(() => !!comparisonMock.promptRelease);
      const ids = await page.evaluate(() => { const id = wikiRunTiming.current().id; document.getElementById('runBtn').dispatchEvent(new MouseEvent('click', { bubbles: true })); return [id, wikiRunTiming.current().id, comparisonMock.calls.length]; });
      a.equal(ids[0], ids[1]); a.equal(ids[2], 0);
      await page.evaluate(() => comparisonMock.promptRelease()); const d = await finish(page); success(d); a.equal(d.record.id, ids[0]);
    });
    await scenario('完成后修改来源选择只标 stale，不把旧结果冒充新选择', async () => {
      const page = await session(); await prepare(page, { different: true }); const before = await run(page); success(before);
      await page.locator('#comparisonPromptSource').selectOption('baseline');
      const d = await capture(page); a.equal(d.stale, true); a.equal(d.record.stale, true);
      a.equal(d.record.id, before.record.id); a.equal(d.record.elapsed_ms, before.record.elapsed_ms); a.equal(d.current.comparison.prompt_source, 'current');
      a.deepEqual(d.current.comparison, before.current.comparison); a.match(d.ui.timing, /输入已变更/);
    });
    await scenario('模型名称在 select 和结果 metadata 中 HTML 转义', async () => {
      const page = await session(); await prepare(page);
      const hostile = '<img src=x onerror="window.modelNameInjected=1"> & Model B';
      await page.evaluate(name => { availableModels.find(m => m.id === 'mock-second').name = name; refreshComparisonModels(); }, hostile);
      const option = await page.locator('#comparisonModelB option[value="mock-second"]').textContent(); a.equal(option, hostile);
      const d = await run(page); success(d); a.equal(d.current.comparison.model_config.name, hostile);
      const html = await page.locator('#currentResult .result-meta').innerHTML(); a.ok(html.includes('&lt;img')); a.ok(html.includes('&amp;'));
      a.equal(await page.locator('#currentResult .result-meta img').count(), 0); a.equal(await page.evaluate(() => window.modelNameInjected || 0), 0);
    });
    for (const width of [1440, 760, 390]) await scenario('原生 select 键盘操作与无溢出 ' + width + 'px', async () => {
      const page = await session(); await prepare(page); await page.setViewportSize({ width, height: 1100 });
      for (const id of ['comparisonMode', 'comparisonPromptSource', 'comparisonModelA', 'comparisonModelB']) {
        const info = await page.locator('#' + id).evaluate(el => ({ tag: el.tagName, role: el.getAttribute('role'), rect: el.getBoundingClientRect().toJSON() }));
        a.equal(info.tag, 'SELECT'); a.ok(info.rect.width > 0, id); a.ok(info.rect.right <= width + 2, id); a.ok(info.rect.left >= -2, id);
      }
      await page.locator('#comparisonModelA').focus(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
      a.equal(await page.locator('#comparisonModelA').inputValue(), 'mock-second'); a.equal(await page.locator('#modelSelect').inputValue(), 'mock-second');
      await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
      a.equal(await page.locator('#comparisonModelA').inputValue(), 'mock-timing');
      const sourceEnd = await page.locator('#comparisonPromptSource').evaluate(el => [...el.options].at(-1).value);
      a.ok(['current', 'baseline'].includes(sourceEnd));
      await page.locator('#comparisonPromptSource').focus(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
      a.equal(await page.locator('#comparisonPromptSource').inputValue(), sourceEnd);
      const d = await run(page); success(d);
      const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, shared: document.getElementById('sharedPromptPane').getBoundingClientRect().toJSON(), result: document.getElementById('currentResult').getBoundingClientRect().toJSON() }));
      a.ok(layout.scroll <= layout.width + 2, JSON.stringify(layout)); a.ok(layout.shared.right <= width + 2); a.ok(layout.result.right <= width + 2);
      if (width === 1440 && !report.scenarios.some(s => s.reason || s.cleanupError)) {
        await page.screenshot({ path: screenshotFile, fullPage: true }); report.screenshotKind = '1440px真实本地模型对比成功界面';
      }
    });
    await scenario('五模块、默认值载体、原始词表和全部旧脚本哈希不变', async () => {
      report.sourceHashesAfter = protectedHashes(); a.deepEqual(report.sourceHashesAfter, protectedBefore);
      a.equal(report.scenarios.filter(s => s.resources).every(s => JSON.stringify(s.resources.slice().sort()) === JSON.stringify(names.slice().sort())), true);
      const fingerprints = report.scenarios.filter(s => s.defaultsHash).map(s => s.defaultsHash);
      a.ok(fingerprints.length > 0); a.equal(new Set(fingerprints).size, 1);
    });
    await scenario('所有网络 route 接管且无云端真实模型或未知资源', async () => {
      const network = report.network.flat(); a.ok(network.length > 0);
      for (const entry of network) {
        a.equal(entry.method, 'GET'); a.notEqual(entry.action, '禁止', entry.url);
        a.ok(['真实本地模块', '人工词表占位', '空图标', '静态脚本本地占位'].includes(entry.action));
      }
      a.equal(network.some(e => /\/\.cloud\/|completions|wiki_prompt_versions/.test(e.url)), false);
      a.deepEqual(outputInventory(), outputBefore, '只能产生两个指定 outputs 文件');
    });
  } catch (error) {
    report.harnessErrors.push({ stage: '启动或调度', reason: error.message, stack: error.stack });
  } finally {
    // 即便启动/场景失败，也尽量保存保护检查及真实失败报告。
    if (protectedBefore) {
      try { report.sourceHashesAfter = protectedHashes(); a.deepEqual(report.sourceHashesAfter, protectedBefore); }
      catch (error) { report.harnessErrors.push({ stage: '保护哈希', reason: error.message }); }
    }
    if (outputBefore) {
      try { a.deepEqual(outputInventory(), outputBefore); }
      catch (error) { report.harnessErrors.push({ stage: '输出范围', reason: error.message }); }
    }
    if (!report.screenshotKind && lastPage && !lastPage.isClosed()) {
      try { await lastPage.screenshot({ path: screenshotFile, fullPage: true }); report.screenshotKind = '最后可用现场'; }
      catch (error) { report.harnessErrors.push({ stage: '现场截图', reason: error.message }); }
    }
    for (const context of sessions) { try { await context.close(); } catch { /* 已关闭的隔离上下文无需重复处理。 */ } }
    if (browser) { try { await browser.close(); } catch (error) { report.harnessErrors.push({ stage: '浏览器清理', reason: error.message }); } }
    report.executedScenarios = report.scenarios.length;
    report.passedScenarios = report.scenarios.filter(s => s.pass).length;
    report.failedScenarios = report.scenarios.filter(s => !s.pass).length;
    report.assertionCount = report.assertions.length;
    report.passedAssertions = report.assertions.filter(t => t.pass).length;
    report.failedAssertions = report.assertions.filter(t => !t.pass).length;
    if (report.executedScenarios < 30) report.harnessErrors.push({ stage: '覆盖数量', reason: '实际执行场景不足30；不使用 planned 数量补足。' });
    report.status = report.failedScenarios || report.failedAssertions || report.harnessErrors.length ? 'failed' : 'passed';
    report.finishedAt = new Date().toISOString();
    // 唯一 JSON 输出；截图只使用 screenshotFile；不生成 trace/video/下载/临时报告。
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: report.status, executedScenarios: report.executedScenarios, passedScenarios: report.passedScenarios, failedScenarios: report.failedScenarios, assertionCount: report.assertionCount, failedAssertions: report.failedAssertions, harnessErrors: report.harnessErrors }, null, 2));
    if (report.status === 'failed') process.exitCode = 1;
  }
}
