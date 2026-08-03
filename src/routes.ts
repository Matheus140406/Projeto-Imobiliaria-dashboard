import { Router } from "express";
import { z } from "zod";
import { prisma } from "./lib/prisma";
import {
  detalheFatura,
  gerarFaturaMensal,
  gerarFaturasDoMes,
  marcarFaturasAtrasadas,
} from "./financeiro/faturaService";
import { registrarPagamento } from "./financeiro/pagamentoService";
import {
  aReceber,
  contratosVencendo,
  faturasAtrasadasRecentemente,
  inadimplencia,
  listarFaturas,
  receitas,
  resumoAcaoRapida,
  statusPorPeriodoInquilino,
} from "./dashboard/dashboardService";
import {
  atualizarInquilino,
  criarInquilino,
  excluirInquilino,
  listarInquilinos,
} from "./cadastros/inquilinoService";
import {
  atualizarFiador,
  buscarFiadorComContratos,
  criarFiador,
  excluirFiador,
  listarFiadores,
} from "./cadastros/fiadorService";
import {
  atualizarImovel,
  buscarImovelComContratoAtivo,
  criarImovel,
  excluirImovel,
  listarImoveis,
} from "./cadastros/imovelService";
import {
  buscarContrato,
  criarContrato,
  encerrarContrato,
  historicoParcelas,
  listarContratos,
} from "./cadastros/contratoService";
import { avaliarDicasContrato, gerarPdfContrato, montarTextoContrato } from "./contratos/contratoDocumentoService";
import { registrarLog } from "./lib/log";

export const router = Router();

const idSchema = z.string().min(1).max(64);
const cpfSchema = z.string().min(11).max(14);

const filtroSchema = z.object({
  competenciaInicio: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  competenciaFim: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  imovelId: idSchema.optional(),
  inquilinoId: idSchema.optional(),
});

// Express 5 encaminha automaticamente rejeições de Promise (inclusive de z.parse) para o
// middleware de erro central — não é necessário try/catch em cada rota.

// ---------------------------------------------------------------------------
// Cadastros: Inquilinos
// ---------------------------------------------------------------------------

const inquilinoSchema = z.object({
  nome: z.string().min(1).max(200),
  cpf: cpfSchema,
  email: z.string().email().max(200).optional(),
  telefone: z.string().max(20).optional(),
});

const atualizarInquilinoSchema = inquilinoSchema.omit({ cpf: true }).partial();

router.post("/inquilinos", async (req, res) => {
  const dados = inquilinoSchema.parse(req.body);
  res.status(201).json(await criarInquilino(prisma, dados, req.usuario));
});

router.get("/inquilinos", async (_req, res) => {
  res.json(await listarInquilinos(prisma));
});

router.put("/inquilinos/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const dados = atualizarInquilinoSchema.parse(req.body);
  res.json(await atualizarInquilino(prisma, id, dados, req.usuario));
});

router.delete("/inquilinos/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(await excluirInquilino(prisma, id, req.usuario));
});

// ---------------------------------------------------------------------------
// Cadastros: Fiadores
// ---------------------------------------------------------------------------

const fiadorSchema = z.object({
  nome: z.string().min(1).max(200),
  cpf: cpfSchema,
});

const atualizarFiadorSchema = z.object({
  nome: z.string().min(1).max(200).optional(),
  ativo: z.boolean().optional(),
});

router.post("/fiadores", async (req, res) => {
  const dados = fiadorSchema.parse(req.body);
  res.status(201).json(await criarFiador(prisma, dados, req.usuario));
});

router.get("/fiadores", async (_req, res) => {
  res.json(await listarFiadores(prisma));
});

router.get("/fiadores/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  // Traz também os contratos que esse fiador garante — uma pessoa pode ser
  // fiadora de mais de um imóvel, e isso precisa aparecer na ficha dela.
  res.json(await buscarFiadorComContratos(prisma, id));
});

router.put("/fiadores/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const dados = atualizarFiadorSchema.parse(req.body);
  res.json(await atualizarFiador(prisma, id, dados, req.usuario));
});

router.delete("/fiadores/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(await excluirFiador(prisma, id, req.usuario));
});

// ---------------------------------------------------------------------------
// Cadastros: Imóveis
// ---------------------------------------------------------------------------

const imovelSchema = z.object({
  endereco: z.string().min(1).max(300),
  valorPadrao: z.number().positive().finite().max(1_000_000_000),
  valorIptuMensal: z.number().positive().finite().max(1_000_000_000).optional(),
});

const atualizarImovelSchema = z.object({
  endereco: z.string().min(1).max(300).optional(),
  valorPadrao: z.number().positive().finite().max(1_000_000_000).optional(),
  valorIptuMensal: z.number().positive().finite().max(1_000_000_000).nullable().optional(),
  status: z.enum(["DISPONIVEL", "MANUTENCAO"]).optional(),
});

router.post("/imoveis", async (req, res) => {
  const dados = imovelSchema.parse(req.body);
  res.status(201).json(await criarImovel(prisma, dados, req.usuario));
});

router.get("/imoveis", async (req, res) => {
  const apenasDisponiveis = req.query.disponiveis === "true";
  res.json(await listarImoveis(prisma, apenasDisponiveis));
});

router.get("/imoveis/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  // Se estiver alugado, já traz um link rápido para o contrato ativo.
  res.json(await buscarImovelComContratoAtivo(prisma, id));
});

router.put("/imoveis/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const dados = atualizarImovelSchema.parse(req.body);
  res.json(await atualizarImovel(prisma, id, dados, req.usuario));
});

router.delete("/imoveis/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(await excluirImovel(prisma, id, req.usuario));
});

// ---------------------------------------------------------------------------
// Contratos (passo a passo: inquilino, imóvel, garantia, valores)
// ---------------------------------------------------------------------------

const contratoSchema = z
  .object({
    inquilinoId: idSchema,
    imovelId: idSchema,
    fiadorId: idSchema.optional(),
    valorAluguel: z.number().positive().finite().max(1_000_000_000),
    diaVencimento: z.number().int().min(1).max(31),
    tipoGarantia: z.enum(["CAUCAO", "FIADOR"]),
    valorCaucao: z.number().positive().finite().optional(),
    responsavelIptu: z.enum(["INQUILINO", "PROPRIETARIO"]).optional(),
    dataInicio: z.coerce.date(),
    dataFim: z.coerce.date(),
    percentualMulta: z.number().min(0).max(100).optional(),
    taxaJurosDiaria: z.number().min(0).max(100).optional(),
  })
  .refine((dados) => dados.tipoGarantia !== "FIADOR" || !!dados.fiadorId, {
    message: "fiadorId é obrigatório quando tipoGarantia é FIADOR",
    path: ["fiadorId"],
  });

router.post("/contratos", async (req, res) => {
  const dados = contratoSchema.parse(req.body);
  res.status(201).json(await criarContrato(prisma, dados, req.usuario));
});

router.get("/contratos", async (_req, res) => {
  res.json(await listarContratos(prisma));
});

router.get("/contratos/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(await buscarContrato(prisma, id));
});

router.get("/contratos/:id/parcelas", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(await historicoParcelas(prisma, id));
});

router.post("/contratos/:id/encerrar", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(await encerrarContrato(prisma, id, req.usuario));
});

// Gerador de contrato profissional: dicas do que falta/é recomendado, e download
// em texto puro ou PDF a partir dos mesmos dados do contrato.

router.get("/contratos/:id/documento/avisos", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const contrato = await buscarContrato(prisma, id);
  res.json({ dicas: avaliarDicasContrato(contrato) });
});

const formatoDocumentoSchema = z.enum(["pdf", "texto"]).default("pdf");

router.get("/contratos/:id/documento", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const formato = formatoDocumentoSchema.parse(req.query.formato ?? "pdf");
  const contrato = await buscarContrato(prisma, id);

  if (formato === "texto") {
    const texto = montarTextoContrato(contrato);
    res.setHeader("Content-Disposition", `attachment; filename="contrato-${id}.txt"`);
    res.type("text/plain; charset=utf-8").send(texto);
    return;
  }

  const pdf = await gerarPdfContrato(contrato);
  res.setHeader("Content-Disposition", `attachment; filename="contrato-${id}.pdf"`);
  res.type("application/pdf").send(pdf);
});

// ---------------------------------------------------------------------------
// Financeiro: faturas e pagamentos
// ---------------------------------------------------------------------------

router.get("/faturas", async (req, res) => {
  const filtro = filtroSchema
    .extend({ status: z.enum(["PENDENTE", "PAGO", "ATRASADO", "CANCELADO"]).optional() })
    .parse(req.query);
  res.json(await listarFaturas(prisma, filtro));
});

router.get("/faturas/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(await detalheFatura(prisma, id));
});

router.post("/faturas/gerar/:contratoId", async (req, res) => {
  const contratoId = idSchema.parse(req.params.contratoId);
  const fatura = await gerarFaturaMensal(prisma, contratoId);
  res.status(201).json(fatura);
});

router.post("/faturas/gerar-mes", async (_req, res) => {
  const resultado = await gerarFaturasDoMes(prisma);
  res.status(201).json(resultado);
});

router.post("/faturas/marcar-atrasadas", async (_req, res) => {
  const atualizadas = await marcarFaturasAtrasadas(prisma);
  res.json(atualizadas);
});

const METODOS_PAGAMENTO = ["PIX", "BOLETO", "DINHEIRO", "CARTAO", "TRANSFERENCIA"] as const;

const pagamentoSchema = z.object({
  valorPago: z.number().positive().finite().max(1_000_000_000),
  metodo: z.enum(METODOS_PAGAMENTO),
  registradoPor: z.string().min(1).max(120).optional(),
  observacao: z.string().max(500).optional(),
});

router.post("/faturas/:faturaId/pagamentos", async (req, res) => {
  const faturaId = idSchema.parse(req.params.faturaId);
  const body = pagamentoSchema.parse(req.body);
  // A auditoria usa sempre o operador autenticado; o campo do corpo, se enviado, é ignorado.
  const registradoPor = req.usuario ?? body.registradoPor ?? "desconhecido";

  const resultado = await registrarPagamento(prisma, { faturaId, ...body, registradoPor });
  res.status(201).json(resultado);
});

// Ação rápida do dashboard: "Reenviar Cobrança". O envio real (email/WhatsApp) ainda
// não está integrado — por ora, registra a intenção no log de atividade para o
// funcionário ter rastro de que a cobrança foi (re)acionada, e devolve um aviso claro
// de que a etapa de envio é manual/pendente.
router.post("/faturas/:id/reenviar-cobranca", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const fatura = await detalheFatura(prisma, id);
  const usuario = req.usuario ?? "desconhecido";

  await registrarLog(prisma, {
    entidade: "Fatura",
    entidadeId: id,
    acao: "COBRANCA_REENVIADA",
    usuario,
    detalhes: { inquilino: fatura.contrato.inquilino.nome },
  });

  res.json({
    enviado: false,
    aviso: "Envio real de cobrança (email/WhatsApp) ainda não está integrado; ação registrada no log de atividade.",
  });
});

// ---------------------------------------------------------------------------
// Log de atividade (quem fez o quê e quando)
// ---------------------------------------------------------------------------

router.get("/log-atividade", async (req, res) => {
  const entidade = req.query.entidade ? idSchema.parse(req.query.entidade) : undefined;
  const entidadeId = req.query.entidadeId ? idSchema.parse(req.query.entidadeId) : undefined;
  const limite = req.query.limite ? z.coerce.number().int().min(1).max(200).parse(req.query.limite) : 50;

  res.json(
    await prisma.logAtividade.findMany({
      where: { ...(entidade ? { entidade } : {}), ...(entidadeId ? { entidadeId } : {}) },
      orderBy: { createdAt: "desc" },
      take: limite,
    })
  );
});

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

router.get("/dashboard/receitas", async (req, res) => {
  res.json(await receitas(prisma, filtroSchema.parse(req.query)));
});

router.get("/dashboard/inadimplencia", async (req, res) => {
  res.json(await inadimplencia(prisma, filtroSchema.parse(req.query)));
});

router.get("/dashboard/a-receber", async (req, res) => {
  const proximosDias = req.query.dias
    ? z.coerce.number().int().min(1).max(365).parse(req.query.dias)
    : undefined;
  res.json(await aReceber(prisma, filtroSchema.parse(req.query), proximosDias));
});

router.get("/dashboard/contratos-vencendo", async (req, res) => {
  const dias = req.query.dias ? z.coerce.number().int().min(1).max(3650).parse(req.query.dias) : undefined;
  res.json(await contratosVencendo(prisma, dias));
});

router.get("/dashboard/faturas-atrasadas-recentemente", async (_req, res) => {
  res.json(await faturasAtrasadasRecentemente(prisma));
});

router.get("/dashboard/resumo", async (_req, res) => {
  res.json(await resumoAcaoRapida(prisma));
});

router.get("/dashboard/inquilinos/:inquilinoId/status-periodo", async (req, res) => {
  const inquilinoId = idSchema.parse(req.params.inquilinoId);
  const granularidade = req.query.granularidade === "semana" ? "semana" : "mes";
  res.json(await statusPorPeriodoInquilino(prisma, inquilinoId, granularidade));
});
