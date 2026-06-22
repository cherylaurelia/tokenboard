import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli.ts" }, // src/cli.ts begins with: #!/usr/bin/env node
  format: ["esm"],
  target: "node18",
  clean: true,
  shims: true, // __dirname / import.meta.url interop
  dts: false, // a CLI doesn't ship types
  sourcemap: true,
  // tsup excludes dependencies by default; force the workspace pkg AND the render libs
  // INTO the bundle so the published artifact has zero workspace/runtime deps except zod.
  // (zod stays external — it's a real published dependency the inlined contracts import.)
  // The litellm-snapshot.json import is inlined automatically (resolveJsonModule).
  noExternal: [/^@tokenboard\/contracts/, "citty", "picocolors", "string-width", "cli-truncate"],
});
