// @vitest-environment node
import { parseSheetTimestamp } from '../src/time';

describe('parseSheetTimestamp', () => {
  it.each([
    // ISO with zone
    ['2026-11-02T18:10:39Z', '2026-11-02T18:10:39Z', undefined],
    ['2026-11-02T22:42:56.644Z', '2026-11-02T22:42:56.644Z', undefined],
    ['2026-11-01T23:36:00+00:00', '2026-11-01T23:36:00Z', undefined],
    // DD/MM/YYYY local Dublin: IST (UTC+1) before 25 Oct 2026, GMT after
    ['28/10/2026 18:58:00', '2026-10-28T18:58:00Z', undefined],
    ['15/07/2026 10:00', '2026-07-15T09:00:00Z', undefined],
    ['02/11/2026', '2026-11-02T00:00:00Z', 'day'],
    // Date only, with or without a zone note
    ['2026-11-01', '2026-11-01T00:00:00Z', 'day'],
    ['2026-11-01 (Europe/London)', '2026-11-01T00:00:00Z', 'day'],
    ['2026-11-02 Europe/London', '2026-11-02T00:00:00Z', 'day'],
    // Written dates
    ['28 October 2026', '2026-10-28T00:00:00Z', 'day'],
    ['2 Nov 2026, Europe/London', '2026-11-02T00:00:00Z', 'day'],
    ['28 October 2026, 18:35 GMT', '2026-10-28T18:35:00Z', undefined],
    ['1 Sept 2026', '2026-08-31T23:00:00Z', 'day'],
  ] as const)('%s → %s', (raw, iso, precision) => {
    const t = parseSheetTimestamp(raw);
    expect(t).toEqual(precision ? { raw, iso, precision } : { raw, iso });
  });

  it.each([
    'Unknown; confirm from the application source.',
    'Before 16 Nov 2026; employer-specific dates unknown.',
    'Reviewed 28 October 2026',
    'Tue evening',
    '31/02/2026 10:00',
    '2026-13-01',
  ])('keeps unparseable %p as raw text with no iso', (raw) => {
    expect(parseSheetTimestamp(raw)).toEqual({ raw, iso: null });
  });

  it('treats empty cells as empty, not unknown', () => {
    expect(parseSheetTimestamp('')).toEqual({ raw: null, iso: null });
    expect(parseSheetTimestamp('   ')).toEqual({ raw: null, iso: null });
    expect(parseSheetTimestamp(null)).toEqual({ raw: null, iso: null });
  });
});
