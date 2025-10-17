// backend/index.js
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const { buildTop3 } = require("./scoring/scoring");

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
   EXCLUSIVO PARA ORGANOGRAMA/POWERMAP SEM LINKEDIN (apenas SERP pública)
   ======================================================================= */

// Normaliza domínio a partir de site informado
function normalizeCompanySlugFromSite(site = "") {
  const host = String(site || "").toLowerCase().replace(/^https?:\/\//,'').split('/')[0] || "";
  if (!host) return "";
  const base = host.replace(/^www\./,'').replace(/\..*$/,'').replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
  return base;
}

// Heurística simples de classificação p/ Powermap
function inferRoleFromTitle(title = "", hasCEO = false) {
  const t = String(title).toLowerCase();
  const isCEO = /\b(ceo|president|presidente|diretor executivo)\b/.test(t);
  const isCFO = /\b(cfo|diretor financeiro|vp finance|finance director)\b/.test(t);
  const isIT  = /\b(cio|cto|head of it|it director|technology|inform[aá]tica|ti|information)\b/.test(t);
  const isOps = /\b(coo|operations|opera[cç][aã]o|operational)\b/.test(t);
  const isBlocker = /\b(procurement|compras|sourcing|legal|compliance|security|jur[ií]dico)\b/.test(t);
  if (isCEO) return "Decisor";
  if (isCFO) return hasCEO ? "Influenciador" : "Decisor";
  if (isIT || isOps)  return "Influenciador";
  if (isBlocker) return "Barreira";
  return "Influenciador";
}

// Monta organograma C-Level de forma "solta" com base em cargos identificados
function buildOrganogramaCLevelLoose(people = []) {
  const out = [
    { nome: "", Cargo: "CEO" },
    { nome: "", Cargo: "CFO" },
    { nome: "", Cargo: "CTO" },
    { nome: "", Cargo: "COO" }
  ];
  const byRoleRegex = {
    CEO: /\b(ceo|president|presidente|diretor executivo)\b/i,
    CFO: /\b(cfo|diretor financeiro|vp finance|finance director)\b/i,
    CTO: /\b(cto|chief technology|diretor de tecnologia|head of technology|technology officer)\b/i,
    COO: /\b(coo|chief operating|diretor de opera[cç][aã]o|operations officer)\b/i
  };

  const used = new Set();
  // (1) casar pelo cargo
  for (let i = 0; i < out.length; i++) {
    const role = out[i].Cargo;
    const rx = byRoleRegex[role];
    const idx = people.findIndex((p, j) => !used.has(j) && rx.test(p.title || ""));
    if (idx >= 0) {
      out[i].nome = people[idx].name || "";
      used.add(idx);
    }
  }
  // (2) completar slots vazios em ordem
  for (let i = 0; i < out.length; i++) {
    if (!out[i].nome) {
      const idx = people.findIndex((p, j) => !used.has(j));
      if (idx >= 0) { out[i].nome = people[idx].name || ""; used.add(idx); }
    }
  }
  return out;
}

// Transforma itens de SERP (título/snippet/url) em pessoas (nome + cargo), EXCLUINDO LinkedIn
function normalizeSerpToPeopleFromPublicWeb(items = []) {
  const results = [];
  const seen = new Set();

  for (const it of items) {
    const url = String(it?.url || it?.link || "").trim();
    if (!url) continue;
    if (/linkedin\.com\/(company|in)\//i.test(url)) continue; // exclui LinkedIn
    if (seen.has(url)) continue;
    seen.add(url);

    const title = (it?.title || it?.name || "").trim();
    const snippet = (it?.snippet || it?.description || "").trim();
    if (!title) continue;

    // Heurística de extração: "Nome – Cargo – Empresa" | ou "Nome | Empresa | Cargo" (varia por site)
    let name = "";
    let cargo = "";

    // Split por " | " primeiro (comum em mídia/evento)
    let base = title.split("|")[0].trim();
    // Depois tenta split por " – " (hífen longo) ou "-" simples
    let parts = base.split(" – ");
    if (parts.length < 2) parts = base.split(" - ");

    if (parts.length >= 2) {
      name = parts[0].trim();
      cargo = parts[1].trim();
    } else {
      // fallback: usa snippet para tentar cargo
      name = base.trim();
      if (snippet) {
        const m = snippet.match(/(?:^|\.\s)([^.]{3,80}?(?:diretor|vice|presidente|ceo|cfo|cio|cto|gerente|coordenador|head)[^.]{0,80})(?:\.|$)/i);
        if (m && m[1]) cargo = m[1].trim();
      }
    }

    // filtros mínimos
    if (!name || name.length < 3) continue;
    if (!cargo) {
      // cargo muito vazio → ainda pode servir, mas piora a qualidade
      // mantemos para completar slots, mas daremos prioridade aos com cargo
    }

    results.push({ name, title: cargo, url, source: url, rawTitle: title, rawSnippet: snippet });
    if (results.length >= 16) break;
  }

  // ordena priorizando quem tem cargo
  results.sort((a, b) => {
    const aw = a.title ? 0 : 1;
    const bw = b.title ? 0 : 1;
    return aw - bw;
  });

  return results;
}

// Faz a busca na web (SERP) pedindo APENAS JSON com {items: [{url,title,snippet}]}, excluindo LinkedIn
async function fetchExecsFromPublicWeb(openaiClient, target) {
  const queries = [
    // site institucional
    `site:${target} (CEO OR CFO OR CIO OR CTO OR Diretor OR Vice-Presidente OR Presidente)`,
  ];

  // Se target não for domínio, tentamos empresa por nome em fontes de imprensa/eventos
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(target)) {
    queries.push(
      `"${target}" (CEO OR CFO OR CIO OR CTO OR Diretor OR Vice-Presidente OR Presidente) site:.br`,
      `"${target}" (CEO OR CFO OR CIO OR CTO OR Diretor OR Vice-Presidente OR Presidente) site:valor.globo.com`,
      `"${target}" (CEO OR CFO OR CIO OR CTO OR Diretor OR Vice-Presidente OR Presidente) site:exame.com`,
      `"${target}" (CEO OR CFO OR CIO OR CTO OR Diretor OR Vice-Presidente OR Presidente) site:g1.globo.com`,
      `"${target}" (CEO OR CFO OR CIO OR CTO OR Diretor OR Vice-Presidente OR Presidente) site:neofeed.com.br`,
      `"${target}" (CEO OR CFO OR CIO OR CTO OR Diretor OR Vice-Presidente OR Presidente) site:baguete.com.br`,
      `"${target}" (CEO OR CFO OR CIO OR CTO OR Diretor OR Vice-Presidente OR Presidente) site:meioemensagem.com.br`,
      `"${target}" (CEO OR CFO OR CIO OR CTO OR Diretor OR Vice-Presidente OR Presidente) site:events*`,
      `"${target}" liderança OR leadership`,
      `"${target}" imprensa OR newsroom`
    );
  }

  const system = `
Use web_search e retorne APENAS JSON com os resultados da SERP.
NUNCA clique nem abra páginas bloqueadas; NÃO inclua linkedin.com (company/in) nos resultados.
Formato de saída rigoroso:
{"items":[{"url":"","title":"","snippet":""}, ...]}
Inclua no máximo 20 itens por consulta.
`.trim();

  const collected = [];
  const seenUrl = new Set();

  for (const q of queries) {
    const req = {
      model: MODEL,
      tools: [{ type: "web_search" }],
      tool_choice: "auto",
      input: [
        { role: "system", content: system },
        { role: "user", content: `Consulta: ${q}\nObservação: EXCLUA linkedin.com dos resultados.` }
      ],
      temperature: 0,
      max_output_tokens: 900
    };

    try {
      const resp = await openaiClient.responses.create(req);
      const raw = resp.output_text || "";
      printRaw(`[public SERP][raw] q="${q}"`, raw);
      const data = sanitizeAndParse(raw);
      const items = Array.isArray(data?.items) ? data.items : [];
      for (const it of items) {
        const url = String(it?.url || it?.link || "");
        if (!url) continue;
        if (/linkedin\.com\/(company|in)\//i.test(url)) continue; // exclui LinkedIn
        if (seenUrl.has(url)) continue;
        seenUrl.add(url);
        collected.push({
          url,
          title: it?.title || it?.name || "",
          snippet: it?.snippet || it?.description || ""
        });
      }
      if (collected.length >= 24) break;
    } catch (e) {
      console.log("[public SERP] erro:", e?.message || e);
    }
  }

  console.log(`[public SERP] total itens coletados (sem LinkedIn): ${collected.length}`);
  return collected;
}

// Reconstrói organograma/powermap com base SOMENTE em fontes públicas não-LinkedIn
async function rebuildOrgAndPowerMapFromPublicWeb(openaiClient, finalObj, site) {
  try {
    const companyName = finalObj?.nomedaempresa || "";
    const domainSlug = normalizeCompanySlugFromSite(site || finalObj?.site || "");
    const target = domainSlug || companyName;
    if (!target) return finalObj;

    console.log("[org/powermap][public] procurando executivos para:", target);
    const serpItems = await fetchExecsFromPublicWeb(openaiClient, target);
    const people = normalizeSerpToPeopleFromPublicWeb(serpItems);
    console.log("[org/powermap][public] pessoas (normalizadas, sem LinkedIn):", JSON.stringify(people, null, 2));

    if (!people || people.length === 0) {
      console.log("[org/powermap][public] nenhuma pessoa encontrada; preservando campos atuais");
      return finalObj;
    }

    // ORGANOGRAMA (4 slots) → prioriza quem tem cargo
    const chosen = [...people].slice(0, 8);
    const organograma = buildOrganogramaCLevelLoose(chosen);

    // POWermap: somente a partir dos nomes do organograma
    const namesInOrg = new Set(organograma.map(o => (o?.nome || "").trim()).filter(Boolean));
    const orgPeople = chosen.filter(p => namesInOrg.has((p.name || "").trim()));
    const hasCEO = organograma.some(o => /^(ceo)$/i.test(o.Cargo) && o.nome);

    const pmCandidates = orgPeople.map(p => ({
      nome: p.name || "",
      cargo: p.title || "",
      classificacao: inferRoleFromTitle(p.title || "", hasCEO),
      justificativa: `Fonte: ${p.source || p.url}`
    }));

    const pickBy = (cls) =>
      pmCandidates.find(n => n.classificacao === cls) ||
      { nome: "", cargo: "", classificacao: cls, justificativa: "Fonte: SERP (site institucional/imprensa/evento)" };

    const powermapOut = [
      pickBy("Decisor"),
      pickBy("Influenciador"),
      pickBy("Barreira")
    ];

    // Anexa origem no organograma (não mudando schema: só mantém nomes e Cargos)
    finalObj.organogramaclevel = organograma;
    finalObj.powermap = powermapOut;

    console.log("[org/powermap][public] organograma:", JSON.stringify(organograma));
    console.log("[org/powermap][public] powermap:", JSON.stringify(powermapOut));
    return finalObj;
  } catch (e) {
    console.log("[org/powermap][public] falha:", e?.message || e);
    return finalObj;
  }
}

/* =============================== FIM BLOCO ORG/PM =============================== */

// ===== PROMPTS =====
function buildSystemMsg(site) {
  return `
Você é um agente que retorna **APENAS** um **objeto JSON válido** (sem markdown, sem comentários, sem texto fora de { ... }).
Você **PODE** usar web_search sempre que precisar de informação externa e deve continuar pesquisando enquanto houver campos vazios ou fracos.

⚠️ TODOS os campos são **igualmente importantes** (CNPJ, funcionários, faturamento, modelos de e-mail, ERP, fiscal, notícias, etc.). Não priorize apenas dados legais.

### Padrões de qualidade por campo
- **nomedaempresa**: razão social oficial da **MATRIZ** (se houver S/A, LTDA, etc., mantenha).
- **cnpj**: CNPJ da **MATRIZ** no formato 00.000.000/0001-00 (fonte: site institucional, políticas legais, CVM, portal gov.br, perfis oficiais).
- **mapa**: **URL clicável do perfil oficial no Google Maps** da MATRIZ (ex.: "https://www.google.com/maps/place/..."). **Não** retorne apenas endereço textual.
- **telefonepublico**: telefone público do site institucional; se não houver, use o do perfil no Google Maps.
- **segmento / subsegmento**: concisos e coerentes com a atuação principal (ex.: "Tecnologia / Provedores de conteúdo na internet").
- **fundacao**: ano (AAAA) ou data completa (DD/MM/AAAA) se constar oficialmente.
- **localização**: Cidade/UF da MATRIZ (ex.: "São Paulo, SP").
- **funcionarios**: real (com fonte). Se não houver, **estime** com critério claro (ex.: LinkedIn, notícias, porte; formato sugerido: "1.001–5.000 (estimativa — critério: headcount LinkedIn)".
- **faturamento**: se houver valor confiável, retorne "R$ X/ano (AAAA) – fonte: ...".
  - Se a fonte estiver em **USD**, retorne **ambos**: "US$ X (AAAA) ≈ R$ Y – câmbio 5,0 BRL/USD – fonte: ...".
  - Se **não** houver fonte direta, **estime** com critério explícito (receita/funcionário do setor × funcionários; comparação com pares; faixas de imprensa).
- **erpatualouprovavel**: escolha entre { SAP S/4HANA, SAP ECC, SAP Business One, Oracle NetSuite, TOTVS Protheus, Senior, Sankhya, Omie, desenvolvimento próprio, outro ERP de nicho } com base em porte/segmento/notícias/ecossistema. Explique em **justificativaERP** de forma sucinta e factual.
- **solucaofiscalouprovavel**: escolha entre { Thomson Reuters, Sovos, Solutio, Avalara, Guepardo, 4Tax, BPO fiscal, planilhas/house } com critério do motivo desta solução fiscal ser selecionada ou estimada (não esquecer de colocar o nome da solução fiscal),  em **criteriofiscal** (porte/ERP/segmento/custo/notícias).
- **principaldordonegocio**: 1–2 frases sobre dores relevantes (ex.: eficiência operacional, compliance, escalabilidade, SLAs, omnichannel, prazos regulatórios).
- **investimentoemti**: se houver benchmark setorial, use-o (cite o critério).
  - Caso contrário, **2% do faturamento** (em **R$**). Se o faturamento estiver em USD, **converta** primeiro usando **câmbio 5,0 BRL/USD** e explique: "Critério: 2% de R$ {faturamento convertido}".
  - Formato textual único (string), claro e auditável.
- **ofensoremti**: 1 frase com a principal barreira interna ou externa, que dificulte o investimento em tecnologia (ex.: congelamento orçamentário, dívida técnica, backlog, CAPEX/OPEX).
- **ultimas5noticias**: **5 itens** dos últimos **24 meses** **relacionados a crescimento, expansão, investimentos, tecnologia, M&A, parcerias, CAPEX/OPEX, resultados** — **evite** matérias opinativas/editoriais.
  - Cada item: { "titulo", "data" (AAAA-MM-DD), "url", "resumo" (≤ 25 palavras) }.
  - Itens **distintos** e de fontes confiáveis; evitar duplicatas; priorizar fatos que **sustentem investimento em TI**.
- **modelodeemailti** e **modelodeemailfinanceiro**: **texto completo** com o formato:
  "ASSUNTO: <linha>"
  <linha em branco>
  <corpo 2–4 parágrafos, 120–180 palavras(imaginando que sou de uma consultoria de TI e quero agendar uma reunião de 20 minutos), **personalizado** com nomedaempresa/segmento/uma ou mais notícias/“Compelling”/dor > 
  <linha em branco>
  "Atenciosamente,
  [Seu Nome]
  [Seu Telefone]"
  - **Inclua CTA** claro para uma conversa de 20 minutos **esta semana**.
- **Compelling**: 1–2 frases orientadas a ROI/risco/eficiência/prazo regulatório, conectadas às notícias/dor/faturamento, que juntas se transformem no Compelling para investimento em TI.
- **gatilhocomercial**: 1–2 frases com time-to-value/urgência (janela regulatória, pico sazonal, corte de custos)que resultem em um gatilho comercial poderoso para instigar um possível investimento em tecnologia.
- **organogramaclevel**: preencha nomes quando houver fonte; caso contrário deixe vazio, mas **tente** ao menos o CEO/CFO.
  - Mantenha a chave "Cargo" **exatamente** com maiúscula (conforme o schema).
- **powermap**: 3 itens: Decisor, Influenciador, Barreira. Use nomes reais quando possível com **justificativa** breve (fonte/indício). Se não houver, deixe nomes vazios mas mantenha as classificações.

### Como buscar (sugestões)
- Site institucional: "sobre", "quem somos", rodapé, "política de privacidade", "contato".
- CNPJ: site institucional; se faltar, imprensa/cadastros; **confirme** razão social/endereço.
- Mapa: "site:google.com/maps {razão social} {cidade}" (perfil oficial).
- Funcionários: LinkedIn/press-kit/imprensa.
- Notícias: "{razão social} (investimento OR expansão OR aquisição OR parceria OR captação OR data center OR ERP OR cloud OR compliance)".

### Regras de saída
- **Saída: SOMENTE o JSON final** (comece em "{" e termine em "}").
- **Nunca** escreva “não encontrado”. Para factuais sem fonte após pesquisar, use "em verificação". Para estimáveis, **estime** com critério.
- Preencha **todos** os campos; evite deixar strings vazias se houver base para estimar.
`.trim();
}

function buildUserPrompt(site) {
  return `
Site informado: ${site}

Preencha exatamente este JSON (mantenha os tipos de cada campo) — SAÍDA: **SOMENTE** o JSON (comece em "{" e termine em "}"):

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
Você completa um **JSON existente**. Use **web_search** e preencha **todos** os campos vazios ou fracos seguindo os mesmos padrões de qualidade:

- Notícias: 5 itens (24 meses) focados em crescimento/expansão/tecnologia/finanças, cada um com {titulo,data AAAA-MM-DD,url,resumo ≤ 25 palavras}.
- "mapa": **URL do Google Maps da MATRIZ**, não endereço textual.
- E-mails (TI/Financeiro): 120–180 palavras, personalizados com empresa/segmento/notícias/Compelling/dor, CTA de 20 minutos, e sem esquecer que este e-mail deve ser um e-mail de geração de demanda, em que o foco é conseguir 20 minutos da empresa em questão, para que o usuário deste PROMT possa apresentar sua empresa.
- "investimentoemti": benchmark setorial; se ausente, **2% do faturamento em R$** (se faturamento estiver em USD, **converta com 5,0 BRL/USD**, explique e seja conservador).
- ERP/fiscal: escolha provável com **critério** e justificativa clara do motivo dessas soluções serem plausíveis para essa empresa.
- Para factuais sem fonte mesmo após buscar, use "em verificação". Para estimáveis, **preencha** com critério explícito.

⚠️ Saída: **apenas** o JSON final, sem markdown, começando em "{" e terminando em "}".
`.trim();
}

function buildRefineUserPrompt(prevJSON, camposFaltando) {
  return `
JSON parcial atual (com campos vazios ou fracos):
${prevJSON}

Campos faltando/insuficientes: ${camposFaltando.join(", ")}

Complete **todos** os campos acima **sem remover** dados já corretos. 
Lembre-se de: 
- manter "mapa" como URL do Google Maps da MATRIZ,
- montar 5 notícias 100% ligadas a crescimento/expansão/tecnologia/finanças (não opinião),
- produzir e-mails TI/Financeiro completos (120–180 palavras) imaginando que sou de uma consultoria de TI e desejo uma reunião de 20 minutos,
- justificar estimativas (funcionários, faturamento, ERP, fiscal, investimentoemti),
- converter USD→BRL a 5,0 quando necessário (explicando no texto de "faturamento" e no "investimentoemti").

Saída: **somente** o JSON final.
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
      temperature: 0,
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
        temperature: 0,
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

    if (!missingOrWeak.length) {
      // >>> Top3 antes de retornar (SEM alterações fora do escopo)
      try {
        const { erp_top3, fiscal_top3 } = buildTop3(obj1);
        obj1.erp_top3 = erp_top3;
        obj1.fiscal_top3 = fiscal_top3;
      } catch (e) {
        console.log("[scoring] erro:", e?.message || e);
      }

      // >>> NOVO (somente Organograma/PowerMap via fontes públicas, sem LinkedIn)
      try {
        await rebuildOrgAndPowerMapFromPublicWeb(openai, obj1, site);
      } catch (e) {
        console.log("[/generate] aviso (early): falha ao reconstruir org/powermap público:", e?.message || e);
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
      temperature: 0,
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
          temperature: 0,
          max_output_tokens: 3000
        });
        const fixed2 = rehab2.output_text || "{}";
        obj2 = tryParse(fixed2);
      } catch {
        obj2 = obj1;
      }
    }

    const finalObj = { ...obj1, ...(obj2 || {}) };

    // >>> Top3 (mantido)
    try {
      const { erp_top3, fiscal_top3 } = buildTop3(finalObj);
      finalObj.erp_top3 = erp_top3;
      finalObj.fiscal_top3 = fiscal_top3;
    } catch (e) {
      console.log('[scoring] falhou ao gerar top3:', e?.message || e);
    }

    // >>> NOVO (somente Organograma/PowerMap via fontes públicas, sem LinkedIn)
    try {
      await rebuildOrgAndPowerMapFromPublicWeb(openai, finalObj, site);
    } catch (e) {
      console.log("[/generate] aviso: falha ao reconstruir org/powermap público:", e?.message || e);
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
