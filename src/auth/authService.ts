import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AppError } from "../lib/errors";

const SALT_ROUNDS = 10;
const EXPIRACAO_TOKEN = "12h";

export const Papel = { ADMIN: "ADMIN", OPERADOR: "OPERADOR" } as const;
export type Papel = (typeof Papel)[keyof typeof Papel];

export interface TokenPayload {
  sub: string;
  email: string;
  papel: Papel;
}

export interface CriarUsuarioInput {
  nome: string;
  email: string;
  senha: string;
  papel?: Papel;
}

async function criarUsuarioInterno(prisma: PrismaClient, dados: CriarUsuarioInput) {
  // Defesa em profundidade: o zod da rota já restringe `papel` a ADMIN/OPERADOR, mas uma
  // chamada direta ao service (sem passar pela rota) poderia gravar qualquer string.
  if (dados.papel && dados.papel !== Papel.ADMIN && dados.papel !== Papel.OPERADOR) {
    throw new AppError(422, "papel deve ser ADMIN ou OPERADOR");
  }
  const senhaHash = await bcrypt.hash(dados.senha, SALT_ROUNDS);
  try {
    const usuario = await prisma.usuario.create({
      data: { nome: dados.nome, email: dados.email, senhaHash, papel: dados.papel ?? Papel.OPERADOR },
    });
    return usuario;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "Já existe um usuário com esse email");
    }
    throw err;
  }
}

/**
 * Cria o primeiro usuário (ADMIN) do sistema. Só funciona enquanto não existir
 * nenhum usuário — depois disso, novos usuários só podem ser criados por um ADMIN
 * já autenticado (ver `criarUsuario`).
 */
export async function registrarPrimeiroAdmin(prisma: PrismaClient, dados: Omit<CriarUsuarioInput, "papel">) {
  const jaExisteAlguem = (await prisma.usuario.count()) > 0;
  if (jaExisteAlguem) {
    throw new AppError(409, "Já existe pelo menos um usuário cadastrado; peça para um ADMIN te criar uma conta");
  }
  return criarUsuarioInterno(prisma, { ...dados, papel: Papel.ADMIN });
}

/** Criação de usuário por um ADMIN já autenticado (ver middleware exigirPapel). */
export async function criarUsuario(prisma: PrismaClient, dados: CriarUsuarioInput) {
  return criarUsuarioInterno(prisma, dados);
}

export async function login(prisma: PrismaClient, email: string, senha: string, jwtSecret: string) {
  const usuario = await prisma.usuario.findUnique({ where: { email } });
  // Mesma mensagem genérica para "não existe" e "senha errada", para não revelar
  // quais emails estão cadastrados (evita enumeração de contas).
  if (!usuario || !usuario.ativo) {
    throw new AppError(401, "Email ou senha inválidos");
  }
  const senhaCorreta = await bcrypt.compare(senha, usuario.senhaHash);
  if (!senhaCorreta) {
    throw new AppError(401, "Email ou senha inválidos");
  }

  const payload: TokenPayload = { sub: usuario.id, email: usuario.email, papel: usuario.papel as Papel };
  const token = jwt.sign(payload, jwtSecret, { expiresIn: EXPIRACAO_TOKEN });

  return { token, usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel } };
}

export function verificarToken(token: string, jwtSecret: string): TokenPayload {
  try {
    return jwt.verify(token, jwtSecret) as TokenPayload;
  } catch {
    throw new AppError(401, "Token inválido ou expirado");
  }
}
