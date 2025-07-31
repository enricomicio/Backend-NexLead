// Backend principal com autenticação, banco e cache de resultados
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { Configuration, OpenAIApi } = require('openai');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'segredo';
const CACHE_FILE = path.join(__dirname, 'cache.json');
let cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE)) : {};

// Configuração OpenAI
const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openai = new OpenAIApi(configuration);

// Middleware de autenticação
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// Simula usuários (em produção usar banco real)
const users = [{ id: 1, username: "admin", password: "admin123", isAdmin: true, searches: 0 }];

// Login e geração de token
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(403).json({ message: "Usuário ou senha inválidos" });
  const token = jwt.sign({ username: user.username, id: user.id }, SECRET);
  res.json({ token });
});

// Endpoint principal de busca
app.post('/buscar', authenticateToken, async (req, res) => {
  const { site } = req.body;
  const user = users.find(u => u.username === req.user.username);

  if (!site) return res.status(400).json({ error: "Site é obrigatório" });
  if (user.searches >= 100) return res.status(403).json({ error: "Limite de buscas atingido" });
  if (cache[site]) return res.json({ fromCache: true, ...cache[site] });

  const prompt = `Com base no site ${site}, gere um resumo JSON com: faturamento, funcionarios, ERP, fiscal, localização.`;

  try {
    const completion = await openai.createChatCompletion({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
    });

    const resultado = JSON.parse(completion.data.choices[0].message.content);

    cache[site] = resultado;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));

    user.searches += 1;

    res.json({ fromCache: false, ...resultado });
  } catch (error) {
    console.error("Erro com OpenAI:", error.message);
    res.status(500).json({ error: "Erro ao consultar o ChatGPT" });
  }
});

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
