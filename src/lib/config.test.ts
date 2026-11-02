import { parseConfig } from './config';

describe('parseConfig', () => {
  it('defaults to mock with no API and a 180 min stale threshold', () => {
    expect(parseConfig({})).toEqual({
      dataSource: 'mock',
      apiBaseUrl: null,
      staleAfterMinutes: 180,
      displayTimeZone: 'Europe/London',
    });
  });

  it('selects http case-insensitively and trims trailing slashes from the base URL', () => {
    const c = parseConfig({ VITE_DATA_SOURCE: ' HTTP ', VITE_API_BASE_URL: 'https://api.example.com//' });
    expect(c.dataSource).toBe('http');
    expect(c.apiBaseUrl).toBe('https://api.example.com');
  });

  it('falls back to mock for unknown sources', () => {
    expect(parseConfig({ VITE_DATA_SOURCE: 'sheets' }).dataSource).toBe('mock');
  });

  it.each(['', 'abc', '0', '-5'])('ignores invalid stale threshold %p', (v) => {
    expect(parseConfig({ VITE_STALE_AFTER_MINUTES: v }).staleAfterMinutes).toBe(180);
  });

  it('accepts a positive stale threshold', () => {
    expect(parseConfig({ VITE_STALE_AFTER_MINUTES: '45' }).staleAfterMinutes).toBe(45);
  });
});
