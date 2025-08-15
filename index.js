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

app.post("/generate", async (req, res) => {
 try {
  const { site } = req.body;

const prompt = `
Você é um assistente de inteligência comercial para o segmento de tecnologia (ERP, analíticos, banco de dados, inteligência artificial) de empresas como SAP, Oracle, Totvs, Senior, Omie e semelhantes. Analise o site "${site}" e me responda o seguinte JSON estruturado, com informações extremamente precisas e nada mais:

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


  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
    });

    const generatedText = completion.choices[0].message.content;
    res.json({ result: generatedText });
  } catch (error) {
    console.error("Erro ao gerar resposta:", error);
    res.status(500).json({ error: "Erro ao gerar resposta" });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
