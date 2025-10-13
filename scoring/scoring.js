// scoring.js
const ERPS = require('./erp_catalog');
const FISCALS = require('./fiscal_catalog');

/* ================= Utils ================= */
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

const addReason = (whyArr, critArr, whyTxt, critKey, inc, scoreObj) => {
  if (inc > 0) {
    whyArr.push(whyTxt);
    critArr.push(critKey);
    scoreObj.value += inc;
  }
};

/* ================= Signals ================= */
function deriveSignals(data) {
  const text = JSON.stringify(data || {}).toLowerCase();
  const seg = ([(data?.segmento||''), (data?.subsegmento||'')].join(' ')).toLowerCase();
  const employees = parseEmployees(data?.funcionarios);
  const revenue = parseMoneyBR(data?.faturamento);

  const has = (re) => re.test(text) || re.test(seg);

  // Padrões de stack/mercado
  const hasAzure   = has(/azure|microsoft|power\s*bi|office\s*365|dynamics/);
  const hasAws     = has(/\baws\b|amazon web services/);
  const hasGcp     = has(/\bgcp\b|google cloud|bigquery|looker/);

  const hasSap     = has(/\bsap\b|abap|s\/?4hana|sap\s+hana|sap\s+ecc|business\s+one/);
  const hasTotvs   = has(/\btotvs\b|protheus|\brm\b|datasul|advpl/);
  const hasOracle  = has(/\boracle\b|netsuite/);

  const hasSalesforce = has(/salesforce|crm cloud/);
  const hasEcom       = has(/e-?commerce|loja\s*virtual|marketplace|magento|vtex|shopify|woocommerce/);
  const hasWmsTms     = has(/\bwms\b|\btms\b|log(í|i)stica|armaz(é|e)m/);

  const manuf        = has(/manufatura|ind(ú|u)stria|f(á|a)brica|produção/);
  const serviços     = has(/servi(ç|c)os|bpo|consultoria/);
  const alimentos    = has(/alimentos|food|bebidas|frigor(í|i)fico/);
  const varejo       = has(/varejo|retail|atacado|distribui(ç|c)(ã|a)o/);

  // Complexidades organizacionais
  const multiempresa = has(/holding|consolida(ç|c)(ã|a)o|multi-?empresa|multi-?entidade/);
  const multiMoeda   = has(/multi-?moeda|moedas|cambio|fx|usd|eur/);
  const multiPais    = has(/opera(ç|c)(õ|o)es? internacionais|filiais? no exterior|global|latam|em \b\d+\b pa(í|i)ses/);

  const cloudSaaS    = has(/saas|cloud|nuvem/);
  const onPrem       = has(/on-?prem|data\s*center\s*pr(ó|o)prio|servidores?\s*locais?/);
  const legacy       = has(/legado|sistema\s*pr(ó|o)prio|desenvolvimento\s*pr(ó|o)prio|casa/);

  const hintedERP    = String(data?.erpatualouprovavel || '').toLowerCase();
  const hintedFiscal = String(data?.solucaofiscalouprovavel || '').toLowerCase();

  return {
    text, seg, employees, revenue,
    hasAzure, hasAws, hasGcp,
    hasSap, hasTotvs, hasOracle,
    hasSalesforce, hasEcom, hasWmsTms,
    manuf, serviços, alimentos, varejo,
    multiempresa, multiMoeda, multiPais,
    cloudSaaS, onPrem, legacy,
    hintedERP, hintedFiscal
  };
}

/* ================= ERP Scoring ================= */
function scoreERP(c, s) {
  const why = [];
  const crit = [];
  const score = { value: 0 };

  // 0) Indício direto do relatório
  if (s.hintedERP && c.name.toLowerCase().includes(s.hintedERP.split(' ')[0])) {
    addReason(why, crit, 'indício direto no relatório', 'hint', 22, score);
  }

  // 1) palavras-chave explícitas do fornecedor
  if (c.keywords?.some(k => s.text.includes(k))) {
    addReason(why, crit, 'palavras-chave do fornecedor', 'keywords', 38, score);
  }

  // 2) porte por funcionários (faixa do catálogo)
  const emp = s.employees;
  const inRange =
    (c.sizeHint?.minEmp ? emp >= c.sizeHint.minEmp : true) &&
    (c.sizeHint?.maxEmp ? emp <= c.sizeHint.maxEmp : true);
  if (emp > 0 && inRange) addReason(why, crit, 'porte compatível', 'porte', 16, score);
  if (emp > 1500 && c.tier === 'enterprise') addReason(why, crit, 'tier enterprise', 'enterprise', 6, score);
  if (emp > 0 && emp < 300 && c.tier === 'smb') addReason(why, crit, 'tier SMB', 'smb', 6, score);

  // 3) aderências por segmento/necessidades
  if (s.multiempresa && c.tags.includes('multiempresa')) addReason(why, crit, 'multiempresa/múltiplas entidades', 'multiempresa', 7, score);
  if (s.multiMoeda   && c.tags.includes('multi-moeda'))   addReason(why, crit, 'operações multi-moeda', 'moeda', 5, score);
  if (s.multiPais    && c.tags.includes('multi-país'))     addReason(why, crit, 'operações em vários países', 'país', 5, score);

  if (s.cloudSaaS && (c.tags.includes('saas') || c.tags.includes('cloud'))) addReason(why, crit, 'preferência por cloud/SaaS', 'cloud', 6, score);
  if (s.onPrem    && c.tags.includes('on-prem')) addReason(why, crit, 'ambiente on-premises', 'onprem', 4, score);
  if (s.legacy    && c.tags.includes('migração')) addReason(why, crit, 'cenário de legado/migração', 'legado', 4, score);

  if (s.hasAzure   && c.tags.includes('azure'))     addReason(why, crit, 'stack Microsoft/Azure', 'azure', 6, score);
  if (s.hasAws     && c.tags.includes('aws'))       addReason(why, crit, 'presença em AWS', 'aws', 4, score);
  if (s.hasGcp     && c.tags.includes('gcp'))       addReason(why, crit, 'integrações Google Cloud', 'gcp', 4, score);
  if (s.hasSalesforce && c.tags.includes('crm'))    addReason(why, crit, 'CRM Salesforce/Dynamics', 'crm', 3, score);
  if (s.hasWmsTms  && c.tags.includes('logística')) addReason(why, crit, 'integrações WMS/TMS', 'logistica', 3, score);

  if (s.manuf      && c.tags.includes('manufatura'))      addReason(why, crit, 'manufatura', 'segmento', 5, score);
  if (s.varejo     && (c.tags.includes('distribuição') || c.tags.includes('varejo'))) addReason(why, crit, 'varejo/distribuição', 'segmento', 4, score);
  if (s.alimentos  && c.tags.includes('manufatura'))      addReason(why, crit, 'alimentos/bebidas', 'segmento', 3, score);
  if (s.serviços   && c.tags.includes('serviços'))        addReason(why, crit, 'serviços/BPO', 'segmento', 3, score);
  if (s.hasEcom    && c.tags.includes('e-commerce'))      addReason(why, crit, 'e-commerce/marketplace', 'ecom', 4, score);

  // 4) sinergias “óbvias”
  if (s.hasSap    && c.name.toLowerCase().includes('sap'))      addReason(why, crit, 'sinais fortes de SAP', 'sap', 10, score);
  if (s.hasTotvs  && c.name.toLowerCase().includes('totvs'))    addReason(why, crit, 'sinais fortes de TOTVS', 'totvs', 10, score);
  if (s.hasOracle && c.name.toLowerCase().includes('netsuite')) addReason(why, crit, 'sinais de NetSuite/Oracle', 'oracle', 8, score);

  // bound e arredondamento do score
  const confidence = Math.max(10, Math.min(95, Math.round(score.value)));
  return { name: c.name, confidence_pct: confidence, why, criteria: crit };
}

/* ================= Fiscal Scoring ================= */
function scoreFiscal(c, s, erpTop1Name='') {
  const why = [];
  const crit = [];
  const score = { value: 0 };

  // 0) Indício direto do relatório
  if (s.hintedFiscal && c.name.toLowerCase().includes(s.hintedFiscal.split(' ')[0])) {
    addReason(why, crit, 'indício direto no relatório', 'hint', 22, score);
  }

  // 1) palavras-chave explícitas
  if (c.keywords?.some(k => s.text.includes(k))) {
    addReason(why, crit, 'palavras-chave da solução fiscal', 'keywords', 36, score);
  }

  // 2) porte
  const emp = s.employees;
  if (emp > 1500 && c.tier === 'enterprise') addReason(why, crit, 'porte grande/complexo', 'porte', 10, score);
  if (emp > 0 && emp < 200 && c.tier === 'smb') addReason(why, crit, 'adequado a SMB', 'smb', 8, score);

  // 3) sinergia com o ERP Top 1
  const e = (erpTop1Name || '').toLowerCase();
  if (e.includes('sap')) {
    if (/(thomson|mastersaf|guepardo|sovos|4tax)/i.test(c.name)) addReason(why, crit, 'sinergia com SAP', 'sap', 12, score);
  } else if (e.includes('totvs')) {
    if (/(4tax|synchro|thomson|mastersaf|sovos)/i.test(c.name)) addReason(why, crit, 'sinergia com TOTVS', 'totvs', 10, score);
  } else if (e.includes('dynamics') || e.includes('netsuite')) {
    if (/(avalara|thomson|sovos)/i.test(c.name)) addReason(why, crit, 'sinergia com ERP cloud', 'cloud', 8, score);
  } else if (e.includes('omie') || e.includes('tiny')) {
    if (/(nfe\.io|bpo|planilhas)/i.test(c.name)) addReason(why, crit, 'stack leve p/ SMB', 'smb', 10, score);
  }

  // 4) necessidades específicas
  if (s.hasEcom && /avalara|nfe\.io/i.test(c.name)) addReason(why, crit, 'e-commerce/NF-e', 'ecom', 6, score);
  if (s.multiMoeda && /sovos|thomson|guepardo/i.test(c.name)) addReason(why, crit, 'multi-moeda/compliance', 'moeda', 5, score);

  const confidence = Math.max(10, Math.min(95, Math.round(score.value)));
  return { name: c.name, confidence_pct: confidence, why, criteria: crit };
}

/* ================= Public API ================= */
function buildTop3(relatorio) {
  const s = deriveSignals(relatorio);

  const erpRank = ERPS
    .map(c => scoreERP(c, s))
    .sort((a,b) => b.confidence_pct - a.confidence_pct);
  const erp_top3 = erpRank.slice(0, 3);

  const fiscalRank = FISCALS
    .map(c => scoreFiscal(c, s, erp_top3[0]?.name || ''))
    .sort((a,b) => b.confidence_pct - a.confidence_pct);
  const fiscal_top3 = fiscalRank.slice(0, 3);

  return { erp_top3, fiscal_top3 };
}

module.exports = { buildTop3 };
