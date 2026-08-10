import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { ChevronDown, X } from "lucide-react";

export function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function fmtDate(d: string): string {
  const data = d.slice(0, 10);
  const [y, m, day] = data.split("-");
  return `${day}/${m}/${y}`;
}

const BADGE_MAP: Record<string, [string, string]> = {
  PAGO: ["badge-paid", "Pago"],
  PENDENTE: ["badge-pending", "Pendente"],
  ATRASADO: ["badge-late", "Atrasado"],
  CANCELADO: ["badge-cancel", "Cancelado"],
  DISPONIVEL: ["badge-avail", "Disponível"],
  ALUGADO: ["badge-rented", "Alugado"],
  MANUTENCAO: ["badge-maint", "Manutenção"],
  ATIVO: ["badge-rented", "Ativo"],
  ENCERRADO: ["badge-cancel", "Encerrado"],
};

export function StatusBadge({ status }: { status: string }) {
  const [cls, label] = BADGE_MAP[status] ?? ["badge-pending", status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--text)" }}>{title}</h1>
        {sub && <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--text-muted)" }}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "danger" | "ghost" | "outline";
  size?: "sm" | "md";
  icon?: ReactNode;
}
export function Btn({ variant = "primary", size = "md", icon, children, style, disabled, ...rest }: BtnProps) {
  const base: CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, border: "none",
    borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600, fontFamily: "var(--font)",
    transition: "opacity 0.15s, background 0.15s",
    padding: size === "sm" ? "6px 12px" : "9px 18px",
    fontSize: size === "sm" ? 12 : 13,
    opacity: disabled ? 0.6 : 1,
  };
  const vars: Record<string, CSSProperties> = {
    primary: { background: "var(--navy)", color: "#fff" },
    danger: { background: "var(--red)", color: "#fff" },
    ghost: { background: "transparent", color: "var(--text-sub)" },
    outline: { background: "#fff", color: "var(--navy)", border: "1.5px solid var(--border)" },
  };
  return (
    <button style={{ ...base, ...vars[variant], ...style }} disabled={disabled} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export function Modal({ onClose, title, children, width = 500 }: { onClose: () => void; title: string; children: ReactNode; width?: number }) {
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: width, maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 0" }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--text)" }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: "16px 24px 24px" }}>{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-sub)", marginBottom: 5, letterSpacing: "0.03em" }}>{label}</label>
      {children}
    </div>
  );
}

const inputCss: CSSProperties = {
  width: "100%", border: "1.5px solid var(--border)", borderRadius: 8,
  padding: "9px 12px", fontSize: 13.5, color: "var(--text)", outline: "none",
  background: "#fff", transition: "border-color 0.15s",
};

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      style={inputCss}
      onFocus={(e) => (e.target.style.borderColor = "var(--navy)")}
      onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
      {...props}
    />
  );
}

export function Select({ children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div style={{ position: "relative" }}>
      <select
        style={{ ...inputCss, appearance: "none", cursor: "pointer", paddingRight: 32 }}
        onFocus={(e) => (e.target.style.borderColor = "var(--navy)")}
        onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
    </div>
  );
}

export function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
      <div className="spinner" />
    </div>
  );
}

export function ErroBox({ mensagem }: { mensagem: string }) {
  return (
    <div style={{ background: "var(--red-dim)", color: "var(--red)", borderRadius: 9, padding: "12px 16px", fontSize: 13, marginBottom: 16 }}>
      {mensagem}
    </div>
  );
}
