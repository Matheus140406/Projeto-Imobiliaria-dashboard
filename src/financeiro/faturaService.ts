import { PrismaClient } from "@prisma/client";
import { StatusContrato, StatusFatura } from "../lib/status";
import { Prisma } from "@prisma/client";
import { calcularMultaEJuros, diasEntre } from "./calculoAtraso";
import { AppError } from "../lib/errors";

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
    throw new AppError(409, "Contrato não está ativo");
  }

  const competencia = competenciaDe(referencia);
  const existente = await prisma.fatura.findUnique({
    where: { contratoId_competencia: { contratoId, competencia } },
  });
  if (existente) return existente;

  const dataVencimento = proximoVencimento(contrato.diaVencimento, referencia);

  try {
    return await prisma.fatura.create({
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
  } catch (err) {
    // Corrida entre chamadas concorrentes (ex.: API e cron ao mesmo tempo): a checagem
    // acima não é atômica, mas a constraint única (contratoId, competencia) garante que
    // nunca haja duplicata — aqui apenas devolvemos a fatura que a outra chamada criou,
    // em vez de propagar um erro de violação de unicidade para quem perdeu a corrida.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const criadaPelaOutraChamada = await prisma.fatura.findUnique({
        where: { contratoId_competencia: { contratoId, competencia } },
      });
      if (criadaPelaOutraChamada) return criadaPelaOutraChamada;
    }
    throw err;
  }
}

/**
 * Gera a fatura do mês corrente para todos os contratos ativos que ainda não a possuem.
 * A falha em um contrato não interrompe o processamento dos demais.
 */
export async function gerarFaturasDoMes(prisma: PrismaClient, referencia: Date = new Date()) {
  const contratosAtivos = await prisma.contrato.findMany({ where: { status: StatusContrato.ATIVO } });
  const faturas = [];
  const erros: { contratoId: string; erro: string }[] = [];

  for (const contrato of contratosAtivos) {
    try {
      faturas.push(await gerarFaturaMensal(prisma, contrato.id, referencia));
    } catch (err) {
      erros.push({ contratoId: contrato.id, erro: (err as Error).message });
    }
  }

  return { faturas, erros };
}

// Regra de negócio: "vencimento + 1 dia < hoje". Vencimento D vira D+1 no dia seguinte
// (ainda dentro da carência), e só passa a ser ATRASADO quando D+1 já ficou estritamente
// no passado — ou seja, a partir de D+2. diasAtraso é a diferença em dias de calendário
// entre o vencimento e a referência (ver diasEntre em calculoAtraso.ts).
const DIAS_MINIMOS_PARA_ATRASO = 2;

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
    if (diasEntre(fatura.dataVencimento, referencia) < DIAS_MINIMOS_PARA_ATRASO) continue;

    const { diasAtraso, valorMulta, valorJuros, valorTotal } = calcularMultaEJuros({
      valorOriginal: fatura.valorOriginal,
      percentualMulta: fatura.contrato.percentualMulta,
      taxaJurosDiaria: fatura.contrato.taxaJurosDiaria,
      dataVencimento: fatura.dataVencimento,
      dataReferencia: referencia,
    });
    if (diasAtraso < DIAS_MINIMOS_PARA_ATRASO) continue;

    atualizadas.push(
      await prisma.fatura.update({
        where: { id: fatura.id },
        data: { status: StatusFatura.ATRASADO, valorMulta, valorJuros, valorTotal },
      })
    );
  }
  return atualizadas;
}
