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

// === DEBUG: deixe true para sempre logar; mude para false se quiser silenciar ===
const DEBUG_RAW = true;

// Helpers de debug para logs grandes e detecção de ferramentas
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

app.post("/generate", async (req, res) => {
  try {
    const { site } = req.body;

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

    const systemMsg = `
Você é um agente que produz APENAS JSON válido (sem markdown, sem comentários, sem preâmbulos).
Use EXATAMENTE as chaves do template acima (inclusive acentos, ex.: "localização").

### REGRAS CRÍTICAS DE BUSCA (NÃO DESCUMPRA)
- Ao chamar web_search, NUNCA envie o prompt completo ou o JSON no campo "query".
- Cada query deve ter de 3 a 12 palavras, específica por tópico, por exemplo:
  • "site:${site} contato telefone"
  • "site:${site} cnpj"
  • "site:google.com/maps {razão social} {cidade} {UF}"
  • "site:${site} quem somos"
  • "site:${site} política de privacidade"
  • "{razão social} faturamento 2023"
  • "{razão social} número de funcionários"
  • "{razão social} ERP" / "{razão social} sistema fiscal"
  • "{razão social} notícias expansão aquisição investimento"
- Faça buscas MÚLTIPLAS e independentes para cobrir os fatos essenciais.

### COBERTURA DE TODOS OS CAMPOS (OBRIGATÓRIA)
1) FACTUAIS (preencha com fonte confiável; se não houver, esgote o orçamento antes de desistir):
   - cnpj (matriz)
   - telefonepublico (telefone institucional)
   - mapa (URL do Google Maps da MATRIZ; se não achar, pode ser endereço)
   - localização (UF/cidade da matriz)
   - segmento e subsegmento
   - fundacao (ano)
2) NOTÍCIAS:
   - "ultimas5noticias": 5 itens (≤24 meses) no formato { "titulo","data"(AAAA-MM-DD),"url","resumo"(≤25 palavras) }.
3) ESTIMÁVEIS (quando não houver fonte direta, estimar COM CRITÉRIO EXPLÍCITO):
   - funcionarios, faturamento, investimentoemti (usar benchmark setorial; se indisponível, 2% do faturamento)
   - erpatualouprovavel (ex.: SAP/TOTVS/Senior/etc.) + justificativaERP
   - solucaofiscalouprovavel (ex.: Thomson Reuters/Sovos/Avalara/etc.) + criteriofiscal
4) E-MAILS (SEMPRE PREENCHER):
   - modelodeemailti e modelodeemailfinanceiro: 120–180 palavras, personalizar com nomedaempresa/segmento/notícias/dor/compelling; terminar com CTA claro para conversa de 20 minutos nesta semana.

### SAÍDA
- Entregue SOMENTE o objeto JSON final, sem texto antes/depois e sem blocos \`\`\`.
- Se um fato não existir publicamente após esgotar a busca, preencha com melhor estimativa e explique o critério no próprio campo relacionado (justificativa/criterio).
`.trim();

    const oaiReq = {
      model: MODEL,
      tools: USE_WEB ? [{ type: "web_search" }] : [],
      tool_choice: USE_WEB ? { type: "web_search" } : "none",
      input: [
        { role: "system", content: systemMsg },
        { role: "user",   content: prompt }
      ],
      max_output_tokens: 4000,
      temperature: 0
    };

    // logs úteis iniciais
    console.log("[/generate] site:", site);
    console.log("[/generate] model:", MODEL, "| USE_WEB:", USE_WEB, "| tool_choice:", JSON.stringify(oaiReq.tool_choice));

    const response = await openai.responses.create(oaiReq);

    // ===== LOG DO RAW E DA RESPOSTA COMPLETA =====
    const debug = DEBUG_RAW || req.query?.debug === "1" || req.body?.debug === true;

    const raw = response.output_text || "";
    console.log("[/generate] output_text length:", raw.length);

    if (debug) {
      logLarge("RAW", raw); // texto completo que o modelo devolveu
      const respJson = safeStringify(response);
      logLarge("RESPONSE JSON", respJson); // estrutura completa (truncada se enorme)
      const toolsUsed = detectTools(response);
      console.log("[/generate] tools detected:", toolsUsed.length ? JSON.stringify(toolsUsed) : "none");
      try {
        console.log("[/generate] usage:", JSON.stringify(response.usage || {}, null, 2));
      } catch {}
    }

    // ===== PARSE ROBUSTO (aceita preâmbulos, cercas ```json etc.) =====
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

    let cleaned = normalizeQuotes(stripFences(raw));
    let jsonStr = extractFirstJsonObject(cleaned) || cleaned;
    let obj = tryParse(jsonStr);

    if (!obj) {
      const repaired = jsonStr.replace(/,\s*([}\]])/g, "$1");
      obj = tryParse(repaired);
      jsonStr = repaired;
    }

    // Fallback: pedir para o modelo reformatar em JSON válido (sem web_search)
    if (!obj) {
      const rehab = await openai.responses.create({
        model: MODEL,
        input: [
          {
            role: "system",
            content:
              "Converta o conteúdo a seguir em UM ÚNICO objeto JSON válido. " +
              "Preserve todas as chaves/valores. Não resuma. Saída: somente o JSON."
          },
          { role: "user", content: raw }
        ],
        text: { format: { type: "json_object" } },
        max_output_tokens: 2000,
        temperature: 0
      });
      const fixed = rehab.output_text || "{}";
      obj = JSON.parse(fixed);
    }

    return res.json(obj);

  } catch (error) {
    console.error("Erro ao gerar resposta:", error);
    res.status(500).json({ error: "Erro ao gerar resposta" });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

