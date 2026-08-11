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
import { exportarFaturasCsv } from "./dashboard/relatoriosService";
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
  excluirContrato,
  historicoParcelas,
  listarContratos,
  renovarContrato,
} from "./cadastros/contratoService";
import { listarAditivos, registrarAditivo } from "./cadastros/aditivoService";
import { avaliarDicasContrato, gerarPdfContrato, montarTextoContrato } from "./contratos/contratoDocumentoService";
import { registrarLog } from "./lib/log";
import { paraReaisNaResposta, reaisParaCentavos } from "./lib/dinheiro";
import { enviarEmail, envioDeEmailConfigurado } from "./lib/email";
import { criarUsuario, login, registrarPrimeiroAdmin } from "./auth/authService";
import { exigirPapel } from "./middleware/auth";
import { carregarEnv } from "./lib/env";

export const router = Router();

const idSchema = z.string().min(1).max(64);
const cpfSchema = z.string().min(11).max(14);

// Valor em reais na entrada da API, convertido para centavos (unidade interna — ver
// src/lib/dinheiro.ts) já na validação, para o resto do código nunca lidar com reais.
const valorReaisObrigatorio = z.number().positive().finite().max(1_000_000_000).transform(reaisParaCentavos);
const valorReaisOpcional = valorReaisObrigatorio.optional();
const valorReaisNullableOpcional = valorReaisObrigatorio.nullable().optional();

const filtroSchema = z.object({
  competenciaInicio: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  competenciaFim: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  imovelId: idSchema.optional(),
  inquilinoId: idSchema.optional(),
});

// Express 5 encaminha automaticamente rejeições de Promise (inclusive de z.parse) para o
// middleware de erro central — não é necessário try/catch em cada rota.

// ---------------------------------------------------------------------------
// Autenticação e usuários (RBAC leve: ADMIN / OPERADOR)
// ---------------------------------------------------------------------------

const registrarAdminSchema = z.object({
  nome: z.string().min(1).max(200),
  email: z.string().email().max(200),
  senha: z.string().min(8).max(200),
});

router.post("/auth/registrar-primeiro-admin", async (req, res) => {
  const dados = registrarAdminSchema.parse(req.body);
  const usuario = await registrarPrimeiroAdmin(prisma, dados);
  res.status(201).json({ id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel });
});

const loginSchema = z.object({ email: z.string().email().max(200), senha: z.string().min(1).max(200) });

router.post("/auth/login", async (req, res) => {
  const { email, senha } = loginSchema.parse(req.body);
  const env = carregarEnv();
  res.json(await login(prisma, email, senha, env.JWT_SECRET));
});

const criarUsuarioSchema = z.object({
  nome: z.string().min(1).max(200),
  email: z.string().email().max(200),
  senha: z.string().min(8).max(200),
  papel: z.enum(["ADMIN", "OPERADOR"]).optional(),
});

router.post("/usuarios", exigirPapel("ADMIN"), async (req, res) => {
  const dados = criarUsuarioSchema.parse(req.body);
  const usuario = await criarUsuario(prisma, dados);
  res.status(201).json({ id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel });
});

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

router.delete("/inquilinos/:id", exigirPapel("ADMIN"), async (req, res) => {
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
  res.json(paraReaisNaResposta(await buscarFiadorComContratos(prisma, id)));
});

router.put("/fiadores/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const dados = atualizarFiadorSchema.parse(req.body);
  res.json(await atualizarFiador(prisma, id, dados, req.usuario));
});

router.delete("/fiadores/:id", exigirPapel("ADMIN"), async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(await excluirFiador(prisma, id, req.usuario));
});

// ---------------------------------------------------------------------------
// Cadastros: Imóveis
// ---------------------------------------------------------------------------

const imovelSchema = z.object({
  endereco: z.string().min(1).max(300),
  valorPadrao: valorReaisObrigatorio,
  valorIptuMensal: valorReaisOpcional,
});

const atualizarImovelSchema = z.object({
  endereco: z.string().min(1).max(300).optional(),
  valorPadrao: valorReaisOpcional,
  valorIptuMensal: valorReaisNullableOpcional,
  status: z.enum(["DISPONIVEL", "MANUTENCAO"]).optional(),
});

router.post("/imoveis", async (req, res) => {
  const dados = imovelSchema.parse(req.body);
  res.status(201).json(paraReaisNaResposta(await criarImovel(prisma, dados, req.usuario)));
});

router.get("/imoveis", async (req, res) => {
  const apenasDisponiveis = req.query.disponiveis === "true";
  res.json(paraReaisNaResposta(await listarImoveis(prisma, apenasDisponiveis)));
});

router.get("/imoveis/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  // Se estiver alugado, já traz um link rápido para o contrato ativo.
  res.json(paraReaisNaResposta(await buscarImovelComContratoAtivo(prisma, id)));
});

router.put("/imoveis/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const dados = atualizarImovelSchema.parse(req.body);
  res.json(paraReaisNaResposta(await atualizarImovel(prisma, id, dados, req.usuario)));
});

router.delete("/imoveis/:id", exigirPapel("ADMIN"), async (req, res) => {
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
    valorAluguel: valorReaisObrigatorio,
    diaVencimento: z.number().int().min(1).max(31),
    tipoGarantia: z.enum(["CAUCAO", "FIADOR"]),
    valorCaucao: valorReaisOpcional,
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
  res.status(201).json(paraReaisNaResposta(await criarContrato(prisma, dados, req.usuario)));
});

router.get("/contratos", async (_req, res) => {
  res.json(paraReaisNaResposta(await listarContratos(prisma)));
});

router.get("/contratos/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(paraReaisNaResposta(await buscarContrato(prisma, id)));
});

router.get("/contratos/:id/parcelas", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(paraReaisNaResposta(await historicoParcelas(prisma, id)));
});

router.post("/contratos/:id/encerrar", exigirPapel("ADMIN"), async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(paraReaisNaResposta(await encerrarContrato(prisma, id, req.usuario)));
});

// Exclusão lógica do contrato (ex.: quebrado antes do prazo) — mesma política de
// acesso das outras exclusões de cadastro: exige ADMIN autenticado via JWT.
router.delete("/contratos/:id", exigirPapel("ADMIN"), async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(paraReaisNaResposta(await excluirContrato(prisma, id, req.usuario)));
});

const renovarContratoSchema = z.object({
  novaDataFim: z.coerce.date(),
  novoValorAluguel: valorReaisOpcional,
});

router.post("/contratos/:id/renovar", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const dados = renovarContratoSchema.parse(req.body);
  res.status(201).json(paraReaisNaResposta(await renovarContrato(prisma, id, dados, req.usuario)));
});

// Aditivo contratual: reajuste de valor/dia de vencimento a partir de uma data,
// sem mexer em faturas já geradas (só recria as pendentes futuras afetadas).

const aditivoSchema = z
  .object({
    dataVigencia: z.coerce.date(),
    novoValorAluguel: valorReaisOpcional,
    novoDiaVencimento: z.number().int().min(1).max(31).optional(),
    motivo: z.string().max(300).optional(),
  })
  .refine((d) => d.novoValorAluguel != null || d.novoDiaVencimento != null, {
    message: "Informe novoValorAluguel e/ou novoDiaVencimento",
  });

router.post("/contratos/:id/aditivos", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const dados = aditivoSchema.parse(req.body);
  res.status(201).json(paraReaisNaResposta(await registrarAditivo(prisma, id, dados, req.usuario)));
});

router.get("/contratos/:id/aditivos", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(paraReaisNaResposta(await listarAditivos(prisma, id)));
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
  // Propositalmente NÃO convertido para reais aqui: o gerador de documento formata
  // a moeda ele mesmo a partir de centavos (ver contratoDocumentoService).
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

const filtroFaturasSchema = filtroSchema.extend({
  status: z.enum(["PENDENTE", "PAGO", "ATRASADO", "CANCELADO"]).optional(),
});

router.get("/faturas", async (req, res) => {
  const filtro = filtroFaturasSchema.parse(req.query);
  res.json(paraReaisNaResposta(await listarFaturas(prisma, filtro)));
});

router.get("/faturas/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(paraReaisNaResposta(await detalheFatura(prisma, id)));
});

router.post("/faturas/gerar/:contratoId", async (req, res) => {
  const contratoId = idSchema.parse(req.params.contratoId);
  const fatura = await gerarFaturaMensal(prisma, contratoId);
  res.status(201).json(paraReaisNaResposta(fatura));
});

router.post("/faturas/gerar-mes", async (_req, res) => {
  const resultado = await gerarFaturasDoMes(prisma);
  res.status(201).json(paraReaisNaResposta(resultado));
});

router.post("/faturas/marcar-atrasadas", async (_req, res) => {
  const atualizadas = await marcarFaturasAtrasadas(prisma);
  res.json(paraReaisNaResposta(atualizadas));
});

const METODOS_PAGAMENTO = ["PIX", "BOLETO", "DINHEIRO", "CARTAO", "TRANSFERENCIA"] as const;

const pagamentoSchema = z.object({
  valorPago: valorReaisObrigatorio,
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
  res.status(201).json(paraReaisNaResposta(resultado));
});

// Ação rápida do dashboard: "Reenviar Cobrança". Envia email de verdade se SMTP
// estiver configurado (ver src/lib/email.ts); senão, registra a intenção no log de
// atividade e avisa que o envio real ainda não está configurado.
router.post("/faturas/:id/reenviar-cobranca", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const fatura = await detalheFatura(prisma, id);
  const usuario = req.usuario ?? "desconhecido";

  let enviado = false;
  let aviso = "Envio real de cobrança ainda não está configurado (defina SMTP_* no .env); ação registrada no log de atividade.";

  if (envioDeEmailConfigurado() && fatura.contrato.inquilino.email) {
    await enviarEmail({
      destinatario: fatura.contrato.inquilino.email,
      assunto: `Cobrança em atraso — ${fatura.contrato.imovel.endereco}`,
      corpo: `Olá ${fatura.contrato.inquilino.nome}, identificamos uma fatura (${fatura.competencia}, ${fatura.tipo}) em atraso. Por favor, regularize o pagamento.`,
    });
    enviado = true;
    aviso = "Email de cobrança enviado.";
  } else if (envioDeEmailConfigurado() && !fatura.contrato.inquilino.email) {
    aviso = "SMTP configurado, mas o inquilino não tem email cadastrado.";
  }

  await registrarLog(prisma, {
    entidade: "Fatura",
    entidadeId: id,
    acao: "COBRANCA_REENVIADA",
    usuario,
    detalhes: { inquilino: fatura.contrato.inquilino.nome, enviado },
  });

  res.json({ enviado, aviso });
});

// ---------------------------------------------------------------------------
// Relatórios
// ---------------------------------------------------------------------------

router.get("/relatorios/faturas.csv", async (req, res) => {
  const filtro = filtroFaturasSchema.parse(req.query);
  const csv = await exportarFaturasCsv(prisma, filtro);
  res.setHeader("Content-Disposition", 'attachment; filename="faturas.csv"');
  res.type("text/csv; charset=utf-8").send(csv);
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
  res.json(paraReaisNaResposta(await receitas(prisma, filtroSchema.parse(req.query))));
});

router.get("/dashboard/inadimplencia", async (req, res) => {
  res.json(paraReaisNaResposta(await inadimplencia(prisma, filtroSchema.parse(req.query))));
});

router.get("/dashboard/a-receber", async (req, res) => {
  const proximosDias = req.query.dias
    ? z.coerce.number().int().min(1).max(365).parse(req.query.dias)
    : undefined;
  res.json(paraReaisNaResposta(await aReceber(prisma, filtroSchema.parse(req.query), proximosDias)));
});

router.get("/dashboard/contratos-vencendo", async (req, res) => {
  const dias = req.query.dias ? z.coerce.number().int().min(1).max(3650).parse(req.query.dias) : undefined;
  res.json(paraReaisNaResposta(await contratosVencendo(prisma, dias)));
});

router.get("/dashboard/faturas-atrasadas-recentemente", async (_req, res) => {
  res.json(paraReaisNaResposta(await faturasAtrasadasRecentemente(prisma)));
});

router.get("/dashboard/resumo", async (_req, res) => {
  res.json(paraReaisNaResposta(await resumoAcaoRapida(prisma)));
});

router.get("/dashboard/inquilinos/:inquilinoId/status-periodo", async (req, res) => {
  const inquilinoId = idSchema.parse(req.params.inquilinoId);
  const granularidade = req.query.granularidade === "semana" ? "semana" : "mes";
  res.json(paraReaisNaResposta(await statusPorPeriodoInquilino(prisma, inquilinoId, granularidade)));
});
