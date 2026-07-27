import { describe, expect, it } from "vitest";
import { calcularMultaEJuros } from "../financeiro/calculoAtraso";

describe("calcularMultaEJuros", () => {
  it("não cobra multa/juros quando não há atraso", () => {
    const resultado = calcularMultaEJuros({
      valorOriginal: 1000,
      percentualMulta: 2,
      taxaJurosDiaria: 0.033,
      dataVencimento: new Date("2026-07-10"),
      dataReferencia: new Date("2026-07-10"),
    });
    expect(resultado).toEqual({ diasAtraso: 0, valorMulta: 0, valorJuros: 0, valorTotal: 1000 });
  });

  it("aplica multa fixa e juros proporcionais aos dias de atraso", () => {
    const resultado = calcularMultaEJuros({
      valorOriginal: 1000,
      percentualMulta: 2,
      taxaJurosDiaria: 0.033,
      dataVencimento: new Date("2026-07-10"),
      dataReferencia: new Date("2026-07-15"),
    });
    expect(resultado.diasAtraso).toBe(5);
    expect(resultado.valorMulta).toBe(20);
    expect(resultado.valorJuros).toBeCloseTo(1.65, 2);
    expect(resultado.valorTotal).toBeCloseTo(1021.65, 2);
  });

  it("nunca retorna dias de atraso negativos", () => {
    const resultado = calcularMultaEJuros({
      valorOriginal: 500,
      percentualMulta: 2,
      taxaJurosDiaria: 0.033,
      dataVencimento: new Date("2026-07-20"),
      dataReferencia: new Date("2026-07-10"),
    });
    expect(resultado.diasAtraso).toBe(0);
    expect(resultado.valorTotal).toBe(500);
  });
});
