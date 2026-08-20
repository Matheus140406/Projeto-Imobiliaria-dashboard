import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, ClipboardList, Clock, RefreshCw, Send, TrendingUp } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { Contrato, Fatura, Resumo } from "../lib/types";
import type { Screen } from "../App";
import { Btn, ErroBox, PageHeader, Spinner, brl, fmtDate } from "../components/ui";

export function Dashboard({ setScreen }: { setScreen: (s: Screen) => void }) {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [atrasadas, setAtrasadas] = useState<Fatura[]>([]);
  const [vencendo, setVencendo] = useState<Contrato[]>([]);
  const [enviando, setEnviando] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    setCarregando(true);
    setErro("");
    try {
      const [resumoResp, faturasResp, contratosResp] = await Promise.all([
        api.get<Resumo>("/dashboard/resumo"),
        api.get<Fatura[]>("/faturas?status=ATRASADO"),
        api.get<Contrato[]>("/dashboard/contratos-vencendo?dias=30"),
      ]);
      setResumo(resumoResp);
      setAtrasadas(faturasResp);
      setVencendo(contratosResp);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar o dashboard");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function reenviarCobranca(faturaId: string) {
    setErro("");
    try {
      await api.post(`/faturas/${faturaId}/reenviar-cobranca`);
      // Só marca como "Enviado" depois que a chamada realmente teve sucesso — antes
      // disso o botão marcava sucesso mesmo quando a chamada falhava.
      setEnviando((s) => new Set([...s, faturaId]));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao reenviar cobrança");
    }
  }

  if (carregando) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        sub="Visão geral do escritório"
        action={
          <Btn size="sm" icon={<RefreshCw size={13} />} onClick={carregar}>
            Sincronizar
          </Btn>
        }
      />

      {erro && <ErroBox mensagem={erro} />}

      {resumo && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            {
              label: "Receitas", value: brl(resumo.receitas.total), sub: `${resumo.receitas.quantidade} pagamentos`,
              icon: TrendingUp, iconColor: "var(--success)", iconBg: "var(--success-dim)", accent: "var(--success)",
            },
            {
              label: "Inadimplência", value: `${resumo.inadimplencia.quantidade} faturas`, sub: brl(resumo.inadimplencia.total),
              icon: AlertTriangle, iconColor: "var(--red)", iconBg: "var(--red-dim)", accent: "var(--red)",
            },
            {
              label: "A Receber", value: brl(resumo.aReceber.total), sub: `${resumo.aReceber.quantidade} faturas pendentes`,
              icon: CalendarClock, iconColor: "var(--info)", iconBg: "var(--info-dim)", accent: "var(--info)",
            },
            {
              label: "Contratos Vencendo", value: `${resumo.contratosVencendo} contratos`, sub: "Próximos 30 dias",
              icon: ClipboardList, iconColor: "var(--warning)", iconBg: "var(--warning-dim)", accent: "var(--warning)",
            },
          ].map(({ label, value, sub, icon: Icon, iconColor, iconBg, accent }) => (
            <div key={label} style={{ background: "#fff", border: "1.5px solid var(--border)", borderRadius: 14, padding: "18px 20px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: accent, borderRadius: "14px 0 0 14px" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.02em" }}>{label}</span>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={15} style={{ color: iconColor }} />
                </div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.03em", lineHeight: 1 }}>{value}</div>
              <div style={{ marginTop: 5, fontSize: 12, color: "var(--text-muted)" }}>{sub}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 16 }}>
        <div style={{ background: "#fff", border: "1.5px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-sub)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--red)" }} className="pulse-red" />
              <span style={{ fontWeight: 700, fontSize: 14 }}>Fila de Ação — Atrasos</span>
              <span style={{ background: "var(--red-dim)", color: "var(--red)", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 99 }}>{atrasadas.length}</span>
            </div>
            <button onClick={() => setScreen("financeiro")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--navy)", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
              Ver todos <ChevronRight size={13} />
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 90px 110px 150px", padding: "10px 20px", background: "var(--bg)", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            <span>Inquilino</span><span>Imóvel</span><span>Competência</span><span style={{ textAlign: "right" }}>Valor c/ multa</span><span style={{ textAlign: "center" }}>Ação</span>
          </div>
          {atrasadas.map((f, i) => (
            <div key={f.id} className="trow" style={{ display: "grid", gridTemplateColumns: "1fr 160px 90px 110px 150px", padding: "12px 20px", borderBottom: i < atrasadas.length - 1 ? "1px solid var(--border-sub)" : "none", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{f.contrato.inquilino?.nome}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{fmtDate(f.dataVencimento)}</div>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-sub)" }}>{f.contrato.imovel?.endereco}</div>
              <div style={{ fontSize: 12 }}>{f.competencia}</div>
              <div style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: "var(--red)" }}>{brl(f.valorTotal)}</div>
              <div style={{ textAlign: "center" }}>
                <Btn
                  size="sm" variant={enviando.has(f.id) ? "ghost" : "danger"}
                  icon={enviando.has(f.id) ? <CheckCircle2 size={12} /> : <Send size={12} />}
                  onClick={() => reenviarCobranca(f.id)}
                  style={{ fontSize: 11 }}
                >
                  {enviando.has(f.id) ? "Enviado" : "Reenviar Cobrança"}
                </Btn>
              </div>
            </div>
          ))}
          {!atrasadas.length && <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Nenhuma fatura em atraso.</div>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: "#fff", border: "1.5px solid var(--border)", borderRadius: 14, padding: 18 }}>
            <p style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Ações Rápidas</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Btn style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => setScreen("contratos")}>Novo Contrato</Btn>
              <Btn variant="outline" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => setScreen("financeiro")}>Baixa Manual de Pagamento</Btn>
              <Btn variant="outline" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => setScreen("imoveis")}>Cadastrar Imóvel</Btn>
              <Btn variant="outline" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => setScreen("cadastros")}>Novo Inquilino</Btn>
            </div>
          </div>

          {vencendo.length > 0 && (
            <div style={{ background: "var(--warning-dim)", border: "1.5px solid rgba(245,158,11,0.3)", borderRadius: 14, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
                <Clock size={14} style={{ color: "var(--warning)" }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>Contratos Vencendo</span>
              </div>
              {vencendo.map((c) => (
                <div key={c.id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid rgba(245,158,11,0.2)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{c.inquilino?.nome}</div>
                  <div style={{ fontSize: 11, color: "#92400e" }}>Vence em {fmtDate(c.dataFim)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
