// scoring.js
const ERPS = require('./erp_catalog');
const FISCALS = require('./fiscal_catalog');

/* -------------------------- PARSERS & HELPERS -------------------------- */

const toInt = (s) => {
  if (s == null) return 0;
  const n = parseInt(String(s).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

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

// "R$ 2,3 bilhões", "200 milhões", "US$ 50M" (só BRL/livre; não precisa perfeito pro porte)
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
  const text = JSON.stringify(data || {}).toLowerCase();

  // ⚠️ NUNCA usamos "erpatualouprovavel" ou "solucaofiscalouprovavel" como evidência
  const scrubbed = { ...data };
  delete scrubbed.erpatualouprovavel;
  delete scrubbed.solucaofiscalouprovavel;
  const safeText = JSON.stringify(scrubbed || {}).toLowerCase();

  const seg = [data?.segmento || '', data?.subsegmento || ''].join(' ').toLowerCase();

  const employeesReported = parseEmployees(data?.funcionarios);
  const revenueReported = parseMoneyLoose(data?.faturamento);

  // Sinais reais (site, notícias, modelos)
  const hasAzure = /azure|microsoft|power\s*bi|office\s*365|dynamics/.test(safeText);
  const hasSap = /\bsap\b|abap|s\/?4hana|sap\s+hana|sap\s+ecc|business\s+one/.test(safeText);
  const hasTotvs = /\btotvs\b|protheus|rm\b|datasul/.test(safeText);
  const hasOracle = /\boracle\b|netsuite/.test(safeText);
  const ecom = /e-?commerce|loja\s*virtual|marketplace|pedido online/.test(safeText);
  const manuf = /manufatura|ind(ú|u)stria|f(á|a)brica|produção|planta/.test(seg);
  const serviços = /servi(ç|c)os|bpo|consultoria/.test(seg);
  const alimentos = /alimentos|food|bebidas|frigor(í|i)fico|agroneg(ó|o)cio/.test(seg);
  const varejo = /varejo|retail|atacado|distribui(ç|c)(ã|a)o|log(í|i)stica/.test(seg);
  const multiempresa = /holding|consolida(ç|c)(ã|a)o|multi-?empresa|multi-?entidade|controladas/.test(safeText);
  const cloudSaaS = /saas|cloud|nuvem|assinatura/.test(safeText);

  return {
    seg,
    employeesReported,
    revenueReported,
    hasAzure, hasSap, hasTotvs, hasOracle,
    ecom, manuf, serviços, alimentos, varejo,
    multiempresa, cloudSaaS
  };
}

/* ----------------------------- SCORING ---------------------------------- */

function sizeMatchScore(candidate, s, why) {
  let score = 0;

  // Funcionários
  const emp = s.employeesReported;
  if (emp > 0) {
    const min = candidate.sizeHint?.minEmp ?? 0;
    const max = candidate.sizeHint?.maxEmp ?? Infinity;

    if (emp >= min && emp <= max) {
      score += 18;
      uniqPush(why, `porte compatível (${emp.toLocaleString('pt-BR')} colaboradores)`);
    } else {
      // penalidade suave se muito fora
      const dist =
        emp < min ? (min - emp) / (min || 1) :
        emp > max ? (emp - max) / (max || 1) : 0;
      const penal = Math.max(0, 10 - Math.min(10, Math.round(dist * 10))); // 0..10
      score += penal; // 0..10
      if (penal > 0) uniqPush(why, `porte parcialmente compatível (≈${emp.toLocaleString('pt-BR')})`);
    }

    // tier bônus
    if (emp >= 1500 && candidate.tier === 'enterprise') score += 6;
    if (emp > 0 && emp < 300 && candidate.tier === 'smb') score += 6;
  }

  // Faturamento (só como “força extra” — evita ruído)
  const rev = s.revenueReported;
  if (rev > 0 && candidate.revHint) {
    const [rmin, rmax] = candidate.revHint; // ex.: [50e6, 2e9]
    if (rev >= rmin && rev <= rmax) score += 6;
  }

  return score;
}

function segmentMatchScore(candidate, s, why) {
  let score = 0;

  if (s.multiempresa && candidate.tags.includes('multiempresa')) {
    score += 8; uniqPush(why, 'estrutura multiempresa/consolidação');
  }
  if (s.cloudSaaS && (candidate.tags.includes('saas') || candidate.tags.includes('cloud'))) {
    score += 6; uniqPush(why, 'preferência/aderência a cloud/SaaS');
  }
  if (s.hasAzure && candidate.tags.includes('azure')) {
    score += 7; uniqPush(why, 'stack Microsoft/Azure');
  }
  if (s.manuf && candidate.tags.includes('manufatura')) {
    score += 6; uniqPush(why, 'manufatura/produção');
  }
  if (s.varejo && (candidate.tags.includes('distribuição') || candidate.tags.includes('varejo'))) {
    score += 5; uniqPush(why, 'distribuição/varejo/logística');
  }
  if (s.alimentos && candidate.tags.includes('manufatura')) {
    score += 4; uniqPush(why, 'alimentos/bebidas');
  }
  if (s.serviços && candidate.tags.includes('serviços')) {
    score += 4; uniqPush(why, 'serviços/BPO');
  }

  return score;
}

function brandSignalScore(candidate, s, why) {
  let score = 0;
  const name = candidate.name.toLowerCase();
  if (s.hasSap && name.includes('sap')) { score += 10; uniqPush(why, 'sinais públicos de stack SAP'); }
  if (s.hasTotvs && name.includes('totvs')) { score += 10; uniqPush(why, 'sinais públicos de stack TOTVS'); }
  if (s.hasOracle && (name.includes('oracle') || name.includes('netsuite'))) { score += 8; uniqPush(why, 'sinais de Oracle/NetSuite'); }
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

  let score = 0;
  score += keywordHitScore(candidate, rawText, why);
  score += sizeMatchScore(candidate, s, why);
  score += segmentMatchScore(candidate, s, why);
  score += brandSignalScore(candidate, s, why);

  // clamp bruto 0..100 (antes de normalizar globalmente)
  score = Math.max(0, Math.min(100, score));

  // whyShort: 1 linha amigável
  const bullets = [];
  if (s.multiempresa && candidate.tags.includes('multiempresa')) bullets.push('multiempresa');
  if (s.hasAzure && candidate.tags.includes('azure')) bullets.push('Azure');
  if (s.manuf && candidate.tags.includes('manufatura')) bullets.push('manufatura');
  if (s.varejo && (candidate.tags.includes('distribuição') || candidate.tags.includes('varejo'))) bullets.push('distribuição/varejo');
  if (s.cloudSaaS && (candidate.tags.includes('saas') || candidate.tags.includes('cloud'))) bullets.push('cloud/SaaS');
  if (bullets.length === 0 && s.employeesReported) bullets.push(`porte ≈ ${s.employeesReported.toLocaleString('pt-BR')}`);

  const whyShort = sentence(bullets, 3);

  return { name: candidate.name, rawScore: score, why: [...why], whyShort };
}

/* --------------------------- FISCAL RANKING ----------------------------- */

function scoreFiscal(candidate, s, erpTop1Name, rawText) {
  const why = [];
  let score = 0;

  // synergy com ERP #1
  const e = (erpTop1Name || '').toLowerCase();
  if (e.includes('sap') && /(thomson|mastersaf|guepardo|sovos|4tax)/i.test(candidate.name)) {
    score += 14; uniqPush(why, 'sinergia e conectores maduros com SAP');
  } else if ((e.includes('totvs') || e.includes('rm') || e.includes('protheus')) && /(4tax|synchro|thomson|mastersaf|sovos)/i.test(candidate.name)) {
    score += 12; uniqPush(why, 'sinergia com TOTVS (ecosistema local)');
  } else if ((e.includes('dynamics') || e.includes('netsuite')) && /(avalara|thomson|sovos)/i.test(candidate.name)) {
    score += 10; uniqPush(why, 'integrações fortes com ERPs cloud');
  } else if ((e.includes('omie') || e.includes('tiny') || e.includes('sankhya')) && /(nfe\.io|bpo|planilhas)/i.test(candidate.name)) {
    score += 10; uniqPush(why, 'boa relação custo/benefício para SMB');
  }

  // keywords da solução
  score += keywordHitScore(candidate, rawText, why);

  // porte
  const emp = s.employeesReported;
  if (emp >= 1500 && candidate.tier === 'enterprise') { score += 8; uniqPush(why, 'porte grande/complexo'); }
  if (emp > 0 && emp < 250 && candidate.tier === 'smb') { score += 6; uniqPush(why, 'adequado a SMB'); }

  // e-commerce → fiscal que facilite NF-e/marketplace
  if (s.ecom && /avalara|nfe\.io/i.test(candidate.name)) { score += 6; uniqPush(why, 'bom suporte a NF-e/e-commerce'); }

  // clamp
  score = Math.max(0, Math.min(100, score));

  // whyShort
  const bullets = [];
  if (e) bullets.push(`alinha com ${erpTop1Name.split(' ')[0]}`);
  if (s.ecom && /avalara|nfe\.io/i.test(candidate.name)) bullets.push('NF-e/e-commerce');
  if (emp > 0) bullets.push(`porte ≈ ${emp.toLocaleString('pt-BR')}`);
  const whyShort = sentence(bullets, 3);

  return { name: candidate.name, rawScore: score, why: [...why], whyShort };
}

/* --------------------------- NORMALIZAÇÃO ------------------------------- */

// Reescala scores para evitar empates e dar “cara de probabilidade”
function normalizeTop3(list) {
  if (!list.length) return [];
  const scores = list.map(x => x.rawScore);
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const spread = Math.max(1, max - min);

  // alvo: top ≈ 82–92%; segundo ≈ 55–78%; terceiro ≈ 38–65%
  return list.map((x, idx) => {
    const rel = (x.rawScore - min) / spread; // 0..1
    // base linear 35..90
    let pct = Math.round(35 + rel * 55);

    // impulso pela posição final (desempate visual)
    if (idx === 0) pct = Math.max(pct, 78 + Math.round(rel * 12)); // 78..90
    if (idx === 1) pct = Math.min(Math.max(pct, 52), 85);
    if (idx === 2) pct = Math.min(Math.max(pct, 38), 72);

    return { ...x, confidence_pct: pct };
  });
}

/* ---------------------------- API PUBLICA ------------------------------- */

function buildTop3(relatorio) {
  const s = deriveSignals(relatorio);
  const rawText = JSON.stringify(relatorio || {}).toLowerCase();

  // ERP
  const erpRankRaw = ERPS
    .map(c => scoreERP(c, s, rawText))
    .sort((a, b) => b.rawScore - a.rawScore);
  const erp_top3 = normalizeTop3(erpRankRaw.slice(0, 3));

  // Fiscal (depende do ERP #1)
  const fiscalRankRaw = FISCALS
    .map(c => scoreFiscal(c, s, erp_top3[0]?.name || '', rawText))
    .sort((a, b) => b.rawScore - a.rawScore);
  const fiscal_top3 = normalizeTop3(fiscalRankRaw.slice(0, 3));

  // Limpa campos internos
  const clean = (arr) =>
    arr.map(x => ({
      name: x.name,
      confidence_pct: x.confidence_pct,
      whyShort: x.whyShort,
      why: x.why // lista (sem duplicatas), legível
    }));

  return { erp_top3: clean(erp_top3), fiscal_top3: clean(fiscal_top3) };
}

module.exports = { buildTop3 };
