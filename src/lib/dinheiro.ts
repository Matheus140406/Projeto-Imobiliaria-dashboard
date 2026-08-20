// Dinheiro é armazenado sempre em centavos (Int) no banco, para evitar erro de
// arredondamento de ponto flutuante em somas/multiplicações repetidas. A API
// (entrada e saída) continua em reais (float), a conversão acontece nesta borda.

export function reaisParaCentavos(valorEmReais: number): number {
  return Math.round(valorEmReais * 100);
}

export function centavosParaReais(valorEmCentavos: number): number {
  return valorEmCentavos / 100;
}

export function formatarReais(valorEmCentavos: number): string {
  return centavosParaReais(valorEmCentavos).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Nomes de campo conhecidos como monetários (armazenados em centavos), usados pela
// conversão recursiva de respostas HTTP — assim não é preciso converter manualmente
// em cada função de service que lê dados, só uma vez antes de responder ao cliente.
const CAMPOS_MONETARIOS = new Set([
  "valorPadrao",
  "valorIptuMensal",
  "valorAluguel",
  "valorCaucao",
  "valorOriginal",
  "valorMulta",
  "valorJuros",
  "valorTotal",
  "valorPago",
  "novoValorAluguel",
]);

/**
 * Converte recursivamente todo campo monetário conhecido (centavos) para reais,
 * percorrendo objetos e arrays aninhados (ex.: contrato.faturas[].pagamentos[]).
 * Usar sempre imediatamente antes de `res.json(...)`.
 */
export function paraReaisNaResposta<T>(valor: T): T {
  if (Array.isArray(valor)) {
    return valor.map((item) => paraReaisNaResposta(item)) as unknown as T;
  }
  if (valor instanceof Date) {
    return valor;
  }
  if (valor && typeof valor === "object") {
    const resultado: Record<string, unknown> = {};
    for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
      resultado[chave] =
        CAMPOS_MONETARIOS.has(chave) && typeof item === "number"
          ? centavosParaReais(item)
          : paraReaisNaResposta(item);
    }
    return resultado as T;
  }
  return valor;
}
