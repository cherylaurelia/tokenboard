import { normalizedRecordSchema } from "@tokenboard/contracts";
import { collectLocalRecords } from "./preview.js";

// `tokenboard show-data` — the DRY-RUN trust unlock (DESIGN §10/§12), shipped BEFORE any
// upload path. Runs the SAME collect->normalize->aggregate pipeline, VALIDATES every
// record against the contracts schema, and prints the EXACT NormalizedRecord[] that WOULD
// upload. Nothing is sent (Phase 2 has no upload path at all).
//
// Validation is fail-loud (code.md): a record that fails the schema is a PARSER BUG —
// print the offending record + issues and exit non-zero, never silently drop. This makes
// the dry-run a real guard and proves the rendered preview numbers are on-spec.
export async function runShowData(): Promise<void> {
  const { records, ccusageSkipped, npxAvailable } = await collectLocalRecords();

  const failures: { record: unknown; issues: unknown }[] = [];
  for (const rec of records) {
    const result = normalizedRecordSchema.safeParse(rec);
    if (!result.success) failures.push({ record: rec, issues: result.error.issues });
  }

  process.stdout.write(
    "  tokenboard show-data — dry run. This is EXACTLY what a future `sync` would upload.\n" +
      "  Counts only — no prompts, code, file paths, or repo names. NOTHING is uploaded in this release.\n\n",
  );

  if (failures.length > 0) {
    process.stderr.write(
      `show-data: ${failures.length} record(s) failed contract validation (parser bug):\n` +
        JSON.stringify(failures, null, 2) +
        "\n",
    );
    process.exit(1);
  }

  process.stdout.write(JSON.stringify(records, null, 2) + "\n");

  if (!npxAvailable) {
    process.stdout.write("\n  (npx not found — ccusage long-tail skipped; Claude Code data shown above)\n");
  } else if (ccusageSkipped.length > 0) {
    process.stdout.write(`\n  (ccusage sources skipped: ${ccusageSkipped.join(", ")})\n`);
  }
}
