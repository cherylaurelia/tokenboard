// Custom Drizzle column type for Postgres citext (case-insensitive text).
// Used for handles, logins, slugs, domains, emails, provider_handle.
import { customType } from "drizzle-orm/pg-core";

export const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return "citext";
  },
});
