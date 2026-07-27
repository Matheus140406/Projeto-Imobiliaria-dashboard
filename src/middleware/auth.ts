import { createHash, timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Identificador do operador autenticado, usado em trilhas de auditoria. */
      usuario?: string;
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
 * Autentica requisições via header `x-api-key`. Não há sistema de usuários ainda,
 * então o operador é identificado pelo header `x-usuario` (auditoria), mas só é aceito
 * com a API key correta — não substitui autenticação real.
 */
export function autenticar(apiKey: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const chaveRecebida = req.header("x-api-key");
    if (!chaveRecebida || !comparaEmTempoConstante(chaveRecebida, apiKey)) {
      res.status(401).json({ erro: "Não autorizado" });
      return;
    }
    const usuarioBruto = req.header("x-usuario")?.trim();
    req.usuario = usuarioBruto
      ? usuarioBruto.replace(/[\r\n\t]/g, " ").slice(0, TAMANHO_MAX_USUARIO)
      : "desconhecido";
    next();
  };
}
