// frontend/lib/report-pdf.ts
// Builds the YieldKeep treasury report as a real PDF in the browser (no server needed):
// paper-coloured pages, the YieldKeep logo (header + faint watermark), who downloaded it,
// summary, fee deductions, transactions, and the YieldKeep tagline at the bottom of every page.
// Text is kept to plain ASCII on purpose: the built-in PDF font cannot draw symbols like "−" or "→".

import { checkDownload, newReportId, recordReportDownload, roleOf } from "@/lib/report-usage";

export type ReportRow = { label: string; value: string; tone?: "pos" | "neg" };
export type ReportTx = { date: string; type: string; usdc: string; shares: string; tx: string };
export type ReportFee = { date: string; profit: string; fee: string; tx: string };

export type ReportData = {
  wallet: string; // the treasury (owner) wallet this report is about
  vault: string;
  feeWallet?: string;
  network: string;
  generated: string;
  testnet: boolean;
  summary: ReportRow[];
  fees: ReportFee[];
  txs: ReportTx[];
  txUrl: (hash: string) => string;
  title?: string; // default "Treasury report"
  period?: string; // default "All time"
  downloadedBy?: string; // wallet that pressed download (default: the treasury wallet itself)
  tzNote?: string; // e.g. "GMT+5:30": printed in the date column headers
};

// Change this line to change the tagline printed at the bottom of every page.
export const TAGLINE = "Your keys. Your treasury. Verifiable onchain.";

type RGB = [number, number, number];
const PAPER: RGB = [251, 249, 244];
const PANEL: RGB = [255, 255, 255];
const NAVY: RGB = [15, 23, 42];
const SLATE: RGB = [88, 99, 117];
const WARM: RGB = [246, 243, 235];
const RULE: RGB = [221, 214, 197];
const BLUE: RGB = [37, 99, 235];
const GREEN: RGB = [22, 128, 61];
const RED: RGB = [200, 30, 30];

const shortHash = (h: string) => (h.length > 18 ? `${h.slice(0, 10)}...${h.slice(-6)}` : h);
const shortAddr = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a);

/** The YieldKeep mark: a blue rounded square with a white Y (drawn as vectors, so it is always sharp). */
function drawMark(doc: any, x: number, y: number, size: number, outline = false) {
  if (outline) {
    // watermark version: blue outline and blue Y, so the letter stays visible when it is faint
    doc.setDrawColor(...BLUE);
    doc.setLineWidth(size * 0.035);
    doc.roundedRect(x, y, size, size, size * 0.24, size * 0.24, "S");
    doc.setTextColor(...BLUE);
  } else {
    doc.setFillColor(...BLUE);
    doc.roundedRect(x, y, size, size, size * 0.24, size * 0.24, "F");
    doc.setTextColor(255, 255, 255);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size * 2.35);
  doc.text("Y", x + size / 2, y + size * 0.74, { align: "center" });
}

/** "YieldKeep" wordmark: Yield in navy, Keep in blue. Returns the width used (mm). */
function drawWordmark(doc: any, x: number, y: number, fontSize: number, navy: RGB = NAVY) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  doc.setTextColor(...navy);
  doc.text("Yield", x, y);
  const w1 = doc.getTextWidth("Yield");
  doc.setTextColor(...BLUE);
  doc.text("Keep", x + w1, y);
  return w1 + doc.getTextWidth("Keep");
}

export async function downloadReportPdf(d: ReportData, filename: string): Promise<boolean> {
  const treasury = d.wallet;
  const by = d.downloadedBy ?? d.wallet;
  const title = d.title ?? "Treasury report";
  const period = d.period ?? "All time";

  // plan rules: owner (free: 5 per month) or team member (Pro only)
  const blocked = checkDownload(treasury, by);
  if (blocked) {
    window.alert(blocked);
    return false;
  }

  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc: any = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16; // content margin
  const BOTTOM = 30; // space kept free for the footer
  const reportId = newReportId();

  /* ---------- paper background, frame and faint logo, once per page ---------- */
  const painted = new Set<number>();
  const paintPage = () => {
    const n = doc.internal.getCurrentPageInfo().pageNumber;
    if (painted.has(n)) return;
    painted.add(n);
    doc.setFillColor(...PAPER);
    doc.rect(0, 0, W, H, "F");
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.35);
    doc.rect(6, 6, W - 12, H - 12, "S");
    doc.setLineWidth(0.12);
    doc.rect(7.6, 7.6, W - 15.2, H - 15.2, "S");
    // faint watermark in the middle
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.075, "stroke-opacity": 0.075 }));
    drawMark(doc, W / 2 - 30, H / 2 - 52, 60, true);
    const wmWidth = (() => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(34);
      return doc.getTextWidth("YieldKeep");
    })();
    drawWordmark(doc, W / 2 - wmWidth / 2, H / 2 + 28, 34);
    doc.restoreGraphicsState();
  };
  paintPage();

  /* ---------- header ---------- */
  drawMark(doc, M, 14, 11);
  const ww = drawWordmark(doc, M + 14, 21.6, 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.6);
  doc.setTextColor(...SLATE);
  doc.text("On-chain treasury infrastructure for DAOs", M + 14, 26.2);
  void ww;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text(title, W - M, 19, { align: "right" });
  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...SLATE);
  doc.text(`Report ID ${reportId}`, W - M, 25, { align: "right" });

  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.7);
  doc.line(M, 32, W - M, 32);

  /* ---------- who / when panel ---------- */
  const panelY = 38;
  const panelH = d.feeWallet ? 41 : 35;
  doc.setFillColor(...PANEL);
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.25);
  doc.roundedRect(M, panelY, W - 2 * M, panelH, 2, 2, "FD");

  const colW = (W - 2 * M) / 2;
  const field = (x: number, y: number, label: string, value: string, mono = true) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(...SLATE);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont(mono ? "courier" : "helvetica", "normal");
    doc.setFontSize(mono ? 7.8 : 9);
    doc.setTextColor(...NAVY);
    doc.text(value, x, y + 4.6);
  };
  const lx = M + 5;
  const rx = M + colW + 3;
  field(lx, panelY + 7, "Treasury (owner)", treasury);
  field(lx, panelY + 18.5, "Vault contract", d.vault);
  if (d.feeWallet) field(lx, panelY + 30, "Fee wallet", d.feeWallet);
  field(rx, panelY + 7, `Downloaded by (${by.toLowerCase() === treasury.toLowerCase() ? "owner" : "team member"})`, by);
  field(rx, panelY + 18.5, "Date and time", d.generated, false);
  field(rx, panelY + 30, "Period", `${period}  |  ${d.network}`, false);

  let y = panelY + panelH + 9;

  const need = (h: number) => {
    if (y + h > H - BOTTOM) {
      doc.addPage();
      paintPage();
      y = 18;
    }
  };
  const heading = (text: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(...NAVY);
    doc.text(text, M, y);
    doc.setDrawColor(...BLUE);
    doc.setLineWidth(0.5);
    doc.line(M, y + 1.8, M + 9, y + 1.8);
  };
  const tableBase = {
    margin: { left: M, right: M, bottom: BOTTOM, top: 18 },
    willDrawPage: () => paintPage(),
  };

  /* ---------- summary ---------- */
  heading("Summary");
  autoTable(doc, {
    ...tableBase,
    startY: y + 5,
    body: d.summary.map((r) => [r.label, r.value]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9.8, cellPadding: { top: 2.7, bottom: 2.7, left: 3.5, right: 3.5 }, textColor: NAVY, lineColor: RULE, lineWidth: 0.12 },
    columnStyles: { 0: { cellWidth: 104, textColor: SLATE }, 1: { halign: "right", fontStyle: "bold" } },
    bodyStyles: { fillColor: false as any },
    didParseCell: (h: any) => {
      if (h.section === "body" && h.column.index === 1) {
        const tone = d.summary[h.row.index]?.tone;
        if (tone === "pos") h.cell.styles.textColor = GREEN;
        if (tone === "neg") h.cell.styles.textColor = RED;
      }
    },
  });
  y = doc.lastAutoTable.finalY + 11;

  /* ---------- fee deductions ---------- */
  need(32);
  heading("Performance fee deductions (10% of profit)");
  if (d.fees.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...SLATE);
    doc.text("No performance fee has been deducted for this treasury in this period.", M, y + 9);
    y += 17;
  } else {
    autoTable(doc, {
      ...tableBase,
      startY: y + 5,
      head: [[`Date${d.tzNote ? ` (${d.tzNote})` : ""}`, "Profit charged (USDC)", "Fee 10% (USDC)", "Transaction"]],
      body: d.fees.map((f) => [f.date, f.profit, f.fee, shortHash(f.tx)]),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8.8, cellPadding: 2.4, textColor: NAVY, lineColor: RULE, lineWidth: 0.12 },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
      bodyStyles: { fillColor: false as any },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right", fontStyle: "bold" }, 3: { font: "courier", textColor: BLUE } },
      didDrawCell: (h: any) => {
        if (h.section === "body" && h.column.index === 3) {
          doc.link(h.cell.x, h.cell.y, h.cell.width, h.cell.height, { url: d.txUrl(d.fees[h.row.index].tx) });
        }
      },
    });
    y = doc.lastAutoTable.finalY + 11;
  }

  /* ---------- transactions ---------- */
  need(32);
  heading("Transactions");
  if (d.txs.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...SLATE);
    doc.text("No transactions found for this wallet in this period.", M, y + 9);
  } else {
    autoTable(doc, {
      ...tableBase,
      startY: y + 5,
      head: [[`Date${d.tzNote ? ` (${d.tzNote})` : ""}`, "Type", "USDC", "Shares", "Transaction"]],
      body: d.txs.map((t) => [t.date, t.type, t.usdc, t.shares, shortHash(t.tx)]),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8.8, cellPadding: 2.4, textColor: NAVY, lineColor: RULE, lineWidth: 0.12 },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
      bodyStyles: { fillColor: false as any },
      columnStyles: { 1: { fontStyle: "bold" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { font: "courier", textColor: BLUE } },
      didDrawCell: (h: any) => {
        if (h.section === "body" && h.column.index === 4) {
          doc.link(h.cell.x, h.cell.y, h.cell.width, h.cell.height, { url: d.txUrl(d.txs[h.row.index].tx) });
        }
      },
    });
  }

  /* ---------- footer on every page: tagline, disclaimer, who downloaded, page number ---------- */
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.25);
    doc.line(M, H - 25, W - M, H - 25);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    doc.text(TAGLINE, W / 2, H - 19.2, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...SLATE);
    const note = d.testnet
      ? "Testnet demo: unaudited, no real funds. Yield is simulated by a mock adapter."
      : "Figures are read from on-chain events. Verify every transaction on the block explorer.";
    doc.text(note, W / 2, H - 14.6, { align: "center" });

    doc.setFontSize(6.8);
    doc.text(`Downloaded by ${shortAddr(by)}  |  ${reportId}`, M, H - 10.8);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 10.8, { align: "right" });
  }

  doc.save(filename);

  recordReportDownload(treasury, {
    id: reportId,
    at: Date.now(),
    by,
    treasury,
    title,
    period,
    format: "PDF",
    what: `${d.txs.length} transaction${d.txs.length === 1 ? "" : "s"}, ${d.fees.length} fee deduction${d.fees.length === 1 ? "" : "s"}`,
    role: roleOf(treasury, by),
  });
  return true;
}