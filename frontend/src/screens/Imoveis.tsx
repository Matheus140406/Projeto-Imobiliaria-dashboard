import { useEffect, useState } from "react";
import { Building2, Home, Plus } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { Imovel } from "../lib/types";
import { Btn, ErroBox, Field, Input, Modal, PageHeader, Spinner, StatusBadge, brl } from "../components/ui";

export function Imoveis() {
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [filtro, setFiltro] = useState<Imovel["status"] | "TODOS">("TODOS");
  const [mostrarNovo, setMostrarNovo] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  async function carregar() {
    setCarregando(true);
    setErro("");
    try {
      setImoveis(await api.get<Imovel[]>("/imoveis"));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar imóveis");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const filtrados = filtro === "TODOS" ? imoveis : imoveis.filter((i) => i.status === filtro);
  const counts = {
    DISPONIVEL: imoveis.filter((i) => i.status === "DISPONIVEL").length,
    ALUGADO: imoveis.filter((i) => i.status === "ALUGADO").length,
    MANUTENCAO: imoveis.filter((i) => i.status === "MANUTENCAO").length,
  };

  return (
    <div>
      <PageHeader
        title="Imóveis"
        sub={`${imoveis.length} imóveis cadastrados`}
        action={<Btn icon={<Plus size={14} />} onClick={() => setMostrarNovo(true)}>Cadastrar Imóvel</Btn>}
      />

      {erro && <ErroBox mensagem={erro} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {(
          [
            ["DISPONIVEL", "Disponíveis", "var(--success)", "var(--success-dim)"],
            ["ALUGADO", "Alugados", "var(--info)", "var(--info-dim)"],
            ["MANUTENCAO", "Em Manutenção", "var(--warning)", "var(--warning-dim)"],
          ] as const
        ).map(([s, l, c, bg]) => (
          <div
            key={s} style={{ background: "#fff", border: "1.5px solid var(--border)", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
            onClick={() => setFiltro(filtro === s ? "TODOS" : s)}
          >
            <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Home size={18} style={{ color: c }} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{counts[s]}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{l}</div>
            </div>
          </div>
        ))}
      </div>

      {carregando ? (
        <Spinner />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {filtrados.map((imovel) => (
            <div key={imovel.id} style={{ background: "#fff", border: "1.5px solid var(--border)", borderRadius: 14, padding: "18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: "var(--navy-dim)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Building2 size={16} style={{ color: "var(--navy)" }} />
                </div>
                <StatusBadge status={imovel.status} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{imovel.endereco}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>Aluguel padrão: {brl(imovel.valorPadrao)}</div>
              {imovel.contratoAtivo && (
                <div style={{ borderTop: "1px solid var(--border-sub)", paddingTop: 10 }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Inquilino atual</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{imovel.contratoAtivo.inquilino?.nome}</div>
                </div>
              )}
            </div>
          ))}
          {!filtrados.length && <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>Nenhum imóvel encontrado.</div>}
        </div>
      )}

      {mostrarNovo && (
        <NewPropertyModal
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

function NewPropertyModal({ onClose, onCriado }: { onClose: () => void; onCriado: () => void }) {
  const [endereco, setEndereco] = useState("");
  const [valorPadrao, setValorPadrao] = useState("");
  const [valorIptu, setValorIptu] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro("");
    setSalvando(true);
    try {
      await api.post("/imoveis", {
        endereco,
        valorPadrao: Number(valorPadrao),
        valorIptuMensal: valorIptu ? Number(valorIptu) : undefined,
      });
      onCriado();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao cadastrar imóvel");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Cadastrar Imóvel">
      {erro && <ErroBox mensagem={erro} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Endereço">
          <Input value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua Exemplo, 123 – Ap. 1" />
        </Field>
        <Field label="Valor do Aluguel Padrão (R$)">
          <Input type="number" value={valorPadrao} onChange={(e) => setValorPadrao(e.target.value)} />
        </Field>
        <Field label="Valor do IPTU Mensal (R$, opcional)">
          <Input type="number" value={valorIptu} onChange={(e) => setValorIptu(e.target.value)} />
        </Field>
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={salvar} disabled={salvando || !endereco || !valorPadrao}>{salvando ? "Salvando…" : "Salvar"}</Btn>
      </div>
    </Modal>
  );
}
