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

export const StatusImovel = {
  DISPONIVEL: "DISPONIVEL",
  ALUGADO: "ALUGADO",
  MANUTENCAO: "MANUTENCAO",
} as const;
export type StatusImovel = (typeof StatusImovel)[keyof typeof StatusImovel];

export const TipoGarantia = {
  CAUCAO: "CAUCAO",
  FIADOR: "FIADOR",
} as const;
export type TipoGarantia = (typeof TipoGarantia)[keyof typeof TipoGarantia];
