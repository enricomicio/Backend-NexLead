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

Se faltar informação, escreva "não encontrado".
Responda APENAS com um JSON válido (sem markdown, sem texto fora do JSON).

{
  "nomedaempresa": "Razão social",
  "Cnpj": "CNPJ da Matriz",
  "Mapa": "link clicavel para a localização da matriz no Brasil via google maps",
  "telefonepublico": "Telefone principal publico do site",
  "segmento": "Segmento principal",
  "Fundação": "Ano de fundaçao",
  "Subsegmento": "Subsegmento",
  "criteriofiscal": "Critério usado para indicar a solução fiscal atual da empresa",
  "Funcionarios": "Numero ou estimativa de funcionários da empresa",
  "Faturamento": "Faturamento anual atual ou estimado com base em porte, segmento, presença e funcionários",
  "Localização": "Estado da matriz",
  "erpatualouprovavel": "ERP atual ou estimado com base em dados públicos ou inferência por perfil",
  "justificativaERP": "Critério utilizado para indicação do ERP", 
  "solucaofiscalouprovavel": "Solução fiscal atual ou estimada com base no perfil, porte, segmento",
  "principaldordonegocio": "Maior desafio do negócio segundo seu perfil",
  "investimentoemti": "Estimativa anual de investimento em TI, e o critério utilizado para chegar a esse numero",
  "ofensoremti": "Principal barreira interna para investimentos em TI",
  "modelodeemailti": "Email Open-Door para o CIO com base em perfil e dores",
  "modelodeemailfinanceiro": "Email Open-Door para CFO com foco financeiro e eficiência",
  "ultimas5noticias": "Preciso que voce coloque as 5 ultimas noticias altamente relevantes que indiquem que essa empresa esta crescendo e precisara investir em tecnologia para sustentar esse crescimento. Preciso que voce coloque apenas o resumo da noticia em no máximo 25 palavras, e a data dela. Essas noticias precisam ser clicáveis, ou seja, clicando voce é direcionado para a noticia completa",
  "Compelling": "Fator (compelling) que mais motivaria investimento em tecnologia",
  "gatilhocomercial": "Gatilho comercial mais relevante para abordagem",  
  "site": "${site}",
"organogramaclevel": [
  { 
  "nome": "Nome do CEO da empresa",
  "Cargo": "CEO"
 },
  { 
  "nome": "Nome do CFO da empresa",
  "Cargo": "CFO"
 },
  { 
  "nome": "Nome do CTO da empresa",
  "Cargo": "CTO"
 },
  { 
  "nome": "Nome do COO da empresa",
  "Cargo": "COO"
 }
],




"powermap": [
  {
    "nome": "Nome do decisor final em TI",
    "cargo": "Cargo do decisor",
    "classificacao": "Decisor", 
    "justificativa": "Por que é o decisor"
  },
{
    "nome": "Nome do influenciador em TI",
    "cargo": "Cargo do influenciador",
    "classificacao": "Influenciador", 
    "justificativa": "Por que ele é o influenciador"
  },
{
    "nome": "Nome da barreira",
    "cargo": "Cargo da barreira",
    "classificacao": "Barreira", 
    "justificativa": "Por que essa pessoa é considerada uma barreira para investimento em TI"
}
],







}

Se não encontrar um dado e também não for possível estimar, preencha com "não encontrado".
`;



const systemMsg = `
Você é um agente que produz APENAS JSON válido (sem markdown, sem comentários).
Você PODE usar web_search sempre que precisar de informação externa.
Cada ação (search, open_page, find_in_page) conta 1 chamada. Use até 4 chamadas no máximo, com inteligência.

PRIORIDADE (nesta ordem):
1) Confirmar o NOME OFICIAL da empresa a partir do site informado (páginas “Sobre/Quem Somos” e rodapé).
2) Campos FACTUAIS NÃO-ESTIMÁVEIS (devem vir de fontes abertas que você abriu):
   - "Cnpj" (matriz)
   - "telefonepublico" (o telefone que CONSTA no site institucional)
   - "Mapa" (URL do Google Maps da MATRIZ)
   - "Localização" (UF da matriz)
   - "segmento" e "Subsegmento"
   - "Fundação"
   Regra: preferir site institucional e fontes oficiais; em seguida, mídia/portais confiáveis.
3) "ultimas5noticias": 5 itens dos últimos 24 meses sobre crescimento/expansão (ex.: investimentos, contratações, M&A, novos mercados/produtos),
   cada item = { "titulo", "data" (AAAA-MM-DD), "url", "resumo" (≤ 25 palavras) }.
4) Demais campos:
   - ESTIMÁVEIS: "Funcionarios", "Faturamento", "erpatualouprovavel", "solucaofiscalouprovavel", "investimentoemti".
     Quando não houver fonte direta, ESTIME com critério explícito (porte, setor, presença geográfica, maturidade digital, headcount público — ex. LinkedIn, benchmarks).
     Explique o critério em "justificativaERP", "criteriofiscal" e dentro de "investimentoemti" (deve ser UMA STRING no formato: R$ X – Critério:...  Nunca retorne objeto aqui).
   - NÃO-ESTIMÁVEIS (da etapa 2): se, mesmo após usar seu orçamento de chamadas, não localizar valor confiável, NÃO use “não encontrado”.
     Em vez disso, retorne "em verificação" nesse campo.
5) Dados comerciais (estimáveis):
  -"principaldordonegocio" (Em poucas palavras descrever as principais dores da empresa / segmento)
  -"ofensoremti" (Principal ofensor para essa empresa não investir em TI)
  -"modelodeemailti" (Desenvolver e-mail persuasivo com base em todos os dados levantados nesse prompt, destinado ao CIO como abertura de portas)
  -"modelodeemailfinanceiro" (Desenvolver e-mail persuasivo com base em todos os dados levantados nesse prompt, destinado ao CFO como abertura de portas)
  -"Compelling" (Descrever o principal compelling para usar com esse prospect)
  -"gatilhocomercial" (Descrever principal gatilho comercial para chamar a atenção dessa empresa)


REGRAS DE SAÍDA:
- Nunca escreva "não encontrado".
- Campos NÃO-ESTIMÁVEIS: valor real encontrado OU "em verificação".
- Campos ESTIMÁVEIS: valor real OU estimado com critério explícito (nunca vazio).
- Arrays SEMPRE como arrays (mesmo que vazios): "ultimas5noticias", "organogramaclevel", "powermap".
- Datas AAAA-MM-DD. Português do Brasil. Responda somente com o JSON final.



`.trim();


const oaiReq = {
  model: MODEL,
  tools: USE_WEB ? [{ type: "web_search" }] : [],
  input: [
    { role: "system", content: systemMsg },
    { role: "user",   content: prompt }
  ]
};


if (!USE_WEB) {
  oaiReq.text = { format: { type: "json_object" } };
}


const response = await openai.responses.create(oaiReq);


let raw = response.output_text || "{}";


let obj;
try {
  obj = JSON.parse(raw);
} catch (e1) {
  const cleaned = raw.replace(/^\s*```json\s*|\s*```\s*$/g, "").trim();
  try {
    obj = JSON.parse(cleaned);
  } catch (e2) {
    console.error("Resposta não-JSON:", raw.slice(0, 300));
    return res.status(502).json({ error: "Modelo não retornou JSON válido", raw: raw.slice(0,300) });
  }
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
