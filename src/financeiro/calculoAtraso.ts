/**
 * Calcula multa (percentual fixo contratual) + juros (taxa diária sobre o valor original)
 * para uma fatura em atraso. Juros incidem por dia corrido após o vencimento.
 *
 * Todo valor monetário aqui é em CENTAVOS (inteiro) — ver src/lib/dinheiro.ts.
 */
export interface CalculoAtrasoInput {
  valorOriginal: number;
  percentualMulta: number;
  taxaJurosDiaria: number;
  dataVencimento: Date;
  dataReferencia: Date;
}

export interface CalculoAtrasoResultado {
  diasAtraso: number;
  valorMulta: number;
  valorJuros: number;
  valorTotal: number;
}

// Já estamos em centavos (inteiro); só falta arredondar a fração de centavo que
// multa % e juros % podem gerar.
function arredonda(valor: number): number {
  return Math.round(valor);
}

export function diasEntre(inicio: Date, fim: Date): number {
  const msPorDia = 24 * 60 * 60 * 1000;
  const inicioUTC = Date.UTC(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  const fimUTC = Date.UTC(fim.getFullYear(), fim.getMonth(), fim.getDate());
  return Math.round((fimUTC - inicioUTC) / msPorDia);
}

export function calcularMultaEJuros(input: CalculoAtrasoInput): CalculoAtrasoResultado {
  const diasAtraso = Math.max(0, diasEntre(input.dataVencimento, input.dataReferencia));

  if (diasAtraso === 0) {
    return { diasAtraso: 0, valorMulta: 0, valorJuros: 0, valorTotal: arredonda(input.valorOriginal) };
  }

  const valorMulta = arredonda(input.valorOriginal * (input.percentualMulta / 100));
  const valorJuros = arredonda(input.valorOriginal * (input.taxaJurosDiaria / 100) * diasAtraso);
  const valorTotal = arredonda(input.valorOriginal + valorMulta + valorJuros);

  return { diasAtraso, valorMulta, valorJuros, valorTotal };
}
