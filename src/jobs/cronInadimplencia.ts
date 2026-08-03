import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { marcarFaturasAtrasadas } from "../financeiro/faturaService";

/** Toda madrugada (00:10), marca como ATRASADO faturas cujo vencimento + 1 dia já passou. */
export function agendarCronInadimplencia() {
  return cron.schedule("10 0 * * *", async () => {
    try {
      const atualizadas = await marcarFaturasAtrasadas(prisma, new Date());
      console.log(`[cron-inadimplencia] ${atualizadas.length} fatura(s) marcada(s) como ATRASADO`);
    } catch (err) {
      // Sem isso, uma falha aqui vira unhandled rejection e a rodada da madrugada
      // é perdida sem nenhum registro do que aconteceu.
      console.error("[cron-inadimplencia] falha ao processar faturas atrasadas:", err);
    }
  });
}
