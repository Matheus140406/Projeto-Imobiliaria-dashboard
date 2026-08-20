import { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "../lib/errors";
import { cpfValido, normalizaCpf } from "../lib/cpf";
import { registrarLog } from "../lib/log";

const ENTIDADE = "Inquilino";

export interface CriarInquilinoInput {
  nome: string;
  cpf: string;
  email?: string;
  telefone?: string;
}

export interface AtualizarInquilinoInput {
  nome?: string;
  email?: string;
  telefone?: string;
}

/** CPF único: valida dígito verificador antes de tocar o banco (constraint única é a defesa final). */
export async function criarInquilino(
  prisma: PrismaClient,
  dados: CriarInquilinoInput,
  usuario = "desconhecido"
) {
  if (!cpfValido(dados.cpf)) {
    throw new AppError(422, "CPF inválido");
  }
  const cpf = normalizaCpf(dados.cpf);

  try {
    const inquilino = await prisma.inquilino.create({
      data: { nome: dados.nome, cpf, email: dados.email, telefone: dados.telefone },
    });
    await registrarLog(prisma, { entidade: ENTIDADE, entidadeId: inquilino.id, acao: "CRIADO", usuario });
    return inquilino;
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

/** Atualiza dados cadastrais (nome/email/telefone). CPF não é editável — exigiria novo cadastro. */
export async function atualizarInquilino(
  prisma: PrismaClient,
  id: string,
  dados: AtualizarInquilinoInput,
  usuario = "desconhecido"
) {
  await buscarInquilino(prisma, id);
  try {
    const atualizado = await prisma.inquilino.update({ where: { id }, data: dados });
    await registrarLog(prisma, {
      entidade: ENTIDADE,
      entidadeId: id,
      acao: "ATUALIZADO",
      usuario,
      detalhes: dados,
    });
    return atualizado;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "Já existe um inquilino com esse email");
    }
    throw err;
  }
}

/**
 * Soft delete: preserva o histórico de contratos/faturas em vez de apagar o registro.
 *
 * Bloqueia se houver contrato ativo vinculado — senão o contrato ficaria referenciando
 * um inquilino "excluído" e faturas continuariam sendo geradas normalmente para ele
 * todo mês, um estado inconsistente que ninguém vê pela listagem.
 *
 * CPF e email são "carimbados" com um sufixo no momento da exclusão (mantendo o valor
 * original recuperável só via banco/auditoria). Sem isso, cpf/email `@unique` no schema
 * bloqueariam para sempre um novo cadastro com o mesmo CPF — mesmo a pessoa já não
 * existindo mais nas listagens, o valor continuaria "reservado" por um registro invisível.
 */
export async function excluirInquilino(prisma: PrismaClient, id: string, usuario = "desconhecido") {
  const inquilino = await buscarInquilino(prisma, id);

  const contratoAtivo = await prisma.contrato.findFirst({ where: { inquilinoId: id, deletedAt: null } });
  if (contratoAtivo) {
    throw new AppError(409, "Não é possível excluir um inquilino com contrato ativo");
  }

  const sufixo = `__excluido_${Date.now()}`;
  const excluido = await prisma.inquilino.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      cpf: `${inquilino.cpf}${sufixo}`,
      email: inquilino.email ? `${inquilino.email}${sufixo}` : null,
    },
  });
  await registrarLog(prisma, { entidade: ENTIDADE, entidadeId: id, acao: "EXCLUIDO", usuario });
  return excluido;
}
