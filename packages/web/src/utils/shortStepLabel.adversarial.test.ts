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
    expect(shortStepLabel('Meanwhile, cook the pasta')).toBe('Cook the pasta');
  });

  it('"After 5 minutes, flip the fish" keeps the action, not the timer', () => {
    expect(shortStepLabel('After 5 minutes, flip the fish')).toBe('Flip the fish');
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

/**
 * FIFTH FAMILY (Yen, 2026-08-03 sweep after d467f29) — the same root cause as
 * DEFECT 1, one layer deeper. The opener skip used to recognize adverbial *words*
 * only and inspect the clause's FIRST token, so a leading comma-clause that is a
 * PREPOSITIONAL phrase ("In a large bowl", "For the sauce", "Off the heat", "To
 * finish") or a NUMERIC / timing phrase ("2 minutes before serving", "30 seconds
 * later") was treated as the instruction and PROMOTED to the whole label —
 * dropping the real imperative that follows.
 *
 * Fixed structurally: an opener is now any leading clause NOT headed by a verb —
 * a function-word / adverb head, a participial head, or a number — so the whole
 * class is covered without enumerating phrases. Converted from `it.fails`.
 */
describe('shortStepLabel — FIFTH FAMILY: prepositional / numeric openers (fixed)', () => {
  it('"In a large bowl, whisk the eggs" must keep the imperative', () => {
    expect(shortStepLabel('In a large bowl, whisk the eggs')).toBe('Whisk the eggs');
  });

  it('"For the sauce, melt the butter" must keep the imperative', () => {
    expect(shortStepLabel('For the sauce, melt the butter')).toBe('Melt the butter');
  });

  it('"Off the heat, stir in the cheese" must keep the imperative', () => {
    expect(shortStepLabel('Off the heat, stir in the cheese')).toBe('Stir in the cheese');
  });

  it('"To finish, drizzle with olive oil" must keep the imperative', () => {
    expect(shortStepLabel('To finish, drizzle with olive oil')).toBe('Drizzle with olive oil');
  });

  it('"2 minutes before serving, stir in the butter" must not read as a timer', () => {
    expect(shortStepLabel('2 minutes before serving, stir in the butter')).toBe(
      'Stir in the butter',
    );
  });

  it('"30 seconds later, add the garlic" must keep the imperative', () => {
    expect(shortStepLabel('30 seconds later, add the garlic')).toBe('Add the garlic');
  });
});

/**
 * SIXTH-FAMILY GUARD (Linus, self-adversarial after the FIFTH fix). Five passes
 * have each surfaced something the last missed, so before shipping the structural
 * "opener = not verb-headed" rule I probe its own failure modes: participial
 * adjuncts beyond "using"; base-form verbs that end in -ing (must NOT be skipped);
 * a leading prepositional phrase with NO comma; a clause with no imperative at
 * all; and nested commas where clause 2 is also an opener.
 */
describe('shortStepLabel — sixth-family guard (structural opener rule)', () => {
  it('generalizes participial-adjunct openers beyond "using"', () => {
    expect(shortStepLabel('Using a slotted spoon, transfer to a plate')).toMatch(/^transfer/i);
    expect(shortStepLabel('Working in batches, fry the shrimp')).toBe('Fry the shrimp');
    expect(shortStepLabel('Stirring constantly, cook until thickened')).toBe(
      'Cook until thickened',
    );
  });

  it('does NOT skip a base-form verb that ends in -ing (Bring / String)', () => {
    // The imperative must survive: never drop "Bring to a boil" for a later clause.
    expect(shortStepLabel('Bring to a boil, then add the pasta')).toBe('Bring to a boil');
    expect(shortStepLabel('String the beans, then blanch')).toBe('String the beans');
  });

  it('does NOT skip a real verb-headed leading clause', () => {
    expect(shortStepLabel('Whisk the eggs, then fold in the flour')).toBe('Whisk the eggs');
    expect(shortStepLabel('Season with salt, pepper, and cumin')).toBe('Season with salt');
  });

  it('keeps the full text when a leading prepositional phrase has no comma', () => {
    // No clause boundary to split on: err long, but the imperative is still present.
    const out = shortStepLabel('In a large bowl whisk the eggs');
    expect(out).toBe('In a large bowl whisk the eggs');
    expect(out).toMatch(/whisk the eggs/i);
  });

  it('cuts an imperative-less all-opener step at its subordinate boundary', () => {
    // No verb anywhere; the "until golden" clause is a real subordinate boundary,
    // so it is dropped cleanly (title/List keep the doneness). Not misleading.
    expect(shortStepLabel('Over medium heat until golden')).toBe('Over medium heat');
  });

  it('skips consecutive openers to reach the instruction clause', () => {
    expect(shortStepLabel('In a large bowl, meanwhile, whisk the eggs')).toBe('Whisk the eggs');
  });
});

/**
 * SEVENTH FAMILY (Brandon, from the shipping screenshot) — the D2 fragment
 * defect reaching a trailing VERB. The runaway word cap severed a "to <verb>" or
 * "and <verb>" continuation and left the bare objectless verb standing:
 * "…together to make", "…and sauté". "sauté" WHAT? Half an instruction. The word
 * cap has since been DELETED entirely (see the boundary rewrite): shortening now
 * happens only at real syntactic boundaries, so the label is EITHER the verbatim
 * input OR a clean head clause ending on a content word — never a severed head.
 */
describe('shortStepLabel — SEVENTH FAMILY: no dangling severed verb', () => {
  it('cuts a "to <verb>" purpose clause at its boundary, leaving a complete head', () => {
    expect(
      shortStepLabel('Stir the mayonnaise and dill pickles together to make the remoulade'),
    ).toBe('Stir the mayonnaise and dill pickles together');
  });

  it('keeps a coordinated "and <verb>" clause whole — "and" is not a safe boundary', () => {
    // The boundary rule refuses to cut at "and" (ambiguous noun vs clause join),
    // so the whole step survives rather than producing a "…and sauté" fragment.
    expect(shortStepLabel('Warm the olive oil in a saucepan and sauté the diced onions')).toBe(
      'Warm the olive oil in a saucepan and sauté the diced onions',
    );
  });

  it('the output is EITHER the verbatim input OR a clean-cut head — never a fragment', () => {
    const samples = [
      'Stir the mayonnaise and dill pickles together to make the remoulade',
      'Warm the olive oil in a saucepan and sauté the diced onions',
      'Combine the flour and the sugar and the eggs and then whisk vigorously',
      'Pat the chicken thighs completely dry and season and then sear',
      'Cook the spaghetti in a large pot of salted water',
    ];
    const dangling = /\b(?:to|and|or|but|nor|then|plus|the|a|an|with|for|in|of|until|while)$/i;
    for (const s of samples) {
      const out = shortStepLabel(s);
      // Either untouched, or a strict prefix (a boundary cut) of the original.
      expect(s === out || s.startsWith(out)).toBe(true);
      // Never ends on a dangling connective / glue word.
      expect(dangling.test(out)).toBe(false);
      // And the label still starts with the original imperative verb.
      expect(out.toLowerCase().startsWith(s.split(' ')[0].toLowerCase())).toBe(true);
    }
  });

  it('keeps a COMPLETE "to <object>" tail whole — "to a boil" is not a droppable clause', () => {
    // "to a boil" is a prepositional complement (to + article + noun), not a
    // subordinate clause, so there is no boundary to cut and the step stays whole.
    expect(shortStepLabel('Combine everything in the stockpot and bring it to a boil')).toBe(
      'Combine everything in the stockpot and bring it to a boil',
    );
  });
});

/**
 * EIGHTH-FAMILY SWEEP (Yen, 2026-08-03; updated for the boundary rewrite).
 * Adversarial pass targeting the -ing participle detection and the handling of
 * "and"/"or"-joined steps. VERDICT: no genuine eighth family. Under the boundary
 * rule "and"/"or" are never cut (they ambiguously join nouns vs clauses), so such
 * steps emit FULL TEXT — err-long, never a flip to a DIFFERENT instruction. These
 * characterize and lock in that safe behavior so a future edit cannot regress it.
 */
describe('shortStepLabel — eighth-family sweep: "and"/"or" joins stay whole, never wrong', () => {
  it('an "and"-joined list stays whole and never dangles on a connective', () => {
    // "and" is not a safe cut boundary, so the step is emitted whole rather than
    // truncated. Err-long: the label still leads with the real verb + object.
    for (const s of [
      'Mix salt and pepper and garlic and paprika and cayenne and cumin',
      'Combine flour and sugar and eggs and milk and butter and vanilla',
    ]) {
      const out = shortStepLabel(s);
      expect(out).toBe(s); // whole, not truncated
      expect(/\b(?:and|or|to|then|plus|but|nor)$/i.test(out)).toBe(false); // no dangle
      expect(out.toLowerCase().startsWith(s.split(' ')[0].toLowerCase())).toBe(true); // real verb kept
    }
  });

  it('keeps an "or <alt>" step whole — "or" is not a safe cut boundary', () => {
    // Like "and", "or" ambiguously joins nouns vs clauses, so the boundary rule
    // does not cut there; the full alternative survives (whole beats a fragment).
    expect(shortStepLabel('Grill the chicken over high heat or pan-fry it in a hot skillet')).toBe(
      'Grill the chicken over high heat or pan-fry it in a hot skillet',
    );
  });
});

describe('shortStepLabel — eighth-family sweep: -ing rule fails safe, never promotes a wrong clause', () => {
  it('a non-cooking -ing head missing from ING_BASE_VERBS abbreviates safely, not to a wrong clause', () => {
    // "Sting" is not a cooking imperative; even mis-detected as a participial
    // adjunct the fallback is SAFE — the sequenced "then …" clause is cut at its
    // boundary, giving an abbreviated (not wrong) label led by the same word.
    expect(shortStepLabel('Sting the sauce with lime, then taste for seasoning')).toBe(
      'Sting the sauce with lime',
    );
  });

  it('a single-clause -ing step falls back to full text (no false opener skip)', () => {
    expect(shortStepLabel('Seasoning the chicken generously with salt and pepper')).toBe(
      'Seasoning the chicken generously with salt and pepper',
    );
  });

  it('the length>4 guard keeps a 4-letter -ing verb (zing) as the imperative', () => {
    expect(shortStepLabel('Zing the dressing with vinegar, then whisk in the oil')).toBe(
      'Zing the dressing with vinegar',
    );
  });
});
