// backend/index.js
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const { buildTop3 } = require("./scoring/scoring");
// >>> DOR DO SEGMENTO (offline)
const { resolveSegmentPain } = require("./segments/resolve_segment_pain");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL   = process.env.OPENAI_MODEL || "gpt-4o";
const USE_WEB = (process.env.SEARCH_MODE || "web").toLowerCase() === "web";

// ===== Helpers de log =====
const LOG_LIMIT = 12000;
const printRaw = (label, s) => {
  const txt = String(s || "");
  console.log(`----- ${label} (len=${txt.length}) BEGIN -----`);
  console.log(txt.slice(0, LOG_LIMIT));
  if (txt.length > LOG_LIMIT) console.log(`... [truncado ${txt.length - LOG_LIMIT} chars]`);
  console.log(`----- ${label} END -----`);
};

function printToolsDetected(resp) {
  try {
    const outs = resp?.output || [];
    const tools = [];
    for (const item of outs) {
      if (item?.type && item.type.endsWith("_call")) {
        tools.push({ type: item.type, name: item.action?.type || "unknown" });
      }
    }
    const toolChoice = resp?.tool_choice ?? "auto";
    console.log("[/generate] tools detected:", JSON.stringify(tools.length ? tools : "none"));
    console.log("[/generate] tool_choice:", JSON.stringify(toolChoice));
  } catch (e) {
    console.log("[tools-detected] erro ao inspecionar tools");
  }
}

// ===== Parser robusto p/ JSON “sujinho” =====
const stripFences = s => String(s).replace(/^\s*```json\s*|\s*```\s*$/gi, "").trim();
const normalizeQuotes = s => String(s).replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
const tryParse = s => { try { return JSON.parse(s); } catch { return null; } };

const extractFirstJsonObject = (s) => {
  if (!s) return null;
  const text = String(s);
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
  }
  return null;
};

function sanitizeAndParse(raw) {
  let cleaned = normalizeQuotes(stripFences(raw || ""));
  let jsonStr = extractFirstJsonObject(cleaned) || cleaned;
  let obj = tryParse(jsonStr);
  if (!obj) {
    const repaired = jsonStr.replace(/,\s*([}\]])/g, "$1");
    obj = tryParse(repaired);
  }
  return obj;
}

// ===== Chamada OpenAI com fallback se max_tool_calls não for suportado =====
async function callOAIWithMaxToolCalls(oaiReq, maxToolCalls) {
  const req = { ...oaiReq };
  if (typeof maxToolCalls === "number") req.max_tool_calls = maxToolCalls;

  try {
    return await openai.responses.create(req);
  } catch (err) {
    const msg = err?.message || "";
    if (msg.includes("Unknown parameter") && msg.includes("max_tool_calls")) {
      console.warn("[OpenAI] 'max_tool_calls' não suportado — repetindo sem esse parâmetro.");
      delete req.max_tool_calls;
      return await openai.responses.create(req);
    }
    throw err;
  }
}

/* =======================================================================
   >>> ENRIQUECIMENTO SÓ COM web_search (sem LinkedIn) — ORGANOGRAMA/POWERMAP <<<
   ======================================================================= */
function domainFromSite(site = "") {
  const host = String(site || "").toLowerCase().replace(/^https?:\/\//,'').split('/')[0] || "";
  if (!host) return "";
  return host.replace(/^www\./,'');
}

const ALLOWED_HINTS = [
  "liderança","leadership","executivos","management","governança","governanca",
  "diretoria","conselho","quem somos","sobre","investor relations","sala de imprensa",
  "press","notícias","news","release","comunicado","resultado","CVM","B3"
];

const FORBIDDEN_SOURCES = [
  /(^|\.)linkedin\.com$/i,
  /(^|\.)br\.linkedin\.com$/i,
  /(^|\.)pt\.linkedin\.com$/i
];

function isForbidden(url="") {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return FORBIDDEN_SOURCES.some(rx => rx.test(host));
  } catch { return true; }
}

function isProbablyOkSource(url="") {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (isForbidden(url)) return false;
    return true;
  } catch { return false; }
}

function mapPeopleToOrganograma(people=[]) {
  const org = [
    { nome: "", Cargo: "CEO" },
    { nome: "", Cargo: "CFO" },
    { nome: "", Cargo: "CTO" },
    { nome: "", Cargo: "COO" }
  ];

  const rx = {
    CEO: /\b(ceo|presidente|president|diretor executivo|chief executive)\b/i,
    CFO: /\b(cfo|diretor financeiro|finance director|chief financial)\b/i,
    CTO: /\b(cto|diretor de tecnologia|chief technology)\b/i,
    COO: /\b(coo|diretor de opera[cç][aã]o|chief operating)\b/i
  };

  const used = new Set();
  // 1) casar cargos
  for (let i=0;i<org.length;i++){
    const role = org[i].Cargo;
    const idx = people.findIndex((p,j)=>!used.has(j) && rx[role].test(p.cargo||""));
    if (idx>=0){ org[i].nome = people[idx].nome; used.add(idx); }
  }
  // 2) preencher sobras
  for (let i=0;i<org.length;i++){
    if (!org[i].nome){
      const idx = people.findIndex((p,j)=>!used.has(j));
      if (idx>=0){ org[i].nome = people[idx].nome; used.add(idx); }
    }
  }
  return org;
}

function inferClassificacao(role="", hasCEO=false){
  const t = String(role||"").toLowerCase();
  if (/\b(ceo|presidente)\b/.test(t)) return "Decisor";
  if (/\b(cfo|finance)\b/.test(t)) return hasCEO ? "Influenciador" : "Decisor";
  if (/\b(cio|cto|ti|technology|oper[aç]ões|operations|coo)\b/.test(t)) return "Influenciador";
  if (/\b(procurement|compras|jur[ií]dico|legal|compliance|security)\b/.test(t)) return "Barreira";
  return "Influenciador";
}

function buildPowermapFromPeople(org, people){
  const hasCEO = org.some(o=>o.Cargo==="CEO" && o.nome);
  const base = people.map(p=>({
    nome: p.nome,
    cargo: p.cargo || "",
    classificacao: inferClassificacao(p.cargo||"", hasCEO),
    justificativa: `Fonte: ${p.fonte}`
  }));
  const pick = (cls)=> base.find(x=>x.classificacao===cls) || { nome:"", cargo:"", classificacao:cls, justificativa:"Sem evidência forte" };
  return [ pick("Decisor"), pick("Influenciador"), pick("Barreira") ];
}

async function enrichOrgPowermapWithWebSearch(site, companyName, baseObj){
  const domain = domainFromSite(site||baseObj?.site||"");
  const alvo = companyName || domain || site;

  if (!USE_WEB || !alvo) {
    console.log("[org-web] web_search indisponível ou alvo vazio — pulando");
    return baseObj;
  }

  const system = `
Você é um agente que **usa web_search** e retorna **apenas JSON**.
Objetivo: encontrar **nomes e cargos** (coordenador+ para cima) da empresa alvo **sem usar LinkedIn** (ignorar qualquer resultado de linkedin).
Priorize: site institucional da empresa, páginas "liderança/governança/diretoria", sala de imprensa, CVM/B3, mídia econômica.
Para **cada pessoa**, retorne também **"fonte" (URL)** exata onde o nome/cargo aparece.
Máximo 6 pessoas úteis. Saída: JSON.
`.trim();

  const queryHints = [
    `site:${domain} (${ALLOWED_HINTS.join(" OR ")})`,
    `${alvo} diretoria OR liderança OR executivos`,
    `${alvo} CEO OR CFO OR CTO OR COO site:${domain}`,
    `${alvo} governança OR conselho OR "quem somos"`,
    `${alvo} Valor Econômico OR Exame OR NeoFeed OR "sala de imprensa"`,
    `${alvo} CVM formulário de referência`
  ];

  const user = `
Empresa alvo: ${alvo}
Formato:
{ "people": [ { "nome": "Nome", "cargo": "Cargo", "fonte": "https://..." } ] }
Regras: sem LinkedIn; 4–6 pessoas; sempre com fonte confiável (URL pública).
Consultas sugeridas:
${queryHints.map(q=>`- ${q}`).join("\n")}
`.trim();

  const req = {
    model: MODEL,
    tools: USE_WEB ? [{ type: "web_search" }] : [],
    tool_choice: "auto",
    input: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    max_output_tokens: 1500
  };

  console.log("[org-web] enriquecendo organograma/powermap via web_search…");
  const resp = await callOAIWithMaxToolCalls(req, 8);
  printRaw("[org-web][raw]", resp.output_text || "");
  printToolsDetected(resp);

  const obj = sanitizeAndParse(resp.output_text || "");
  const arr = Array.isArray(obj?.people) ? obj.people : [];

  const clean = [];
  for (const p of arr) {
    const nome  = String(p?.nome || "").trim();
    const cargo = String(p?.cargo || "").trim();
    const fonte = String(p?.fonte || "").trim();
    if (!nome || !fonte) continue;
    if (!isProbablyOkSource(fonte)) continue;
    clean.push({ nome, cargo, fonte });
  }

  console.log(`[org-web] pessoas úteis: ${clean.length}`);
  if (!clean.length) return baseObj;

  const org = mapPeopleToOrganograma(clean);
  const pm  = buildPowermapFromPeople(org, clean.slice(0,4));

  baseObj.organogramaclevel = org;
  baseObj.powermap = pm;
  return baseObj;
}
/* =============================== FIM BLOCO ORG/PM =============================== */

// ===== PROMPTS =====
function buildSystemMsg(site) {
  return `
Você é um agente que retorna **APENAS** um **objeto JSON válido**.
Você **PODE** usar web_search sempre que precisar de informação externa e deve continuar pesquisando enquanto houver campos vazios ou fracos.

⚠️ TODOS os campos são importantes (CNPJ, funcionários, faturamento, e-mails, ERP, fiscal, notícias etc.).

### Padrões de qualidade por campo
- nomedaempresa: razão social da MATRIZ.
- cnpj: CNPJ da MATRIZ no formato 00.000.000/0001-00.
- mapa: URL do Google Maps da MATRIZ.
- telefonepublico: do site institucional (ou Maps).
- segmento/subsegmento: concisos e coerentes.
- fundacao: AAAA ou data completa.
- localização: Cidade/UF da MATRIZ.
- funcionarios: real (com fonte); se não houver, estimar com critério.
- faturamento: valor e fonte; se USD, converter (5,0 BRL/USD) e citar.
- erpatualouprovavel + justificativaERP: seleção e justificativa sucinta.
- solucaofiscalouprovavel + criteriofiscal: seleção e critério.
- principaldordonegocio: **(será definido offline no backend)**.
- investimentoemti: benchmark; se ausente, 2% do faturamento em R$ (explicar).
- ofensoremti: 1 frase objetiva.
- ultimas5noticias: 5 itens (24 meses) com {titulo,data,url,resumo≤25 palavras}.
- e-mails (TI/Financeiro): 120–180 palavras, personalizados, CTA 20 minutos.
- Compelling/gatilho comercial: 1–2 frases cada.
- organogramaclevel/powermap: nomes quando houver fonte; caso contrário, vazio.

Saída: SOMENTE o JSON final.
`.trim();
}

function buildUserPrompt(site) {
  return `
Site informado: ${site}

Preencha exatamente este JSON — SAÍDA: SOMENTE o JSON:

{
  "nomedaempresa": "",
  "cnpj": "",
  "mapa": "",
  "telefonepublico": "",
  "segmento": "",
  "fundacao": "",
  "subsegmento": "",
  "criteriofiscal": "",
  "funcionarios": "",
  "faturamento": "",
  "localização": "",
  "erpatualouprovavel": "",
  "justificativaERP": "",
  "solucaofiscalouprovavel": "",
  "principaldordonegocio": "",
  "investimentoemti": "",
  "ofensoremti": "",
  "modelodeemailti": "",
  "modelodeemailfinanceiro": "",
  "ultimas5noticias": [],
  "Compelling": "",
  "gatilhocomercial": "",
  "site": "${site}",
  "organogramaclevel": [
    { "nome": "", "Cargo": "CEO" },
    { "nome": "", "Cargo": "CFO" },
    { "nome": "", "Cargo": "CTO" },
    { "nome": "", "Cargo": "COO" }
  ],
  "powermap": [
    { "nome": "", "cargo": "", "classificacao": "Decisor", "justificativa": "" },
    { "nome": "", "cargo": "", "classificacao": "Influenciador", "justificativa": "" },
    { "nome": "", "cargo": "", "classificacao": "Barreira", "justificativa": "" }
  ]
}
`.trim();
}

function buildRefineSystemMsg() {
  return `
Você completa um JSON existente. Use web_search e preencha campos vazios/fracos.
Lembretes:
- notícias: 5 itens (24 meses) {titulo,data,url,resumo ≤25}.
- mapa: URL do Google Maps da MATRIZ.
- e-mails: 120–180 palavras + CTA 20 minutos.
- investimentoemti: benchmark; senão, 2% do faturamento em R$ (explique).
- ERP/fiscal: escolha provável com critério.
- principaldordonegocio: **ignorar — será definido offline no backend**.

Saída: apenas o JSON final.
`.trim();
}

function buildRefineUserPrompt(prevJSON, camposFaltando) {
  return `
JSON parcial atual:
${prevJSON}

Campos faltando/insuficientes: ${camposFaltando.join(", ")}

Complete sem remover dados corretos. Lembre-se:
- "mapa" = URL do Google Maps;
- 5 notícias objetivas (24 meses);
- e-mails TI/Financeiro completos (120–180 palavras);
- justificar estimativas (funcionários, faturamento, ERP, fiscal, investimentoemti);
- converter USD→BRL a 5,0 quando necessário.
- "principaldordonegocio": será definido offline no backend.

Saída: somente o JSON final.
`.trim();
}

// ===== ROTA =====
app.post("/generate", async (req, res) => {
  try {
    const { site } = req.body;
    console.log("[/generate] site:", site);

    // ===== PASSO 1: JSON INICIAL =====
    const systemMsg1 = buildSystemMsg(site);
    const prompt1    = buildUserPrompt(site);

    const req1 = {
      model: MODEL,
      tools: USE_WEB ? [{ type: "web_search" }] : [],
      tool_choice: "auto",
      input: [
        { role: "system", content: systemMsg1 },
        { role: "user",   content: prompt1 }
      ],
      max_output_tokens: 4000
    };

    console.log("[/generate] model:", MODEL, "| USE_WEB:", USE_WEB, "| tool_choice:", JSON.stringify(req1.tool_choice));
    const resp1 = await callOAIWithMaxToolCalls(req1, USE_WEB ? 8 : undefined);

    const raw1 = resp1.output_text || "";
    console.log("[/generate] PASSO 1 — output_text length:", raw1.length);
    printRaw("RAW PASSO 1", raw1);
    printRaw("RESPONSE JSON PASSO 1", JSON.stringify(resp1));
    printToolsDetected(resp1);
    console.log("[/generate] PASSO 1 — usage:", JSON.stringify(resp1?.usage || {}));

    let obj1 = sanitizeAndParse(raw1);
    if (!obj1) {
      const rehab = await openai.responses.create({
        model: MODEL,
        input: [
          { role: "system", content: "Converta o conteúdo em UM ÚNICO objeto JSON válido. Preserve chaves/valores. Sem markdown." },
          { role: "user", content: raw1 }
        ],
        text: { format: { type: "json_object" } },
        max_output_tokens: 2000
      });
      const fixed = rehab.output_text || "{}";
      obj1 = tryParse(fixed);
    }
    if (!obj1 || typeof obj1 !== "object") {
      return res.status(502).json({ error: "Modelo não retornou JSON válido no PASSO 1" });
    }

    // Checar campos vazios/chaves faltando
    const expectedKeys = [
      "nomedaempresa","cnpj","mapa","telefonepublico","segmento","fundacao","subsegmento","criteriofiscal",
      "funcionarios","faturamento","localização","erpatualouprovavel","justificativaERP","solucaofiscalouprovavel",
      "principaldordonegocio","investimentoemti","ofensoremti","modelodeemailti","modelodeemailfinanceiro",
      "ultimas5noticias","Compelling","gatilhocomercial","site","organogramaclevel","powermap"
    ];

    const missingOrWeak = [];
    for (const k of expectedKeys) {
      if (!(k in obj1)) { missingOrWeak.push(k); continue; }
      const v = obj1[k];
      if (v === "" || v == null) { missingOrWeak.push(k); continue; }
      if (Array.isArray(v) && v.length === 0) { missingOrWeak.push(k); continue; }
    }

    // ⚠️ Não deixe o PASSO 2 rodar por causa da dor (que é OFFLINE)
    const idxDor = missingOrWeak.indexOf("principaldordonegocio");
    if (idxDor !== -1) missingOrWeak.splice(idxDor, 1);

    // >>> DOR DO SEGMENTO (offline) — SEMPRE sobrescreve
    try {
      const { dor } = resolveSegmentPain(obj1.segmento, obj1.subsegmento);
      obj1.principaldordonegocio = dor;
    } catch (e) {
      console.log("[dor-offline] aviso: falha ao resolver dor no PASSO 1:", e?.message || e);
    }

    if (!missingOrWeak.length) {
      // >>> TOP3
      try {
        const { erp_top3, fiscal_top3 } = buildTop3(obj1);
        obj1.erp_top3 = erp_top3;
        obj1.fiscal_top3 = fiscal_top3;
      } catch (e) {
        console.log("[scoring] erro:", e?.message || e);
      }

      // >>> ORGANOGRAMA/POWERMAP via web_search
      try {
        await enrichOrgPowermapWithWebSearch(site, obj1?.nomedaempresa, obj1);
      } catch (e) {
        console.log("[/generate] aviso (early): falha org/powermap web:", e?.message || e);
      }

      return res.json(obj1);
    }

    // ===== PASSO 2: REFINO DOS CAMPOS FALTANTES =====
    const systemMsg2 = buildRefineSystemMsg();
    const prevStr = JSON.stringify(obj1, null, 2);
    const prompt2  = buildRefineUserPrompt(prevStr, missingOrWeak);

    const req2 = {
      model: MODEL,
      tools: USE_WEB ? [{ type: "web_search" }] : [],
      tool_choice: "auto",
      input: [
        { role: "system", content: systemMsg2 },
        { role: "user",   content: prompt2 }
      ],
      max_output_tokens: 5000
    };

    console.log("[/generate] PASSO 2 — refinamento, campos faltando:", missingOrWeak.length);
    const resp2 = await callOAIWithMaxToolCalls(req2, USE_WEB ? 10 : undefined);

    const raw2 = resp2.output_text || "";
    console.log("[/generate] PASSO 2 — output_text length:", raw2.length);
    printRaw("RAW PASSO 2", raw2);
    printRaw("RESPONSE JSON PASSO 2", JSON.stringify(resp2));
    printToolsDetected(resp2);
    console.log("[/generate] PASSO 2 — usage:", JSON.stringify(resp2?.usage || {}));

    let obj2 = sanitizeAndParse(raw2);
    if (!obj2 || typeof obj2 !== "object") {
      try {
        const rehab2 = await openai.responses.create({
          model: MODEL,
          input: [
            { role: "system", content: "Converta o conteúdo em UM ÚNICO objeto JSON válido. Preserve chaves/valores. Sem markdown." },
            { role: "user",   content: raw2 }
          ],
          text: { format: { type: "json_object" } },
          max_output_tokens: 3000
        });
        const fixed2 = rehab2.output_text || "{}";
        obj2 = tryParse(fixed2);
      } catch {
        obj2 = obj1;
      }
    }

    const finalObj = { ...obj1, ...(obj2 || {}) };

    // >>> DOR DO SEGMENTO (offline) — sobrescreve novamente no final
    try {
      const { dor } = resolveSegmentPain(finalObj.segmento, finalObj.subsegmento);
      finalObj.principaldordonegocio = dor;
    } catch (e) {
      console.log("[dor-offline] aviso: falha ao resolver dor no PASSO 2:", e?.message || e);
    }

    // >>> TOP3
    try {
      const { erp_top3, fiscal_top3 } = buildTop3(finalObj);
      finalObj.erp_top3 = erp_top3;
      finalObj.fiscal_top3 = fiscal_top3;
    } catch (e) {
      console.log('[scoring] falhou ao gerar top3:', e?.message || e);
    }

    // >>> ORGANOGRAMA/POWERMAP via web_search
    try {
      await enrichOrgPowermapWithWebSearch(site, finalObj?.nomedaempresa, finalObj);
    } catch (e) {
      console.log("[/generate] aviso: falha org/powermap web:", e?.message || e);
    }

    return res.json(finalObj);

  } catch (error) {
    console.error("Erro ao gerar resposta:", error);
    const status = error?.status && Number.isInteger(error.status) ? error.status : 500;
    res.status(status).json({ error: "Erro ao gerar resposta", detail: error?.message || String(error) });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

