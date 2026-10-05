const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/owner-phase1b-security-a.sql'), 'utf8');
const rollback = fs.readFileSync(path.join(root, 'supabase/owner-phase1b-security-a-rollback.sql'), 'utf8');

test('Migration A snapshots policies and grants before dropping any policy', () => {
  assert.match(migration, /create table owner_phase1b_internal\.policy_backup/i);
  assert.match(migration, /create table owner_phase1b_internal\.grant_backup/i);
  assert.ok(migration.indexOf('insert into owner_phase1b_internal.policy_backup') < migration.indexOf("execute format('drop policy"));
  assert.match(migration, /expected 43 policies/i);
  assert.match(rollback, /owner_phase1b_internal\.policy_backup/);
  assert.match(rollback, /owner_phase1b_internal\.grant_backup/);
});

test('Migration A preserves public request INSERT and public reads', () => {
  assert.doesNotMatch(migration, /revoke\s+insert\s+on\s+public\.business_requests/i);
  assert.doesNotMatch(migration, /revoke\s+select\s+on\s+public\.businesses/i);
  assert.doesNotMatch(migration, /drop policy[^\n]*public.*read/i);
});

test('Migration A replaces admin browser writes on businesses, coupons and posts', () => {
  for (const table of ['businesses', 'coupons', 'posts']) {
    for (const operation of ['insert', 'update', 'delete']) {
      assert.match(migration, new RegExp(`create policy phase1b_${table}_admin_${operation}`, 'i'));
      assert.match(rollback, new RegExp(`drop policy phase1b_${table}_admin_${operation}`, 'i'));
    }
  }
  assert.match(migration, /p\.role in \('super_admin','regional_editor'\)/);
});

test('Migration A leaves community signed-upload bucket and specials policies alone', () => {
  assert.doesNotMatch(migration, /drop policy[^\n]*community-images/i);
  assert.doesNotMatch(migration, /create policy[^\n]*business_specials/i);
  assert.doesNotMatch(migration, /create policy[^\n]*business_special_items/i);
});

test('Migration A revokes public-table TRUNCATE but leaves managed Storage TRUNCATE untouched', () => {
  assert.match(migration, /revoke truncate on public\.businesses/);
  const revokeSection = migration.match(/revoke truncate on ([\s\S]*?)from public,anon,authenticated/i);
  assert.ok(revokeSection);
  assert.doesNotMatch(revokeSection[1], /storage\.objects/i);
  const truncateCheck = migration.match(/foreach target in array array\[([\s\S]*?)\] loop/i);
  assert.ok(truncateCheck);
  assert.doesNotMatch(truncateCheck[1], /storage\.objects/i);
  assert.match(rollback, /privilege_type='TRUNCATE' and table_schema='public'/);
  assert.doesNotMatch(rollback, /revoke truncate on storage\.objects/i);
  assert.match(rollback, /grant %s on %I\.%I to %s%s/);
});
