import { PrismaClient } from "@prisma/client";
import { ResponsavelIptu, StatusContrato, StatusFatura, TipoFatura } from "../lib/status";
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

/**
 * Gera a fatura de um mês (aluguel ou IPTU) para um contrato ativo, se ainda não existir.
 * `tipo` "IPTU" usa o valorIptuMensal do imóvel como valor original em vez do aluguel.
 */
export async function gerarFaturaMensal(
  prisma: PrismaClient,
  contratoId: string,
  referencia: Date = new Date(),
  tipo: string = TipoFatura.ALUGUEL
) {
  const contrato = await prisma.contrato.findUniqueOrThrow({
    where: { id: contratoId },
    include: { imovel: true },
  });
  if (contrato.status !== StatusContrato.ATIVO) {
    throw new AppError(409, "Contrato não está ativo");
  }

  const competencia = competenciaDe(referencia);
  const existente = await prisma.fatura.findUnique({
    where: { contratoId_competencia_tipo: { contratoId, competencia, tipo } },
  });
  if (existente) return existente;

  const valorOriginal = tipo === TipoFatura.IPTU ? contrato.imovel.valorIptuMensal : contrato.valorAluguel;
  if (valorOriginal == null) {
    throw new AppError(422, "Imóvel não tem valorIptuMensal configurado");
  }

  const dataVencimento = proximoVencimento(contrato.diaVencimento, referencia);

  try {
    return await prisma.fatura.create({
      data: {
        contratoId,
        competencia,
        tipo,
        valorOriginal,
        valorMulta: 0,
        valorJuros: 0,
        valorTotal: valorOriginal,
        dataVencimento,
        status: StatusFatura.PENDENTE,
      },
    });
  } catch (err) {
    // Corrida entre chamadas concorrentes (ex.: API e cron ao mesmo tempo): a checagem
    // acima não é atômica, mas a constraint única (contratoId, competencia, tipo) garante
    // que nunca haja duplicata — aqui apenas devolvemos a fatura que a outra chamada
    // criou, em vez de propagar um erro de violação de unicidade para quem perdeu a corrida.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const criadaPelaOutraChamada = await prisma.fatura.findUnique({
        where: { contratoId_competencia_tipo: { contratoId, competencia, tipo } },
      });
      if (criadaPelaOutraChamada) return criadaPelaOutraChamada;
    }
    throw err;
  }
}

/**
 * Gera a fatura do mês corrente (aluguel + IPTU, quando aplicável) para todos os
 * contratos ativos que ainda não a possuem. A falha em um contrato não interrompe o
 * processamento dos demais.
 */
export async function gerarFaturasDoMes(prisma: PrismaClient, referencia: Date = new Date()) {
  const contratosAtivos = await prisma.contrato.findMany({
    where: { status: StatusContrato.ATIVO },
    include: { imovel: true },
  });
  const faturas = [];
  const erros: { contratoId: string; erro: string }[] = [];

  for (const contrato of contratosAtivos) {
    try {
      faturas.push(await gerarFaturaMensal(prisma, contrato.id, referencia));
      if (contrato.responsavelIptu === ResponsavelIptu.INQUILINO && contrato.imovel.valorIptuMensal != null) {
        faturas.push(await gerarFaturaMensal(prisma, contrato.id, referencia, TipoFatura.IPTU));
      }
    } catch (err) {
      erros.push({ contratoId: contrato.id, erro: (err as Error).message });
    }
  }

  return { faturas, erros };
}

/**
 * Gera automaticamente 1 fatura de aluguel por mês de vigência do contrato (de
 * dataInicio até dataFim, inclusive), chamada uma vez na criação do contrato. Se o
 * contrato atribui o IPTU ao inquilino e o imóvel tem valorIptuMensal configurado,
 * gera também 1 fatura de IPTU por mês, lado a lado com a de aluguel. Reaproveita
 * gerarFaturaMensal para cada competência, então é seguro chamar de novo (idempotente)
 * e convive bem com o cron mensal, que só cria a fatura do mês corrente se ela ainda
 * não existir.
 */
export async function gerarParcelasContrato(prisma: PrismaClient, contratoId: string) {
  const contrato = await prisma.contrato.findUniqueOrThrow({
    where: { id: contratoId },
    include: { imovel: true },
  });

  const gerarIptu = contrato.responsavelIptu === ResponsavelIptu.INQUILINO && contrato.imovel.valorIptuMensal != null;

  const referencia = new Date(contrato.dataInicio.getFullYear(), contrato.dataInicio.getMonth(), 1);
  const fim = new Date(contrato.dataFim.getFullYear(), contrato.dataFim.getMonth(), 1);

  // Trava de segurança: um contrato com dataFim absurdamente distante não deve gerar
  // milhares de faturas de uma vez (a validação de duração fica em contratoService,
  // isto aqui é a segunda camada de defesa).
  const LIMITE_MESES = 600; // 50 anos
  const faturas = [];
  let meses = 0;
  while (referencia <= fim && meses < LIMITE_MESES) {
    faturas.push(await gerarFaturaMensal(prisma, contratoId, new Date(referencia)));
    if (gerarIptu) {
      faturas.push(await gerarFaturaMensal(prisma, contratoId, new Date(referencia), TipoFatura.IPTU));
    }
    referencia.setMonth(referencia.getMonth() + 1);
    meses++;
  }
  return faturas;
}

// Regra de negócio: "vencimento + 1 dia < hoje". Vencimento D vira D+1 no dia seguinte
// (ainda dentro da carência), e só passa a ser ATRASADO quando D+1 já ficou estritamente
// no passado — ou seja, a partir de D+2. diasAtraso é a diferença em dias de calendário
// entre o vencimento e a referência (ver diasEntre em calculoAtraso.ts).
const DIAS_MINIMOS_PARA_ATRASO = 2;

/**
 * Marca como ATRASADO toda fatura (aluguel ou IPTU) pendente cujo vencimento + 1 dia
 * já passou, recalculando multa e juros até a data de referência.
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

/**
 * Detalhe transparente de uma fatura: recalcula (sem persistir) dias de atraso,
 * multa e juros na data atual, mesmo que o cron da madrugada ainda não tenha
 * rodado e o status no banco ainda esteja "PENDENTE".
 */
export async function detalheFatura(prisma: PrismaClient, faturaId: string) {
  const fatura = await prisma.fatura.findUnique({
    where: { id: faturaId },
    include: { contrato: { include: { inquilino: true, imovel: true } }, pagamentos: true },
  });
  if (!fatura) throw new AppError(404, "Fatura não encontrada");

  const calculoAtual = calcularMultaEJuros({
    valorOriginal: fatura.valorOriginal,
    percentualMulta: fatura.contrato.percentualMulta,
    taxaJurosDiaria: fatura.contrato.taxaJurosDiaria,
    dataVencimento: fatura.dataVencimento,
    dataReferencia: new Date(),
  });

  return { ...fatura, calculoAtual };
}
