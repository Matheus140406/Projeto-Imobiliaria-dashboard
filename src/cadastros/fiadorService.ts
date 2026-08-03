import { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "../lib/errors";
import { cpfValido, normalizaCpf } from "../lib/cpf";
import { registrarLog } from "../lib/log";

const ENTIDADE = "Fiador";

export interface CriarFiadorInput {
  nome: string;
  cpf: string;
}

export async function criarFiador(prisma: PrismaClient, dados: CriarFiadorInput, usuario = "desconhecido") {
  if (!cpfValido(dados.cpf)) {
    throw new AppError(422, "CPF inválido");
  }
  const cpf = normalizaCpf(dados.cpf);

  try {
    const fiador = await prisma.fiador.create({ data: { nome: dados.nome, cpf } });
    await registrarLog(prisma, { entidade: ENTIDADE, entidadeId: fiador.id, acao: "CRIADO", usuario });
    return fiador;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "Já existe um fiador com esse CPF");
    }
    throw err;
  }
}

export async function listarFiadores(prisma: PrismaClient) {
  return prisma.fiador.findMany({ where: { deletedAt: null }, orderBy: { nome: "asc" } });
}

export async function buscarFiador(prisma: PrismaClient, id: string) {
  const fiador = await prisma.fiador.findFirst({ where: { id, deletedAt: null } });
  if (!fiador) throw new AppError(404, "Fiador não encontrado");
  return fiador;
}

/**
 * Ficha do fiador com todos os contratos que ele garante — uma pessoa pode ser
 * fiadora de mais de um imóvel, e isso precisa ficar visível na ficha dela.
 */
export async function buscarFiadorComContratos(prisma: PrismaClient, id: string) {
  const fiador = await buscarFiador(prisma, id);
  const contratosGarantidos = await prisma.contrato.findMany({
    where: { fiadorId: id, deletedAt: null },
    include: { inquilino: true, imovel: true },
    orderBy: { createdAt: "desc" },
  });
  return { ...fiador, contratosGarantidos };
}

/** Usado pelo contratoService: garante que o fiador existe e está ativo antes de vincular. */
export async function buscarFiadorAtivo(prisma: PrismaClient, id: string) {
  const fiador = await buscarFiador(prisma, id);
  if (!fiador.ativo) throw new AppError(422, "Fiador não está ativo");
  return fiador;
}

/** Ativa ou desativa o fiador (ex.: parou de ser elegível como garantidor). */
export async function atualizarFiador(
  prisma: PrismaClient,
  id: string,
  dados: { nome?: string; ativo?: boolean },
  usuario = "desconhecido"
) {
  await buscarFiador(prisma, id);
  const atualizado = await prisma.fiador.update({ where: { id }, data: dados });
  await registrarLog(prisma, { entidade: ENTIDADE, entidadeId: id, acao: "ATUALIZADO", usuario, detalhes: dados });
  return atualizado;
}

export async function excluirFiador(prisma: PrismaClient, id: string, usuario = "desconhecido") {
  await buscarFiador(prisma, id);
  const excluido = await prisma.fiador.update({ where: { id }, data: { deletedAt: new Date() } });
  await registrarLog(prisma, { entidade: ENTIDADE, entidadeId: id, acao: "EXCLUIDO", usuario });
  return excluido;
}
