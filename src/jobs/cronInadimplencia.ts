import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { marcarFaturasAtrasadas } from "../financeiro/faturaService";

/** Toda madrugada (00:10), marca como ATRASADO faturas cujo vencimento + 1 dia já passou. */
export function agendarCronInadimplencia() {
  return cron.schedule("10 0 * * *", async () => {
    const atualizadas = await marcarFaturasAtrasadas(prisma, new Date());
    console.log(`[cron-inadimplencia] ${atualizadas.length} fatura(s) marcada(s) como ATRASADO`);
  });
}
