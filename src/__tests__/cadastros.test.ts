import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { criarInquilino, excluirInquilino, listarInquilinos } from "../cadastros/inquilinoService";
import { buscarFiadorAtivo, criarFiador, excluirFiador } from "../cadastros/fiadorService";
import { criarImovel, listarImoveis } from "../cadastros/imovelService";
import { criarContrato, encerrarContrato, historicoParcelas, listarContratos } from "../cadastros/contratoService";
import { AppError } from "../lib/errors";

const prisma = new PrismaClient();

// CPFs matematicamente válidos (dígito verificador correto), usados nos testes de criação.
const CPF_VALIDO_1 = "52998224725";
const CPF_VALIDO_2 = "11144477735";
const CPF_VALIDO_3 = "71428793860";

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

beforeEach(limparBanco);
afterAll(async () => {
  await limparBanco();
  await prisma.$disconnect();
});

describe("cadastro de inquilino", () => {
  it("rejeita CPF com dígito verificador inválido", async () => {
    await expect(
      criarInquilino(prisma, { nome: "Teste", cpf: "12345678900" })
    ).rejects.toThrow(/CPF inválido/);
  });

  it("rejeita CPF duplicado com mensagem amigável", async () => {
    await criarInquilino(prisma, { nome: "Primeiro", cpf: CPF_VALIDO_1 });
    await expect(criarInquilino(prisma, { nome: "Segundo", cpf: CPF_VALIDO_1 })).rejects.toThrow(
      /Já existe um inquilino/
    );
  });

  it("soft delete preserva o registro (não aparece na listagem, mas continua no banco)", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Ana", cpf: CPF_VALIDO_1 });
    await excluirInquilino(prisma, inquilino.id);

    const listados = await listarInquilinos(prisma);
    expect(listados.find((i) => i.id === inquilino.id)).toBeUndefined();

    const aindaNoBanco = await prisma.inquilino.findUnique({ where: { id: inquilino.id } });
    expect(aindaNoBanco).not.toBeNull();
    expect(aindaNoBanco?.deletedAt).not.toBeNull();
  });
});

describe("fiador precisa existir e estar ativo antes de vincular", () => {
  it("rejeita fiador inexistente", async () => {
    await expect(buscarFiadorAtivo(prisma, "id-que-nao-existe")).rejects.toThrow(/não encontrado/);
  });

  it("rejeita fiador inativo", async () => {
    const fiador = await criarFiador(prisma, { nome: "Fiador Inativo", cpf: CPF_VALIDO_2 });
    await prisma.fiador.update({ where: { id: fiador.id }, data: { ativo: false } });

    await expect(buscarFiadorAtivo(prisma, fiador.id)).rejects.toThrow(/não está ativo/);
  });

  it("rejeita fiador soft-deletado mesmo que ainda esteja marcado como ativo", async () => {
    const fiador = await criarFiador(prisma, { nome: "Fiador Removido", cpf: CPF_VALIDO_2 });
    await excluirFiador(prisma, fiador.id);

    await expect(buscarFiadorAtivo(prisma, fiador.id)).rejects.toThrow(/não encontrado/);
  });
});

describe("regra de garantia obrigatória: caução (qualquer valor > 0) OU fiador ativo", () => {
  it("rejeita contrato com garantia CAUCAO sem valorCaucao informado", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino", cpf: CPF_VALIDO_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua A, 1", valorPadrao: 1000 });

    await expect(
      criarContrato(prisma, {
        inquilinoId: inquilino.id,
        imovelId: imovel.id,
        valorAluguel: 1000,
        diaVencimento: 5,
        tipoGarantia: "CAUCAO",
        dataInicio: new Date("2026-01-01"),
        dataFim: new Date("2026-04-01"),
      })
    ).rejects.toThrow(/valorCaucao maior que zero/);
  });

  it("rejeita contrato com valorCaucao zero ou negativo", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino", cpf: CPF_VALIDO_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua A, 1", valorPadrao: 1000 });

    await expect(
      criarContrato(prisma, {
        inquilinoId: inquilino.id,
        imovelId: imovel.id,
        valorAluguel: 1000,
        diaVencimento: 5,
        tipoGarantia: "CAUCAO",
        valorCaucao: 0,
        dataInicio: new Date("2026-01-01"),
        dataFim: new Date("2026-04-01"),
      })
    ).rejects.toThrow(/valorCaucao maior que zero/);
  });

  it("aceita caução menor que 3x o aluguel (não há mais piso mínimo)", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino", cpf: CPF_VALIDO_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua A, 1", valorPadrao: 1000 });

    const contrato = await criarContrato(prisma, {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      valorAluguel: 1000,
      diaVencimento: 5,
      tipoGarantia: "CAUCAO",
      valorCaucao: 200, // bem menor que 3x (3000) — deve ser aceito exatamente como informado
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2026-04-01"),
    });

    expect(contrato.valorCaucao).toBe(200);
  });

  it("aceita caução maior que 3x o aluguel, salvando exatamente o valor informado", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino", cpf: CPF_VALIDO_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua A, 1", valorPadrao: 1000 });

    const contrato = await criarContrato(prisma, {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      valorAluguel: 1000,
      diaVencimento: 5,
      tipoGarantia: "CAUCAO",
      valorCaucao: 50000, // bem maior que 3x (3000) — não deve ser truncado/recalculado
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2026-04-01"),
    });

    expect(contrato.valorCaucao).toBe(50000);
  });

  it("rejeita contrato com garantia FIADOR sem fiadorId", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino", cpf: CPF_VALIDO_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua A, 1", valorPadrao: 1000 });

    await expect(
      criarContrato(prisma, {
        inquilinoId: inquilino.id,
        imovelId: imovel.id,
        valorAluguel: 1000,
        diaVencimento: 5,
        tipoGarantia: "FIADOR",
        dataInicio: new Date("2026-01-01"),
        dataFim: new Date("2026-04-01"),
      })
    ).rejects.toThrow(/exige um fiadorId/);
  });

  it("aceita contrato com caução exatamente 3x o aluguel", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino", cpf: CPF_VALIDO_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua A, 1", valorPadrao: 1000 });

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

    expect(contrato.tipoGarantia).toBe("CAUCAO");
  });

  it("aceita contrato com fiador ativo vinculado", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino", cpf: CPF_VALIDO_1 });
    const fiador = await criarFiador(prisma, { nome: "Fiador", cpf: CPF_VALIDO_2 });
    const imovel = await criarImovel(prisma, { endereco: "Rua A, 1", valorPadrao: 1000 });

    const contrato = await criarContrato(prisma, {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      fiadorId: fiador.id,
      valorAluguel: 1000,
      diaVencimento: 5,
      tipoGarantia: "FIADOR",
      dataInicio: new Date("2026-01-01"),
      dataFim: new Date("2026-04-01"),
    });

    expect(contrato.fiadorId).toBe(fiador.id);
  });
});

describe("disponibilidade do imóvel", () => {
  it("rejeita contrato para imóvel já alugado", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino 1", cpf: CPF_VALIDO_1 });
    const outroInquilino = await criarInquilino(prisma, { nome: "Inquilino 2", cpf: CPF_VALIDO_2 });
    const imovel = await criarImovel(prisma, { endereco: "Rua B, 2", valorPadrao: 1000 });

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

    await expect(
      criarContrato(prisma, {
        inquilinoId: outroInquilino.id,
        imovelId: imovel.id,
        valorAluguel: 1000,
        diaVencimento: 5,
        tipoGarantia: "CAUCAO",
        valorCaucao: 3000,
        dataInicio: new Date("2026-05-01"),
        dataFim: new Date("2026-08-01"),
      })
    ).rejects.toThrow(/não está disponível/);
  });

  it("marca o imóvel como ALUGADO ao criar o contrato e DISPONIVEL de volta ao encerrar", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino", cpf: CPF_VALIDO_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua C, 3", valorPadrao: 1000 });

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

    const imovelAlugado = await prisma.imovel.findUniqueOrThrow({ where: { id: imovel.id } });
    expect(imovelAlugado.status).toBe("ALUGADO");

    await encerrarContrato(prisma, contrato.id);

    const imovelLiberado = await prisma.imovel.findUniqueOrThrow({ where: { id: imovel.id } });
    expect(imovelLiberado.status).toBe("DISPONIVEL");

    const listados = await listarContratos(prisma);
    expect(listados.find((c) => c.id === contrato.id)).toBeUndefined();
  });
});

describe("geração automática de parcelas (1 por mês do contrato)", () => {
  it("gera uma fatura para cada mês de vigência ao criar o contrato", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino", cpf: CPF_VALIDO_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua D, 4", valorPadrao: 1000 });

    // 2026-01 a 2026-04 => 4 competências (jan, fev, mar, abr)
    const contrato = await criarContrato(prisma, {
      inquilinoId: inquilino.id,
      imovelId: imovel.id,
      valorAluguel: 1000,
      diaVencimento: 10,
      tipoGarantia: "CAUCAO",
      valorCaucao: 3000,
      dataInicio: new Date("2026-01-15"),
      dataFim: new Date("2026-04-20"),
    });

    const parcelas = await historicoParcelas(prisma, contrato.id);
    expect(parcelas).toHaveLength(4);
    expect(parcelas.map((p) => p.competencia)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
    expect(parcelas.every((p) => p.status === "PENDENTE")).toBe(true);
  });

  it("respeita o limite máximo de duração do contrato", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino", cpf: CPF_VALIDO_1 });
    const imovel = await criarImovel(prisma, { endereco: "Rua E, 5", valorPadrao: 1000 });

    await expect(
      criarContrato(prisma, {
        inquilinoId: inquilino.id,
        imovelId: imovel.id,
        valorAluguel: 1000,
        diaVencimento: 5,
        tipoGarantia: "CAUCAO",
        valorCaucao: 3000,
        dataInicio: new Date("2026-01-01"),
        dataFim: new Date("2100-01-01"),
      })
    ).rejects.toThrow(/não pode exceder/);
  });
});

describe("erros de negócio usam AppError com status apropriado", () => {
  it("valorCaucao ausente em garantia CAUCAO gera 422", async () => {
    const inquilino = await criarInquilino(prisma, { nome: "Inquilino", cpf: CPF_VALIDO_3 });
    const imovel = await criarImovel(prisma, { endereco: "Rua F, 6", valorPadrao: 1000 });

    try {
      await criarContrato(prisma, {
        inquilinoId: inquilino.id,
        imovelId: imovel.id,
        valorAluguel: 1000,
        diaVencimento: 5,
        tipoGarantia: "CAUCAO",
        dataInicio: new Date("2026-01-01"),
        dataFim: new Date("2026-04-01"),
      });
      expect.unreachable("deveria ter lançado AppError");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(422);
    }
  });
});
