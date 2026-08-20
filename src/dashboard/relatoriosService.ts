import { PrismaClient } from "@prisma/client";
import { paraCsv } from "../lib/csv";
import { centavosParaReais } from "../lib/dinheiro";
import { FiltroDashboard, listarFaturas } from "./dashboardService";

const COLUNAS_FATURAS = [
  { chave: "inquilino", titulo: "Inquilino" },
  { chave: "imovel", titulo: "Imóvel" },
  { chave: "tipo", titulo: "Tipo" },
  { chave: "competencia", titulo: "Competência" },
  { chave: "vencimento", titulo: "Vencimento" },
  { chave: "status", titulo: "Status" },
  { chave: "valorOriginal", titulo: "Valor Original (R$)" },
  { chave: "valorMulta", titulo: "Multa (R$)" },
  { chave: "valorJuros", titulo: "Juros (R$)" },
  { chave: "valorTotal", titulo: "Valor Total (R$)" },
];

/** Exporta a listagem de faturas (com os mesmos filtros do endpoint /faturas) em CSV. */
export async function exportarFaturasCsv(
  prisma: PrismaClient,
  filtro: FiltroDashboard & { status?: string } = {}
): Promise<string> {
  const faturas = await listarFaturas(prisma, filtro);

  const linhas = faturas.map((f) => ({
    inquilino: f.contrato.inquilino.nome,
    imovel: f.contrato.imovel.endereco,
    tipo: f.tipo,
    competencia: f.competencia,
    vencimento: f.dataVencimento.toISOString().slice(0, 10),
    status: f.status,
    valorOriginal: centavosParaReais(f.valorOriginal).toFixed(2),
    valorMulta: centavosParaReais(f.valorMulta).toFixed(2),
    valorJuros: centavosParaReais(f.valorJuros).toFixed(2),
    valorTotal: centavosParaReais(f.valorTotal).toFixed(2),
  }));

  return paraCsv(linhas, COLUNAS_FATURAS);
}
