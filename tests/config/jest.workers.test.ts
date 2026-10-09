import { resolveMaxWorkers, resolveVerbose } from '../../jest.workers';

describe('jest.workers config resolvers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.JEST_MAX_WORKERS;
    delete process.env.JEST_VERBOSE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('resolveMaxWorkers', () => {
    it('returns "50%" without warning when unset (undefined argument)', () => {
      const warnSpy = jest.fn();
      const result = resolveMaxWorkers(undefined, warnSpy);
      expect(result).toBe('50%');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('returns "50%" without warning when JEST_MAX_WORKERS is unset in process.env', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const result = resolveMaxWorkers();
      expect(result).toBe('50%');
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    describe('valid integers', () => {
      it.each(['1', '2', '4', '16'])('honors integer string "%s" as number without warning', (val) => {
        const warnSpy = jest.fn();
        const result = resolveMaxWorkers(val, warnSpy);
        expect(result).toBe(Number(val));
        expect(warnSpy).not.toHaveBeenCalled();
      });

      it('reads valid integer from process.env.JEST_MAX_WORKERS', () => {
        process.env.JEST_MAX_WORKERS = '2';
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const result = resolveMaxWorkers();
        expect(result).toBe(2);
        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
      });
    });

    describe('valid percentages', () => {
      it.each(['1%', '25%', '50%', '100%'])('honors valid percentage "%s" without warning', (val) => {
        const warnSpy = jest.fn();
        const result = resolveMaxWorkers(val, warnSpy);
        expect(result).toBe(val);
        expect(warnSpy).not.toHaveBeenCalled();
      });

      it('reads valid percentage from process.env.JEST_MAX_WORKERS', () => {
        process.env.JEST_MAX_WORKERS = '25%';
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const result = resolveMaxWorkers();
        expect(result).toBe('25%');
        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
      });
    });

    describe('invalid values fallback to "50%" with a single warning naming the bad value', () => {
      const invalidCases = [
        { label: '0', val: '0' },
        { label: '-1', val: '-1' },
        { label: 'abc', val: 'abc' },
        { label: '150%', val: '150%' },
        { label: '0%', val: '0%' },
        { label: 'empty string', val: '' },
      ];

      it.each(invalidCases)('falls back to "50%" with warning for $label ($val)', ({ val }) => {
        const warnSpy = jest.fn();
        const result = resolveMaxWorkers(val, warnSpy);
        expect(result).toBe('50%');
        expect(warnSpy).toHaveBeenCalledTimes(1);
        const warning = warnSpy.mock.calls[0][0];
        if (val === '') {
          expect(warning).toMatch(/""/);
        } else {
          expect(warning).toContain(val);
        }
      });

      it('warns to console.warn (stderr) when no onWarn handler is provided', () => {
        process.env.JEST_MAX_WORKERS = 'abc';
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const result = resolveMaxWorkers();
        expect(result).toBe('50%');
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0][0]).toContain('abc');
        warnSpy.mockRestore();
      });
    });
  });

  describe('resolveVerbose', () => {
    it('returns true when raw value is "true"', () => {
      expect(resolveVerbose('true')).toBe(true);
    });

    it('returns true when process.env.JEST_VERBOSE is "true"', () => {
      process.env.JEST_VERBOSE = 'true';
      expect(resolveVerbose()).toBe(true);
    });

    it.each([
      ['false', 'false'],
      ['1', '1'],
      ['TRUE', 'TRUE'],
      ['yes', 'yes'],
      ['empty string', ''],
      ['undefined', undefined],
    ])('returns false for %s (%s)', (_, val) => {
      expect(resolveVerbose(val)).toBe(false);
    });

    it('returns false when process.env.JEST_VERBOSE is unset', () => {
      delete process.env.JEST_VERBOSE;
      expect(resolveVerbose()).toBe(false);
    });
  });
});
