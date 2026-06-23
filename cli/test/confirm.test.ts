import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYesNo } from "../src/prompt/confirm.js";

test("only y / yes (case-insensitive, trimmed) is yes", () => {
  for (const a of ["y", "Y", "yes", "YES", "Yes", "  y  ", "\tyes\n"]) {
    assert.equal(parseYesNo(a), true, `expected '${a}' -> true`);
  }
});

test("everything else is no (default-no)", () => {
  for (const a of ["", " ", "n", "N", "no", "nope", "yeah", "ya", "1", "true", "yess", "y e s"]) {
    assert.equal(parseYesNo(a), false, `expected '${a}' -> false`);
  }
});
