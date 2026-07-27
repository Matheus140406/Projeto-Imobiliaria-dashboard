import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { gerarFaturaMensal, marcarFaturasAtrasadas } from "../financeiro/faturaService";
import { registrarPagamento } from "../financeiro/pagamentoService";
import { inadimplencia, receitas, statusPorPeriodoInquilino } from "../dashboard/dashboardService";

const prisma = new PrismaClient();

async function limparBanco() {
  await prisma.auditoriaPagamento.deleteMany();
  await prisma.pagamento.deleteMany();
  await prisma.fatura.deleteMany();
  await prisma.contrato.deleteMany();
  await prisma.inquilino.deleteMany();
}

async function criarContrato(overrides: Partial<{ diaVencimento: number }> = {}) {
  const inquilino = await prisma.inquilino.create({ data: { nome: "Maria Silva" } });
  return prisma.contrato.create({
    data: {
      inquilinoId: inquilino.id,
      imovel: "Apto 101",
      valorAluguel: 1000,
      diaVencimento: overrides.diaVencimento ?? 5,
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2027-01-01"),
    },
  });
}

beforeEach(limparBanco);
afterAll(async () => {
  await limparBanco();
  await prisma.$disconnect();
});

describe("fluxo de fatura e pagamento", () => {
  it("gera uma única fatura por competência", async () => {
    const contrato = await criarContrato();
    const referencia = new Date("2026-07-01");

    const primeira = await gerarFaturaMensal(prisma, contrato.id, referencia);
    const segunda = await gerarFaturaMensal(prisma, contrato.id, referencia);

    expect(segunda.id).toBe(primeira.id);
    expect(await prisma.fatura.count()).toBe(1);
  });

  it("marca fatura como atrasada após vencimento + 1 dia e recalcula multa/juros", async () => {
    const contrato = await criarContrato({ diaVencimento: 5 });
    await gerarFaturaMensal(prisma, contrato.id, new Date("2026-07-01"));

    const atualizadas = await marcarFaturasAtrasadas(prisma, new Date("2026-07-10"));

    expect(atualizadas).toHaveLength(1);
    expect(atualizadas[0].status).toBe("ATRASADO");
    expect(atualizadas[0].valorMulta).toBeCloseTo(20, 2);
    expect(atualizadas[0].valorJuros).toBeGreaterThan(0);

    const { total, quantidade } = await inadimplencia(prisma);
    expect(quantidade).toBe(1);
    expect(total).toBeCloseTo(atualizadas[0].valorTotal, 2);
  });

  it("registra pagamento manual, audita e penaliza scoring quando atrasado", async () => {
    const contrato = await criarContrato({ diaVencimento: 5 });
    const fatura = await gerarFaturaMensal(prisma, contrato.id, new Date("2026-07-01"));
    await marcarFaturasAtrasadas(prisma, new Date("2026-07-10"));
    const faturaAtrasada = await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } });

    const { fatura: faturaPaga } = await registrarPagamento(prisma, {
      faturaId: fatura.id,
      valorPago: faturaAtrasada.valorTotal,
      metodo: "PIX",
      registradoPor: "matheus",
    });

    expect(faturaPaga.status).toBe("PAGO");

    const auditorias = await prisma.auditoriaPagamento.findMany({ where: { faturaId: fatura.id } });
    expect(auditorias).toHaveLength(1);

    const inquilino = await prisma.inquilino.findFirstOrThrow();
    expect(inquilino.scoring).toBe(-10);

    const { total, quantidade } = await receitas(prisma);
    expect(quantidade).toBe(1);
    expect(total).toBeCloseTo(faturaPaga.valorTotal, 2);
  });

  it("impede pagamento duplicado de fatura já paga", async () => {
    const contrato = await criarContrato();
    const fatura = await gerarFaturaMensal(prisma, contrato.id, new Date("2026-07-01"));
    await registrarPagamento(prisma, {
      faturaId: fatura.id,
      valorPago: 1000,
      metodo: "PIX",
      registradoPor: "matheus",
    });

    await expect(
      registrarPagamento(prisma, { faturaId: fatura.id, valorPago: 1000, metodo: "PIX", registradoPor: "matheus" })
    ).rejects.toThrow("Fatura já está paga");
  });

  it("agrupa faturas do inquilino por mês e por status", async () => {
    const contrato = await criarContrato({ diaVencimento: 5 });
    await gerarFaturaMensal(prisma, contrato.id, new Date("2026-06-01"));
    const faturaJulho = await gerarFaturaMensal(prisma, contrato.id, new Date("2026-07-01"));
    await registrarPagamento(prisma, {
      faturaId: faturaJulho.id,
      valorPago: 1000,
      metodo: "PIX",
      registradoPor: "matheus",
    });

    const status = await statusPorPeriodoInquilino(prisma, contrato.inquilinoId, "mes");

    expect(status).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ periodo: "2026-06", status: "PENDENTE", quantidade: 1 }),
        expect.objectContaining({ periodo: "2026-07", status: "PAGO", quantidade: 1 }),
      ])
    );
  });

  it("agrupa faturas do inquilino por semana ISO", async () => {
    const contrato = await criarContrato({ diaVencimento: 5 });
    await gerarFaturaMensal(prisma, contrato.id, new Date("2026-07-01"));

    const status = await statusPorPeriodoInquilino(prisma, contrato.inquilinoId, "semana");

    expect(status).toHaveLength(1);
    expect(status[0].status).toBe("PENDENTE");
    expect(status[0].periodo).toMatch(/^2026-W\d{2}$/);
  });
});
