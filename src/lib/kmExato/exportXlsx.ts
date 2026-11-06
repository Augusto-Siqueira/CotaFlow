import type { KmEngine } from "./engine";
import { filterLabel, reportStory, type ReportData } from "./report";

// KM Exato · Excel do relatório (no navegador, com ExcelJS). Sempre o recorte
// sem dados internos (reportData com adm=false), como no app original.
// Sinal dos valores: negativo = a favor da Transbochnia; positivo = da Btech.

const MONEY = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
type Kind = "d" | "km" | "money" | "pct" | "dec" | "dec1" | "txt";
const FMT: Record<Kind, string | undefined> = { d: "dd/mm/yyyy", km: "#,##0", money: MONEY, pct: "+0.0%;-0.0%;0.0%", dec: "#,##0.0000", dec1: "#,##0.0", txt: undefined };

const toDate = (iso: string | null | undefined) => (iso ? new Date(iso.slice(0, 10) + "T12:00:00") : null);

export async function buildReportXlsx(E: KmEngine, D: ReportData): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Transbochnia Transportes";
  wb.title = "KM Btech · Btech × Transbochnia";
  const lb = filterLabel(D.f);
  const sub = `KM Btech · Btech × Transbochnia · ${lb.per} · ${lb.pl} · ${lb.st}${lb.q ? " · " + lb.q : ""}`;

  function table(name: string, title: string, head: [string, Kind][], rows: (string | number | Date | null)[][], widths: number[]) {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 4, showGridLines: false }], pageSetup: { orientation: "landscape", paperSize: 9, fitToWidth: 1, fitToHeight: 0 } });
    ws.getCell("A1").value = title;
    ws.getCell("A1").font = { bold: true, size: 14 };
    ws.getCell("A2").value = sub;
    ws.getCell("A2").font = { size: 9, color: { argb: "FF5B6B8C" } };
    const hr = ws.getRow(4);
    head.forEach(([h], i) => {
      const c = hr.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF192134" } };
      c.alignment = { vertical: "middle", horizontal: head[i][1] === "txt" || head[i][1] === "d" ? "left" : "right" };
    });
    hr.height = 20;
    rows.forEach((r, ri) => {
      const row = ws.getRow(5 + ri);
      r.forEach((v, ci) => {
        const c = row.getCell(ci + 1);
        c.value = v as never;
        const f = FMT[head[ci][1]];
        if (f) c.numFmt = f;
      });
    });
    widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    if (rows.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: head.length } };
    return ws;
  }

  // Resumo
  const res = wb.addWorksheet("Resumo", { views: [{ showGridLines: false }] });
  res.getColumn(1).width = 46;
  res.getColumn(2).width = 22;
  res.getColumn(3).width = 60;
  res.getCell("A1").value = "Controle de quilometragem";
  res.getCell("A1").font = { bold: true, size: 14 };
  res.getCell("A2").value = "KM Btech · Btech × Transbochnia · contrato, cl. 6.4";
  res.getCell("A2").font = { size: 9, color: { argb: "FF5B6B8C" } };
  const K = D.K;
  const c = D.cps;
  const kv: [string, string | number | null, Kind, string?][] = [
    ["Período", lb.per, "txt"],
    ["Veículos", lb.pl, "txt"],
    ["Viagens", lb.st + (lb.q ? " · " + lb.q : ""), "txt"],
    ["", null, "txt"],
    ["Resumo", reportStory(D), "txt"],
    ["", null, "txt"],
    ["Saldo atual " + (D.todas ? "da frota" : "dos veículos filtrados"), D.saldo, "money", "negativo = a favor da Transbochnia"],
    ["Resultado do período", K.res, "money", `${K.n} viagens dedicadas concluídas`],
    ["Km rodado × km estimado", K.desv ?? null, "pct", `${K.real.toLocaleString("pt-BR")} rodados × ${K.rota.toLocaleString("pt-BR")} estimados`],
    ["Viagens · entregas · peso (t)", `${K.nAll} · ${K.ent} · ${(K.peso / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`, "txt"],
    ["", null, "txt"],
    ["Composição do saldo", null, "txt"],
    ["Abertura (controle anterior)", c.ab, "money"],
    ["Divergência · km rodado × km estimado", c.op, "money"],
    ["Compensado no km faturado", c.comp, "money"],
    ["Acertos em dinheiro", c.ac, "money"],
    ["Saldo atual", c.saldo, "money"],
  ];
  kv.forEach(([k, v, kind, note], i) => {
    const r = res.getRow(4 + i);
    r.getCell(1).value = k;
    if (k === "Composição do saldo" || k === "Resumo") r.getCell(1).font = { bold: true };
    r.getCell(2).value = v as never;
    const f = FMT[kind];
    if (f) r.getCell(2).numFmt = f;
    if (k === "Resumo") {
      res.mergeCells(4 + i, 2, 4 + i, 3);
      r.getCell(2).alignment = { wrapText: true, vertical: "top" };
      r.height = 60;
    }
    if (note) r.getCell(3).value = note;
  });

  table(
    "Por veículo",
    "Resultado por veículo",
    [["Veículo", "txt"], ["Equipamento", "txt"], ["Viagens", "km"], ["Entregas", "km"], ["Peso (t)", "dec1"], ["Km rodado", "km"], ["Km estimado", "km"], ["Variação", "pct"], ["Divergência", "money"], ["Compensação", "money"], ["Resultado", "money"], ["Saldo atual", "money"]],
    D.porPlaca.map((a) => [a.placa!, E.tipoNome(a.tipo ?? null), a.nAll, a.ent, a.peso / 1000, a.kmProd, a.rota, a.desv ?? null, a.op, a.cp, a.res, a.saldo ?? 0]),
    [11, 22, 9, 9, 9, 11, 11, 10, 14, 14, 14, 14]
  );
  table(
    "Viagens",
    "Viagens",
    [["Carregamento", "d"], ["Placa", "txt"], ["Operação", "txt"], ["Destinos", "txt"], ["Entregas", "km"], ["Peso (t)", "dec1"], ["Km estimado", "km"], ["Compensação km", "km"], ["Km faturado", "km"], ["Odômetro saída", "km"], ["Odômetro chegada", "km"], ["Km rodado", "km"], ["Valor do km", "dec"], ["Saldo da viagem", "money"], ["Situação", "txt"]],
    D.L.slice()
      .reverse()
      .map((t) => [
        toDate(t.carreg), t.placa, t.modo === "spot" ? "spot" : t.modo === "rota" ? "rota do contrato" : "dedicada", t.dst, t.ne,
        t.entregas.reduce((a, e) => a + (+(e.peso ?? 0) || 0), 0) / 1000, t.kmRota, t.kmComp || 0, t.kmFat, t.odoSaida ?? null, t.odoChegada ?? null,
        t.kmReal, t.vkm, t.ctl ? t.difRS : null, t.status === "aberta" ? "em viagem" : "concluída",
      ]),
    [12, 10, 15, 44, 9, 9, 11, 12, 11, 12, 12, 11, 10, 15, 12]
  );
  const ents = D.L.flatMap((t) =>
    t.entregas.map((e) => [toDate(e.entregue ?? t.carreg), t.placa, e.cliente, e.nf, e.cte, (+(e.peso ?? 0) || 0) / 1000, e.entregue ? (e.comp?.env ? "entregue · comprovante enviado" : "entregue") : "em trânsito"])
  );
  table("Entregas", "Entregas", [["Entrega", "d"], ["Placa", "txt"], ["Cliente / destino", "txt"], ["NF", "txt"], ["CT-e", "txt"], ["Peso (t)", "dec1"], ["Situação", "txt"]], ents, [12, 11, 40, 11, 11, 10, 28]);
  table(
    "Compensações",
    "Compensações de saldo",
    [["Carregamento", "d"], ["Placa", "txt"], ["CT-e", "txt"], ["Km estimado", "km"], ["Compensação km", "km"], ["Km faturado", "km"], ["Valor", "money"], ["Saldo da placa antes", "money"], ["Saldo da placa depois", "money"]],
    D.comp.map((l) => [toDate(l.t.carreg), l.t.placa, l.t.entregas.map((e) => e.cte).filter(Boolean).join(", "), l.t.kmRota, l.t.kmComp, l.t.kmFat, l.t.compRS, l.antes, l.depois]),
    [12, 10, 20, 12, 14, 12, 14, 18, 18]
  );

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
