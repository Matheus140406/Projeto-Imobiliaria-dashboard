import { PrismaClient } from "@prisma/client";
import { StatusFatura } from "../lib/status";

export interface FiltroDashboard {
  competenciaInicio?: string;
  competenciaFim?: string;
  imovel?: string;
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
    ...(filtro.imovel || filtro.inquilinoId
      ? {
          contrato: {
            ...(filtro.imovel ? { imovel: filtro.imovel } : {}),
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

/** Faturas pendentes ainda não vencidas (a receber). */
export async function aReceber(prisma: PrismaClient, filtro: FiltroDashboard = {}) {
  const resultado = await prisma.fatura.aggregate({
    where: { ...aplicarFiltros(filtro), status: StatusFatura.PENDENTE },
    _sum: { valorTotal: true },
    _count: true,
  });
  return { total: resultado._sum.valorTotal ?? 0, quantidade: resultado._count };
}

/** Contratos ativos cujo término está dentro dos próximos `diasLimite` dias. */
export async function contratosVencendo(prisma: PrismaClient, diasLimite = 30) {
  const hoje = new Date();
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
