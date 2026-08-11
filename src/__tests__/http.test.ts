import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
// `import` é hoisted para o topo do módulo, então mexer em process.env antes deste import
// não teria efeito: o .env já teria sido carregado pelo side-effect de `../index`.
import app from "../index";
import { prisma } from "../lib/prisma";

// Usa a mesma API_KEY que o processo carregou do .env, em vez de tentar sobrepor via env var.
const API_KEY = process.env.API_KEY as string;

async function limparBanco() {
  await prisma.auditoriaPagamento.deleteMany();
  await prisma.pagamento.deleteMany();
  await prisma.fatura.deleteMany();
  await prisma.contrato.updateMany({ data: { renovadoDeId: null } });
  await prisma.contrato.deleteMany();
  await prisma.inquilino.deleteMany();
  await prisma.imovel.deleteMany();
  await prisma.fiador.deleteMany();
}

let contadorCpf = 0;
function proximoCpfDeTeste(): string {
  contadorCpf += 1;
  return String(30000000000 + contadorCpf).padStart(11, "0");
}

beforeAll(limparBanco);
afterAll(async () => {
  await limparBanco();
  await prisma.$disconnect();
});

describe("segurança da API", () => {
  it("rejeita requisições sem API key", async () => {
    const resposta = await request(app).get("/api/dashboard/resumo");
    expect(resposta.status).toBe(401);
  });

  it("rejeita API key incorreta", async () => {
    const resposta = await request(app).get("/api/dashboard/resumo").set("x-api-key", "chave-errada");
    expect(resposta.status).toBe(401);
  });

  it("aceita requisições com a API key correta", async () => {
    const resposta = await request(app).get("/api/dashboard/resumo").set("x-api-key", API_KEY);
    expect(resposta.status).toBe(200);
  });

  it("não expõe detalhes internos em erro inesperado (id inexistente)", async () => {
    const resposta = await request(app)
      .post("/api/faturas/gerar/id-que-nao-existe")
      .set("x-api-key", API_KEY);

    expect(resposta.status).toBe(404);
    expect(resposta.body).toEqual({ erro: "Registro não encontrado" });
    expect(JSON.stringify(resposta.body)).not.toMatch(/prisma|PrismaClient|at\s+\w+\s+\(/i);
  });

  it("rejeita método de pagamento fora da lista permitida", async () => {
    const inquilino = await prisma.inquilino.create({ data: { nome: "Teste HTTP", cpf: proximoCpfDeTeste() } });
    const imovel = await prisma.imovel.create({ data: { endereco: "Apto HTTP", valorPadrao: 500 } });
    const contrato = await prisma.contrato.create({
      data: {
        inquilinoId: inquilino.id,
        imovelId: imovel.id,
        valorAluguel: 500,
        diaVencimento: 5,
        tipoGarantia: "CAUCAO",
        valorCaucao: 1500,
        dataInicio: new Date("2026-01-01"),
        dataFim: new Date("2027-01-01"),
      },
    });
    const fatura = await prisma.fatura.create({
      data: {
        contratoId: contrato.id,
        competencia: "2026-08",
        valorOriginal: 500,
        valorTotal: 500,
        dataVencimento: new Date("2026-08-05"),
      },
    });

    const resposta = await request(app)
      .post(`/api/faturas/${fatura.id}/pagamentos`)
      .set("x-api-key", API_KEY)
      .send({ valorPago: 500, metodo: "CRIPTOMOEDA_OBSCURA" });

    expect(resposta.status).toBe(400);
  });

  it("usa o header x-usuario autenticado como responsável pela auditoria, ignorando o corpo", async () => {
    const inquilino = await prisma.inquilino.create({
      data: { nome: "Teste Auditoria", cpf: proximoCpfDeTeste() },
    });
    const imovel = await prisma.imovel.create({ data: { endereco: "Apto Auditoria", valorPadrao: 300 } });
    const contrato = await prisma.contrato.create({
      data: {
        inquilinoId: inquilino.id,
        imovelId: imovel.id,
        valorAluguel: 300,
        diaVencimento: 5,
        tipoGarantia: "CAUCAO",
        valorCaucao: 900,
        dataInicio: new Date("2026-01-01"),
        dataFim: new Date("2027-01-01"),
      },
    });
    const fatura = await prisma.fatura.create({
      data: {
        contratoId: contrato.id,
        competencia: "2026-09",
        valorOriginal: 300,
        valorTotal: 300,
        dataVencimento: new Date("2026-09-05"),
      },
    });

    const resposta = await request(app)
      .post(`/api/faturas/${fatura.id}/pagamentos`)
      .set("x-api-key", API_KEY)
      .set("x-usuario", "operador-real")
      .send({ valorPago: 300, metodo: "PIX", registradoPor: "nome-forjado" });

    expect(resposta.status).toBe(201);
    const auditoria = await prisma.auditoriaPagamento.findFirstOrThrow({ where: { faturaId: fatura.id } });
    expect(auditoria.usuario).toBe("operador-real");
  });

  it("rejeita renovar contrato sem estar autenticado como ADMIN (só x-api-key não basta)", async () => {
    const inquilino = await prisma.inquilino.create({ data: { nome: "Teste Renovar", cpf: proximoCpfDeTeste() } });
    const imovel = await prisma.imovel.create({
      data: { endereco: "Apto Renovar", valorPadrao: 500, status: "ALUGADO" },
    });
    const contrato = await prisma.contrato.create({
      data: {
        inquilinoId: inquilino.id,
        imovelId: imovel.id,
        valorAluguel: 500,
        diaVencimento: 5,
        tipoGarantia: "CAUCAO",
        valorCaucao: 1500,
        dataInicio: new Date("2026-01-01"),
        dataFim: new Date("2026-06-01"),
      },
    });

    const resposta = await request(app)
      .post(`/api/contratos/${contrato.id}/renovar`)
      .set("x-api-key", API_KEY)
      .send({ novaDataFim: "2027-01-01" });

    expect(resposta.status).toBe(401);
    const contratoInalterado = await prisma.contrato.findUniqueOrThrow({ where: { id: contrato.id } });
    expect(contratoInalterado.status).toBe("ATIVO");
  });
});
