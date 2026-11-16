/**
 * Ready-made places to keep the consent log, for `createConsentLogHandler({ save })`.
 *
 * - `sqlConsentLog`: a table in your own database (Postgres, MySQL or SQLite), through the
 *   query function of the client you already use. Permanent, and the right choice for most
 *   production sites.
 * - `sheetsConsentLog`: rows in a Google Sheet, through a small Apps Script web app (code in
 *   the README). Free and easy to read; fine for smaller sites.
 *
 * Both give you `findByVisitor(id)`: every choice a visitor made, oldest first, so you can
 * show what they agreed to and when.
 */
import type { ConsentRecord } from './index.js';

/** A stored log entry, as returned by `findByVisitor`. */
export interface ConsentLogEntry {
  visitorId: string;
  version: string;
  analytics: boolean;
  marketing: boolean;
  action: string;
  /** When the visitor chose (ISO time, from their browser). */
  chosenAt: string;
  /** When your server received it (ISO time). */
  receivedAt: string;
  page?: string;
}

export interface ConsentLogStore {
  /** Pass to `createConsentLogHandler({ save })`. */
  save: (record: ConsentRecord) => Promise<void>;
  /** Every choice of one visitor (the id in their `ndt_consent` cookie), oldest first. */
  findByVisitor: (visitorId: string) => Promise<ConsentLogEntry[]>;
}

export type SqlDialect = 'postgres' | 'mysql' | 'sqlite';

/**
 * Your database client's query function. Examples:
 * - pg: `(sql, params) => pool.query(sql, params)`
 * - mysql2: `(sql, params) => pool.execute(sql, params)`
 * - Prisma: `(sql, params) => prisma.$queryRawUnsafe(sql, ...params)`
 * - better-sqlite3: `(sql, params) => /^select/i.test(sql) ? db.prepare(sql).all(...params) : db.prepare(sql).run(...params)`
 */
export type QueryFn = (sql: string, params: unknown[]) => unknown | Promise<unknown>;

/** `CREATE TABLE` statement for the consent log. Run it once (or add it to your migrations). */
export function consentLogSchema(dialect: SqlDialect = 'postgres', table = 'consent_log'): string {
  const t = safeTable(table);
  if (dialect === 'mysql') {
    return `CREATE TABLE IF NOT EXISTS ${t} (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  visitor_id VARCHAR(64) NOT NULL,
  version VARCHAR(32) NOT NULL,
  analytics BOOLEAN NOT NULL,
  marketing BOOLEAN NOT NULL,
  action VARCHAR(16) NOT NULL,
  chosen_at DATETIME(3) NOT NULL,
  received_at DATETIME(3) NOT NULL,
  page TEXT NULL,
  INDEX ${t.replace(/\W/g, '_')}_visitor (visitor_id)
);`;
  }
  const id = dialect === 'sqlite' ? 'id INTEGER PRIMARY KEY AUTOINCREMENT' : 'id BIGSERIAL PRIMARY KEY';
  const time = dialect === 'sqlite' ? 'TEXT' : 'TIMESTAMPTZ';
  const bool = dialect === 'sqlite' ? 'INTEGER' : 'BOOLEAN';
  return `CREATE TABLE IF NOT EXISTS ${t} (
  ${id},
  visitor_id VARCHAR(64) NOT NULL,
  version VARCHAR(32) NOT NULL,
  analytics ${bool} NOT NULL,
  marketing ${bool} NOT NULL,
  action VARCHAR(16) NOT NULL,
  chosen_at ${time} NOT NULL,
  received_at ${time} NOT NULL,
  page TEXT
);
CREATE INDEX IF NOT EXISTS ${t.replace(/\W/g, '_')}_visitor ON ${t} (visitor_id);`;
}

function safeTable(table: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(table)) throw new Error(`next-deferred-tags: invalid table name "${table}"`);
  return table;
}

const iso = (ms: number) => new Date(ms).toISOString();

/** Rows from the result shapes of common clients (pg, mysql2, Prisma, SQLite). */
function rowsOf(res: unknown): Record<string, unknown>[] {
  if (Array.isArray(res)) return (Array.isArray(res[0]) ? res[0] : res) as Record<string, unknown>[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown }).rows)) return (res as { rows: Record<string, unknown>[] }).rows;
  return [];
}

const toIso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v).replace(' ', 'T') + (/[zZ+]|[+-]\d\d:?\d\d$/.test(String(v)) ? '' : 'Z')).toISOString());

/**
 * Keep the consent log in a table of your own database.
 *
 * ```ts
 * import { Pool } from 'pg';
 * import { createConsentLogHandler } from 'next-deferred-tags/server';
 * import { sqlConsentLog } from 'next-deferred-tags/server';
 *
 * const pool = new Pool();
 * export const consentLog = sqlConsentLog({ query: (sql, p) => pool.query(sql, p) });
 * export const POST = createConsentLogHandler({ save: consentLog.save });
 * ```
 */
export function sqlConsentLog(opts: { query: QueryFn; dialect?: SqlDialect; table?: string }): ConsentLogStore {
  const dialect = opts.dialect ?? 'postgres';
  const t = safeTable(opts.table ?? 'consent_log');
  const ph = (n: number) => Array.from({ length: n }, (_, i) => (dialect === 'postgres' ? `$${i + 1}` : '?')).join(', ');
  // MySQL DATETIME takes "YYYY-MM-DD HH:MM:SS.mmm"; Postgres and SQLite take ISO strings.
  const time = (ms: number) => (dialect === 'mysql' ? iso(ms).replace('T', ' ').replace('Z', '') : iso(ms));
  const bool = (b: boolean) => (dialect === 'sqlite' ? (b ? 1 : 0) : b);

  return {
    async save(r) {
      await opts.query(
        `INSERT INTO ${t} (visitor_id, version, analytics, marketing, action, chosen_at, received_at, page) VALUES (${ph(8)})`,
        [r.id, r.version, bool(r.analytics), bool(r.marketing), r.action, time(r.ts), time(Date.parse(r.receivedAt)), r.page ?? null],
      );
    },
    async findByVisitor(visitorId) {
      const res = await opts.query(
        `SELECT visitor_id, version, analytics, marketing, action, chosen_at, received_at, page FROM ${t} WHERE visitor_id = ${dialect === 'postgres' ? '$1' : '?'} ORDER BY chosen_at, id`,
        [visitorId],
      );
      return rowsOf(res).map((r) => ({
        visitorId: String(r.visitor_id),
        version: String(r.version),
        analytics: r.analytics === true || r.analytics === 1 || r.analytics === '1',
        marketing: r.marketing === true || r.marketing === 1 || r.marketing === '1',
        action: String(r.action),
        chosenAt: toIso(r.chosen_at),
        receivedAt: toIso(r.received_at),
        page: r.page == null ? undefined : String(r.page),
      }));
    },
  };
}

/**
 * Keep the consent log in a Google Sheet, through the Apps Script web app in the README.
 * `url` is the web app's /exec URL and `secret` the value you set as its SECRET script
 * property. Server only: never expose either to the browser.
 */
export function sheetsConsentLog(opts: { url: string; secret: string }): ConsentLogStore {
  return {
    async save(r) {
      const res = await fetch(opts.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ secret: opts.secret, record: { ...r, chosenAt: iso(r.ts) } }),
        redirect: 'follow',
      });
      const out = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !out?.ok) throw new Error(`Consent sheet did not save the record: ${out?.error ?? res.status}`);
    },
    async findByVisitor(visitorId) {
      const u = new URL(opts.url);
      u.searchParams.set('secret', opts.secret);
      u.searchParams.set('visitor', visitorId);
      const res = await fetch(u, { redirect: 'follow' });
      const out = (await res.json().catch(() => null)) as { ok?: boolean; rows?: ConsentLogEntry[]; error?: string } | null;
      if (!res.ok || !out?.ok) throw new Error(`Consent sheet lookup failed: ${out?.error ?? res.status}`);
      return out.rows ?? [];
    },
  };
}
