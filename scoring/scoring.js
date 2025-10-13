// scoring.js
const ERPS = require('./erp_catalog');
const FISCALS = require('./fiscal_catalog');

/* =============== Utils =============== */
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

const toInt = (s) => {
  const n = parseInt(String(s || '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

const parseEmployees = (raw) => {
  if (!raw) return 0;
  const s = String(raw).toLowerCase();
  const mRange = s.replace(/\s/g,'').match(/(\d[\d\.,]*)\D+(\d[\d\.,]*)/);
  if (mRange) {
    const a = toInt(mRange[1]); const b = toInt(mRange[2]);
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

/* =============== Extração de evidências textuais com origem =============== */
function collectTextFields(rel) {
  const out = [];
  const push = (key, val) => { if (val) out.push({ key, text: String(val) }); };

  // campos diretos
  push('nomedaempresa', rel?.nomedaempresa);
  push('segmento', rel?.segmento);
  push('subsegmento', rel?.subsegmento);
  push('funcionarios', rel?.funcionarios);
  push('faturamento', rel?.faturamento);
  push('justificativaERP', rel?.justificativaERP);
  push('criteriofiscal', rel?.criteriofiscal);
  push('erpatualouprovavel', rel?.erpatualouprovavel);
  push('solucaofiscalouprovavel', rel?.solucaofiscalouprovavel);
  push('principaldordonegocio', rel?.principaldordonegocio);
  push('investimentoemti', rel?.investimentoemti);
  // notícias (título + resumo)
  (rel?.ultimas5noticias || []).forEach((n, i) => {
    if (!n) return;
    if (typeof n === 'string') push(`ultimas5noticias[${i}]`, n);
    else {
      push(`ultimas5noticias[${i}].titulo`, n.titulo || n.title);
      push(`ultimas5noticias[${i}].resumo`, n.resumo || n.summary);
    }
  });

  return out;
}

function findMatches(rel, keywordList) {
  const hay = collectTextFields(rel);
  const res = [];
  const needles = keywordList.map(k => String(k).toLowerCase());
  hay.forEach(({ key, text }) => {
    const low = text.toLowerCase();
    needles.forEach(n => {
      const idx = low.indexOf(n);
      if (idx >= 0) {
        // recorte de contexto (±30 chars)
        const start = Math.max(0, idx - 30);
        const end = Math.min(text.length, idx + n.length + 30);
        const snippet = text.substring(start, end).replace(/\s+/g, ' ').trim();
        res.push({ key, needle: n, snippet });
      }
    });
  });
  return res;
}

/* =============== Sinais derivados do relatório =============== */
function deriveSignals(data) {
  const text = JSON.stringify(data || {}).toLowerCase();
  const seg = ([(data?.segmento||''), (data?.subsegmento||'')].join(' ')).toLowerCase();
  const employees = parseEmployees(data?.funcionarios);
  const revenue = parseMoneyBR(data?.faturamento);
  const has = (re) => re.test(text) || re.test(seg);

  // Stacks
  const hasAzure   = has(/azure|microsoft|power\s*bi|office\s*365|dynamics/);
  const hasAws     = has(/\baws\b|amazon web services/);
  const hasGcp     = has(/\bgcp\b|google cloud|bigquery|looker/);

  const hasSap     = has(/\bsap\b|abap|s\/?4hana|sap\s+hana|sap\s+ecc|business\s+one/);
  const hasTotvs   = has(/\btotvs\b|protheus|\brm\b|datasul|advpl/);
  const hasOracle  = has(/\boracle\b|netsuite/);

  const hasSalesforce = has(/salesforce|crm cloud/);
  const hasEcom       = has(/e-?commerce|loja\s*virtual|marketplace|magento|vtex|shopify|woocommerce/);
  const hasWmsTms     = has(/\bwms\b|\btms\b|log(í|i)stica|armaz(é|e)m/);

  // Segmentos/necessidades
  const manuf        = has(/manufatura|ind(ú|u)stria|f(á|a)brica|produção/);
  const serviços     = has(/servi(ç|c)os|bpo|consultoria/);
  const alimentos    = has(/alimentos|food|bebidas|frigor(í|i)fico/);
  const varejo       = has(/varejo|retail|atacado|distribui(ç|c)(ã|a)o/);

  const multiempresa = has(/holding|consolida(ç|c)(ã|a)o|multi-?empresa|multi-?entidade/);
  const multiMoeda   = has(/multi-?moeda|moedas|c(â|a)mbio|fx|usd|eur/);
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

/* =============== Helpers de razões fortes =============== */
function pickTopReasons(reasons, max = 5) {
  // remove duplicadas e mantém prioridade dada pela ordem de push
  const seen = new Set();
  const out = [];
  for (const r of reasons) {
    const key = r.kind + '|' + r.text;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
    if (out.length >= max) break;
  }
  return out;
}

function reasonsToStrings(reasons) {
  return reasons.map(r => r.text);
}

function composeWhyShort(reasons) {
  if (!reasons.length) return '';
  const tops = reasons.slice(0, 2).map(r => r.text);
  return tops.join(' • ');
}

/* =============== ERP Scoring =============== */
function scoreERP(c, s, rel) {
  let score = 0;
  const reasons = [];
  const criteria = [];

  const push = (pts, text, kind) => {
    if (pts <= 0) return;
    score += pts;
    reasons.push({ text, kind });
    criteria.push(kind);
  };

  // Evidência textual com origem
  const kwMatches = findMatches(rel, c.keywords || []);
  if (kwMatches.length) {
    const ex = kwMatches[0];
    push(40, `mencionado em ${ex.key} (“${ex.snippet}”)`, 'evidencia');
  }

  // Se o próprio relatório já “sugeriu” algo coerente
  if (s.hintedERP && c.name.toLowerCase().includes(s.hintedERP.split(' ')[0])) {
    push(18, 'indício direto no relatório', 'hint');
  }

  // Porte por funcionários
  const emp = s.employees;
  const inRange =
    (c.sizeHint?.minEmp ? emp >= c.sizeHint.minEmp : true) &&
    (c.sizeHint?.maxEmp ? emp <= c.sizeHint.maxEmp : true);
  if (emp > 0 && inRange) push(14, `porte compatível (~${emp.toLocaleString('pt-BR')} funcionários)`, 'porte');
  if (emp > 1500 && c.tier === 'enterprise') push(6, 'tier enterprise', 'enterprise');
  if (emp > 0 && emp < 300 && c.tier === 'smb') push(6, 'tier SMB', 'smb');

  // Necessidades/segmentos
  if (s.multiempresa && c.tags.includes('multiempresa')) push(8, 'holding/múltiplas entidades', 'multiempresa');
  if (s.multiMoeda   && c.tags.includes('multi-moeda')) push(6, 'operações multi-moeda', 'moeda');
  if (s.multiPais    && c.tags.includes('multi-país')) push(6, 'operações em vários países', 'pais');

  if (s.cloudSaaS && (c.tags.includes('saas') || c.tags.includes('cloud'))) push(6, 'preferência por cloud/SaaS', 'cloud');
  if (s.onPrem    && c.tags.includes('on-prem')) push(4, 'ambiente on-premises', 'onprem');
  if (s.legacy    && c.tags.includes('migração')) push(4, 'cenário de migração/legado', 'legado');

  if (s.hasAzure   && c.tags.includes('azure'))     push(6, 'stack Microsoft/Azure', 'azure');
  if (s.hasAws     && c.tags.includes('aws'))       push(4, 'integração AWS', 'aws');
  if (s.hasGcp     && c.tags.includes('gcp'))       push(4, 'integração Google Cloud', 'gcp');
  if (s.hasSalesforce && c.tags.includes('crm'))    push(3, 'CRM pré-existente (Salesforce/CRM)', 'crm');
  if (s.hasWmsTms  && c.tags.includes('logística')) push(3, 'integrações WMS/TMS', 'logistica');

  if (s.manuf      && c.tags.includes('manufatura'))      push(5, 'manufatura', 'segmento');
  if (s.varejo     && (c.tags.includes('distribuição') || c.tags.includes('varejo'))) push(4, 'varejo/distribuição', 'segmento');
  if (s.alimentos  && c.tags.includes('manufatura'))      push(3, 'alimentos/bebidas', 'segmento');
  if (s.serviços   && c.tags.includes('serviços'))        push(3, 'serviços/BPO', 'segmento');
  if (s.hasEcom    && c.tags.includes('e-commerce'))      push(4, 'e-commerce/marketplace', 'ecom');

  // Sinergias óbvias
  if (s.hasSap    && c.name.toLowerCase().includes('sap'))      push(10, 'sinais fortes de SAP', 'sap');
  if (s.hasTotvs  && c.name.toLowerCase().includes('totvs'))    push(10, 'sinais fortes de TOTVS', 'totvs');
  if (s.hasOracle && c.name.toLowerCase().includes('netsuite')) push(8,  'sinais de NetSuite/Oracle', 'oracle');

  // Seleciona razões mais fortes (sem repetições)
  const topReasons = pickTopReasons(reasons, 5);
  const confidence = clamp(Math.round(score), 15, 95);

  return {
    name: c.name,
    confidence_pct: confidence,
    why: reasonsToStrings(topReasons),
    whyShort: composeWhyShort(topReasons),
    criteria: uniq(criteria),
  };
}

/* =============== Fiscal Scoring =============== */
function scoreFiscal(c, s, rel, erpTop1Name='') {
  let score = 0;
  const reasons = [];
  const criteria = [];
  const push = (pts, text, kind) => { if (pts>0){ score+=pts; reasons.push({text,kind}); criteria.push(kind);} };

  // Evidência textual com origem
  const kwMatches = findMatches(rel, c.keywords || []);
  if (kwMatches.length) {
    const ex = kwMatches[0];
    push(34, `mencionado em ${ex.key} (“${ex.snippet}”)`, 'evidencia');
  }

  if (s.hintedFiscal && c.name.toLowerCase().includes(s.hintedFiscal.split(' ')[0])) {
    push(18, 'indício direto no relatório', 'hint');
  }

  // Porte
  const emp = s.employees;
  if (emp > 1500 && c.tier === 'enterprise') push(10, 'porte grande/complexo', 'porte');
  if (emp > 0 && emp < 200 && c.tier === 'smb') push(8, 'adequado a SMB', 'smb');

  // Sinergia com ERP top-1
  const e = (erpTop1Name || '').toLowerCase();
  if (e.includes('sap')) {
    if (/(thomson|mastersaf|guepardo|sovos|4tax)/i.test(c.name)) push(12, 'sinergia com SAP', 'sap');
  } else if (e.includes('totvs')) {
    if (/(4tax|synchro|thomson|mastersaf|sovos)/i.test(c.name))  push(10, 'sinergia com TOTVS', 'totvs');
  } else if (e.includes('dynamics') || e.includes('netsuite')) {
    if (/(avalara|thomson|sovos)/i.test(c.name))                 push(8,  'sinergia com ERP cloud', 'cloud');
  } else if (e.includes('omie') || e.includes('tiny')) {
    if (/(nfe\.io|bpo|planilhas)/i.test(c.name))                 push(10, 'stack leve p/ SMB', 'smb');
  }

  // Necessidades específicas
  if (s.hasEcom && /avalara|nfe\.io/i.test(c.name)) push(6, 'e-commerce/NF-e', 'ecom');
  if (s.multiMoeda && /sovos|thomson|guepardo/i.test(c.name)) push(6, 'multi-moeda/compliance', 'moeda');

  const topReasons = pickTopReasons(reasons, 5);
  const confidence = clamp(Math.round(score), 15, 95);

  return {
    name: c.name,
    confidence_pct: confidence,
    why: reasonsToStrings(topReasons),
    whyShort: composeWhyShort(topReasons),
    criteria: uniq(criteria),
  };
}

/* =============== API pública =============== */
function buildTop3(relatorio) {
  const s = deriveSignals(relatorio);

  const erpRank = ERPS
    .map(c => scoreERP(c, s, relatorio))
    .sort((a,b) => b.confidence_pct - a.confidence_pct);
  const erp_top3 = erpRank.slice(0, 3);

  const fiscalRank = FISCALS
    .map(c => scoreFiscal(c, s, relatorio, erp_top3[0]?.name || ''))
    .sort((a,b) => b.confidence_pct - a.confidence_pct);
  const fiscal_top3 = fiscalRank.slice(0, 3);

  return { erp_top3, fiscal_top3 };
}

module.exports = { buildTop3 };
