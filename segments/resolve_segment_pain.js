// segments/resolve_segment_pain.js
// Resolver neutro, robusto e sempre com "dor" definida (usa FALLBACK_DOR em casos fracos/ambíguos)

const { SEGMENTOS, FALLBACK_DOR } = require("./segments_catalog");

// ---------- Helpers ----------
function normalize(str = "") {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s\/&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(str = "") {
  const n = normalize(str);
  if (!n) return new Set();
  return new Set(n.split(" ").filter(Boolean));
}

function hasWholeWord(hay, needle) {
  const n = normalize(needle);
  if (!n) return false;
  const rx = new RegExp(`(^|\\b|\\s)${n}($|\\b|\\s)`);
  return rx.test(hay);
}

function countHitsInTokens(tokensSet, list = []) {
  let hits = 0;
  for (const raw of list || []) {
    const n = normalize(raw);
    if (!n) continue;
    if (tokensSet.has(n)) hits++;
  }
  return hits;
}

// ---------- Scoring ----------
const CONF_THRESH_STRONG = 70;
const GAP_MIN_DISAMBIG   = 12;

const WEIGHTS = Object.freeze({
  alias_strong: 90,
  alias_partial: 45,
  kw_per_hit: 20,
  kw_cap: 70,
  sub_kw_per_hit: 22,
  sub_kw_cap: 66,
  sub_alias_strong: 28,
  sub_alias_partial: 14,
  neg_per_hit: 45,
  neg_cap: 135,
  generic_penalty: 15
});

function scoreOne(corpus, subCorpus, tokens, subTokens, rawItem) {
  const item = {
    aliases: [], keywords: [], neg_keywords: [],
    generic: false, segmento: "Indefinido", dor: FALLBACK_DOR,
    ...(rawItem || {})
  };

  const aliases = item.aliases || [];
  const kws     = item.keywords || [];
  const negs    = item.neg_keywords || [];
  const generic = Boolean(item.generic);

  let score = 0;
  const reasons = [];
  let positiveSignals = 0;

  // aliases (segmento)
  for (const a of aliases) {
    if (!a) continue;
    if (hasWholeWord(corpus, a) || corpus === normalize(a)) {
      score += WEIGHTS.alias_strong;
      reasons.push(`alias_strong:${a}`);
      positiveSignals++;
      break;
    } else if (corpus.includes(normalize(a))) {
      score += WEIGHTS.alias_partial;
      reasons.push(`alias_partial:${a}`);
      positiveSignals++;
    }
  }

  // keywords (segmento)
  const kwSeg = countHitsInTokens(tokens, kws);
  if (kwSeg > 0) {
    const pts = Math.min(kwSeg * WEIGHTS.kw_per_hit, WEIGHTS.kw_cap);
    score += pts;
    reasons.push(`kw_seg:${kwSeg}`);
    positiveSignals += kwSeg;
  }

  // subsegmento: aliases + keywords (reuso dos mesmos aliases/kws para simplificar)
  for (const a of aliases) {
    if (!a) continue;
    if (hasWholeWord(subCorpus, a) || subCorpus === normalize(a)) {
      score += WEIGHTS.sub_alias_strong;
      reasons.push(`sub_alias_strong:${a}`);
      positiveSignals++;
      break;
    } else if (subCorpus.includes(normalize(a))) {
      score += WEIGHTS.sub_alias_partial;
      reasons.push(`sub_alias_partial:${a}`);
      positiveSignals++;
    }
  }

  const kwSub = countHitsInTokens(subTokens, kws);
  if (kwSub > 0) {
    const pts = Math.min(kwSub * WEIGHTS.sub_kw_per_hit, WEIGHTS.sub_kw_cap);
    score += pts;
    reasons.push(`kw_sub:${kwSub}`);
    positiveSignals += kwSub;
  }

  // negativas
  const negSeg = countHitsInTokens(tokens, negs);
  const negSub = countHitsInTokens(subTokens, negs);
  const negHits = negSeg + negSub;
  if (negHits > 0) {
    const pen = Math.min(negHits * WEIGHTS.neg_per_hit, WEIGHTS.neg_cap);
    score -= pen;
    reasons.push(`neg:${negHits}`);
  }

  // penalidade leve para segmento "genérico" se não houver alias forte
  const hadAliasStrong =
    reasons.some(r => r.startsWith("alias_strong:")) ||
    reasons.some(r => r.startsWith("sub_alias_strong:"));
  if (generic && !hadAliasStrong) {
    score -= WEIGHTS.generic_penalty;
    reasons.push("generic_penalty");
  }

  const confidence = Math.max(0, Math.min(100, score));
  if (positiveSignals === 0) {
    return { score: 0, reasons: reasons.concat("no_positive_signals"), item };
  }
  return { score: confidence, reasons, item };
}

// ---------- Público ----------
function resolveSegmentPain(segmento, subsegmento) {
  const corpus     = normalize(segmento || "");
  const subCorpus  = normalize(subsegmento || "");
  const tokens     = tokenize(corpus);
  const subTokens  = tokenize(subCorpus);

  // Sem input → fallback direto
  if (!corpus && !subCorpus) {
    return {
      segmento_resolvido: "Generico",
      dor: FALLBACK_DOR,
      via: "fallback_input_vazio",
      confidence: 0,
      debug: []
    };
  }

  const ranked = (SEGMENTOS || []).map((it) => {
    const { score, reasons, item } = scoreOne(corpus, subCorpus, tokens, subTokens, it);
    return { item, score, reasons };
  }).sort((a, b) => b.score - a.score);

  const top = ranked[0] || null;
  const second = ranked[1] || null;

  // Nenhuma evidência
  if (!top || top.score === 0) {
    return {
      segmento_resolvido: "Generico",
      dor: FALLBACK_DOR,
      via: "fallback_sem_evidencia",
      confidence: 0,
      debug: ranked.slice(0, 5)
    };
  }

  const gap = second ? top.score - second.score : top.score;

  if (top.score >= CONF_THRESH_STRONG && gap >= GAP_MIN_DISAMBIG) {
    return {
      segmento_resolvido: top.item.segmento || "Indefinido",
      dor: (typeof top.item.dor === "string" && top.item.dor.trim()) ? top.item.dor : FALLBACK_DOR,
      via: "match_confiante",
      confidence: top.score,
      debug: ranked.slice(0, 5)
    };
  }

  // Desempate neutro por sinais positivos líquidos
  if (second) {
    const posTop = top.reasons.filter(r => r.startsWith("alias_") || r.startsWith("kw_")).length;
    const posSec = second.reasons.filter(r => r.startsWith("alias_") || r.startsWith("kw_")).length;

    const negTop = (top.reasons.find(r => r.startsWith("neg:")) || "neg:0").split(":")[1] * 1 || 0;
    const negSec = (second.reasons.find(r => r.startsWith("neg:")) || "neg:0").split(":")[1] * 1 || 0;

    const netTop = posTop - negTop;
    const netSec = posSec - negSec;

    const winner = netTop > netSec ? top : (netSec > netTop ? second : top);

    if (winner.score >= CONF_THRESH_STRONG) {
      return {
        segmento_resolvido: winner.item.segmento || "Indefinido",
        dor: (typeof winner.item.dor === "string" && winner.item.dor.trim()) ? winner.item.dor : FALLBACK_DOR,
        via: "match_desempatado_neutro",
        confidence: winner.score,
        debug: ranked.slice(0, 5)
      };
    }
  }

  // Fraco ou ambíguo → fallback (nunca em branco)
  return {
    segmento_resolvido: "Generico",
    dor: FALLBACK_DOR,
    via: "fallback_ambiguo_ou_fraco",
    confidence: top.score,
    debug: ranked.slice(0, 5)
  };
}

module.exports = { resolveSegmentPain };

