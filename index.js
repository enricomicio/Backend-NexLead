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
4) CAMPOS ESTIMÁVEIS (quando não houver fonte direta): Funcionarios, Faturamento, erpatualouprovavel, solucaofiscalouprovavel, investimentoemti. 
   Estime com critério explícito (porte, setor, presença geográfica, maturidade digital, headcount público/LinkedIn, benchmarks). 
   Registre o critério em "justificativaERP", "criteriofiscal" e em "investimentoemti" (STRING no formato: “R$ X – Critério: ...”).

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
- Saída: SOMENTE o JSON final.




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
