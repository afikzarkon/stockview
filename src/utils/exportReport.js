// Generates the downloadable Excel/PDF portfolio reports. Library-calling
// glue only - the actual row/number shaping lives in exportData.js (pure,
// unit-tested there). Split into "build the document object" functions
// (buildPortfolioWorkbook / buildPortfolioPdfDoc, both independently
// testable without touching the DOM) and "build + trigger a browser
// download" functions, so tests can exercise the real document-building
// logic without needing a real browser download to happen.
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ALEF_REGULAR_BASE64 } from '../assets/fonts/alefRegularBase64';
import {
  buildSummaryExportRows,
  buildIsraeliStocksExportRows,
  buildAmericanStocksExportRows,
  buildPensionFundsExportRows,
  buildCashFundsExportRows,
  buildBankBalancesExportRows
} from './exportData';

const todayFileStamp = () => new Date().toISOString().slice(0, 10);

function addSheetFromRows(workbook, sheetName, rows) {
  if (!rows || rows.length === 0) return;
  // rightToLeft makes Excel display the sheet in the natural reading
  // direction for Hebrew content (columns flow right-to-left) - purely a
  // display setting, doesn't affect the underlying cell data.
  const worksheet = workbook.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });
  const headers = Object.keys(rows[0]);
  worksheet.columns = headers.map((header) => ({ header, key: header, width: Math.max(12, header.length + 4) }));
  rows.forEach((row) => worksheet.addRow(row));
  worksheet.getRow(1).font = { bold: true };
}

// data: { summary, israeliStocks, americanStocks, pensionFunds, cashFunds, bankBalances }
export function buildPortfolioWorkbook(data) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'StockView';
  workbook.created = new Date();

  addSheetFromRows(workbook, 'סיכום', buildSummaryExportRows(data.summary));
  addSheetFromRows(workbook, 'מניות ישראליות', buildIsraeliStocksExportRows(data.israeliStocks));
  addSheetFromRows(workbook, 'מניות אמריקאיות', buildAmericanStocksExportRows(data.americanStocks));
  addSheetFromRows(workbook, 'קופות גמל', buildPensionFundsExportRows(data.pensionFunds));
  addSheetFromRows(workbook, 'קרנות כספיות', buildCashFundsExportRows(data.cashFunds));
  addSheetFromRows(workbook, 'עוש', buildBankBalancesExportRows(data.bankBalances));

  return workbook;
}

export async function downloadPortfolioExcel(data) {
  const workbook = buildPortfolioWorkbook(data);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `stockview-portfolio-${todayFileStamp()}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// jsPDF's built-in fonts (Helvetica etc.) have no Hebrew glyphs - plain
// Hebrew text renders as garbled Latin-1 characters, confirmed by directly
// generating and inspecting a test PDF during development. Alef-Regular.ttf
// is embedded (SIL OFL 1.1, see assets/fonts/Alef-OFL.txt) specifically to
// fix this; it was verified to cover Hebrew, Latin, digits, and the ₪ sign.
function registerHebrewFont(doc) {
  doc.addFileToVFS('Alef-Regular.ttf', ALEF_REGULAR_BASE64);
  doc.addFont('Alef-Regular.ttf', 'Alef', 'normal');
  doc.setFont('Alef');
}

// jsPDF has no real bidi support, and jspdf-autotable bypasses even
// jsPDF's own (limited) R2L/align handling entirely: for a right-aligned
// cell it computes the X position itself and calls doc.text(text, x, y)
// with no options at all, so nothing ever reorders the characters. A raw
// Hebrew string ends up drawn in storage order (first-typed character
// leftmost) - mirror-reversed for a Hebrew reader. Confirmed against a
// real exported PDF (a user reported garbled/backwards text) and verified
// character-by-character with a Hebrew-alphabet test string before this
// fix, and after.
//
// jsPDF's own R2L/isInputRtl options turned out to be a dead end too -
// they're a blunt whole-string reversal, not true per-run bidi
// segmentation, so they mangle embedded dates/tickers/numbers just as
// badly (confirmed: "2023-01-15" came back as "51-10-3202").
//
// Fix: reverse Hebrew strings ourselves before handing them to jsPDF, so
// plain LTR placement produces the correct visual result - and swap
// paired brackets before reversing (the Unicode Bidi Algorithm's
// mirroring rule, rule L4) so "(₪)" doesn't come out as ")₪(". Left
// completely alone if the string has no Hebrew in it (dates, tickers,
// plain numbers must never be touched). This app's actual export strings
// never mix Hebrew with inline digits/Latin within one string (those
// always land in separate cells or separate text() calls), so this
// simple whole-string approach is correct for every string this file
// actually produces - it deliberately isn't a general bidi implementation.
const HEBREW_CHAR_RANGE = /[֐-׿]/;
const BRACKET_MIRRORS = { '(': ')', ')': '(', '[': ']', ']': '[' };
export function toPdfDisplayText(text) {
  const str = String(text);
  if (!HEBREW_CHAR_RANGE.test(str)) return str;
  const mirrored = str
    .split('')
    .map((ch) => BRACKET_MIRRORS[ch] || ch)
    .join('');
  return mirrored.split('').reverse().join('');
}

function addPdfTable(doc, title, rows, startY) {
  if (!rows || rows.length === 0) return startY;
  // Leave room for the title + at least one table row before the page
  // bottom (A4 height ~297mm); otherwise start the section on a fresh
  // page instead of clipping the title at the bottom edge.
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = startY;
  if (y > pageHeight - 40) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(12);
  doc.text(toPdfDisplayText(title), 196, y, { align: 'right' });
  const startYForTable = y;
  const headers = Object.keys(rows[0]); // raw keys - used for row[h] lookups, must not be mangled
  autoTable(doc, {
    startY: startYForTable + 4,
    head: [headers.map(toPdfDisplayText)],
    body: rows.map((row) => headers.map((h) => toPdfDisplayText(row[h]))),
    // jspdf-autotable defaults header cells to fontStyle 'bold', which
    // silently falls back to a non-Hebrew font since only the 'normal'
    // weight of Alef is registered (confirmed during development: without
    // this override, header text renders as garbled Latin-1 characters,
    // the same failure mode as unregistered Hebrew text entirely).
    styles: { font: 'Alef', fontStyle: 'normal', halign: 'right' },
    headStyles: { font: 'Alef', fontStyle: 'normal', halign: 'right' },
    margin: { right: 14, left: 14 }
  });
  return doc.lastAutoTable.finalY + 12;
}

// data: same shape as buildPortfolioWorkbook. Produces one summary report
// (not the full raw data dump the Excel export gives - a printable
// overview is what a PDF is actually good for; anyone wanting the full
// data should use the Excel export instead).
export function buildPortfolioPdfDoc(data) {
  const doc = new jsPDF();
  registerHebrewFont(doc);

  // Two separate text() calls, not one mixed Hebrew+Latin string - a
  // single string mixing scripts isn't safely handled by toPdfDisplayText
  // either (it's a whole-string reversal, not per-run bidi - see that
  // function's comment). Every string passed to text()/autoTable
  // elsewhere in this file is single-script for the same reason - table
  // cells only ever hold pure Hebrew, a pure ticker, or a pure
  // number/date, never a mix.
  doc.setFontSize(10);
  doc.text('StockView', 14, 15);
  doc.setFontSize(18);
  doc.text(toPdfDisplayText('דוח תיק השקעות'), 196, 18, { align: 'right' });
  doc.setFontSize(10);
  doc.text(todayFileStamp(), 196, 25, { align: 'right' });

  let y = 35;
  y = addPdfTable(doc, 'סיכום', buildSummaryExportRows(data.summary), y);
  y = addPdfTable(doc, 'מניות ישראליות', buildIsraeliStocksExportRows(data.israeliStocks), y);
  y = addPdfTable(doc, 'מניות אמריקאיות', buildAmericanStocksExportRows(data.americanStocks), y);
  y = addPdfTable(doc, 'קופות גמל', buildPensionFundsExportRows(data.pensionFunds), y);
  y = addPdfTable(doc, 'קרנות כספיות', buildCashFundsExportRows(data.cashFunds), y);
  addPdfTable(doc, 'עו"ש', buildBankBalancesExportRows(data.bankBalances), y);

  return doc;
}

export function downloadPortfolioPdf(data) {
  const doc = buildPortfolioPdfDoc(data);
  doc.save(`stockview-portfolio-${todayFileStamp()}.pdf`);
}
