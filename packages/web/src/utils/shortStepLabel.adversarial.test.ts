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

describe('shortStepLabel — KNOWN DEFECTS (it.fails: flip red when fixed)', () => {
  // DEFECT 1 (strong): a leading adverbial / conditional / temporal clause
  // before the first comma is returned verbatim, DROPPING the actual imperative
  // that follows it. The visible Grid cell then reads as a different instruction
  // (or none at all). The rowspan does NOT rescue these — the dropped words are
  // the verb+object, and the surviving clause names no ingredient. Recipe prose
  // opens this way constantly ("Meanwhile, …", "Once …,", "When …,", "Using …,").
  it.fails('"Meanwhile, cook the pasta" must not collapse to a non-instruction', () => {
    expect(shortStepLabel('Meanwhile, cook the pasta')).toMatch(/cook/i);
  });

  it.fails('"After 5 minutes, flip the fish" must keep the action, not read as a timer', () => {
    // Currently -> "After 5 minutes": a cook glancing sees a duration, not "flip".
    expect(shortStepLabel('After 5 minutes, flip the fish')).toMatch(/flip/i);
  });

  it.fails('"Once boiling, add the pasta" must keep the imperative', () => {
    expect(shortStepLabel('Once boiling, add the pasta')).toMatch(/add/i);
  });

  it.fails('"When the oil shimmers, add the garlic" must keep the imperative', () => {
    expect(shortStepLabel('When the oil shimmers, add the garlic')).toMatch(/add/i);
  });

  it.fails('"Using a slotted spoon, transfer to a plate" must keep the imperative', () => {
    expect(shortStepLabel('Using a slotted spoon, transfer to a plate')).toMatch(/transfer/i);
  });

  it.fails('"Carefully, lower the eggs into the water" must not collapse to just "Carefully"', () => {
    expect(shortStepLabel('Carefully, lower the eggs into the water')).toMatch(/lower/i);
  });

  // DEFECT 2 (minor/moderate): the strip's stated premise is that the measurement
  // it removes is "redundant" because the subLabel re-displays it. But the subLabel
  // (shared extractSubLabel) only recognizes minutes/hours/temperature — NOT
  // seconds or days — while this heuristic's DURATION regex also strips
  // seconds/days. So for a `to|for <N seconds|days>` tail the measurement is
  // removed from the label AND absent from the subLabel: it survives only in the
  // hover `title` and the List view. On a touch tablet (no hover — the primary
  // cooking device and a screenshot target) a cook-critical timing is invisible.
  // Blanch/sear/toast times (seconds) and cure times (days) are all realistic.
  it.fails('"Blanch the beans for 90 seconds" must keep the seconds somewhere in the label', () => {
    // Currently -> "Blanch the beans" (90s only in title/List; gone from Grid).
    expect(shortStepLabel('Blanch the beans for 90 seconds')).toMatch(/90|second/i);
  });

  it.fails('"Cure the salmon for 2 days" must keep the days in the label', () => {
    expect(shortStepLabel('Cure the salmon for 2 days')).toMatch(/2|day/i);
  });
});
