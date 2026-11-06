import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { filterLabel, reportStory, type ReportData } from "./report";

// KM Exato · PDF do relatório (gerado no navegador). Recorte sem dados
// internos (adm=false), igual ao Excel. A fonte padrão do PDF não tem o sinal
// "−" tipográfico, então os valores usam "-".

const nf = (v: number, d = 0) => (isFinite(v) ? v : 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const brl = (v: number) => "R$ " + nf(Math.abs(v), 2);
const sbrl = (v: number | null | undefined) => (v == null || !isFinite(v) ? "-" : Math.abs(v) < 0.005 ? "R$ 0,00" : (v < 0 ? "-" : "+") + brl(v));
const km = (v: number | null | undefined) => (v == null || !isFinite(v) ? "-" : nf(v, 0));
const skm = (v: number | null | undefined) => (v == null || !isFinite(v) ? "-" : (v > 0 ? "+" : v < 0 ? "-" : "") + nf(Math.abs(v), 0));
const pct = (v: number | null | undefined) => (v == null || !isFinite(v) ? "-" : (v > 0 ? "+" : v < 0 ? "-" : "") + nf(Math.abs(v * 100), 1) + "%");
const dBR = (s: string | null | undefined) => (s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(2, 4) : "-");
const fav = (v: number) => (Math.abs(v) < 0.005 ? "zerado" : "a favor da " + (v < 0 ? "Transbochnia" : "Btech"));
const clean = (s: string) => s.replace(/−/g, "-").replace(/“|”/g, '"');

const s = StyleSheet.create({
  page: { padding: 32, fontFamily: "Helvetica", fontSize: 8.5, color: "#192134" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 2, borderColor: "#3d9943", paddingBottom: 8, marginBottom: 10 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 15 },
  sub: { fontSize: 8, color: "#5b6b8c", marginTop: 2 },
  story: { backgroundColor: "#f1f3f8", padding: 8, borderRadius: 4, fontSize: 9, lineHeight: 1.4, marginBottom: 10 },
  kpis: { flexDirection: "row", gap: 6, marginBottom: 10 },
  kpi: { flex: 1, borderWidth: 0.6, borderColor: "#bac5de", borderRadius: 4, padding: 6 },
  kl: { fontSize: 7, color: "#5b6b8c" },
  kv: { fontFamily: "Helvetica-Bold", fontSize: 12, marginTop: 2 },
  kf: { fontSize: 7, color: "#42578a", marginTop: 1 },
  h2: { fontFamily: "Helvetica-Bold", fontSize: 10, marginTop: 8, marginBottom: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.4, borderColor: "#dde2ee", paddingVertical: 3 },
  th: { flexDirection: "row", backgroundColor: "#192134", color: "#ffffff", paddingVertical: 4, fontFamily: "Helvetica-Bold", fontSize: 7.5 },
  foot: { position: "absolute", bottom: 16, left: 32, right: 32, fontSize: 7, color: "#5b6b8c", textAlign: "center" },
});

function Row({ cells, widths, header, bold }: { cells: string[]; widths: number[]; header?: boolean; bold?: boolean }) {
  return (
    <View style={header ? s.th : s.tr} wrap={false}>
      {cells.map((c, i) => (
        <Text key={i} style={{ width: `${widths[i]}%`, paddingHorizontal: 3, textAlign: i === 0 ? "left" : "right", fontFamily: bold ? "Helvetica-Bold" : undefined }}>
          {c}
        </Text>
      ))}
    </View>
  );
}

export function KmReportPdf({ D, logoUrl }: { D: ReportData; logoUrl: string }) {
  const lb = filterLabel(D.f);
  const K = D.K;
  const c = D.cps;
  const wv = [9, 7, 7, 6, 8, 8, 8, 12, 12, 12, 11];
  return (
    <Document title="KM Exato · Btech × Transbochnia" author="Transbochnia Transportes">
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <View>
            <Text style={s.title}>Controle de quilometragem · Btech</Text>
            <Text style={s.sub}>{clean(`${lb.per} · ${lb.pl} · ${lb.st}${lb.q ? " · " + lb.q : ""}`)}</Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
          <Image src={logoUrl} style={{ width: 70, height: 40, objectFit: "contain" }} />
        </View>

        <Text style={s.story}>{clean(reportStory(D))}</Text>

        <View style={s.kpis}>
          <View style={s.kpi}>
            <Text style={s.kl}>Saldo atual · {D.todas ? "frota" : "veículos filtrados"}</Text>
            <Text style={s.kv}>{brl(D.saldo)}</Text>
            <Text style={s.kf}>{fav(D.saldo)}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kl}>Resultado do período</Text>
            <Text style={s.kv}>{brl(K.res)}</Text>
            <Text style={s.kf}>{Math.abs(K.res) < 0.005 ? "sem diferença" : fav(K.res)} · {K.n} viagens dedicadas</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kl}>Km rodado × km estimado</Text>
            <Text style={s.kv}>{pct(K.desv)}</Text>
            <Text style={s.kf}>{km(K.real)} rodados × {km(K.rota)} da rota</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kl}>Viagens · entregas · peso</Text>
            <Text style={s.kv}>{K.nAll} · {K.ent} · {K.peso ? nf(K.peso / 1000, 1) + " t" : "-"}</Text>
            <Text style={s.kf}>{[K.ded ? K.ded + " dedicadas" : "", K.nrota ? K.nrota + " rota do contrato" : "", K.spot ? K.spot + " spot" : ""].filter(Boolean).join(" · ")}</Text>
          </View>
        </View>

        <Text style={s.h2}>Composição do saldo · {D.todas ? "frota" : "veículos filtrados"}, desde a abertura do controle</Text>
        <Row widths={[70, 30]} header cells={["", "Valor"]} />
        <Row widths={[70, 30]} cells={["Abertura (controle anterior)", sbrl(c.ab)]} />
        <Row widths={[70, 30]} cells={["Divergência · km rodado × km estimado", sbrl(c.op)]} />
        <Row widths={[70, 30]} cells={["Compensado no km faturado", sbrl(c.comp)]} />
        {Math.abs(c.ac) > 0.004 && <Row widths={[70, 30]} cells={["Acertos em dinheiro", sbrl(c.ac)]} />}
        <Row widths={[70, 30]} bold cells={["Saldo atual", sbrl(c.saldo)]} />

        <Text style={s.h2}>Por veículo</Text>
        <Row widths={wv} header cells={["Veículo", "Viagens", "Entreg.", "Peso", "Km rodado", "Variação", "Comp. km", "Compensação", "Resultado", "Saldo", "Km mínimo"]} />
        {D.porPlaca.map((a) => {
          const ms = D.prod.filter((x) => x.placa === a.placa);
          const ab = ms.filter((x) => x.def > 0 && !x.abono);
          return (
            <Row
              key={a.placa}
              widths={wv}
              cells={[
                a.placa!,
                String(a.nAll), String(a.ent), a.peso ? nf(a.peso / 1000, 1) + " t" : "-", km(a.kmProd), pct(a.desv), skm(a.kc),
                Math.abs(a.cp) > 0.004 ? sbrl(a.cp) : "-", a.n ? sbrl(a.res) : "-", sbrl(a.saldo ?? 0),
                !ms.length ? "em curso" : ab.length ? `${ab.length}/${ms.length} abaixo` : "na meta",
              ]}
            />
          );
        })}
        <Row widths={wv} bold cells={["Total", String(K.nAll), String(K.ent), K.peso ? nf(K.peso / 1000, 1) + " t" : "-", km(D.porPlaca.reduce((x, a) => x + a.kmProd, 0)), pct(K.desv), skm(K.kc), sbrl(K.cp), sbrl(K.res), sbrl(D.saldo), ""]} />

        {D.comp.length > 0 && (
          <>
            <Text style={s.h2}>Compensações no período{D.comp.length > 40 ? ` (40 de ${D.comp.length}; o Excel traz todas)` : ""}</Text>
            <Row widths={[14, 12, 14, 16, 14, 15, 15]} header cells={["Carregamento", "Placa", "Km estimado", "Compensação", "Valor", "Saldo antes", "Depois"]} />
            {D.comp.slice(0, 40).map((l) => (
              <Row key={l.t.id} widths={[14, 12, 14, 16, 14, 15, 15]} cells={[dBR(l.t.carreg), l.t.placa, km(l.t.kmRota), skm(l.t.kmComp) + " km", sbrl(l.t.compRS), sbrl(l.antes), sbrl(l.depois)]} />
            ))}
          </>
        )}

        <Text style={s.foot} fixed render={({ pageNumber, totalPages }) => `KM Exato · Btech × Transbochnia · valores negativos a favor da Transbochnia, positivos a favor da Btech · página ${pageNumber} de ${totalPages}`} />
      </Page>
    </Document>
  );
}
