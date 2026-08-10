import { PrismaClient } from "@prisma/client";
import { AppError } from "../lib/errors";
import { ResponsavelIptu, StatusContrato, StatusImovel, TipoGarantia } from "../lib/status";
import { buscarImovelDisponivel } from "./imovelService";
import { buscarInquilino } from "./inquilinoService";
import { buscarFiadorAtivo } from "./fiadorService";
import { gerarParcelasContrato } from "../financeiro/faturaService";
import { registrarLog } from "../lib/log";
import { formatarReais } from "../lib/dinheiro";

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
        `Caução deve ser de no mínimo 3x o valor do aluguel (mínimo: ${formatarReais(minimo)})`
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

export interface RenovarContratoInput {
  novaDataFim: Date;
  novoValorAluguel?: number;
}

/**
 * Renova o contrato: encerra o atual (soft delete, sem liberar o imóvel — ele
 * continua ocupado pelo mesmo inquilino) e cria um novo contrato equivalente
 * (mesmo inquilino/imóvel/fiador/garantia), começando no dia seguinte ao término
 * do anterior e indo até `novaDataFim`, com as parcelas já geradas. Diferente de
 * `criarContrato`, não passa pelas checagens de imóvel disponível/sobreposição,
 * porque o imóvel já está legitimamente ocupado pelo contrato sendo renovado.
 */
export async function renovarContrato(
  prisma: PrismaClient,
  contratoId: string,
  dados: RenovarContratoInput,
  usuario = "desconhecido"
) {
  const contratoAtual = await buscarContrato(prisma, contratoId);
  if (contratoAtual.status !== StatusContrato.ATIVO) {
    throw new AppError(409, "Só é possível renovar um contrato ativo");
  }
  if (dados.novaDataFim <= contratoAtual.dataFim) {
    throw new AppError(422, "novaDataFim deve ser posterior à dataFim do contrato atual");
  }

  const novaDataInicio = new Date(contratoAtual.dataFim);
  novaDataInicio.setDate(novaDataInicio.getDate() + 1);
  validarDatas(novaDataInicio, dados.novaDataFim);

  const novoContrato = await prisma.$transaction(async (tx) => {
    await tx.contrato.update({
      where: { id: contratoId },
      data: { status: StatusContrato.ENCERRADO, deletedAt: new Date() },
    });

    return tx.contrato.create({
      data: {
        inquilinoId: contratoAtual.inquilinoId,
        imovelId: contratoAtual.imovelId,
        fiadorId: contratoAtual.fiadorId,
        valorAluguel: dados.novoValorAluguel ?? contratoAtual.valorAluguel,
        diaVencimento: contratoAtual.diaVencimento,
        tipoGarantia: contratoAtual.tipoGarantia,
        valorCaucao: contratoAtual.valorCaucao,
        responsavelIptu: contratoAtual.responsavelIptu,
        percentualMulta: contratoAtual.percentualMulta,
        taxaJurosDiaria: contratoAtual.taxaJurosDiaria,
        dataInicio: novaDataInicio,
        dataFim: dados.novaDataFim,
        status: StatusContrato.ATIVO,
        renovadoDeId: contratoAtual.id,
      },
    });
    // Note: imóvel permanece ALUGADO — não há update de status aqui de propósito.
  });

  await gerarParcelasContrato(prisma, novoContrato.id);
  await registrarLog(prisma, { entidade: ENTIDADE, entidadeId: contratoId, acao: "RENOVADO", usuario, detalhes: { novoContratoId: novoContrato.id } });
  await registrarLog(prisma, {
    entidade: ENTIDADE,
    entidadeId: novoContrato.id,
    acao: "CRIADO_POR_RENOVACAO",
    usuario,
    detalhes: { contratoAnteriorId: contratoId },
  });

  return novoContrato;
}
