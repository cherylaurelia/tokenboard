// web/src/db/schema.ts
// Drizzle pgTable defs MIRRORING the authoritative SQL in drizzle/0000_init.sql.
// These are for TYPED QUERIES ONLY — the SQL is the source of truth. We never run
// bare `drizzle-kit generate` (which would diff TS->DDL) or `drizzle-kit push`.
// Drift guard: after migrate, `drizzle-kit check` vs the dev DB (DB is the truth).
//
// Note on application reads: cost_usd is numeric(14,6) modeled as a string here —
// application/aggregation code MUST treat it as a string/decimal (never coerce to a
// JS number) to avoid float drift; bigint columns are mode:"bigint".

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  bigint,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  jsonb,
  char,
  primaryKey,
  unique,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { citext } from "./citext";
import { bytea } from "./bytea";

// ---- enums ----
export const communityType = pgEnum("community_type", ["community", "company"]);
export const joinPolicy = pgEnum("join_policy", ["open", "code", "email_domain"]);
export const visibility = pgEnum("visibility", ["public", "unlisted", "private"]);
export const memberRole = pgEnum("member_role", ["member", "admin", "owner"]);
export const accountProvider = pgEnum("account_provider", ["github", "x"]);
export const deviceStatus = pgEnum("device_status", ["active", "revoked"]);

// public.users.id references auth.users(id). We do NOT model the auth schema in
// Drizzle; the FK is enforced by the SQL migration. Declared without a default.
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    handle: citext("handle").notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    githubId: bigint("github_id", { mode: "bigint" }).notNull(),
    githubLogin: citext("github_login"),
    bannedAt: timestamp("banned_at", { withTimezone: true }),
    isAdmin: boolean("is_admin").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("users_handle_key").on(t.handle),
    unique("users_github_id_key").on(t.githubId),
  ],
);

export const linkedAccounts = pgTable(
  "linked_accounts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: accountProvider("provider").notNull(),
    providerUid: text("provider_uid").notNull(),
    providerHandle: citext("provider_handle"),
    accessToken: text("access_token"),
    scopes: text("scopes").array(),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("linked_accounts_provider_uid_key").on(t.provider, t.providerUid),
    unique("linked_accounts_user_provider_key").on(t.userId, t.provider),
  ],
);

export const communities = pgTable(
  "communities",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    type: communityType("type").notNull(),
    slug: citext("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    joinPolicy: joinPolicy("join_policy").notNull(),
    visibility: visibility("visibility").notNull().default("public"),
    joinCode: char("join_code", { length: 6 }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("communities_slug_key").on(t.slug),
    unique("communities_join_code_key").on(t.joinCode),
    check(
      "communities_company_is_email_domain",
      sql`${t.type} <> 'company' or ${t.joinPolicy} = 'email_domain'`,
    ),
    check(
      "communities_code_present",
      sql`${t.joinPolicy} <> 'code' or ${t.joinCode} is not null`,
    ),
    index("communities_type_visibility_idx").on(t.type, t.visibility),
  ],
);

export const communityEmailDomains = pgTable(
  "community_email_domains",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    domain: citext("domain").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("community_email_domains_domain_key").on(t.domain),
    index("community_email_domains_community_idx").on(t.communityId),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("member"),
    joinedVia: text("joined_via").notNull(),
    verifiedVia: text("verified_via"),
    reverifyDue: timestamp("reverify_due", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("memberships_user_community_key").on(t.userId, t.communityId),
    index("memberships_community_idx").on(t.communityId),
    index("memberships_user_idx").on(t.userId),
  ],
);

export const emailVerifications = pgTable(
  "email_verifications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: citext("email").notNull(),
    domain: citext("domain").notNull(),
    codeHash: bytea("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("email_verifications_code_hash_key").on(t.codeHash),
    index("email_verifications_user_idx").on(t.userId),
    index("email_verifications_pending_idx")
      .on(t.userId, t.domain)
      .where(sql`${t.consumedAt} is null`), // PARTIAL
  ],
);

export const deviceGrants = pgTable(
  "device_grants",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    deviceCode: text("device_code").notNull(),
    userCode: char("user_code", { length: 9 }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    machineHash: text("machine_hash"),
    status: text("status").notNull().default("pending"),
    intervalSec: integer("interval_sec").notNull().default(5),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Phase 4 (0001): transient raw "tbd_" ingest token, held ONLY between approve and the
    // CLI's first poll, then NULLed in the same atomic consume that flips to 'complete'.
    // The durable record (ingest_devices.token_hash) is hash-only. device_grants is
    // service_role-only + RLS fail-closed, so this is never client-selectable.
    ingestTokenOnce: text("ingest_token_once"),
    // Phase 4 (0001): per-grant poll timing for deterministic slow_down (no client clock).
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
  },
  (t) => [
    unique("device_grants_device_code_key").on(t.deviceCode),
    unique("device_grants_user_code_key").on(t.userCode),
  ],
);

export const ingestDevices = pgTable(
  "ingest_devices",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: bytea("token_hash").notNull(),
    label: text("label"),
    machineHash: text("machine_hash"),
    status: deviceStatus("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    unique("ingest_devices_token_hash_key").on(t.tokenHash),
    index("ingest_devices_user_idx")
      .on(t.userId)
      .where(sql`${t.status} = 'active'`), // PARTIAL
  ],
);

export const syncRequests = pgTable(
  "sync_requests",
  {
    idempotencyKey: text("idempotency_key").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestHash: bytea("request_hash").notNull(),
    responseJson: jsonb("response_json").notNull(),
    status: text("status").notNull().default("processing"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sync_requests_user_idx").on(t.userId, t.createdAt)],
);

// usage_day — composite 5-col PK; device_id references ingest_devices (declared above).
export const usageDay = pgTable(
  "usage_day",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => ingestDevices.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    tool: text("tool").notNull(),
    model: text("model").notNull(),
    inputTokens: bigint("input_tokens", { mode: "bigint" }).notNull().default(0n),
    outputTokens: bigint("output_tokens", { mode: "bigint" }).notNull().default(0n),
    cacheReadTokens: bigint("cache_read_tokens", { mode: "bigint" }).notNull().default(0n),
    cacheCreate5m: bigint("cache_create_5m", { mode: "bigint" }).notNull().default(0n),
    cacheCreate1h: bigint("cache_create_1h", { mode: "bigint" }).notNull().default(0n),
    tokens: bigint("tokens", { mode: "bigint" }).notNull().default(0n),
    costUsd: numeric("cost_usd", { precision: 14, scale: 6 }).notNull().default("0"),
    priceTableVersion: text("price_table_version").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      name: "usage_day_pkey",
      columns: [t.userId, t.deviceId, t.date, t.tool, t.model],
    }),
    index("usage_day_date_idx").on(t.date),
    index("usage_day_user_date_idx").on(t.userId, t.date),
  ],
);

// usage_day_total — 2-col PK (user_id, date); cross-device SUM, board score source.
export const usageDayTotal = pgTable(
  "usage_day_total",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    tokens: bigint("tokens", { mode: "bigint" }).notNull().default(0n),
    costUsd: numeric("cost_usd", { precision: 14, scale: 6 }).notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "usage_day_total_pkey", columns: [t.userId, t.date] }),
    index("usage_day_total_date_idx").on(t.date),
  ],
);
