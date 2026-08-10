import PDFDocument from "pdfkit";
import { AppError } from "../lib/errors";
import { formatarReais } from "../lib/dinheiro";

interface InquilinoDoc {
  nome: string;
  cpf: string;
  email: string | null;
  telefone: string | null;
}

interface FiadorDoc {
  nome: string;
  cpf: string;
}

interface ImovelDoc {
  endereco: string;
  valorPadrao: number;
  valorIptuMensal: number | null;
}

// Campos monetários em CENTAVOS (ver src/lib/dinheiro.ts) — vêm direto do Prisma,
// sem conversão prévia, porque este service formata para exibição (texto/PDF).
export interface ContratoDoc {
  id: string;
  valorAluguel: number;
  diaVencimento: number;
  percentualMulta: number;
  taxaJurosDiaria: number;
  tipoGarantia: string;
  valorCaucao: number | null;
  responsavelIptu: string;
  dataInicio: Date;
  dataFim: Date;
  inquilino: InquilinoDoc;
  imovel: ImovelDoc;
  fiador: FiadorDoc | null;
}

function formataData(data: Date): string {
  return data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

// contrato.valorAluguel etc. chegam em centavos (ver src/lib/dinheiro.ts).
const formataMoeda = formatarReais;

/**
 * Avisos/dicas sobre o que falta ou é recomendado preencher antes de fechar o
 * contrato — pensado para orientar quem está montando o contrato pelo
 * assistente passo a passo, não só validar o obrigatório (que já é bloqueado
 * na criação pelo contratoService).
 */
export function avaliarDicasContrato(contrato: ContratoDoc): string[] {
  const dicas: string[] = [];

  if (!contrato.inquilino.email) {
    dicas.push("Inquilino sem email cadastrado — recomendado para envio de cobranças e avisos.");
  }
  if (!contrato.inquilino.telefone) {
    dicas.push("Inquilino sem telefone cadastrado — recomendado para contato em caso de atraso.");
  }
  if (contrato.tipoGarantia === "FIADOR" && !contrato.fiador) {
    dicas.push("Garantia por fiador selecionada, mas nenhum fiador está vinculado ao contrato.");
  }
  if (contrato.imovel.valorIptuMensal == null) {
    dicas.push(
      "Imóvel sem valorIptuMensal configurado — se o IPTU for repassado ao inquilino, cadastre o valor para gerar as faturas automaticamente."
    );
  }
  if (contrato.percentualMulta < 2) {
    dicas.push("Percentual de multa por atraso abaixo de 2% — confira se está de acordo com o combinado.");
  }

  return dicas;
}

/** Monta o texto integral do contrato de locação a partir dos dados cadastrados. */
export function montarTextoContrato(contrato: ContratoDoc): string {
  const clausulaGarantia =
    contrato.tipoGarantia === "CAUCAO"
      ? `O LOCATÁRIO presta, a título de caução, o valor de ${formataMoeda(
          contrato.valorCaucao ?? 0
        )}, correspondente a no mínimo 3 (três) vezes o valor mensal do aluguel, a ser devolvido ao término do contrato, descontadas eventuais pendências.`
      : `O presente contrato é garantido por FIADOR, Sr(a). ${contrato.fiador?.nome ?? "[fiador não vinculado]"}, portador do CPF ${
          contrato.fiador?.cpf ?? "[não informado]"
        }, que responde solidariamente por todas as obrigações do LOCATÁRIO.`;

  const clausulaIptu =
    contrato.responsavelIptu === "INQUILINO"
      ? `O IPTU do imóvel é de responsabilidade do LOCATÁRIO${
          contrato.imovel.valorIptuMensal != null
            ? `, no valor mensal de ${formataMoeda(contrato.imovel.valorIptuMensal)}`
            : ""
        }.`
      : "O IPTU do imóvel é de responsabilidade do LOCADOR/PROPRIETÁRIO.";

  return `CONTRATO DE LOCAÇÃO RESIDENCIAL

LOCATÁRIO: ${contrato.inquilino.nome}, CPF ${contrato.inquilino.cpf}
IMÓVEL LOCADO: ${contrato.imovel.endereco}

CLÁUSULA 1ª — DO OBJETO
O presente contrato tem por objeto a locação do imóvel acima descrito, pelo
LOCATÁRIO, nas condições estabelecidas neste instrumento.

CLÁUSULA 2ª — DO PRAZO
A locação vigorará de ${formataData(contrato.dataInicio)} até ${formataData(contrato.dataFim)}.

CLÁUSULA 3ª — DO ALUGUEL
O valor mensal do aluguel é de ${formataMoeda(contrato.valorAluguel)}, com vencimento
todo dia ${contrato.diaVencimento} de cada mês.

CLÁUSULA 4ª — DA MULTA E JUROS POR ATRASO
Em caso de atraso no pagamento, incidirá multa de ${contrato.percentualMulta}% sobre o
valor do aluguel, acrescida de juros de mora de ${contrato.taxaJurosDiaria}% ao dia,
contados a partir do vencimento.

CLÁUSULA 5ª — DA GARANTIA
${clausulaGarantia}

CLÁUSULA 6ª — DO IPTU
${clausulaIptu}

CLÁUSULA 7ª — DAS DISPOSIÇÕES GERAIS
As partes elegem o foro da comarca de localização do imóvel para dirimir
quaisquer dúvidas oriundas deste contrato.

Contrato gerado automaticamente pelo sistema — revise antes de assinar.
`;
}

/** Gera o PDF do contrato a partir do texto já montado, retornando o buffer completo. */
export function gerarPdfContrato(contrato: ContratoDoc): Promise<Buffer> {
  const texto = montarTextoContrato(contrato);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const partes: Buffer[] = [];
      doc.on("data", (parte) => partes.push(parte));
      doc.on("end", () => resolve(Buffer.concat(partes)));
      doc.on("error", reject);

      doc.fontSize(11).font("Helvetica");
      for (const linha of texto.split("\n")) {
        if (/^CLÁUSULA|^CONTRATO DE LOCAÇÃO/.test(linha)) {
          doc.moveDown(0.5).font("Helvetica-Bold").text(linha).font("Helvetica");
        } else {
          doc.text(linha);
        }
      }
      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new AppError(500, "Falha ao gerar PDF"));
    }
  });
}
