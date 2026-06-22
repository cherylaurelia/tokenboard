import snapshot from "./litellm-snapshot.json" with { type: "json" };

// A single model's per-token costs (LiteLLM field names). All optional; a token-priced
// model always has input_cost_per_token (the vendor trim guarantees it). The two
// cache-creation fields map to the server's abstract bucket names:
//   cache_creation_input_token_cost          == cache_write_5m  (1.25x input)
//   cache_creation_input_token_cost_above_1hr == cache_write_1h  (2x input)
export interface PriceEntry {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_read_input_token_cost?: number;
  cache_creation_input_token_cost?: number;
  cache_creation_input_token_cost_above_1hr?: number;
  litellm_provider?: string;
}

export type PriceTable = Record<string, PriceEntry>;

const SENTINEL = "claude-opus-4-8";

// Edge loader for the bundled snapshot. Fails LOUD if the table is empty or missing the
// sentinel model — so a forgotten vendor step can never ship a silently-priceless CLI
// (the cost estimate would read $0 everywhere instead of erroring).
export function loadPriceTable(): PriceTable {
  const table = snapshot as PriceTable;
  if (!table || typeof table !== "object" || Object.keys(table).length === 0) {
    throw new Error(
      "litellm price snapshot is empty — run `pnpm --filter @tokenboard/cli vendor-prices`",
    );
  }
  if (!table[SENTINEL]) {
    throw new Error(
      `litellm price snapshot is missing sentinel model "${SENTINEL}" — snapshot looks corrupt; re-run vendor-prices`,
    );
  }
  return table;
}
