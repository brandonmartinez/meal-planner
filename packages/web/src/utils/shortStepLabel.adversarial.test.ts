import { describe, it, expect } from 'vitest';
import { shortStepLabel } from './shortStepLabel';

/**
 * Adversarial pass on the Grid short-label heuristic (Yen / QA, final Phase-1
 * verification). The guiding invariant the author set is: the short label must
 * never be *wrong* or *misleading* — only *abbreviated*.
 *
 * The first block CONFIRMS the hardening from 118370c holds (these pass).
 * The `KNOWN DEFECTS` block encodes the two ways I could break that invariant
 * with ordinary, real-world recipe prose. They are written with `it.fails` so
 * they are green today (documenting the defect without breaking the shared
 * worktree / CI) and FLIP RED the moment the heuristic is corrected — at which
 * point the `.fails` modifier should be dropped and the assertion kept.
 * See .squad/decisions/inbox/yen-grid-view-verification.md for the routing.
 */

describe('shortStepLabel — hardening holds (regression family)', () => {
  it('keeps a "to <phrase>" tail that carries the meaning', () => {
    expect(shortStepLabel('Bring to a boil')).toBe('Bring to a boil');
    expect(shortStepLabel('Reduce to a simmer')).toBe('Reduce to a simmer');
    expect(shortStepLabel('Sear to a deep crust')).toBe('Sear to a deep crust');
  });

  it('keeps a bare-verb + measurement tail rather than emit one word', () => {
    expect(shortStepLabel('Cook to 165°F')).toBe('Cook to 165°F');
    expect(shortStepLabel('Chill for 30 min')).toBe('Chill for 30 min');
  });

  it('only strips a min/hr/temperature tail when >=2 head words survive', () => {
    expect(shortStepLabel('Heat the oil to 350°F')).toBe('Heat the oil');
    expect(shortStepLabel('Simmer the sauce for 20 minutes')).toBe('Simmer the sauce');
  });

  it('a comma clause that drops trailing ingredients is OK — the rowspan bracket still shows them', () => {
    // "Season with salt" spans the salt/pepper/cumin rows, so the omitted
    // ingredients remain visible via the bracket. Abbreviated, not misleading.
    expect(shortStepLabel('Season with salt, pepper, and cumin')).toBe('Season with salt');
  });
});

describe('shortStepLabel — defects fixed (Yen adversarial, converted from it.fails)', () => {
  // DEFECT 1 (strong): a leading adverbial / conditional / temporal clause
  // before the first comma was returned verbatim, DROPPING the imperative that
  // follows. Now such openers are skipped and the instruction clause survives.
  it('"Meanwhile, cook the pasta" keeps the imperative', () => {
    expect(shortStepLabel('Meanwhile, cook the pasta')).toBe('cook the pasta');
  });

  it('"After 5 minutes, flip the fish" keeps the action, not the timer', () => {
    expect(shortStepLabel('After 5 minutes, flip the fish')).toBe('flip the fish');
  });

  it('"Once boiling, add the pasta" keeps the imperative', () => {
    expect(shortStepLabel('Once boiling, add the pasta')).toMatch(/^add the pasta$/i);
  });

  it('"When the oil shimmers, add the garlic" keeps the imperative', () => {
    expect(shortStepLabel('When the oil shimmers, add the garlic')).toMatch(/^add the garlic$/i);
  });

  it('"Using a slotted spoon, transfer to a plate" keeps the imperative', () => {
    expect(shortStepLabel('Using a slotted spoon, transfer to a plate')).toMatch(/^transfer/i);
  });

  it('"Carefully, lower the eggs into the water" does not collapse to "Carefully"', () => {
    expect(shortStepLabel('Carefully, lower the eggs into the water')).toMatch(/^lower/i);
  });

  // DEFECT 3 (information loss): the strip covered seconds/days, but shared's
  // extractSubLabel only emits min/hr/° — so those timings vanished from BOTH
  // the label and the subLabel (invisible on a no-hover touch tablet). The
  // strip now mirrors extractSubLabel exactly, keeping seconds/days in-label.
  it('"Blanch the beans for 90 seconds" keeps the seconds in the label', () => {
    expect(shortStepLabel('Blanch the beans for 90 seconds')).toMatch(/90|second/i);
  });

  it('"Cure the salmon for 2 days" keeps the days in the label', () => {
    expect(shortStepLabel('Cure the salmon for 2 days')).toMatch(/2|day/i);
  });
});

describe('shortStepLabel — Defect 2: no mid-phrase fragments', () => {
  // The 6-word cap truncated "Dredge the shrimp in the seasoned flour" into
  // "Dredge the shrimp in the seasoned" — "the seasoned" WHAT? A complete,
  // slightly longer phrase beats a fragment, so moderate labels are kept whole.
  it('keeps "…in the seasoned flour" rather than end on a dangling adjective', () => {
    expect(shortStepLabel('Dredge the shrimp in the seasoned flour')).toBe(
      'Dredge the shrimp in the seasoned flour',
    );
  });

  it('never ends a label on a dangling article / preposition / conjunction', () => {
    const samples = [
      'Transfer to a plate and let rest',
      'Add the chopped onion to the hot pan and stir',
      'Fold the whipped cream into the chilled custard base',
      'Spread the remoulade evenly over the toasted French bread',
    ];
    for (const s of samples) {
      const out = shortStepLabel(s);
      expect(/\b(?:the|a|an|and|or|but|with|to|for|in|of|into|on|until|then)$/i.test(out)).toBe(
        false,
      );
      // And the label must still start with the original imperative verb.
      expect(out.toLowerCase().startsWith(s.split(' ')[0].toLowerCase())).toBe(true);
    }
  });
});
