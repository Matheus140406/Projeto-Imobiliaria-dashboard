import { PrismaClient } from "@prisma/client";
import { AppError } from "../lib/errors";
import { StatusImovel } from "../lib/status";
import { registrarLog } from "../lib/log";

const ENTIDADE = "Imovel";

export interface CriarImovelInput {
  endereco: string;
  valorPadrao: number;
  valorIptuMensal?: number;
}

export async function criarImovel(prisma: PrismaClient, dados: CriarImovelInput, usuario = "desconhecido") {
  const imovel = await prisma.imovel.create({
    data: {
      endereco: dados.endereco,
      valorPadrao: dados.valorPadrao,
      valorIptuMensal: dados.valorIptuMensal,
      status: StatusImovel.DISPONIVEL,
    },
  });
  await registrarLog(prisma, { entidade: ENTIDADE, entidadeId: imovel.id, acao: "CRIADO", usuario });
  return imovel;
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

/** Ficha do imóvel com um link rápido para o contrato ativo, se estiver alugado. */
export async function buscarImovelComContratoAtivo(prisma: PrismaClient, id: string) {
  const imovel = await buscarImovel(prisma, id);
  const contratoAtivo = await prisma.contrato.findFirst({
    where: { imovelId: id, deletedAt: null, status: "ATIVO" },
    include: { inquilino: true, fiador: true },
  });
  return { ...imovel, contratoAtivo };
}

/** Usado pelo contratoService: garante que o imóvel existe e está livre para alugar. */
export async function buscarImovelDisponivel(prisma: PrismaClient, id: string) {
  const imovel = await buscarImovel(prisma, id);
  if (imovel.status !== StatusImovel.DISPONIVEL) {
    throw new AppError(409, "Imóvel não está disponível para locação");
  }
  return imovel;
}

export interface AtualizarImovelInput {
  endereco?: string;
  valorPadrao?: number;
  valorIptuMensal?: number | null;
  status?: "DISPONIVEL" | "MANUTENCAO";
}

/**
 * Atualiza dados do imóvel. O status só pode ser alternado manualmente entre
 * DISPONIVEL e MANUTENCAO — ALUGADO é controlado pelo ciclo de vida do
 * contrato (criarContrato/encerrarContrato), nunca definido à mão.
 */
export async function atualizarImovel(
  prisma: PrismaClient,
  id: string,
  dados: AtualizarImovelInput,
  usuario = "desconhecido"
) {
  const imovel = await buscarImovel(prisma, id);
  if (dados.status && imovel.status === StatusImovel.ALUGADO) {
    throw new AppError(409, "Imóvel alugado tem o status controlado pelo contrato; encerre o contrato primeiro");
  }
  // Defesa em profundidade: o tipo TypeScript já restringe status a DISPONIVEL/MANUTENCAO,
  // mas isso não existe em runtime — uma chamada direta ao service (sem passar pelo zod
  // da rota) poderia gravar "ALUGADO" à mão, contornando o controle de ciclo de vida
  // do imóvel que só criarContrato/encerrarContrato/excluirContrato deveriam gerenciar.
  if (dados.status && dados.status !== StatusImovel.DISPONIVEL && dados.status !== StatusImovel.MANUTENCAO) {
    throw new AppError(422, "status deve ser DISPONIVEL ou MANUTENCAO");
  }

  const atualizado = await prisma.imovel.update({ where: { id }, data: dados });
  await registrarLog(prisma, { entidade: ENTIDADE, entidadeId: id, acao: "ATUALIZADO", usuario, detalhes: dados });
  return atualizado;
}

export async function excluirImovel(prisma: PrismaClient, id: string, usuario = "desconhecido") {
  const imovel = await buscarImovel(prisma, id);
  if (imovel.status === StatusImovel.ALUGADO) {
    throw new AppError(409, "Não é possível excluir um imóvel alugado; encerre o contrato primeiro");
  }
  const excluido = await prisma.imovel.update({ where: { id }, data: { deletedAt: new Date() } });
  await registrarLog(prisma, { entidade: ENTIDADE, entidadeId: id, acao: "EXCLUIDO", usuario });
  return excluido;
}
