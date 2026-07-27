export const StatusFatura = {
  PENDENTE: "PENDENTE",
  PAGO: "PAGO",
  ATRASADO: "ATRASADO",
  CANCELADO: "CANCELADO",
} as const;
export type StatusFatura = (typeof StatusFatura)[keyof typeof StatusFatura];

export const StatusContrato = {
  ATIVO: "ATIVO",
  ENCERRADO: "ENCERRADO",
  SUSPENSO: "SUSPENSO",
} as const;
export type StatusContrato = (typeof StatusContrato)[keyof typeof StatusContrato];
