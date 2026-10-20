import fs from "node:fs";
import path from "node:path";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatTons, natureFill, ORDER_MAX_LINES, type OrderLine } from "@/lib/loadingOrder";

// Ordem de embarque da Btech: reproduz a planilha "Ordem de carregamento BTech".
// Cabeçalho da Transbochnia, empresa de carregamento e endereço são fixos.

const asset = (name: string, mime: string) =>
  `data:${mime};base64,${fs.readFileSync(path.join(process.cwd(), "src", "lib", "pdf", "assets", name)).toString("base64")}`;
const LOGO_SRC = asset("transbochnia-logo.png", "image/png");
const SIGNATURE_SRC = asset("assinatura-empresa.jpg", "image/jpeg");

export interface LoadingOrderData {
  /** AAAA-MM-DD */
  date: string;
  driver: string;
  driverCpf: string;
  plate: string;
  trailerPlate: string;
  lines: OrderLine[];
}

const LOADING_COMPANY = "Momentive Química do Brasil Ltda.";
const LOADING_ADDRESS = "Rua Cyro Correia Pereira, 2525";
const DEST_COMPANY = "BTECH";

const W = { oc: 62, nature: 112, comp: 66, tons: 58, dest: 45, city: 152, uf: 28 };
const ROW_H = 21;
const LINE = 0.8;
const GRAY = "#D9D9D9";

const s = StyleSheet.create({
  page: { padding: 36, fontFamily: "Helvetica", color: "#000" },
  box: { borderWidth: LINE, borderColor: "#000" },
  row: { flexDirection: "row" },
  cell: { borderRightWidth: LINE, borderBottomWidth: LINE, borderColor: "#000", justifyContent: "center", paddingHorizontal: 3 },
  gray: { backgroundColor: GRAY },
  label: { fontSize: 7, fontFamily: "Helvetica-Bold" },
  value: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  center: { textAlign: "center" },
});

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function Cell({
  w,
  h = ROW_H,
  gray,
  fill,
  last,
  children,
  align,
}: {
  w: number;
  h?: number;
  gray?: boolean;
  fill?: string | null;
  last?: boolean;
  children?: React.ReactNode;
  align?: "center" | "left";
}) {
  return (
    <View
      style={[
        s.cell,
        { width: w, height: h },
        gray ? s.gray : {},
        fill ? { backgroundColor: fill } : {},
        last ? { borderRightWidth: 0 } : {},
        align === "center" ? { alignItems: "center" } : {},
      ]}
    >
      {children}
    </View>
  );
}

export function LoadingOrderDocument({ order }: { order: LoadingOrderData }) {
  const lines = order.lines.slice(0, ORDER_MAX_LINES);
  const total = lines.reduce((sum, l) => sum + (l.tons ?? 0), 0);
  const empty = Math.max(ORDER_MAX_LINES - lines.length, 0);

  // Linhas seguidas com a mesma OC dividem a mesma célula de número da ordem.
  const groups: { oc: string; items: OrderLine[] }[] = [];
  for (const l of lines) {
    const last = groups[groups.length - 1];
    if (last && l.oc.trim() !== "" && last.oc.trim().toUpperCase() === l.oc.trim().toUpperCase()) last.items.push(l);
    else groups.push({ oc: l.oc, items: [l] });
  }

  const half = { left: 284, right: 239 };

  return (
    <Document title="Ordem de embarque" author="Transbochnia">
      <Page size="A4" style={s.page}>
        <View style={s.box}>
          {/* Cabeçalho da Transbochnia */}
          <View style={[s.row, { borderBottomWidth: LINE, borderColor: "#000", height: 82 }]}>
            <View style={{ width: 120, borderRightWidth: LINE, borderColor: "#000", justifyContent: "center", alignItems: "center" }}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
              <Image src={LOGO_SRC} style={{ width: 95, height: 54 }} />
            </View>
            <View style={{ flex: 1, justifyContent: "space-evenly", alignItems: "center" }}>
              <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>TRANSBOCHNIA TRANSPORTES LTDA.</Text>
              <View style={[s.row, { width: 340, justifyContent: "space-between" }]}>
                <Text style={{ fontSize: 8 }}>C.N.P.J.: 86.959.426/0001-92</Text>
                <Text style={{ fontSize: 8 }}>INSCR. EST.: 101.99067-24</Text>
              </View>
              <Text style={{ fontSize: 8 }}>FONE: (41) 3347-8888 - E-MAIL: atendimento@transbochnia.com.br</Text>
              <Text style={{ fontSize: 8 }}>AV. JUSCELINO K. DE OLIVEIRA, 13700 - CIC - CURITIBA - PARANÁ</Text>
            </View>
          </View>

          {/* Título e data */}
          <View style={s.row}>
            <Cell w={half.left} h={28}>
              <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold" }}>ORDEM DE EMBARQUE</Text>
            </Cell>
            <Cell w={75} h={28} gray>
              <Text style={s.label}>DATA:</Text>
            </Cell>
            <Cell w={164} h={28} last>
              <Text style={s.value}>{fmtDate(order.date)}</Text>
            </Cell>
          </View>

          {/* Empresa, motorista e placas */}
          {[
            ["EMPRESA:", LOADING_COMPANY, "ENDEREÇO:", LOADING_ADDRESS],
            ["MOTORISTA:", order.driver, "CPF MOTORISTA:", order.driverCpf],
            ["PLACA CAMINHÃO:", order.plate, "PLACA CARRETA:", order.trailerPlate],
          ].map(([l1, v1, l2, v2]) => (
            <View key={l1} style={s.row}>
              <Cell w={75} gray>
                <Text style={s.label}>{l1}</Text>
              </Cell>
              <Cell w={209}>
                <Text style={s.value}>{v1}</Text>
              </Cell>
              <Cell w={75} gray>
                <Text style={s.label}>{l2}</Text>
              </Cell>
              <Cell w={164} last>
                <Text style={s.value}>{v2}</Text>
              </Cell>
            </View>
          ))}

          {/* Cabeça da tabela */}
          <View style={s.row}>
            <Cell w={W.oc} gray align="center">
              <Text style={s.label}>Nº ORDEM</Text>
            </Cell>
            <Cell w={W.nature} gray align="center">
              <Text style={s.label}>NATUREZA</Text>
            </Cell>
            <Cell w={W.comp} gray align="center">
              <Text style={s.label}>COMPART.</Text>
            </Cell>
            <Cell w={W.tons} gray align="center">
              <Text style={s.label}>PESO (ton.)</Text>
            </Cell>
            <Cell w={W.dest + W.city + W.uf} gray align="center" last>
              <Text style={s.label}>DESTINO</Text>
            </Cell>
          </View>

          {/* Linhas da ordem */}
          {groups.map((g, gi) => (
            <View key={gi} style={s.row}>
              <Cell w={W.oc} h={ROW_H * g.items.length} align="center">
                <Text style={[s.value, s.center]}>{g.oc.trim() ? (/^oc/i.test(g.oc.trim()) ? g.oc.trim() : `OC. ${g.oc.trim()}`) : ""}</Text>
              </Cell>
              <View>
                {g.items.map((l, li) => {
                  const fill = natureFill(l.nature);
                  return (
                    <View key={li} style={s.row}>
                      <Cell w={W.nature} fill={fill} align="center">
                        <Text style={[s.value, s.center]}>{l.nature}</Text>
                      </Cell>
                      <Cell w={W.comp} fill={fill} align="center">
                        <Text style={[{ fontSize: 12, fontFamily: "Helvetica-Bold" }, s.center]}>{l.compartments}</Text>
                      </Cell>
                      <Cell w={W.tons} fill={fill} align="center">
                        <Text style={[{ fontSize: 12, fontFamily: "Helvetica-Bold" }, s.center]}>
                          {l.tons === null ? "" : formatTons(l.tons)}
                        </Text>
                      </Cell>
                      <Cell w={W.dest} fill={fill} align="center">
                        <Text style={[s.value, s.center]}>{l.city || l.uf ? DEST_COMPANY : ""}</Text>
                      </Cell>
                      <Cell w={W.city} fill={fill} align="center">
                        <Text style={[s.value, s.center]}>{l.city}</Text>
                      </Cell>
                      <Cell w={W.uf} fill={fill} align="center" last>
                        <Text style={[s.value, s.center]}>{l.uf}</Text>
                      </Cell>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
          {Array.from({ length: empty }).map((_, i) => (
            <View key={`e${i}`} style={s.row}>
              <Cell w={W.oc} />
              <Cell w={W.nature} />
              <Cell w={W.comp} />
              <Cell w={W.tons} />
              <Cell w={W.dest} />
              <Cell w={W.city} />
              <Cell w={W.uf} last />
            </View>
          ))}

          {/* Total */}
          <View style={s.row}>
            <Cell w={W.oc + W.nature + W.comp} gray align="center">
              <Text style={s.label}>TOTAL:</Text>
            </Cell>
            <Cell w={W.tons} align="center">
              <Text style={[{ fontSize: 12, fontFamily: "Helvetica-Bold" }, s.center]}>{formatTons(total)}</Text>
            </Cell>
            <Cell w={W.dest + W.city + W.uf} gray last />
          </View>

          {/* Assinatura da empresa */}
          <View style={{ height: 96, alignItems: "center", justifyContent: "flex-end", paddingBottom: 6 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
            <Image src={SIGNATURE_SRC} style={{ width: 150, height: 26, marginBottom: 4 }} />
            <Text style={{ fontSize: 7 }}>ASSINATURA EMPRESA</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
