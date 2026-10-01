// Fails if any string tagged brief-approved or brief-draft is not found word for word
// in the creative brief (body text or comments). This is the "never invent" check.
//   npm run verify:copy
// Re-run `npm run extract:brief` first if a new version of the brief has landed.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcFiles = ["docs/source/creative-brief-v1.txt", "docs/source/creative-brief-v1.comments.txt"];
for (const f of srcFiles) if (!existsSync(join(root, f))) {
  console.error(`Missing ${f}. The creative brief .docx is kept out of the public repo: put it in the project root, then run: npm run extract:brief`);
  process.exit(2);
}

// Smart quotes, dashes, bullets, tabs and runs of whitespace are layout, not wording.
const norm = (s) =>
  s
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[• \t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const haystack = norm(srcFiles.map((f) => readFileSync(join(root, f), "utf8")).join("\n"));
const content = JSON.parse(readFileSync(join(root, "src/content/content.json"), "utf8"));

const counts = { "brief-approved": 0, "brief-draft": 0, generated: 0 };
const pending = [];
const failures = [];
const flagged = [];

function visit(node, path) {
  if (Array.isArray(node)) return node.forEach((n, i) => visit(n, `${path}[${i}]`));
  if (node && typeof node === "object") {
    if ("source" in node && "text" in node) return check(node, path);
    for (const [k, v] of Object.entries(node)) visit(v, path ? `${path}.${k}` : k);
  }
}

function check(s, path) {
  counts[s.source] = (counts[s.source] ?? 0) + 1;
  if (s.flags?.length) flagged.push(path);
  if (s.text === null) return pending.push(path);
  if (s.source === "generated") return;
  if (!haystack.includes(norm(s.text))) failures.push({ path, text: s.text, source: s.source });
}

visit(content, "");

console.log("Strings by source:", counts);
console.log(`Pending (text: null): ${pending.length}`);
console.log(`Flagged product/fact claims: ${flagged.length}`);
if (failures.length) {
  console.error(`\n✗ ${failures.length} brief-tagged string(s) NOT found verbatim in the brief:\n`);
  for (const f of failures) console.error(`  ${f.path} [${f.source}]\n    "${f.text}"\n`);
  process.exit(1);
}
console.log("✓ Every brief-approved and brief-draft string appears verbatim in the creative brief.");
