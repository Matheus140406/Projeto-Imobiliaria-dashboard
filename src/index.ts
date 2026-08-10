import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

dotenv.config();

import { carregarEnv } from "./lib/env";
import { router } from "./routes";
import { autenticar } from "./middleware/auth";
import { tratadorDeErros } from "./middleware/errorHandler";
import { agendarCronInadimplencia, rodarMarcacaoDeAtraso } from "./jobs/cronInadimplencia";

const env = carregarEnv();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? false,
  })
);
app.use(express.json({ limit: "100kb" }));

// Disparado pelo Vercel Cron em produção serverless (onde node-cron não roda, porque
// a função não fica de pé entre invocações). Fica fora do "/api" de propósito: usa
// CRON_SECRET (o Bearer que a própria Vercel injeta na chamada), não a x-api-key da API normal.
app.get("/cron/marcar-atrasadas", async (req, res) => {
  if (!env.CRON_SECRET || req.header("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    res.status(401).json({ erro: "Não autorizado" });
    return;
  }
  const total = await rodarMarcacaoDeAtraso();
  res.json({ atualizadas: total });
});

const limitadorGlobal = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const limitadorPagamentos = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api", limitadorGlobal, autenticar(env.API_KEY, env.JWT_SECRET));
app.use("/api/faturas/:faturaId/pagamentos", limitadorPagamentos);
app.use("/api", router);

app.use(tratadorDeErros);

if (require.main === module) {
  agendarCronInadimplencia();
  app.listen(env.PORT, () => console.log(`Financeiro API rodando na porta ${env.PORT}`));
}

export default app;
