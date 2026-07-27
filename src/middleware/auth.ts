import { timingSafeEqual } from "crypto";
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

function comparaEmTempoConstante(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
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
    req.usuario = req.header("x-usuario")?.trim() || "desconhecido";
    next();
  };
}
