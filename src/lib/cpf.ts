/** Remove tudo que não for dígito. */
function apenasDigitos(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

function calculaDigitoVerificador(digitos: string, pesoInicial: number): number {
  let soma = 0;
  for (let i = 0; i < digitos.length; i++) {
    soma += Number(digitos[i]) * (pesoInicial - i);
  }
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

/** Valida CPF por dígito verificador (não consulta a Receita, só a matemática do documento). */
export function cpfValido(cpfBruto: string): boolean {
  const cpf = apenasDigitos(cpfBruto);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // todos os dígitos iguais (000..., 111..., etc.)

  const digito1 = calculaDigitoVerificador(cpf.slice(0, 9), 10);
  if (digito1 !== Number(cpf[9])) return false;

  const digito2 = calculaDigitoVerificador(cpf.slice(0, 10), 11);
  return digito2 === Number(cpf[10]);
}

/** Normaliza para 11 dígitos, sem máscara, para armazenar sempre no mesmo formato. */
export function normalizaCpf(cpf: string): string {
  return apenasDigitos(cpf);
}
