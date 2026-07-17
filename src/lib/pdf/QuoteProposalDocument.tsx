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
import { computeIcmsValue } from "@/lib/quoteCalculations";

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
  free_time_hours: number | null;
  status: string;
  created_at: string;
  version: number;
  client: { name: string; document: string | null } | null;
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
});

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR");
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
            <Text style={styles.proposalTitle}>
              Cotação #{quote.id.slice(0, 8).toUpperCase()}
            </Text>
            <Text style={styles.brandSub}>
              Emitida em {formatDate(quote.created_at)}
            </Text>
            <Text style={styles.brandSub}>Versão {quote.version}</Text>
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
          <Text style={styles.sectionTitle}>Condições comerciais</Text>
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Validade da proposta</Text>
              <Text style={styles.value}>7 dias corridos a partir da emissão</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Free time</Text>
              <Text style={styles.value}>
                {quote.free_time_hours !== null
                  ? `${quote.free_time_hours}h`
                  : "A combinar"}
              </Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Prazo de pagamento</Text>
              <Text style={styles.value}>A combinar</Text>
            </View>
          </View>
        </View>

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
