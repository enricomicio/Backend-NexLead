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

Preencha exatamente este JSON (mantenha os tipos de cada campo):

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
   • Mapa (URL clicável do Google Maps da MATRIZ)
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



COMO BUSCAR (padrões de consulta e inspeção de página)
- Para telefone/contato no SITE: 
  search: "site:{domínio} (contato OR 'fale conosco' OR atendimento OR telefone OR contato telefone)"
  Dentro da página aberta, procure por: "telefone", "tel", "contato", "atendimento", "sac".
- Para CNPJ:
  search: "site:{domínio} (CNPJ OR 'dados legais' OR 'política de privacidade')"
  Se não achar no site, search: "CNPJ \"{razão social}\" matriz"
  Confirme por consistência de razão social e endereço.
- Para Mapa (MATRIZ):
  search: "site:google.com/maps {razão social} {cidade/UF}" 
  Pegue a URL do perfil oficial da empresa; evite agregadores de mapas de terceiros.
- Para Segmento/Subsegmento/Fundação:
  search: "site:{domínio} (sobre OR 'quem somos' OR história OR institucional)"
- Para notícias:
  search: "{razão social} investimentos OR expansão OR contratações OR aquisição OR 'novo mercado'"

REGRAS DE SAÍDA (TIPOS E FORMATO)
- Nunca escreva "não encontrado".
- Campos NÃO-ESTIMÁVEIS: valor real encontrado OU, somente após esgotar o orçamento, "em verificação".
- Campos ESTIMÁVEIS: valor real OU valor estimado com critério (nunca vazio).
- Tipos obrigatórios:
  • STRING (nunca objeto): "nomedaempresa","Cnpj","Mapa","telefonepublico","segmento","Fundação","Subsegmento","criteriofiscal","Funcionarios","Faturamento","Localização","erpatualouprovavel","justificativaERP","solucaofiscalouprovavel","principaldordonegocio","investimentoemti","ofensoremti","modelodeemailti","modelodeemailfinanceiro","Compelling","gatilhocomercial","site".
  • ARRAYS de objetos: 
    - "ultimas5noticias": [{ "titulo","data","url","resumo" }]
    - "organogramaclevel": [{ "nome","Cargo" }]
    - "powermap": [{ "nome","cargo","classificacao","justificativa" }]
- Datas AAAA-MM-DD. 
E-MAILS (modelodeemailti/modelodeemailfinanceiro): TEXTO COMPLETO, formato:
  "ASSUNTO: <linha>"
  <linha em branco>
  <corpo 2–4 parágrafos, 120–180 palavras, personalizado com nomedaempresa/segmento/notícias/compelling/dor>
  <linha em branco>
  "Atenciosamente,
  [Seu Nome]
  [Seu Telefone]"
- Saída: SOMENTE o JSON final.
- Inclua um CTA claro para uma conversa de 20 minutos nesta semana.

- Saída: SOMENTE o JSON final.




`.trim();


const oaiReq = {
  model: MODEL,
  tools: USE_WEB ? [{ type: "web_search" }] : [],
  input: [
    { role: "system", content: systemMsg },
    { role: "user",   content: prompt }
  ],
  // ✅ ajuste 1: dar fôlego para não truncar o JSON
  max_output_tokens: 4000
};


if (!USE_WEB) {
  oaiReq.text = { format: { type: "json_object" } };
}


const response = await openai.responses.create(oaiReq);


// ===================== ajuste 2: PARSE ROBUSTO + FALLBACK =====================
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

// 4) fallback final: reformatar em JSON usando JSON mode (SEM web_search)
if (!obj) {
  try {
    const rehab = await openai.responses.create({
      model: MODEL,
      input: [
        { role: "system", content: "Converta o conteúdo a seguir em UM ÚNICO objeto JSON válido. Responda SOMENTE com o objeto (sem markdown)." },
        { role: "user",   content: raw }
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
// ===================== FIM DO PARSE ROBUSTO =====================

return res.json(obj);
          

    
  } catch (error) {
    console.error("Erro ao gerar resposta:", error);
    res.status(500).json({ error: "Erro ao gerar resposta" });
  }

});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
