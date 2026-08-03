import { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "../lib/errors";
import { cpfValido, normalizaCpf } from "../lib/cpf";

export interface CriarFiadorInput {
  nome: string;
  cpf: string;
}

export async function criarFiador(prisma: PrismaClient, dados: CriarFiadorInput) {
  if (!cpfValido(dados.cpf)) {
    throw new AppError(422, "CPF inválido");
  }
  const cpf = normalizaCpf(dados.cpf);

  try {
    return await prisma.fiador.create({ data: { nome: dados.nome, cpf } });
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

/** Usado pelo contratoService: garante que o fiador existe e está ativo antes de vincular. */
export async function buscarFiadorAtivo(prisma: PrismaClient, id: string) {
  const fiador = await buscarFiador(prisma, id);
  if (!fiador.ativo) throw new AppError(422, "Fiador não está ativo");
  return fiador;
}

export async function excluirFiador(prisma: PrismaClient, id: string) {
  await buscarFiador(prisma, id);
  return prisma.fiador.update({ where: { id }, data: { deletedAt: new Date() } });
}
