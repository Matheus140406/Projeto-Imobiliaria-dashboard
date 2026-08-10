import { PrismaClient } from "@prisma/client";
import { StatusFatura } from "../lib/status";

export interface FiltroDashboard {
  competenciaInicio?: string;
  competenciaFim?: string;
  imovelId?: string;
  inquilinoId?: string;
}

function aplicarFiltros(filtro: FiltroDashboard) {
  return {
    ...(filtro.competenciaInicio || filtro.competenciaFim
      ? {
          competencia: {
            ...(filtro.competenciaInicio ? { gte: filtro.competenciaInicio } : {}),
            ...(filtro.competenciaFim ? { lte: filtro.competenciaFim } : {}),
          },
        }
      : {}),
    ...(filtro.imovelId || filtro.inquilinoId
      ? {
          contrato: {
            ...(filtro.imovelId ? { imovelId: filtro.imovelId } : {}),
            ...(filtro.inquilinoId ? { inquilinoId: filtro.inquilinoId } : {}),
          },
        }
      : {}),
  };
}

/** Soma de faturas pagas no período/filtro. */
export async function receitas(prisma: PrismaClient, filtro: FiltroDashboard = {}) {
  const resultado = await prisma.fatura.aggregate({
    where: { ...aplicarFiltros(filtro), status: StatusFatura.PAGO },
    _sum: { valorTotal: true },
    _count: true,
  });
  return { total: resultado._sum.valorTotal ?? 0, quantidade: resultado._count };
}

/** Faturas em atraso (inadimplência), com multa/juros já aplicados. */
export async function inadimplencia(prisma: PrismaClient, filtro: FiltroDashboard = {}) {
  const faturas = await prisma.fatura.findMany({
    where: { ...aplicarFiltros(filtro), status: StatusFatura.ATRASADO },
    include: { contrato: { include: { inquilino: true } } },
    orderBy: { dataVencimento: "asc" },
  });
  const total = faturas.reduce((soma, f) => soma + f.valorTotal, 0);
  return { total, quantidade: faturas.length, faturas };
}

/**
 * Faturas pendentes ainda não vencidas (a receber). Se `proximosDias` for informado,
 * restringe às que vencem entre hoje e hoje + N dias (ex.: "a receber nos próximos 7 dias").
 */
export async function aReceber(prisma: PrismaClient, filtro: FiltroDashboard = {}, proximosDias?: number) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const janela =
    proximosDias != null
      ? { dataVencimento: { gte: hoje, lte: new Date(hoje.getTime() + proximosDias * 86400000) } }
      : {};

  const resultado = await prisma.fatura.aggregate({
    where: { ...aplicarFiltros(filtro), ...janela, status: StatusFatura.PENDENTE },
    _sum: { valorTotal: true },
    _count: true,
  });
  return { total: resultado._sum.valorTotal ?? 0, quantidade: resultado._count };
}

/**
 * Listagem geral de faturas para a tela financeira, com filtros comuns: status,
 * competência e imóvel/inquilino. Traz inquilino/imóvel juntos para montar a tabela
 * (Inquilino, Imóvel, Vencimento, Status, Valor Original, Valor com Multa) sem N+1.
 */
export async function listarFaturas(
  prisma: PrismaClient,
  filtro: FiltroDashboard & { status?: string } = {}
) {
  return prisma.fatura.findMany({
    where: { ...aplicarFiltros(filtro), ...(filtro.status ? { status: filtro.status } : {}) },
    include: { contrato: { include: { inquilino: true, imovel: true } } },
    orderBy: { dataVencimento: "asc" },
  });
}

/** Contratos ativos cujo término está dentro dos próximos `diasLimite` dias. */
export async function contratosVencendo(prisma: PrismaClient, diasLimite = 30) {
  // Zera a hora para não excluir contratos que vencem "hoje" dependendo do horário
  // em que a rota é chamada (dataFim é armazenada à meia-noite).
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + diasLimite);

  return prisma.contrato.findMany({
    where: { status: "ATIVO", dataFim: { gte: hoje, lte: limite } },
    include: { inquilino: true },
    orderBy: { dataFim: "asc" },
  });
}

/** Faturas que viraram atrasadas na última execução do cron (últimas 24h). */
export async function faturasAtrasadasRecentemente(prisma: PrismaClient) {
  const desde = new Date();
  desde.setHours(desde.getHours() - 24);

  return prisma.fatura.findMany({
    where: { status: StatusFatura.ATRASADO, updatedAt: { gte: desde } },
    include: { contrato: { include: { inquilino: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

function competenciaDaData(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

/** Semana ISO (ano-Wsemana) de uma data, usada para agrupar faturas por semana. */
function semanaIsoDaData(data: Date): string {
  const referencia = new Date(Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()));
  const diaSemana = referencia.getUTCDay() || 7;
  referencia.setUTCDate(referencia.getUTCDate() + 4 - diaSemana);
  const inicioAno = new Date(Date.UTC(referencia.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((referencia.getTime() - inicioAno.getTime()) / 86400000 + 1) / 7);
  return `${referencia.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`;
}

export interface StatusPorPeriodoItem {
  periodo: string;
  status: string;
  quantidade: number;
  total: number;
}

/**
 * Agrupa faturas de um inquilino por status e por período (semana ou mês),
 * usando a data de vencimento como referência.
 */
export async function statusPorPeriodoInquilino(
  prisma: PrismaClient,
  inquilinoId: string,
  granularidade: "semana" | "mes" = "mes"
): Promise<StatusPorPeriodoItem[]> {
  const faturas = await prisma.fatura.findMany({
    where: { contrato: { inquilinoId } },
    orderBy: { dataVencimento: "asc" },
  });

  const agrupado = new Map<string, StatusPorPeriodoItem>();
  for (const fatura of faturas) {
    const periodo =
      granularidade === "semana"
        ? semanaIsoDaData(fatura.dataVencimento)
        : competenciaDaData(fatura.dataVencimento);
    const chave = `${periodo}|${fatura.status}`;

    const atual = agrupado.get(chave) ?? { periodo, status: fatura.status, quantidade: 0, total: 0 };
    atual.quantidade += 1;
    atual.total += fatura.valorTotal;
    agrupado.set(chave, atual);
  }

  return Array.from(agrupado.values()).sort((a, b) => a.periodo.localeCompare(b.periodo));
}

/** Visão consolidada para ações rápidas no topo do dashboard. */
export async function resumoAcaoRapida(prisma: PrismaClient) {
  const [rec, inad, receber, vencendo, atrasadasOntem] = await Promise.all([
    receitas(prisma),
    inadimplencia(prisma),
    aReceber(prisma),
    contratosVencendo(prisma),
    faturasAtrasadasRecentemente(prisma),
  ]);

  return {
    receitas: rec,
    inadimplencia: { total: inad.total, quantidade: inad.quantidade },
    aReceber: receber,
    contratosVencendo: vencendo.length,
    atrasadasNaUltimaNoite: atrasadasOntem.length,
  };
}
