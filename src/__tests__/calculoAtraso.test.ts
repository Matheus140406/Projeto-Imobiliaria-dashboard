import { describe, expect, it } from "vitest";
import { calcularMultaEJuros } from "../financeiro/calculoAtraso";

// Valores em centavos (ver src/lib/dinheiro.ts): 100000 = R$ 1.000,00.
describe("calcularMultaEJuros", () => {
  it("não cobra multa/juros quando não há atraso", () => {
    const resultado = calcularMultaEJuros({
      valorOriginal: 100000,
      percentualMulta: 2,
      taxaJurosDiaria: 0.033,
      dataVencimento: new Date("2026-07-10"),
      dataReferencia: new Date("2026-07-10"),
    });
    expect(resultado).toEqual({ diasAtraso: 0, valorMulta: 0, valorJuros: 0, valorTotal: 100000 });
  });

  it("aplica multa fixa e juros proporcionais aos dias de atraso", () => {
    const resultado = calcularMultaEJuros({
      valorOriginal: 100000,
      percentualMulta: 2,
      taxaJurosDiaria: 0.033,
      dataVencimento: new Date("2026-07-10"),
      dataReferencia: new Date("2026-07-15"),
    });
    expect(resultado.diasAtraso).toBe(5);
    expect(resultado.valorMulta).toBe(2000);
    expect(resultado.valorJuros).toBe(165);
    expect(resultado.valorTotal).toBe(102165);
  });

  it("arredonda a fração de centavo para o centavo mais próximo", () => {
    // 777 * 0.033% * 3 dias = 0,769... centavos -> arredonda para 1 centavo
    const resultado = calcularMultaEJuros({
      valorOriginal: 777,
      percentualMulta: 2,
      taxaJurosDiaria: 0.033,
      dataVencimento: new Date("2026-07-10"),
      dataReferencia: new Date("2026-07-13"),
    });
    expect(Number.isInteger(resultado.valorMulta)).toBe(true);
    expect(Number.isInteger(resultado.valorJuros)).toBe(true);
    expect(Number.isInteger(resultado.valorTotal)).toBe(true);
  });

  it("nunca retorna dias de atraso negativos", () => {
    const resultado = calcularMultaEJuros({
      valorOriginal: 50000,
      percentualMulta: 2,
      taxaJurosDiaria: 0.033,
      dataVencimento: new Date("2026-07-20"),
      dataReferencia: new Date("2026-07-10"),
    });
    expect(resultado.diasAtraso).toBe(0);
    expect(resultado.valorTotal).toBe(50000);
  });
});
