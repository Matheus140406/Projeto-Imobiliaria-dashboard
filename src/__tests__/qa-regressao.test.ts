import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { gerarFaturaMensal, marcarFaturasAtrasadas } from "../financeiro/faturaService";
import { registrarPagamento } from "../financeiro/pagamentoService";
import { contratosVencendo } from "../dashboard/dashboardService";
import { tratadorDeErros } from "../middleware/errorHandler";
import { AppError } from "../lib/errors";

const prisma = new PrismaClient();

async function limparBanco() {
  await prisma.auditoriaPagamento.deleteMany();
  await prisma.pagamento.deleteMany();
  await prisma.fatura.deleteMany();
  await prisma.contrato.deleteMany();
  await prisma.inquilino.deleteMany();
  await prisma.imovel.deleteMany();
  await prisma.fiador.deleteMany();
}

let contadorCpf = 0;
function proximoCpfDeTeste(): string {
  contadorCpf += 1;
  return String(20000000000 + contadorCpf).padStart(11, "0");
}

async function criarContrato(overrides: Partial<{ diaVencimento: number; dataFim: Date }> = {}) {
  const inquilino = await prisma.inquilino.create({ data: { nome: "Inquilino QA", cpf: proximoCpfDeTeste() } });
  const imovel = await prisma.imovel.create({ data: { endereco: "Apto QA", valorPadrao: 1000 } });
  return prisma.contrato.create({
    data: {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      valorAluguel: 1000,
      diaVencimento: overrides.diaVencimento ?? 5,
      tipoGarantia: "CAUCAO",
      valorCaucao: 3000,
      dataInicio: new Date("2026-01-01"),
      dataFim: overrides.dataFim ?? new Date("2027-01-01"),
    },
  });
}

beforeEach(limparBanco);
afterAll(async () => {
  await limparBanco();
  await prisma.$disconnect();
});

describe("regra de negócio: vencimento + 1 dia < hoje", () => {
  it("NÃO marca como atrasada 1 dia após o vencimento (ainda dentro da carência)", async () => {
    const contrato = await criarContrato({ diaVencimento: 5 });
    await gerarFaturaMensal(prisma, contrato.id, new Date("2026-07-01"));

    // vencimento = 2026-07-05; referência = 2026-07-06 (D+1) => vencimento+1 não é < hoje ainda
    const atualizadas = await marcarFaturasAtrasadas(prisma, new Date("2026-07-06"));

    expect(atualizadas).toHaveLength(0);
    const fatura = await prisma.fatura.findFirstOrThrow({ where: { contratoId: contrato.id } });
    expect(fatura.status).toBe("PENDENTE");
  });

  it("marca como atrasada exatamente quando vencimento + 1 dia já passou (D+2)", async () => {
    const contrato = await criarContrato({ diaVencimento: 5 });
    await gerarFaturaMensal(prisma, contrato.id, new Date("2026-07-01"));

    // vencimento = 2026-07-05; referência = 2026-07-07 (D+2) => vencimento+1 (07-06) < hoje (07-07)
    const atualizadas = await marcarFaturasAtrasadas(prisma, new Date("2026-07-07"));

    expect(atualizadas).toHaveLength(1);
    expect(atualizadas[0].status).toBe("ATRASADO");
  });

  it("não marca no próprio dia do vencimento", async () => {
    const contrato = await criarContrato({ diaVencimento: 5 });
    await gerarFaturaMensal(prisma, contrato.id, new Date("2026-07-01"));

    const atualizadas = await marcarFaturasAtrasadas(prisma, new Date("2026-07-05"));

    expect(atualizadas).toHaveLength(0);
  });
});

describe("scoring usa a data real, não o status possivelmente desatualizado", () => {
  it("penaliza pagamento feito após o vencimento mesmo se o cron ainda não rodou (fatura ainda PENDENTE)", async () => {
    const contrato = await criarContrato({ diaVencimento: 5 });
    const fatura = await gerarFaturaMensal(prisma, contrato.id, new Date("2026-07-01"));
    // Nenhuma chamada a marcarFaturasAtrasadas: fatura continua "PENDENTE" no banco,
    // mas já passou 3 dias do vencimento no momento do pagamento.
    const faturaAntes = await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } });
    expect(faturaAntes.status).toBe("PENDENTE");

    await registrarPagamento(prisma, {
      faturaId: fatura.id,
      valorPago: faturaAntes.valorTotal,
      metodo: "PIX",
      registradoPor: "qa",
      dataPagamento: new Date("2026-07-08"),
    });

    const inquilino = await prisma.inquilino.findFirstOrThrow();
    expect(inquilino.scoring).toBe(-10);
  });

  it("recompensa pagamento feito antes ou no dia do vencimento", async () => {
    const contrato = await criarContrato({ diaVencimento: 5 });
    const fatura = await gerarFaturaMensal(prisma, contrato.id, new Date("2026-07-01"));

    await registrarPagamento(prisma, {
      faturaId: fatura.id,
      valorPago: 1000,
      metodo: "PIX",
      registradoPor: "qa",
      dataPagamento: new Date("2026-07-05"),
    });

    const inquilino = await prisma.inquilino.findFirstOrThrow();
    expect(inquilino.scoring).toBe(5);
  });
});

describe("validação defensiva do pagamentoService (independente da rota HTTP)", () => {
  it("rejeita valorPago zero mesmo chamando o service diretamente", async () => {
    const contrato = await criarContrato();
    const fatura = await gerarFaturaMensal(prisma, contrato.id, new Date("2026-07-01"));

    await expect(
      registrarPagamento(prisma, { faturaId: fatura.id, valorPago: 0, metodo: "PIX", registradoPor: "qa" })
    ).rejects.toThrow(/maior que zero/);
  });

  it("rejeita valorPago negativo", async () => {
    const contrato = await criarContrato();
    const fatura = await gerarFaturaMensal(prisma, contrato.id, new Date("2026-07-01"));

    await expect(
      registrarPagamento(prisma, { faturaId: fatura.id, valorPago: -50, metodo: "PIX", registradoPor: "qa" })
    ).rejects.toThrow(/maior que zero/);
  });

  it("rejeita valorPago não finito (Infinity/NaN)", async () => {
    const contrato = await criarContrato();
    const fatura = await gerarFaturaMensal(prisma, contrato.id, new Date("2026-07-01"));

    await expect(
      registrarPagamento(prisma, { faturaId: fatura.id, valorPago: Infinity, metodo: "PIX", registradoPor: "qa" })
    ).rejects.toThrow(/finito/);
  });
});

describe("concorrência em gerarFaturaMensal", () => {
  it("duas chamadas concorrentes para o mesmo contrato/competência não quebram, e retornam a mesma fatura", async () => {
    const contrato = await criarContrato({ diaVencimento: 5 });
    const referencia = new Date("2026-07-01");

    const [faturaA, faturaB] = await Promise.all([
      gerarFaturaMensal(prisma, contrato.id, referencia),
      gerarFaturaMensal(prisma, contrato.id, referencia),
    ]);

    expect(faturaA.id).toBe(faturaB.id);
    expect(await prisma.fatura.count({ where: { contratoId: contrato.id } })).toBe(1);
  });
});

describe("contratosVencendo considera contratos que terminam hoje", () => {
  it("inclui contrato cujo término é hoje, independentemente do horário atual", async () => {
    const hojeInicioDoDia = new Date();
    hojeInicioDoDia.setHours(0, 0, 0, 0);

    const contrato = await criarContrato({ dataFim: hojeInicioDoDia });

    const resultado = await contratosVencendo(prisma, 0);

    expect(resultado.map((c) => c.id)).toContain(contrato.id);
  });
});

describe("tratadorDeErros não tenta responder duas vezes", () => {
  it("delega ao próximo handler quando os headers já foram enviados", () => {
    let nextChamadoCom: unknown;
    const resFake = {
      headersSent: true,
      status: () => {
        throw new Error("não deveria tentar setar status após headers enviados");
      },
    };
    const next = (err: unknown) => {
      nextChamadoCom = err;
    };

    const erroOriginal = new AppError(400, "erro qualquer");
    // @ts-expect-error -- objetos fake mínimos o suficiente para o teste
    tratadorDeErros(erroOriginal, {}, resFake, next);

    expect(nextChamadoCom).toBe(erroOriginal);
  });
});
