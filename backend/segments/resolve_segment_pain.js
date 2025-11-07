// backend/segments/resolve_segment_pain.js
const SEGMENTS = require("./segments_catalog");

// Fallback genérico — só usar em exceção (quando não der para determinar o segmento)
const FALLBACK_GENERIC =
  "Pressão para reduzir custos e ganhar eficiência operacional, fortalecer a governança e segurança, acelerar a digitalização com uso pragmático de IA para criar vantagem competitiva e responder mais rápido ao mercado.";

// normaliza (lowercase, sem acentos, remove pontuação básica)
function normalize(s = "") {
  const t = String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t;
}

// retorna melhor match entre subsegmento/segmento e catálogo
function scoreFor(text, variantes = []) {
  if (!text) return 0;
  const base = normalize(text);
  let score = 0;
  for (const v of variantes) {
    const nv = normalize(v);
    // conta 1 ponto se a variante inteira aparecer
    if (nv && base.includes(nv)) score += 1;
  }
  return score;
}

/**
 * Resolve a dor do segmento considerando subsegmento primeiro e depois segmento.
 * Retorna { segmento_resolvido, score, dor }
 */
function resolveSegmentPain(segmento, subsegmento) {
  const cand = [];

  for (const s of SEGMENTS) {
    const scoreSub = scoreFor(subsegmento, [s.segmento, ...s.variantes]);
    const scoreSeg = scoreFor(segmento,    [s.segmento, ...s.variantes]);
    const score = Math.max(scoreSub, scoreSeg);
    if (score > 0) {
      cand.push({ segmento_resolvido: s.segmento, score, dor: s.dor });
    }
  }

  if (!cand.length) {
    return { segmento_resolvido: "Genérico", score: 0, dor: FALLBACK_GENERIC };
  }

  // escolhe o de maior score; em empate, prioriza o primeiro da lista
  cand.sort((a, b) => b.score - a.score);
  return cand[0];
}

module.exports = { resolveSegmentPain, FALLBACK_GENERIC };
