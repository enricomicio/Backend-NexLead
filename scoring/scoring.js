// scoring/scoring.js
const ERPS = require('./erp_catalog');
const FISCALS = require('./fiscal_catalog');

/* -------------------------- PARSERS & HELPERS -------------------------- */

const toInt = (s) => {
  if (s == null) return 0;
  const n = parseInt(String(s).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

// Converte número pt/US com milhar e decimal
function toNumberBR(token) {
  if (!token) return 0;
  let t = String(token);
  if (t.includes(',') && t.includes('.')) {
    if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/,/g, '');
  } else if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.');
  } else {
    const idx = t.lastIndexOf('.');
    if (idx >= 0) {
      const dec = t.length - idx - 1;
      if (dec > 3) t = t.replace(/\./g, '');
    }
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

// "1.001–5.000", "3.200+", "2.000 a 5.000", "1500-2000", "≈ 800", "1.2k"
function parseEmployees(raw) {
  if (!raw) return 0;
  const s = String(raw).toLowerCase().replace(/\s+/g, ' ').trim();

  // k/mi abreviação
  const kMatch = s.match(/(\d+(?:[.,]\d+)?)\s*k\b/);
  if (kMatch) return Math.round(parseFloat(kMatch[1].replace(',', '.')) * 1000);

  // intervalo com separadores
  const range = s.match(/(\d[\d.,]*)\s*(?:–|-|a|até)\s*(\d[\d.,]*)/i);
  if (range) {
    const a = toNumberBR(range[1]);
    const b = toNumberBR(range[2]);
    if (a && b) return Math.round((a + b) / 2);
  }

  // número com "+" (ex.: 3200+)
  const plus = s.match(/(\d[\d.,]*)\s*\+/);
  if (plus) return toNumberBR(plus[1]);

  // único número
  const one = s.match(/(\d{1,3}(?:[.\,]\d{3})+(?:[.,]\d+)?|\d+[.,]\d+|\d+)/);
  return one ? toNumberBR(one[1]) : 0;
}

// "R$ 2,3 bilhões", "200 milhões", "US$ 50M" (loose; suficiente p/ banda)
function parseMoneyLoose(raw) {
  if (!raw) return 0;
  const s = String(raw).toLowerCase();

  // multiplicador textual
  const mult =
    /\bbil(h|i)?(ão|oes|ões)?\b|\bbi\b|\bb\b/.test(s) ? 1e9 :
    /\bmilh(ão|oes|ões)\b|\bmi\b|\bmm\b|\bmio\b|\bm\b/.test(s) ? 1e6 :
    /\bmil\b/.test(s) ? 1e3 : 1;

  // número
  const m = s.match(/(\d{1,3}(?:[.\,]\d{3})+(?:[.,]\d+)?|\d+[.,]\d+|\d+)/);
  if (!m) return 0;
  const base = toNumberBR(m[1]);
  return base * mult;
}

function uniqPush(arr, txt) {
  if (!txt) return;
  const t = String(txt).trim();
  if (!t) return;
  if (!arr.some(x => x.toLowerCase() === t.toLowerCase())) arr.push(t);
}

function sentence(list, max = 3) {
  const a = list.slice(0, max);
  if (a.length === 0) return '';
  if (a.length === 1) return a[0];
  if (a.length === 2) return `${a[0]} e ${a[1]}`;
  return `${a[0]}, ${a[1]} e ${a[2]}`;
}

/* ----------------------------- SIGNALS ---------------------------------- */

function deriveSignals(data) {
  const fullText = JSON.stringify(data || {}).toLowerCase();

  // NÃO usar campos “oraculares” como evidência direta
  const scrubbed = { ...data };
  delete scrubbed.erpatualouprovavel;
  delete scrubbed.solucaofiscalouprovavel;
  const safeText = JSON.stringify(scrubbed || {}).toLowerCase();

  const seg = [data?.segmento || '', data?.subsegmento || ''].join(' ').toLowerCase();

  const employeesReported = parseEmployees(data?.funcionarios);
  const revenueReported = parseMoneyLoose(data?.faturamento);

  // Sinais/keywords gerais
  const hasAzure = /azure|microsoft|power\s*bi|office\s*365|dynamics/.test(safeText);
  const hasSap = /\bsap\b|abap|s\/?4hana|sap\s+hana|sap\s+ecc|business\s+one/.test(safeText);
  const hasTotvs = /\btotvs\b|protheus|rm\b|datasul/.test(safeText);
  const hasOracle = /\boracle\b|netsuite/.test(safeText);
  const ecom = /e-?commerce|loja\s*virtual|marketplace|pedido online/.test(safeText);

  // Segmentos
  const manuf = /manufatura|ind(ú|u)stria|f(á|a)brica|produção|planta/.test(seg);
  const serviços = /servi(ç|c)os|bpo|consultoria/.test(seg);
  const alimentos = /alimentos|food|bebidas|frigor(í|i)fico|agroneg(ó|o)cio/.test(seg);
  const varejo = /varejo|retail|atacado|distribui(ç|c)(ã|a)o|log(í|i)stica/.test(seg);
  const financeiro = /(financial|financeiro|banco|segurador|seguros)/.test(seg);
  const saude = /(sa(ú|u)de|healthcare|hospital)/.test(seg);
  const energia = /(energia|utilities|el(é|e)trica)/.test(seg);

  const multiempresa = /holding|consolida(ç|c)(ã|a)o|multi-?empresa|multi-?entidade|controladas/.test(safeText);
  const cloudSaaS = /saas|cloud|nuvem|assinatura/.test(safeText);

  // Heurística simples de multinacionalidade
  const multinacional =
    /global|latam|europe|europa|usa|estados unidos|luxembourg|méxico|argentina|chile|colombia|colômbia|portugal|espanha|spain|france|fran(ç|c)a|germany|alemanha/.test(safeText)
    || /(subsidi(á|a)ria|filial)\s+(no|em)\s+[a-z]/.test(safeText);

  const setor_regulado = !!(financeiro || saude || energia);

  return {
    seg,
    employeesReported,
    revenueReported,
    hasAzure, hasSap, hasTotvs, hasOracle,
    ecom, manuf, serviços, alimentos, varejo, financeiro,
    multiempresa, cloudSaaS,
    multinacional,
    setor_regulado,
    fullText,
  };
}

/* ----------------------------- PAIN POINTS ------------------------------ */

function erpPainPoints(candidate, s) {
  const name = (candidate.name || '').toLowerCase();
  const pains = [];

  if (candidate.tier === 'enterprise') {
    uniqPush(pains, 'TCO/Capex mais elevados');
    uniqPush(pains, 'Implantação e governança mais exigentes');
    uniqPush(pains, 'Customizações fora do padrão podem aumentar complexidade');
  }
  if (candidate.tier === 'smb') {
    uniqPush(pains, 'Limitações para cenários multiempresa/alto volume');
    if (s.setor_regulado) uniqPush(pains, 'Aderência menor a requisitos regulatórios complexos');
  }

  if (name.includes('oracle') && s.financeiro) {
    uniqPush(pains, 'Ecossistema/localização BR geralmente menor que SAP em bancos');
    uniqPush(pains, 'Menos aceleradores legados em core bancário no Brasil');
  }
  if (name.includes('dynamics')) {
    uniqPush(pains, 'Menor presença setorial em bancário no BR');
    uniqPush(pains, 'Talentos/conectores específicos podem ser menos abundantes');
  }
  if (name.includes('protheus') || name.includes('totvs')) {
    if (s.financeiro) uniqPush(pains, 'Não é core tradicional para bancos/seguradoras');
    if (s.multinacional) uniqPush(pains, 'Operação multinacional complexa pode exigir engenharia adicional');
  }
  if (name.includes('business one') || name.includes('business central') || name.includes('omie')) {
    uniqPush(pains, 'Foco SMB — pode não escalar em enterprise');
  }

  return pains;
}

function fiscalPainPoints(candidate, s, erpTop1Name) {
  const pains = [];
  const nm = (candidate.name || '').toLowerCase();
  const erp = (erpTop1Name || '').toLowerCase();

  if (/mastersaf|thomson/.test(nm)) {
    uniqPush(pains, 'Licenciamento e TCO mais altos');
    uniqPush(pains, 'Implantação/governança podem ser complexas');
  }
  if (/sovos/.test(nm)) {
    if (s.financeiro) uniqPush(pains, 'Pode carecer de aceleradores muito específicos de bancário vs. Mastersaf');
  }
  if (/synchro/.test(nm)) {
    uniqPush(pains, 'Histórico mais forte em indústria/serviços do que em bancos');
    if (s.multiempresa) uniqPush(pains, 'Escala multiempresa pode exigir maior engenharia');
  }
  if (/avalara/.test(nm)) {
    uniqPush(pains, 'Mais comum em mid/SMB; pode não atender todos os cenários enterprise');
  }

  if (erp && /netsuite|dynamics/.test(erp) && /mastersaf/.test(nm)) {
    uniqPush(pains, 'Sinergia maior costuma ocorrer com SAP/Oracle');
  }

  return pains;
}

/* ----------------------------- SCORING ---------------------------------- */

function erpHardFilter(candidate, s) {
  const name = (candidate.name || '').toLowerCase();

  if (s.financeiro) {
    if (/business one|business\s*central|omie|tiny/.test(name)) {
      return { excluded: true, reason: 'SMB incompatível com setor financeiro/enterprise' };
    }
  }
  return { excluded: false };
}

function sizeMatchScore(candidate, s, why) {
  let score = 0;

  const emp = s.employeesReported;
  if (emp > 0) {
    const min = candidate.sizeHint?.minEmp ?? 0;
    const max = candidate.sizeHint?.maxEmp ?? Infinity;

    if (emp >= min && emp <= max) {
      score += 18;
      uniqPush(why, `porte compatível (${emp.toLocaleString('pt-BR')} colaboradores)`);
    } else {
      const dist =
        emp < min ? (min - emp) / (min || 1) :
        emp > max ? (emp - max) / (max || 1) : 0;
      const penal = Math.max(0, 10 - Math.min(10, Math.round(dist * 10)));
      score += penal;
      if (penal > 0) uniqPush(why, `porte parcialmente compatível (≈${emp.toLocaleString('pt-BR')})`);
    }

    if (emp >= 1500 && candidate.tier === 'enterprise') score += 6;
    if (emp > 0 && emp < 300 && candidate.tier === 'smb') score += 6;
  }

  const rev = s.revenueReported;
  if (rev > 0 && candidate.revHint) {
    const [rmin, rmax] = candidate.revHint;
    if (rev >= rmin && rev <= rmax) score += 6;
  }

  if (s.multinacional && (candidate.tags?.includes('global') || candidate.tags?.includes('multiempresa'))) {
    score += 6; uniqPush(why, 'footprint multinacional');
  }

  return score;
}

function segmentMatchScore(candidate, s, why) {
  let score = 0;

  if (s.multiempresa && candidate.tags?.includes('multiempresa')) {
    score += 8; uniqPush(why, 'estrutura multiempresa/consolidação');
  }
  if (s.cloudSaaS && (candidate.tags?.includes('saas') || candidate.tags?.includes('cloud'))) {
    score += 6; uniqPush(why, 'preferência/aderência a cloud/SaaS');
  }
  if (s.hasAzure && candidate.tags?.includes('azure')) {
    score += 7; uniqPush(why, 'stack Microsoft/Azure');
  }
  if (s.manuf && candidate.tags?.includes('manufatura')) {
    score += 6; uniqPush(why, 'manufatura/produção');
  }
  if (s.varejo && (candidate.tags?.includes('distribuição') || candidate.tags?.includes('varejo'))) {
    score += 5; uniqPush(why, 'distribuição/varejo/logística');
  }
  if (s.alimentos && candidate.tags?.includes('manufatura')) {
    score += 4; uniqPush(why, 'alimentos/bebidas');
  }
  if (s.serviços && candidate.tags?.includes('serviços')) {
    score += 4; uniqPush(why, 'serviços/BPO');
  }
  if (s.financeiro && candidate.tags?.includes('financials')) {
    score += 8; uniqPush(why, 'força em financials/setor regulado');
  }
  if (s.setor_regulado && candidate.tags?.includes('enterprise')) {
    score += 5; uniqPush(why, 'aderência a compliance/regulação');
  }

  return score;
}

function brandSignalScore(candidate, s, why) {
  let score = 0;
  const name = (candidate.name || '').toLowerCase();

  if (s.hasSap && name.includes('sap')) {
    score += 10; uniqPush(why, 'sinais públicos de stack SAP');
  }
  if (s.hasTotvs && (name.includes('totvs') || name.includes('protheus'))) {
    score += 10; uniqPush(why, 'sinais públicos de stack TOTVS');
  }
  if (s.hasOracle && (name.includes('oracle') || name.includes('netsuite'))) {
    score += 8; uniqPush(why, 'sinais de Oracle/NetSuite');
  }
  return score;
}

function keywordHitScore(candidate, text, why) {
  if (!candidate.keywords?.length) return 0;
  const hit = candidate.keywords.some(k => text.includes(String(k).toLowerCase()));
  if (hit) { uniqPush(why, 'palavras-chave do fornecedor foram encontradas'); return 20; }
  return 0;
}

/* --------------------------- ERP RANKING -------------------------------- */

function scoreERP(candidate, s, rawText) {
  const why = [];

  const hf = erpHardFilter(candidate, s);
  if (hf.excluded) {
    return {
      name: candidate.name,
      rawScore: -Infinity,
      why: [`Excluído: ${hf.reason}`],
      whyShort: 'excluído',
      pain_points: []
    };
  }

  let score = 0;
  score += keywordHitScore(candidate, rawText, why);
  score += sizeMatchScore(candidate, s, why);
  score += segmentMatchScore(candidate, s, why);
  score += brandSignalScore(candidate, s, why);

  const cname = (candidate.name || '').toLowerCase();
  if (s.financeiro && (/protheus|senior/.test(cname))) {
    score -= 12; uniqPush(why, 'não é core tradicional para bancos/seguros');
  }
  if ((/business one|business\s*central|omie/.test(cname)) &&
      (s.employeesReported >= 300 || s.revenueReported >= 800_000_000)) {
    score -= 25; uniqPush(why, 'mismatch de porte (SMB vs. enterprise)');
  }

  if (score !== -Infinity) score = Math.max(0, Math.min(100, score));

  const bullets = [];
  if (s.multiempresa && candidate.tags?.includes('multiempresa')) bullets.push('multiempresa');
  if (s.hasAzure && candidate.tags?.includes('azure')) bullets.push('Azure');
  if (s.manuf && candidate.tags?.includes('manufatura')) bullets.push('manufatura');
  if (s.varejo && (candidate.tags?.includes('distribuição') || candidate.tags?.includes('varejo'))) bullets.push('distribuição/varejo');
  if (s.cloudSaaS && (candidate.tags?.includes('saas') || candidate.tags?.includes('cloud'))) bullets.push('cloud/SaaS');
  if (bullets.length === 0 && s.employeesReported) bullets.push(`porte ≈ ${s.employeesReported.toLocaleString('pt-BR')}`);
  const whyShort = sentence(bullets, 3);

  const pain_points = erpPainPoints(candidate, s);

  return { name: candidate.name, rawScore: score, why: [...why], whyShort, pain_points };
}

/* --------------------------- FISCAL RANKING ----------------------------- */

function scoreFiscal(candidate, s, erpTop1Name, rawText) {
  const why = [];
  let score = 0;

  const e = (erpTop1Name || '').toLowerCase();
  const nm = (candidate.name || '').toLowerCase();

  // 4Tax e Guepardo: só com SAP (S/4, ECC, B1)
  const isSAPTop = e.includes('sap');
  const isSapOnlyFiscal = /(4tax|guepardo)/i.test(nm);
  if (isSapOnlyFiscal && !isSAPTop) {
    return {
      name: candidate.name,
      rawScore: -Infinity,
      why: ['Excluído: solução fiscal com foco SAP e ERP estimado não é SAP'],
      whyShort: 'excluído',
      pain_points: fiscalPainPoints(candidate, s, erpTop1Name)
    };
  }

  if (isSAPTop && /(thomson|mastersaf|guepardo|sovos|4tax)/i.test(candidate.name)) {
    score += 14; uniqPush(why, 'sinergia e conectores maduros com SAP');
  } else if ((e.includes('totvs') || e.includes('rm') || e.includes('protheus')) && /(synchro|thomson|mastersaf|sovos)/i.test(candidate.name)) {
    score += 12; uniqPush(why, 'sinergia com TOTVS (ecossistema local)');
  } else if ((e.includes('dynamics') || e.includes('netsuite')) && /(avalara|thomson|sovos)/i.test(candidate.name)) {
    score += 10; uniqPush(why, 'integrações fortes com ERPs cloud');
  } else if ((e.includes('omie') || e.includes('tiny') || e.includes('sankhya')) && /(nfe\.io|bpo|planilhas)/i.test(candidate.name)) {
    score += 10; uniqPush(why, 'boa relação custo/benefício para SMB');
  }

  score += keywordHitScore(candidate, rawText, why);

  const emp = s.employeesReported;
  if (emp >= 1500 && candidate.tier === 'enterprise') { score += 8; uniqPush(why, 'porte grande/complexo'); }
  if (emp > 0 && emp < 250 && candidate.tier === 'smb') { score += 6; uniqPush(why, 'adequado a SMB'); }

  if (s.ecom && /avalara|nfe\.io/i.test(candidate.name)) { score += 6; uniqPush(why, 'bom suporte a NF-e/e-commerce'); }

  if (s.setor_regulado && candidate.tier === 'enterprise') {
    score += 5; uniqPush(why, 'aderência a requisitos regulatórios');
  }

  score = Math.max(0, Math.min(100, score));

  const bullets = [];
  if (e) bullets.push(`alinha com ${erpTop1Name.split(' ')[0]}`);
  if (s.ecom && /avalara|nfe\.io/i.test(candidate.name)) bullets.push('NF-e/e-commerce');
  if (emp > 0) bullets.push(`porte ≈ ${emp.toLocaleString('pt-BR')}`);
  const whyShort = sentence(bullets, 3);

  const pain_points = fiscalPainPoints(candidate, s, erpTop1Name);

  return { name: candidate.name, rawScore: score, why: [...why], whyShort, pain_points };
}

/* --------------------------- NORMALIZAÇÃO ------------------------------- */

function normalizeTop3(list) {
  if (!list.length) return [];
  const valid = list.filter(x => Number.isFinite(x.rawScore));
  if (!valid.length) return [];

  const scores = valid.map(x => x.rawScore);
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const spread = Math.max(1, max - min);

  const ranked = valid.sort((a, b) => b.rawScore - a.rawScore).slice(0, 3);

  return ranked.map((x, idx) => {
    const rel = (x.rawScore - min) / spread;
    let pct = Math.round(35 + rel * 55);

    if (idx === 0) pct = Math.max(pct, 80 + Math.round(rel * 10));
    if (idx === 1) pct = Math.min(Math.max(pct, 55), 85);
    if (idx === 2) pct = Math.min(Math.max(pct, 38), 72);

    return { ...x, confidence_pct: pct };
  });
}

/* ---------------------------- API PUBLICA ------------------------------- */

function buildTop3(relatorio) {
  const s = deriveSignals(relatorio);
  const rawText = JSON.stringify(relatorio || {}).toLowerCase();

  const erpRankRaw = ERPS
    .map(c => scoreERP(c, s, rawText))
    .sort((a, b) => b.rawScore - a.rawScore);
  const erp_top3 = normalizeTop3(erpRankRaw);

  const erpTop1Name = erp_top3[0]?.name || '';
  const fiscalRankRaw = FISCALS
    .map(c => scoreFiscal(c, s, erpTop1Name, rawText))
    .sort((a, b) => b.rawScore - a.rawScore);
  const fiscal_top3 = normalizeTop3(fiscalRankRaw);

  const clean = (arr) =>
    arr.map(x => ({
      name: x.name,
      confidence_pct: x.confidence_pct,
      whyShort: x.whyShort,
      why: x.why,
      pain_points: x.pain_points
    }));

  return { erp_top3: clean(erp_top3), fiscal_top3: clean(fiscal_top3) };
}

module.exports = { buildTop3 };
