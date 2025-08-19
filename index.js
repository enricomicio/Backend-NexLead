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
Use a ferramenta web_search quando precisar de fatos recentes.
Responda APENAS com um JSON válido (sem markdown). No máximo 2 buscas.
Para "ultimas5noticias", traga 5 itens { "titulo","data","url","resumo" (<=25 palavras) }.
Se não souber algum campo, use "não encontrado".
O site informado serve só para confirmar o nome correto da empresa.
`.trim();

const response = await openai.responses.create({
  model: MODEL,
  tools: USE_WEB ? [{ type: "web_search" }] : [],
text: { format: { type: "json_object" } } ,                
  input: [
    { role: "system", content: systemMsg },
    { role: "user", content: prompt }
  ]
});


const raw = response.output_text || "{}";

let obj;
try {
  obj = JSON.parse(raw);                            
} catch (e) {
  console.error("Resposta não-JSON:", raw.slice(0, 300));
  return res.status(502).json({ error: "Modelo não retornou JSON" });
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
