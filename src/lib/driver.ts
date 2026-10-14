// App do motorista: o login é o CPF. Por baixo, o Supabase Auth exige um
// e-mail, então o CPF (só números) vira "<cpf>@motorista.transbochnia.com.br".
export const DRIVER_EMAIL_DOMAIN = "motorista.transbochnia.com.br";

/** Texto digitado no login → e-mail do Supabase (CPF vira e-mail interno). */
export function loginToEmail(value: string): string {
  const v = value.trim();
  if (v.includes("@")) return v;
  const digits = v.replace(/\D/g, "");
  return digits.length === 11 ? `${digits}@${DRIVER_EMAIL_DOMAIN}` : v;
}
