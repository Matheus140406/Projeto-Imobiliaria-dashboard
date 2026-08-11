import { useEffect, useState } from "react";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { Contrato, Fatura, Inquilino, Imovel } from "../lib/types";
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
          onExcluido={() => {
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
  onExcluido,
}: {
  contratoId: string;
  onClose: () => void;
  onExcluido: () => void;
}) {
  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [parcelas, setParcelas] = useState<Fatura[]>([]);
  const [erro, setErro] = useState("");
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    Promise.all([api.get<Contrato>(`/contratos/${contratoId}`), api.get<Fatura[]>(`/contratos/${contratoId}/parcelas`)])
      .then(([c, p]) => {
        setContrato(c);
        setParcelas(p);
      })
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Falha ao carregar contrato"));
  }, [contratoId]);

  async function excluir() {
    setErro("");
    setExcluindo(true);
    try {
      await api.delete(`/contratos/${contratoId}`);
      onExcluido();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao excluir contrato");
      setExcluindo(false);
      setConfirmandoExclusao(false);
    }
  }

  if (!contrato) return <Modal onClose={onClose} title="Detalhes do Contrato">{erro ? <ErroBox mensagem={erro} /> : <Spinner />}</Modal>;

  return (
    <Modal onClose={onClose} title="Detalhes do Contrato" width={640}>
      {erro && <ErroBox mensagem={erro} />}

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

      {!confirmandoExclusao ? (
        <Btn variant="danger" icon={<Trash2 size={14} />} onClick={() => setConfirmandoExclusao(true)}>
          Excluir Contrato
        </Btn>
      ) : (
        <div style={{ background: "var(--red-dim)", border: "1px solid rgba(211,21,34,0.3)", borderRadius: 10, padding: 14 }}>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--red)", fontWeight: 600 }}>
            Tem certeza que deseja excluir este contrato? Parcelas ainda pendentes serão canceladas. Faturas já pagas
            ou atrasadas continuam no histórico. Essa ação não pode ser desfeita pela interface.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="ghost" onClick={() => setConfirmandoExclusao(false)} disabled={excluindo}>
              Cancelar
            </Btn>
            <Btn variant="danger" onClick={excluir} disabled={excluindo}>
              {excluindo ? "Excluindo…" : "Confirmar exclusão"}
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

function NewContractModal({ onClose, onCriado }: { onClose: () => void; onCriado: () => void }) {
  const [inquilinos, setInquilinos] = useState<Inquilino[]>([]);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [form, setForm] = useState({
    inquilinoId: "", imovelId: "", valorAluguel: "", diaVencimento: "5",
    dataInicio: "", dataFim: "", tipoGarantia: "CAUCAO" as "CAUCAO" | "FIADOR", valorCaucao: "",
    percentualMulta: "10", taxaJurosDiaria: "0.5",
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    Promise.all([api.get<Inquilino[]>("/inquilinos"), api.get<Imovel[]>("/imoveis?disponiveis=true")]).then(([t, p]) => {
      setInquilinos(t);
      setImoveis(p);
    });
  }, []);

  async function salvar() {
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
    </Modal>
  );
}
