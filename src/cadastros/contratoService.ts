import { PrismaClient } from "@prisma/client";
import { AppError } from "../lib/errors";
import { ResponsavelIptu, StatusContrato, StatusImovel, TipoGarantia } from "../lib/status";
import { buscarImovelDisponivel } from "./imovelService";
import { buscarInquilino } from "./inquilinoService";
import { buscarFiadorAtivo } from "./fiadorService";
import { gerarParcelasContrato } from "../financeiro/faturaService";
import { registrarLog } from "../lib/log";

const ENTIDADE = "Contrato";

// Duração máxima de um contrato, para não permitir datas absurdas que gerariam
// milhares de parcelas (defesa em profundidade, ver LIMITE_MESES em faturaService).
const DURACAO_MAXIMA_ANOS = 20;

export interface CriarContratoInput {
  inquilinoId: string;
  imovelId: string;
  fiadorId?: string;
  valorAluguel: number;
  diaVencimento: number;
  tipoGarantia: "CAUCAO" | "FIADOR";
  valorCaucao?: number;
  dataInicio: Date;
  dataFim: Date;
  percentualMulta?: number;
  taxaJurosDiaria?: number;
  responsavelIptu?: "INQUILINO" | "PROPRIETARIO";
}

/**
 * Valida a regra de garantia obrigatória: caução ≥ 3x o aluguel OU fiador ativo vinculado.
 * Lança AppError com mensagem específica para cada caso de violação.
 */
async function validarGarantia(prisma: PrismaClient, dados: CriarContratoInput) {
  if (dados.tipoGarantia === TipoGarantia.CAUCAO) {
    const minimo = dados.valorAluguel * 3;
    if (!dados.valorCaucao || dados.valorCaucao < minimo) {
      throw new AppError(
        422,
        `Caução deve ser de no mínimo 3x o valor do aluguel (mínimo: ${minimo.toFixed(2)})`
      );
    }
    return { fiadorId: undefined };
  }

  if (dados.tipoGarantia === TipoGarantia.FIADOR) {
    if (!dados.fiadorId) {
      throw new AppError(422, "Contrato com garantia por fiador exige um fiadorId");
    }
    const fiador = await buscarFiadorAtivo(prisma, dados.fiadorId);
    return { fiadorId: fiador.id };
  }

  throw new AppError(422, "tipoGarantia inválido");
}

function validarDatas(dataInicio: Date, dataFim: Date) {
  if (dataFim <= dataInicio) {
    throw new AppError(422, "dataFim deve ser posterior a dataInicio");
  }
  const limite = new Date(dataInicio);
  limite.setFullYear(limite.getFullYear() + DURACAO_MAXIMA_ANOS);
  if (dataFim > limite) {
    throw new AppError(422, `Duração do contrato não pode exceder ${DURACAO_MAXIMA_ANOS} anos`);
  }
}

/**
 * Defesa em profundidade além do status DISPONIVEL do imóvel: garante que não existe
 * outro contrato ativo (não encerrado) para o mesmo imóvel cujo período se sobreponha
 * ao novo. O status é a checagem "rápida" para o caso comum; isto cobre o caso de um
 * status desatualizado ou de uma corrida entre duas criações simultâneas.
 */
async function validarSemSobreposicao(
  prisma: PrismaClient,
  imovelId: string,
  dataInicio: Date,
  dataFim: Date
) {
  const conflito = await prisma.contrato.findFirst({
    where: {
      imovelId,
      deletedAt: null,
      status: StatusContrato.ATIVO,
      dataInicio: { lte: dataFim },
      dataFim: { gte: dataInicio },
    },
  });
  if (conflito) {
    throw new AppError(409, "Já existe um contrato ativo para este imóvel no período informado");
  }
}

/**
 * Cria o contrato, valida garantia e disponibilidade, marca o imóvel como ALUGADO e já
 * gera as parcelas (faturas, incluindo IPTU se aplicável) de toda a vigência — tudo
 * dentro de uma única transação para não deixar o imóvel "preso" como alugado se a
 * geração de parcelas falhar.
 */
export async function criarContrato(
  prisma: PrismaClient,
  dados: CriarContratoInput,
  usuario = "desconhecido"
) {
  validarDatas(dados.dataInicio, dados.dataFim);
  await buscarInquilino(prisma, dados.inquilinoId);
  await buscarImovelDisponivel(prisma, dados.imovelId);
  await validarSemSobreposicao(prisma, dados.imovelId, dados.dataInicio, dados.dataFim);
  const { fiadorId } = await validarGarantia(prisma, dados);

  const contrato = await prisma.$transaction(async (tx) => {
    const novoContrato = await tx.contrato.create({
      data: {
        inquilinoId: dados.inquilinoId,
        imovelId: dados.imovelId,
        fiadorId,
        valorAluguel: dados.valorAluguel,
        diaVencimento: dados.diaVencimento,
        tipoGarantia: dados.tipoGarantia,
        valorCaucao: dados.valorCaucao,
        responsavelIptu: dados.responsavelIptu ?? ResponsavelIptu.INQUILINO,
        dataInicio: dados.dataInicio,
        dataFim: dados.dataFim,
        percentualMulta: dados.percentualMulta,
        taxaJurosDiaria: dados.taxaJurosDiaria,
        status: StatusContrato.ATIVO,
      },
    });

    await tx.imovel.update({ where: { id: dados.imovelId }, data: { status: StatusImovel.ALUGADO } });

    return novoContrato;
  });

  await gerarParcelasContrato(prisma, contrato.id);
  await registrarLog(prisma, {
    entidade: ENTIDADE,
    entidadeId: contrato.id,
    acao: "CRIADO",
    usuario,
    detalhes: { imovelId: dados.imovelId, inquilinoId: dados.inquilinoId, tipoGarantia: dados.tipoGarantia },
  });
  return contrato;
}

export async function listarContratos(prisma: PrismaClient) {
  return prisma.contrato.findMany({
    where: { deletedAt: null },
    include: { inquilino: true, imovel: true, fiador: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function buscarContrato(prisma: PrismaClient, id: string) {
  const contrato = await prisma.contrato.findFirst({
    where: { id, deletedAt: null },
    include: { inquilino: true, imovel: true, fiador: true, faturas: true },
  });
  if (!contrato) throw new AppError(404, "Contrato não encontrado");
  return contrato;
}

/** Detalhe + histórico de parcelas de um contrato específico. */
export async function historicoParcelas(prisma: PrismaClient, contratoId: string) {
  await buscarContrato(prisma, contratoId);
  return prisma.fatura.findMany({
    where: { contratoId },
    include: { pagamentos: true },
    orderBy: { dataVencimento: "asc" },
  });
}

/** Encerra o contrato (soft delete) e libera o imóvel para nova locação. */
export async function encerrarContrato(prisma: PrismaClient, id: string, usuario = "desconhecido") {
  const contrato = await buscarContrato(prisma, id);

  const atualizado = await prisma.$transaction(async (tx) => {
    const contratoAtualizado = await tx.contrato.update({
      where: { id },
      data: { status: StatusContrato.ENCERRADO, deletedAt: new Date() },
    });
    await tx.imovel.update({ where: { id: contrato.imovelId }, data: { status: StatusImovel.DISPONIVEL } });
    return contratoAtualizado;
  });

  await registrarLog(prisma, { entidade: ENTIDADE, entidadeId: id, acao: "ENCERRADO", usuario });
  return atualizado;
}
