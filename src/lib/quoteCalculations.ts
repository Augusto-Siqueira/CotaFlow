// Regras de cálculo — seção 5 da especificação técnica.
// PIS/COFINS (0,9075) é o fator padrão do MVP; deve virar parâmetro em
// `tax_rules` quando esse módulo existir (ver observação da seção 5.3).
const NET_FREIGHT_FACTOR = 0.9075;

export function computeInsuranceValue(
  nfValue: number | null,
  insurancePct: number | null
): number | null {
  if (nfValue === null || insurancePct === null) return null;
  return nfValue * (insurancePct / 100);
}

export function computeNetFreight(grossFreight: number | null): number | null {
  if (grossFreight === null) return null;
  return grossFreight * NET_FREIGHT_FACTOR;
}

export function computeFullFreight(
  grossFreight: number | null,
  tollCost: number | null,
  insuranceValue: number | null,
  icmsPct: number | null,
  paranaRule: boolean
): number | null {
  if (grossFreight === null || icmsPct === null) return null;

  const toll = tollCost ?? 0;
  const insurance = insuranceValue ?? 0;
  const icmsFactor = 1 - icmsPct / 100;
  if (icmsFactor <= 0) return null;

  if (paranaRule) {
    return (grossFreight + insurance) / icmsFactor + toll;
  }
  return (grossFreight + toll + insurance) / icmsFactor;
}

// Valor do ICMS embutido no Full ("por dentro"). Full = Gross + Pedágio +
// Seguro + ICMS em ambas as regras (geral e Paraná), então o valor do
// imposto é sempre o resíduo — não depende de saber qual regra foi aplicada.
export function computeIcmsValue(
  fullFreight: number | null,
  grossFreight: number | null,
  tollCost: number | null,
  insuranceValue: number | null
): number | null {
  if (fullFreight === null || grossFreight === null) return null;
  return fullFreight - grossFreight - (tollCost ?? 0) - (insuranceValue ?? 0);
}

// Piso mínimo ANTT — seção 5.5. CCD/CC vêm da tabela `antt_coefficients`,
// parametrizável pois a Resolução ANTT é reajustada periodicamente.
export function computeAnttFloor(
  ccd: number | null,
  cc: number | null,
  distanceKm: number | null
): number | null {
  if (ccd === null || cc === null || distanceKm === null) return null;
  return ccd * distanceKm + cc;
}
