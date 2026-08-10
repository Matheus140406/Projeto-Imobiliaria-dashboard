import { describe, expect, it } from "vitest";
import { centavosParaReais, formatarReais, paraReaisNaResposta, reaisParaCentavos } from "../lib/dinheiro";

describe("conversão reais <-> centavos", () => {
  it("reaisParaCentavos arredonda para o centavo mais próximo", () => {
    expect(reaisParaCentavos(1000.5)).toBe(100050);
    expect(reaisParaCentavos(85.3)).toBe(8530);
    expect(reaisParaCentavos(10)).toBe(1000);
  });

  it("centavosParaReais é o inverso exato de reaisParaCentavos", () => {
    expect(centavosParaReais(reaisParaCentavos(1234.56))).toBe(1234.56);
  });

  it("formatarReais usa o formato brasileiro", () => {
    expect(formatarReais(100050)).toMatch(/R\$\s*1\.000,50/);
  });
});

describe("paraReaisNaResposta: conversão recursiva de campos monetários conhecidos", () => {
  it("converte campos monetários de nível superior", () => {
    const resultado = paraReaisNaResposta({ valorPadrao: 100000, endereco: "Rua X" });
    expect(resultado).toEqual({ valorPadrao: 1000, endereco: "Rua X" });
  });

  it("converte campos monetários aninhados em objetos e arrays", () => {
    const resultado = paraReaisNaResposta({
      contrato: {
        valorAluguel: 150000,
        faturas: [
          { valorTotal: 150000, valorMulta: 3000 },
          { valorTotal: 150000, valorMulta: 0 },
        ],
      },
    });
    expect(resultado).toEqual({
      contrato: {
        valorAluguel: 1500,
        faturas: [
          { valorTotal: 1500, valorMulta: 30 },
          { valorTotal: 1500, valorMulta: 0 },
        ],
      },
    });
  });

  it("converte novoValorAluguel do Aditivo (campo com nome diferente dos demais)", () => {
    const resultado = paraReaisNaResposta({ novoValorAluguel: 120000, novoDiaVencimento: 10 });
    expect(resultado).toEqual({ novoValorAluguel: 1200, novoDiaVencimento: 10 });
  });

  it("não mexe em Date nem em campos não monetários", () => {
    const data = new Date("2026-01-01");
    const resultado = paraReaisNaResposta({ dataVencimento: data, diaVencimento: 5, status: "PAGO" });
    expect(resultado.dataVencimento).toBe(data);
    expect(resultado.diaVencimento).toBe(5);
    expect(resultado.status).toBe("PAGO");
  });

  it("não mexe em valores nulos", () => {
    const resultado = paraReaisNaResposta({ valorCaucao: null, fiadorId: null });
    expect(resultado).toEqual({ valorCaucao: null, fiadorId: null });
  });
});
