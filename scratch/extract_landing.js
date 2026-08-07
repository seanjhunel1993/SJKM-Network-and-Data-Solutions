// Extract clean HTML from the browser "view-source" saved file
const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'view-source_https___sjkmdatalink.isproph.com_#top.html');
const html = fs.readFileSync(srcPath, 'utf8');

// The view-source wraps the actual page in HTML-escaped spans inside <table>.
// We need to extract the .html-tag/.html-attribute-value/.html-text content and unescape it.

// Strategy: pull out the inner HTML of each <td class="line-content">...</td>
// then strip the span tags and HTML-unescape.

function unescapeHtml(s) {
  return s
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// Extract all line-content cells
const lineContentRegex = /<td class="line-content">([\s\S]*?)<\/td>/g;
let match;
let cleanLines = [];
let lineNum = 0;

while ((match = lineContentRegex.exec(html)) !== null) {
  lineNum++;
  let cell = match[1];
  // Remove all span tags and their attributes, keep text content
  cell = cell.replace(/<span[^>]*>/g, '').replace(/<\/span>/g, '');
  // Remove link/open tags
  cell = cell.replace(/<a[^>]*>/g, '').replace(/<\/a>/g, '');
  // Remove other wrapper tags
  cell = cell.replace(/<[^>]+>/g, '');
  // Unescape entities
  cell = unescapeHtml(cell);
  cleanLines.push(cell);
}

const cleanHtml = cleanLines.join('\n');

// Save to a clean file in scratch
const outPath = path.join(__dirname, 'landing_clean.html');
fs.writeFileSync(outPath, cleanHtml, 'utf8');
console.log(`Extracted ${cleanLines.length} lines, ${cleanHtml.length} chars → ${outPath}`);

// Print a preview (first 200 lines)
console.log('\n===== PREVIEW (first 150 lines) =====\n');
console.log(cleanLines.slice(0, 150).join('\n'));
