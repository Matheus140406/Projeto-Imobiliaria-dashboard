import express from "express";
import dotenv from "dotenv";
import { router } from "./routes";
import { agendarCronInadimplencia } from "./jobs/cronInadimplencia";

dotenv.config();

const app = express();
app.use(express.json());
app.use("/api", router);

if (require.main === module) {
  const porta = process.env.PORT ?? 3000;
  agendarCronInadimplencia();
  app.listen(porta, () => console.log(`Financeiro API rodando na porta ${porta}`));
}

export default app;
