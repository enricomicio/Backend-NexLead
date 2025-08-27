const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const USE_WEB = (process.env.SEARCH_MODE || "none").toLowerCase() === "web";

// DEBUG liga/desliga logs RAW
const DEBUG_RAW = true;

/* ===================== helpers de log e util ===================== */
function logLarge(label, text, chunk = 6000) {
  if (!text) return;
  console.log(`----- ${label} (len=${text.length}) BEGIN -----`);
  for (let i = 0; i < text.length; i += chunk) {
    console.log(text.slice(i, i + chunk));
  }
  console.log(`----- ${label} END -----`);
}
function safeStringify(obj, limit = 120000) {
  try {
    const s = JSON.stringify(obj, null, 2);
    return s.length > limit ? s.slice(0, limit) + "\n...[truncated]..." : s;
  } catch {
    return String(obj);
  }
}
function detectTools(resp) {
  const found = [];
  try {
    const j = JSON.parse(JSON.stringify(resp));
    const scan = (node) => {
      if (!node || typeof node !== "object") return;
      const t = (node.type || "").toString().toLowerCase();
      if (t.includes("tool") || t.includes("web_search")) {
        found.push({
          type: node.type || "unknown",
          name: node.tool_name || node.name || (node.action && node.action.type) || "unknown"
        });
      }
      for (const k in node) scan(node[k]);
    };
    scan(j);
  } catch {}
  return found;
}
function toHost(urlLike) {
  try {
    let s = String(urlLike || "").trim();
    if (!s) return "";
    if (!/^https?:\/\//i.test(s)) s = "https://" + s;
    const u = new URL(s);
    return u.host.toLowerCase();
  } catch {
    return String(urlLike || "").replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
  }
}
function stripWWW(host) {
  return host.replace(/^www\./i, "");
}
function isEmptyVal(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}
function findMissingFields(obj) {
  const required = [
    "nomedaempresa","cnpj","mapa","telefonepublico","segmento","fundacao","subsegmento",
    "criteriofiscal","funcionarios","faturamento","localização","erpatualouprovavel","justificativaERP",
    "solucaofiscalouprovavel","principaldordonegocio","investimentoemti","ofensoremti",
    "modelodeemailti","modelodeemailfinanceiro","ultimas5noticias","Compelling","gatilhocomercial",
    "site","organogramaclevel","powermap"
  ];
  const missing = [];
  for (const k of required) {
    if (!(k in obj) || isEmptyVal(obj[k])) missing.push(k);
  }
  return missing;
}
function coerceArrays(obj) {
  // Garantir arrays para esses campos
  if (!Array.isArray(obj.ultimas5noticias)) obj.ultimas5noticias = [];
  if (!Array.isArray(obj.organogramaclevel)) obj.organogramaclevel = [];
  if (!Array.isArray(obj.powermap)) obj.powermap = [];
  return obj;
}
/* ================================================================= */

app.post("/generate", async (req, res) => {
  try {
    const { site } = req.body;
    const host = toHost(site);
    const base = stripWWW(host);

    // Queries genéricas obrigatórias (cobertura ampla)
    const baseQueries = [
      `site:${host} cnpj`,
      `site:${host} "fale conosco" OR contato OR telefone`,
      `site:${host} quem somos OR "sobre" OR institucional`,
      `site:${host} "política de privacidade"`,
      `"${base}" site:google.com/maps`,
      `${base} LinkedIn employees`,
      `${base} faturamento 2023 OR receita 2023`,
      `${base} "número de funcionários"`,
      `${base} ERP OR "sistema de gestão"`,
      `${base} "solução fiscal" OR "software fiscal"`,
      `${base} aquisição OR investimento OR expansão site:news.google.com`,
      `${base} endereço`
    ];

    const prompt = `
Site informado: ${site}

Preencha exatamente este JSON (mantenha os tipos de cada campo) — SAÍDA: SOMENTE o JSON (comece em "{" e termine em "}"; não escreva texto fora do JSON):

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

    const systemBase = `
Você é um agente que produz APENAS JSON válido (sem markdown, sem comentários, sem preâmbulos).
Use EXATAMENTE as chaves do template acima (inclusive acentos, ex.: "localização").
`.trim();

    const systemPass1 = `
${systemBase}

### QUERIES OBRIGATÓRIAS (PASSO 1)
A seguir há uma lista "QUERIES" já prontas. Você DEVE chamar "web_search" uma vez para **cada linha**, exatamente como está, sem colar o prompt ou o JSON no parâmetro "query". Não finalize o JSON antes de considerar TODAS as chamadas.

QUERIES:
${baseQueries.map(q => `- ${q}`).join("\n")}

### COBERTURA DE TODOS OS CAMPOS
- Preencha TODOS os campos. Se um fato não existir publicamente, use melhor estimativa com critério explícito no próprio campo justificativo (ex.: "justificativaERP" / "criteriofiscal" / "investimentoemti").
- "ultimas5noticias": 5 itens (≤24 meses) no formato { "titulo","data"(AAAA-MM-DD),"url","resumo"(≤25 palavras) }.
- SEMPRE preencha "modelodeemailti" e "modelodeemailfinanceiro" (120–180 palavras, personalizar com nomedaempresa/segmento/notícias/dor/compelling; concluir com CTA para conversa de 20 minutos nesta semana).

### SAÍDA
- Somente o objeto JSON final (sem \`\`\`).
`.trim();

    // ===== PASSO 1 =====
    const req1 = {
      model: MODEL,
      tools: USE_WEB ? [{ type: "web_search" }] : [],
      tool_choice: USE_WEB ? "auto" : "none",
      input: [
        { role: "system", content: systemPass1 },
        { role: "user",   content: prompt }
      ],
      temperature: 0,
      max_output_tokens: 4000
    };

    console.log("[/generate] site:", site);
    console.log("[/generate] model:", MODEL, "| USE_WEB:", USE_WEB, "| tool_choice:", JSON.stringify(req1.tool_choice));

    const resp1 = await openai.responses.create(req1);

    const raw1 = resp1.output_text || "";
    console.log("[/generate] PASSO 1 — output_text length:", raw1.length);

    if (DEBUG_RAW) {
      logLarge("RAW PASSO 1", raw1);
      const respJson = safeStringify(resp1);
      logLarge("RESPONSE JSON PASSO 1", respJson);
      const toolsUsed = detectTools(resp1);
      console.log("[/generate] PASSO 1 — tools:", toolsUsed.length ? JSON.stringify(toolsUsed) : "none");
      try {
        console.log("[/generate] PASSO 1 — usage:", JSON.stringify(resp1.usage || {}, null, 2));
      } catch {}
    }

    // Parse robusto do Passo 1
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

    let cleaned1 = normalizeQuotes(stripFences(raw1));
    let jsonStr1 = extractFirstJsonObject(cleaned1) || cleaned1;
    let obj1 = tryParse(jsonStr1);

    if (!obj1) {
      // tenta reparo leve
      const repaired = jsonStr1.replace(/,\s*([}\]])/g, "$1");
      obj1 = tryParse(repaired);
      jsonStr1 = repaired;
    }
    if (!obj1) {
      // fallback pedindo conversão para JSON
      const rehab = await openai.responses.create({
        model: MODEL,
        input: [
          { role: "system", content: "Converta o conteúdo a seguir em UM ÚNICO objeto JSON válido. Preserve chaves/valores. Saída: somente o JSON." },
          { role: "user",   content: raw1 }
        ],
        text: { format: { type: "json_object" } },
        max_output_tokens: 2000,
        temperature: 0
      });
      obj1 = JSON.parse(rehab.output_text || "{}");
    }

    obj1 = coerceArrays(obj1);
    let missing = findMissingFields(obj1);

    // ===== PASSO 2 (auto-refine) — só se ainda faltam campos =====
    if (missing.length > 0 && USE_WEB) {
      // monta queries adicionais focadas nos campos que faltam
      const targeted = [];
      if (missing.includes("funcionarios")) targeted.push(`${base} "número de funcionários" LinkedIn`);
      if (missing.includes("faturamento"))  targeted.push(`${base} faturamento 2023 OR 2024 OR receita 2023 OR 2024`);
      if (missing.includes("mapa"))         targeted.push(`"${base}" site:google.com/maps`);
      if (missing.includes("telefonepublico")) targeted.push(`site:${host} "fale conosco" OR "telefone"`);
      if (missing.includes("segmento") || missing.includes("subsegmento")) targeted.push(`site:${host} quem somos OR institucional`);
      if (missing.includes("fundacao"))     targeted.push(`${base} fundação ano`);
      if (missing.includes("erpatualouprovavel") || missing.includes("justificativaERP")) targeted.push(`${base} ERP "SAP" OR "TOTVS" OR "Oracle" OR "Senior"`);
      if (missing.includes("solucaofiscalouprovavel") || missing.includes("criteriofiscal")) targeted.push(`${base} "solução fiscal" Sovos OR Thomson OR Avalara OR Guepardo`);
      if (missing.includes("ultimas5noticias")) targeted.push(`${base} expansão OR aquisição OR investimento site:news.google.com`);
      if (missing.includes("organogramaclevel")) targeted.push(`${base} CEO CFO CTO LinkedIn`);
      if (missing.includes("powermap")) targeted.push(`${base} diretoria executiva LinkedIn`);

      // sempre garantimos que emails sejam preenchidos (mesmo sem web)
      if (missing.includes("modelodeemailti")) targeted.push(`${base} notícias recentes site:news.google.com`);
      if (missing.includes("modelodeemailfinanceiro")) targeted.push(`${base} notícias recentes site:news.google.com`);

      const systemPass2 = `
${systemBase}

### REPARO (PASSO 2)
Você deixou os seguintes campos faltando: ${missing.join(", ")}.
Abaixo há uma lista "QUERIES" de buscas curtas e específicas. 
- Você DEVE chamar "web_search" **uma vez por linha** (sem colar o prompt ou o JSON no parâmetro "query"). 
- NÃO finalize a resposta até **cobrir todos os campos faltantes** com dado factual ou estimativa **com critério explícito**.

QUERIES:
${targeted.concat(baseQueries).map(q => `- ${q}`).join("\n")}

### LEMBRETES
- "ultimas5noticias": 5 itens (≤24 meses) com {titulo, data AAAA-MM-DD, url, resumo ≤ 25 palavras}.
- Preencha SEMPRE "modelodeemailti" e "modelodeemailfinanceiro" (120–180 palavras, personalizados; terminar com CTA de 20min nesta semana).

### SAÍDA
- Somente o objeto JSON final (sem \`\`\`), com TODOS os campos do template presentes.
`.trim();

      const req2 = {
        model: MODEL,
        tools: [{ type: "web_search" }],
        tool_choice: "auto",
        input: [
          { role: "system", content: systemPass2 },
          // importante: passamos o objeto do passo 1 como contexto para "completar"
          { role: "user", content: `A seguir está o JSON atual (incompleto). COMPLETE os campos faltantes e devolva o JSON FINAL:\n\n${JSON.stringify(obj1, null, 2)}` }
        ],
        temperature: 0,
        max_output_tokens: 5000
      };

      console.log("[/generate] PASSO 2 — refinamento, campos faltando:", missing.length);
      const resp2 = await openai.responses.create(req2);

      const raw2 = resp2.output_text || "";
      console.log("[/generate] PASSO 2 — output_text length:", raw2.length);

      if (DEBUG_RAW) {
        logLarge("RAW PASSO 2", raw2);
        const respJson2 = safeStringify(resp2);
        logLarge("RESPONSE JSON PASSO 2", respJson2);
        const toolsUsed2 = detectTools(resp2);
        console.log("[/generate] PASSO 2 — tools:", toolsUsed2.length ? JSON.stringify(toolsUsed2) : "none");
        try {
          console.log("[/generate] PASSO 2 — usage:", JSON.stringify(resp2.usage || {}, null, 2));
        } catch {}
      }

      // Parse robusto Passo 2
      let cleaned2 = normalizeQuotes(stripFences(raw2));
      let jsonStr2 = extractFirstJsonObject(cleaned2) || cleaned2;
      let obj2 = tryParse(jsonStr2);
      if (!obj2) {
        const repaired2 = jsonStr2.replace(/,\s*([}\]])/g, "$1");
        obj2 = tryParse(repaired2);
        jsonStr2 = repaired2;
      }
      if (!obj2) {
        const rehab2 = await openai.responses.create({
          model: MODEL,
          input: [
            { role: "system", content: "Converta o conteúdo a seguir em UM ÚNICO objeto JSON válido. Preserve chaves/valores. Saída: somente o JSON." },
            { role: "user",   content: raw2 }
          ],
          text: { format: { type: "json_object" } },
          max_output_tokens: 2000,
          temperature: 0
        });
        obj2 = JSON.parse(rehab2.output_text || "{}");
      }
      obj2 = coerceArrays(obj2);
      // se ainda faltar algo, ao menos devolvemos o melhor que conseguiu:
      return res.json(obj2);
    }

    // Se não faltou nada após o Passo 1:
    return res.json(obj1);

  } catch (error) {
    console.error("Erro ao gerar resposta:", error);
    res.status(500).json({ error: "Erro ao gerar resposta" });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
