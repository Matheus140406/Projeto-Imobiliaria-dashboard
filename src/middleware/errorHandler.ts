import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "../lib/errors";

/** Handler central: loga o erro real no servidor e responde ao cliente só com o necessário. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function tratadorDeErros(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ erro: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ erro: "Entrada inválida", detalhes: err.issues.map((i) => i.message) });
    return;
  }

  if (err instanceof Error && "type" in err && err.type === "entity.too.large") {
    res.status(413).json({ erro: "Corpo da requisição excede o limite permitido" });
    return;
  }

  if (err instanceof SyntaxError && "status" in err && err.status === 400 && "type" in err && err.type === "entity.parse.failed") {
    res.status(400).json({ erro: "JSON inválido" });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") {
      res.status(404).json({ erro: "Registro não encontrado" });
      return;
    }
    if (err.code === "P2002") {
      res.status(409).json({ erro: "Registro duplicado" });
      return;
    }
  }

  console.error(err);
  res.status(500).json({ erro: "Erro interno" });
}
