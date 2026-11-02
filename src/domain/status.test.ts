import { classifyStatus, isOpen } from './status';

describe('classifyStatus', () => {
  it.each([
    ['Done', 'done'],
    ['Active — runs Sundays', 'active'],
    ['Proposed — not yet accepted by Instinct', 'proposed'],
    ['Paused (on hold until next month)', 'paused'],
    ['Superseded (historical)', 'archived'],
    ['Blocked — source site requires sign-in', 'blocked'],
    ['Processing error — file not found', 'failed'],
    ['Awaiting Josh approval', 'needs-josh'],
    ['Sent', 'waiting'],
  ] as const)('%s → %s', (raw, category) => {
    expect(classifyStatus(raw).category).toBe(category);
  });

  it('always preserves the raw text (trimmed)', () => {
    expect(classifyStatus('  Blocked on Josh  ').raw).toBe('Blocked on Josh');
  });

  describe('precedence', () => {
    it('failed beats blocked', () => {
      expect(classifyStatus('Blocked after a failed fetch').category).toBe('failed');
    });
    it('blocked beats needs-josh', () => {
      const s = classifyStatus('Blocked: needs Josh decision');
      expect(s.category).toBe('blocked');
      expect(s.matches).toContain('needs-josh');
    });
    it('needs-josh beats done ("done but awaiting sign-off")', () => {
      expect(classifyStatus('Done but awaiting sign-off').category).toBe('needs-josh');
    });
    it('archived beats done', () => {
      expect(classifyStatus('Completed (historical)').category).toBe('archived');
    });
  });

  describe('negation', () => {
    it('"not done" is not done', () => {
      const s = classifyStatus('Not done');
      expect(s.category).toBe('waiting');
      expect(s.matches).not.toContain('done');
    });
    it('"not yet complete, in progress" is active', () => {
      expect(classifyStatus('Not yet complete, in progress').category).toBe('active');
    });
    it('"unblocked" is not blocked', () => {
      expect(classifyStatus('Unblocked, in progress').category).toBe('active');
    });
    it('"no errors" is not failed', () => {
      expect(classifyStatus('Processed, no errors').category).toBe('done');
    });
  });

  it('flags mixed text as ambiguous and lists every match', () => {
    const s = classifyStatus('Paused — proposal pending');
    expect(s.ambiguous).toBe(true);
    expect(s.matches[0]).toBe('paused');
    expect(s.matches.length).toBeGreaterThan(1);
  });

  it.each([null, undefined, '', '   '])('empty input %p → unclassified, not ambiguous', (raw) => {
    expect(classifyStatus(raw)).toEqual({ raw: '', category: 'unclassified', matches: [], ambiguous: false });
  });

  it('unknown wording stays unclassified rather than guessed', () => {
    const s = classifyStatus('With Instinct for a second opinion');
    expect(s.category).toBe('unclassified');
    expect(s.matches).toEqual([]);
  });

  it('does not match words inside other words', () => {
    // "newsletter" contains "new"; "opener" contains "open"
    expect(classifyStatus('Newsletter opener').category).toBe('unclassified');
  });
});

describe('isOpen', () => {
  it('treats done and archived as closed, everything else as open', () => {
    expect(isOpen('done')).toBe(false);
    expect(isOpen('archived')).toBe(false);
    expect(isOpen('paused')).toBe(true);
    expect(isOpen('unclassified')).toBe(true);
  });
});
