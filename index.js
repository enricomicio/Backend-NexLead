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

app.post("/generate", async (req, res) => {
 try {
  const { site } = req.body;

const prompt = `

Site informado: ${site}

Preencha exatamente este JSON (mantenha os tipos de cada campo). 
**Atenção**: Inicie a resposta com "{" e termine com "}". Não escreva nada fora do JSON.

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
Você é um agente que produz APENAS JSON válido (sem markdown nem comentários).

USO DE BUSCA (OBRIGATÓRIO)
- Você DEVE usar web_search/open/find sempre que precisar de informação externa para preencher campos NÃO-ESTIMÁVEIS, até que estejam preenchidos ou até esgotar o orçamento de busca.
- NÃO preencha "em verificação" enquanto houver orçamento e resultados relevantes a abrir.

ORÇAMENTO DE BUSCA
- Use até 10 chamadas (search/open/find).
- Se, após 10 chamadas, ainda faltar QUALQUER campo NÃO-ESTIMÁVEL, você PODE usar até 5 chamadas extras (total 15) para concluir SOMENTE esses factuais.

ORDEM DE TRABALHO (pare quando TODOS os NÃO-ESTIMÁVEIS estiverem preenchidos)
1) Confirmar NOME OFICIAL e normalizar o domínio a partir do site informado (páginas “Sobre/Quem Somos”, rodapé).
2) PREENCHER FACTUAIS (NÃO-ESTIMÁVEIS): 
   • Cnpj (MATRIZ)
   • telefonepublico (telefone que consta no site institucional; se não houver no site, use o telefone do Perfil da Empresa no Google Maps)
   • Mapa (URL clicável do Google Maps da MATRIZ)
   • Localização (UF da matriz)
   • segmento e Subsegmento
   • Fundação (ano)
   Fontes preferidas: site institucional e páginas oficiais; depois Google Maps (perfil da empresa); depois mídia/portais confiáveis. 
3) "ultimas5noticias": montar 5 itens (até 24 meses) sobre crescimento/expansão, cada item = { "titulo", "data"(AAAA-MM-DD), "url", "resumo"(≤25 palavras) }.
4) CAMPOS ESTIMÁVEIS (quando não houver fonte direta): funcionarios, faturamento, erpatualouprovavel, solucaofiscalouprovavel, investimentoemti. 
   Estime com critério explícito (porte, setor, presença geográfica, maturidade digital, headcount público/LinkedIn, benchmarks). 
   Registre o critério em "justificativaERP", "criteriofiscal" e em "investimentoemti" (STRING no formato: “R$ X – Critério: ...”).
   "investimentoemti": benchmark setorial; se não houver, 2% do faturamento.
   "faturamento": se houver fonte confiável, “R$ X/ano (AAAA) – fonte: …”; se não, ESTIME com critério.
   "solucaofiscalouprovavel": escolha entre { Thomson Reuters, Sovos, Solutio, Avalara, Guepardo, 4Tax, BPO fiscal, planilhas/house } e explique em “criteriofiscal”.
   "erpatualouprovavel": escolha entre { SAP S/4HANA, SAP ECC, SAP Business One, Oracle NetSuite, TOTVS Protheus, Senior, Sankhya, Omie, “desenvolvimento próprio”, “outro ERP de nicho” } e explique em “justificativaERP”.
   "ofensoremti": 1 frase curta (ex.: restrição de CAPEX/OPEX).
   "Compelling": 1–2 frases ligadas a ROI/risco/eficiência/notícias.

REGRAS DE SAÍDA (TIPOS E FORMATO)
- Saída: SOMENTE o JSON final (um único objeto).
- Datas AAAA-MM-DD. 
- E-mails: texto completo conforme modelo especificado.
`.trim();


const oaiReq = {
  model: MODEL,
  tools: USE_WEB ? [{ type: "web_search" }] : [],
  // 👉 formato recomendado da Responses API: system em "instructions", pedido em "input"
  instructions: systemMsg,
  input: prompt,
  temperature: 0,
  max_output_tokens: 4000
};

// JSON mode SÓ quando NÃO estiver usando web_search (limitação da API)
if (!USE_WEB) {
  oaiReq.text = { format: { type: "json_object" } };
}

const response = await openai.responses.create(oaiReq);

// ===================== PARSE ROBUSTO + FALLBACK “LOSSLESS” =====================
const raw = response.output_text || "";

// helpers enxutos
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
  return null; // sem fechamento
};

// 1) limpar e extrair só o 1º objeto balanceado
let cleaned = normalizeQuotes(stripFences(raw));
let jsonStr = extractFirstJsonObject(cleaned) || cleaned;

// 2) parse direto
let obj = tryParse(jsonStr);

// 3) pequeno reparo (vírgula antes de } ou ])
if (!obj) {
  const repaired = jsonStr.replace(/,\s*([}\]])/g, "$1");
  obj = tryParse(repaired);
  jsonStr = repaired;
}

// 4) fallback final: reformatar em JSON usando JSON mode (SEM web_search),
//    PRESERVANDO 100% DO CONTEÚDO (lossless)
if (!obj) {
  try {
    const rehab = await openai.responses.create({
      model: MODEL,
      input: [
        {
          role: "system",
          content:
            "TAREFA: Devolver o MESMO conteúdo recebido em UM ÚNICO objeto JSON válido.\n" +
            "REGRAS CRÍTICAS (obrigatórias):\n" +
            "1) Preserve TODAS as chaves, objetos e arrays existentes; NÃO remova nada.\n" +
            "2) NÃO resuma e NÃO reescreva textos; apenas corrija aspas/virgulas/fechamentos.\n" +
            "3) Se houver conteúdo fora do objeto JSON, mova-o para o lugar correto mantendo o texto.\n" +
            "4) Se algum campo estiver truncado, mantenha exatamente como veio (NÃO apague nem resuma).\n" +
            "5) Saída: SOMENTE o objeto JSON (sem markdown, sem texto fora do {})."
        },
        { role: "user", content: raw }
      ],
      text: { format: { type: "json_object" } }, // JSON mode permitido aqui
      max_output_tokens: 2000,
      temperature: 0
    });
    const fixed = rehab.output_text || "{}";
    obj = JSON.parse(fixed);
  } catch (e) {
    console.error("Resposta não-JSON:", raw.slice(0, 500));
    return res.status(502).json({ error: "Modelo não retornou JSON válido", raw: raw.slice(0, 500) });
  }
}
// ===================== FIM DO PARSE ROBUSTO + FALLBACK =====================

return res.json(obj);
          

    
  } catch (error) {
    console.error("Erro ao gerar resposta:", error);
    res.status(500).json({ error: "Erro ao gerar resposta" });
  }

});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

