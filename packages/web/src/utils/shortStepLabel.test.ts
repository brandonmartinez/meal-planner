import { describe, it, expect } from 'vitest';
import { shortStepLabel, isRedundantSubLabel } from './shortStepLabel';

describe('shortStepLabel', () => {
  it('keeps a terse verb label unchanged', () => {
    expect(shortStepLabel('whisk')).toBe('whisk');
    expect(shortStepLabel('Fold in')).toBe('Fold in');
  });

  it('takes the leading clause up to the first comma', () => {
    expect(
      shortStepLabel(
        'Whisk the flour, cornstarch, cornmeal, cajun seasoning, paprika, and garlic powder',
      ),
    ).toBe('Whisk the flour');
  });

  it('strips a trailing "to <temperature>" tail (redundant measurement)', () => {
    expect(shortStepLabel('Heat the frying oil to 350°F')).toBe('Heat the frying oil');
  });

  it('strips a trailing "for <duration>" tail (redundant measurement)', () => {
    expect(shortStepLabel('Simmer the sauce for 20 minutes')).toBe('Simmer the sauce');
  });

  it('does NOT strip a "to <non-measurement>" tail — the verb would be meaningless', () => {
    expect(shortStepLabel('Bring to a boil')).toBe('Bring to a boil');
    expect(shortStepLabel('Reduce to a simmer')).toBe('Reduce to a simmer');
    expect(shortStepLabel('Sear to a deep crust')).toBe('Sear to a deep crust');
  });

  it('keeps a measurement tail rather than emit a single bare word (2-word floor)', () => {
    expect(shortStepLabel('Cook to 165°F')).toBe('Cook to 165°F');
    expect(shortStepLabel('Chill for 30 min')).toBe('Chill for 30 min');
  });

  it('takes the first instruction clause, skipping an adverbial opener', () => {
    expect(shortStepLabel('Meanwhile, cook the pasta')).toBe('cook the pasta');
    expect(shortStepLabel('After 5 minutes, flip the fish')).toBe('flip the fish');
    expect(shortStepLabel('Carefully, lower the eggs into the water')).toBe(
      'lower the eggs into the water',
    );
  });

  it('keeps a seconds/days tail — the subLabel never re-shows those', () => {
    expect(shortStepLabel('Blanch the beans for 90 seconds')).toBe(
      'Blanch the beans for 90 seconds',
    );
    expect(shortStepLabel('Cure the salmon for 2 days')).toBe('Cure the salmon for 2 days');
  });

  it('keeps a moderately long clause whole rather than truncate into a fragment', () => {
    expect(shortStepLabel('Dredge the shrimp in the seasoned flour')).toBe(
      'Dredge the shrimp in the seasoned flour',
    );
  });

  it('caps only a runaway run-on, never ending on a dangling connective', () => {
    const out = shortStepLabel(
      'Mix the flour and the sugar and the salt and the soda together well',
    );
    expect(out.split(' ').length).toBeLessThanOrEqual(9);
    expect(/\b(?:and|or|with|the|to|for|of|in|until)$/i.test(out)).toBe(false);
  });

  it('prefers the comma clause even when a "for" tail follows the comma', () => {
    expect(
      shortStepLabel('Marinate the shrimp in buttermilk, egg, and hot sauce for 20 min'),
    ).toBe('Marinate the shrimp in buttermilk');
  });

  it('falls back to the trimmed original if shortening would empty it', () => {
    // A leading comma makes the "clause up to first comma" empty; fall back.
    expect(shortStepLabel(', then plate up')).toBe(', then plate up');
  });

  it('trims surrounding whitespace', () => {
    expect(shortStepLabel('  cream the butter  ')).toBe('cream the butter');
  });

  it('returns an empty string for empty input', () => {
    expect(shortStepLabel('   ')).toBe('');
  });
});

describe('isRedundantSubLabel', () => {
  it('is false for a null sub-label', () => {
    expect(isRedundantSubLabel(null, 'Heat the frying oil')).toBe(false);
  });

  it('suppresses a sub-label that is a substring of the displayed label', () => {
    expect(isRedundantSubLabel('30 min', 'Chill 30 min')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isRedundantSubLabel('BUTTERMILK', 'Marinate in buttermilk')).toBe(true);
  });

  it('keeps an additive sub-label the short label no longer mentions', () => {
    expect(isRedundantSubLabel('350°F', 'Heat the frying oil')).toBe(false);
    expect(isRedundantSubLabel('20 min', 'Marinate the shrimp in buttermilk')).toBe(false);
  });

  it('suppresses the sub-label when the label deliberately keeps the measurement', () => {
    // "Cook to 165°F" keeps its tail (2-word floor); the dup sub drops out here.
    expect(isRedundantSubLabel('165°F', 'Cook to 165°F')).toBe(true);
  });
});
