// Server-only Upstash Redis (REST) singleton. Fail-loud if the env is missing; never log the token.
import "server-only";
import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  throw new Error("redis/client.ts: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set");
}

export const redis = new Redis({ url, token });
