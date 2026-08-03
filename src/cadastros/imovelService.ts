import { PrismaClient } from "@prisma/client";
import { AppError } from "../lib/errors";
import { StatusImovel } from "../lib/status";

export interface CriarImovelInput {
  endereco: string;
  valorPadrao: number;
}

export async function criarImovel(prisma: PrismaClient, dados: CriarImovelInput) {
  return prisma.imovel.create({
    data: { endereco: dados.endereco, valorPadrao: dados.valorPadrao, status: StatusImovel.DISPONIVEL },
  });
}

export async function listarImoveis(prisma: PrismaClient, apenasDisponiveis = false) {
  return prisma.imovel.findMany({
    where: { deletedAt: null, ...(apenasDisponiveis ? { status: StatusImovel.DISPONIVEL } : {}) },
    orderBy: { endereco: "asc" },
  });
}

export async function buscarImovel(prisma: PrismaClient, id: string) {
  const imovel = await prisma.imovel.findFirst({ where: { id, deletedAt: null } });
  if (!imovel) throw new AppError(404, "Imóvel não encontrado");
  return imovel;
}

/** Usado pelo contratoService: garante que o imóvel existe e está livre para alugar. */
export async function buscarImovelDisponivel(prisma: PrismaClient, id: string) {
  const imovel = await buscarImovel(prisma, id);
  if (imovel.status !== StatusImovel.DISPONIVEL) {
    throw new AppError(409, "Imóvel não está disponível para locação");
  }
  return imovel;
}

export async function excluirImovel(prisma: PrismaClient, id: string) {
  const imovel = await buscarImovel(prisma, id);
  if (imovel.status === StatusImovel.ALUGADO) {
    throw new AppError(409, "Não é possível excluir um imóvel alugado; encerre o contrato primeiro");
  }
  return prisma.imovel.update({ where: { id }, data: { deletedAt: new Date() } });
}
