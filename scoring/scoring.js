// scoring.js
const ERPS = require('./erp_catalog');
const FISCALS = require('./fiscal_catalog');

// ===== Utilidades simples de parsing =====
const toInt = (s) => {
  const n = parseInt(String(s || '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

const parseEmployees = (raw) => {
  if (!raw) return 0;
  const s = String(raw).toLowerCase();
  // faixa "1.001–5.000"
  const mRange = s.replace(/\s/g,'').match(/(\d[\d\.,]*)\D+(\d[\d\.,]*)/);
  if (mRange) {
    const a = toInt(mRange[1]);
    const b = toInt(mRange[2]);
    return Math.round((a + b) / 2);
  }
  const mOne = s.match(/(\d[\d\.,]*)/);
  return mOne ? toInt(mOne[1]) : 0;
};

const parseMoneyBR = (raw) => {
  if (!raw) return 0;
  let s = String(raw).toLowerCase();
  // multiplicador textual
  const mult = /\bbil(h|i)?(ão|oes|ões)?\b|\bbi\b|\bb\b/.test(s) ? 1e9
             : /\bmilh(ão|oes|ões)\b|\bmi\b|\bmm\b|\bmio\b|\bm\b/.test(s) ? 1e6
             : /\bmil\b/.test(s) ? 1e3 : 1;
  const m = s.match(/(\d{1,3}(?:[.\,]\d{3})+(?:[.,]\d+)?|\d+[.,]\d+|\d+)/);
  if (!m) return 0;
  let t = m[1];
  if (t.includes(',') && t.includes('.')) {
    if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g,'').replace(',', '.');
    else t = t.replace(/,/g,'');
  } else if (t.includes(',')) {
    t = t.replace(/\./g,'').replace(',', '.');
  } else {
    const idx = t.lastIndexOf('.');
    if (idx >= 0) {
      const dec = t.length - idx - 1;
      if (dec > 3) t = t.replace(/\./g,''); // milhar
    }
  }
  const base = parseFloat(t);
  return Number.isFinite(base) ? base * mult : 0;
};

// ===== Extrai "sinais" do relatório =====
function deriveSignals(data) {
  const text = JSON.stringify(data || {}).toLowerCase();
  const seg = ([(data?.segmento||''), (data?.subsegmento||'')].join(' ')).toLowerCase();
  const employees = parseEmployees(data?.funcionarios);
  const revenue = parseMoneyBR(data?.faturamento);

  return {
    text, seg, employees, revenue,
    hasAzure: /azure|microsoft|power\s*bi|office\s*365|dynamics/.test(text),
    hasSap: /\bsap\b|abap|s\/?4hana|sap\s+hana|sap\s+ecc|business\s+one/.test(text),
    hasTotvs: /\btotvs\b|protheus|rm\b|datasul/.test(text),
    hasOracle: /\boracle\b|netsuite/.test(text),
    ecom: /e-?commerce|loja\s*virtual|marketplace/.test(text),
    manuf: /manufatura|ind(ú|u)stria|f(á|a)brica|produção/.test(seg),
    serviços: /servi(ç|c)os|bpo|consultoria/.test(seg),
    alimentos: /alimentos|food|bebidas|frigor(í|i)fico/.test(seg),
    varejo: /varejo|retail|atacado|distribui(ç|c)(ã|a)o/.test(seg),
    multiempresa: /holding|consolida(ç|c)(ã|a)o|multi-?empresa|multi-?entidade/.test(text),
    cloudSaaS: /saas|cloud|nuvem/.test(text),
  };
}

// ===== Score ERP =====
function scoreERP(c, s) {
  let score = 0;
  const why = [];
  const crit = [];

  // 1) palavras-chave explícitas
  if (c.keywords?.some(k => s.text.includes(k))) {
    score += 55; why.push('palavras-chave do fornecedor encontradas'); crit.push('keywords');
  }

  // 2) porte por funcionários
  const emp = s.employees;
  const inRange =
    (c.sizeHint?.minEmp ? emp >= c.sizeHint.minEmp : true) &&
    (c.sizeHint?.maxEmp ? emp <= c.sizeHint.maxEmp : true);
  if (emp > 0 && inRange) { score += 18; why.push('porte compatível'); crit.push('porte'); }
  if (emp > 1500 && c.tier === 'enterprise') { score += 6; crit.push('enterprise'); }
  if (emp > 0 && emp < 300 && c.tier === 'smb') { score += 6; crit.push('smb'); }

  // 3) aderência por segmento/necessidades
  if (s.multiempresa && c.tags.includes('multiempresa')) { score += 7; why.push('multiempresa/multi-entidade'); crit.push('multiempresa'); }
  if (s.cloudSaaS && (c.tags.includes('saas') || c.tags.includes('cloud'))) { score += 5; why.push('preferência por cloud/SaaS'); crit.push('cloud'); }
  if (s.hasAzure && c.tags.includes('azure')) { score += 6; why.push('stack Microsoft/Azure'); crit.push('azure'); }
  if (s.manuf && c.tags.includes('manufatura')) { score += 5; why.push('manufatura'); crit.push('segmento'); }
  if (s.varejo && (c.tags.includes('distribuição') || c.tags.includes('varejo'))) { score += 4; why.push('distribuição/varejo'); crit.push('segmento'); }
  if (s.alimentos && c.tags.includes('manufatura')) { score += 3; crit.push('alimentos'); }
  if (s.serviços && c.tags.includes('serviços')) { score += 4; crit.push('serviços'); }

  // 4) sinergias “óbvias”
  if (s.hasSap && c.name.toLowerCase().includes('sap')) { score += 10; why.push('sinais fortes de SAP'); crit.push('sap'); }
  if (s.hasTotvs && c.name.toLowerCase().includes('totvs')) { score += 10; why.push('sinais fortes de TOTVS'); crit.push('totvs'); }
  if (s.hasOracle && c.name.toLowerCase().includes('netsuite')) { score += 8; why.push('sinais de NetSuite/Oracle'); crit.push('oracle'); }

  const confidence = Math.max(10, Math.min(95, Math.round(score)));
  return { name: c.name, confidence_pct: confidence, why, criteria: crit };
}

// ===== Score Fiscal =====
function scoreFiscal(c, s, erpTop1Name='') {
  let score = 0;
  const why = [];
  const crit = [];

  if (c.keywords?.some(k => s.text.includes(k))) {
    score += 50; why.push('palavras-chave da solução fiscal'); crit.push('keywords');
  }

  const emp = s.employees;
  if (emp > 1500 && c.tier === 'enterprise') { score += 10; why.push('porte grande/complexo'); crit.push('porte'); }
  if (emp > 0 && emp < 200 && c.tier === 'smb') { score += 8; crit.push('smb'); }

  const e = erpTop1Name.toLowerCase();
  if (e.includes('sap')) {
    if (/(thomson|mastersaf|guepardo|sovos|4tax)/i.test(c.name)) { score += 12; why.push('sinergia com SAP'); crit.push('sap'); }
  } else if (e.includes('totvs')) {
    if (/(4tax|synchro|thomson|mastersaf|sovos)/i.test(c.name)) { score += 10; why.push('sinergia com TOTVS'); crit.push('totvs'); }
  } else if (e.includes('dynamics') || e.includes('netsuite')) {
    if (/(avalara|thomson|sovos)/i.test(c.name)) { score += 8; why.push('sinergia com ERP cloud'); crit.push('cloud'); }
  } else if (e.includes('omie') || e.includes('tiny')) {
    if (/(nfe\.io|bpo|planilhas)/i.test(c.name)) { score += 12; why.push('adequado a SMB'); crit.push('smb'); }
  }

  if (s.ecom && /avalara|nfe\.io/i.test(c.name)) { score += 6; why.push('e-commerce/NF-e'); crit.push('ecom'); }

  const confidence = Math.max(10, Math.min(95, Math.round(score)));
  return { name: c.name, confidence_pct: confidence, why, criteria: crit };
}

// ===== API para o index.js =====
function buildTop3(relatorio) {
  const s = deriveSignals(relatorio);
  const erpRank = ERPS.map(c => scoreERP(c, s)).sort((a,b) => b.confidence_pct - a.confidence_pct);
  const erp_top3 = erpRank.slice(0, 3);

  const fiscalRank = FISCALS.map(c => scoreFiscal(c, s, erp_top3[0]?.name || ''))
    .sort((a,b) => b.confidence_pct - a.confidence_pct);
  const fiscal_top3 = fiscalRank.slice(0, 3);

  return { erp_top3, fiscal_top3 };
}

module.exports = { buildTop3 };
