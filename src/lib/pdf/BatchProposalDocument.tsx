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
  FREIGHT_UNIT_LABEL,
  freightByUnit,
  type FreightUnit,
} from "@/lib/freightUnit";

const LOGO_SRC = `data:image/png;base64,${fs
  .readFileSync(path.join(process.cwd(), "public", "logo.png"))
  .toString("base64")}`;

export interface BatchProposalRoute {
  origin: string | null;
  destination: string | null;
  vehicle_type: string | null;
  min_load_ton: number | null;
  toll_cost: number | null;
  net_freight: number | null;
  gross_freight: number | null;
  full_freight: number | null;
  transit_time_hours: number | null;
  over_time_cost: number | null;
  icms_pct: number | null;
}

export interface BatchProposalData {
  id: string;
  product: string | null;
  insurance_pct: number | null;
  free_time_hours: number | null;
  created_at: string;
  client: { name: string; document: string | null } | null;
}

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 8,
    color: "#20242c",
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "2px solid #192134",
    paddingBottom: 12,
    marginBottom: 14,
  },
  logo: {
    width: 80,
    height: 46,
  },
  brandSub: {
    fontSize: 8,
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
  conditions: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 14,
    gap: 16,
  },
  conditionItem: {
    marginRight: 16,
  },
  conditionLabel: {
    color: "#6b7794",
    fontSize: 7,
  },
  conditionValue: {
    color: "#192134",
    fontSize: 9,
    fontWeight: 700,
  },
  table: {
    borderTop: "1px solid #e4e7ec",
    borderLeft: "1px solid #e4e7ec",
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#192134",
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "1px solid #e4e7ec",
  },
  th: {
    flex: 1,
    padding: 6,
    color: "#ffffff",
    fontSize: 7,
    fontWeight: 700,
    textTransform: "uppercase",
    borderRight: "1px solid #2a3346",
  },
  td: {
    flex: 1,
    padding: 6,
    color: "#20242c",
    fontSize: 8,
    borderRight: "1px solid #e4e7ec",
  },
  tdStrong: {
    flex: 1,
    padding: 6,
    color: "#192134",
    fontSize: 8,
    fontWeight: 700,
    borderRight: "1px solid #e4e7ec",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 32,
    right: 32,
    borderTop: "1px solid #e4e7ec",
    paddingTop: 8,
    fontSize: 7,
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

export function BatchProposalDocument({
  batch,
  routes,
  unit = "viagem",
}: {
  batch: BatchProposalData;
  routes: BatchProposalRoute[];
  unit?: FreightUnit;
}) {
  const perTon = unit === "tonelada";
  const unitSuffix = perTon ? ` (${FREIGHT_UNIT_LABEL.tonelada})` : "";

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
            <Image src={LOGO_SRC} style={styles.logo} />
            <Text style={styles.brandSub}>Proposta comercial de frete — lote de rotas</Text>
          </View>
          <View style={styles.proposalMeta}>
            <Text style={styles.proposalTitle}>
              Lote #{batch.id.slice(0, 8).toUpperCase()}
            </Text>
            <Text style={styles.brandSub}>
              Emitido em {formatDate(batch.created_at)}
            </Text>
            <Text style={styles.brandSub}>{batch.client?.name ?? "—"}</Text>
          </View>
        </View>

        <View style={styles.conditions}>
          <View style={styles.conditionItem}>
            <Text style={styles.conditionLabel}>Produto</Text>
            <Text style={styles.conditionValue}>{batch.product ?? "—"}</Text>
          </View>
          <View style={styles.conditionItem}>
            <Text style={styles.conditionLabel}>Seguro</Text>
            <Text style={styles.conditionValue}>
              {batch.insurance_pct !== null
                ? `${batch.insurance_pct}% sobre a NF`
                : "—"}
            </Text>
          </View>
          <View style={styles.conditionItem}>
            <Text style={styles.conditionLabel}>Free time</Text>
            <Text style={styles.conditionValue}>
              {batch.free_time_hours !== null
                ? `${batch.free_time_hours}h`
                : "—"}
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.th}>Origem</Text>
            <Text style={styles.th}>Destino</Text>
            <Text style={styles.th}>Veículo</Text>
            <Text style={styles.th}>Lotação mín.</Text>
            <Text style={styles.th}>Pedágio</Text>
            <Text style={styles.th}>ICMS</Text>
            <Text style={styles.th}>Net{unitSuffix}</Text>
            <Text style={styles.th}>Gross{unitSuffix}</Text>
            <Text style={styles.th}>Full{unitSuffix}</Text>
            <Text style={styles.th}>Transit</Text>
            <Text style={styles.th}>Over time</Text>
          </View>
          {routes.map((route, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.td}>{route.origin ?? "—"}</Text>
              <Text style={styles.td}>{route.destination ?? "—"}</Text>
              <Text style={styles.td}>{route.vehicle_type ?? "—"}</Text>
              <Text style={styles.td}>
                {route.min_load_ton !== null ? `${route.min_load_ton} ton` : "—"}
              </Text>
              <Text style={styles.td}>{formatCurrency(route.toll_cost)}</Text>
              <Text style={styles.td}>
                {route.icms_pct !== null ? `${route.icms_pct}%` : "—"}
              </Text>
              <Text style={styles.td}>
                {formatCurrency(
                  freightByUnit(route.net_freight, route.min_load_ton, unit)
                )}
              </Text>
              <Text style={styles.td}>
                {formatCurrency(
                  freightByUnit(route.gross_freight, route.min_load_ton, unit)
                )}
              </Text>
              <Text style={styles.tdStrong}>
                {formatCurrency(
                  freightByUnit(route.full_freight, route.min_load_ton, unit)
                )}
              </Text>
              <Text style={styles.td}>
                {route.transit_time_hours !== null
                  ? `${route.transit_time_hours}h`
                  : "—"}
              </Text>
              <Text style={styles.td}>
                {route.over_time_cost !== null
                  ? `${formatCurrency(route.over_time_cost)}/h`
                  : "—"}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>
          {perTon
            ? "Fretes expressos em R$ por tonelada, calculados sobre a lotação mínima de cada rota. "
            : "Fretes expressos em R$ por viagem. "}
          Proposta gerada automaticamente pelo CotaFlow. Valores sujeitos a
          confirmação de disponibilidade de veículo e condições de praça no ato
          do embarque. Documento sem validade fiscal.
        </Text>
      </Page>
    </Document>
  );
}
