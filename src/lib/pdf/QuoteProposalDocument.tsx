import fs from "node:fs";
import path from "node:path";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import {
  computeIcmsValue,
  COFINS_PCT,
  ISS_PCT,
  PIS_PCT,
} from "@/lib/quoteCalculations";

const LOGO_SRC = `data:image/png;base64,${fs
  .readFileSync(path.join(process.cwd(), "public", "logo.png"))
  .toString("base64")}`;

export interface QuoteProposalData {
  id: string;
  origin: string | null;
  destination: string | null;
  distance_km: number | null;
  product: string | null;
  nf_value: number | null;
  gross_freight: number | null;
  toll_cost: number | null;
  insurance_pct: number | null;
  insurance_value: number | null;
  icms_pct: number | null;
  net_freight: number | null;
  full_freight: number | null;
  transit_time_hours: number | null;
  delivery_deadline: string | null;
  validity_date: string | null;
  free_time_hours: number | null;
  // Copiado do cadastro do veículo no momento do save (ver migration 0012 e
  // o comentário em quotes/new e quotes/batches/new) — R$/hora de atraso
  // além do free time.
  over_time_cost: number | null;
  // Número que o próprio cliente usa pra organizar as cotações dele (ex:
  // Kemin numera pelo sistema interno dela) — só tem efeito no cabeçalho do
  // layout Kemin, ver comentário no return() abaixo.
  client_quote_number: string | null;
  status: string;
  created_at: string;
  version: number;
  client: {
    name: string;
    document: string | null;
    // Ausente = tratado como "padrao" (ver renderCostSection abaixo) — assim
    // uma cotação antiga cujo select não peça esse campo, ou um client sem
    // essa coluna carregada, ainda renderiza no layout de sempre.
    pdf_layout?: string;
  } | null;
  vehicle: { type: string; axles: number | null } | null;
}

export interface QuoteProposalDelivery {
  destination: string;
  weight_kg: number;
  freight_share_pct: number | null;
  freight_value: number | null;
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    color: "#20242c",
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "2px solid #192134",
    paddingBottom: 16,
    marginBottom: 20,
  },
  logo: {
    width: 92,
    height: 53,
  },
  brandSub: {
    fontSize: 9,
    color: "#6b7794",
    marginTop: 4,
  },
  proposalMeta: {
    textAlign: "right",
  },
  proposalTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: "#192134",
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: "#192134",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    marginBottom: 4,
  },
  col: {
    flex: 1,
  },
  label: {
    color: "#6b7794",
    fontSize: 9,
  },
  value: {
    color: "#192134",
    fontSize: 10,
    fontWeight: 700,
  },
  table: {
    borderTop: "1px solid #e4e7ec",
  },
  tableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottom: "1px solid #e4e7ec",
  },
  tableLabel: {
    color: "#424a5c",
  },
  tableValue: {
    fontWeight: 700,
    color: "#192134",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    marginTop: 4,
    backgroundColor: "#f0f9f1",
    paddingHorizontal: 10,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#27622b",
  },
  totalValue: {
    fontSize: 12,
    fontWeight: 700,
    color: "#27622b",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTop: "1px solid #e4e7ec",
    paddingTop: 8,
    fontSize: 8,
    color: "#959db2",
  },
  // Layout Kemin — tabela com grade fechada (todas as células com borda),
  // no formato que esse cliente exige em vez da lista de linhas do padrão
  // CotaFlow acima.
  keminTable: {
    border: "1px solid #20242c",
  },
  keminHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#192134",
  },
  keminHeaderCell: {
    padding: 6,
    fontSize: 9,
    fontWeight: 700,
    color: "#ffffff",
    borderRight: "1px solid #20242c",
  },
  keminRow: {
    flexDirection: "row",
    borderTop: "1px solid #20242c",
  },
  keminCell: {
    padding: 6,
    fontSize: 9,
    color: "#20242c",
    borderRight: "1px solid #20242c",
  },
  keminCellLast: {
    padding: 6,
    fontSize: 9,
    color: "#20242c",
  },
  keminSectionRow: {
    flexDirection: "row",
    borderTop: "1px solid #20242c",
    backgroundColor: "#eef0f4",
  },
  keminSectionCell: {
    padding: 6,
    fontSize: 9,
    fontWeight: 700,
    color: "#20242c",
  },
  keminTotalRow: {
    flexDirection: "row",
    borderTop: "1px solid #20242c",
    backgroundColor: "#f0f9f1",
  },
  keminTotalCell: {
    padding: 7,
    fontSize: 10,
    fontWeight: 700,
    color: "#192134",
    borderRight: "1px solid #20242c",
  },
  keminTotalCellLast: {
    padding: 7,
    fontSize: 10,
    fontWeight: 700,
    color: "#192134",
  },
});

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR");
}

// Mesmo cuidado do formatDateOnly em src/lib/format.ts: validity_date é uma
// coluna `date` do Postgres (sem hora/timezone) — passar por `new Date()`
// interpretaria "2026-10-30" como meia-noite UTC e devolveria 29/10 no fuso
// do Brasil. Não importamos de src/lib/format.ts porque este arquivo roda
// no worker de renderização do react-pdf, fora do ciclo normal de página —
// mais simples duplicar essa função pura de 3 linhas do que arriscar um
// import que dependa de contexto de módulo que só existe no lado cliente.
function formatDateOnly(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

// Mesma convenção de exibição já usada no cadastro de veículo
// (src/app/vehicles/page.tsx) pro over_time_rate: valor + "/h". Nulo é o
// caso normal pra qualquer cotação salva antes deste campo existir, ou cujo
// veículo não tenha taxa cadastrada — "A combinar" em vez de "R$ —/h".
function formatOverTime(value: number | null): string {
  return value !== null ? `${formatCurrency(value)}/h` : "A combinar";
}

// Linha da tabela do layout Kemin: Descrição | % | Valor (R$). `bold` marca
// a linha de total (Valor Bruto do Frete). `sectionHeader` é usado só pra
// "Impostos incidentes na Operação:", que ocupa a linha inteira em negrito
// sem coluna de valor — react-pdf não tem colSpan de HTML de verdade, então
// isso é só um flex ocupando a largura toda das outras duas colunas juntas.
function KeminRow({
  label,
  pct,
  value,
  bold = false,
}: {
  label: string;
  pct?: string;
  value: string;
  bold?: boolean;
}) {
  const rowStyle = bold ? styles.keminTotalRow : styles.keminRow;
  const cellStyle = bold ? styles.keminTotalCell : styles.keminCell;
  const lastCellStyle = bold ? styles.keminTotalCellLast : styles.keminCellLast;
  return (
    <View style={rowStyle}>
      <Text style={[cellStyle, { flex: 2 }]}>{label}</Text>
      <Text style={[cellStyle, { flex: 1, textAlign: "center" }]}>
        {pct ?? "-"}
      </Text>
      <Text style={[lastCellStyle, { flex: 1, textAlign: "right" }]}>
        {value}
      </Text>
    </View>
  );
}

function KeminSectionHeader({ label }: { label: string }) {
  return (
    <View style={styles.keminSectionRow}>
      <Text style={styles.keminSectionCell}>{label}</Text>
    </View>
  );
}

function KeminCostSection({ quote }: { quote: QuoteProposalData }) {
  const gross = quote.gross_freight;
  const icmsValue = computeIcmsValue(
    quote.full_freight,
    quote.gross_freight,
    quote.toll_cost,
    quote.insurance_value
  );
  // PIS/COFINS são calculados sobre o Frete Gross (a mesma base usada pelo
  // fator único de computeNetFreight — ver o comentário em
  // src/lib/quoteCalculations.ts) — a Kemin quer as duas alíquotas
  // discriminadas em vez do fator combinado.
  const pisValue = gross !== null ? gross * (PIS_PCT / 100) : null;
  const cofinsValue = gross !== null ? gross * (COFINS_PCT / 100) : null;
  const issValue = gross !== null ? gross * (ISS_PCT / 100) : null;
  const totalTaxes =
    icmsValue !== null && pisValue !== null && cofinsValue !== null && issValue !== null
      ? icmsValue + pisValue + cofinsValue + issValue
      : null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Detalhamento de custos</Text>
      <View style={styles.keminTable}>
        <View style={styles.keminHeaderRow}>
          <Text style={[styles.keminHeaderCell, { flex: 2 }]}>Descrição</Text>
          <Text style={[styles.keminHeaderCell, { flex: 1, textAlign: "center" }]}>
            (%)
          </Text>
          <Text
            style={[
              styles.keminHeaderCell,
              { flex: 1, textAlign: "right", borderRight: "none" },
            ]}
          >
            Valor (R$)
          </Text>
        </View>
        <KeminRow
          label="Valor Líquido do Frete (sem impostos)"
          value={formatCurrency(gross)}
        />
        <KeminRow label="Pedágios" value={formatCurrency(quote.toll_cost)} />
        <KeminRow
          label="Seguro"
          pct={quote.insurance_pct !== null ? `${quote.insurance_pct}%` : undefined}
          value={formatCurrency(quote.insurance_value)}
        />
        <KeminSectionHeader label="Impostos incidentes na Operação:" />
        <KeminRow
          label="ICMS"
          pct={quote.icms_pct !== null ? `${quote.icms_pct}%` : undefined}
          value={formatCurrency(icmsValue)}
        />
        <KeminRow label="PIS" pct={`${PIS_PCT}%`} value={formatCurrency(pisValue)} />
        <KeminRow
          label="COFINS"
          pct={`${COFINS_PCT}%`}
          value={formatCurrency(cofinsValue)}
        />
        <KeminRow
          label="ISS (quando aplicável)"
          pct={`${ISS_PCT}%`}
          value={formatCurrency(issValue)}
        />
        <KeminRow label="Valor total de impostos" value={formatCurrency(totalTaxes)} />
        <KeminRow
          label="Valor Bruto do Frete (Total)"
          value={formatCurrency(quote.full_freight)}
          bold
        />
        <KeminRow
          label="Prazo de entrega em dias úteis"
          value={quote.delivery_deadline ?? "—"}
        />
        <KeminRow
          label="Validade da cotação"
          value={formatDateOnly(quote.validity_date)}
        />
      </View>
      <View style={[styles.row, { marginTop: 12 }]}>
        <View style={styles.col}>
          <Text style={styles.label}>Free time</Text>
          {/* Fixo por política da empresa — mesmo valor hardcoded no layout
              padrão, não vem de quote.free_time_hours. */}
          <Text style={styles.value}>5h</Text>
        </View>
        <View style={styles.col}>
          <Text style={styles.label}>Over time</Text>
          <Text style={styles.value}>{formatOverTime(quote.over_time_cost)}</Text>
        </View>
      </View>
    </View>
  );
}

export function QuoteProposalDocument({
  quote,
  deliveries,
}: {
  quote: QuoteProposalData;
  deliveries?: QuoteProposalDelivery[];
}) {
  const icmsValue = computeIcmsValue(
    quote.full_freight,
    quote.gross_freight,
    quote.toll_cost,
    quote.insurance_value
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
            <Image src={LOGO_SRC} style={styles.logo} />
            <Text style={styles.brandSub}>Proposta comercial de frete</Text>
          </View>
          <View style={styles.proposalMeta}>
            {/* Padrão: sem número nenhum no cabeçalho (nosso ID interno não
                interessa ao cliente). Kemin: mostra o número QUE ELA MESMA
                usa pra organizar as cotações dela (client_quote_number,
                preenchido manualmente no wizard) — nunca o nosso ID; se
                ainda não foi informado, a linha simplesmente não aparece,
                em vez de mostrar um "—" estranho num título. */}
            {quote.client?.pdf_layout === "kemin" && quote.client_quote_number && (
              <Text style={styles.proposalTitle}>
                Cotação {quote.client_quote_number}
              </Text>
            )}
            <Text style={styles.brandSub}>
              Emitida em {formatDate(quote.created_at)}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cliente</Text>
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Nome</Text>
              <Text style={styles.value}>{quote.client?.name ?? "—"}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>CNPJ / CPF</Text>
              <Text style={styles.value}>{quote.client?.document ?? "—"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resumo da rota</Text>
          {(quote.origin || quote.destination) && (
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Coleta</Text>
                <Text style={styles.value}>{quote.origin ?? "—"}</Text>
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Entrega</Text>
                <Text style={styles.value}>{quote.destination ?? "—"}</Text>
              </View>
            </View>
          )}
          <View style={[styles.row, { marginTop: 8 }]}>
            <View style={styles.col}>
              <Text style={styles.label}>Distância</Text>
              <Text style={styles.value}>
                {quote.distance_km !== null ? `${quote.distance_km} km` : "—"}
              </Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Transit time</Text>
              <Text style={styles.value}>
                {quote.transit_time_hours !== null
                  ? `${quote.transit_time_hours}h`
                  : "—"}
              </Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Veículo</Text>
              <Text style={styles.value}>{quote.vehicle?.type ?? "—"}</Text>
            </View>
          </View>
          <View style={[styles.row, { marginTop: 8 }]}>
            <View style={styles.col}>
              <Text style={styles.label}>Produto</Text>
              <Text style={styles.value}>{quote.product ?? "—"}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Valor da NF</Text>
              <Text style={styles.value}>{formatCurrency(quote.nf_value)}</Text>
            </View>
          </View>
        </View>

        {quote.client?.pdf_layout === "kemin" ? (
          <KeminCostSection quote={quote} />
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Detalhamento de custos</Text>
              <View style={styles.table}>
                <View style={styles.tableRow}>
                  <Text style={styles.tableLabel}>Frete Gross</Text>
                  <Text style={styles.tableValue}>
                    {formatCurrency(quote.gross_freight)}
                  </Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={styles.tableLabel}>Pedágio</Text>
                  <Text style={styles.tableValue}>
                    {formatCurrency(quote.toll_cost)}
                  </Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={styles.tableLabel}>
                    Seguro
                    {quote.insurance_pct !== null ? ` (${quote.insurance_pct}%)` : ""}
                  </Text>
                  <Text style={styles.tableValue}>
                    {formatCurrency(quote.insurance_value)}
                  </Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={styles.tableLabel}>
                    ICMS{quote.icms_pct !== null ? ` (${quote.icms_pct}%)` : ""}
                  </Text>
                  <Text style={styles.tableValue}>
                    {formatCurrency(icmsValue)}
                  </Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={styles.tableLabel}>Frete Net (PIS/COFINS)</Text>
                  <Text style={styles.tableValue}>
                    {formatCurrency(quote.net_freight)}
                  </Text>
                </View>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Frete Full</Text>
                <Text style={styles.totalValue}>
                  {formatCurrency(quote.full_freight)}
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.label}>Validade da Cotação</Text>
                  <Text style={styles.value}>
                    {formatDateOnly(quote.validity_date)}
                  </Text>
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>Free time</Text>
                  {/* Fixo por política da empresa, não vem de quote.free_time_hours
                      — ver o mesmo valor hardcoded na tabela do layout Kemin. */}
                  <Text style={styles.value}>5h</Text>
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>Over time</Text>
                  <Text style={styles.value}>{formatOverTime(quote.over_time_cost)}</Text>
                </View>
              </View>
              {quote.delivery_deadline && (
                <View style={[styles.row, { marginTop: 8 }]}>
                  <View style={styles.col}>
                    <Text style={styles.label}>Prazo de entrega</Text>
                    <Text style={styles.value}>{quote.delivery_deadline}</Text>
                  </View>
                </View>
              )}
            </View>
          </>
        )}

        {deliveries && deliveries.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Fracionado — entregas</Text>
            <View style={styles.table}>
              {deliveries.map((d, i) => (
                <View key={i} style={[styles.tableRow, { justifyContent: "flex-start" }]}>
                  <Text style={[styles.tableLabel, { flex: 2 }]}>
                    {d.destination}
                  </Text>
                  <Text style={[styles.tableLabel, { flex: 1 }]}>
                    {d.weight_kg.toLocaleString("pt-BR")} kg
                  </Text>
                  <Text style={[styles.tableLabel, { flex: 1 }]}>
                    {d.freight_share_pct !== null
                      ? `${d.freight_share_pct.toFixed(1)}%`
                      : "—"}
                  </Text>
                  <Text style={[styles.tableValue, { flex: 1, textAlign: "right" }]}>
                    {formatCurrency(d.freight_value)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <Text style={styles.footer}>
          Proposta gerada automaticamente pelo CotaFlow. Valores sujeitos a
          confirmação de disponibilidade de veículo e condições de praça no ato
          do embarque. Documento sem validade fiscal.
        </Text>
      </Page>
    </Document>
  );
}
