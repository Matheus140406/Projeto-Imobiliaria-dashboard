import { useEffect, useState } from "react";
import { Building2, Home, Pencil, Plus, Trash2 } from "lucide-react";
import { api, ApiError, ehAdmin } from "../lib/api";
import type { Imovel } from "../lib/types";
import { Btn, ErroBox, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, brl } from "../components/ui";

export function Imoveis() {
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [filtro, setFiltro] = useState<Imovel["status"] | "TODOS">("TODOS");
  const [mostrarNovo, setMostrarNovo] = useState(false);
  const [editando, setEditando] = useState<Imovel | null>(null);
  const [excluindo, setExcluindo] = useState<Imovel | null>(null);
  const [processando, setProcessando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const admin = ehAdmin();

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

  async function excluir() {
    if (!excluindo) return;
    setErro("");
    setProcessando(true);
    try {
      await api.delete(`/imoveis/${excluindo.id}`);
      setExcluindo(null);
      carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao excluir imóvel");
    } finally {
      setProcessando(false);
    }
  }

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
                <div style={{ borderTop: "1px solid var(--border-sub)", paddingTop: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Inquilino atual</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{imovel.contratoAtivo.inquilino?.nome}</div>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, borderTop: "1px solid var(--border-sub)", paddingTop: 10 }}>
                <Btn variant="outline" size="sm" icon={<Pencil size={12} />} onClick={() => setEditando(imovel)}>Editar</Btn>
                {admin && imovel.status !== "ALUGADO" && (
                  <Btn variant="danger" size="sm" icon={<Trash2 size={12} />} onClick={() => setExcluindo(imovel)}>Excluir</Btn>
                )}
              </div>
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

      {editando && (
        <EditPropertyModal
          imovel={editando}
          onClose={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            carregar();
          }}
        />
      )}

      {excluindo && (
        <Modal onClose={() => setExcluindo(null)} title="Confirmar exclusão">
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-sub)" }}>
            Excluir "{excluindo.endereco}"? Não é possível excluir um imóvel alugado.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn variant="ghost" onClick={() => setExcluindo(null)} disabled={processando}>Cancelar</Btn>
            <Btn variant="danger" onClick={excluir} disabled={processando}>{processando ? "Excluindo…" : "Confirmar exclusão"}</Btn>
          </div>
        </Modal>
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

  function validar(): string | null {
    if (!endereco.trim()) return "Informe o endereço.";
    if (!valorPadrao || Number(valorPadrao) <= 0) return "Informe um valor de aluguel padrão maior que zero.";
    if (valorIptu && Number(valorIptu) <= 0) return "O valor de IPTU, se informado, deve ser maior que zero.";
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
      await api.post("/imoveis", {
        endereco: endereco.trim(),
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
        <Btn onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Btn>
      </div>
    </Modal>
  );
}

function EditPropertyModal({ imovel, onClose, onSalvo }: { imovel: Imovel; onClose: () => void; onSalvo: () => void }) {
  const [endereco, setEndereco] = useState(imovel.endereco);
  const [valorPadrao, setValorPadrao] = useState(String(imovel.valorPadrao));
  const [valorIptu, setValorIptu] = useState(imovel.valorIptuMensal != null ? String(imovel.valorIptuMensal) : "");
  const [status, setStatus] = useState<"DISPONIVEL" | "MANUTENCAO">(
    imovel.status === "MANUTENCAO" ? "MANUTENCAO" : "DISPONIVEL"
  );
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const statusEditavel = imovel.status !== "ALUGADO";

  async function salvar() {
    if (!endereco.trim()) {
      setErro("Informe o endereço.");
      return;
    }
    if (!valorPadrao || Number(valorPadrao) <= 0) {
      setErro("Informe um valor de aluguel padrão maior que zero.");
      return;
    }
    setErro("");
    setSalvando(true);
    try {
      await api.put(`/imoveis/${imovel.id}`, {
        endereco: endereco.trim(),
        valorPadrao: Number(valorPadrao),
        valorIptuMensal: valorIptu ? Number(valorIptu) : null,
        ...(statusEditavel ? { status } : {}),
      });
      onSalvo();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao salvar alterações");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Editar Imóvel">
      {erro && <ErroBox mensagem={erro} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Endereço">
          <Input value={endereco} onChange={(e) => setEndereco(e.target.value)} />
        </Field>
        <Field label="Valor do Aluguel Padrão (R$)">
          <Input type="number" value={valorPadrao} onChange={(e) => setValorPadrao(e.target.value)} />
        </Field>
        <Field label="Valor do IPTU Mensal (R$, opcional)">
          <Input type="number" value={valorIptu} onChange={(e) => setValorIptu(e.target.value)} />
        </Field>
        {statusEditavel ? (
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as "DISPONIVEL" | "MANUTENCAO")}>
              <option value="DISPONIVEL">Disponível</option>
              <option value="MANUTENCAO">Manutenção</option>
            </Select>
          </Field>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
            Status controlado pelo contrato ativo — encerre o contrato para poder alterá-lo.
          </p>
        )}
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Btn>
      </div>
    </Modal>
  );
}
