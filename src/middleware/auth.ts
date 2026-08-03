import { createHash, timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { verificarToken, type Papel } from "../auth/authService";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Identificador do operador autenticado, usado em trilhas de auditoria. */
      usuario?: string;
      /** Presente só quando a requisição veio com um JWT de usuário válido (login). */
      usuarioLogado?: { id: string; email: string; papel: Papel };
    }
  }
}

const TAMANHO_MAX_USUARIO = 120;

function hash(valor: string): Buffer {
  return createHash("sha256").update(valor, "utf8").digest();
}

/**
 * Compara em tempo constante independente do tamanho das entradas: comparar os hashes
 * (sempre 32 bytes) evita que o tempo de resposta vaze até o comprimento da chave real.
 */
function comparaEmTempoConstante(a: string, b: string): boolean {
  return timingSafeEqual(hash(a), hash(b));
}

/**
 * Autentica requisições via header `x-api-key` (gate de rede — serviço-a-serviço).
 * Se além disso vier um `Authorization: Bearer <token>` de login válido, identifica
 * o operador de verdade (req.usuarioLogado) para auditoria e controle de papel; senão,
 * cai para o rótulo livre `x-usuario` (não autenticado, só um nome para log).
 */
export function autenticar(apiKey: string, jwtSecret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const chaveRecebida = req.header("x-api-key");
    if (!chaveRecebida || !comparaEmTempoConstante(chaveRecebida, apiKey)) {
      res.status(401).json({ erro: "Não autorizado" });
      return;
    }

    const authHeader = req.header("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice("Bearer ".length);
      const payload = verificarToken(token, jwtSecret);
      req.usuarioLogado = { id: payload.sub, email: payload.email, papel: payload.papel };
      req.usuario = payload.email;
      next();
      return;
    }

    const usuarioBruto = req.header("x-usuario")?.trim();
    req.usuario = usuarioBruto
      ? usuarioBruto.replace(/[\r\n\t]/g, " ").slice(0, TAMANHO_MAX_USUARIO)
      : "desconhecido";
    next();
  };
}

/**
 * Restringe a rota a um papel específico. Exige login (Bearer token) — a API key
 * sozinha, sem login, não basta para ações sensíveis (excluir cadastro, encerrar
 * contrato). Usado como defesa em profundidade para operações destrutivas.
 */
export function exigirPapel(papel: Papel) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuarioLogado) {
      res.status(401).json({ erro: "Esta ação exige login (Authorization: Bearer <token>)" });
      return;
    }
    if (req.usuarioLogado.papel !== papel) {
      res.status(403).json({ erro: `Esta ação exige o papel ${papel}` });
      return;
    }
    next();
  };
}
