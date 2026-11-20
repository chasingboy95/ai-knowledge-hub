import assert from 'node:assert/strict';
import test from 'node:test';
import { getAuditTimeWindow } from '../src/utils/auditTimeWindow.ts';

test('refreshing after local midnight uses the new day', () => {
  const evening = new Date(2026, 10, 20, 23, 59);
  const morning = new Date(2026, 10, 21, 0, 1);
  const previous = getAuditTimeWindow('today', evening);
  const refreshed = getAuditTimeWindow('today', morning);
  assert.equal(previous.startTime, new Date(2026, 10, 20).toISOString());
  assert.equal(refreshed.startTime, new Date(2026, 10, 21).toISOString());
  assert.equal(refreshed.endTime, morning.toISOString());
});

test('recent ranges and all-time browsing retain a snapshot end time', () => {
  const now = new Date(2026, 10, 20, 14, 45);
  const endTime = now.toISOString();
  assert.deepEqual(getAuditTimeWindow('7days', now), {
    startTime: new Date(2026, 10, 13, 14, 45).toISOString(),
    endTime,
  });
  assert.deepEqual(getAuditTimeWindow('all', now), { startTime: '', endTime });
  assert.equal(now.toISOString(), endTime);
});
