import { existsSync } from 'node:fs';
import path from 'node:path';
// Lay out the supplied original inside a clipped badge; the source image is unchanged.
export function drawBrand(doc: PDFKit.PDFDocument, x: number, y: number, width: number) {
  const logo = [
    process.env.BRANDING_LOGO_PATH,
    path.resolve('assets/branding/oryx-logo.png'),
    path.resolve('../../assets/branding/oryx-logo.png'),
  ].find((p) => p && existsSync(p));
  if (!logo) return;
  doc.save().roundedRect(x, y, width, width, 8).fill('#191e1c');
  doc.roundedRect(x, y, width, width, 8).clip();
  doc.image(logo, x - width * 0.6, y - width * 0.6, { width: width * 2.2, height: width * 2.2 });
  doc.restore();
}
