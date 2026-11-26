#!/usr/bin/env node
// Checks the mechanically verifiable parts of the docs/rules.md section 12 checklist for every
// Markdown file in docs/. Prints one line per problem and exits 1 if any are found.
// Visual checks (diagram renders, text unchanged after restyling) still need a human.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const docsDir = path.join(root, process.argv[2] ?? 'docs');
const RULES = path.join(root, 'docs', 'rules.md');

const BURGUNDY = '<span style="color:#B84D73">';
const TAN = '<span style="color:#9A7B5F">';
const CLASS_DEFS = new Set([
  'classDef kiro fill:#6B2038,stroke:#6B2038,color:#FAF7F2',
  'classDef gd fill:#E7DCCB,stroke:#6B2038,color:#242424',
  'classDef game fill:#FAF7F2,stroke:#9A7B5F,color:#242424',
]);
const CALLOUTS = new Set(['IMPORTANT', 'TIP', 'WARNING', 'NOTE', 'CAUTION']);

/** Icons allowed on H2 headings: the second column of the rules.md section 2 table. */
export function allowedIcons(rulesText) {
  const icons = new Set();
  let inTable = false;
  for (const line of rulesText.split('\n')) {
    if (line.startsWith('| Heading | Icon |')) inTable = true;
    else if (inTable && !line.startsWith('|')) break;
    else if (inTable && !line.startsWith('|---')) {
      const icon = line.split('|')[2]?.trim();
      if (icon) icons.add(icon);
    }
  }
  return icons;
}

export function checkDoc(file, text, icons, { isRulesFile = false } = {}) {
  const problems = [];
  const lines = text.split('\n');
  const report = (n, msg) => problems.push(`${path.relative(root, file)}:${n}: ${msg}`);
  let fence = null;
  let fenceStart = 0;
  let mermaid = [];
  let h1 = 0;
  let calloutsInSection = 0;
  let usesIconsOrCharts = false;
  let inLegend = false; // the reading-key table explains P0/P1/P2 in plain text

  const finishMermaid = (startLine) => {
    const kind = mermaid[0]?.trim().split(/\s+/)[0] ?? '';
    const styled = kind === 'flowchart' || kind === 'stateDiagram-v2';
    const defs = mermaid.map((l) => l.trim()).filter((l) => l.startsWith('classDef'));
    for (const d of defs) if (!CLASS_DEFS.has(d)) report(startLine, `classDef not copied exactly from rules.md section 7: "${d}"`);
    if (styled && defs.length === 0) report(startLine, `${kind} diagram is missing the rules.md section 7 classes`);
    if (!styled && defs.length > 0) report(startLine, `${kind} charts must keep default colors (no classDef)`);
    if (mermaid.some((l) => /^\s*style\s/.test(l) || /fill:#(?!6B2038|E7DCCB|FAF7F2)/i.test(l))) report(startLine, 'diagram uses colors outside the palette');
    usesIconsOrCharts = true;
  };

  lines.forEach((line, i) => {
    const n = i + 1;
    const fenceMatch = line.match(/^(```+)(\w*)/);
    if (fenceMatch) {
      if (fence === null) {
        fence = fenceMatch[2] || 'text';
        fenceStart = n;
        mermaid = [];
      } else {
        if (fence === 'mermaid') finishMermaid(fenceStart);
        fence = null;
      }
      return;
    }
    if (fence !== null) {
      if (fence === 'mermaid') mermaid.push(line);
      return;
    }
    if (/^# /.test(line)) {
      h1++;
      if (!line.startsWith(`# ${BURGUNDY}🧬 `)) report(n, 'H1 must be burgundy and start with the 🧬 icon');
    } else if (/^## /.test(line)) {
      calloutsInSection = 0;
      if (!line.startsWith(`## ${BURGUNDY}`)) report(n, 'H2 must use burgundy text (#B84D73)');
      else if (!isRulesFile) {
        const icon = line.slice(`## ${BURGUNDY}`.length).split(' ')[0];
        if (!icons.has(icon)) report(n, `H2 icon "${icon}" is not in the rules.md section 2 table (add a row first)`);
        usesIconsOrCharts = true;
      }
    } else if (/^### /.test(line)) {
      if (!line.startsWith(`### ${TAN}`)) report(n, 'H3 must use tan text (#9A7B5F)');
    }
    const callout = line.match(/^> \[!(\w+)\]/);
    if (callout) {
      if (!CALLOUTS.has(callout[1])) report(n, `callout type ${callout[1]} is not one of ${[...CALLOUTS].join(', ')}`);
      if (++calloutsInSection > 1) report(n, 'more than one callout in this section');
    }
    if (/^\| Symbol \| Meaning \|/.test(line)) inLegend = true;
    else if (!line.startsWith('|')) inLegend = false;
    if (!inLegend && /\|\s*(🔴|🟠|🔵)?\s*P[012]\s*\|/.test(line)) report(n, 'priority cell must use the rules.md section 4 format');
  });
  if (fence !== null) report(fenceStart, 'unclosed code fence');
  if (h1 !== 1) report(1, `expected exactly one H1, found ${h1}`);
  if (usesIconsOrCharts && !isRulesFile && !/Reading key/i.test(text)) report(1, 'document uses icons or charts but has no reading key');
  return problems;
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isMain) {
  const icons = allowedIcons(readFileSync(RULES, 'utf8'));
  const files = readdirSync(docsDir).filter((f) => f.endsWith('.md')).map((f) => path.join(docsDir, f));
  const problems = files.flatMap((f) => checkDoc(f, readFileSync(f, 'utf8'), icons, { isRulesFile: path.resolve(f) === RULES }));
  for (const p of problems) console.error(p);
  console.log(`check-docs: ${files.length} file(s), ${problems.length} problem(s)`);
  process.exit(problems.length ? 1 : 0);
}
