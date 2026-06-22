import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli.ts" }, // src/cli.ts begins with: #!/usr/bin/env node
  format: ["esm"],
  target: "node18",
  clean: true,
  shims: true, // __dirname / import.meta.url interop
  dts: false, // a CLI doesn't ship types
  sourcemap: true,
  // tsup excludes dependencies/peerDependencies by default; force the workspace pkg
  // INTO the bundle so the published artifact has zero workspace deps:
  noExternal: [/^@tokenboard\/contracts/],
});
