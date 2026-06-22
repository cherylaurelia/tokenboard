// Custom Drizzle column type for Postgres bytea (raw bytes).
// code_hash / token_hash / request_hash are raw sha256 bytes (NOT hex text).
import { customType } from "drizzle-orm/pg-core";

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});
