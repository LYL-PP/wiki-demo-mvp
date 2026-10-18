'use strict';

(() => {
  const dimensions = ['product', 'discipline', 'version'];
  const dimensionLabels = {product: '产品', discipline: '专业', version: '版本'};
  const prefixDimensions = new Map([
    ['产品', 'product'], ['所属产品', 'product'], ['适用产品', 'product'],
    ['所属/适用产品', 'product'], ['product', 'product'],
    ['专业', 'discipline'], ['研发专业', 'discipline'],
    ['相关研发专业', 'discipline'], ['discipline', 'discipline'],
    ['版本', 'version'], ['内容适用版本', 'version'], ['version', 'version']
  ]);
  const typeAliases = new Map([
    ['非玩家角色', 'ET-CHAR-NPC'],
    ['游戏', 'ET-PROD-GAME'], ['游戏作品', 'ET-PROD-GAME'], ['游戏产品', 'ET-PROD-GAME'],
    ['武学系统', 'ET-SYS-SKILL'],
    ['状态效果', 'ET-CONTENT-STATUS'], ['buff', 'ET-CONTENT-STATUS'], ['debuff', 'ET-CONTENT-STATUS'],
    ['属性', 'ET-CONTENT-ATTRIBUTE']
  ]);
  const disciplineAliases = new Map([
    ['程序开发', '程序'], ['工程开发', '程序'], ['游戏策划', '策划'],
    ['质量保障', 'QA'], ['测试', 'QA'], ['qa', 'QA']
  ]);
  const forbiddenTypeLabels = new Set(['系统', '对象', '其他']);
  const missingValues = new Set([
    '', '未说明', '未注明', '未指定', '未提供', '未提及', '未明确', '未知',
    '待确认', '待定', '不详', '不适用', '无', '暂无', '没有',
    'null', 'undefined', 'none', 'n/a', 'na', 'unknown', 'unspecified',
    'notspecified', '-', '--', '—'
  ]);
  const list = value => Array.isArray(value) ? value : [];
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const format = value => typeof value === 'string'
    ? value.normalize('NFKC').replace(/[∕⁄]/g, '/').replace(/\s+/gu, ' ').trim()
    : '';
  const labelKey = value => format(value).replace(/\s/gu, '').toLowerCase();
  const absent = value => value == null || (typeof value === 'string' && !value.trim());
  const missing = value => typeof value !== 'string' || missingValues.has(labelKey(value));
  const withoutBookMarks = value => {
    let text = format(value);
    while ((text.startsWith('《') && text.endsWith('》')) ||
           (text.startsWith('〈') && text.endsWith('〉'))) text = text.slice(1, -1).trim();
    return text;
  };
  const facetValue = (dimension, value) => {
    const text = dimension === 'product' ? withoutBookMarks(value) : format(value);
    if (missing(text)) return null;
    return dimension === 'discipline' ? disciplineAliases.get(labelKey(text)) || text : text;
  };
  const prefixedFacet = value => {
    const text = format(value), colon = text.indexOf(':');
    if (colon < 0) return null;
    const dimension = prefixDimensions.get(labelKey(text.slice(0, colon)));
    return dimension ? {dimension, value: text.slice(colon + 1).trim()} : null;
  };
  const aliasesFor = row => (Array.isArray(row[8]) ? row[8] :
    typeof row[8] === 'string' ? row[8].split(/[;；,，、\n\r|]+/u) : [])
    .filter(value => typeof value === 'string' && value.trim());
  const typeRows = workbook => list(workbook?.sheets?.[0]?.rows).filter(Array.isArray);
  const activeDefinition = row => {
    const id = typeof row[0] === 'string' ? row[0].trim() : '';
    const label = typeof row[2] === 'string' ? row[2].trim() : '';
    if (!id || !label || forbiddenTypeLabels.has(labelKey(label)) || String(row[7] ?? '').trim() !== 'active') return null;
    return {id, label, category: row[1], definition: row[3], includes: row[4],
      boundary: row[5], assignment: row[6], status: 'active', aliases: aliasesFor(row), row};
  };

  function tagTypeDefinition(value, workbook = typeof savedWorkbook === 'undefined' ? null : savedWorkbook) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const rows = typeRows(workbook), exact = value.trim();
    // 稳定 ID 只做精确匹配；废弃 ID 不得借同义名称重新解析。
    const idRows = rows.filter(row => typeof row[0] === 'string' && row[0].trim() === exact);
    if (idRows.length) return idRows.length === 1 ? activeDefinition(idRows[0]) : null;
    if (/^ET-/i.test(exact)) return null;
    const key = labelKey(value);
    if (forbiddenTypeLabels.has(key) || missing(value)) return null;
    const builtInId = typeAliases.get(key);
    const matches = rows.map(activeDefinition).filter(Boolean).filter(definition =>
      labelKey(definition.label) === key || definition.aliases.some(alias => labelKey(alias) === key) ||
      definition.id === builtInId);
    if (matches.length !== 1) return null;
    const match = matches[0];
    return rows.filter(row => typeof row[0] === 'string' && row[0].trim() === match.id).length === 1
      ? match : null;
  }

  function typeInputs(entity) {
    if (!object(entity)) return {ids: [], labels: absent(entity) ? [] : [entity]};
    const tags = object(entity.tags) ? entity.tags : {};
    return {
      ids: [entity.type_id, entity.entity_type_id, tags.type_id, tags.entity_type_id, tags.typeId].filter(value => value != null),
      labels: [entity.type, entity.entity_type, entity.标签, tags.type, tags.entity_type].filter(value => !absent(value))
        .flatMap(value => Array.isArray(value) ? value : [value]).filter(value => !absent(value))
    };
  }

  function resolveTagType(entity, workbook = typeof savedWorkbook === 'undefined' ? null : savedWorkbook) {
    const {ids, labels} = typeInputs(entity);
    const raw = {id: ids.length > 1 ? ids.slice() : ids[0] ?? null,
      label: labels.length > 1 ? labels.slice() : labels[0] ?? null};
    const failure = reason => ({label: null, id: null, reason, raw});
    if (!ids.length && !labels.length) return failure('模型未选择主类型');
    const definitions = [];
    for (const id of ids) {
      if (typeof id !== 'string') return failure('主类型 ID 无效或未生效');
      const definition = tagTypeDefinition(id, workbook);
      if (!definition || definition.id !== id.trim()) return failure('主类型 ID 无效或未生效');
      definitions.push(definition);
    }
    if (new Set(definitions.map(definition => definition.id)).size > 1) return failure('提供的主类型 ID 相互冲突');
    for (const label of labels) {
      const definition = tagTypeDefinition(label, workbook);
      if (!definition) return failure(ids.length ? '主类型标签无效或多义，不能确认与 ID 等价' : '主类型标签未命中唯一生效类型或别名');
      definitions.push(definition);
    }
    if (new Set(definitions.map(definition => definition.id)).size > 1) {
      return failure(ids.length ? '主类型 ID 与标签不等价' : '提供的主类型标签相互冲突');
    }
    const definition = definitions[0];
    return {label: definition.label, id: definition.id, reason: '', raw};
  }

  const detailKey = detail => JSON.stringify([detail.dimension, detail.value, detail.basis, detail.quote,
    detail.reason, detail.source, detail.mention_id, detail.segment]);
  function mergeDetail(details, detail) {
    const key = detailKey(detail), previous = details.get(key);
    if (!previous) { details.set(key, detail); return; }
    const evidences = new Map([...previous.evidences, ...detail.evidences].map(evidence => [JSON.stringify(evidence), evidence]));
    previous.evidences = [...evidences.values()];
    if (!previous.reason && detail.reason) previous.reason = detail.reason;
  }

  function extractSemanticFacets(raw, source = '', options = {legacy: false}) {
    const input = Array.isArray(raw) ? {facets: raw} : object(raw) ? raw : {};
    const details = new Map(), candidates = new Set(), issues = [];
    // 数组只兼容 facets 自身的旧字符串，不把整份新输出降级为旧协议。
    const legacy = options?.legacy === true;
    const text = typeof source === 'string' ? source : '';
    const issue = (code, reason, dimension, value, original) => issues.push({code, reason,
      dimension: dimension ?? null, value: value ?? null, raw: original});
    const addLegacy = (dimension, original, origin) => {
      const value = facetValue(dimension, original);
      if (!value) { issue('INVALID_FACET_VALUE', '分面值缺失或是未说明占位值', dimension, original, origin); return; }
      mergeDetail(details, {dimension, value, basis: 'legacy', quote: '', evidences: [], reason: ''});
    };
    const addString = (original, fromCandidate) => {
      if (typeof original !== 'string') { issue('INVALID_TAG', '旧标签或候选标签必须是字符串', null, null, original); return; }
      const parsed = prefixedFacet(original);
      if (parsed) {
        if (fromCandidate && !legacy) {
          issue('MISPLACED_FACET', '新输出 candidate_tags 中的分面前缀已隔离，不作为有效分面或筛选值', parsed.dimension, parsed.value, original);
          return;
        }
        addLegacy(parsed.dimension, parsed.value, original);
      } else if (!missing(original)) candidates.add(format(original));
      else issue('INVALID_TAG_VALUE', '候选标签缺失或是未说明占位值', null, original, original);
    };
    const addStructured = (dimension, entry) => {
      if (!object(entry)) { issue('INVALID_FACET_ENTRY', '新分面必须是含 value、basis、quote 的对象，不降级为 legacy', dimension, null, entry); return; }
      const value = facetValue(dimension, entry.value);
      if (!value) { issue('INVALID_FACET_VALUE', '分面值缺失或是未说明占位值', dimension, entry.value, entry); return; }
      if (!['explicit', 'inferred'].includes(entry.basis)) { issue('INVALID_FACET_BASIS', '新分面 basis 只能是 explicit 或 inferred', dimension, value, entry); return; }
      if (dimension === 'version' && entry.basis !== 'explicit') { issue('VERSION_NOT_EXPLICIT', '版本只能来自原文明示，不接受推断', dimension, value, entry); return; }
      if (entry.basis === 'inferred' && dimension !== 'discipline') { issue('INFERENCE_NOT_ALLOWED', '仅专业分面允许有依据的推断', dimension, value, entry); return; }
      if (entry.basis === 'inferred' && (typeof entry.reason !== 'string' || !entry.reason.trim())) { issue('MISSING_INFERENCE_REASON', '推断专业必须提供推断依据', dimension, value, entry); return; }
      const quote = typeof entry.quote === 'string' ? entry.quote : '';
      const located = quote.trim() ? text.indexOf(quote) : -1;
      if (located < 0) { issue('QUOTE_NOT_FOUND', '分面 quote 必须在当前原文中逐字存在', dimension, value, entry); return; }
      const start = entry.start !== undefined ? entry.start : entry.end !== undefined ? entry.end - quote.length : located;
      const end = start + quote.length;
      if (!Number.isInteger(start) || start < 0 || text.slice(start, end) !== quote ||
          (entry.end !== undefined && entry.end !== end)) {
        issue('INVALID_QUOTE_OFFSETS', '分面 start/end 与原文逐字定位不一致', dimension, value, entry); return;
      }
      // 明示校验用模型原始取值，只放宽格式，不借专业同义归一补造证据。
      const explicitValue = dimension === 'product' ? withoutBookMarks(entry.value) : format(entry.value);
      if (entry.basis === 'explicit' && !format(quote).replace(/\s/gu, '').includes(explicitValue.replace(/\s/gu, ''))) {
        issue('VALUE_NOT_IN_QUOTE', '明示分面 quote 未包含所选取值', dimension, value, entry); return;
      }
      mergeDetail(details, {dimension, value, basis: entry.basis, quote,
        evidences: [{exact_quote: quote, start, end}], reason: typeof entry.reason === 'string' ? entry.reason.trim() : ''});
    };
    if (Array.isArray(input.facets)) {
      for (const entry of input.facets) {
        if (typeof entry === 'string') addString(entry, false);
        else if (object(entry) && dimensions.includes(entry.dimension)) addStructured(entry.dimension, entry);
        else issue('INVALID_FACET_ENTRY', '分面数组只接受旧字符串或含固定 dimension 的新语义对象', entry?.dimension, null, entry);
      }
    } else if (object(input.facets)) {
      for (const [dimension, entries] of Object.entries(input.facets)) {
        if (!dimensions.includes(dimension)) { issue('UNKNOWN_FACET_DIMENSION', '不支持的分面维度', dimension, null, entries); continue; }
        if (!Array.isArray(entries)) { issue('INVALID_FACET_LIST', '分面维度的取值必须是数组', dimension, null, entries); continue; }
        for (const entry of entries) addStructured(dimension, entry);
      }
    } else if (input.facets != null) issue('INVALID_FACETS', 'facets 必须是新分面对象或旧字符串数组', null, null, input.facets);
    if (input.candidate_tags != null && !Array.isArray(input.candidate_tags)) issue('INVALID_CANDIDATE_TAGS', 'candidate_tags 必须是数组', null, null, input.candidate_tags);
    for (const candidate of list(input.candidate_tags)) addString(candidate, true);
    const facetDetails = dimensions.flatMap(dimension => [...details.values()].filter(detail => detail.dimension === dimension));
    return {facets: [...new Set(facetDetails.map(detail => `${dimensionLabels[detail.dimension]}:${detail.value}`))],
      facetDetails, candidateTags: [...candidates], issues};
  }

  function clearDerivedSemanticStorage(raw) {
    const copy = {...(object(raw) ? raw : {})};
    if (object(copy.tags)) copy.tags = {...copy.tags};
    const containers = [copy, copy.tags].filter(object), cached = new Set(), factual = new Set();
    const keyFor = (dimension, value) => JSON.stringify([dimension, facetValue(dimension, value)]);
    for (const container of containers) {
      const clean = (entry, dimension = entry?.dimension) => {
        if (!object(entry)) return true;
        if (dimensions.includes(dimension)) {
          const key = keyFor(dimension, entry.value);
          if (entry.basis === 'contextual') cached.add(key);
          else if (['explicit', 'inferred', 'legacy'].includes(entry.basis)) factual.add(key);
        }
        return entry.basis !== 'contextual';
      };
      for (const key of ['semanticFacetDetails', 'facetDetails', 'facets', 'semantic_facets']) {
        if (Array.isArray(container[key])) container[key] = container[key].filter(entry => clean(entry));
        else if (object(container[key])) container[key] = Object.fromEntries(Object.entries(container[key]).map(([dimension, entries]) =>
          [dimension, list(entries).filter(entry => clean(entry, dimension))]));
      }
    }
    const keep = (dimension, value) => !cached.has(keyFor(dimension, value)) || factual.has(keyFor(dimension, value));
    for (const container of containers) {
      if (object(container.suggestedFacets)) container.suggestedFacets = Object.fromEntries(Object.entries(container.suggestedFacets).map(([dimension, values]) =>
        [dimension, list(values).filter(value => keep(dimension, value))]));
      for (const dimension of dimensions) if (Array.isArray(container[dimension])) container[dimension] = container[dimension].filter(value => keep(dimension, value));
      for (const key of ['facets', 'semantic_facets', 'candidate_tags', 'candidateTags', 'custom']) if (Array.isArray(container[key])) container[key] = container[key].filter(entry => {
        const parsed = typeof entry === 'string' ? prefixedFacet(entry) : null;
        return !parsed || keep(parsed.dimension, parsed.value);
      });
    }
    return copy;
  }

  function semanticFacetStorage(tagsOrEntity) {
    const root = clearDerivedSemanticStorage(tagsOrEntity);
    const containers = object(root.tags) ? [root, root.tags] : [root];
    const details = new Map(), canonical = [], candidates = [], legacyCandidates = [], suggestedFacets = {product: [], discipline: [], version: []};
    const semanticProtocol = containers.some(container => container.semanticFacetsRecognized === true ||
      ['semantic_facets', 'semanticFacetDetails', 'facetDetails'].some(key => Object.hasOwn(container, key)) ||
      object(container.facets) || list(container.facets).some(object));
    const storedDetail = (entry, dimension = entry?.dimension) => {
      if (!object(entry) || !dimensions.includes(dimension)) return;
      const value = facetValue(dimension, entry.value);
      if (!value || !['explicit', 'inferred', 'legacy'].includes(entry.basis)) return;
      if (entry.basis === 'inferred' && (dimension !== 'discipline' || typeof entry.reason !== 'string' || !entry.reason.trim())) return;
      if (entry.basis !== 'legacy' && (typeof entry.quote !== 'string' || !entry.quote.trim() || !list(entry.evidences).length)) return;
      // 已存详情只复制元数据和全局偏移，不重新断言证据，也不生成新证据。
      mergeDetail(details, {...entry, dimension, value, quote: typeof entry.quote === 'string' ? entry.quote : '',
        reason: typeof entry.reason === 'string' ? entry.reason : '',
        evidences: list(entry.evidences).map(evidence => object(evidence) ? {...evidence} : evidence)});
    };
    const storedFacets = facets => {
      if (Array.isArray(facets)) {
        for (const entry of facets) typeof entry === 'string' ? canonical.push(entry) : storedDetail(entry);
      } else if (object(facets)) {
        for (const dimension of dimensions) for (const entry of list(facets[dimension])) {
          storedDetail(entry, dimension);
        }
      }
    };
    for (const container of containers) {
      storedFacets(container.facets);
      storedFacets(container.semantic_facets);
      for (const entry of [...list(container.facetDetails), ...list(container.semanticFacetDetails)]) storedDetail(entry);
      const target = semanticProtocol ? candidates : legacyCandidates;
      target.push(...list(container.candidate_tags), ...list(container.candidateTags));
      for (const dimension of dimensions) for (const value of list(container.suggestedFacets?.[dimension])) {
        canonical.push(`${dimensionLabels[dimension]}:${typeof value === 'string' ? value : ''}`);
      }
    }
    const legacy = extractSemanticFacets({facets: canonical, candidate_tags: legacyCandidates}, '', {legacy: true});
    const current = extractSemanticFacets({candidate_tags: candidates});
    const described = new Set([...details.values()].map(detail => JSON.stringify([detail.dimension, detail.value])));
    for (const detail of legacy.facetDetails) {
      if (!described.has(JSON.stringify([detail.dimension, detail.value]))) mergeDetail(details, detail);
    }
    const facetDetails = dimensions.flatMap(dimension => [...details.values()].filter(detail => detail.dimension === dimension));
    for (const dimension of dimensions) suggestedFacets[dimension] = [...new Set(facetDetails
      .filter(detail => detail.dimension === dimension).map(detail => detail.value))];
    return {suggestedFacets, candidateTags: [...new Set([...legacy.candidateTags, ...current.candidateTags])], facetDetails};
  }

  function mergeSourceContributionData(entries, {samePrimary = true} = {}) {
    if (!entries.length || entries.some(entry => !object(entry))) return null;
    const stable = value => JSON.stringify(value, (key, item) => object(item) ? Object.fromEntries(Object.keys(item).sort().map(k => [k, item[k]])) : item);
    const first = entries[0];
    // 同来源只合并证据及集合；不同主话题由 resolver 分组，身份/主类型冲突不覆盖。
    if (entries.some(entry => ['name', ...(samePrimary ? ['primaryTopic'] : []), 'identityAnchors', 'disambiguator'].some(key => stable(entry[key]) !== stable(first[key])) ||
        stable(typeInputs(entry)) !== stable(typeInputs(first)))) return null;
    const unique = values => [...new Map(values.map(value => [stable(value), value])).values()];
    const semantic = entries.map(semanticFacetStorage), data = clearDerivedSemanticStorage(first);
    for (const key of ['sources', 'topics', 'aliases', 'facts', 'reviewReasons', 'relations']) data[key] = unique(entries.flatMap(entry => list(entry[key])));
    data.summary = unique(entries.map(entry => entry.summary).filter(Boolean)).join('；');
    data.identityDecision = entries.some(entry => entry.identityDecision === 'review') ? 'review' : first.identityDecision;
    data.candidateTags = unique(semantic.flatMap(entry => entry.candidateTags));
    data.semanticFacetDetails = unique(semantic.flatMap(entry => entry.facetDetails));
    data.suggestedFacets = Object.fromEntries(dimensions.map(dimension => [dimension,
      unique(data.semanticFacetDetails.filter(detail => detail.dimension === dimension).map(detail => detail.value))]));
    data.semanticFacetsRecognized = entries.every(entry => entry.semanticFacetsRecognized === true);
    if (entries.some(entry => entry.typeIssue)) data.typeIssue = entries.find(entry => entry.typeIssue).typeIssue;
    return data;
  }

  // 消费层只投影当前事实；contextual 不进入抽取/存储协议，也不读取派生缓存。
  function entitySemanticFacets(entity, {topics = [], entities = [], files = [], workbook = null, productContextIndex = null} = {}) {
    const issues = [], derived = [], topicList = list(topics), fileList = list(files);
    const sourceFields = item => {
      const nested = object(item?.source) ? item.source : {};
      return {fileId: item?.fileId ?? item?.file_id ?? nested.fileId ?? nested.file_id,
        revision: item?.revision ?? item?.file_revision ?? nested.revision ?? nested.file_revision,
        file: item?.file ?? item?.file_name ?? nested.file ?? nested.file_name ?? ''};
    };
    const completeSource = source => typeof source.fileId === 'string' && !!source.fileId.trim() &&
      (typeof source.revision === 'number' ? Number.isInteger(source.revision) && source.revision > 0 :
        typeof source.revision === 'string' && !missing(source.revision) && !!source.revision.trim());
    const sameSource = (a, b) => completeSource(a) && completeSource(b) &&
      a.fileId === b.fileId && String(a.revision) === String(b.revision);
    const compatibleSource = (item, source) => [item, item?.source].filter(object).every(container =>
      [container.fileId, container.file_id].every(id => id == null || id === source.fileId) &&
      [container.revision, container.file_revision].every(revision => revision == null || String(revision) === String(source.revision)));
    const report = (code, reason, source, topicId = null) => issues.push({code, reason,
      source: source ? {...source} : null, topicId});
    const singleProduct = raw => {
      if (typeof raw !== 'string' || /[\n\r]/u.test(raw)) return null;
      const value = facetValue('product', raw);
      if (!value || /^(?:游戏|游戏产品|产品|项目|IP|本作|本游戏|该游戏|当前游戏|本产品|该产品|当前产品|本项目|其他|不确定|泛指|game|product|project)$/iu.test(value) ||
          /[《》〈〉;；,，、|/&+]/u.test(value) ||
          /跨(?:产品|游戏|IP)|比较|对比|共享|共用|通用|多产品|多游戏|多个|任意|不明确|待确认|未知|未说明|未指定|全局|所有产品|所有游戏|各产品|各游戏/u.test(value) ||
          /\s+(?:和|与|及|或|and|or|versus|vs\.?)\s+/iu.test(value) ||
          /\b(?:unknown|unspecified|shared|multiple|comparison|cross[- ]?product|all games)\b/iu.test(value)) return null;
      return value;
    };
    const continuation = rest => /^(?:\s*\d|\s*(?:外传|续作|续篇|续集|续章|番外|前传|后传|第[一二三四五六七八九十0-9]+[部代作]))/u.test(rest);
    const parallelSuffix = rest => /^\s*(?:与|和|及|或|、|&|\+|\/|\band\b|\bor\b|\bvs\b)/iu.test(rest);
    const prefixMatches = (raw, product) => {
      const name = format(raw);
      if (/^[《〈]/u.test(name)) {
        const close = name[0] === '《' ? '》' : '〉', end = name.indexOf(close);
        // 书名号内是完整名称，不把《产品：副标题》误作《产品》。
        return end > 0 && name.slice(1, end).trim() === product && !continuation(name.slice(end + 1));
      }
      if (!name.startsWith(product)) return false;
      const rest = name.slice(product.length);
      return !continuation(rest) && (!rest || /^(?:中的|的|[:：\-—–\s、])/u.test(rest));
    };
    const mentionsProduct = (raw, product) => {
      const quote = format(raw);
      let cursor = 0;
      while ((cursor = quote.indexOf(product, cursor)) >= 0) {
        const start = cursor, end = cursor + product.length;
        cursor = end;
        const open = Math.max(quote.lastIndexOf('《', start), quote.lastIndexOf('〈', start));
        const closed = Math.max(quote.lastIndexOf('》', start), quote.lastIndexOf('〉', start));
        if (open > closed) {
          const close = quote[open] === '《' ? '》' : '〉', stop = quote.indexOf(close, end);
          if (stop >= 0 && quote.slice(open + 1, stop).trim() === product && !continuation(quote.slice(stop + 1))) return true;
          continue;
        }
        if (!/[\p{L}\p{N}_]/u.test(product[0]) || !/[A-Za-z0-9_]/u.test(quote[start - 1] || '')) {
          if (!/[A-Za-z0-9_]/u.test(quote[end] || '') && !continuation(quote.slice(end))) return true;
        }
      }
      return false;
    };
    const index = object(productContextIndex) ? productContextIndex : {}, storageCache = index.storage ??= new Map();
    const storageFacts = raw => {
      if (!storageCache.has(raw)) storageCache.set(raw, semanticFacetStorage(raw));
      return storageCache.get(raw);
    };
    const recordCache = index.records ??= new Map();
    const sourceKey = source => JSON.stringify([source.fileId, String(source.revision)]);
    const recordsFor = item => {
      if (recordCache.has(item)) return recordCache.get(item);
      const groups = new Map(), records = [];
      if (Array.isArray(item?.fileContributions)) {
        for (const contribution of item.fileContributions) {
          const source = sourceFields(contribution);
          if (!completeSource(source)) continue;
          const key = sourceKey(source);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(contribution);
        }
        for (const contributions of groups.values()) {
          const source = sourceFields(contributions[0]);
          if (contributions.some(c => !object(c?.data) || !compatibleSource(c, source) || !compatibleSource(c.data, source))) continue;
          if (contributions.length > 1 && !mergeSourceContributionData(contributions.map(c => c.data), {samePrimary: false})) continue;
          const primaryGroups = new Map();
          for (const contribution of contributions) {
            const primary = primaryFor(contribution.data);
            if (!primaryGroups.has(primary)) primaryGroups.set(primary, []);
            primaryGroups.get(primary).push(contribution);
          }
          for (const group of primaryGroups.values()) {
            const data = group.length === 1 ? group[0].data : mergeSourceContributionData(group.map(c => c.data));
            if (data) records.push({data, source: {...source}, bound: true, legacy: contributions.some(c => c.legacy === true), contributionCount: group.length});
          }
        }
      } else {
        const sources = list(item?.sources);
        for (const q of sources) {
          const source = sourceFields(q);
          if (completeSource(source)) groups.set(sourceKey(source), source);
        }
        // 无贡献协议只能把完整、唯一来源的顶层身份与主话题归给该来源。
        if (groups.size === 1 && sources.every(q => completeSource(sourceFields(q)))) records.push({data: item, source: [...groups.values()][0], bound: false, legacy: false});
      }
      recordCache.set(item, records);
      return records;
    };
    const fileIndex = index.files ??= new Map();
    if (!index.filesIndexed) {
      for (const file of fileList) {
        const key = sourceKey({fileId: file?.id, revision: file?.revision});
        if (!fileIndex.has(key)) fileIndex.set(key, []);
        fileIndex.get(key).push(file);
      }
      index.filesIndexed = true;
    }
    const topicIndex = index.topics ??= new Map();
    if (!index.topicsIndexed) {
      for (const topic of topicList) {
        if (!topicIndex.has(topic?.id)) topicIndex.set(topic?.id, []);
        topicIndex.get(topic?.id).push(topic);
      }
      index.topicsIndexed = true;
    }
    const fileFor = source => {
      const matches = fileIndex.get(sourceKey(source)) || [];
      return matches.length === 1 ? matches[0] : null;
    };
    const evidenceFor = (entries, source, file, bound) => typeof file?.text !== 'string' ? [] : list(entries).flatMap(entry => {
      if (!object(entry) || !compatibleSource(entry, source) || !bound && !sameSource(sourceFields(entry), source)) return [];
      const quote = entry.exact_quote ?? entry.quote;
      if (typeof quote !== 'string' || !quote.trim()) return [];
      const hasOffsets = entry.start !== undefined || entry.end !== undefined;
      const start = entry.start !== undefined ? entry.start : entry.end !== undefined ? entry.end - quote.length : undefined;
      const end = start === undefined ? undefined : start + quote.length;
      if (hasOffsets && (!Number.isInteger(start) || start < 0 || entry.end !== undefined && entry.end !== end)) return [];
      if (start === undefined ? !file.text.includes(quote) : file.text.slice(start, end) !== quote) return [];
      // 无偏移可验证引用，但标题覆盖仍必须有真实已存偏移。
      return [{exact_quote: quote, ...(hasOffsets ? {start, end} : {}), source: {...source}}];
    });
    const primaryFor = data => {
      const primary = data?.primaryTopic, refs = list(data?.topics);
      return typeof primary === 'string' && !!primary.trim() &&
        (data.topics == null || Array.isArray(data.topics) && (!refs.length || refs.includes(primary))) ? primary : null;
    };
    const topicFor = (topic, source) => {
      if (Array.isArray(topic.fileContributions)) {
        const records = topic.fileContributions.filter(c => object(c?.data) && sameSource(sourceFields(c), source));
        return records.length === 1 && compatibleSource(records[0], source) ? {data: records[0].data, bound: true, legacy: records[0].legacy === true} : null;
      }
      const own = sourceFields(topic), sources = list(topic.sources);
      const bound = sameSource(own, source) || sources.length === 1 && sameSource(sourceFields(sources[0]), source);
      if ((own.fileId != null || own.revision != null) && !sameSource(own, source)) return null;
      return {data: topic, bound, legacy: false};
    };
    const titleEvidence = (text, product, entityEvidence) => {
      if (typeof text !== 'string') return [];
      const lines = [...text.matchAll(/[^\r\n]+/gu)], first = lines.find(line => line[0].trim());
      const headings = lines.flatMap(line => {
        const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(line[0]);
        if (match) return [{start: line.index, end: line.index + line[0].length, level: match[1].length, title: match[2], quote: line[0]}];
        return line === first && line[0].trim().length <= 240 ?
          [{start: line.index, end: line.index + line[0].length, level: 0, title: line[0].trim(), quote: line[0]}] : [];
      });
      return headings.filter((heading, index) => prefixMatches(heading.title, product) &&
        !parallelSuffix(heading.title.slice(heading.title.indexOf(product) + product.length).replace(/^[》〉]/u, '')) && entityEvidence.some(q => {
        const stop = headings.slice(index + 1).find(next => next.level <= heading.level)?.start ?? text.length;
        return Number.isInteger(q.start) && q.start >= heading.end && q.end <= stop;
      })).map(heading => ({exact_quote: heading.quote, start: heading.start, end: heading.end, kind: 'source-title-scope'}));
    };
    const records = recordsFor(entity), baseRecords = Array.isArray(entity?.fileContributions) ?
      entity.fileContributions.filter(c => object(c?.data)).map(c => storageFacts(c.data)) : [storageFacts(entity)];
    const facetDetails = baseRecords.flatMap(record => record.facetDetails), candidateTags = [...new Set(baseRecords.flatMap(record => record.candidateTags))];
    if (Array.isArray(entity?.fileContributions) && records.reduce((count, record) => count + record.contributionCount, 0) !== entity.fileContributions.length) report('PRODUCT_CONTEXT_CONTRIBUTION_AMBIGUOUS', '来源贡献结构不完整或同来源同版本身份/主类型冲突，未使用有歧义贡献补全产品');
    if (!records.length && baseRecords.length) report('PRODUCT_CONTEXT_SOURCE_UNBOUND', '来源 ID/revision 不完整或多来源未独立归属，未补全产品上下文');
    for (const record of records) {
      const {data} = record, source = record.source, primary = primaryFor(data), file = completeSource(source) ? fileFor(source) : null;
      if (!file) { report('PRODUCT_CONTEXT_SOURCE_STALE', '来源已删除、版本变化或来源归属不完整，未补全产品上下文', source, primary); continue; }
      source.file = file.name || source.file || '';
      const ownFacets = storageFacts(data), direct = ownFacets.facetDetails.filter(d => d.dimension === 'product' && d.basis === 'explicit' &&
        compatibleSource(d, source) && (record.bound || sameSource(sourceFields(d), source)));
      if (record.legacy || file.legacy === true || typeof file.text !== 'string') { report('PRODUCT_CONTEXT_EVIDENCE_UNVERIFIABLE', '历史来源归属或原文无法安全验证；旧值不作新证据，请补充原文并按需重新运行，未自动重抽或补全产品', source, primary); continue; }
      if (direct.length) {
        const values = new Set(direct.map(detail => detail.value)), scope = singleProduct(data.identityAnchors?.productIpScope);
        if (values.size > 1 || scope && !values.has(scope)) report('PRODUCT_CONTEXT_EXPLICIT_PRIORITY', '同来源直接明示产品优先，未追加不同的主话题上下文产品', source, primary);
        continue;
      }
      if (!primary) { report('PRODUCT_CONTEXT_PRIMARY_INVALID', '主话题未有效包含在当前贡献的话题引用中', source); continue; }
      const matchingTopics = topicIndex.get(primary) || [];
      const scopedTopic = matchingTopics.length === 1 ? topicFor(matchingTopics[0], source) : null;
      if (!scopedTopic) { if (!direct.length) report('PRODUCT_CONTEXT_TOPIC_UNBOUND', '主话题已删除或没有同来源同版本的话题绑定', source, primary); continue; }
      if (scopedTopic.legacy) { report('PRODUCT_CONTEXT_EVIDENCE_UNVERIFIABLE', '历史话题只有旧引用、缺少可验证来源证据；请补充原文并按需重新运行，未自动重抽或按话题名猜产品', source, primary); continue; }
      const ownEvidence = evidenceFor(data.sources, source, file, record.bound);
      if (!ownEvidence.length) { if (!direct.length) report('PRODUCT_CONTEXT_ENTITY_EVIDENCE_MISSING', '当前来源的实体逐字证据未通过验证', source, primary); continue; }
      const t = scopedTopic.data, topicEvidence = evidenceFor([...list(t.evidences), ...(typeof t.quote === 'string' && !scopedTopic.legacy ? [t] : [])], source, file, scopedTopic.bound && !scopedTopic.legacy);
      const matchesTopic = product => {
        const names = [t.name, t.object_anchor].filter(value => typeof value === 'string' && value.trim());
        const partialConflict = names.some(value => {
          const name = format(value).replace(/^[《〈]/u, '');
          return name.startsWith(product) && !prefixMatches(value, product);
        });
        const parallelScope = names.some(value => {
          const name = format(value);
          if (!prefixMatches(value, product)) return false;
          const suffix = name.slice(name.indexOf(product) + product.length).replace(/^[》〉]/u, '');
          return parallelSuffix(suffix);
        });
        return !partialConflict && !parallelScope && names.some(value => prefixMatches(value, product));
      };
      const roles = new Map(), confirmedProducts = new Set();
      const addRole = (product, proof, role) => {
        if (!product || !matchesTopic(product)) return;
        const title = titleEvidence(file.text, product, ownEvidence).map(q => ({...q, source: {...source}}));
        const related = topicEvidence.filter(q => mentionsProduct(q.exact_quote, product));
        const topicProof = related.length ? related : title;
        const combined = [...topicEvidence.filter(q => q.exact_quote.includes(product)), ...topicProof, ...proof];
        const competingName = combined.some(q => [...q.exact_quote.matchAll(/[《〈]([^《》〈〉]+)[》〉]/gu)].some(match =>
          match[1].trim().startsWith(product) && match[1].trim() !== product) ||
          [...q.exact_quote.matchAll(new RegExp(product.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gu'))].some(match =>
            continuation(q.exact_quote.slice(match.index + product.length).replace(/^[》〉]/u, ''))));
        const parallelProof = combined.some(q => mentionsProduct(q.exact_quote, product) &&
          /(?:都是|均为|均是|分别属于|分别适用|两款游戏|多个游戏|多款游戏|共享范围|共用范围)|\S(?:与|和|及|或)\S.*(?:分别|共享|共用|通用)/u.test(q.exact_quote));
        if (!topicProof.length || !proof.length || competingName || parallelProof) return;
        if (!roles.has(product)) roles.set(product, []);
        roles.get(product).push({productEvidence: proof, topicEvidence: topicProof, role});
      };
      const rawScope = data.identityAnchors?.productIpScope;
      const identityReview = list(data.reviewReasons).includes('ENTITY_IDENTITY_REVIEW') || data.identityDecision === 'review';
      const product = singleProduct(rawScope);
      const unclearTopic = [t.name, t.object_anchor].some(value => typeof value === 'string' &&
        /跨(?:产品|游戏|IP)|多(?:产品|游戏)|(?:产品|游戏|IP)(?:比较|对比|共享|共用|通用)|(?:比较|对比|共享|共用|通用)(?:产品|游戏|IP)|^(?:共享|共用|通用|比较|对比|shared|comparison)$|\bcross[- ]?(?:product|game)\b/iu.test(value));
      if (unclearTopic) {
        if (!direct.length) report('PRODUCT_CONTEXT_TOPIC_AMBIGUOUS', '主话题为跨产品、比较或共享范围，未补全产品上下文', source, primary);
        continue;
      }
      if (identityReview || !absent(rawScope) && !product) {
        if (!direct.length) report('PRODUCT_CONTEXT_IDENTITY_AMBIGUOUS', '当前来源身份产品范围未确认、为多值或共享占位，未补全产品上下文', source, primary);
        continue;
      }
      if (product && !matchesTopic(product)) {
        report('PRODUCT_CONTEXT_SCOPE_CONFLICT', direct.length ? '直接明示产品保留；来源身份与主话题产品边界不一致，未追加上下文值' : '来源身份产品范围与主话题明确前缀/对象锚点不一致，未补全产品上下文', source, primary);
        continue;
      }
      if (product && !record.legacy && !scopedTopic.legacy) {
        const proof = topicEvidence.filter(q => mentionsProduct(q.exact_quote, product));
        const title = titleEvidence(file.text, product, ownEvidence).map(q => ({...q, source: {...source}}));
        if (proof.length || title.length) addRole(product, proof.length ? proof : title, {kind: 'identity-product-scope', productIpScope: rawScope});
      }
      if (!index.peers) {
        index.peers = new Map();
        // 确认角色按"同来源"收集：攻略正文里产品名通常只出现在标题和个别词条，游戏本体实体往往挂在
        // 另一个主话题下；按主话题分组会让资源/机制类实体永远拿不到确认角色（PRODUCT_CONTEXT_INSUFFICIENT）。
        for (const anchor of list(entities)) for (const peer of recordsFor(anchor)) {
          if (peer.legacy) continue;
          const key = sourceKey(peer.source);
          if (!index.peers.has(key)) index.peers.set(key, []);
          index.peers.get(key).push({anchor, peer});
        }
      }
      const confirmationCache = index.confirmations ??= new Map(), confirmationKey = sourceKey(source);
      if (!confirmationCache.has(confirmationKey)) {
        const candidateRoles = [], products = new Set();
        for (const {anchor, peer} of index.peers.get(confirmationKey) || []) {
          const peerEvidence = evidenceFor(peer.data.sources, source, file, peer.bound);
          if (!peerEvidence.length) continue;
          const type = resolveTagType(peer.data, workbook), types = typeInputs(peer.data).labels;
          if (type.id === 'ET-PROD-GAME' && types.length === 1 && !entityTypeIssueText(peer.data) &&
              !list(peer.data.reviewReasons).includes('ENTITY_IDENTITY_REVIEW') && peer.data.identityDecision !== 'review') {
            const name = singleProduct(peer.data.name), peerScope = peer.data.identityAnchors?.productIpScope,
              scope = singleProduct(peerScope), proof = name ? peerEvidence.filter(q => mentionsProduct(q.exact_quote, name)) : [];
            if (proof.length && (absent(peerScope) || scope === name)) {
              products.add(name);
              candidateRoles.push({name, proof, role: {kind: 'confirmed-game-entity', entityId: anchor.id}});
            }
          }
          for (const detail of storageFacts(peer.data).facetDetails.filter(d => d.dimension === 'product' && d.basis === 'explicit')) {
            const name = singleProduct(detail.value);
            if (!name || !compatibleSource(detail, source) || !peer.bound && !sameSource(sourceFields(detail), source)) continue;
            const proof = evidenceFor(detail.evidences, source, file, peer.bound).filter(q => q.exact_quote === detail.quote && mentionsProduct(q.exact_quote, name) && peerEvidence.some(eq =>
              Number.isInteger(q.start) && Number.isInteger(eq.start) ? q.start < eq.end && q.end > eq.start &&
                (eq.exact_quote.includes(q.exact_quote) || [peer.data.name, ...list(peer.data.aliases)].some(n => typeof n === 'string' && n.trim() && q.exact_quote.includes(n.trim()))) : eq.exact_quote.includes(q.exact_quote)));
            if (proof.length) {
              products.add(name);
              candidateRoles.push({name, proof, role: {kind: 'direct-explicit-product', entityId: anchor.id}});
            }
          }
        }
        confirmationCache.set(confirmationKey, {candidateRoles, products});
      }
      // 同伴改为按来源收集，但冲突判定保持原语义：同来源出现多个已确认产品仍判冲突；
      // 只有与主话题边界一致的候选才真正产出角色（addRole 内部 matchesTopic 过滤）。
      const confirmationsForSource = confirmationCache.get(confirmationKey);
      for (const name of confirmationsForSource.products) confirmedProducts.add(name);
      for (const candidate of confirmationsForSource.candidateRoles) addRole(candidate.name, candidate.proof, candidate.role);
      if (confirmedProducts.size > 1 || product && [...confirmedProducts].some(value => value !== product)) {
        report('PRODUCT_CONTEXT_CONFIRMED_CONFLICT', '同来源同主话题已确认的产品角色有多值，或与当前来源身份范围冲突，未补全产品上下文', source, primary);
        continue;
      }
      if (roles.size !== 1) {
        report(roles.size ? 'PRODUCT_CONTEXT_MULTIPLE_PRODUCTS' : 'PRODUCT_CONTEXT_INSUFFICIENT', roles.size ?
          '同来源主话题支持多个产品或角色冲突，未补全产品上下文' : '缺少可相互确认的产品角色及同来源逐字话题/标题证据，未补全产品上下文', source, primary);
        continue;
      }
      const [value, confirmations] = [...roles.entries()][0];
      if (product && product !== value) { report('PRODUCT_CONTEXT_SCOPE_CONFLICT', '当前来源身份与已确认产品角色冲突，未补全产品上下文', source, primary); continue; }
      const uniqueEvidence = entries => [...new Map(entries.map(q => [JSON.stringify(q), q])).values()];
      const productEvidence = uniqueEvidence(confirmations.flatMap(c => c.productEvidence));
      const context = {topicId: primary, topicName: t.name || '', objectAnchor: t.object_anchor || '',
        roles: confirmations.map(c => c.role), topicEvidences: uniqueEvidence(confirmations.flatMap(c => c.topicEvidence)),
        entityEvidences: ownEvidence};
      derived.push({dimension: 'product', value, basis: 'contextual', quote: productEvidence[0].exact_quote,
        entityQuote: ownEvidence[0].exact_quote, evidences: productEvidence, source: {...source}, context,
        reason: '当前来源的有效主话题与已确认产品角色相互支持，并有同来源逐字证据；仅补全产品，不继承版本'});
    }
    const details = [...facetDetails, ...derived];
    return {suggestedFacets: Object.fromEntries(dimensions.map(dimension => [dimension,
      [...new Set(details.filter(d => d.dimension === dimension).map(d => d.value))]])),
      candidateTags, facetDetails: details, productContextIssues: [...new Map(issues.map(issue => [JSON.stringify(issue), issue])).values()]};
  }

  function entityTypeIssueText(entity) {
    const issue = object(entity) ? entity.typeIssue : null;
    if (object(issue) && typeof issue.reason === 'string' && issue.reason.trim()) return issue.reason.trim();
    if (typeof issue === 'string' && issue.trim()) return issue.trim();
    const {labels} = typeInputs(entity);
    return labels.length && labels.every(label => !missing(label)) ? '' : '主类型未选择/无效';
  }

  Object.assign(globalThis, {tagTypeDefinition, resolveTagType, extractSemanticFacets, clearDerivedSemanticStorage, semanticFacetStorage, mergeSourceContributionData, entitySemanticFacets, entityTypeIssueText});
})();
