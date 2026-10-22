import fs from "node:fs";
import path from "node:path";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { CERT_LABEL, fmtDateBr, type MonthlyChecklist, type MonthlyItem } from "@/lib/monthlyChecklist";

// Check-list mensal em PDF, no layout do formulário de papel.

const LOGO_SRC = `data:image/png;base64,${fs
  .readFileSync(path.join(process.cwd(), "src", "lib", "pdf", "assets", "transbochnia-logo.png"))
  .toString("base64")}`;

const TITLE: Record<string, string> = { semi: "SEMIRREBOQUES", motor: "TRUCK E OUTROS" };
const LINE = 0.7;
const GRAY = "#D9D9D9";

const s = StyleSheet.create({
  page: { padding: 28, fontFamily: "Helvetica", fontSize: 7.5, color: "#000" },
  box: { borderWidth: LINE, borderColor: "#000" },
  row: { flexDirection: "row", borderBottomWidth: LINE, borderColor: "#000" },
  num: { width: 24, borderRightWidth: LINE, borderColor: "#000", padding: 2, textAlign: "center" },
  text: { flex: 1, padding: 2, borderRightWidth: LINE, borderColor: "#000" },
  r: { width: 26, padding: 2, textAlign: "center", fontFamily: "Helvetica-Bold" },
  section: { backgroundColor: GRAY, fontFamily: "Helvetica-Bold", textAlign: "center", padding: 2, flex: 1, borderRightWidth: LINE, borderColor: "#000" },
  bold: { fontFamily: "Helvetica-Bold" },
});

function extraText(c: MonthlyChecklist, it: MonthlyItem): string {
  const ex = c.extras[it.id] ?? {};
  const parts: string[] = [];
  if (it.extra === "due" || it.extra === "due2") parts.push(`VENCIMENTO: ${ex.due ? fmtDateBr(ex.due) : "—"}`);
  if (it.extra === "due2") parts.push(`VENCIMENTO: ${ex.due2 ? fmtDateBr(ex.due2) : "—"}`);
  if (it.extra === "cnh") parts.push(`PONTOS NA CNH: ${ex.points || "—"}   VALIDADE: ${ex.validity ? fmtDateBr(ex.validity) : "—"}`);
  if (it.extra === "date") parts.push(`DATA DA ÚLTIMA REGULAGEM DE FREIOS: ${ex.date ? fmtDateBr(ex.date) : "—"}`);
  return parts.join("    ");
}

export function MonthlyChecklistDocument({ c, items }: { c: MonthlyChecklist; items: MonthlyItem[] }) {
  const sectionNumber = new Map<string, string>();
  for (const it of items) if (!sectionNumber.has(it.section)) sectionNumber.set(it.section, it.number.split(".")[0]);
  const finished = new Date(c.finished_at);

  return (
    <Document title={`Check-list mensal ${c.plate}`} author="Transbochnia">
      <Page size="A4" style={s.page}>
        <View style={s.box}>
          {/* Cabeçalho */}
          <View style={[s.row, { height: 52 }]}>
            <View style={{ width: 92, borderRightWidth: LINE, borderColor: "#000", alignItems: "center", justifyContent: "center" }}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
              <Image src={LOGO_SRC} style={{ width: 70, height: 40 }} />
            </View>
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", borderRightWidth: LINE, borderColor: "#000" }}>
              <Text style={[s.bold, { fontSize: 11 }]}>CHECK LIST MENSAL</Text>
              <Text style={[s.bold, { fontSize: 11, marginTop: 3 }]}>{TITLE[c.template]}</Text>
            </View>
            <View style={{ width: 150 }}>
              <View style={[s.row, { flex: 1, alignItems: "center", paddingHorizontal: 4 }]}>
                <Text>Placa: </Text>
                <Text style={[s.bold, { fontSize: 10 }]}>{c.plate}</Text>
              </View>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 4 }}>
                <Text>Data: </Text>
                <Text style={[s.bold, { fontSize: 10 }]}>
                  {finished.toLocaleDateString("pt-BR")} {finished.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            </View>
          </View>

          {items.map((it, index, all) => {
            const prev = index > 0 ? all[index - 1] : null;
            const header = !prev || prev.section !== it.section;
            const sub = Boolean(it.subsection) && (!prev || prev.subsection !== it.subsection);
            const ans = c.answers[it.id];
            const extra = extraText(c, it);
            const note = c.item_notes[it.id];
            return (
              <View key={it.id}>
                {header && (
                  <View style={[s.row, { backgroundColor: GRAY }]} wrap={false}>
                    <Text style={[s.num, s.bold]}>{sectionNumber.get(it.section)}</Text>
                    <Text style={s.section}>{it.section}</Text>
                    <Text style={s.r}>R</Text>
                  </View>
                )}
                {header && it.section === "DADOS DO MOTORISTA" && (
                  <View style={s.row} wrap={false}>
                    <Text style={s.num}>1.1</Text>
                    <Text style={s.text}>
                      Nome do motorista: <Text style={s.bold}>{c.driver_absent ? "AUSENTE" : (c.driver_name ?? "—")}</Text>
                    </Text>
                    <Text style={s.r}> </Text>
                  </View>
                )}
                {sub && (
                  <View style={s.row} wrap={false}>
                    <Text style={[s.num, { borderRightWidth: 0 }]}> </Text>
                    <Text style={[s.text, { textAlign: "center", backgroundColor: "#F2F2F2" }]}>{it.subsection}:</Text>
                    <Text style={s.r}> </Text>
                  </View>
                )}
                <View style={[s.row, ans === "N" ? { backgroundColor: "#FDE2E2" } : {}]} wrap={false}>
                  <Text style={s.num}>{it.number}</Text>
                  <View style={s.text}>
                    <Text>{it.text}</Text>
                    {extra ? <Text style={{ marginTop: 1, color: "#333" }}>{extra}</Text> : null}
                    {ans === "N" && note ? <Text style={{ marginTop: 1, color: "#9B1C1C" }}>Defeito: {note}</Text> : null}
                  </View>
                  <Text style={s.r}>{ans === "NA" ? "" : (ans ?? "")}</Text>
                </View>
              </View>
            );
          })}

          {/* Resultado */}
          <View style={[s.row, { backgroundColor: GRAY, padding: 2 }]} wrap={false}>
            <Text style={[s.bold, { flex: 1, textAlign: "center" }]}>RESULTADO DA AVALIAÇÃO</Text>
          </View>
          <View style={{ flexDirection: "row" }} wrap={false}>
            <View style={{ flex: 1.3, padding: 4, borderRightWidth: LINE, borderColor: "#000", justifyContent: "center" }}>
              <Text style={[s.bold, { textAlign: "center" }]}>
                Declaro serem verdadeiras todas as informações contidas no presente documento, assim como, permaneço ciente que, em
                30 (trinta) dias devo inspecionar novamente os veículos aqui tratados.
              </Text>
            </View>
            <View style={{ flex: 1, padding: 4, borderRightWidth: LINE, borderColor: "#000", alignItems: "center" }}>
              <Text style={s.bold}>Ass. do responsável:</Text>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
              <Image src={c.inspector_signature} style={{ width: 120, height: 40, marginTop: 2 }} />
              <Text>{c.inspector_name ?? ""}</Text>
            </View>
            <View style={{ flex: 1, padding: 4, alignItems: "center" }}>
              <Text style={s.bold}>Ass. do motorista:</Text>
              {c.driver_signature ? (
                // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image
                <Image src={c.driver_signature} style={{ width: 120, height: 40, marginTop: 2 }} />
              ) : (
                <Text style={{ marginTop: 10, color: "#9B1C1C" }}>MOTORISTA AUSENTE</Text>
              )}
              <Text>{c.driver_absent ? (c.driver_absent_reason ?? "") : (c.driver_name ?? "")}</Text>
            </View>
          </View>
        </View>

        <Text style={{ marginTop: 4, textAlign: "center", fontSize: 7 }}>
          Preenchido com &quot;S&quot; quando o item está atendido, &quot;N&quot; quando há defeito e em branco quando o item não se aplica.
        </Text>

        {(c.observations || c.divergences.length > 0) && (
          <View style={[s.box, { marginTop: 6 }]} wrap={false}>
            <View style={{ backgroundColor: GRAY, borderBottomWidth: LINE, borderColor: "#000", padding: 2 }}>
              <Text style={[s.bold, { textAlign: "center" }]}>OBSERVAÇÕES</Text>
            </View>
            <View style={{ padding: 4 }}>
              {c.observations ? <Text>{c.observations}</Text> : null}
              {c.divergences.map((d) => (
                <Text key={d.item} style={{ marginTop: 2 }}>
                  Vencimento divergente do cadastro — {d.item} {CERT_LABEL[d.cert]}: check-list {fmtDateBr(d.checklist)}, cadastro{" "}
                  {fmtDateBr(d.cadastro)}.
                </Text>
              ))}
            </View>
          </View>
        )}
      </Page>
    </Document>
  );
}
