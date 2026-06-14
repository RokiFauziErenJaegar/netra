'use strict';

/**
 * Konversi dokumen UAT (Markdown) menjadi DOCX dan PDF.
 *   - Markdown -> HTML  : markdown-it
 *   - HTML     -> DOCX  : html-to-docx (murni JS)
 *   - HTML     -> PDF   : Google Chrome headless (--print-to-pdf)
 *
 * Jalankan: node scripts/convert-docs.js
 * Output di: docs/uat/export/{docx,pdf}
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const MarkdownIt = require('markdown-it');
const HTMLtoDOCX = require('html-to-docx');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'docs', 'uat');
const OUT_DOCX = path.join(SRC_DIR, 'export', 'docx');
const OUT_PDF = path.join(SRC_DIR, 'export', 'pdf');
const TMP = path.join(SRC_DIR, 'export', '_html');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const CHROME = CHROME_CANDIDATES.find((p) => fs.existsSync(p));

const md = new MarkdownIt({ html: true, linkify: true, typographer: true });

const CSS = `
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.5; }
  h1 { font-size: 19pt; border-bottom: 2px solid #0b5fff; padding-bottom: 6px; margin: 0 0 14px; }
  h2 { font-size: 14pt; color: #0b3a8c; border-bottom: 1px solid #d0d7de; padding-bottom: 4px; margin: 20px 0 10px; }
  h3 { font-size: 12pt; color: #0b3a8c; margin: 16px 0 6px; }
  p { margin: 6px 0; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 10pt; }
  th, td { border: 1px solid #9aa4b2; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #eaf0fb; font-weight: 600; }
  code { font-family: 'Consolas','Courier New',monospace; background: #f1f3f5; padding: 1px 4px; border-radius: 3px; font-size: 9.5pt; }
  pre { background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px; padding: 10px 12px; overflow: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 4px solid #0b5fff; background: #f4f8ff; margin: 10px 0; padding: 6px 12px; color: #333; }
  a { color: #0b5fff; text-decoration: none; }
  hr { border: none; border-top: 1px solid #d0d7de; margin: 16px 0; }
  ul, ol { margin: 6px 0 6px 22px; }
`;

function wrapHtml(title, bodyHtml) {
  // border="1" membantu html-to-docx menggambar garis tabel di Word.
  const withBorders = bodyHtml.replace(/<table>/g, '<table border="1" cellspacing="0" cellpadding="4">');
  return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">
<title>${title}</title><style>${CSS}</style></head><body>${withBorders}</body></html>`;
}

async function main() {
  [OUT_DOCX, OUT_PDF, TMP].forEach((d) => fs.mkdirSync(d, { recursive: true }));

  const files = fs.readdirSync(SRC_DIR).filter((f) => f.toLowerCase().endsWith('.md')).sort();
  if (!files.length) { console.error('Tidak ada berkas .md di', SRC_DIR); process.exit(1); }

  console.log(`Converter dokumen UAT — ${files.length} berkas`);
  console.log(`PDF engine: ${CHROME || '(tidak ditemukan — PDF dilewati)'}\n`);

  for (const file of files) {
    const base = file.replace(/\.md$/i, '');
    const mdText = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
    const html = wrapHtml(base, md.render(mdText));
    const htmlPath = path.join(TMP, base + '.html');
    fs.writeFileSync(htmlPath, html, 'utf8');

    // DOCX
    try {
      const buf = await HTMLtoDOCX(html, null, {
        orientation: 'portrait',
        margins: { top: 720, right: 640, bottom: 720, left: 640 },
        table: { row: { cantSplit: true } },
        footer: false,
        pageNumber: false
      });
      fs.writeFileSync(path.join(OUT_DOCX, base + '.docx'), buf);
      console.log(`  DOCX  ✓ ${base}.docx`);
    } catch (e) {
      console.log(`  DOCX  ✗ ${base} -> ${e.message}`);
    }

    // PDF via Chrome/Edge headless
    if (CHROME) {
      const pdfPath = path.join(OUT_PDF, base + '.pdf');
      const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-'));
      try {
        execFileSync(CHROME, [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
          '--no-default-browser-check', `--user-data-dir=${userDir}`,
          '--no-pdf-header-footer',
          `--print-to-pdf=${pdfPath}`,
          'file:///' + htmlPath.replace(/\\/g, '/')
        ], { stdio: 'ignore', timeout: 60000 });
        if (fs.existsSync(pdfPath)) console.log(`  PDF   ✓ ${base}.pdf`);
        else console.log(`  PDF   ✗ ${base} -> file tidak terbentuk`);
      } catch (e) {
        console.log(`  PDF   ✗ ${base} -> ${e.message}`);
      } finally {
        try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (_) {}
      }
    }
  }

  console.log(`\nSelesai. Output:\n  ${path.relative(ROOT, OUT_DOCX)}\n  ${path.relative(ROOT, OUT_PDF)}`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(2); });
