import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { marcarFaturasAtrasadas } from "../financeiro/faturaService";

/** Lógica compartilhada entre o cron in-process (dev/servidor tradicional) e o
 * endpoint HTTP /cron/marcar-atrasadas (produção serverless, disparado pelo Vercel Cron). */
export async function rodarMarcacaoDeAtraso(): Promise<number> {
  const atualizadas = await marcarFaturasAtrasadas(prisma, new Date());
  console.log(`[cron-inadimplencia] ${atualizadas.length} fatura(s) marcada(s) como ATRASADO`);
  return atualizadas.length;
}

/** Toda madrugada (00:10), marca como ATRASADO faturas cujo vencimento + 1 dia já passou.
 * Só funciona em processo de longa duração (não usar em serverless — ver rodarMarcacaoDeAtraso). */
export function agendarCronInadimplencia() {
  return cron.schedule("10 0 * * *", async () => {
    try {
      await rodarMarcacaoDeAtraso();
    } catch (err) {
      // Sem isso, uma falha aqui vira unhandled rejection e a rodada da madrugada
      // é perdida sem nenhum registro do que aconteceu.
      console.error("[cron-inadimplencia] falha ao processar faturas atrasadas:", err);
    }
  });
}
