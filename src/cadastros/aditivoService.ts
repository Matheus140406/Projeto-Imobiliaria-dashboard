import { PrismaClient } from "@prisma/client";
import { AppError } from "../lib/errors";
import { StatusContrato, StatusFatura, TipoFatura } from "../lib/status";
import { registrarLog } from "../lib/log";
import { buscarContrato } from "./contratoService";
import { gerarFaturaMensal } from "../financeiro/faturaService";

export interface RegistrarAditivoInput {
  dataVigencia: Date;
  novoValorAluguel?: number;
  novoDiaVencimento?: number;
  motivo?: string;
}

/**
 * Registra um aditivo contratual (reajuste de aluguel e/ou dia de vencimento) a partir
 * de uma data de vigência. Faturas já geradas (passadas ou já vencidas) não são
 * tocadas — só as pendentes de aluguel com vencimento a partir da data de vigência
 * são recriadas com o novo valor. Faturas de IPTU não são afetadas por este aditivo.
 */
export async function registrarAditivo(
  prisma: PrismaClient,
  contratoId: string,
  dados: RegistrarAditivoInput,
  usuario = "desconhecido"
) {
  if (!dados.novoValorAluguel && !dados.novoDiaVencimento) {
    throw new AppError(422, "Informe novoValorAluguel e/ou novoDiaVencimento");
  }

  const contrato = await buscarContrato(prisma, contratoId);
  if (contrato.status !== StatusContrato.ATIVO) {
    throw new AppError(409, "Só é possível registrar aditivo em contrato ativo");
  }
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  if (dados.dataVigencia < hoje) {
    throw new AppError(422, "dataVigencia não pode ser retroativa");
  }

  const faturasAfetadas = await prisma.fatura.findMany({
    where: {
      contratoId,
      tipo: TipoFatura.ALUGUEL,
      status: StatusFatura.PENDENTE,
      dataVencimento: { gte: dados.dataVigencia },
    },
  });
  const competenciasParaRegerar = faturasAfetadas.map((f) => f.competencia);

  const resultado = await prisma.$transaction(async (tx) => {
    const contratoAtualizado = await tx.contrato.update({
      where: { id: contratoId },
      data: {
        ...(dados.novoValorAluguel != null ? { valorAluguel: dados.novoValorAluguel } : {}),
        ...(dados.novoDiaVencimento != null ? { diaVencimento: dados.novoDiaVencimento } : {}),
      },
    });

    if (faturasAfetadas.length > 0) {
      await tx.fatura.deleteMany({ where: { id: { in: faturasAfetadas.map((f) => f.id) } } });
    }

    const aditivo = await tx.aditivo.create({
      data: {
        contratoId,
        dataVigencia: dados.dataVigencia,
        novoValorAluguel: dados.novoValorAluguel,
        novoDiaVencimento: dados.novoDiaVencimento,
        motivo: dados.motivo,
        criadoPor: usuario,
      },
    });

    return { contratoAtualizado, aditivo };
  });

  // Recria, fora da transação (gerarFaturaMensal já é idempotente e tolerante a
  // corrida), as faturas de aluguel que foram removidas, agora com o valor/dia novo.
  const faturasRegeradas = [];
  for (const competencia of competenciasParaRegerar) {
    const [ano, mes] = competencia.split("-").map(Number);
    faturasRegeradas.push(await gerarFaturaMensal(prisma, contratoId, new Date(ano, mes - 1, 1)));
  }

  await registrarLog(prisma, {
    entidade: "Contrato",
    entidadeId: contratoId,
    acao: "ADITIVO_REGISTRADO",
    usuario,
    detalhes: dados,
  });

  return { ...resultado, faturasRegeradas };
}

export async function listarAditivos(prisma: PrismaClient, contratoId: string) {
  await buscarContrato(prisma, contratoId);
  return prisma.aditivo.findMany({ where: { contratoId }, orderBy: { createdAt: "desc" } });
}
