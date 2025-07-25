const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Configuration, OpenAIApi } = require("openai");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Simulador de banco de dados em memória (substitua pelo Supabase depois)
const searchDB = new Map(); // { site: { response: ..., timestamp: ... } }
const userQuota = new Map(); // { userId: { remaining: 5, lastReset: timestamp } }

app.post("/api/search", async (req, res) => {
  const { site, userId } = req.body;

  if (!site || !userId) {
    return res.status(400).json({ error: "Site e userId são obrigatórios." });
  }

  // Verificar quota de busca
  const userData = userQuota.get(userId) || { remaining: 5, lastReset: Date.now() };
  const now = Date.now();
  const hoursPassed = (now - userData.lastReset) / (1000 * 60 * 60);

  if (hoursPassed >= 24) {
    userData.remaining = 5;
    userData.lastReset = now;
  }

  if (userData.remaining <= 0) {
    return res.status(403).json({ error: "Limite diário de buscas atingido." });
  }

  // Verificar cache
  if (searchDB.has(site)) {
    userData.remaining -= 1;
    userQuota.set(userId, userData);
    return res.json({ source: "cache", ...searchDB.get(site) });
  }

  try {
    const prompt = `Analise o site ${site} e responda apenas com os dados: faturamento estimado, quantidade de funcionários, segmento, principais produtos ou serviços, cidade/estado da sede. Seja direto.`;

    const gptResponse = await openai.createChatCompletion({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    });

    const result = gptResponse.data.choices[0].message.content;

    const responseData = { result, timestamp: now };

    searchDB.set(site, responseData);
    userData.remaining -= 1;
    userQuota.set(userId, userData);

    res.json({ source: "gpt", ...responseData });
  } catch (error) {
    console.error("Erro no GPT:", error.response?.data || error.message);
    res.status(500).json({ error: "Erro ao consultar o ChatGPT." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor backend rodando na porta ${PORT}`);
});
