import { PrismaClient } from "@prisma/client";
import { StatusContrato, StatusFatura } from "../lib/status";
import { calcularMultaEJuros } from "./calculoAtraso";

export function competenciaDe(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  return `${ano}-${mes}`;
}

function proximoVencimento(diaVencimento: number, referencia: Date): Date {
  const ano = referencia.getFullYear();
  const mes = referencia.getMonth();
  const ultimoDiaDoMes = new Date(ano, mes + 1, 0).getDate();
  const dia = Math.min(diaVencimento, ultimoDiaDoMes);
  return new Date(ano, mes, dia);
}

/** Gera a fatura do mês corrente para um contrato ativo, se ainda não existir. */
export async function gerarFaturaMensal(
  prisma: PrismaClient,
  contratoId: string,
  referencia: Date = new Date()
) {
  const contrato = await prisma.contrato.findUniqueOrThrow({ where: { id: contratoId } });
  if (contrato.status !== StatusContrato.ATIVO) {
    throw new Error("Contrato não está ativo");
  }

  const competencia = competenciaDe(referencia);
  const existente = await prisma.fatura.findUnique({
    where: { contratoId_competencia: { contratoId, competencia } },
  });
  if (existente) return existente;

  const dataVencimento = proximoVencimento(contrato.diaVencimento, referencia);

  return prisma.fatura.create({
    data: {
      contratoId,
      competencia,
      valorOriginal: contrato.valorAluguel,
      valorMulta: 0,
      valorJuros: 0,
      valorTotal: contrato.valorAluguel,
      dataVencimento,
      status: StatusFatura.PENDENTE,
    },
  });
}

/** Gera a fatura do mês corrente para todos os contratos ativos que ainda não a possuem. */
export async function gerarFaturasDoMes(prisma: PrismaClient, referencia: Date = new Date()) {
  const contratosAtivos = await prisma.contrato.findMany({ where: { status: StatusContrato.ATIVO } });
  const faturas = [];
  for (const contrato of contratosAtivos) {
    faturas.push(await gerarFaturaMensal(prisma, contrato.id, referencia));
  }
  return faturas;
}

/**
 * Marca como ATRASADO toda fatura pendente cujo vencimento + 1 dia já passou,
 * recalculando multa e juros até a data de referência.
 */
export async function marcarFaturasAtrasadas(prisma: PrismaClient, referencia: Date = new Date()) {
  const candidatas = await prisma.fatura.findMany({
    where: { status: { in: [StatusFatura.PENDENTE, StatusFatura.ATRASADO] } },
    include: { contrato: true },
  });

  const atualizadas = [];
  for (const fatura of candidatas) {
    const limite = new Date(fatura.dataVencimento);
    limite.setDate(limite.getDate() + 1);
    if (referencia < limite) continue;

    const { diasAtraso, valorMulta, valorJuros, valorTotal } = calcularMultaEJuros({
      valorOriginal: fatura.valorOriginal,
      percentualMulta: fatura.contrato.percentualMulta,
      taxaJurosDiaria: fatura.contrato.taxaJurosDiaria,
      dataVencimento: fatura.dataVencimento,
      dataReferencia: referencia,
    });
    if (diasAtraso <= 0) continue;

    atualizadas.push(
      await prisma.fatura.update({
        where: { id: fatura.id },
        data: { status: StatusFatura.ATRASADO, valorMulta, valorJuros, valorTotal },
      })
    );
  }
  return atualizadas;
}
