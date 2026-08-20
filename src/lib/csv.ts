export interface ColunaCsv {
  chave: string;
  titulo: string;
}

// Campos que começam com =, +, -, @, tab ou CR são interpretados como fórmula por
// Excel/Google Sheets ao abrir o CSV ("CSV injection") — um nome de inquilino ou
// endereço de imóvel cadastrado como `=HYPERLINK(...)` executaria ao abrir o arquivo.
// Prefixar com apóstrofo neutraliza sem alterar o valor visível na planilha.
const CARACTERES_DE_FORMULA = /^[=+\-@\t\r]/;

function escapaCampo(valor: unknown): string {
  let texto = valor == null ? "" : String(valor);
  if (CARACTERES_DE_FORMULA.test(texto)) {
    texto = `'${texto}`;
  }
  if (/[",\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

/** Gera um CSV simples (separado por vírgula, com aspas quando necessário). */
export function paraCsv(linhas: Record<string, unknown>[], colunas: ColunaCsv[]): string {
  const cabecalho = colunas.map((c) => escapaCampo(c.titulo)).join(",");
  const corpo = linhas.map((linha) => colunas.map((c) => escapaCampo(linha[c.chave])).join(","));
  return [cabecalho, ...corpo].join("\n");
}
