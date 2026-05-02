import { createRequire } from "node:module";
import type PDFKit from "pdfkit";

const requireFont = createRequire(__filename);

/** Имена зарегистрированных шрифтов для PDFKit (Unicode, не WinAnsi Helvetica). */
export const PDF_FONT_UNICODE = "DejaVuSans" as const;
export const PDF_FONT_UNICODE_BOLD = "DejaVuSans-Bold" as const;

/**
 * Регистрирует TTF DejaVu Sans на документе PDFKit.
 * Стандартные Helvetica в PDFKit не покрывают AZ/UTF-8.
 */
export function registerUnicodeFonts(doc: PDFKit.PDFDocument): void {
  const regular = requireFont.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf");
  const bold = requireFont.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf");
  doc.registerFont(PDF_FONT_UNICODE, regular);
  doc.registerFont(PDF_FONT_UNICODE_BOLD, bold);
}
