export interface ColunaCsv {
  chave: string;
  titulo: string;
}

function escapaCampo(valor: unknown): string {
  const texto = valor == null ? "" : String(valor);
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
