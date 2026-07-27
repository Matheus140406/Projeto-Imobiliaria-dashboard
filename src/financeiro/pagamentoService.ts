import { PrismaClient } from "@prisma/client";
import { StatusFatura } from "../lib/status";
import { AppError } from "../lib/errors";

export interface RegistrarPagamentoInput {
  faturaId: string;
  valorPago: number;
  metodo: string;
  registradoPor: string;
  observacao?: string;
  dataPagamento?: Date;
}

const PONTOS_PAGAMENTO_EM_DIA = 5;
const PONTOS_PAGAMENTO_ATRASADO = -10;

// Diferença máxima aceitável entre valor pago e valor total, para absorver
// arredondamento de ponto flutuante (valores monetários armazenados como Float).
const TOLERANCIA_CENTAVOS = 0.01;

/**
 * Registra o pagamento manual de uma fatura, grava auditoria e ajusta o
 * scoring do inquilino conforme o status da fatura no momento do pagamento.
 */
export async function registrarPagamento(prisma: PrismaClient, input: RegistrarPagamentoInput) {
  // Validação defensiva independente da camada HTTP: este service pode ser chamado
  // diretamente (jobs, scripts, testes) sem passar pelo zod das rotas.
  if (!Number.isFinite(input.valorPago) || input.valorPago <= 0) {
    throw new AppError(422, "valorPago deve ser um número finito maior que zero");
  }

  return prisma.$transaction(async (tx) => {
    const fatura = await tx.fatura.findUniqueOrThrow({
      where: { id: input.faturaId },
      include: { contrato: { include: { inquilino: true } } },
    });

    if (fatura.status === StatusFatura.PAGO) {
      throw new AppError(409, "Fatura já está paga");
    }
    if (fatura.status === StatusFatura.CANCELADO) {
      throw new AppError(409, "Fatura cancelada não pode receber pagamento");
    }
    if (input.valorPago < fatura.valorTotal - TOLERANCIA_CENTAVOS) {
      throw new AppError(
        422,
        `Valor pago (${input.valorPago.toFixed(2)}) é menor que o valor total da fatura (${fatura.valorTotal.toFixed(2)}). Pagamentos parciais não são suportados.`
      );
    }

    const pagamento = await tx.pagamento.create({
      data: {
        faturaId: input.faturaId,
        valorPago: input.valorPago,
        metodo: input.metodo,
        registradoPor: input.registradoPor,
        observacao: input.observacao,
        dataPagamento: input.dataPagamento ?? new Date(),
      },
    });

    const faturaAtualizada = await tx.fatura.update({
      where: { id: input.faturaId },
      data: { status: StatusFatura.PAGO },
    });

    // O scoring usa a data de vencimento real, não o campo `status` da fatura: se o
    // pagamento ocorrer antes do cron da madrugada rodar, uma fatura já vencida ontem
    // ainda estaria como PENDENTE no banco e pontuaria como "em dia" indevidamente.
    const dataEfetivaDoPagamento = input.dataPagamento ?? new Date();
    const estaAtrasado =
      fatura.status === StatusFatura.ATRASADO || dataEfetivaDoPagamento > fatura.dataVencimento;
    const pontos = estaAtrasado ? PONTOS_PAGAMENTO_ATRASADO : PONTOS_PAGAMENTO_EM_DIA;
    await tx.inquilino.update({
      where: { id: fatura.contrato.inquilinoId },
      data: { scoring: { increment: pontos } },
    });

    await tx.auditoriaPagamento.create({
      data: {
        faturaId: input.faturaId,
        acao: "PAGAMENTO_REGISTRADO",
        detalhes: JSON.stringify({
          valorPago: input.valorPago,
          metodo: input.metodo,
          statusAnterior: fatura.status,
          pontosScoring: pontos,
        }),
        usuario: input.registradoPor,
      },
    });

    return { pagamento, fatura: faturaAtualizada };
  });
}
