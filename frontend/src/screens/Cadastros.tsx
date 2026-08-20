import { useEffect, useState } from "react";
import { Pencil, Plus, Shield, Trash2, Users } from "lucide-react";
import { api, ApiError, ehAdmin } from "../lib/api";
import type { Fiador, Inquilino } from "../lib/types";
import { Btn, ErroBox, Field, Input, Modal, PageHeader, Spinner } from "../components/ui";

type CadTab = "inquilinos" | "fiadores";

function cpfSoDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

function cpfPareceValido(valor: string): boolean {
  const digitos = cpfSoDigitos(valor);
  return digitos.length === 11 && !/^(\d)\1{10}$/.test(digitos);
}

export function Cadastros() {
  const [tab, setTab] = useState<CadTab>("inquilinos");
  const [inquilinos, setInquilinos] = useState<Inquilino[]>([]);
  const [fiadores, setFiadores] = useState<Fiador[]>([]);
  const [mostrarNovo, setMostrarNovo] = useState(false);
  const [editandoInquilino, setEditandoInquilino] = useState<Inquilino | null>(null);
  const [editandoFiador, setEditandoFiador] = useState<Fiador | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const admin = ehAdmin();

  async function carregar() {
    setCarregando(true);
    setErro("");
    try {
      const [t, g] = await Promise.all([api.get<Inquilino[]>("/inquilinos"), api.get<Fiador[]>("/fiadores")]);
      setInquilinos(t);
      setFiadores(g);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar cadastros");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function excluirInquilino(id: string) {
    setErro("");
    try {
      await api.delete(`/inquilinos/${id}`);
      setExcluindoId(null);
      carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao excluir inquilino");
      setExcluindoId(null);
    }
  }

  async function excluirFiador(id: string) {
    setErro("");
    try {
      await api.delete(`/fiadores/${id}`);
      setExcluindoId(null);
      carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao excluir fiador");
      setExcluindoId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Cadastros"
        sub="Inquilinos e fiadores"
        action={<Btn icon={<Plus size={14} />} onClick={() => setMostrarNovo(true)}>Novo Cadastro</Btn>}
      />

      {erro && <ErroBox mensagem={erro} />}

      <div style={{ display: "flex", gap: 4, background: "#fff", border: "1.5px solid var(--border)", borderRadius: 10, padding: 3, width: "fit-content", marginBottom: 20 }}>
        {(
          [
            ["inquilinos", "Inquilinos", Users],
            ["fiadores", "Fiadores", Shield],
          ] as const
        ).map(([id, l, Icon]) => (
          <button
            key={id} onClick={() => setTab(id)}
            style={{ padding: "7px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, background: tab === id ? "var(--navy)" : "transparent", color: tab === id ? "#fff" : "var(--text-sub)", display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font)" }}
          >
            <Icon size={14} />{l}
          </button>
        ))}
      </div>

      {carregando ? (
        <Spinner />
      ) : tab === "inquilinos" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {inquilinos.map((t) => (
            <div key={t.id} style={{ background: "#fff", border: "1.5px solid var(--border)", borderRadius: 13, padding: "16px 20px", display: "grid", gridTemplateColumns: "40px 1fr 1fr auto", gap: 16, alignItems: "center" }}>
              <div style={{ width: 40, height: 40, borderRadius: 50, background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#fff" }}>
                {t.nome.split(" ").map((n) => n[0]).slice(0, 2).join("")}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{t.nome}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t.cpf}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Contato</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{t.telefone ?? "—"}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t.email ?? "—"}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Scoring: <strong style={{ color: "var(--text)" }}>{t.scoring}</strong></span>
                <Btn variant="outline" size="sm" icon={<Pencil size={12} />} onClick={() => setEditandoInquilino(t)}>Editar</Btn>
                {admin && (
                  <Btn variant="danger" size="sm" icon={<Trash2 size={12} />} onClick={() => setExcluindoId(t.id)}>Excluir</Btn>
                )}
              </div>
            </div>
          ))}
          {!inquilinos.length && <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>Nenhum inquilino cadastrado.</div>}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {fiadores.map((g) => (
            <div key={g.id} style={{ background: "#fff", border: "1.5px solid var(--border)", borderRadius: 13, padding: "16px 20px", display: "grid", gridTemplateColumns: "40px 1fr 1fr auto", gap: 16, alignItems: "center" }}>
              <div style={{ width: 40, height: 40, borderRadius: 50, background: "var(--navy-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#fff" }}>
                {g.nome.split(" ").map((n) => n[0]).slice(0, 2).join("")}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{g.nome}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{g.cpf}</div>
              </div>
              <span style={{ background: g.ativo ? "var(--success-dim)" : "var(--red-dim)", color: g.ativo ? "var(--success)" : "var(--red)", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, width: "fit-content" }}>
                {g.ativo ? "Ativo" : "Inativo"}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Btn variant="outline" size="sm" icon={<Pencil size={12} />} onClick={() => setEditandoFiador(g)}>Editar</Btn>
                {admin && (
                  <Btn variant="danger" size="sm" icon={<Trash2 size={12} />} onClick={() => setExcluindoId(g.id)}>Excluir</Btn>
                )}
              </div>
            </div>
          ))}
          {!fiadores.length && <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>Nenhum fiador cadastrado.</div>}
        </div>
      )}

      {mostrarNovo && (
        <NovoCadastroModal
          tabInicial={tab}
          onClose={() => setMostrarNovo(false)}
          onCriado={() => {
            setMostrarNovo(false);
            carregar();
          }}
        />
      )}

      {editandoInquilino && (
        <EditInquilinoModal
          inquilino={editandoInquilino}
          onClose={() => setEditandoInquilino(null)}
          onSalvo={() => {
            setEditandoInquilino(null);
            carregar();
          }}
        />
      )}

      {editandoFiador && (
        <EditFiadorModal
          fiador={editandoFiador}
          onClose={() => setEditandoFiador(null)}
          onSalvo={() => {
            setEditandoFiador(null);
            carregar();
          }}
        />
      )}

      {excluindoId && (
        <Modal onClose={() => setExcluindoId(null)} title="Confirmar exclusão">
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-sub)" }}>
            Tem certeza que deseja excluir este cadastro? Não é possível excluir se houver um contrato ativo vinculado.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn variant="ghost" onClick={() => setExcluindoId(null)}>Cancelar</Btn>
            <Btn
              variant="danger"
              onClick={() => (tab === "inquilinos" ? excluirInquilino(excluindoId) : excluirFiador(excluindoId))}
            >
              Confirmar exclusão
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NovoCadastroModal({ tabInicial, onClose, onCriado }: { tabInicial: CadTab; onClose: () => void; onCriado: () => void }) {
  const [tipo, setTipo] = useState<CadTab>(tabInicial);
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  function validar(): string | null {
    if (!nome.trim()) return "Informe o nome completo.";
    if (!cpfPareceValido(cpf)) return "CPF deve ter 11 dígitos válidos.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Email inválido.";
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
      const cpfLimpo = cpfSoDigitos(cpf);
      if (tipo === "inquilinos") {
        await api.post("/inquilinos", {
          nome: nome.trim(),
          cpf: cpfLimpo,
          email: email.trim() || undefined,
          telefone: telefone.trim() || undefined,
        });
      } else {
        await api.post("/fiadores", { nome: nome.trim(), cpf: cpfLimpo });
      }
      onCriado();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao salvar cadastro");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Novo Cadastro">
      {erro && <ErroBox mensagem={erro} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Tipo">
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant={tipo === "inquilinos" ? "primary" : "outline"} size="sm" onClick={() => setTipo("inquilinos")}>Inquilino</Btn>
            <Btn variant={tipo === "fiadores" ? "primary" : "outline"} size="sm" onClick={() => setTipo("fiadores")}>Fiador</Btn>
          </div>
        </Field>
        <Field label="Nome completo">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} />
        </Field>
        <Field label="CPF">
          <Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="Somente números" maxLength={14} />
        </Field>
        {tipo === "inquilinos" && (
          <>
            <Field label="Email (opcional)">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Telefone (opcional)">
              <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            </Field>
          </>
        )}
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Btn>
      </div>
    </Modal>
  );
}

function EditInquilinoModal({ inquilino, onClose, onSalvo }: { inquilino: Inquilino; onClose: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(inquilino.nome);
  const [email, setEmail] = useState(inquilino.email ?? "");
  const [telefone, setTelefone] = useState(inquilino.telefone ?? "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!nome.trim()) {
      setErro("Informe o nome completo.");
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErro("Email inválido.");
      return;
    }
    setErro("");
    setSalvando(true);
    try {
      await api.put(`/inquilinos/${inquilino.id}`, {
        nome: nome.trim(),
        email: email.trim() || undefined,
        telefone: telefone.trim() || undefined,
      });
      onSalvo();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao salvar alterações");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Editar Inquilino">
      {erro && <ErroBox mensagem={erro} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Nome completo">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} />
        </Field>
        <Field label="CPF (não editável)">
          <Input value={inquilino.cpf} disabled />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Telefone">
          <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
        </Field>
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Btn>
      </div>
    </Modal>
  );
}

function EditFiadorModal({ fiador, onClose, onSalvo }: { fiador: Fiador; onClose: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(fiador.nome);
  const [ativo, setAtivo] = useState(fiador.ativo);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!nome.trim()) {
      setErro("Informe o nome completo.");
      return;
    }
    setErro("");
    setSalvando(true);
    try {
      await api.put(`/fiadores/${fiador.id}`, { nome: nome.trim(), ativo });
      onSalvo();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao salvar alterações");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Editar Fiador">
      {erro && <ErroBox mensagem={erro} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Nome completo">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} />
        </Field>
        <Field label="CPF (não editável)">
          <Input value={fiador.cpf} disabled />
        </Field>
        <Field label="Status">
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant={ativo ? "primary" : "outline"} size="sm" onClick={() => setAtivo(true)}>Ativo</Btn>
            <Btn variant={!ativo ? "primary" : "outline"} size="sm" onClick={() => setAtivo(false)}>Inativo</Btn>
          </div>
        </Field>
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Btn>
      </div>
    </Modal>
  );
}
