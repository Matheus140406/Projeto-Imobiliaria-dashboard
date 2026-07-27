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
import { agendarCronInadimplencia } from "./jobs/cronInadimplencia";

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

app.use("/api", limitadorGlobal, autenticar(env.API_KEY));
app.use("/api/faturas/:faturaId/pagamentos", limitadorPagamentos);
app.use("/api", router);

app.use(tratadorDeErros);

if (require.main === module) {
  agendarCronInadimplencia();
  app.listen(env.PORT, () => console.log(`Financeiro API rodando na porta ${env.PORT}`));
}

export default app;
