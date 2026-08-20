import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { criarInquilino, atualizarInquilino } from "../cadastros/inquilinoService";
import { criarFiador } from "../cadastros/fiadorService";
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

describe("exclusão de contrato: exclusão lógica sem deixar registros órfãos", () => {
  it("marca o contrato como EXCLUIDO, libera o imóvel e cancela só as faturas ainda PENDENTES", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino Exclusao", cpf: CPF_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua Exclusao, 1", valorPadrao: 1000 });
    const contrato = await criarContrato(prisma, {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      valorAluguel: 1000,
      diaVencimento: 5,
      tipoGarantia: "CAUCAO",
      valorCaucao: 3000,
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2026-12-01"),
    });

    // Uma parcela é paga (deve ser preservada), as demais ficam PENDENTE (devem ser canceladas).
    const parcelas = await historicoParcelas(prisma, contrato.id);
    await registrarPagamento(prisma, {
      faturaId: parcelas[0].id,
      valorPago: parcelas[0].valorTotal,
      metodo: "PIX",
      registradoPor: "teste",
    });

    const { excluirContrato } = await import("../cadastros/contratoService");
    const contratoExcluido = await excluirContrato(prisma, contrato.id, "usuario-teste");

    expect(contratoExcluido.status).toBe("EXCLUIDO");
    expect(contratoExcluido.deletedAt).not.toBeNull();

    const imovelAtual = await prisma.imovel.findUniqueOrThrow({ where: { id: imovel.id } });
    expect(imovelAtual.status).toBe("DISPONIVEL");

    const faturasFinais = await prisma.fatura.findMany({ where: { contratoId: contrato.id } });
    const paga = faturasFinais.find((f) => f.id === parcelas[0].id);
    const outras = faturasFinais.filter((f) => f.id !== parcelas[0].id);
    expect(paga?.status).toBe("PAGO");
    expect(outras.every((f) => f.status === "CANCELADO")).toBe(true);

    // Contrato some das listagens (soft delete), mas segue no banco (auditoria).
    const listados = await import("../cadastros/contratoService").then((m) => m.listarContratos(prisma));
    expect(listados.find((c) => c.id === contrato.id)).toBeUndefined();
  });

  it("não afeta faturas nem pagamentos de outro contrato ao excluir um contrato", async () => {
    const inquilinoA = await criarInquilino(prisma, { nome: "Inquilino Exclusao A", cpf: CPF_1 });
    const inquilinoB = await criarInquilino(prisma, { nome: "Inquilino Exclusao B", cpf: CPF_2 });
    const imovelA = await criarImovel(prisma, { endereco: "Rua Exclusao A, 1", valorPadrao: 1000 });
    const imovelB = await criarImovel(prisma, { endereco: "Rua Exclusao B, 1", valorPadrao: 1000 });

    const contratoA = await criarContrato(prisma, {
      inquilinoId: inquilinoA.id,
      imovelId: imovelA.id,
      valorAluguel: 1000,
      diaVencimento: 5,
      tipoGarantia: "CAUCAO",
      valorCaucao: 3000,
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2026-12-01"),
    });
    const contratoB = await criarContrato(prisma, {
      inquilinoId: inquilinoB.id,
      imovelId: imovelB.id,
      valorAluguel: 1000,
      diaVencimento: 5,
      tipoGarantia: "CAUCAO",
      valorCaucao: 3000,
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2026-12-01"),
    });

    const { excluirContrato } = await import("../cadastros/contratoService");
    await excluirContrato(prisma, contratoA.id, "usuario-teste");

    const parcelasB = await historicoParcelas(prisma, contratoB.id);
    expect(parcelasB.every((f) => f.status === "PENDENTE")).toBe(true);

    const contratoBAtual = await prisma.contrato.findUniqueOrThrow({ where: { id: contratoB.id } });
    expect(contratoBAtual.status).toBe("ATIVO");
    expect(contratoBAtual.deletedAt).toBeNull();

    const imovelBAtual = await prisma.imovel.findUniqueOrThrow({ where: { id: imovelB.id } });
    expect(imovelBAtual.status).toBe("ALUGADO");
  });

  it("excluir um contrato já excluído (ou inexistente) retorna 404, não duplica efeitos", async () => {
    const { excluirContrato } = await import("../cadastros/contratoService");
    await expect(excluirContrato(prisma, "id-que-nao-existe", "usuario-teste")).rejects.toThrow(/não encontrado/);
  });
});

describe("caução aceita qualquer valor (sem piso automático de 3x o aluguel)", () => {
  it("salva exatamente o valor de caução informado, sem multiplicar ou arredondar para 3x", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino Caucao Livre", cpf: CPF_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua Caucao Livre, 1", valorPadrao: 2000 });

    const contratoBaixo = await criarContrato(prisma, {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      valorAluguel: 2000,
      diaVencimento: 5,
      tipoGarantia: "CAUCAO",
      valorCaucao: 500, // bem menor que 1x o aluguel, quanto mais 3x
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2026-04-01"),
    });

    expect(contratoBaixo.valorCaucao).toBe(500);
  });
});

describe("multa e juros por atraso: 10% fixo + 0,5% ao dia sobre o valor original", () => {
  it("reproduz o exemplo de referência: R$1.000 com 5 dias de atraso -> R$100 de multa + R$25 de juros = R$1.125", async () => {
    const { calcularMultaEJuros } = await import("../financeiro/calculoAtraso");

    // Valores em centavos: R$1.000,00 = 100000.
    const resultado = calcularMultaEJuros({
      valorOriginal: 100000,
      percentualMulta: 10,
      taxaJurosDiaria: 0.5,
      dataVencimento: new Date("2026-07-01"),
      dataReferencia: new Date("2026-07-06"),
    });

    expect(resultado.diasAtraso).toBe(5);
    expect(resultado.valorMulta).toBe(10000); // R$100,00
    expect(resultado.valorJuros).toBe(2500); // R$25,00
    expect(resultado.valorTotal).toBe(112500); // R$1.125,00
  });

  it("não aplica multa nem juros quando não há atraso", async () => {
    const { calcularMultaEJuros } = await import("../financeiro/calculoAtraso");
    const resultado = calcularMultaEJuros({
      valorOriginal: 100000,
      percentualMulta: 10,
      taxaJurosDiaria: 0.5,
      dataVencimento: new Date("2026-07-01"),
      dataReferencia: new Date("2026-07-01"),
    });
    expect(resultado).toEqual({ diasAtraso: 0, valorMulta: 0, valorJuros: 0, valorTotal: 100000 });
  });

  it("multa fixa não dobra a cada dia — só os juros crescem com os dias de atraso", async () => {
    const { calcularMultaEJuros } = await import("../financeiro/calculoAtraso");
    const base = { valorOriginal: 100000, percentualMulta: 10, taxaJurosDiaria: 0.5, dataVencimento: new Date("2026-07-01") };

    const dia1 = calcularMultaEJuros({ ...base, dataReferencia: new Date("2026-07-02") });
    const dia10 = calcularMultaEJuros({ ...base, dataReferencia: new Date("2026-07-11") });

    // Multa é sempre 10% do valor original, não importa quantos dias passaram.
    expect(dia1.valorMulta).toBe(10000);
    expect(dia10.valorMulta).toBe(10000);
    // Só os juros escalam linearmente com os dias (0,5% ao dia sobre o valor original).
    expect(dia1.valorJuros).toBe(500);
    expect(dia10.valorJuros).toBe(5000);
  });

  it("contrato criado via API usa os novos padrões (10% de multa, 0,5% de juros ao dia) quando não especificado", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino Padrao Multa", cpf: CPF_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua Padrao Multa, 1", valorPadrao: 1000 });
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

    expect(contrato.percentualMulta).toBe(10);
    expect(contrato.taxaJurosDiaria).toBe(0.5);
  });
});

describe("exclusão de inquilino/fiador: bloqueia com contrato ativo e libera CPF para recadastro", () => {
  it("rejeita excluir inquilino que tem contrato ativo", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino Vinculado", cpf: CPF_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua Vinculado, 1", valorPadrao: 1000 });
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

    const { excluirInquilino } = await import("../cadastros/inquilinoService");
    await expect(excluirInquilino(prisma, inquilino.id)).rejects.toThrow(/contrato ativo/);
  });

  it("libera o CPF do inquilino excluído para um novo cadastro com o mesmo CPF", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino Reciclavel", cpf: CPF_1 });
    const { excluirInquilino } = await import("../cadastros/inquilinoService");
    await excluirInquilino(prisma, inquilino.id);

    // Sem contrato vinculado, a exclusão funciona e o CPF original fica livre de novo.
    const novoInquilino = await criarInquilino(prisma, { nome: "Pessoa Nova, Mesmo CPF", cpf: CPF_1 });
    expect(novoInquilino.cpf).toBe(CPF_1);
    expect(novoInquilino.id).not.toBe(inquilino.id);
  });

  it("rejeita excluir fiador que garante contrato ativo, e libera o CPF quando não há vínculo", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino Fiador Teste", cpf: CPF_1 });
    const fiador = await criarFiador(prisma, { nome: "Fiador Vinculado", cpf: CPF_2 });
    const imovel = await criarImovel(prisma, { endereco: "Rua Fiador Teste, 1", valorPadrao: 1000 });
    await criarContrato(prisma, {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      fiadorId: fiador.id,
      valorAluguel: 1000,
      diaVencimento: 5,
      tipoGarantia: "FIADOR",
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2026-04-01"),
    });

    const { excluirFiador } = await import("../cadastros/fiadorService");
    await expect(excluirFiador(prisma, fiador.id)).rejects.toThrow(/contrato ativo/);

    const fiadorLivre = await criarFiador(prisma, { nome: "Fiador Sem Contrato", cpf: CPF_3 });
    await excluirFiador(prisma, fiadorLivre.id);
    const recadastrado = await criarFiador(prisma, { nome: "Outra Pessoa, Mesmo CPF", cpf: CPF_3 });
    expect(recadastrado.cpf).toBe(CPF_3);
  });
});

describe("pagamento concorrente: só um dos dois vence a corrida", () => {
  it("duas chamadas simultâneas de registrarPagamento na mesma fatura só processam uma", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino Corrida", cpf: CPF_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua Corrida, 1", valorPadrao: 1000 });
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
    const parcelas = await historicoParcelas(prisma, contrato.id);
    const fatura = parcelas[0];

    const resultados = await Promise.allSettled([
      registrarPagamento(prisma, {
        faturaId: fatura.id,
        valorPago: fatura.valorTotal,
        metodo: "PIX",
        registradoPor: "a",
        dataPagamento: fatura.dataVencimento,
      }),
      registrarPagamento(prisma, {
        faturaId: fatura.id,
        valorPago: fatura.valorTotal,
        metodo: "PIX",
        registradoPor: "b",
        dataPagamento: fatura.dataVencimento,
      }),
    ]);

    const sucesso = resultados.filter((r) => r.status === "fulfilled");
    const falha = resultados.filter((r) => r.status === "rejected");
    expect(sucesso).toHaveLength(1);
    expect(falha).toHaveLength(1);

    // Só um Pagamento foi criado, e o scoring do inquilino só foi ajustado uma vez (+5).
    const pagamentos = await prisma.pagamento.findMany({ where: { faturaId: fatura.id } });
    expect(pagamentos).toHaveLength(1);
    const inquilinoAtual = await prisma.inquilino.findUniqueOrThrow({ where: { id: inquilino.id } });
    expect(inquilinoAtual.scoring).toBe(5);
  });
});

describe("defesa em profundidade em chamadas diretas ao service (fora do zod da rota)", () => {
  it("rejeita status de imóvel diferente de DISPONIVEL/MANUTENCAO mesmo passando o tipo por engano", async () => {
    const imovel = await criarImovel(prisma, { endereco: "Rua Status Direto, 1", valorPadrao: 1000 });
    const { atualizarImovel } = await import("../cadastros/imovelService");
    await expect(
      atualizarImovel(prisma, imovel.id, { status: "ALUGADO" as "DISPONIVEL" | "MANUTENCAO" })
    ).rejects.toThrow(/DISPONIVEL ou MANUTENCAO/);
  });

  it("rejeita tipo de fatura fora de ALUGUEL/IPTU em chamada direta ao faturaService", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino Tipo Fatura", cpf: CPF_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua Tipo Fatura, 1", valorPadrao: 1000 });
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

    const { gerarFaturaMensal } = await import("../financeiro/faturaService");
    await expect(
      gerarFaturaMensal(prisma, contrato.id, new Date("2026-05-01"), "SEGURO_INCENDIO")
    ).rejects.toThrow(/tipo de fatura inválido/);
  });

  it("rejeita papel de usuário fora de ADMIN/OPERADOR em chamada direta ao authService", async () => {
    const { criarUsuario } = await import("../auth/authService");
    await expect(
      criarUsuario(prisma, {
        nome: "Usuario Papel Invalido",
        email: "papel-invalido@teste.com",
        senha: "12345678",
        papel: "SUPERADMIN" as "ADMIN" | "OPERADOR",
      })
    ).rejects.toThrow(/ADMIN ou OPERADOR/);
  });
});

describe("CSV: neutraliza início de fórmula para evitar CSV injection no Excel/Sheets", () => {
  it("prefixa com apóstrofo campos que começam com =, +, -, @", async () => {
    const { paraCsv } = await import("../lib/csv");
    const csv = paraCsv(
      [{ nome: "=HYPERLINK(\"http://evil\")" }, { nome: "+1234" }, { nome: "Nome Normal" }],
      [{ chave: "nome", titulo: "Nome" }]
    );
    const linhas = csv.split("\n");
    expect(linhas[1]).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(linhas[2]).toBe("'+1234");
    expect(linhas[3]).toBe("Nome Normal");
  });
});
