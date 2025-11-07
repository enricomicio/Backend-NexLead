// segments/resolve_segment_pain.js
// Mapeia (segmento, subsegmento) → dor usando um score neutro, robusto e explicável.
// Não requer mudanças no backend. Sem “foco” em segmentos específicos.

const { SEGMENTOS, FALLBACK_DOR } = require("./segments_catalog");

// ===================== Helpers =====================
function normalize(str = "") {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // tira acentos
    .replace(/[^\w\s\/&-]/g, " ")    // limpa pontuação estranha
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

// ===================== Scoring config (neutro) =====================
// Ajustes conservadores (sem privilegiar setores):
const CONF_THRESH_STRONG = 70; // mínimo para aceitar um match como “confiável”
const GAP_MIN_DISAMBIG   = 12; // gap mínimo para declarar vencedor sem ambiguidade

const WEIGHTS = Object.freeze({
  alias_strong: 90,   // alias bate como palavra inteira ou igualdade total
  alias_partial: 45,  // alias aparece parcial no texto
  kw_per_hit: 20,     // por keyword encontrada
  kw_cap: 70,         // teto de pontos por keywords do segmento
  sub_kw_per_hit: 22, // por keyword no subsegmento
  sub_kw_cap: 66,     // teto por keywords no subsegmento
  sub_alias_strong: 28,
  sub_alias_partial: 14,
  neg_per_hit: 45,    // penalidade por negativa
  neg_cap: 135,
  generic_penalty: 15 // penalidade leve para segmentos marcados como "generic"
});

function scoreOne(corpus, subCorpus, tokens, subTokens, item) {
  const aliases = item.aliases || [];
  const kws     = item.keywords || [];
  const negs    = item.neg_keywords || [];
  const generic = Boolean(item.generic);

  let score = 0;
  const reasons = [];
  let positiveSignals = 0; // para saber se houve evidência positiva real

  // ---- Aliases (segmento) ----
  for (const a of aliases) {
    if (!a) continue;
    if (hasWholeWord(corpus, a) || corpus === normalize(a)) {
      score += WEIGHTS.alias_strong;
      reasons.push(`alias_strong:${a}`);
      positiveSignals++;
      // já tem um forte — não precisa somar outros aliases fortes
      break;
    } else if (corpus.includes(normalize(a))) {
      score += WEIGHTS.alias_partial;
      reasons.push(`alias_partial:${a}`);
      positiveSignals++;
    }
  }

  // ---- Keywords (segmento) ----
  const kwSeg = countHitsInTokens(tokens, kws);
  if (kwSeg > 0) {
    const pts = Math.min(kwSeg * WEIGHTS.kw_per_hit, WEIGHTS.kw_cap);
    score += pts;
    reasons.push(`kw_seg:${kwSeg}`);
    positiveSignals += kwSeg;
  }

  // ---- Subsegmento: aliases + keywords ----
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

  // ---- Negativas (segmento+sub) ----
  const negSeg = countHitsInTokens(tokens, negs);
  const negSub = countHitsInTokens(subTokens, negs);
  const negHits = negSeg + negSub;
  if (negHits > 0) {
    const pen = Math.min(negHits * WEIGHTS.neg_per_hit, WEIGHTS.neg_cap);
    score -= pen;
    reasons.push(`neg:${negHits}`);
  }

  // ---- Penalidade para "generic:true" (apenas se não houve alias forte)
  const hadAliasStrong =
    reasons.some(r => r.startsWith("alias_strong:")) ||
    reasons.some(r => r.startsWith("sub_alias_strong:"));
  if (generic && !hadAliasStrong) {
    score -= WEIGHTS.generic_penalty;
    reasons.push("generic_penalty");
  }

  // ---- Confiança (0..100)
  const confidence = Math.max(0, Math.min(100, score));

  // Para evitar “acerto sem evidência”: se não houve nenhum sinal positivo, zera.
  if (positiveSignals === 0) {
    return { score: 0, reasons: reasons.concat("no_positive_signals") };
  }

  return { score: confidence, reasons };
}

// ===================== Público =====================
function resolveSegmentPain(segmento, subsegmento) {
  const corpus     = normalize(segmento || "");
  const subCorpus  = normalize(subsegmento || "");
  const tokens     = tokenize(corpus);
  const subTokens  = tokenize(subCorpus);

  // Calcula score para todos os candidatos
  const ranked = SEGMENTOS.map((item) => {
    const { score, reasons } = scoreOne(
      corpus, subCorpus, tokens, subTokens, item
    );
    return { item, score, reasons };
  }).sort((a, b) => b.score - a.score);

  const top = ranked[0] || null;
  const second = ranked[1] || null;

  // Sem candidato relevante
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

  // Vence se: forte o suficiente e sem ambiguidade
  if (top.score >= CONF_THRESH_STRONG && gap >= GAP_MIN_DISAMBIG) {
    return {
      segmento_resolvido: top.item.segmento,
      dor: top.item.dor,
      via: "match_confiante",
      confidence: top.score,
      debug: ranked.slice(0, 5)
    };
  }

  // Desempate neutro por “positivos líquidos”
  if (second) {
    const posTop =
      (top.reasons.filter(r => r.startsWith("alias_") || r.startsWith("kw_")).length);
    const posSec =
      (second.reasons.filter(r => r.startsWith("alias_") || r.startsWith("kw_")).length);

    const negTop =
      (top.reasons.filter(r => r.startsWith("neg:")).reduce((acc, r) => {
        const m = r.match(/neg:(\d+)/); return acc + (m ? Number(m[1]) : 0);
      }, 0));
    const negSec =
      (second.reasons.filter(r => r.startsWith("neg:")).reduce((acc, r) => {
        const m = r.match(/neg:(\d+)/); return acc + (m ? Number(m[1]) : 0);
      }, 0));

    const netTop = posTop - negTop;
    const netSec = posSec - negSec;

    const winner = netTop > netSec ? top : (netSec > netTop ? second : top);

    if (winner.score >= CONF_THRESH_STRONG) {
      return {
        segmento_resolvido: winner.item.segmento,
        dor: winner.item.dor,
        via: "match_desempatado_neutro",
        confidence: winner.score,
        debug: ranked.slice(0, 5)
      };
    }
  }

  // Ambíguo ou fraco → evita errar: usa fallback genérico
  return {
    segmento_resolvido: "Generico",
    dor: FALLBACK_DOR,
    via: "fallback_ambiguo_ou_fraco",
    confidence: top.score,
    debug: ranked.slice(0, 5)
  };
}

module.exports = { resolveSegmentPain };

