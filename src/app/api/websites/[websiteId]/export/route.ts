import JSZip from 'jszip';
import Papa from 'papaparse';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { pagingParams, withDateRange } from '@/lib/schema';
import { canViewAuthenticatedWebsite } from '@/permissions';
import { getEventMetrics, getPageviewMetrics, getSessionMetrics } from '@/queries/sql';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = withDateRange({
    ...pagingParams,
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canViewAuthenticatedWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const filters = await getQueryFilters(query, websiteId);

  const [events, pages, referrers, browsers, os, devices, countries] = await Promise.all([
    getEventMetrics(websiteId, { type: 'event' }, filters),
    getPageviewMetrics(websiteId, { type: 'path' }, filters),
    getPageviewMetrics(websiteId, { type: 'referrer' }, filters),
    getSessionMetrics(websiteId, { type: 'browser' }, filters),
    getSessionMetrics(websiteId, { type: 'os' }, filters),
    getSessionMetrics(websiteId, { type: 'device' }, filters),
    getSessionMetrics(websiteId, { type: 'country' }, filters),
  ]);

  const zip = new JSZip();

  // Prefix cells whose first character is a formula trigger with a single quote
  // to prevent CSV formula injection when opened in spreadsheet applications.
  const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r']);

  const sanitizeCsvValue = (value: unknown): unknown => {
    if (typeof value === 'string' && value.length > 0 && FORMULA_TRIGGERS.has(value[0])) {
      return `'${value}`;
    }
    return value;
  };

  const sanitizeRow = (row: Record<string, unknown>): Record<string, unknown> => {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      sanitized[key] = sanitizeCsvValue(value);
    }
    return sanitized;
  };

  const parse = (data: Record<string, unknown>[]) => {
    const sanitized = Array.isArray(data) ? data.map(sanitizeRow) : data;
    return Papa.unparse(sanitized, {
      header: true,
      skipEmptyLines: true,
    });
  };

  zip.file('events.csv', parse(events as Record<string, unknown>[]));
  zip.file('pages.csv', parse(pages as Record<string, unknown>[]));
  zip.file('referrers.csv', parse(referrers as Record<string, unknown>[]));
  zip.file('browsers.csv', parse(browsers as Record<string, unknown>[]));
  zip.file('os.csv', parse(os as Record<string, unknown>[]));
  zip.file('devices.csv', parse(devices as Record<string, unknown>[]));
  zip.file('countries.csv', parse(countries as Record<string, unknown>[]));

  const content = await zip.generateAsync({ type: 'nodebuffer' });
  const base64 = content.toString('base64');

  return json({ zip: base64 });
}
