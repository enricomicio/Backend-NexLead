// scoring/scoring.js
const ERPS = require('./erp_catalog');
const FISCALS = require('./fiscal_catalog');

/* -------------------------- PARSERS & HELPERS -------------------------- */

function toNumberBR(token) {
  if (!token) return 0;
  let t = String(token).trim().replace(/[^\d.,-]/g, '');
  const hasDot = t.includes('.'), hasComma = t.includes(',');
  if (hasDot && hasComma) t = t.replace(/\./g, '').replace(',', '.');
  else if (hasDot) { const dec = t.length - t.lastIndexOf('.') - 1; if ([3,6,9].includes(dec)) t = t.replace(/\./g, ''); }
  else if (hasComma) { const dec = t.length - t.lastIndexOf(',') - 1; t = dec === 3 || dec === 6 || dec === 9 ? t.replace(/,/g, '') : t.replace(',', '.'); }
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(n) : 0;
}
const toInt = (s) => (s == null ? 0 : toNumberBR(String(s)));

function parseEmployees(raw) {
  if (!raw) return 0;
  const s = String(raw).toLowerCase().replace(/\s+/g, ' ').trim();
  const kMatch = s.match(/(\d+(?:[.,]\d+)?)\s*k\b/); if (kMatch) return Math.round(parseFloat(kMatch[1].replace(',', '.')) * 1000);
  const range = s.match(/(\d[\d.,]*)\s*(?:–|-|a|até)\s*(\d[\d.,]*)/i);
  if (range) { const a = toNumberBR(range[1]); const b = toNumberBR(range[2]); if (a && b) return Math.round((a + b) / 2); }
  const plus = s.match(/(\d[\d.,]*)\s*\+/); if (plus) return toNumberBR(plus[1]);
  const one = s.match(/(\d{1,3}(?:[.\,]\d{3})+(?:[.,]\d+)?|\d+[.,]\d+|\d+)/);
  return one ? toNumberBR(one[1]) : 0;
}

function parseMoneyLoose(raw) {
  if (!raw) return 0;
  const s = String(raw).toLowerCase().replace(/\s+/g, ' ');
  const compact = s.match(/(\d+(?:[.,]\d+)?)\s*(k|m|mi|mm|b|bi|bil(h|i)?(ão|oes|ões)?)/i);
  if (compact) {
    const base = toNumberBR(compact[1]); const u = compact[2];
    const mult = /^k$/i.test(u) ? 1e3 : /^(m|mi|mm)$/i.test(u) ? 1e6 : 1e9;
    return Math.round(base * mult);
  }
  const mult =
    /\bbilh(ão|oes|ões)\b|bi\b| b\b/.test(s) ? 1e9 :
    /\bmilh(ão|oes|ões)\b|mi\b|mm\b| mio\b| m\b/.test(s) ? 1e6 :
    /\bmil\b/.test(s) ? 1e3 : 1;
  const m = s.match(/(\d{1,3}(?:[.\,]\d{3})+(?:[.,]\d+)?|\d+[.,]\d+|\d+)/);
  if (!m) return 0;
  return Math.round(toNumberBR(m[1]) * mult);
}

function uniqPush(arr, txt) {
  if (!txt) return;
  const t = String(txt).trim();
  if (!t) return;
  if (!arr.some(x => x.toLowerCase() === t.toLowerCase())) arr.push(t);
}
function sentence(list, max = 3) {
  const a = list.slice(0, max);
  if (!a.length) return '';
  if (a.length === 1) return a[0];
  if (a.length === 2) return `${a[0]} e ${a[1]}`;
  return `${a[0]}, ${a[1]} e ${a[2]}`;
}

/* ----------------------------- SIGNALS ---------------------------------- */

function deriveSignals(data) {
  const fullText = JSON.stringify(data || {}).toLowerCase();

  const scrubbed = { ...data };
  delete scrubbed.erpatualouprovavel;
  delete scrubbed.solucaofiscalouprovavel;
  const safeText = JSON.stringify(scrubbed || {}).toLowerCase();

  const seg = [data?.segmento || '', data?.subsegmento || ''].join(' ').toLowerCase();

  const employeesReported = parseEmployees(data?.funcionarios);
  const revenueReported   = parseMoneyLoose(data?.faturamento);

  const hasAzure  = /(?:^|[^a-z])azure|microsoft|power\s*bi|office\s*365|dynamics\b/.test(safeText);
  const hasSap    = /\bsap\b|abap|s\/?4hana|sap\s+hana|sap\s+ecc|business\s+one/.test(safeText);
  const hasTotvs  = /\btotvs\b|protheus\b|\brm\b|datasul\b/.test(safeText);
  const hasOracle = /\boracle\b|netsuite\b/.test(safeText);
  const ecom      = /e-?commerce|loja\s*virtual|marketplace|pedido online/.test(safeText);

  const manuf = /manufatura|ind(ú|u)stria|f(á|a)brica|produção|planta/.test(seg);
  const serviços = /servi(ç|c)os|bpo|consultoria/.test(seg);
  const alimentos = /alimentos|food|bebidas|frigor(í|i)fico|agroneg(ó|o)cio/.test(seg);
  const varejo = /varejo|retail|atacado|distribui(ç|c)(ã|a)o|log(í|i)stica/.test(seg);
  const financeiro = /(financial|financeiro|banco|segurador|seguros)/.test(seg);
  const saude = /(sa(ú|u)de|healthcare|hospital|farmac(ê|e)utico|farmacia)/.test(seg);
  const energia = /(energia|utilities|el(é|e)trica)/.test(seg);

  const multiempresa   = /holding|consolida(ç|c)(ã|a)o|multi-?empresa|multi-?entidade|controladas/.test(safeText);
  const cloudSaaS      = /saas|cloud|nuvem|assinatura/.test(safeText);
  const multinacional  =
    /global|latam|europe|europa|usa|estados unidos|méxico|argentina|chile|colombia|colômbia|portugal|espanha|spain|france|fran(ç|c)a|germany|alemanha/.test(safeText)
    || /(subsidi(á|a)ria|filial)\s+(no|em)\s+[a-z]/.test(safeText);

  const setor_regulado = !!(financeiro || saude || energia);
  const news = Array.isArray(data?.ultimas5noticias) ? data.ultimas5noticias : [];

  return {
    seg, employeesReported, revenueReported,
    hasAzure, hasSap, hasTotvs, hasOracle, ecom,
    manuf, serviços, alimentos, varejo, financeiro, saude,
    multiempresa, cloudSaaS, multinacional, setor_regulado,
    fullText, news
  };
}

/* ---------------------- NEWS / EVIDENCE --------------------------------- */

function countVendorEvidence(candidate, s) {
  const cname = (candidate.name || '').toLowerCase();
  const aliases = (candidate.keywords || []).map(k => String(k).toLowerCase());
  let hits = 0;
  for (const n of s.news) {
    const blob = `${n?.titulo || ''} ${n?.resumo || ''} ${n?.url || ''}`.toLowerCase();
    if (cname && blob.includes(cname)) hits++;
    for (const a of aliases) if (a && blob.includes(a)) { hits++; break; }
  }
  return hits;
}
function hasStrongNewsFor(candidate, s) {
  const verbs = /(adot|contrat|implant|migrou|escolh|optou|assinou|implement|parceria)/i;
  const neg   = /(deixou|abandonou|substitu|migrou\s+de)/i;
  const aliases = [candidate.name, ...(candidate.keywords||[])].map(x => String(x).toLowerCase());
  for (const n of s.news) {
    const blob = `${n?.titulo || ''} ${n?.resumo || ''}`.toLowerCase();
    if (neg.test(blob)) continue;
    if (verbs.test(blob) && aliases.some(a => a && blob.includes(a))) return true;
  }
  return false;
}

/* ----------------- HEURÍSTICAS DE FAMÍLIA (SAP/TOTVS) ------------------- */

function inferSapCorePreference(s) {
  const t = s.fullText || '';
  const oldHints = /(sap erp\b|ecc\b|r\/?3\b|upgrade\s+de\s+ecc|legado\s+sap)/i.test(t);
  const newHints = /(s\/?4hana|rise with sap|public cloud|greenfield|hana\b|migrou\s+para\s+s\/?4|migra(ç|c)[aã]o\s+para\s+s\/?4)/i.test(t);
  if (newHints && !oldHints) return 's4';
  if (oldHints && !newHints) return 'ecc';
  if (/(upgrade|migra(ç|c)[aã]o)\s+.*s\/?4/i.test(t)) return 's4';
  return null;
}
function inferTotvsPreference(s) {
  const t = s.fullText || '';
  const segRM = /(educa(ç|c)ão|sa(ú|u)de|hospital|cl(í|i)nica|rh\b|recursos humanos|folha)/i.test(s.seg);
  const txtRM = /\brm\b|totvs\s*rm/i.test(t);
  if (segRM || txtRM) return 'rm';
  return 'protheus';
}

/* ---------------------- CRITÉRIOS & RESUMOS ----------------------------- */

function criteriaPanel(s) {
  const fmt = (n) => n ? n.toLocaleString('pt-BR') : 'não localizado';
  return {
    empresa: s.multinacional ? 'multinacional' : 'brasileira (sem indício externo)',
    funcionarios: s.employeesReported ? fmt(s.employeesReported) : 'não localizado',
    faturamento: s.revenueReported ? `≈ R$ ${fmt(s.revenueReported)}/ano` : 'não localizado',
    multiempresa: s.multiempresa ? 'sim' : 'não observado',
    setor_regulado: s.setor_regulado ? 'sim' : 'não'
  };
}

function buildWhyFromNumbers(kind, name, s, breakdown, metrics) {
  const arr = [];
  // Evidência
  arr.push(`menções públicas: ${metrics.evidence_hits}${metrics.strong_news ? ' (inclui notícia de adoção)' : ''}`);
  // Porte/receita
  const empTxt = metrics.emp ? `${metrics.emp.toLocaleString('pt-BR')} colaboradores` : 'não localizado';
  const revTxt = metrics.rev_band || 'não localizado';
  arr.push(`porte/fit: +${Math.round(breakdown.size_fit || 0)} (funcionários: ${empTxt}, receita: ${revTxt})`);
  // Segmento
  arr.push(`aderência ao segmento: +${Math.round(breakdown.segment_fit || 0)}`);
  // Ecossistema
  if (breakdown.brand_signals) arr.push(`sinais de ecossistema: +${Math.round(breakdown.brand_signals)}`);
  // Sinergia (Fiscal)
  if (kind === 'FISCAL') arr.push(`sinergia com ERP líder: +${Math.round(breakdown.synergy || 0)}`);
  // Penalidades
  const pen = [];
  if (breakdown.mismatch_penalties) pen.push(`incompatibilidades: −${Math.round(breakdown.mismatch_penalties)}`);
  if (breakdown.cost_penalties) pen.push(`custo/TCO: −${Math.round(breakdown.cost_penalties)}`);
  if (breakdown.family_rules) pen.push(`regras de família: −${Math.round(breakdown.family_rules)}`);
  if (pen.length) arr.push(pen.join(' | '));
  return arr;
}

/* ----------------------------- PAIN POINTS ------------------------------ */

function erpPainPoints(candidate, s) {
  const name = (candidate.name || '').toLowerCase();
  const pains = [];
  if (candidate.tier === 'enterprise') { uniqPush(pains,'TCO/Capex mais elevados'); uniqPush(pains,'Implantação/governança exigentes'); }
  if (candidate.tier === 'smb') { uniqPush(pains,'Limitações para multiempresa/alto volume'); if (s.setor_regulado) uniqPush(pains,'Aderência menor a regulação complexa'); }
  if (name.includes('oracle') && s.financeiro) uniqPush(pains,'Ecossistema BR menor que SAP em bancos');
  if (name.includes('dynamics') && s.financeiro) uniqPush(pains,'Menor presença em bancário no BR');
  if ((name.includes('protheus')||name.includes('totvs')) && s.multinacional) uniqPush(pains,'Operação multinacional pode exigir engenharia adicional');
  if (name.includes('business one')||name.includes('business central')||name.includes('omie')) uniqPush(pains,'Foco SMB — pode não escalar em enterprise');
  return pains;
}
function fiscalPainPoints(candidate, s, erpTop1Name) {
  const pains = [];
  const nm = (candidate.name || '').toLowerCase();
  const erp = (erpTop1Name || '').toLowerCase();
  if (/mastersaf|thomson/.test(nm)) { uniqPush(pains,'Licenciamento/TCO altos'); uniqPush(pains,'Projeto mais complexo'); }
  if (/sovos/.test(nm) && s.financeiro) uniqPush(pains,'Aceleradores de bancário podem depender de parceiro');
  if (/synchro/.test(nm) && s.multiempresa) uniqPush(pains,'Escala multiempresa pode exigir engenharia');
  if (/avalara/.test(nm)) uniqPush(pains,'Mais comum em mid/SMB; validar escopo enterprise');
  if (/fiscal interno/.test(nm) && !/totvs/.test(erp)) uniqPush(pains,'Fiscal interno é otimizado para TOTVS');
  if (/add-on.*business one/.test(nm) && !/business one/.test(erp)) uniqPush(pains,'Add-on é voltado a SAP Business One');
  return pains;
}

/* ----------------------------- SCORING ---------------------------------- */

function erpHardFilter(candidate, s) {
  const name = (candidate.name || '').toLowerCase();
  if (s.financeiro && /business one|business\s*central|omie|tiny/.test(name)) {
    return { excluded: true, reason: 'SMB incompatível com setor financeiro/enterprise' };
  }
  return { excluded: false };
}

function sizeMatchScore(candidate, s, why) {
  let score = 0;
  const emp = s.employeesReported;
  if (emp > 0) {
    const min = candidate.sizeHint?.minEmp ?? 0;
    const max = candidate.sizeHint?.maxEmp ?? Infinity;
    if (emp >= min && emp <= max) { score += 18; uniqPush(why, `porte compatível (${emp.toLocaleString('pt-BR')} colaboradores)`); }
    else {
      const dist = emp < min ? (min - emp) / (min || 1) : emp > max ? (emp - max) / (max || 1) : 0;
      const penal = Math.max(0, 10 - Math.min(10, Math.round(dist * 10)));
      score += penal;
      if (penal > 0) uniqPush(why, `porte parcialmente compatível (≈${emp.toLocaleString('pt-BR')})`);
    }
    if (emp >= 1500 && candidate.tier === 'enterprise') score += 6;
    if (emp > 0 && emp < 300 && candidate.tier === 'smb') score += 6;
  }
  const rev = s.revenueReported;
  if (rev > 0 && candidate.revHint) { const [rmin, rmax] = candidate.revHint; if (rev >= rmin && rev <= rmax) score += 6; }
  if (s.multinacional && (candidate.tags?.includes('global') || candidate.tags?.includes('multiempresa'))) { score += 6; uniqPush(why, 'footprint multinacional'); }
  return score;
}

function segmentMatchScore(candidate, s, why) {
  let score = 0;
  if (s.multiempresa && candidate.tags?.includes('multiempresa')) { score += 8; uniqPush(why,'consolidação/multiempresa'); }
  if (s.cloudSaaS && (candidate.tags?.includes('saas') || candidate.tags?.includes('cloud'))) { score += 6; uniqPush(why,'cloud/SaaS'); }
  if (s.hasAzure && candidate.tags?.includes('azure')) { score += 7; uniqPush(why,'stack Microsoft/Azure'); }
  if (s.manuf && candidate.tags?.includes('manufatura')) { score += 6; uniqPush(why,'manufatura'); }
  if (s.varejo && ((candidate.tags||[]).includes('distribuição')||(candidate.tags||[]).includes('varejo'))) { score += 5; uniqPush(why,'distribuição/varejo'); }
  if (s.alimentos && (candidate.tags||[]).includes('manufatura')) { score += 4; uniqPush(why,'alimentos/bebidas'); }
  if (s.serviços && (candidate.tags||[]).includes('serviços')) { score += 4; uniqPush(why,'serviços'); }
  if (s.financeiro && (candidate.tags||[]).includes('financials')) { score += 8; uniqPush(why,'financials/setor regulado'); }
  if (s.setor_regulado && (candidate.tags||[]).includes('enterprise')) { score += 5; uniqPush(why,'compliance/regulação'); }
  return score;
}

function evidenceScore(candidate, s, why) {
  let pts = 0;
  if (hasStrongNewsFor(candidate, s)) { pts += 24; uniqPush(why, 'evidência forte em notícia de adoção/implantação'); }
  const evid = Math.min(3, countVendorEvidence(candidate, s));
  if (evid > 0) { pts += evid === 1 ? 4 : evid === 2 ? 6 : 8; uniqPush(why, `menções públicas (${evid})`); }
  return pts;
}

function brandSignalScore(candidate, s, why) {
  let score = 0;
  const name = (candidate.name || '').toLowerCase();
  if (s.hasSap && name.includes('sap')) score += 6, uniqPush(why,'sinais gerais de SAP');
  if (s.hasTotvs && (name.includes('totvs') || name.includes('protheus'))) score += 5, uniqPush(why,'sinais gerais de TOTVS');
  if (s.hasOracle && (name.includes('oracle') || name.includes('netsuite'))) score += 5, uniqPush(why,'sinais de Oracle/NetSuite');
  return score;
}

/* --------------------------- ERP RANKING -------------------------------- */

function scoreERP(candidate, s) {
  const why = [];
  const breakdown = { evidence:0, size_fit:0, segment_fit:0, brand_signals:0, family_rules:0, mismatch_penalties:0, cost_penalties:0 };
  const metrics = { evidence_hits: 0, strong_news: false, emp: s.employeesReported || 0, rev_band: s.revenueReported ? (s.revenueReported < 100e6 ? '<R$100M' : s.revenueReported < 500e6 ? 'R$100–500M' : s.revenueReported < 1e9 ? 'R$500M–1B' : '≥R$1B') : null };

  const hf = erpHardFilter(candidate, s);
  if (hf.excluded) {
    return { name: candidate.name, rawScore: -Infinity, breakdown, metrics, why:[`Excluído: ${hf.reason}`], whyShort:'excluído', pain_points:[], criteria: criteriaPanel(s) };
  }

  let score = 0;

  const ev = evidenceScore(candidate, s, why); score += ev; breakdown.evidence += ev;
  metrics.evidence_hits = Math.min(3, countVendorEvidence(candidate, s));
  metrics.strong_news = hasStrongNewsFor(candidate, s);

  const sz = sizeMatchScore(candidate, s, why); score += sz; breakdown.size_fit += sz;
  const sg = segmentMatchScore(candidate, s, why); score += sg; breakdown.segment_fit += sg;
  const bs = brandSignalScore(candidate, s, why); score += bs; breakdown.brand_signals += bs;

  const cname = (candidate.name || '').toLowerCase();
  if ((/protheus|totvs/.test(cname)) &&
      (s.multinacional || s.setor_regulado || s.employeesReported >= 600 || s.revenueReported >= 800e6) &&
      !hasStrongNewsFor(candidate, s)) {
    score -= 12; breakdown.mismatch_penalties += 12;
  }
  if ((/business one|business\s*central|omie|tiny/.test(cname)) &&
      (s.employeesReported >= 300 || s.revenueReported >= 800e6)) {
    score -= 25; breakdown.mismatch_penalties += 25;
  }

  const pref = inferSapCorePreference(s);
  if (pref === 'ecc' && /sap s\/?4hana/i.test(candidate.name)) { score -= 6; breakdown.family_rules += 6; }
  if (pref === 's4'  && /sap ecc/i.test(candidate.name))       { score -= 6; breakdown.family_rules += 6; }

  score = Math.max(0, Math.min(100, score));

  const whyArr = buildWhyFromNumbers('ERP', candidate.name, s, breakdown, metrics);
  const whyShort = sentence([
    metrics.strong_news ? 'notícia de adoção' : (metrics.evidence_hits ? `menções ${metrics.evidence_hits}` : 'sem menções'),
    `fit porte +${Math.round(breakdown.size_fit||0)}`,
    `segmento +${Math.round(breakdown.segment_fit||0)}`
  ], 3);

  const pain_points = erpPainPoints(candidate, s);
  return { name: candidate.name, rawScore: score, breakdown, metrics, why: whyArr, whyShort, pain_points, criteria: criteriaPanel(s) };
}

/* --------------------------- FISCAL RANKING ----------------------------- */

function scoreFiscal(candidate, s, erpTop1Name) {
  const why = [];
  const breakdown = { evidence:0, size_fit:0, segment_fit:0, brand_signals:0, synergy:0, family_rules:0, mismatch_penalties:0, cost_penalties:0 };
  const metrics = { evidence_hits: 0, strong_news: false, emp: s.employeesReported || 0, rev_band: s.revenueReported ? (s.revenueReported < 100e6 ? '<R$100M' : s.revenueReported < 500e6 ? 'R$100–500M' : s.revenueReported < 1e9 ? 'R$500M–1B' : '≥R$1B') : null };

  let score = 0;

  const e = (erpTop1Name || '').toLowerCase();
  const nm = (candidate.name || '').toLowerCase();
  const isSAPTop = e.includes('sap');
  const usingTOTVS = /totvs|protheus|rm\b/.test(e);
  const isB1Top = /business one/.test(e);

  if (/(4tax|guepardo)/i.test(nm) && !isSAPTop) {
    return { name: candidate.name, rawScore: -Infinity, breakdown, metrics, why:['Excluído: solução fiscal focada em SAP e ERP estimado não é SAP'], whyShort:'excluído', pain_points: fiscalPainPoints(candidate, s, erpTop1Name), criteria: criteriaPanel(s) };
  }
  if (/add-on.*business one/i.test(nm) && !isB1Top) {
    return { name: candidate.name, rawScore: -Infinity, breakdown, metrics, why:['Excluído: add-on fiscal do SAP Business One só faz sentido com SAP B1'], whyShort:'excluído', pain_points: fiscalPainPoints(candidate, s, erpTop1Name), criteria: criteriaPanel(s) };
  }

  if (usingTOTVS && /totvs.*interno/.test(nm)) { score += 30; breakdown.family_rules += 30; }
  else if (usingTOTVS) {
    const evStrong = hasStrongNewsFor({ name: candidate.name, keywords: [candidate.id] }, s);
    if (evStrong) { score += 8; breakdown.synergy += 8; }
    else { score -= 10; breakdown.mismatch_penalties += 10; }
  }

  if (isB1Top && /add-on.*business one/i.test(nm)) { score += 24; breakdown.family_rules += 24; }
  if (isSAPTop && /(thomson|mastersaf|sovos|synchro)/i.test(nm)) { score += 14; breakdown.synergy += 14; }
  if ((e.includes('dynamics') || e.includes('netsuite')) && /(avalara|sovos|thomson|mastersaf)/i.test(nm)) {
    score += 12; breakdown.synergy += 12; }
  const emp = s.employeesReported;
  if (emp >= 1500 && candidate.tier === 'enterprise') { score += 8; breakdown.size_fit += 8; }
  if (emp > 0 && emp < 250 && candidate.tier === 'smb') { score += 6; breakdown.size_fit += 6; }
  if (s.setor_regulado && candidate.tier === 'enterprise') { score += 5; breakdown.segment_fit += 5; }

  if (s.revenueReported > 0 && s.revenueReported <= 150e6) {
    if (/bpo fiscal/i.test(nm)) { score += 22; breakdown.cost_penalties -= 22; }
    if (/(mastersaf|thomson|sovos|synchro)/i.test(nm)) { score -= 12; breakdown.cost_penalties += 12; }
  }

  if (hasStrongNewsFor(candidate, s)) { score += 20; breakdown.evidence += 20; }
  metrics.evidence_hits = Math.min(3, countVendorEvidence(candidate, s));
  metrics.strong_news = hasStrongNewsFor(candidate, s);
  if (metrics.evidence_hits > 0) breakdown.evidence += (metrics.evidence_hits === 1 ? 3 : metrics.evidence_hits === 2 ? 5 : 7);

  // vendor-specific flavor (só texto)
  const nmTxt = (candidate.name || '').toLowerCase();
  if (/mastersaf|onesource|thomson/.test(nmTxt)) { uniqPush(why, 'cobertura profunda de SPED/Bloco K e cenários complexos'); }
  if (/sovos/.test(nmTxt)) { uniqPush(why, 'plataforma cloud com atualização contínua de regras'); }
  if (/synchro/.test(nmTxt)) { uniqPush(why, 'forte presença nacional com TCO competitivo'); }
  if (/avalara/.test(nmTxt)) { uniqPush(why, 'integrações rápidas com NF-e/marketplaces (time-to-value)'); }
  if (/guepardo/.test(nmTxt)) { uniqPush(why, 'acelerações para SAP via NTT DATA'); }
  if (/4tax/.test(nmTxt)) { uniqPush(why, 'parceiro Seidor com custo/agilidade mid para SAP'); }

  score = Math.max(0, Math.min(100, score));

  const whyArr = buildWhyFromNumbers('FISCAL', candidate.name, s, breakdown, metrics);
  const whyShort = sentence([
    metrics.strong_news ? 'notícia de adoção' : (metrics.evidence_hits ? `menções ${metrics.evidence_hits}` : 'sem menções'),
    `sinergia +${Math.round(breakdown.synergy||0)}`,
    breakdown.cost_penalties > 0 ? `cuidado TCO −${Math.round(breakdown.cost_penalties)}` : `fit porte +${Math.round(breakdown.size_fit||0)}`
  ], 3);

  const pain_points = fiscalPainPoints(candidate, s, erpTop1Name);
  return { name: candidate.name, rawScore: score, breakdown, metrics, why: [...whyArr, ...why], whyShort, pain_points, criteria: criteriaPanel(s) };
}

/* --------------------------- NORMALIZAÇÃO ------------------------------- */

function normalizeTop3(list) {
  if (!list.length) return [];
  const valid = list.filter(x => Number.isFinite(x.rawScore));
  if (!valid.length) return [];
  const ranked = valid.sort((a,b) => b.rawScore - a.rawScore).slice(0,3);
  const max = Math.max(...ranked.map(r => r.rawScore));
  const min = Math.min(...ranked.map(r => r.rawScore));
  const spread = Math.max(1, max - min);
  return ranked.map((x, idx) => {
    const rel = (x.rawScore - min) / spread;
    let pct = Math.round(40 + rel * 45);
    if (idx === 0) pct = Math.max(pct, 62 + Math.round(rel * 12));
    if (idx === 1) pct = Math.min(Math.max(pct, 48), 80);
    if (idx === 2) pct = Math.min(Math.max(pct, 35), 68);
    return { ...x, confidence_pct: pct };
  });
}

/* --------------------------- COMPARADORES -------------------------------- */

function factorDeltas(upper, lower, type) {
  const u = upper.breakdown || {}, l = lower.breakdown || {};
  return {
    evidence: Math.round((u.evidence||0)-(l.evidence||0)),
    size_fit: Math.round((u.size_fit||0)-(l.size_fit||0)),
    segment_fit: Math.round((u.segment_fit||0)-(l.segment_fit||0)),
    brand_signals: Math.round((u.brand_signals||0)-(l.brand_signals||0)),
    ...(type==='FISCAL' ? { synergy: Math.round((u.synergy||0)-(l.synergy||0)) } : {}),
    cost_penalties: Math.round((l.cost_penalties||0)-(u.cost_penalties||0)),
    mismatch_penalties: Math.round((l.mismatch_penalties||0)-(u.mismatch_penalties||0)),
    family_rules: Math.round((l.family_rules||0)-(u.family_rules||0)),
  };
}

function explainDelta(upper, lower, type) {
  const gap = Math.max(0, Math.round((upper.rawScore||0)-(lower.rawScore||0)));
  const leader = Math.round(upper.rawScore||0), challenger = Math.round(lower.rawScore||0);
  const d = factorDeltas(upper, lower, type);

  // pegue os 2-3 maiores absolutos
  const entries = Object.entries(d).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).filter(([,v])=>Math.abs(v)>=3).slice(0,3);
  const parts = entries.map(([k,v])=>{
    const labels = {
      evidence:'evidência pública', size_fit:'fit de porte', segment_fit:'aderência ao segmento',
      brand_signals:'sinais de ecossistema', synergy:'sinergia com ERP líder',
      cost_penalties:'penalidade de custo/TCO', mismatch_penalties:'incompatibilidades', family_rules:'regras de família'
    };
    const sign = v>0?'+':'−';
    return `${labels[k]} (${sign}${Math.abs(v)} p.p. pró líder)`;
  });
  const text = `líder ${leader} vs ${challenger} (dif. ${gap}). Principais diferenças: ${parts.length?sentence(parts,3):'combinação de pequenos fatores'}.`;
  return { text, deltas: d };
}

function injectWhyNot(list, type) {
  if (!list || list.length < 2) return list;
  if (list[1]) {
    const ex = explainDelta(list[0], list[1], type);
    list[1].why_not_first = ex.text;
    list[1].delta_breakdown_vs_first = ex.deltas;
  }
  if (list[2]) {
    const ex1 = explainDelta(list[0], list[2], type);
    const ex2 = explainDelta(list[1], list[2], type);
    list[2].why_not_first = ex1.text;
    list[2].why_not_second = ex2.text;
    list[2].delta_breakdown_vs_first = ex1.deltas;
    list[2].delta_breakdown_vs_second = ex2.deltas;
  }
  return list;
}

/* ---------------------------- API PUBLICA ------------------------------- */

// SAP Core (S/4 + ECC) → manter só 1
function collapseSapCore(scored, s) {
  const isS4  = (x) => x.name.toLowerCase() === 'sap s/4h ana' || x.name.toLowerCase() === 'sap s/4hana';
  const isECC = (x) => x.name.toLowerCase() === 'sap ecc';
  const s4  = scored.find(isS4);
  const ecc = scored.find(isECC);
  if (!s4 || !ecc) return scored;
  const pref = inferSapCorePreference(s);
  const keep = pref ? pref : (s4.rawScore >= ecc.rawScore ? 's4' : 'ecc');
  return scored.filter(x => keep === 's4' ? !isECC(x) : !isS4(x));
}

// TOTVS (Protheus x RM) → manter só 1
function collapseTotvsFamily(scored, s) {
  const isPro = (x) => x.name.toLowerCase() === 'totvs protheus';
  const isRM  = (x) => x.name.toLowerCase() === 'totvs rm';
  const pro = scored.find(isPro);
  const rm  = scored.find(isRM);
  if (!pro || !rm) return scored;
  const keep = inferTotvsPreference(s) === 'rm' ? 'rm' : 'protheus';
  return scored.filter(x => keep === 'rm' ? !isPro(x) : !isRM(x));
}

function buildTop3(relatorio) {
  const s = deriveSignals(relatorio);

  // ERP: score → colapsa SAP Core e TOTVS family → rank
  let erpRankRaw = ERPS.map(c => scoreERP(c, s));
  erpRankRaw = collapseSapCore(erpRankRaw, s);
  erpRankRaw = collapseTotvsFamily(erpRankRaw, s);
  erpRankRaw.sort((a,b) => b.rawScore - a.rawScore);
  let erp_top3 = normalizeTop3(erpRankRaw);
  erp_top3 = injectWhyNot(erp_top3, 'ERP');

  // Fiscal: injeta candidato "TOTVS – Fiscal interno" quando ERP #1 for TOTVS
  const erpTop1Name = erp_top3[0]?.name || '';
  let fiscals = [...FISCALS];
  if (/^totvs\b|protheus|rm\b/i.test(erpTop1Name)) {
    fiscals = [
      { id:'totvs_interno', name:'TOTVS – Fiscal interno', tier:'mid',
        tags:['totvs','interno','brasil','sped'],
        keywords:['totvs fiscal','protheus fiscal','rm fiscal'] },
      ...fiscals
    ];
  }
  if (/business one/i.test(erpTop1Name)) {
    fiscals = [
      { id:'b1_addon', name:'Add-on fiscal (SAP Business One)', tier:'smb',
        tags:['sap','b1','addon','nf-e','brasil'],
        keywords:['addon fiscal b1','sap business one fiscal'] },
      ...fiscals
    ];
  }

  const fiscalRankRaw = fiscals.map(c => scoreFiscal(c, s, erpTop1Name)).sort((a,b) => b.rawScore - a.rawScore);
  let fiscal_top3 = normalizeTop3(fiscalRankRaw);
  fiscal_top3 = injectWhyNot(fiscal_top3, 'FISCAL');

  const clean = (arr) => arr.map(x => ({
    name: x.name,
    confidence_pct: x.confidence_pct,
    whyShort: x.whyShort,
    why: x.why,                           // bullets numéricos e específicos
    pain_points: x.pain_points,
    criteria: x.criteria,                 // painel (empresa/func/faturamento/etc.)
    ...(x.why_not_first ? { why_not_first: x.why_not_first } : {}),
    ...(x.why_not_second ? { why_not_second: x.why_not_second } : {}),
    ...(x.delta_breakdown_vs_first ? { delta_breakdown_vs_first: x.delta_breakdown_vs_first } : {}),
    ...(x.delta_breakdown_vs_second ? { delta_breakdown_vs_second: x.delta_breakdown_vs_second } : {}),
  }));

  return { erp_top3: clean(erp_top3), fiscal_top3: clean(fiscal_top3) };
}

module.exports = { buildTop3 };
