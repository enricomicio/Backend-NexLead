// segments/resolve_segment_pain.js
const { SEGMENTOS, FALLBACK_DOR } = require("./segments_catalog");

/** Utils de normalização */
function norm(s = "") {
  return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function toTokens(s = "") {
  return norm(s).split(/[^a-z0-9]+/).filter(Boolean);
}
function hasWholeWord(hay = "", word = "") {
  if (!word) return false;
  const w = norm(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rx = new RegExp(`(?:^|\\b)${w}(?:\\b|$)`, "i");
  return rx.test(norm(hay));
}

/** Índice alias->segmento (para match exato) */
function buildAliasIndex(catalog) {
  const idx = new Map();
  for (const item of catalog) {
    const seg = item.segmento;
    const aliases = Array.isArray(item.aliases) ? item.aliases : [];
    const all = [seg, ...aliases];
    for (const a of all) {
      const na = norm(a);
      if (!na) continue;
      if (!idx.has(na)) idx.set(na, new Set());
      idx.get(na).add(seg);
    }
  }
  return idx;
}

/** Pega item do catálogo pelo nome do segmento (normalizado) */
function getByKey(catalog, key) {
  const nk = norm(key);
  return catalog.find(s => norm(s.segmento) === nk) || null;
}

/** Calcula score de um segmento dado o texto (segmento+subsegmento) */
function scoreSegment(item, inputTextTokens, subsegmentTextTokens) {
  const aliases = Array.isArray(item.aliases) ? item.aliases : [];
  const keywords = Array.isArray(item.keywords) ? item.keywords : []; // opcional (backward-compatible)

  // Conjuntos
  const aliasSet = new Set(aliases.map(a => norm(a)));
  const keywSet  = new Set(keywords.map(k => norm(k)));

  // Tokens presentes
  const inputSet = new Set(inputTextTokens);
  const subSet   = new Set(subsegmentTextTokens);

  // Pontuações base
  let score = 0;
  let hitsAliases = 0;
  let hitsKeywords = 0;

  // 1) Nome do segmento (palavra inteira) vale mais
  if (hasWholeWord(inputTextTokens.join(" "), item.segmento)) score += 32;

  // 2) Aliases (palavra inteira)
  for (const a of aliasSet) {
    if (!a) continue;
    if (hasWholeWord(inputTextTokens.join(" "), a)) {
      score += 14;
      hitsAliases++;
    }
  }

  // 3) Keywords (se houver) — um pouco menos que alias
  for (const k of keywSet) {
    if (!k) continue;
    if (hasWholeWord(inputTextTokens.join(" "), k)) {
      score += 9;
      hitsKeywords++;
    }
  }

  // 4) Bônus se bater também no SUBSEGMENTO (ajuda muito a desambiguar)
  //    (Ex.: "banco de investimentos", "varejo alimentar", "logística frigorificada")
  let subBoost = 0;
  if (subSet.size) {
    // se algum alias do segmento aparece no subsegmento → +8 por ocorrência (cap em +16)
    for (const a of aliasSet) {
      if (a && hasWholeWord(subsegmentTextTokens.join(" "), a)) subBoost += 8;
    }
    // se alguma keyword aparece no subsegmento → +5 por ocorrência (cap em +15)
    for (const k of keywSet) {
      if (k && hasWholeWord(subsegmentTextTokens.join(" "), k)) subBoost += 5;
    }
    if (subBoost > 16) subBoost = 16;
    score += subBoost;
  }

  // 5) Penalidade por “generalidade”:
  //    Se o segmento só pontuou por termos super genéricos (poucos hits + sem nome do segmento)
  const usedName = hasWholeWord(inputTextTokens.join(" "), item.segmento);
  const totalHits = hitsAliases + hitsKeywords + (usedName ? 1 : 0);
  if (!usedName && totalHits <= 1) {
    score -= 6; // leve
  }

  // 6) Normalização por densidade:
  //    Evita que um segmento com lista muito extensa de aliases ganhe “de graça”.
  //    (Quanto mais aliases/keywords, maior o divisor — mas com limite mínimo)
  const denom = Math.max(1, Math.sqrt(1 + aliases.length * 0.6 + keywords.length * 0.4));
  const finalScore = Math.max(0, Math.round(score / denom));

  return finalScore;
}

/** Resolve o segmento por 3 etapas (exato -> score -> fallback) */
function resolveSegmentByRules(segmentoRaw, subsegmentoRaw, catalog, debug = false) {
  const inputRaw = `${segmentoRaw || ""}`.trim();
  const subRaw   = `${subsegmentoRaw || ""}`.trim();

  // 1) EXATO por alias/nome
  const aliasIndex = buildAliasIndex(catalog);
  const entireText = `${inputRaw} ${subRaw}`.trim();
  for (const [aliasNorm, keySet] of aliasIndex.entries()) {
    if (!aliasNorm) continue;
    if (hasWholeWord(entireText, aliasNorm)) {
      const [first] = Array.from(keySet); // determinístico
      const found = getByKey(catalog, first);
      if (found) {
        debug && console.log("[dor-offline] match exato:", found.segmento);
        return { item: found, confidence: 95, via: "catalogo" };
      }
    }
  }

  // 2) SCORING
  const tokensInput = toTokens(entireText);
  const tokensSub   = toTokens(subRaw);

  let best = null;
  let bestScore = -1;

  for (const item of catalog) {
    const sc = scoreSegment(item, tokensInput, tokensSub);
    if (sc > bestScore) {
      best = item;
      bestScore = sc;
    }
  }

  // Thresholds:
  // >= 55 confiante; 40–54 aceitável; < 40 arriscado (cai para fallback)
  if (best && bestScore >= 55) {
    debug && console.log("[dor-offline] score forte:", best.segmento, "| score:", bestScore);
    return { item: best, confidence: Math.min(99, bestScore), via: "catalogo" };
  }
  if (best && bestScore >= 40) {
    debug && console.log("[dor-offline] score aceitável:", best.segmento, "| score:", bestScore);
    return { item: best, confidence: bestScore, via: "catalogo" };
  }

  debug && console.log("[dor-offline] nenhum score suficiente (<=39) → fallback");
  return { item: null, confidence: 0, via: "fallback" };
}

/** API principal (chamada pelo index.js) */
function resolveSegmentPain(segmento, subsegmento, { debug = false } = {}) {
  const { item, confidence, via } = resolveSegmentByRules(segmento, subsegmento, SEGMENTOS, debug);

  if (item) {
    return {
      segmento_resolvido: item.segmento,
      dor: item.dor,
      via,
      confidence
    };
  }

  return {
    segmento_resolvido: "Generico",
    dor: FALLBACK_DOR,
    via: "fallback",
    confidence: 20
  };
}

module.exports = { resolveSegmentPain };
