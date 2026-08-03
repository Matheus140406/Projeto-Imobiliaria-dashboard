/** Erro operacional esperado (entrada inválida, regra de negócio), seguro para expor ao cliente. */
export class AppError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
  }
}
