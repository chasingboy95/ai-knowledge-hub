export function getAuditTimeWindow(dateRange: string, now = new Date()) {
  const endTime = now.toISOString();
  if (dateRange === 'all') return { startTime: '', endTime };

  const start = new Date(now);
  if (dateRange === 'today') start.setHours(0, 0, 0, 0);
  else start.setDate(start.getDate() - Number.parseInt(dateRange, 10));
  return { startTime: start.toISOString(), endTime };
}
