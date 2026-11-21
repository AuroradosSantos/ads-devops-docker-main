const express = require("express");
const mysql = require("mysql2/promise");
const { createClient } = require("redis");

const app = express();
const port = Number(process.env.PORT || 3000);
const cacheSeconds = Number(process.env.CACHE_TTL_SECONDS || 60);

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "mysql-db",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "senha123",
  database: process.env.MYSQL_DATABASE || "loja",
  waitForConnections: true,
  connectionLimit: 10,
});

const redis = createClient({
  url: process.env.REDIS_URL || "redis://redis:6379",
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 500, 5000),
  },
});

redis.on("error", (error) => {
  console.error("Erro na conexão com Redis:", error.message);
});

async function getCached(key) {
  if (!redis.isReady) return null;
  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error(`Erro ao ler cache ${key}:`, error.message);
    return null;
  }
}

async function setCached(key, value) {
  if (!redis.isReady) return;
  try {
    await redis.set(key, JSON.stringify(value), { EX: cacheSeconds });
  } catch (error) {
    console.error(`Erro ao gravar cache ${key}:`, error.message);
  }
}

app.get("/live", (req, res) => res.status(200).json({ status: "ok" }));

app.get("/health", async (req, res) => {
  const dependencies = { mysql: "ok", redis: "ok" };

  try {
    await pool.query("SELECT 1");
  } catch (error) {
    dependencies.mysql = "indisponível";
    console.error("Verificação do MySQL falhou:", error.message);
  }

  try {
    if (!redis.isReady) throw new Error("cliente Redis não está pronto");
    await redis.ping();
  } catch (error) {
    dependencies.redis = "indisponível";
    console.error("Verificação do Redis falhou:", error.message);
  }

  const healthy = Object.values(dependencies).every((status) => status === "ok");
  res.status(healthy ? 200 : 503).json({ status: healthy ? "ok" : "degradado", dependencies });
});

app.get("/categorias", async (req, res) => {
  const cached = await getCached("categorias");
  if (cached) return res.json(cached);

  try {
    const [rows] = await pool.query("SELECT * FROM categorias");
    await setCached("categorias", rows);
    res.json(rows);
  } catch (error) {
    console.error("Erro ao consultar categorias:", error.message);
    res.status(503).json({ erro: "Não foi possível consultar as categorias." });
  }
});

app.get("/produtos", async (req, res) => {
  const cached = await getCached("produtos");
  if (cached) return res.json(cached);

  try {
    const [rows] = await pool.query(`
      SELECT p.id, p.nome, p.preco, p.quantidade_estoque, c.nome AS categoria
      FROM produtos p
      JOIN categorias c ON p.categoria_id = c.id
    `);
    await setCached("produtos", rows);
    res.json(rows);
  } catch (error) {
    console.error("Erro ao consultar produtos:", error.message);
    res.status(503).json({ erro: "Não foi possível consultar os produtos." });
  }
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Servidor rodando na porta ${port}`);
});

redis.connect().catch((error) => {
  console.error("Não foi possível iniciar a conexão com Redis:", error.message);
});

async function shutdown() {
  server.close();
  await Promise.allSettled([pool.end(), redis.isOpen ? redis.quit() : Promise.resolve()]);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
