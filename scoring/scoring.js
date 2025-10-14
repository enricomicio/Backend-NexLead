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

function enrichWhyRicher(why, candidate, s) {
  const bands = [];
  if (s.employeesReported) {
    const f = s.employeesReported;
    const band = f <= 100 ? 'SMB (≤100 FTE)' : f <= 300 ? 'mid (100–300 FTE)' :
                 f <= 800 ? 'upper-mid (300–800 FTE)' : 'enterprise (>800 FTE)';
    bands.push(`porte ${band}`);
  } else {
    bands.push('porte não localizado (inferência por outras variáveis)');
  }
  if (s.revenueReported) {
    const r = s.revenueReported;
    const rb = r < 100e6 ? '< R$100M' : r < 500e6 ? 'R$100–500M' :
               r < 1e9 ? 'R$500M–1B' : '≥ R$1B';
    bands.push(`faixa de receita ${rb}`);
  } else {
    bands.push('faturamento não localizado (proxy por porte/segmento)');
  }
  uniqPush(why, s.multinacional ? 'operação multinacional' : 'operação nacional (sem indício externo)');
  if (s.multiempresa) uniqPush(why, 'consolidação/multiempresa');
  if (s.setor_regulado) uniqPush(why, 'setor regulado');
  if (s.serviços && (candidate.tags||[]).includes('serviços')) bands.push('segmento serviços');
  if (s.manuf && (candidate.tags||[]).includes('manufatura')) bands.push('segmento manufatura');
  if (s.varejo && ((candidate.tags||[]).includes('distribuição')||(candidate.tags||[]).includes('varejo'))) bands.push('distribuição/varejo');
  for (const b of bands) uniqPush(why, b);
  return why;
}
function criteriaPanel(s) {
  const fmt = (n) => n ? n.toLocaleString('pt-BR') : 'não localizado';
  const flags = [];
  flags.push(`Empresa: ${s.multinacional ? 'multinacional' : 'brasileira (sem indício externo)'}`);
  flags.push(`Funcionários: ${s.employeesReported ? fmt(s.employeesReported) : 'não localizado'}`);
  flags.push(`Faturamento: ${s.revenueReported ? `≈ R$ ${fmt(s.revenueReported)}/ano` : 'não localizado'}`);
  flags.push(`Multiempresa: ${s.multiempresa ? 'sim' : 'não observado'}`);
  flags.push(`Setor regulado: ${s.setor_regulado ? 'sim' : 'não'}`);
  return flags;
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
function fiscalVendorSpecificWhy(nm, s, why) {
  if (/mastersaf|onesource|thomson/.test(nm)) {
    uniqPush(why, 'cobertura profunda de SPED/Bloco K e cenários complexos');
    if (s.multinacional || s.multiempresa) uniqPush(why, 'base enterprise e governança');
  } else if (/sovos/.test(nm)) {
    uniqPush(why, 'plataforma cloud com atualização contínua de regras');
    if (s.cloudSaaS || s.hasAzure) uniqPush(why, 'boa aderência a integrações cloud/multi-ERP');
  } else if (/synchro/.test(nm)) {
    uniqPush(why, 'forte presença nacional com TCO competitivo');
  } else if (/avalara/.test(nm)) {
    uniqPush(why, 'integrações rápidas com NF-e/marketplaces (time-to-value)');
    if (s.ecom) uniqPush(why, 'e-commerce em foco');
  } else if (/guepardo/.test(nm)) {
    uniqPush(why, 'acelerações para SAP via NTT DATA');
  } else if (/4tax/.test(nm)) {
    uniqPush(why, 'parceiro Seidor com custo/agilidade mid para SAP');
  } else if (/totvs.*interno/.test(nm)) {
    uniqPush(why, 'característica nativa do ERP TOTVS para fiscal');
  } else if (/add-on.*business one/.test(nm)) {
    uniqPush(why, 'add-on homologado e econômico para SAP Business One');
  }
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
  let why = [];
  const breakdown = { evidence:0, size_fit:0, segment_fit:0, brand_signals:0, family_rules:0, mismatch_penalties:0, cost_penalties:0 };

  const hf = erpHardFilter(candidate, s);
  if (hf.excluded) {
    return { name: candidate.name, rawScore: -Infinity, breakdown, why:[`Excluído: ${hf.reason}`], whyShort:'excluído', pain_points:[], criteria: criteriaPanel(s) };
  }

  let score = 0;

  const ev = evidenceScore(candidate, s, why); score += ev; breakdown.evidence += ev;
  const sz = sizeMatchScore(candidate, s, why); score += sz; breakdown.size_fit += sz;
  const sg = segmentMatchScore(candidate, s, why); score += sg; breakdown.segment_fit += sg;
  const bs = brandSignalScore(candidate, s, why); score += bs; breakdown.brand_signals += bs;

  const cname = (candidate.name || '').toLowerCase();
  if ((/protheus|totvs/.test(cname)) &&
      (s.multinacional || s.setor_regulado || s.employeesReported >= 600 || s.revenueReported >= 800e6) &&
      !hasStrongNewsFor(candidate, s)) {
    score -= 12; breakdown.mismatch_penalties += 12; uniqPush(why, 'sem evidência pública de TOTVS neste porte/segmento');
  }
  if ((/business one|business\s*central|omie|tiny/.test(cname)) &&
      (s.employeesReported >= 300 || s.revenueReported >= 800e6)) {
    score -= 25; breakdown.mismatch_penalties += 25; uniqPush(why, 'mismatch de porte (SMB vs. enterprise)');
  }

  const pref = inferSapCorePreference(s);
  if (pref === 'ecc' && /sap s\/?4hana/i.test(candidate.name)) { score -= 6; breakdown.family_rules += 6; uniqPush(why,'indícios de SAP legado (>10 anos) favorecem ECC'); }
  if (pref === 's4'  && /sap ecc/i.test(candidate.name))       { score -= 6; breakdown.family_rules += 6; uniqPush(why,'indícios de adoção recente favorecem S/4HANA'); }

  score = Math.max(0, Math.min(100, score));
  why = enrichWhyRicher(why, candidate, s);

  const bullets = [];
  if (s.multiempresa && candidate.tags?.includes('multiempresa')) bullets.push('multiempresa');
  if (s.hasAzure && candidate.tags?.includes('azure')) bullets.push('Azure');
  if (s.manuf && candidate.tags?.includes('manufatura')) bullets.push('manufatura');
  if (s.varejo && ((candidate.tags||[]).includes('distribuição')||(candidate.tags||[]).includes('varejo'))) bullets.push('distribuição/varejo');
  if (s.cloudSaaS && ((candidate.tags||[]).includes('saas')||(candidate.tags||[]).includes('cloud'))) bullets.push('cloud/SaaS');
  if (!bullets.length && s.employeesReported) bullets.push(`porte ≈ ${s.employeesReported.toLocaleString('pt-BR')}`);
  const whyShort = sentence(bullets, 3);

  const pain_points = erpPainPoints(candidate, s);
  return { name: candidate.name, rawScore: score, breakdown, why:[...why], whyShort, pain_points, criteria: criteriaPanel(s) };
}

/* --------------------------- FISCAL RANKING ----------------------------- */

function complexityIndex(s) {
  let c = 0;
  if (s.employeesReported >= 800) c += 2;
  if (s.revenueReported >= 500e6) c += 2;
  if (s.multinacional) c += 2;
  if (s.multiempresa) c += 1;
  if (s.setor_regulado) c += 2;
  if (s.cloudSaaS) c += 1;
  return c;
}

function scoreFiscal(candidate, s, erpTop1Name) {
  const why = [];
  const breakdown = { evidence:0, size_fit:0, segment_fit:0, brand_signals:0, synergy:0, family_rules:0, mismatch_penalties:0, cost_penalties:0 };

  let score = 0;

  const e = (erpTop1Name || '').toLowerCase();
  const nm = (candidate.name || '').toLowerCase();
  const isSAPTop = e.includes('sap');
  const usingTOTVS = /totvs|protheus|rm\b/.test(e);
  const isB1Top = /business one/.test(e);

  if (/(4tax|guepardo)/i.test(nm) && !isSAPTop) {
    return { name: candidate.name, rawScore: -Infinity, breakdown, why:['Excluído: solução fiscal focada em SAP e ERP estimado não é SAP'], whyShort:'excluído', pain_points: fiscalPainPoints(candidate, s, erpTop1Name), criteria: criteriaPanel(s) };
  }
  if (/add-on.*business one/i.test(nm) && !isB1Top) {
    return { name: candidate.name, rawScore: -Infinity, breakdown, why:['Excluído: add-on fiscal do SAP Business One só faz sentido com SAP B1'], whyShort:'excluído', pain_points: fiscalPainPoints(candidate, s, erpTop1Name), criteria: criteriaPanel(s) };
  }

  if (usingTOTVS && /totvs.*interno/.test(nm)) { score += 30; breakdown.family_rules += 30; uniqPush(why,'TOTVS geralmente trata fiscal internamente'); }
  else if (usingTOTVS) {
    const evStrong = hasStrongNewsFor({ name: candidate.name, keywords: [candidate.id] }, s);
    if (evStrong) { score += 8; breakdown.synergy += 8; uniqPush(why,'notícia indica solução externa junto ao TOTVS'); }
    else { score -= 10; breakdown.mismatch_penalties += 10; uniqPush(why,'sem indício de fiscal externo — TOTVS tende a usar módulo interno'); }
  }

  if (isB1Top && /add-on.*business one/i.test(nm)) { score += 24; breakdown.family_rules += 24; uniqPush(why,'B1 usa add-ons homologados para fiscal'); }
  if (isSAPTop && /(thomson|mastersaf|sovos|synchro)/i.test(nm)) { score += 14; breakdown.synergy += 14; uniqPush(why,'sinergia e conectores maduros com SAP'); }
  if ((e.includes('dynamics') || e.includes('netsuite')) && /(avalara|sovos|thomson|mastersaf)/i.test(nm)) {
    score += 12; breakdown.synergy += 12; uniqPush(why,'integrações fortes com ERPs cloud');
  }

  const emp = s.employeesReported;
  if (emp >= 1500 && candidate.tier === 'enterprise') { score += 8; breakdown.size_fit += 8; uniqPush(why,'porte grande/complexo'); }
  if (emp > 0 && emp < 250 && candidate.tier === 'smb') { score += 6; breakdown.size_fit += 6; uniqPush(why,'adequado a SMB'); }
  if (s.setor_regulado && candidate.tier === 'enterprise') { score += 5; breakdown.segment_fit += 5; uniqPush(why,'aderência a requisitos regulatórios'); }

  if (s.revenueReported > 0 && s.revenueReported <= 150e6) {
    if (/bpo fiscal/i.test(nm)) { score += 22; breakdown.cost_penalties -= 22; uniqPush(why,'porte/receita baixa: BPO fiscal tem melhor custo-benefício'); }
    if (/(mastersaf|thomson|sovos|synchro)/i.test(nm)) { score -= 12; breakdown.cost_penalties += 12; uniqPush(why,'soluções enterprise tendem a ser caras para ≤ R$150M'); }
  }

  const evPts = (() => {
    let pts = 0;
    if (hasStrongNewsFor(candidate, s)) { pts += 20; uniqPush(why,'notícia de adoção/implantação'); }
    const evid = Math.min(3, countVendorEvidence(candidate, s));
    if (evid > 0) { pts += evid === 1 ? 3 : evid === 2 ? 5 : 7; uniqPush(why, `menções públicas (${evid})`); }
    return pts;
  })();
  score += evPts; breakdown.evidence += evPts;

  fiscalVendorSpecificWhy(nm, s, why);

  const cx = complexityIndex(s);
  if (cx >= 6 && /(thomson|mastersaf)/i.test(nm)) { score += 3; breakdown.segment_fit += 3; }
  if (cx >= 4 && /sovos/i.test(nm)) { score += 2; breakdown.segment_fit += 2; }
  if (cx <= 3 && /synchro/i.test(nm)) { score += 3; breakdown.segment_fit += 3; }
  if (s.ecom && /avalara/i.test(nm)) { score += 3; breakdown.segment_fit += 3; }

  score = Math.max(0, Math.min(100, score));

  const bullets = [];
  if (e) bullets.push(`alinha com ${erpTop1Name.split(' ')[0]}`);
  if (/totvs.*interno/i.test(nm)) bullets.push('tratado no próprio ERP');
  if (/add-on.*business one/i.test(nm)) bullets.push('add-on homologado (B1)');
  if (emp > 0) bullets.push(`porte ≈ ${emp.toLocaleString('pt-BR')}`);
  const whyShort = sentence(bullets, 3);

  const pain_points = fiscalPainPoints(candidate, s, erpTop1Name);
  return { name: candidate.name, rawScore: score, breakdown, why:[...why], whyShort, pain_points, criteria: criteriaPanel(s) };
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

function explainDelta(upper, lower, type /* 'ERP' | 'FISCAL' */) {
  if (!upper || !lower) return '';
  const u = upper.breakdown || {}, l = lower.breakdown || {};
  const deltas = [];

  function add(reason, diff, threshold = 4) {
    if (diff >= threshold) deltas.push({ reason, diff });
  }

  // fatores positivos
  add('mais evidência pública', (u.evidence||0) - (l.evidence||0));
  add('melhor encaixe de porte', (u.size_fit||0) - (l.size_fit||0));
  add('melhor aderência ao segmento', (u.segment_fit||0) - (l.segment_fit||0));
  add('mais sinais de marca/ecossistema', (u.brand_signals||0) - (l.brand_signals||0));
  if (type === 'FISCAL') add('maior sinergia com o ERP líder', (u.synergy||0) - (l.synergy||0));

  // penalidades (quanto MAIS no lower, pior para ele)
  add('maior penalidade de custo/TCO', (l.cost_penalties||0) - (u.cost_penalties||0));
  add('mais incompatibilidades (porte/família)', (l.mismatch_penalties||0) - (u.mismatch_penalties||0));
  add('regra de família desfavorável (ex.: TOTVS/SAP)', (l.family_rules||0) - (u.family_rules||0));

  deltas.sort((a,b)=>b.diff-a.diff);
  const top = deltas.slice(0,2).map(d=>d.reason);

  if (!top.length) {
    // fallback: diferença numérica clara
    const gap = Math.max(0, (upper.rawScore||0) - (lower.rawScore||0));
    if (gap >= 6) return `ficou abaixo por soma de fatores (diferença de score ≈ ${gap}).`;
    return '';
  }
  return `ficou abaixo por ${sentence(top, 2)}.`;
}

function injectWhyNot(list, type /* 'ERP' | 'FISCAL' */) {
  if (!list || list.length < 2) return list;
  // 2º vs 1º
  if (list[1]) {
    const msg = explainDelta(list[0], list[1], type);
    if (msg) list[1].why_not_first = msg;
  }
  // 3º vs 1º e 2º
  if (list[2]) {
    const msg1 = explainDelta(list[0], list[2], type);
    const msg2 = explainDelta(list[1], list[2], type);
    if (msg1) list[2].why_not_first = msg1;
    if (msg2) list[2].why_not_second = msg2;
  }
  return list;
}

/* ---------------------------- API PUBLICA ------------------------------- */

// SAP Core (S/4 + ECC) → manter só 1
function collapseSapCore(scored, s) {
  const isS4  = (x) => x.name.toLowerCase() === 'sap s/4hana';
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
  const erp_top3 = normalizeTop3(erpRankRaw);

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
  const fiscal_top3 = normalizeTop3(fiscalRankRaw);

  // explicar por que 2º/3º não ficaram acima quando as razões parecem parecidas
  injectWhyNot(erp_top3, 'ERP');
  injectWhyNot(fiscal_top3, 'FISCAL');

  const clean = (arr) => arr.map(x => ({
    name: x.name,
    confidence_pct: x.confidence_pct,
    whyShort: x.whyShort,
    why: x.why,
    pain_points: x.pain_points,
    criteria: x.criteria,
    ...(x.why_not_first ? { why_not_first: x.why_not_first } : {}),
    ...(x.why_not_second ? { why_not_second: x.why_not_second } : {})
  }));

  return { erp_top3: clean(erp_top3), fiscal_top3: clean(fiscal_top3) };
}

module.exports = { buildTop3 };
