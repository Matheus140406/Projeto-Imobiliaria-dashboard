import { useEffect, useMemo, useState } from "react";
import { CircleCheck, Search, Send } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { DetalheFatura, Fatura, Metodo } from "../lib/types";
import { Btn, ErroBox, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, brl, fmtDate } from "../components/ui";

type FinFiltro = "todos" | "atrasados" | "semana" | "pagos";

const METODOS: Metodo[] = ["PIX", "BOLETO", "DINHEIRO", "CARTAO", "TRANSFERENCIA"];

export function Financeiro() {
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [filtro, setFiltro] = useState<FinFiltro>("todos");
  const [busca, setBusca] = useState("");
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  async function carregar() {
    setCarregando(true);
    setErro("");
    try {
      const query = filtro === "atrasados" ? "?status=ATRASADO" : filtro === "pagos" ? "?status=PAGO" : "";
      const resposta = await api.get<Fatura[]>(`/faturas${query}`);
      setFaturas(resposta);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar faturas");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  const filtradas = useMemo(() => {
    let lista = [...faturas];
    if (filtro === "semana") {
      const agora = Date.now();
      lista = lista.filter((f) => {
        if (f.status === "PAGO") return false;
        const diff = (new Date(f.dataVencimento).getTime() - agora) / 86400000;
        return diff >= 0 && diff <= 7;
      });
    }
    if (busca) {
      const alvo = busca.toLowerCase();
      lista = lista.filter((f) => f.contrato.inquilino?.nome.toLowerCase().includes(alvo));
    }
    return lista.sort((a, b) => b.dataVencimento.localeCompare(a.dataVencimento));
  }, [faturas, filtro, busca]);

  const filterBtns: [FinFiltro, string][] = [
    ["todos", "Todos"],
    ["atrasados", "Somente Atrasados"],
    ["semana", "Vencem esta Semana"],
    ["pagos", "Pagos"],
  ];

  return (
    <div>
      <PageHeader title="Controle Financeiro" sub="Gestão de faturas e recebimentos" />

      {erro && <ErroBox mensagem={erro} />}

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4, background: "#fff", border: "1.5px solid var(--border)", borderRadius: 10, padding: 3 }}>
          {filterBtns.map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFiltro(v)}
              style={{
                padding: "6px 13px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 500,
                background: filtro === v ? "var(--navy)" : "transparent", color: filtro === v ? "#fff" : "var(--text-sub)",
                transition: "all 0.15s", fontFamily: "var(--font)",
              }}
            >
              {l}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
          <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <Input style={{ paddingLeft: 32 }} placeholder="Buscar inquilino…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>

      {carregando ? (
        <Spinner />
      ) : (
        <div style={{ background: "#fff", border: "1.5px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr 100px 90px 110px 110px", padding: "11px 20px", background: "var(--bg)", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>
            <span>Inquilino</span><span>Imóvel</span><span>Vencimento</span><span>Status</span><span style={{ textAlign: "right" }}>Valor Original</span><span style={{ textAlign: "right" }}>Valor c/ Multa</span>
          </div>
          {filtradas.map((f, i) => (
            <div
              key={f.id} className="trow"
              style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr 100px 90px 110px 110px", padding: "13px 20px", borderBottom: i < filtradas.length - 1 ? "1px solid var(--border-sub)" : "none", alignItems: "center", cursor: "pointer" }}
              onClick={() => setSelecionada(f.id)}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{f.contrato.inquilino?.nome}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{f.contrato.inquilino?.cpf}</div>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-sub)" }}>{f.contrato.imovel?.endereco}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 12.5 }}>{fmtDate(f.dataVencimento)}</div>
              <div><StatusBadge status={f.status} /></div>
              <div style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 13, fontWeight: 500 }}>{brl(f.valorOriginal)}</div>
              <div style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: f.status === "ATRASADO" ? "var(--red)" : "var(--text)" }}>{brl(f.valorTotal)}</div>
            </div>
          ))}
          {!filtradas.length && <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>Nenhuma fatura encontrada.</div>}
        </div>
      )}

      {selecionada && (
        <InvoiceDetailModal
          faturaId={selecionada}
          onClose={() => setSelecionada(null)}
          onAtualizado={() => {
            setSelecionada(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function InvoiceDetailModal({ faturaId, onClose, onAtualizado }: { faturaId: string; onClose: () => void; onAtualizado: () => void }) {
  const [detalhe, setDetalhe] = useState<DetalheFatura | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const [metodo, setMetodo] = useState<Metodo>("PIX");
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    api
      .get<DetalheFatura>(`/faturas/${faturaId}`)
      .then(setDetalhe)
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Falha ao carregar fatura"))
      .finally(() => setCarregando(false));
  }, [faturaId]);

  async function registrarPagamento() {
    if (!detalhe) return;
    setRegistrando(true);
    setErro("");
    try {
      const valor = detalhe.status === "ATRASADO" ? detalhe.calculoAtual.valorTotal : detalhe.valorTotal;
      await api.post(`/faturas/${faturaId}/pagamentos`, { valorPago: valor, metodo });
      onAtualizado();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao registrar pagamento");
    } finally {
      setRegistrando(false);
    }
  }

  async function reenviarCobranca() {
    try {
      await api.post(`/faturas/${faturaId}/reenviar-cobranca`);
      setEnviado(true);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao enviar cobrança");
    }
  }

  return (
    <Modal onClose={onClose} title="Detalhe da Fatura" width={460}>
      {carregando && <Spinner />}
      {erro && <ErroBox mensagem={erro} />}
      {detalhe && (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <div style={{ background: "var(--bg)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{detalhe.contrato.inquilino?.nome}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-sub)" }}>{detalhe.contrato.imovel?.endereco}</div>
            <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
              <StatusBadge status={detalhe.status} />
              {detalhe.calculoAtual.diasAtraso > 0 && (
                <span style={{ fontSize: 12, color: "var(--red)", fontWeight: 600 }}>{detalhe.calculoAtual.diasAtraso} dias em atraso</span>
              )}
            </div>
          </div>

          <div style={{ background: "#fff", border: "1.5px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            {[
              ["Valor base", brl(detalhe.valorOriginal), false],
              ["Multa", brl(detalhe.calculoAtual.valorMulta), detalhe.calculoAtual.diasAtraso > 0],
              ["Juros", brl(detalhe.calculoAtual.valorJuros), detalhe.calculoAtual.diasAtraso > 0],
            ].map(([label, value, highlight]) => (
              <div key={label as string} style={{ display: "flex", justifyContent: "space-between", padding: "11px 16px", borderBottom: "1px solid var(--border-sub)", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: highlight ? "var(--red)" : "var(--text-sub)" }}>{label as string}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: highlight ? "var(--red)" : "var(--text)" }}>{value as string}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px", background: detalhe.status === "ATRASADO" ? "var(--red-dim)" : "var(--success-dim)", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: detalhe.status === "ATRASADO" ? "var(--red)" : "var(--success)" }}>Total a pagar</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 800, color: detalhe.status === "ATRASADO" ? "var(--red)" : "var(--success)" }}>
                {brl(detalhe.status === "ATRASADO" ? detalhe.calculoAtual.valorTotal : detalhe.valorTotal)}
              </span>
            </div>
          </div>

          {detalhe.status !== "PAGO" && (
            <div style={{ marginTop: 14 }}>
              <Field label="Método de pagamento">
                <Select value={metodo} onChange={(e) => setMetodo(e.target.value as Metodo)}>
                  {METODOS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </Select>
              </Field>
            </div>
          )}

          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            {detalhe.status !== "PAGO" && (
              <Btn style={{ flex: 1, justifyContent: "center" }} icon={<CircleCheck size={14} />} disabled={registrando} onClick={registrarPagamento}>
                {registrando ? "Registrando…" : "Registrar Pagamento"}
              </Btn>
            )}
            {detalhe.status === "ATRASADO" && (
              <Btn variant="outline" icon={<Send size={14} />} disabled={enviado} onClick={reenviarCobranca}>
                {enviado ? "Enviada" : "Enviar Cobrança"}
              </Btn>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
