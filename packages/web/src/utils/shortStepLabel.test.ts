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
    expect(shortStepLabel('Meanwhile, cook the pasta')).toBe('Cook the pasta');
    expect(shortStepLabel('After 5 minutes, flip the fish')).toBe('Flip the fish');
    expect(shortStepLabel('Carefully, lower the eggs into the water')).toBe(
      'Lower the eggs into the water',
    );
  });

  it('sentence-cases the promoted clause after an opener is skipped', () => {
    // Grid columns are capitalized; a stripped opener must not leave it lowercase.
    expect(shortStepLabel('meanwhile, cook the pasta in well-salted water')).toBe(
      'Cook the pasta in well-salted water',
    );
    // No opener skipped → original casing preserved (author wrote it lowercase).
    expect(shortStepLabel('cream the butter')).toBe('cream the butter');
  });

  it('cuts a trailing purpose clause at a real "to <verb>" boundary', () => {
    expect(
      shortStepLabel('Stir the mayonnaise and dill pickles together to make the remoulade sauce'),
    ).toBe('Stir the mayonnaise and dill pickles together');
  });

  it('keeps a coordinated "and <verb>" clause whole — "and" is not a safe cut boundary', () => {
    // Cutting at "and" risks a fragment (it coordinates nouns as often as verbs),
    // so the boundary rule leaves it whole. Whole beats a fragment.
    expect(shortStepLabel('Warm the olive oil in a saucepan and sauté the diced onions')).toBe(
      'Warm the olive oil in a saucepan and sauté the diced onions',
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

  it('keeps a run-on whole when it has no boundary to cut at (whole beats a fragment)', () => {
    // No comma, no subordinate boundary — only "and"-coordination — so the
    // boundary rule emits the full text rather than truncate mid-phrase.
    const out = shortStepLabel(
      'Mix the flour and the sugar and the salt and the soda together well',
    );
    expect(out).toBe('Mix the flour and the sugar and the salt and the soda together well');
    expect(/\b(?:and|or|with|the|to|for|of|in|until)$/i.test(out)).toBe(false);
  });

  it('keeps a long prepositional phrase whole rather than cut mid-phrase (the "salted water" case)', () => {
    // The original D2 fragment ("…of salted") the boundary rewrite was built for:
    // no comma and no subordinate boundary, so the whole clause survives intact.
    expect(shortStepLabel('Cook the spaghetti in a large pot of salted water')).toBe(
      'Cook the spaghetti in a large pot of salted water',
    );
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

describe('shortStepLabel — boundary shortening', () => {
  it('cuts a trailing "until <doneness>" clause at its boundary', () => {
    expect(shortStepLabel('Sear the steak until deeply browned')).toBe('Sear the steak');
  });

  it('cuts a trailing "while <gerund>" clause at its boundary', () => {
    expect(shortStepLabel('Whisk the egg yolks while stirring constantly')).toBe(
      'Whisk the egg yolks',
    );
  });

  it('cuts a sequenced "then <verb>" clause at its boundary', () => {
    expect(shortStepLabel('Whisk the eggs then fold in the sifted flour')).toBe('Whisk the eggs');
  });

  it('does NOT cut "to <determiner>" — that is a complement, not a clause', () => {
    expect(shortStepLabel('Reduce the sauce to a thick glaze')).toBe('Reduce the sauce to a thick glaze');
    expect(shortStepLabel('Blend the mixture to a smooth puree')).toBe(
      'Blend the mixture to a smooth puree',
    );
  });

  it('never cuts below the 2-word floor at a boundary', () => {
    expect(shortStepLabel('Cook until tender')).toBe('Cook until tender');
    expect(shortStepLabel('Stir to combine')).toBe('Stir to combine');
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
