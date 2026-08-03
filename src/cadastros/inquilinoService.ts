import { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "../lib/errors";
import { cpfValido, normalizaCpf } from "../lib/cpf";

export interface CriarInquilinoInput {
  nome: string;
  cpf: string;
  email?: string;
  telefone?: string;
}

/** CPF único: valida dígito verificador antes de tocar o banco (constraint única é a defesa final). */
export async function criarInquilino(prisma: PrismaClient, dados: CriarInquilinoInput) {
  if (!cpfValido(dados.cpf)) {
    throw new AppError(422, "CPF inválido");
  }
  const cpf = normalizaCpf(dados.cpf);

  try {
    return await prisma.inquilino.create({
      data: { nome: dados.nome, cpf, email: dados.email, telefone: dados.telefone },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "Já existe um inquilino com esse CPF ou email");
    }
    throw err;
  }
}

export async function listarInquilinos(prisma: PrismaClient) {
  return prisma.inquilino.findMany({
    where: { deletedAt: null },
    orderBy: { nome: "asc" },
  });
}

export async function buscarInquilino(prisma: PrismaClient, id: string) {
  const inquilino = await prisma.inquilino.findFirst({ where: { id, deletedAt: null } });
  if (!inquilino) throw new AppError(404, "Inquilino não encontrado");
  return inquilino;
}

/** Soft delete: preserva o histórico de contratos/faturas em vez de apagar o registro. */
export async function excluirInquilino(prisma: PrismaClient, id: string) {
  await buscarInquilino(prisma, id);
  return prisma.inquilino.update({ where: { id }, data: { deletedAt: new Date() } });
}
