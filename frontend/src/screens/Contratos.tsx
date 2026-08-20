import { useEffect, useState } from "react";
import { ArrowRight, Download, FileText, Plus, RefreshCw, Trash2, XCircle } from "lucide-react";
import { api, ApiError, ehAdmin } from "../lib/api";
import type { Aditivo, Contrato, Fatura, Fiador, Inquilino, Imovel } from "../lib/types";
import { Btn, ErroBox, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, brl, fmtDate } from "../components/ui";

export function Contratos() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [selecionado, setSelecionado] = useState<Contrato | null>(null);
  const [mostrarNovo, setMostrarNovo] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  async function carregar() {
    setCarregando(true);
    setErro("");
    try {
      setContratos(await api.get<Contrato[]>("/contratos"));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar contratos");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div>
      <PageHeader
        title="Contratos"
        sub={`${contratos.length} contratos ativos`}
        action={<Btn icon={<Plus size={14} />} onClick={() => setMostrarNovo(true)}>Novo Contrato</Btn>}
      />

      {erro && <ErroBox mensagem={erro} />}

      {carregando ? (
        <Spinner />
      ) : (
        <div style={{ background: "#fff", border: "1.5px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr 120px 120px 100px 90px 60px", padding: "11px 20px", background: "var(--bg)", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            <span>Inquilino</span><span>Imóvel</span><span>Início</span><span>Término</span><span style={{ textAlign: "right" }}>Aluguel</span><span>Garantia</span><span />
          </div>
          {contratos.map((c, i) => (
            <div
              key={c.id} className="trow"
              style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr 120px 120px 100px 90px 60px", padding: "13px 20px", borderBottom: i < contratos.length - 1 ? "1px solid var(--border-sub)" : "none", alignItems: "center", cursor: "pointer" }}
              onClick={() => setSelecionado(c)}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{c.inquilino?.nome}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Venc. dia {c.diaVencimento}</div>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-sub)" }}>{c.imovel?.endereco}</div>
              <div style={{ fontSize: 12.5, fontFamily: "var(--mono)" }}>{fmtDate(c.dataInicio)}</div>
              <div style={{ fontSize: 12.5, fontFamily: "var(--mono)" }}>{fmtDate(c.dataFim)}</div>
              <div style={{ textAlign: "right", fontFamily: "var(--mono)", fontWeight: 600 }}>{brl(c.valorAluguel)}</div>
              <div>
                <span style={{ fontSize: 11, background: "var(--navy-dim)", color: "var(--navy)", padding: "3px 8px", borderRadius: 99, fontWeight: 600 }}>
                  {c.tipoGarantia === "CAUCAO" ? "Caução" : "Fiador"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
              </div>
            </div>
          ))}
          {!contratos.length && <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>Nenhum contrato cadastrado.</div>}
        </div>
      )}

      {selecionado && (
        <ContractDetailModal
          contratoId={selecionado.id}
          onClose={() => setSelecionado(null)}
          onAlterado={() => {
            setSelecionado(null);
            carregar();
          }}
        />
      )}
      {mostrarNovo && (
        <NewContractModal
          onClose={() => setMostrarNovo(false)}
          onCriado={() => {
            setMostrarNovo(false);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function ContractDetailModal({
  contratoId,
  onClose,
  onAlterado,
}: {
  contratoId: string;
  onClose: () => void;
  onAlterado: () => void;
}) {
  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [parcelas, setParcelas] = useState<Fatura[]>([]);
  const [aditivos, setAditivos] = useState<Aditivo[]>([]);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [confirmandoEncerramento, setConfirmandoEncerramento] = useState(false);
  const [mostrarRenovar, setMostrarRenovar] = useState(false);
  const [mostrarAditivo, setMostrarAditivo] = useState(false);
  const [processando, setProcessando] = useState(false);
  const admin = ehAdmin();

  // `recarregar` é usado imperativamente depois de ações (ex.: registrar aditivo) —
  // não precisa de guarda contra desmontagem porque é chamado direto por um handler,
  // não por um efeito que pode disparar de novo antes da resposta anterior voltar.
  async function recarregar() {
    setErro("");
    try {
      const [c, p, a] = await Promise.all([
        api.get<Contrato>(`/contratos/${contratoId}`),
        api.get<Fatura[]>(`/contratos/${contratoId}/parcelas`),
        api.get<Aditivo[]>(`/contratos/${contratoId}/aditivos`),
      ]);
      setContrato(c);
      setParcelas(p);
      setAditivos(a);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar contrato");
    }
  }

  useEffect(() => {
    let cancelado = false;
    setContrato(null);
    setParcelas([]);
    setAditivos([]);
    setErro("");
    setCarregando(true);
    Promise.all([
      api.get<Contrato>(`/contratos/${contratoId}`),
      api.get<Fatura[]>(`/contratos/${contratoId}/parcelas`),
      api.get<Aditivo[]>(`/contratos/${contratoId}/aditivos`),
    ])
      .then(([c, p, a]) => {
        if (cancelado) return;
        setContrato(c);
        setParcelas(p);
        setAditivos(a);
      })
      .catch((e) => {
        if (!cancelado) setErro(e instanceof ApiError ? e.message : "Falha ao carregar contrato");
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [contratoId]);

  async function excluir() {
    setErro("");
    setProcessando(true);
    try {
      await api.delete(`/contratos/${contratoId}`);
      onAlterado();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao excluir contrato");
      setProcessando(false);
      setConfirmandoExclusao(false);
    }
  }

  async function encerrar() {
    setErro("");
    setProcessando(true);
    try {
      await api.post(`/contratos/${contratoId}/encerrar`);
      onAlterado();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao encerrar contrato");
      setProcessando(false);
      setConfirmandoEncerramento(false);
    }
  }

  async function baixarDocumento(formato: "pdf" | "texto") {
    setErro("");
    try {
      await api.baixar(
        `/contratos/${contratoId}/documento?formato=${formato}`,
        `contrato-${contratoId}.${formato === "pdf" ? "pdf" : "txt"}`
      );
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao baixar documento");
    }
  }

  if (carregando) return <Modal onClose={onClose} title="Detalhes do Contrato">{erro ? <ErroBox mensagem={erro} /> : <Spinner />}</Modal>;
  if (!contrato) return <Modal onClose={onClose} title="Detalhes do Contrato"><ErroBox mensagem={erro || "Contrato não encontrado"} /></Modal>;

  const ativo = contrato.status === "ATIVO";

  return (
    <Modal onClose={onClose} title="Detalhes do Contrato" width={640}>
      {erro && <ErroBox mensagem={erro} />}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <StatusBadge status={contrato.status} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {[
          ["Inquilino", contrato.inquilino?.nome ?? "—"],
          ["Imóvel", contrato.imovel?.endereco ?? "—"],
          ["Início", fmtDate(contrato.dataInicio)],
          ["Término", fmtDate(contrato.dataFim)],
          ["Valor do Aluguel", brl(contrato.valorAluguel)],
          ["Dia de Vencimento", `Dia ${contrato.diaVencimento}`],
          ["Multa Contratual", `${contrato.percentualMulta}%`],
          ["Juros por Atraso", `${contrato.taxaJurosDiaria}% ao dia`],
        ].map(([l, v]) => (
          <div key={l} style={{ background: "var(--bg)", borderRadius: 9, padding: "10px 14px" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2, fontWeight: 600 }}>{l}</div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <Btn variant="outline" size="sm" icon={<Download size={12} />} onClick={() => baixarDocumento("pdf")}>PDF do Contrato</Btn>
        <Btn variant="outline" size="sm" icon={<FileText size={12} />} onClick={() => baixarDocumento("texto")}>Texto do Contrato</Btn>
        {ativo && (
          <Btn variant="outline" size="sm" icon={<RefreshCw size={12} />} onClick={() => setMostrarAditivo(true)}>Registrar Aditivo</Btn>
        )}
        {ativo && admin && (
          <Btn variant="outline" size="sm" icon={<RefreshCw size={12} />} onClick={() => setMostrarRenovar(true)}>Renovar Contrato</Btn>
        )}
      </div>

      {aditivos.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Aditivos</div>
          <div style={{ border: "1.5px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
            {aditivos.map((a, i) => (
              <div key={a.id} style={{ padding: "10px 14px", borderBottom: i < aditivos.length - 1 ? "1px solid var(--border-sub)" : "none", fontSize: 12.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600 }}>Vigência: {fmtDate(a.dataVigencia)}</span>
                  <span style={{ color: "var(--text-muted)" }}>{fmtDate(a.createdAt)}</span>
                </div>
                {a.novoValorAluguel != null && <div>Novo aluguel: {brl(a.novoValorAluguel)}</div>}
                {a.novoDiaVencimento != null && <div>Novo dia de vencimento: {a.novoDiaVencimento}</div>}
                {a.motivo && <div style={{ color: "var(--text-muted)" }}>{a.motivo}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Histórico de Parcelas</div>
      <div style={{ border: "1.5px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
        {parcelas
          .slice()
          .sort((a, b) => b.dataVencimento.localeCompare(a.dataVencimento))
          .map((p, i) => (
            <div key={p.id} style={{ display: "grid", gridTemplateColumns: "120px 80px 1fr 130px", padding: "10px 14px", borderBottom: i < parcelas.length - 1 ? "1px solid var(--border-sub)" : "none", alignItems: "center", fontSize: 12.5 }}>
              <span style={{ fontFamily: "var(--mono)" }}>{fmtDate(p.dataVencimento)}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.tipo}</span>
              <StatusBadge status={p.status} />
              <span style={{ fontFamily: "var(--mono)", textAlign: "right", fontWeight: 600 }}>{brl(p.valorTotal)}</span>
            </div>
          ))}
        {!parcelas.length && <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Sem parcelas.</div>}
      </div>

      {admin && ativo && (
        <div style={{ display: "flex", gap: 8, marginBottom: confirmandoEncerramento || confirmandoExclusao ? 10 : 0 }}>
          {!confirmandoEncerramento && (
            <Btn variant="outline" icon={<XCircle size={14} />} onClick={() => setConfirmandoEncerramento(true)}>
              Encerrar Contrato
            </Btn>
          )}
          {!confirmandoExclusao && (
            <Btn variant="danger" icon={<Trash2 size={14} />} onClick={() => setConfirmandoExclusao(true)}>
              Excluir Contrato
            </Btn>
          )}
        </div>
      )}
      {admin && !ativo && !confirmandoExclusao && (
        <Btn variant="danger" icon={<Trash2 size={14} />} onClick={() => setConfirmandoExclusao(true)}>
          Excluir Contrato
        </Btn>
      )}

      {confirmandoEncerramento && (
        <div style={{ background: "var(--warning-dim)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 10, padding: 14, marginBottom: 10 }}>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "#92400e", fontWeight: 600 }}>
            Encerrar este contrato? O imóvel volta a ficar disponível e as parcelas ainda pendentes serão canceladas.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="ghost" onClick={() => setConfirmandoEncerramento(false)} disabled={processando}>Cancelar</Btn>
            <Btn onClick={encerrar} disabled={processando}>{processando ? "Encerrando…" : "Confirmar encerramento"}</Btn>
          </div>
        </div>
      )}

      {confirmandoExclusao && (
        <div style={{ background: "var(--red-dim)", border: "1px solid rgba(211,21,34,0.3)", borderRadius: 10, padding: 14 }}>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--red)", fontWeight: 600 }}>
            Tem certeza que deseja excluir este contrato? Parcelas ainda pendentes serão canceladas. Faturas já pagas
            ou atrasadas continuam no histórico. Essa ação não pode ser desfeita pela interface.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="ghost" onClick={() => setConfirmandoExclusao(false)} disabled={processando}>
              Cancelar
            </Btn>
            <Btn variant="danger" onClick={excluir} disabled={processando}>
              {processando ? "Excluindo…" : "Confirmar exclusão"}
            </Btn>
          </div>
        </div>
      )}

      {mostrarRenovar && (
        <RenewContractModal
          contrato={contrato}
          onClose={() => setMostrarRenovar(false)}
          onRenovado={onAlterado}
        />
      )}
      {mostrarAditivo && (
        <AmendmentModal
          contrato={contrato}
          onClose={() => setMostrarAditivo(false)}
          onRegistrado={() => {
            setMostrarAditivo(false);
            recarregar();
          }}
        />
      )}
    </Modal>
  );
}

function RenewContractModal({ contrato, onClose, onRenovado }: { contrato: Contrato; onClose: () => void; onRenovado: () => void }) {
  const [novaDataFim, setNovaDataFim] = useState("");
  const [novoValorAluguel, setNovoValorAluguel] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro("");
    if (!novaDataFim) {
      setErro("Informe a nova data de término.");
      return;
    }
    if (new Date(novaDataFim) <= new Date(contrato.dataFim)) {
      setErro("A nova data de término deve ser posterior à data de término atual.");
      return;
    }
    setSalvando(true);
    try {
      await api.post(`/contratos/${contrato.id}/renovar`, {
        novaDataFim,
        novoValorAluguel: novoValorAluguel ? Number(novoValorAluguel) : undefined,
      });
      onRenovado();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao renovar contrato");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Renovar Contrato">
      {erro && <ErroBox mensagem={erro} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label={`Nova Data de Término (atual: ${fmtDate(contrato.dataFim)})`}>
          <Input type="date" value={novaDataFim} onChange={(e) => setNovaDataFim(e.target.value)} />
        </Field>
        <Field label={`Novo Valor do Aluguel (R$, opcional — atual: ${brl(contrato.valorAluguel)})`}>
          <Input type="number" value={novoValorAluguel} onChange={(e) => setNovoValorAluguel(e.target.value)} />
        </Field>
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={salvar} disabled={salvando}>{salvando ? "Renovando…" : "Renovar"}</Btn>
      </div>
    </Modal>
  );
}

function AmendmentModal({ contrato, onClose, onRegistrado }: { contrato: Contrato; onClose: () => void; onRegistrado: () => void }) {
  const [dataVigencia, setDataVigencia] = useState("");
  const [novoValorAluguel, setNovoValorAluguel] = useState("");
  const [novoDiaVencimento, setNovoDiaVencimento] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro("");
    if (!dataVigencia) {
      setErro("Informe a data de vigência do aditivo.");
      return;
    }
    if (!novoValorAluguel && !novoDiaVencimento) {
      setErro("Informe um novo valor de aluguel e/ou um novo dia de vencimento.");
      return;
    }
    setSalvando(true);
    try {
      await api.post(`/contratos/${contrato.id}/aditivos`, {
        dataVigencia,
        novoValorAluguel: novoValorAluguel ? Number(novoValorAluguel) : undefined,
        novoDiaVencimento: novoDiaVencimento ? Number(novoDiaVencimento) : undefined,
        motivo: motivo || undefined,
      });
      onRegistrado();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao registrar aditivo");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Registrar Aditivo Contratual">
      {erro && <ErroBox mensagem={erro} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Data de Vigência (a partir de quando vale o novo valor)">
          <Input type="date" value={dataVigencia} onChange={(e) => setDataVigencia(e.target.value)} />
        </Field>
        <Field label={`Novo Valor do Aluguel (R$, opcional — atual: ${brl(contrato.valorAluguel)})`}>
          <Input type="number" value={novoValorAluguel} onChange={(e) => setNovoValorAluguel(e.target.value)} />
        </Field>
        <Field label={`Novo Dia de Vencimento (opcional — atual: dia ${contrato.diaVencimento})`}>
          <Input type="number" min={1} max={31} value={novoDiaVencimento} onChange={(e) => setNovoDiaVencimento(e.target.value)} />
        </Field>
        <Field label="Motivo (opcional)">
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex: reajuste anual" />
        </Field>
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Registrar Aditivo"}</Btn>
      </div>
    </Modal>
  );
}

function NewContractModal({ onClose, onCriado }: { onClose: () => void; onCriado: () => void }) {
  const [inquilinos, setInquilinos] = useState<Inquilino[]>([]);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [fiadores, setFiadores] = useState<Fiador[]>([]);
  const [form, setForm] = useState({
    inquilinoId: "", imovelId: "", valorAluguel: "", diaVencimento: "5",
    dataInicio: "", dataFim: "", tipoGarantia: "CAUCAO" as "CAUCAO" | "FIADOR", valorCaucao: "", fiadorId: "",
    percentualMulta: "10", taxaJurosDiaria: "0.5",
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [carregandoListas, setCarregandoListas] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<Inquilino[]>("/inquilinos"),
      api.get<Imovel[]>("/imoveis?disponiveis=true"),
      api.get<Fiador[]>("/fiadores"),
    ])
      .then(([t, p, g]) => {
        setInquilinos(t);
        setImoveis(p);
        setFiadores(g.filter((f) => f.ativo));
      })
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Falha ao carregar inquilinos/imóveis/fiadores"))
      .finally(() => setCarregandoListas(false));
  }, []);

  function validar(): string | null {
    if (!form.inquilinoId) return "Selecione o inquilino.";
    if (!form.imovelId) return "Selecione o imóvel.";
    if (!form.valorAluguel || Number(form.valorAluguel) <= 0) return "Informe um valor de aluguel maior que zero.";
    if (!form.dataInicio) return "Informe a data de início.";
    if (!form.dataFim) return "Informe a data de término.";
    if (new Date(form.dataFim) <= new Date(form.dataInicio)) return "A data de término deve ser posterior à de início.";
    if (form.tipoGarantia === "CAUCAO" && (!form.valorCaucao || Number(form.valorCaucao) <= 0)) {
      return "Informe um valor de caução maior que zero.";
    }
    if (form.tipoGarantia === "FIADOR" && !form.fiadorId) {
      return "Selecione o fiador.";
    }
    return null;
  }

  async function salvar() {
    const mensagemValidacao = validar();
    if (mensagemValidacao) {
      setErro(mensagemValidacao);
      return;
    }
    setErro("");
    setSalvando(true);
    try {
      await api.post("/contratos", {
        inquilinoId: form.inquilinoId,
        imovelId: form.imovelId,
        valorAluguel: Number(form.valorAluguel),
        diaVencimento: Number(form.diaVencimento),
        tipoGarantia: form.tipoGarantia,
        valorCaucao: form.tipoGarantia === "CAUCAO" ? Number(form.valorCaucao) : undefined,
        fiadorId: form.tipoGarantia === "FIADOR" ? form.fiadorId : undefined,
        dataInicio: form.dataInicio,
        dataFim: form.dataFim,
        percentualMulta: form.percentualMulta ? Number(form.percentualMulta) : undefined,
        taxaJurosDiaria: form.taxaJurosDiaria ? Number(form.taxaJurosDiaria) : undefined,
      });
      onCriado();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao criar contrato");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Novo Contrato" width={560}>
      {erro && <ErroBox mensagem={erro} />}
      {carregandoListas ? (
        <Spinner />
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Inquilino">
              <Select value={form.inquilinoId} onChange={(e) => setForm((f) => ({ ...f, inquilinoId: e.target.value }))}>
                <option value="">Selecione o inquilino…</option>
                {inquilinos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </Select>
            </Field>
            <Field label="Imóvel">
              <Select value={form.imovelId} onChange={(e) => setForm((f) => ({ ...f, imovelId: e.target.value }))}>
                <option value="">Selecione o imóvel disponível…</option>
                {imoveis.map((p) => <option key={p.id} value={p.id}>{p.endereco}</option>)}
              </Select>
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Valor do Aluguel (R$)">
                <Input type="number" value={form.valorAluguel} onChange={(e) => setForm((f) => ({ ...f, valorAluguel: e.target.value }))} />
              </Field>
              <Field label="Dia de Vencimento">
                <Select value={form.diaVencimento} onChange={(e) => setForm((f) => ({ ...f, diaVencimento: e.target.value }))}>
                  {[1, 5, 10, 15, 20, 25].map((d) => <option key={d} value={d}>Dia {d}</option>)}
                </Select>
              </Field>
              <Field label="Data de Início">
                <Input type="date" value={form.dataInicio} onChange={(e) => setForm((f) => ({ ...f, dataInicio: e.target.value }))} />
              </Field>
              <Field label="Data de Término">
                <Input type="date" value={form.dataFim} onChange={(e) => setForm((f) => ({ ...f, dataFim: e.target.value }))} />
              </Field>
            </div>
            <Field label="Garantia">
              <Select value={form.tipoGarantia} onChange={(e) => setForm((f) => ({ ...f, tipoGarantia: e.target.value as "CAUCAO" | "FIADOR" }))}>
                <option value="CAUCAO">Caução</option>
                <option value="FIADOR">Fiador</option>
              </Select>
            </Field>
            {form.tipoGarantia === "CAUCAO" && (
              <Field label="Valor da Caução (R$)">
                <Input type="number" value={form.valorCaucao} onChange={(e) => setForm((f) => ({ ...f, valorCaucao: e.target.value }))} />
              </Field>
            )}
            {form.tipoGarantia === "FIADOR" && (
              <Field label="Fiador">
                <Select value={form.fiadorId} onChange={(e) => setForm((f) => ({ ...f, fiadorId: e.target.value }))}>
                  <option value="">Selecione o fiador…</option>
                  {fiadores.map((g) => <option key={g.id} value={g.id}>{g.nome} — {g.cpf}</option>)}
                </Select>
                {!fiadores.length && (
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
                    Nenhum fiador ativo cadastrado. Cadastre um em Cadastros → Fiadores antes de continuar.
                  </p>
                )}
              </Field>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Multa por Atraso (%)">
                <Input type="number" step="0.1" value={form.percentualMulta} onChange={(e) => setForm((f) => ({ ...f, percentualMulta: e.target.value }))} />
              </Field>
              <Field label="Juros por Dia de Atraso (%)">
                <Input type="number" step="0.01" value={form.taxaJurosDiaria} onChange={(e) => setForm((f) => ({ ...f, taxaJurosDiaria: e.target.value }))} />
              </Field>
            </div>
          </div>
          <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
            <Btn onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar Contrato"}</Btn>
          </div>
        </>
      )}
    </Modal>
  );
}
