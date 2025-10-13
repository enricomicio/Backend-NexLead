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

/* =============== Coleta de textos (exclui campos viciados) =============== */
function collectEvidenceSources(rel) {
  const out = [];
  const push = (key, val) => { if (val) out.push({ key, text: String(val) }); };

  // usamos: empresa, setor, dor, compelling, gatilho, site, funcionários, faturamento
  push('nomedaempresa', rel?.nomedaempresa);
  push('segmento', rel?.segmento);
  push('subsegmento', rel?.subsegmento);
  push('principaldordonegocio', rel?.principaldordonegocio);
  push('Compelling', rel?.Compelling);
  push('gatilhocomercial', rel?.gatilhocomercial);
  push('site', rel?.site);
  push('funcionarios', rel?.funcionarios);
  push('faturamento', rel?.faturamento);

  // notícias (título + resumo + data)
  (rel?.ultimas5noticias || []).forEach((n, i) => {
    const data = n?.data || n?.date || '';
    if (typeof n === 'string') {
      out.push({ key: `noticia[${i}] ${data}`, text: n });
    } else {
      if (n?.titulo || n?.title) out.push({ key: `noticia[${i}] ${data}`, text: n.titulo || n.title });
      if (n?.resumo || n?.summary) out.push({ key: `noticia[${i}] ${data}`, text: n.resumo || n.summary });
    }
  });

  // NÃO usamos: erpatualouprovavel, justificativaERP, solucaofiscalouprovavel, criteriofiscal
  return out;
}

function findMatches(rel, keywordList) {
  const hay = collectEvidenceSources(rel);
  const res = [];
  const needles = (keywordList || []).map(k => String(k).toLowerCase());
  hay.forEach(({ key, text }) => {
    const low = text.toLowerCase();
    needles.forEach(n => {
      const idx = low.indexOf(n);
      if (idx >= 0) {
        const start = Math.max(0, idx - 30);
        const end = Math.min(text.length, idx + n.length + 30);
        const snippet = text.substring(start, end).replace(/\s+/g, ' ').trim();
        res.push({ key, needle: n, snippet });
      }
    });
  });
  return res;
}

/* =============== Sinais derivados (sem “hint” de ERP/Fiscal) =============== */
function deriveSignals(rel) {
  const text = JSON.stringify(rel || {}).toLowerCase();
  const seg = ([(rel?.segmento||''), (rel?.subsegmento||'')].join(' ')).toLowerCase();
  const employees = parseEmployees(rel?.funcionarios);
  const revenue = parseMoneyBR(rel?.faturamento);
  const has = (re) => re.test(text) || re.test(seg);

  // Stacks / integrações
  const hasAzure   = has(/azure|microsoft|power\s*bi|office\s*365|dynamics/);
  const hasAws     = has(/\baws\b|amazon web services/);
  const hasGcp     = has(/google cloud|gcp|bigquery|looker/);
  const hasSalesforce = has(/salesforce|crm cloud/);

  // Segmentos/necessidades
  const manuf        = has(/manufatura|ind(ú|u)stria|f(á|a)brica|produção/);
  const serviços     = has(/servi(ç|c)os|bpo|consultoria/);
  const alimentos    = has(/alimentos|food|bebidas|frigor(í|i)fico/);
  const varejo       = has(/varejo|retail|atacado|distribui(ç|c)(ã|a)o/);
  const hasEcom      = has(/e-?commerce|loja\s*virtual|marketplace|magento|vtex|shopify|woocommerce/);
  const hasWmsTms    = has(/\bwms\b|\btms\b|log(í|i)stica|armaz(é|e)m/);

  const multiempresa = has(/holding|consolida(ç|c)(ã|a)o|multi-?empresa|multi-?entidade/);
  const multiMoeda   = has(/multi-?moeda|moedas|c(â|a)mbio|fx|usd|eur/);
  const multiPais    = has(/opera(ç|c)(õ|o)es? internacionais|filiais? no exterior|global|latam|em \b\d+\b pa(í|i)ses/);

  const cloudSaaS    = has(/saas|cloud|nuvem/);
  const onPrem       = has(/on-?prem|data\s*center\s*pr(ó|o)prio|servidores?\s*locais?/);
  const legacy       = has(/legado|sistema\s*pr(ó|o)prio|desenvolvimento\s*pr(ó|o)prio|casa/);

  return {
    text, seg, employees, revenue,
    hasAzure, hasAws, hasGcp, hasSalesforce,
    manuf, serviços, alimentos, varejo, hasEcom, hasWmsTms,
    multiempresa, multiMoeda, multiPais,
    cloudSaaS, onPrem, legacy
  };
}

/* =============== Helpers de razões (explicativas) =============== */
function pickTopReasons(reasons, max = 5) {
  const seen = new Set();
  const out = [];
  for (const r of reasons) {
    const key = r.text; // dedup por texto final para evitar repetição
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
    if (out.length >= max) break;
  }
  return out;
}

function composeWhyShort(reasons) {
  if (!reasons.length) return '';
  const tops = reasons.slice(0, 2).map(r => r.text);
  return tops.join(' • ');
}

/* =============== Score ERP (sem “hint”) =============== */
function scoreERP(c, s, rel) {
  let score = 0;
  const reasons = [];
  const criteria = [];
  const add = (pts, text, crit) => { if (pts>0){ score+=pts; reasons.push({text}); criteria.push(crit);} };

  // 1) Evidência textual pública (notícias/descrições)
  const kwMatches = findMatches(rel, c.keywords || []);
  if (kwMatches.length) {
    const ex = kwMatches[0];
    add(42, `Mencionado em ${ex.key}: “${ex.snippet}”`, 'evidência pública');
  }

  // 2) Porte por funcionários
  const e = s.employees;
  const inRange =
    (c.sizeHint?.minEmp ? e >= c.sizeHint.minEmp : true) &&
    (c.sizeHint?.maxEmp ? e <= c.sizeHint.maxEmp : true);
  if (e > 0 && inRange) add(16, `Porte compatível (~${e.toLocaleString('pt-BR')} funcionários)`, 'porte');
  if (e > 1500 && c.tier === 'enterprise') add(6, 'Tier enterprise combina com porte', 'porte');
  if (e > 0 && e < 300 && c.tier === 'smb') add(6, 'Foco SMB combina com porte', 'porte');

  // 3) Necessidades claras (explicadas)
  if (s.multiempresa && c.tags.includes('multiempresa')) add(8, 'Estrutura de holding/múltiplas entidades citada — requer consolidação robusta', 'multiempresa');
  if (s.multiMoeda   && c.tags.includes('multi-moeda')) add(6, 'Operações em múltiplas moedas mencionadas — exige suporte nativo a FX', 'multi-moeda');
  if (s.multiPais    && c.tags.includes('multi-país'))  add(6, 'Atuação em mais de um país — importante fiscalidade/legislação multi-país', 'multi-país');

  if (s.cloudSaaS && (c.tags.includes('saas') || c.tags.includes('cloud'))) add(6, 'Preferência por SaaS/Cloud aparece no material', 'cloud');
  if (s.onPrem    && c.tags.includes('on-prem')) add(4, 'Cenário on-premises citado — plataforma compatível', 'on-prem');
  if (s.legacy    && c.tags.includes('migração')) add(4, 'Legado/migração mencionados — produto com trilha de migração', 'migração');

  if (s.hasAzure   && c.tags.includes('azure'))     add(6, 'Stack Microsoft/Azure presente — sinergia técnica', 'stack');
  if (s.hasAws     && c.tags.includes('aws'))       add(4, 'Uso/menção de AWS — integração favorável', 'stack');
  if (s.hasGcp     && c.tags.includes('gcp'))       add(3, 'Uso/menção de Google Cloud — integração possível', 'stack');
  if (s.hasSalesforce && c.tags.includes('crm'))    add(3, 'CRM (Salesforce/afins) citado — conectores maduros', 'crm');
  if (s.hasWmsTms  && c.tags.includes('logística')) add(3, 'Indícios de WMS/TMS/logística — ERP forte em cadeia logística', 'logística');

  if (s.manuf      && c.tags.includes('manufatura'))      add(5, 'Atuação industrial — módulos de manufatura aderentes', 'segmento');
  if (s.varejo     && (c.tags.includes('distribuição') || c.tags.includes('varejo'))) add(4, 'Varejo/distribuição — processos de vendas e estoque', 'segmento');
  if (s.alimentos  && c.tags.includes('manufatura'))      add(3, 'Alimentos/bebidas — requisitos de lote/qualidade', 'segmento');
  if (s.serviços   && c.tags.includes('serviços'))        add(3, 'Serviços/BPO — projetos, faturamento e centros de custo', 'segmento');
  if (s.hasEcom    && c.tags.includes('e-commerce'))      add(4, 'E-commerce/marketplace — integrações nativas', 'e-commerce');

  // 4) Limita razões e calcula score
  const top = pickTopReasons(reasons, 5);
  const confidence = clamp(Math.round(score), 15, 95);
  return {
    name: c.name,
    confidence_pct: confidence,
    why: top.map(r => r.text),
    whyShort: composeWhyShort(top),
    criteria: uniq(criteria),
  };
}

/* =============== Score Fiscal (sem “hint”) =============== */
function scoreFiscal(c, s, rel, erpTop1Name='') {
  let score = 0;
  const reasons = [];
  const criteria = [];
  const add = (pts, text, crit) => { if (pts>0){ score+=pts; reasons.push({text}); criteria.push(crit);} };

  // 1) Evidência pública
  const kwMatches = findMatches(rel, c.keywords || []);
  if (kwMatches.length) {
    const ex = kwMatches[0];
    add(30, `Mencionado em ${ex.key}: “${ex.snippet}”`, 'evidência pública');
  }

  // 2) Porte e complexidade fiscal
  const e = s.employees;
  if (e > 1500 && c.tier === 'enterprise') add(10, 'Porte grande — obrigações acessórias complexas', 'porte');
  if (e > 0 && e < 200 && c.tier === 'smb') add(8, 'Porte SMB — solução enxuta compensa', 'porte');

  // 3) Necessidades fiscais claras
  if (s.multiPais && /sovos|thomson|guepardo|4tax/i.test(c.name)) add(8, 'Atuação em vários países — compliance multinacional', 'multi-país');
  if (s.multiMoeda && /sovos|thomson|guepardo/i.test(c.name)) add(6, 'Multi-moeda/FX — apuração e integrações fiscais', 'multi-moeda');
  if (s.hasEcom && /avalara|nfe\.io/i.test(c.name)) add(7, 'E-commerce/NF-e — gateways fiscais prontos', 'e-commerce');
  if (s.manuf && /guepardo|thomson|4tax/i.test(c.name)) add(5, 'Indústria — SPED/Blocos e créditos de ICMS/PIS/COFINS', 'manufatura');

  // 4) Sinergia com stack de TI (não usa “hint” antigo)
  const e1 = (erpTop1Name || '').toLowerCase();
  if (e1.includes('sap') && /(thomson|mastersaf|guepardo|sovos|4tax)/i.test(c.name))
    add(6, 'ERP com perfil enterprise — conectores maduros', 'sinergia');
  if (e1.includes('totvs') && /(4tax|synchro|thomson|mastersaf|sovos)/i.test(c.name))
    add(5, 'Integrações consolidadas no ecossistema TOTVS', 'sinergia');
  if ((e1.includes('dynamics') || e1.includes('netsuite')) && /(avalara|sovos|thomson)/i.test(c.name))
    add(4, 'Ecossistema cloud — API/integrações prontas', 'sinergia');

  const top = pickTopReasons(reasons, 5);
  const confidence = clamp(Math.round(score), 15, 95);
  return {
    name: c.name,
    confidence_pct: confidence,
    why: top.map(r => r.text),
    whyShort: composeWhyShort(top),
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
