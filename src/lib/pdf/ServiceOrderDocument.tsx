import fs from "node:fs";
import path from "node:path";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatOsDate, formatOsNumber, type ServiceOrder } from "@/lib/serviceOrders";

// Ordem de Serviço da Manutenção em PDF (A4, para imprimir).

const LOGO_SRC = `data:image/png;base64,${fs
  .readFileSync(path.join(process.cwd(), "src", "lib", "pdf", "assets", "transbochnia-logo.png"))
  .toString("base64")}`;

const LINE = 0.8;
const GRAY = "#D9D9D9";

const s = StyleSheet.create({
  page: { padding: 32, fontFamily: "Helvetica", fontSize: 10, color: "#000" },
  box: { borderWidth: LINE, borderColor: "#000" },
  row: { flexDirection: "row", borderBottomWidth: LINE, borderColor: "#000" },
  cell: { flex: 1, padding: 6, borderRightWidth: LINE, borderColor: "#000" },
  label: { fontSize: 8, color: "#444", marginBottom: 2 },
  value: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  section: { backgroundColor: GRAY, fontFamily: "Helvetica-Bold", padding: 4, textAlign: "center", borderBottomWidth: LINE, borderColor: "#000" },
  bold: { fontFamily: "Helvetica-Bold" },
});

// Quadro pautado: cada linha digitada (um serviço / uma peça) fica numa linha
// separada por um traço, e o resto do quadro é completado com linhas em branco
// (também servem para anotar à mão).
function RuledLines({ text, minRows }: { text: string; minRows: number }) {
  const items = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const rows = [...items, ...Array<string>(Math.max(0, minRows - items.length)).fill("")];
  return (
    <View>
      {rows.map((line, i) => (
        <View
          key={i}
          wrap={false}
          style={{
            minHeight: 20,
            justifyContent: "center",
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderBottomWidth: i < rows.length - 1 ? 0.4 : 0,
            borderColor: "#9A9A9A",
          }}
        >
          <Text>{line || " "}</Text>
        </View>
      ))}
    </View>
  );
}

export function ServiceOrderDocument({ os }: { os: ServiceOrder }) {
  const number = formatOsNumber(os.number);
  return (
    <Document title={`Ordem de Serviço ${number} - ${os.plate}`} author="Transbochnia">
      <Page size="A4" style={s.page}>
        <View style={s.box}>
          {/* Cabeçalho */}
          <View style={[s.row, { height: 60 }]}>
            <View style={{ width: 110, borderRightWidth: LINE, borderColor: "#000", alignItems: "center", justifyContent: "center" }}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
              <Image src={LOGO_SRC} style={{ width: 80, height: 46 }} />
            </View>
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", borderRightWidth: LINE, borderColor: "#000" }}>
              <Text style={[s.bold, { fontSize: 16 }]}>ORDEM DE SERVIÇO</Text>
            </View>
            <View style={{ width: 120, alignItems: "center", justifyContent: "center" }}>
              <Text style={s.label}>Nº</Text>
              <Text style={[s.bold, { fontSize: 18 }]}>{number}</Text>
            </View>
          </View>

          {/* Data, placa e KM */}
          <View style={s.row}>
            <View style={s.cell}>
              <Text style={s.label}>DATA</Text>
              <Text style={s.value}>{formatOsDate(os.service_date)}</Text>
            </View>
            <View style={s.cell}>
              <Text style={s.label}>PLACA</Text>
              <Text style={s.value}>{os.plate}</Text>
            </View>
            <View style={[s.cell, { borderRightWidth: 0 }]}>
              <Text style={s.label}>KM</Text>
              <Text style={s.value}>{os.km !== null ? os.km.toLocaleString("pt-BR") : "—"}</Text>
            </View>
          </View>

          <Text style={s.section}>DESCRIÇÃO DOS SERVIÇOS</Text>
          <View style={{ borderBottomWidth: LINE, borderColor: "#000" }}>
            <RuledLines text={os.services} minRows={12} />
          </View>

          <Text style={s.section}>DESCRIÇÃO DAS PEÇAS</Text>
          <RuledLines text={os.parts} minRows={10} />
        </View>

        {/* Assinaturas */}
        <View style={{ flexDirection: "row", marginTop: 56, gap: 40 }} wrap={false}>
          <View style={{ flex: 1, borderTopWidth: LINE, borderColor: "#000", paddingTop: 4, alignItems: "center" }}>
            <Text>Responsável pela manutenção</Text>
          </View>
          <View style={{ flex: 1, borderTopWidth: LINE, borderColor: "#000", paddingTop: 4, alignItems: "center" }}>
            <Text>Mecânico / Oficina</Text>
          </View>
        </View>

        <Text
          style={{ position: "absolute", bottom: 18, left: 32, right: 32, fontSize: 7, color: "#666", textAlign: "center" }}
          fixed
        >
          {`OS ${number} · emitida pelo CotaFlow${os.created_by_name ? ` por ${os.created_by_name}` : ""}`}
        </Text>
      </Page>
    </Document>
  );
}
