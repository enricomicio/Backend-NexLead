const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQ_TIMEOUT_MS || "55000", 10);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-2024-11-20";
const USE_WEB = (process.env.SEARCH_MODE || "none").toLowerCase() === "web";

app.post("/generate", async (req, res) => {
  try {
    const { site } = req.body;

    const prompt = `
Site informado: ${site}

Preencha exatamente este JSON (mantenha os tipos de cada campo).
Atenção: Inicie a resposta com "{" e termine com "}". Não escreva nada fora do JSON.

Regras específicas para alguns campos:
- "mapa": retorne PREFERENCIALMENTE uma URL do Google Maps da matriz. Se só tiver o endereço, tudo bem (o backend transformará em link).
- "telefonepublico": se não estiver no site institucional, pode usar o telefone do perfil oficial no Google Maps.
- "ultimas5noticias": retorne 5 itens (até 24 meses), cada um com { "titulo", "data"(AAAA-MM-DD), "url", "resumo"(≤25 palavras) }.

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
Você PODE usar web_search sempre que precisar de informação externa.

ORÇAMENTO DE BUSCA
- Use até 4 chamadas (search/open/find). 
- Se, após 4 chamadas, ainda faltar QUALQUER campo NÃO-ESTIMÁVEL, você PODE usar até 2 chamadas extras (total 6) para concluir SOMENTE esses factuais.

ORDEM DE TRABALHO (pare quando TODOS os NÃO-ESTIMÁVEIS estiverem preenchidos)
1) Confirmar NOME OFICIAL e normalizar o domínio a partir do site informado (páginas “Sobre/Quem Somos”, rodapé).
2) PREENCHER FACTUAIS (NÃO-ESTIMÁVEIS): 
   • Cnpj (MATRIZ)
   • telefonepublico (telefone que consta no site institucional; se não houver no site, use o telefone do Perfil da Empresa no Google Maps)
   • Mapa (URL do Google Maps da MATRIZ)
   • Localização (UF da matriz)
   • segmento e Subsegmento
   • Fundação (ano)
   Fontes preferidas: site institucional e páginas oficiais; em seguida, Google Maps (perfil da empresa), mídia/portais confiáveis. 
   Não use “em verificação” enquanto houver orçamento e resultados relevantes a abrir.
3) "ultimas5noticias": montar 5 itens (até 24 meses) sobre crescimento/expansão, cada item = { "titulo", "data"(AAAA-MM-DD), "url", "resumo"(≤25 palavras) }.
4) CAMPOS ESTIMÁVEIS (quando não houver fonte direta): funcionarios, faturamento, erpatualouprovavel, solucaofiscalouprovavel, investimentoemti. 
   Estime com critério explícito (porte, setor, presença geográfica, maturidade digital, headcount público/LinkedIn, benchmarks). 
   Registre o critério em "justificativaERP", "criteriofiscal" e em "investimentoemti" (STRING no formato: “R$ X – Critério: ...”).
   Campo "investimentoemti": Se houver benchmark setorial confiável, use-o (cite o critério). Caso contrário, use 2% do Faturamento estimado ou encontrado. Ex.: “R$ 100 mi/ano – Critério: 2% de R$ 100 mi, que seria R$ 2 mi de investimento anual em TI (bench genérico)”.
   Campo "faturamento": Se houver valor confiável (relatório anual, imprensa, cadastro público), retorne “R$ X/ano (AAAA) – fonte: …”. Se NÃO houver fonte direta: ESTIME com critério explícito. Use uma ou mais heurísticas: (a) Funcionários × receita/func do setor, (b) notícias com faixa de receita, (c) comparação com pares do mesmo porte/segmento/local).
   Campo "solucaofiscalouprovavel": Escolha entre { Thomson Reuters, Sovos, Solutio, Avalara, Guepardo, 4Tax, BPO fiscal, planilhas/house } com base em porte/ERP/segmento/custo/pesquisas na internet; explique em “criteriofiscal”.
   Campo "erpatualouprovavel": escolha entre { SAP S/4HANA, SAP ECC, SAP Business One, Oracle NetSuite, TOTVS Protheus, Senior, Sankhya, Omie, “desenvolvimento próprio”, “outro ERP de nicho” } com base em porte/complexidade/segmento/ecossistema do país/noticias/pesquisa na internet; explique em “justificativaERP”.
   Campo "ofensoremti": principal “pedra no sapato” interna para NÃO investir em TI (ex.: congelamento orçamentário, dívida técnica crítica, backlog, compliance/risco, prioridade em core, restrição de CAPEX/OPEX). 1 frase curta.
   Campo "Compelling": razão convincente, orientada a resultado (ROI, risco evitado, eficiência, prazo regulatório etc.) que cria urgência. 1–2 frases, ligada às notícias/dor/faturamento atual. 

REGRAS DE SAÍDA (TIPOS E FORMATO)
- Saída: SOMENTE o JSON final (um único objeto). Comece com "{" e termine com "}".
- Datas AAAA-MM-DD. 
- E-mails: texto completo conforme modelo especificado.
`.trim();

    // === Chamada principal (igual ao que funcionava) ===
    const oaiReq = {
      model: MODEL,
      tools: USE_WEB ? [{ type: "web_search" }] : [],
      tool_choice: USE_WEB ? "auto" : "none",
      input: [
        { role: "system", content: systemMsg },
        { role: "user",   content: prompt }
      ],
      max_output_tokens: 4000
    };

    if (!USE_WEB) {
      // JSON mode SÓ quando NÃO usar web_search
      oaiReq.text = { format: { type: "json_object" } };
    }

  // chamada ao OpenAI com timeout controlado (substitui a linha única)
let response;
try {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);

  try {
    response = await openai.responses.create(oaiReq, {
      signal: ac.signal,
      timeout: REQUEST_TIMEOUT_MS + 1000
    });
  } finally {
    clearTimeout(timer);
  }
} catch (err) {
  const status = err?.status && Number.isInteger(err.status) ? err.status : 502;
  const msg = err?.message || "Falha ao chamar o provedor de IA";
  console.error("OpenAI error:", status, msg);

  return res.status(status).json({
    error: "Upstream error",
    detail: msg,
    hint: "Tente novamente em instantes. Se persistir, reduza buscas ou desative web_search temporariamente."
  });
}


    // ===================== PARSE ROBUSTO + FALLBACK “LOSSLESS” =====================
    const raw = response.output_text || "";

    // helpers
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

    // 4) fallback final: reformatar em JSON usando JSON mode (SEM web_search), preservando conteúdo
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
          text: { format: { type: "json_object" } },
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
    // ===================== FIM DO PARSE ROBUSTO =====================

    // ===================== PÓS-PROCESSAMENTOS CIRÚRGICOS =====================
    // 1) Garantir que "mapa" seja URL do Google Maps
    const toMapsUrl = (query) =>
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

    const loc = obj["localização"] || obj.localização || obj.localizacao || "";
    if (!obj.mapa || !/^https?:\/\//i.test(obj.mapa)) {
      const baseQuery =
        (obj.mapa && obj.mapa.trim()) ||
        [obj.nomedaempresa, loc].filter(Boolean).join(", ");
      if (baseQuery) obj.mapa = toMapsUrl(baseQuery);
    }

    // 2) Garantir e-mails preenchidos (fallback local ~150 palavras)
    const needTI = !obj.modelodeemailti || obj.modelodeemailti.trim().length < 80;
    const needCFO = !obj.modelodeemailfinanceiro || obj.modelodeemailfinanceiro.trim().length < 80;

    const empresa = obj.nomedaempresa || "sua empresa";
    const segmento = obj.segmento || "seu segmento";
    const dor = obj.principaldordonegocio || "redução de custos, riscos e ineficiências";
    const compelling = obj.Compelling || "potencial de ROI, eficiência operacional e conformidade";

    const genEmail = (alvo) => {
      const assunto =
        alvo === "TI"
          ? `Alinhamento rápido sobre ganhos em TI (${empresa})`
          : `Otimização de OPEX/TCO em ${empresa}`;
      const foco =
        alvo === "TI"
          ? "arquitetura, integração e confiabilidade"
          : "viabilidade financeira, TCO e impacto no EBITDA";
      return (
`ASSUNTO: ${assunto}

Olá,

Sou [Seu Nome] e trabalho com iniciativas para acelerar resultados em empresas do segmento de ${segmento}. Analisando o cenário da ${empresa}, identifiquei oportunidades ligadas a ${dor}, com ${compelling}. Nossa abordagem é pragmática e orientada a metas de curto prazo, sem projetos intermináveis.

Em uma conversa de 20 minutos, posso compartilhar benchmarks e um esboço de iniciativa com foco em ${foco}, incluindo estimativas de payback e próximos passos. Se fizer sentido, avançamos para um estudo mais detalhado; se não, você já sai com referências úteis para o planejamento.

Tem agenda esta semana para um bate-papo rápido (20 min)? Posso adaptar ao melhor horário.

Atenciosamente,
[Seu Nome]
[Seu Telefone]`
      );
    };

    if (needTI)  obj.modelodeemailti = genEmail("TI");
    if (needCFO) obj.modelodeemailfinanceiro = genEmail("CFO");
    // =================== FIM PÓS-PROCESSAMENTOS ===================

    return res.json(obj);

  } catch (error) {
    console.error("Erro ao gerar resposta:", error);
    res.status(500).json({ error: "Erro ao gerar resposta" });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
