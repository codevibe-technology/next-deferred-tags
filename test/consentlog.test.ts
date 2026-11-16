import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { consentLogSchema, sheetsConsentLog, sqlConsentLog } from '../src/server/consentLog.js';
import { createConsentLogHandler, type ConsentRecord } from '../src/server/index.js';

const rec = (over: Partial<ConsentRecord> = {}): ConsentRecord => ({
  id: 'visitor-0001',
  version: '1',
  ts: Date.parse('2026-11-16T08:00:00.000Z'),
  analytics: true,
  marketing: false,
  action: 'custom',
  receivedAt: '2026-11-16T08:00:01.000Z',
  page: 'https://example.com/',
  ...over,
});

const require = createRequire(import.meta.url);
let sqlite: { DatabaseSync: new (p: string) => any } | null = null;
try {
  sqlite = require('node:sqlite');
} catch {
  sqlite = null; // Node 18/20 without node:sqlite
}

test('SQLite: the schema works, records are saved and found by visitor, oldest first', { skip: !sqlite && 'node:sqlite not available' }, async () => {
  const db = new sqlite!.DatabaseSync(':memory:');
  db.exec(consentLogSchema('sqlite'));
  const query = (sql: string, p: unknown[]) => (/^select/i.test(sql) ? db.prepare(sql).all(...p) : db.prepare(sql).run(...p));
  const log = sqlConsentLog({ query, dialect: 'sqlite' });
  await log.save(rec({ ts: Date.parse('2026-11-16T09:00:00.000Z'), marketing: true, action: 'accept_all' }));
  await log.save(rec());
  await log.save(rec({ id: 'someone-else-01' }));
  const rows = await log.findByVisitor('visitor-0001');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { visitorId: 'visitor-0001', version: '1', analytics: true, marketing: false, action: 'custom', chosenAt: '2026-11-16T08:00:00.000Z', receivedAt: '2026-11-16T08:00:01.000Z', page: 'https://example.com/' });
  assert.equal(rows[1].action, 'accept_all');
  assert.equal(rows[1].marketing, true);
});

test('the handler stores into the SQL log end to end', { skip: !sqlite && 'node:sqlite not available' }, async () => {
  const db = new sqlite!.DatabaseSync(':memory:');
  db.exec(consentLogSchema('sqlite'));
  const log = sqlConsentLog({ query: (sql, p) => (/^select/i.test(sql) ? db.prepare(sql).all(...p) : db.prepare(sql).run(...p)), dialect: 'sqlite' });
  const POST = createConsentLogHandler({ save: log.save });
  const res = await POST(new Request('https://x.test/api/consent', { method: 'POST', body: JSON.stringify({ id: 'visitor-0002', version: '1', ts: 1, analytics: false, marketing: false, action: 'reject_all' }) }));
  assert.equal(res.status, 204);
  assert.equal((await log.findByVisitor('visitor-0002'))[0].action, 'reject_all');
});

test('Postgres and MySQL get their own placeholders, types and time format', async () => {
  const calls: Array<[string, unknown[]]> = [];
  const pg = sqlConsentLog({ query: (s, p) => (calls.push([s, p]), { rows: [] }) });
  await pg.save(rec());
  assert.match(calls[0][0], /VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8\)/);
  assert.deepEqual(calls[0][1].slice(2, 6), [true, false, 'custom', '2026-11-16T08:00:00.000Z']);
  const my = sqlConsentLog({ query: (s, p) => (calls.push([s, p]), [[{ visitor_id: 'v', version: '1', analytics: 1, marketing: 0, action: 'custom', chosen_at: new Date('2026-11-16T08:00:00Z'), received_at: '2026-11-16 08:00:01.000', page: null }], []]), dialect: 'mysql' });
  await my.save(rec());
  assert.match(calls[1][0], /VALUES \(\?, \?, \?, \?, \?, \?, \?, \?\)/);
  assert.equal(calls[1][1][5], '2026-11-16 08:00:00.000');
  const rows = await my.findByVisitor('v');
  assert.deepEqual(rows[0], { visitorId: 'v', version: '1', analytics: true, marketing: false, action: 'custom', chosenAt: '2026-11-16T08:00:00.000Z', receivedAt: '2026-11-16T08:00:01.000Z', page: undefined });
  assert.match(consentLogSchema('mysql'), /DATETIME\(3\)/);
  assert.match(consentLogSchema('postgres'), /TIMESTAMPTZ/);
  assert.throws(() => sqlConsentLog({ query: () => null, table: 'x; drop table y' }));
});

/** Run examples/consent-log-sheet/Code.gs against a fake spreadsheet. */
function appsScript(secret: string) {
  const rows: unknown[][] = [];
  const sheet = {
    getLastRow: () => rows.length,
    appendRow: (r: unknown[]) => void rows.push(r.map((v) => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v))),
    setFrozenRows() {},
    getRange: () => ({ setFontWeight() {} }),
    getDataRange: () => ({ getValues: () => rows }),
  };
  const ctx: Record<string, unknown> = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => secret }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s: string) => ({ setMimeType: () => s }) },
    JSON,
    Date,
    String,
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync('examples/consent-log-sheet/Code.gs', 'utf8'), ctx);
  const fetch = async (url: string | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    const out =
      init?.method === 'POST'
        ? (ctx.doPost as (e: unknown) => string)({ postData: { contents: init.body } })
        : (ctx.doGet as (e: unknown) => string)({ parameter: Object.fromEntries(u.searchParams) });
    return new Response(out, { status: 200 });
  };
  return { rows, fetch };
}

test('Google Sheet: the Apps Script appends rows and finds them by visitor', async () => {
  const sim = appsScript('s3cret');
  const orig = globalThis.fetch;
  globalThis.fetch = sim.fetch as typeof fetch;
  try {
    const log = sheetsConsentLog({ url: 'https://script.google.com/macros/s/X/exec', secret: 's3cret' });
    await log.save(rec());
    await log.save(rec({ id: 'other-visitor', marketing: true }));
    assert.deepEqual(Array.from(sim.rows[0]), ['Received at', 'Chosen at', 'Visitor id', 'Version', 'Analytics', 'Marketing', 'Action', 'Page']);
    assert.equal(sim.rows.length, 3);
    const found = await log.findByVisitor('visitor-0001');
    assert.equal(found.length, 1);
    assert.equal(found[0].chosenAt, '2026-11-16T08:00:00.000Z');
    assert.equal(found[0].marketing, false);
    const wrong = sheetsConsentLog({ url: 'https://script.google.com/macros/s/X/exec', secret: 'nope' });
    await assert.rejects(() => wrong.save(rec()), /unauthorised/);
    await assert.rejects(() => wrong.findByVisitor('visitor-0001'), /unauthorised/);
  } finally {
    globalThis.fetch = orig;
  }
});
