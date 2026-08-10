import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { criarInquilino, atualizarInquilino } from "../cadastros/inquilinoService";
import { criarImovel, atualizarImovel } from "../cadastros/imovelService";
import { criarContrato, historicoParcelas } from "../cadastros/contratoService";
import { avaliarDicasContrato, gerarPdfContrato, montarTextoContrato } from "../contratos/contratoDocumentoService";
import { aReceber, listarFaturas } from "../dashboard/dashboardService";
import { detalheFatura } from "../financeiro/faturaService";
import { registrarPagamento } from "../financeiro/pagamentoService";

const prisma = new PrismaClient();

const CPF_1 = "52998224725";
const CPF_2 = "11144477735";
const CPF_3 = "71428793860";

async function limparBanco() {
  await prisma.logAtividade.deleteMany();
  await prisma.auditoriaPagamento.deleteMany();
  await prisma.pagamento.deleteMany();
  await prisma.fatura.deleteMany();
  await prisma.aditivo.deleteMany();
  // Zera a auto-referência (renovação) antes de apagar, senão o FK impede o delete.
  await prisma.contrato.updateMany({ data: { renovadoDeId: null } });
  await prisma.contrato.deleteMany();
  await prisma.inquilino.deleteMany();
  await prisma.imovel.deleteMany();
  await prisma.fiador.deleteMany();
}

beforeEach(limparBanco);
afterAll(async () => {
  await limparBanco();
  await prisma.$disconnect();
});

describe("IPTU: gerado junto com a fatura de aluguel quando é responsabilidade do inquilino", () => {
  it("gera fatura de ALUGUEL e de IPTU para cada mês quando o imóvel tem valorIptuMensal", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino IPTU", cpf: CPF_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua IPTU, 1", valorPadrao: 1000, valorIptuMensal: 80 });

    const contrato = await criarContrato(prisma, {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      valorAluguel: 1000,
      diaVencimento: 10,
      tipoGarantia: "CAUCAO",
      valorCaucao: 3000,
      dataInicio: new Date("2026-01-15"),
      dataFim: new Date("2026-03-20"),
    });

    const parcelas = await historicoParcelas(prisma, contrato.id);
    const aluguel = parcelas.filter((p) => p.tipo === "ALUGUEL");
    const iptu = parcelas.filter((p) => p.tipo === "IPTU");

    expect(aluguel).toHaveLength(3);
    expect(iptu).toHaveLength(3);
    expect(iptu.every((p) => p.valorOriginal === 80)).toBe(true);
  });

  it("não gera fatura de IPTU quando a responsabilidade é do proprietário", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino Sem IPTU", cpf: CPF_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua IPTU, 2", valorPadrao: 1000, valorIptuMensal: 80 });

    const contrato = await criarContrato(prisma, {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      valorAluguel: 1000,
      diaVencimento: 10,
      tipoGarantia: "CAUCAO",
      valorCaucao: 3000,
      responsavelIptu: "PROPRIETARIO",
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2026-02-01"),
    });

    const parcelas = await historicoParcelas(prisma, contrato.id);
    expect(parcelas.every((p) => p.tipo === "ALUGUEL")).toBe(true);
  });

  it("não gera fatura de IPTU quando o imóvel não tem valorIptuMensal configurado", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino Sem Valor", cpf: CPF_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua IPTU, 3", valorPadrao: 1000 });

    const contrato = await criarContrato(prisma, {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      valorAluguel: 1000,
      diaVencimento: 10,
      tipoGarantia: "CAUCAO",
      valorCaucao: 3000,
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2026-02-01"),
    });

    const parcelas = await historicoParcelas(prisma, contrato.id);
    expect(parcelas.every((p) => p.tipo === "ALUGUEL")).toBe(true);
  });

  it("registra pagamento de fatura de IPTU normalmente (mesmo motor de pagamento)", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino Paga IPTU", cpf: CPF_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua IPTU, 4", valorPadrao: 1000, valorIptuMensal: 80 });

    const contrato = await criarContrato(prisma, {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      valorAluguel: 1000,
      diaVencimento: 10,
      tipoGarantia: "CAUCAO",
      valorCaucao: 3000,
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2026-02-01"),
    });

    const parcelas = await historicoParcelas(prisma, contrato.id);
    const faturaIptu = parcelas.find((p) => p.tipo === "IPTU")!;

    const { fatura } = await registrarPagamento(prisma, {
      faturaId: faturaIptu.id,
      valorPago: 80,
      metodo: "PIX",
      registradoPor: "teste",
    });

    expect(fatura.status).toBe("PAGO");
  });
});

describe("validação de sobreposição de datas no mesmo imóvel", () => {
  it("rejeita novo contrato ativo cujo período se sobrepõe a um já existente", async () => {
    const inquilino1 = await criarInquilino(prisma, { nome: "Inquilino A", cpf: CPF_1 });
    const inquilino2 = await criarInquilino(prisma, { nome: "Inquilino B", cpf: CPF_2 });
    const imovel = await criarImovel(prisma, { endereco: "Rua Sobreposta, 1", valorPadrao: 1000 });

    await criarContrato(prisma, {
      inquilinoId: inquilino1.id,
      imovelId: imovel.id,
      valorAluguel: 1000,
      diaVencimento: 5,
      tipoGarantia: "CAUCAO",
      valorCaucao: 3000,
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2026-06-01"),
    });

    // Força o imóvel de volta a DISPONIVEL manualmente para isolar a checagem de
    // sobreposição da checagem de status (defesa em profundidade).
    await prisma.imovel.update({ where: { id: imovel.id }, data: { status: "DISPONIVEL" } });

    await expect(
      criarContrato(prisma, {
        inquilinoId: inquilino2.id,
        imovelId: imovel.id,
        valorAluguel: 1000,
        diaVencimento: 5,
        tipoGarantia: "CAUCAO",
        valorCaucao: 3000,
        dataInicio: new Date("2026-03-01"),
        dataFim: new Date("2026-09-01"),
      })
    ).rejects.toThrow(/já existe um contrato ativo/i);
  });
});

describe("edição de cadastros preserva o que não foi alterado", () => {
  it("atualiza email do inquilino mantendo nome e cpf", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Nome Original", cpf: CPF_1 });
    const atualizado = await atualizarInquilino(prisma, inquilino.id, { email: "novo@teste.com" });

    expect(atualizado.nome).toBe("Nome Original");
    expect(atualizado.cpf).toBe(CPF_1);
    expect(atualizado.email).toBe("novo@teste.com");
  });

  it("bloqueia mudar status manualmente de um imóvel alugado", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino", cpf: CPF_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua Edição, 1", valorPadrao: 1000 });
    await criarContrato(prisma, {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      valorAluguel: 1000,
      diaVencimento: 5,
      tipoGarantia: "CAUCAO",
      valorCaucao: 3000,
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2026-04-01"),
    });

    await expect(atualizarImovel(prisma, imovel.id, { status: "MANUTENCAO" })).rejects.toThrow(
      /controlado pelo contrato/
    );
  });
});

describe("log de atividade registra ações de cadastro", () => {
  it("registra CRIADO ao cadastrar inquilino e EXCLUIDO ao remover", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino Log", cpf: CPF_1 }, "usuario-teste");

    const { excluirInquilino } = await import("../cadastros/inquilinoService");
    await excluirInquilino(prisma, inquilino.id, "usuario-teste");

    const logs = await prisma.logAtividade.findMany({
      where: { entidade: "Inquilino", entidadeId: inquilino.id },
      orderBy: { createdAt: "asc" },
    });

    expect(logs.map((l) => l.acao)).toEqual(["CRIADO", "EXCLUIDO"]);
    expect(logs.every((l) => l.usuario === "usuario-teste")).toBe(true);
    expect(logs.every((l) => l.createdAt instanceof Date)).toBe(true);
  });
});

describe("gerador de contrato profissional (texto e PDF)", () => {
  it("gera dicas quando faltam dados recomendados", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino Sem Contato", cpf: CPF_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua Contrato, 1", valorPadrao: 1000 });
    const contrato = await criarContrato(prisma, {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      valorAluguel: 1000,
      diaVencimento: 5,
      tipoGarantia: "CAUCAO",
      valorCaucao: 3000,
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2026-04-01"),
    });

    const { buscarContrato } = await import("../cadastros/contratoService");
    const contratoCompleto = await buscarContrato(prisma, contrato.id);
    const dicas = avaliarDicasContrato(contratoCompleto);

    expect(dicas.some((d) => /email/i.test(d))).toBe(true);
    expect(dicas.some((d) => /telefone/i.test(d))).toBe(true);
    expect(dicas.some((d) => /IPTU/i.test(d))).toBe(true);
  });

  it("monta o texto do contrato com os valores corretos", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Carlos Souza", cpf: CPF_3 });
    const imovel = await criarImovel(prisma, { endereco: "Av. Principal, 500", valorPadrao: 2000 });
    const contrato = await criarContrato(prisma, {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      valorAluguel: 2000,
      diaVencimento: 10,
      tipoGarantia: "CAUCAO",
      valorCaucao: 6000,
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2026-06-01"),
    });

    const { buscarContrato } = await import("../cadastros/contratoService");
    const contratoCompleto = await buscarContrato(prisma, contrato.id);
    const texto = montarTextoContrato(contratoCompleto);

    expect(texto).toContain("Carlos Souza");
    expect(texto).toContain("Av. Principal, 500");
    expect(texto).toContain("R$");
  });

  it("gera um PDF válido (buffer começando com a assinatura %PDF)", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Fernanda Lima", cpf: CPF_2 });
    const imovel = await criarImovel(prisma, { endereco: "Rua PDF, 10", valorPadrao: 1500 });
    const contrato = await criarContrato(prisma, {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      valorAluguel: 1500,
      diaVencimento: 5,
      tipoGarantia: "CAUCAO",
      valorCaucao: 4500,
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2026-04-01"),
    });

    const { buscarContrato } = await import("../cadastros/contratoService");
    const contratoCompleto = await buscarContrato(prisma, contrato.id);
    const pdf = await gerarPdfContrato(contratoCompleto);

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("dashboard: listagem geral de faturas e janela de dias em a-receber", () => {
  it("lista faturas com inquilino e imóvel já incluídos", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino Lista", cpf: CPF_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua Lista, 1", valorPadrao: 1000 });
    const contrato = await criarContrato(prisma, {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      valorAluguel: 1000,
      diaVencimento: 5,
      tipoGarantia: "CAUCAO",
      valorCaucao: 3000,
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2026-02-01"),
    });

    const faturas = await listarFaturas(prisma, {});
    const faturaDoContrato = faturas.find((f) => f.contratoId === contrato.id);
    expect(faturaDoContrato?.contrato.inquilino.nome).toBe("Inquilino Lista");
    expect(faturaDoContrato?.contrato.imovel.endereco).toBe("Rua Lista, 1");
  });

  it("restringe a-receber à janela de dias quando informada", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino Janela", cpf: CPF_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua Janela, 1", valorPadrao: 1000 });
    await criarContrato(prisma, {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      valorAluguel: 1000,
      diaVencimento: 5,
      tipoGarantia: "CAUCAO",
      valorCaucao: 3000,
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2027-01-01"),
    });

    const semJanela = await aReceber(prisma, {});
    const comJanelaCurta = await aReceber(prisma, {}, 1);

    expect(semJanela.quantidade).toBeGreaterThan(comJanelaCurta.quantidade);
  });
});

describe("detalheFatura mostra o cálculo transparente mesmo sem o cron ter rodado", () => {
  it("recalcula multa/juros ao vivo para fatura vencida ainda marcada como PENDENTE", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino Transparencia", cpf: CPF_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua Transparencia, 1", valorPadrao: 1000 });
    const contrato = await criarContrato(prisma, {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      valorAluguel: 1000,
      diaVencimento: 5,
      tipoGarantia: "CAUCAO",
      valorCaucao: 3000,
      dataInicio: new Date("2020-01-01"),
      dataFim: new Date("2020-03-01"),
    });

    const parcelas = await historicoParcelas(prisma, contrato.id);
    const fatura = parcelas[0];
    expect(fatura.status).toBe("PENDENTE");

    const detalhe = await detalheFatura(prisma, fatura.id);
    expect(detalhe.calculoAtual.diasAtraso).toBeGreaterThan(0);
    expect(detalhe.calculoAtual.valorTotal).toBeGreaterThan(fatura.valorTotal);
  });
});

describe("aditivo contratual: altera valor/vencimento futuros sem tocar no passado", () => {
  it("regenera apenas as faturas PENDENTES a partir da data de vigência, com o novo valor", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino Aditivo", cpf: CPF_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua Aditivo, 1", valorPadrao: 1000 });
    const contrato = await criarContrato(prisma, {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      valorAluguel: 1000,
      diaVencimento: 5,
      tipoGarantia: "CAUCAO",
      valorCaucao: 3000,
      dataInicio: new Date("2026-08-01"),
      dataFim: new Date("2026-12-01"),
    });

    const parcelasAntes = await historicoParcelas(prisma, contrato.id);
    expect(parcelasAntes.every((p) => p.valorOriginal === 1000)).toBe(true);

    const { registrarAditivo } = await import("../cadastros/aditivoService");
    const resultado = await registrarAditivo(
      prisma,
      contrato.id,
      { dataVigencia: new Date("2026-10-01"), novoValorAluguel: 1200 },
      "usuario-teste"
    );

    expect(resultado.contratoAtualizado.valorAluguel).toBe(1200);

    const parcelasDepois = await historicoParcelas(prisma, contrato.id);
    const ago = parcelasDepois.find((p) => p.competencia === "2026-08");
    const out = parcelasDepois.find((p) => p.competencia === "2026-10");
    expect(ago?.valorOriginal).toBe(1000);
    expect(out?.valorOriginal).toBe(1200);
  });

  it("rejeita aditivo com dataVigencia retroativa", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino Aditivo 2", cpf: CPF_2 });
    const imovel = await criarImovel(prisma, { endereco: "Rua Aditivo, 2", valorPadrao: 1000 });
    const contrato = await criarContrato(prisma, {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      valorAluguel: 1000,
      diaVencimento: 5,
      tipoGarantia: "CAUCAO",
      valorCaucao: 3000,
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2026-05-01"),
    });

    const { registrarAditivo } = await import("../cadastros/aditivoService");
    await expect(
      registrarAditivo(prisma, contrato.id, { dataVigencia: new Date("2020-01-01"), novoValorAluguel: 1200 })
    ).rejects.toThrow(/retroativa/);
  });
});

describe("renovação de contrato: continuidade sem liberar o imóvel", () => {
  it("encerra o contrato atual e cria um novo vinculado, mantendo o imóvel ALUGADO", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino Renovacao", cpf: CPF_3 });
    const imovel = await criarImovel(prisma, { endereco: "Rua Renovacao, 1", valorPadrao: 1000 });
    const contrato = await criarContrato(prisma, {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      valorAluguel: 1000,
      diaVencimento: 5,
      tipoGarantia: "CAUCAO",
      valorCaucao: 3000,
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2026-04-01"),
    });

    const { renovarContrato } = await import("../cadastros/contratoService");
    const novoContrato = await renovarContrato(
      prisma,
      contrato.id,
      { novaDataFim: new Date("2026-08-01"), novoValorAluguel: 1100 },
      "usuario-teste"
    );

    expect(novoContrato.renovadoDeId).toBe(contrato.id);
    expect(novoContrato.valorAluguel).toBe(1100);
    expect(novoContrato.dataInicio.toISOString().slice(0, 10)).toBe("2026-04-02");

    const contratoAntigo = await prisma.contrato.findUniqueOrThrow({ where: { id: contrato.id } });
    expect(contratoAntigo.status).toBe("ENCERRADO");

    const imovelAtual = await prisma.imovel.findUniqueOrThrow({ where: { id: imovel.id } });
    expect(imovelAtual.status).toBe("ALUGADO");

    const parcelasNovoContrato = await historicoParcelas(prisma, novoContrato.id);
    expect(parcelasNovoContrato.length).toBeGreaterThan(0);
    expect(parcelasNovoContrato.every((p) => p.valorOriginal === 1100)).toBe(true);
  });

  it("rejeita renovação com nova data de fim anterior ou igual à atual", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino Renovacao 2", cpf: CPF_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua Renovacao, 2", valorPadrao: 1000 });
    const contrato = await criarContrato(prisma, {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      valorAluguel: 1000,
      diaVencimento: 5,
      tipoGarantia: "CAUCAO",
      valorCaucao: 3000,
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2026-04-01"),
    });

    const { renovarContrato } = await import("../cadastros/contratoService");
    await expect(
      renovarContrato(prisma, contrato.id, { novaDataFim: new Date("2026-04-01") })
    ).rejects.toThrow();
  });
});
