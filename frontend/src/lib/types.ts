export type StatusFatura = "PENDENTE" | "PAGO" | "ATRASADO" | "CANCELADO";
export type StatusImovel = "DISPONIVEL" | "ALUGADO" | "MANUTENCAO";
export type TipoGarantia = "CAUCAO" | "FIADOR";
export type TipoFatura = "ALUGUEL" | "IPTU";
export type Metodo = "PIX" | "BOLETO" | "DINHEIRO" | "CARTAO" | "TRANSFERENCIA";

export interface Inquilino {
  id: string;
  nome: string;
  cpf: string;
  email?: string | null;
  telefone?: string | null;
  scoring: number;
  createdAt: string;
}

export interface Fiador {
  id: string;
  nome: string;
  cpf: string;
  ativo: boolean;
  contratos?: Contrato[];
}

export interface Imovel {
  id: string;
  endereco: string;
  valorPadrao: number;
  valorIptuMensal?: number | null;
  status: StatusImovel;
  contratoAtivo?: Contrato | null;
}

export interface Contrato {
  id: string;
  inquilinoId: string;
  imovelId: string;
  fiadorId?: string | null;
  inquilino?: Inquilino;
  imovel?: Imovel;
  valorAluguel: number;
  diaVencimento: number;
  percentualMulta: number;
  taxaJurosDiaria: number;
  tipoGarantia: TipoGarantia;
  valorCaucao?: number | null;
  responsavelIptu: "INQUILINO" | "PROPRIETARIO";
  dataInicio: string;
  dataFim: string;
  status: string;
  renovadoDeId?: string | null;
}

export interface Fatura {
  id: string;
  contratoId: string;
  contrato: Contrato;
  competencia: string;
  tipo: TipoFatura;
  valorOriginal: number;
  valorMulta: number;
  valorJuros: number;
  valorTotal: number;
  dataVencimento: string;
  status: StatusFatura;
  paidDate?: string;
}

export interface DetalheFatura extends Fatura {
  calculoAtual: { diasAtraso: number; valorMulta: number; valorJuros: number; valorTotal: number };
  pagamentos: { id: string; valorPago: number; dataPagamento: string; metodo: Metodo }[];
}

export interface Resumo {
  receitas: { total: number; quantidade: number };
  inadimplencia: { total: number; quantidade: number };
  aReceber: { total: number; quantidade: number };
  contratosVencendo: number;
  atrasadasNaUltimaNoite: number;
}
