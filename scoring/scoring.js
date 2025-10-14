// scoring/scoring.js
const ERPS = require('./erp_catalog');
const FISCALS = require('./fiscal_catalog');

/* -------------------------- PARSERS & HELPERS -------------------------- */

// Converte número pt/US com milhar e decimal (robusto p/ “30.000”, “30,000”, “30.000,00”)
function toNumberBR(token) {
  if (!token) return 0;
  let t = String(token).trim();

  // mantém apenas dígitos, . e ,
  t = t.replace(/[^\d.,-]/g, '');

  const hasDot = t.includes('.');
  const hasComma = t.includes(',');

  if (hasDot && hasComma) {
    // padrão BR: . = milhar, , = decimal  -> remove . e troca , por .
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (hasDot) {
    // só ponto: se houver grupo 3-3, é milhar; senão, decimal
    const last = t.lastIndexOf('.');
    const dec = t.length - last - 1;
    if (dec === 3 || dec === 6 || dec === 9) t = t.replace(/\./g, '');
  } else if (hasComma) {
    // só vírgula: se houver grupo 3-3, é milhar; senão, decimal
    const last = t.lastIndexOf(',');
    const dec = t.length - last - 1;
    if (dec === 3 || dec === 6 || dec === 9) t = t.replace(/,/g, '');
    else t = t.replace(',', '.');
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

const toInt = (s) => {
  if (s == null) return 0;
  const n = toNumberBR(String(s));
  return Number.isFinite(n) ? n : 0;
};

// "1.001–5.000", "3.200+", "2.000 a 5.000", "1500-2000", "≈ 800", "1.2k"
function parseEmployees(raw) {
  if (!raw) return 0;
  const s = String(raw).toLowerCase().replace(/\s+/g, ' ').trim();

  // k/mi abreviação (ex.: 1.2k)
  const kMatch = s.match(/(\d+(?:[.,]\d+)?)\s*k\b/);
  if (kMatch) return Math.round(parseFloat(kMatch[1].replace(',', '.')) * 1000);

  // intervalo
  const range = s.match(/(\d[\d.,]*)\s*(?:–|-|a|até)\s*(\d[\d.,]*)/i);
  if (range) {
    const a = toNumberBR(range[1]);
    const b = toNumberBR(range[2]);
    if (a && b) return Math.round((a + b) / 2);
  }

  // número com "+" (ex.: 3200+)
  const plus = s.match(/(\d[\d.,]*)\s*\+/);
  if (plus) return toNumberBR(plus[1]);

  // único número (agora acerta “30.000” → 30000)
  const one = s.match(/(\d{1,3}(?:[.\,]\d{3})+(?:[.,]\d+)?|\d+[.,]\d+|\d+)/);
  return one ? toNumberBR(one[1]) : 0;
}

// "R$ 2,3 bilhões", "200 milhões", "US$ 50M", "30M", "1bi", "30.000.000,00"
function parseMoneyLoose(raw) {
  if (!raw) return 0;
  const s = String(raw).toLowerCase().replace(/\s+/g, ' ');

  // sufixos compactos
  const compact = s.match(/(\d+(?:[.,]\d+)?)\s*(k|m|mi|mm|b|bi|bilh(ão|oes|ões)?)/i);
  if (compact) {
    const base = toNumberBR(compact[1]);
    const unit = compact[2];
    const mult =
      /^k$/i.test(unit) ? 1e3 :
      /^(m|mi|mm)$/i.test(unit) ? 1e6 :
      /^(b|bi|bil)/i.test(unit) ? 1e9 : 1;
    return Math.round(base * mult);
  }

  // multiplicadores textuais em pt
  const mult =
    /\bbilh(ão|oes|ões)\b|bi\b| b\b/.test(s) ? 1e9 :
    /\bmilh(ão|oes|ões)\b|mi\b|mm\b| mio\b| m\b/.test(s) ? 1e6 :
    /\bmil\b/.test(s) ? 1e3 : 1;

  const m = s.match(/(\d{1,3}(?:[.\,]\d{3})+(?:[.,]\d+)?|\d+[.,]\d+|\d+)/);
  if (!m) return 0;
  const base = toNumberBR(m[1]);
  return Math.round(base * mult);
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

  const scrubbed = { ...data };
  delete scrubbed.erpatualouprovavel;
  delete scrubbed.solucaofiscalouprovavel;
  const safeText = JSON.stringify(scrubbed || {}).toLowerCase();

  const seg = [data?.segmento || '', data?.subsegmento || ''].join(' ').toLowerCase();

  const employeesReported = parseEmployees(data?.funcionarios);
  const revenueReported = parseMoneyLoose(data?.faturamento);

  const hasAzure  = /(?:^|[^a-z])azure|microsoft|power\s*bi|office\s*365|dynamics\b/.test(safeText);
  const hasSap    = /\bsap\b|abap|s\/?4hana|sap\s+hana|sap\s+ecc|business\s+one/.test(safeText);
  const hasTotvs  = /\btotvs\b|protheus\b|\brm\b|datasul\b/.test(safeText);
  const hasOracle = /\boracle\b|netsuite\b/.test(safeText);
  const ecom      = /e-?commerce|loja\s*virtual|marketplace|pedido online/.test(safeText);

  // Segmentos
  const manuf = /manufatura|ind(ú|u)stria|f(á|a)brica|produção|planta/.test(seg);
  const serviços = /servi(ç|c)os|bpo|consultoria/.test(seg);
  const alimentos = /alimentos|food|bebidas|frigor(í|i)fico|agroneg(ó|o)cio/.test(seg);
  const varejo = /varejo|retail|atacado|distribui(ç|c)(ã|a)o|log(í|i)stica/.test(seg);
  const financeiro = /(financial|financeiro|banco|segurador|seguros)/.test(seg);
  const saude = /(sa(ú|u)de|healthcare|hospital|farmac(ê|e)utico|farmacia)/.test(seg);
  const energia = /(energia|utilities|el(é|e)trica)/.test(seg);

  const multiempresa = /holding|consolida(ç|c)(ã|a)o|multi-?empresa|multi-?entidade|controladas/.test(safeText);
  const cloudSaaS = /saas|cloud|nuvem|assinatura/.test(safeText);

  const multinacional =
    /global|latam|europe|europa|usa|estados unidos|luxembourg|méxico|argentina|chile|colombia|colômbia|portugal|espanha|spain|france|fran(ç|c)a|germany|alemanha/.test(safeText)
    || /(subsidi(á|a)ria|filial)\s+(no|em)\s+[a-z]/.test(safeText);

  const setor_regulado = !!(financeiro || saude || energia);

  // Lista de notícias para usar como fonte “limpa” de evidência
  const news = Array.isArray(data?.ultimas5noticias) ? data.ultimas5noticias : [];

  return {
    seg, employeesReported, revenueReported,
    hasAzure, hasSap, hasTotvs, hasOracle,
    ecom, manuf, serviços, alimentos, varejo, financeiro,
    multiempresa, cloudSaaS, multinacional, setor_regulado,
    fullText, news
  };
}

/* ---------------------- EVIDENCE & JUSTIFICATIONS ----------------------- */

function countVendorEvidence(candidate, s) {
  // conta menções do fornecedor nas **notícias** (título/resumo/url), que é onde há menos ruído
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

function enrichWhyRicher(why, candidate, s) {
  // adiciona argumentos “reais” além de palavras-chave
  const bands = [];
  if (s.employeesReported) {
    const f = s.employeesReported;
    const band = f <= 100 ? 'SMB (≤100 FTE)' : f <= 300 ? 'mid (100–300 FTE)' :
                 f <= 800 ? 'upper-mid (300–800 FTE)' : 'enterprise (>800 FTE)';
    bands.push(`porte ${band}`);
  }
  if (s.revenueReported) {
    const r = s.revenueReported;
    const rb = r < 100e6 ? '< R$100M' : r < 500e6 ? 'R$100–500M' :
               r < 1e9 ? 'R$500M–1B' : '≥ R$1B';
    bands.push(`faixa de receita ${rb}`);
  }
  if (s.multinacional) bands.push('operação multinacional');
  if (s.multiempresa) bands.push('consolidação/multiempresa');
  if (s.setor_regulado) bands.push('setor regulado');
  if (s.serviços && (candidate.tags||[]).includes('serviços')) bands.push('segmento serviços');
  if (s.manuf && (candidate.tags||[]).includes('manufatura')) bands.push('segmento manufatura');
  if (s.varejo && ((candidate.tags||[]).includes('distribuição')||(candidate.tags||[]).includes('varejo'))) bands.push('segmento distribuição/varejo');

  for (const b of bands) uniqPush(why, b);
  return why;
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
    uniqPush(pains, 'Ecossistema/localização BR menor que SAP em bancos');
    uniqPush(pains, 'Aceleradores de core bancário menos abundantes no BR');
  }
  if (name.includes('dynamics') && s.financeiro) {
    uniqPush(pains, 'Menor presença setorial em bancário no BR');
  }
  if ((name.includes('protheus') || name.includes('totvs')) && s.multinacional) {
    uniqPush(pains, 'Operação multinacional complexa pode exigir engenharia adicional');
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
    uniqPush(pains, 'Implantação/governança mais complexas');
  }
  if (/sovos/.test(nm) && s.financeiro) {
    uniqPush(pains, 'Aceleradores específicos de bancário podem depender do parceiro');
  }
  if (/synchro/.test(nm) && s.multiempresa) {
    uniqPush(pains, 'Escala multiempresa pode exigir maior engenharia');
  }
  if (/avalara/.test(nm)) {
    uniqPush(pains, 'Mais comum em mid/SMB; avaliar escopo enterprise');
  }
  if (/fiscal interno/i.test(candidate.name) && !/totvs/i.test(erpTop1Name)) {
    uniqPush(pains, 'Fiscal interno otimizado para TOTVS; pode não alinhar a outros ERPs');
  }
  return pains;
}

/* ----------------------------- SCORING ---------------------------------- */

// Hard-filters por setor/porte
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
    score += 8; uniqPush(why, 'consolidação/multiempresa');
  }
  if (s.cloudSaaS && (candidate.tags?.includes('saas') || candidate.tags?.includes('cloud'))) {
    score += 6; uniqPush(why, 'cloud/SaaS');
  }
  if (s.hasAzure && candidate.tags?.includes('azure')) {
    score += 7; uniqPush(why, 'stack Microsoft/Azure');
  }
  if (s.manuf && candidate.tags?.includes('manufatura')) {
    score += 6; uniqPush(why, 'manufatura');
  }
  if (s.varejo && (candidate.tags?.includes('distribuição') || candidate.tags?.includes('varejo'))) {
    score += 5; uniqPush(why, 'distribuição/varejo');
  }
  if (s.alimentos && candidate.tags?.includes('manufatura')) {
    score += 4; uniqPush(why, 'alimentos/bebidas');
  }
  if (s.serviços && candidate.tags?.includes('serviços')) {
    score += 4; uniqPush(why, 'serviços');
  }
  if (s.financeiro && candidate.tags?.includes('financials')) {
    score += 8; uniqPush(why, 'financials/setor regulado');
  }
  if (s.setor_regulado && candidate.tags?.includes('enterprise')) {
    score += 5; uniqPush(why, 'compliance/regulação');
  }

  return score;
}

// Evidência controlada (evita falso-positivo de “palavras-chave”)
function keywordHitScore(candidate, s, why) {
  const evidence = Math.min(3, countVendorEvidence(candidate, s)); // 0..3
  if (evidence <= 0) return 0;
  const pts = evidence === 1 ? 4 : evidence === 2 ? 6 : 8; // bem menor que antes
  uniqPush(why, `menções públicas (${evidence}) em notícias/sítios oficiais`);
  return pts;
}

function brandSignalScore(candidate, s, why) {
  let score = 0;
  const name = (candidate.name || '').toLowerCase();

  if (s.hasSap && name.includes('sap')) { score += 6; uniqPush(why, 'sinais gerais de stack SAP'); }
  if (s.hasTotvs && (name.includes('totvs') || name.includes('protheus'))) { score += 5; uniqPush(why, 'sinais gerais de stack TOTVS'); }
  if (s.hasOracle && (name.includes('oracle') || name.includes('netsuite'))) { score += 5; uniqPush(why, 'sinais de Oracle/NetSuite'); }
  return score;
}

/* --------------------------- ERP RANKING -------------------------------- */

function scoreERP(candidate, s, rawText) {
  let why = [];

  const hf = erpHardFilter(candidate, s);
  if (hf.excluded) {
    return { name: candidate.name, rawScore: -Infinity, why: [`Excluído: ${hf.reason}`], whyShort: 'excluído', pain_points: [] };
  }

  let score = 0;
  score += keywordHitScore(candidate, s, why);
  score += sizeMatchScore(candidate, s, why);
  score += segmentMatchScore(candidate, s, why);
  score += brandSignalScore(candidate, s, why);

  // Anti-viés: TOTVS não dispara % alto sem evidência real em enterprise/multinacional/regulado
  const cname = (candidate.name || '').toLowerCase();
  if ((/protheus|totvs/.test(cname)) &&
      (s.multinacional || s.setor_regulado || s.employeesReported >= 600 || s.revenueReported >= 800e6) &&
      countVendorEvidence(candidate, s) === 0) {
    score -= 12; uniqPush(why, 'sem evidência pública de TOTVS neste porte/segmento');
  }

  // Penalidades SMB em enterprise
  if ((/business one|business\s*central|omie|tiny/.test(cname)) &&
      (s.employeesReported >= 300 || s.revenueReported >= 800e6)) {
    score -= 25; uniqPush(why, 'mismatch de porte (SMB vs. enterprise)');
  }

  score = Math.max(0, Math.min(100, score));

  // Porquês mais ricos
  why = enrichWhyRicher(why, candidate, s);

  // whyShort
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

function scoreFiscal(candidate, s, erpTop1Name) {
  const why = [];
  let score = 0;

  const e = (erpTop1Name || '').toLowerCase();
  const nm = (candidate.name || '').toLowerCase();

  // Regras fixas: 4Tax e Guepardo só com SAP
  const isSAPTop = e.includes('sap');
  const isSapOnlyFiscal = /(4tax|guepardo)/i.test(nm);
  if (isSapOnlyFiscal && !isSAPTop) {
    return { name: candidate.name, rawScore: -Infinity, why: ['Excluído: solução fiscal focada em SAP e ERP estimado não é SAP'], whyShort: 'excluído', pain_points: fiscalPainPoints(candidate, s, erpTop1Name) };
  }

  // TOTVS → prioriza Fiscal interno (catálogo tem "totvs_internal"); externos só se houver forte evidência
  const usingTOTVS = /totvs|protheus|rm\b/.test(e);

  if (isSAPTop && /(thomson|mastersaf|guepardo|sovos|4tax)/i.test(candidate.name)) {
    score += 16; uniqPush(why, 'sinergia e conectores maduros com SAP');
  } else if (usingTOTVS && /totvs.*interno/.test(nm)) {
    score += 18; uniqPush(why, 'TOTVS trata o fiscal internamente na maioria dos casos');
  } else if (usingTOTVS && /(synchro|sovos|thomson|mastersaf|avalara)/i.test(nm)) {
    // Externas com TOTVS: só subirem quando houver evidência nas notícias
    const ev = countVendorEvidence({ name: candidate.name, keywords: [candidate.id] }, s);
    if (ev > 0) { score += 10; uniqPush(why, 'indícios públicos de adoção de solução externa'); }
    else { score += 0; uniqPush(why, 'sem indício de solução externa com TOTVS'); }
  } else if ((e.includes('dynamics') || e.includes('netsuite')) && /(avalara|sovos|thomson|mastersaf)/i.test(nm)) {
    score += 12; uniqPush(why, 'integrações fortes com ERPs cloud');
  } else if ((e.includes('omie') || e.includes('tiny') || e.includes('sankhya')) && /(nfe\.io|bpo|planilhas)/i.test(nm)) {
    score += 10; uniqPush(why, 'boa relação custo/benefício para SMB');
  }

  // Porte/Regulação
  const emp = s.employeesReported;
  if (emp >= 1500 && candidate.tier === 'enterprise') { score += 8; uniqPush(why, 'porte grande/complexo'); }
  if (emp > 0 && emp < 250 && candidate.tier === 'smb') { score += 6; uniqPush(why, 'adequado a SMB'); }
  if (s.setor_regulado && candidate.tier === 'enterprise') { score += 5; uniqPush(why, 'aderência a requisitos regulatórios'); }

  score = Math.max(0, Math.min(100, score));

  const bullets = [];
  if (e) bullets.push(`alinha com ${erpTop1Name.split(' ')[0]}`);
  if (/totvs.*interno/i.test(nm)) bullets.push('tratado no próprio ERP');
  if (emp > 0) bullets.push(`porte ≈ ${emp.toLocaleString('pt-BR')}`);
  const whyShort = sentence(bullets, 3);

  const pain_points = fiscalPainPoints(candidate, s, erpTop1Name);

  return { name: candidate.name, rawScore: score, why: [...why], whyShort, pain_points };
}

/* --------------------------- NORMALIZAÇÃO ------------------------------- */

// Probabilidades visuais mais conservadoras para evitar “90% sem evidência”
function normalizeTop3(list) {
  if (!list.length) return [];
  const valid = list.filter(x => Number.isFinite(x.rawScore));
  if (!valid.length) return [];

  const ranked = valid.sort((a, b) => b.rawScore - a.rawScore).slice(0, 3);
  const max = Math.max(...ranked.map(r => r.rawScore));
  const min = Math.min(...ranked.map(r => r.rawScore));
  const spread = Math.max(1, max - min);

  return ranked.map((x, idx) => {
    const rel = (x.rawScore - min) / spread; // 0..1
    // base 40..85 (menos “eufórica”)
    let pct = Math.round(40 + rel * 45);

    if (idx === 0) pct = Math.max(pct, 62 + Math.round(rel * 12)); // ~62..85
    if (idx === 1) pct = Math.min(Math.max(pct, 48), 80);
    if (idx === 2) pct = Math.min(Math.max(pct, 35), 68);

    return { ...x, confidence_pct: pct };
  });
}

/* ---------------------------- API PUBLICA ------------------------------- */

function buildTop3(relatorio) {
  const s = deriveSignals(relatorio);

  // ERP
  const erpRankRaw = ERPS.map(c => scoreERP(c, s, s.fullText)).sort((a,b) => b.rawScore - a.rawScore);
  const erp_top3 = normalizeTop3(erpRankRaw);

  // Fiscal (depende do ERP #1)
  const erpTop1Name = erp_top3[0]?.name || '';
  const fiscalRankRaw = FISCALS.map(c => scoreFiscal(c, s, erpTop1Name)).sort((a,b) => b.rawScore - a.rawScore);
  const fiscal_top3 = normalizeTop3(fiscalRankRaw);

  const clean = (arr) => arr.map(x => ({
    name: x.name,
    confidence_pct: x.confidence_pct,
    whyShort: x.whyShort,
    why: x.why,
    pain_points: x.pain_points
  }));

  return { erp_top3: clean(erp_top3), fiscal_top3: clean(fiscal_top3) };
}

module.exports = { buildTop3 };
