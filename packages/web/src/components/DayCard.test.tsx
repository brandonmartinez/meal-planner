import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import { renderWithProviders, screen, waitFor, within } from '../test-utils/render';
import userEvent from '@testing-library/user-event';
import DayCard from './DayCard';
import type { DayPlan } from '@meal-planner/shared';

const FAMILY_ID = 'fam-1';

function makeDay(overrides: Partial<DayPlan> = {}): DayPlan {
    return {
        id: 'd-1',
        date: '2026-05-04',
        weekPlanId: 'wp-1',
        suggestions: [],
        ...overrides,
    } as DayPlan;
}

const baseSuggestion = {
    id: 's-1',
    dayPlanId: 'd-1',
    mealId: 'm-1',
    userId: 'user-1',
    approved: false,
    meal: {
        id: 'm-1',
        name: 'Tacos',
        description: null,
        placeholderKind: null,
    },
    suggestedBy: {
        id: 'user-1',
        name: 'Alice',
        email: 'a@b.com',
        avatarUrl: null,
    },
};

// Seeds a signed-in parent whose active family is FAMILY_ID, so the
// SuggestionChip's useFamily() resolves a non-null familyId and the meal body
// becomes a clickable "View details" button.
function authMeWithFamily() {
    return http.get('/api/auth/me', () =>
        HttpResponse.json({
            id: 'user-1',
            email: 'a@b.com',
            name: 'Alice',
            avatarUrl: null,
            memberships: [
                {
                    id: 'fm-1',
                    role: 'PARENT',
                    familyId: FAMILY_ID,
                    userId: 'user-1',
                    family: { id: FAMILY_ID, name: 'Smiths', timezone: 'UTC' },
                },
            ],
        }),
    );
}

// A complete meal payload for the detail-modal fetch.
function fullMeal(overrides: Record<string, unknown> = {}) {
    return {
        id: 'm-1',
        name: 'Tacos',
        description: 'Weeknight tacos',
        imageUrl: null,
        placeholderKind: null,
        difficulty: 'HARD',
        prepTimeMinutes: 10,
        cookTimeMinutes: 15,
        servings: 4,
        sourceUrl: null,
        notes: null,
        favorite: true,
        rating: 5,
        familyId: FAMILY_ID,
        tags: [],
        collections: [],
        ingredients: [
            { id: 'i-1', name: 'olive oil', quantity: '2', unit: 'tbsp' },
        ],
        ...overrides,
    };
}

describe('DayCard', () => {
    it('shows the day name and "No suggestions" when empty', () => {
        renderWithProviders(
            <DayCard
                day={makeDay()}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
                onUnapprove={() => { }}
            />,
        );
        expect(screen.getByText('Monday')).toBeInTheDocument();
        expect(screen.getByText(/no suggestions/i)).toBeInTheDocument();
    });

    it('renders suggestions and triggers onAddMeal', async () => {
        const onAddMeal = vi.fn();
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [baseSuggestion] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={onAddMeal}
                onApprove={() => { }}
                onRemove={() => { }}
                onUnapprove={() => { }}
            />,
        );
        expect(screen.getByText('Tacos')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: /add meal/i }));
        expect(onAddMeal).toHaveBeenCalledTimes(1);
    });

    it('shows the approve button to a parent for unapproved suggestions and calls onApprove', async () => {
        const onApprove = vi.fn();
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [baseSuggestion] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={onApprove}
                onRemove={() => { }}
                onUnapprove={() => { }}
            />,
        );
        await userEvent.click(screen.getByTitle('Approve'));
        expect(onApprove).toHaveBeenCalledWith('s-1');
    });

    it('hides the approve button for non-parents', () => {
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [baseSuggestion] as DayPlan['suggestions'] })}
                isParent={false}
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
                onUnapprove={() => { }}
            />,
        );
        expect(screen.queryByTitle('Approve')).toBeNull();
    });

    it('hides the remove button for a child viewing another user\'s suggestion', () => {
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [baseSuggestion] as DayPlan['suggestions'] })}
                isParent={false}
                currentUserId="other-user"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
                onUnapprove={() => { }}
            />,
        );
        expect(screen.queryByTitle('Remove')).toBeNull();
    });

    it('shows the remove button to a child viewing their own suggestion', async () => {
        const onRemove = vi.fn();
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [baseSuggestion] as DayPlan['suggestions'] })}
                isParent={false}
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={onRemove}
            />,
        );
        await userEvent.click(screen.getByTitle('Remove'));
        expect(onRemove).toHaveBeenCalledWith('s-1');
    });

    it('renders an emoji for placeholder meals', () => {
        const placeholderSuggestion = {
            ...baseSuggestion,
            meal: { ...baseSuggestion.meal, placeholderKind: 'TAKEOUT' as const },
        };
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [placeholderSuggestion] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
                onUnapprove={() => { }}
            />,
        );
        expect(screen.getByText('🍕')).toBeInTheDocument();
    });

    it('approved suggestion shows the ↺ un-approve button and calls onUnapprove', async () => {
        const onUnapprove = vi.fn();
        const approvedSuggestion = { ...baseSuggestion, approved: true };
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [approvedSuggestion] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
                onUnapprove={onUnapprove}
            />,
        );
        const btn = screen.getByTitle('Un-approve');
        expect(btn).toBeInTheDocument();
        await userEvent.click(btn);
        expect(onUnapprove).toHaveBeenCalledWith('s-1');
    });

    it('approved suggestion shows no ✓ approve button (replaced by ↺)', () => {
        const approvedSuggestion = { ...baseSuggestion, approved: true };
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [approvedSuggestion] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
                onUnapprove={() => { }}
            />,
        );
        expect(screen.queryByTitle('Approve')).toBeNull();
        expect(screen.getByTitle('Un-approve')).toBeInTheDocument();
    });

    it('approved suggestion does not show a leading ✓ badge in the meal name', () => {
        const approvedSuggestion = { ...baseSuggestion, approved: true };
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [approvedSuggestion] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
                onUnapprove={() => { }}
            />,
        );
        // The name is present but no standalone ✓ span before it
        expect(screen.getByText('Tacos')).toBeInTheDocument();
        expect(screen.queryByText('✓')).toBeNull();
    });

    it('remove button is still present when suggestion is approved', () => {
        const approvedSuggestion = { ...baseSuggestion, approved: true };
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [approvedSuggestion] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
                onUnapprove={() => { }}
            />,
        );
        expect(screen.getByTitle('Remove')).toBeInTheDocument();
    });

    it('renders a photo stamp when meal has imageUrl (non-placeholder)', () => {
        const suggestionWithImage = {
            ...baseSuggestion,
            meal: { ...baseSuggestion.meal, imageUrl: 'https://example.com/tacos.jpg' },
        };
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [suggestionWithImage] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
                onUnapprove={() => { }}
            />,
        );
        const stamp = screen.getByRole('img', { name: /tacos/i });
        expect(stamp).toBeInTheDocument();
        // object-cover prevents distortion
        expect(stamp).toHaveClass('object-cover');
        // Fixed width (w-16) with self-stretch height fills the full chip height (no gap under image).
        // Width stays a fixed px value — NOT derived from stretch — preserving the zero-width guard:
        // catches any regression back to absolute/inset-0 or aspect-square-from-stretch.
        expect(stamp).toHaveClass('w-16');
        expect(stamp).toHaveClass('self-stretch');
        expect(stamp).not.toHaveClass('absolute');
    });

    it('shows no stamp img when meal has no imageUrl', () => {
        // baseSuggestion has no imageUrl → showStamp is false → compact inline layout
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [baseSuggestion] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
                onUnapprove={() => { }}
            />,
        );
        // No named stamp image — MealThumbnail returns null when src is absent
        expect(screen.queryByRole('img', { name: /tacos/i })).toBeNull();
        // Meal name still present in the compact layout
        expect(screen.getByText('Tacos')).toBeInTheDocument();
    });
});

describe('DayCard — meal detail modal', () => {
    it('opens the meal-detail modal when the card body is clicked', async () => {
        server.use(
            authMeWithFamily(),
            http.get(`/api/families/${FAMILY_ID}/meals/m-1`, () =>
                HttpResponse.json(fullMeal()),
            ),
        );

        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [baseSuggestion] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
                onUnapprove={() => { }}
            />,
        );

        const body = await screen.findByRole('button', {
            name: /view details for tacos/i,
        });
        await userEvent.click(body);

        const dialog = await screen.findByRole('dialog');
        expect(
            within(dialog).getByRole('heading', { name: 'Tacos' }),
        ).toBeInTheDocument();
        // Detail fetched from the meal endpoint (not present on the card itself).
        expect(await within(dialog).findByText(/olive oil/i)).toBeInTheDocument();
        expect(
            within(dialog).getByRole('link', { name: /cooking mode/i }),
        ).toHaveAttribute('href', '/meals/m-1/cook');
    });

    it('keeps approve/remove working and does NOT open the modal', async () => {
        const onApprove = vi.fn();
        const onRemove = vi.fn();
        server.use(authMeWithFamily());

        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [baseSuggestion] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={onApprove}
                onRemove={onRemove}
            />,
        );

        // Wait until familyId resolves so the body is a clickable button —
        // this proves stopPropagation, not merely a non-clickable card.
        await screen.findByRole('button', { name: /view details for tacos/i });

        await userEvent.click(screen.getByTitle('Approve'));
        expect(onApprove).toHaveBeenCalledWith('s-1');
        expect(screen.queryByRole('dialog')).toBeNull();

        await userEvent.click(screen.getByTitle('Remove'));
        expect(onRemove).toHaveBeenCalledWith('s-1');
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('does not open a detail modal for placeholder suggestions', async () => {
        const placeholderSuggestion = {
            ...baseSuggestion,
            meal: { ...baseSuggestion.meal, placeholderKind: 'TAKEOUT' as const },
        };
        // Seed a resolvable family so the ONLY reason the body stays inert is the
        // placeholder guard, not a missing familyId.
        server.use(authMeWithFamily());

        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [placeholderSuggestion] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
                onUnapprove={() => { }}
            />,
        );

        expect(await screen.findByText('🍕')).toBeInTheDocument();
        // No clickable details affordance for a placeholder.
        expect(
            screen.queryByRole('button', { name: /view details/i }),
        ).toBeNull();
        // Clicking the placeholder body does nothing.
        await userEvent.click(screen.getByText('🍕'));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
});

// ---------------------------------------------------------------------------
// Configurable meal choice resolution (#226)
// ---------------------------------------------------------------------------

const slotWithOptions = {
  id: 'slot-1',
  mealId: 'm-1',
  name: 'Protein',
  position: 0,
  options: [
    { id: 'opt-chicken', slotId: 'slot-1', name: 'Chicken', position: 0, ingredients: [] },
    { id: 'opt-tofu', slotId: 'slot-1', name: 'Tofu', position: 1, ingredients: [] },
  ],
};

const suggestionWithSlots = {
  ...baseSuggestion,
  meal: {
    ...baseSuggestion.meal,
    slots: [slotWithOptions],
  },
  choices: [],
};

const suggestionWithResolvedChoices = {
  ...baseSuggestion,
  meal: {
    ...baseSuggestion.meal,
    slots: [slotWithOptions],
  },
  choices: [
    {
      id: 'choice-1',
      suggestionId: 's-1',
      slotId: 'slot-1',
      optionId: 'opt-chicken',
      slotName: 'Protein',
      optionName: 'Chicken',
      createdAt: '2026-08-01T00:00:00.000Z',
      ingredients: [],
    },
  ],
};

// The draggable chip <div> receives role="button" from @dnd-kit and its
// accessible name is the full chip text, which includes "Resolve choices".
// The real toggle button is distinguished by its aria-expanded attribute
// (the chip div never has that). Use { expanded: false/true } to target it
// uniquely, and queryByRole with expanded to check absence.
function getResolveBtn() {
  return screen.getByRole('button', { name: /resolve choices/i, expanded: false });
}
function queryResolveBtn() {
  return screen.queryByRole('button', { name: /resolve choices/i, expanded: false });
}

describe('DayCard — configurable choice resolution (#226)', () => {
  it('shows unresolved warning and disables approve when choices are unresolved', () => {
    renderWithProviders(
      <DayCard
        day={makeDay({ suggestions: [suggestionWithSlots] as DayPlan['suggestions'] })}
        isParent
        currentUserId="user-1"
        onAddMeal={() => {}}
        onApprove={() => {}}
        onRemove={() => {}}
        onUnapprove={() => {}}
      />,
    );
    expect(screen.getByText(/unresolved choices/i)).toBeInTheDocument();
    const approveBtn = screen.getByRole('button', {
      name: /resolve required meal choices before approving/i,
    });
    expect(approveBtn).toBeDisabled();
  });

  it('shows the "Resolve choices" button for the owner of the suggestion', () => {
    renderWithProviders(
      <DayCard
        day={makeDay({ suggestions: [suggestionWithSlots] as DayPlan['suggestions'] })}
        isParent={false}
        currentUserId="user-1"
        onAddMeal={() => {}}
        onApprove={() => {}}
        onRemove={() => {}}
        onUnapprove={() => {}}
      />,
    );
    expect(getResolveBtn()).toBeInTheDocument();
  });

  it('shows the "Resolve choices" button for a parent on any suggestion', () => {
    const otherSuggestion = { ...suggestionWithSlots, userId: 'other-user' };
    renderWithProviders(
      <DayCard
        day={makeDay({ suggestions: [otherSuggestion] as DayPlan['suggestions'] })}
        isParent
        currentUserId="user-1"
        onAddMeal={() => {}}
        onApprove={() => {}}
        onRemove={() => {}}
        onUnapprove={() => {}}
      />,
    );
    expect(getResolveBtn()).toBeInTheDocument();
  });

  it('does NOT show the "Resolve choices" button for a non-owner child', () => {
    const otherSuggestion = { ...suggestionWithSlots, userId: 'other-user' };
    renderWithProviders(
      <DayCard
        day={makeDay({ suggestions: [otherSuggestion] as DayPlan['suggestions'] })}
        isParent={false}
        currentUserId="user-1"
        onAddMeal={() => {}}
        onApprove={() => {}}
        onRemove={() => {}}
        onUnapprove={() => {}}
      />,
    );
    expect(queryResolveBtn()).toBeNull();
  });

  it('toggles the resolver form open and closed', async () => {
    renderWithProviders(
      <DayCard
        day={makeDay({ suggestions: [suggestionWithSlots] as DayPlan['suggestions'] })}
        isParent
        currentUserId="user-1"
        onAddMeal={() => {}}
        onApprove={() => {}}
        onRemove={() => {}}
        onUnapprove={() => {}}
      />,
    );

    const toggleBtn = getResolveBtn();
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggleBtn);
    // After opening, the button text changes and aria-expanded becomes true
    expect(screen.getByRole('button', { name: /hide choices/i, expanded: true })).toBeInTheDocument();

    // The slot legend and radio options are rendered
    expect(screen.getByText('Protein')).toBeInTheDocument();
    const radioChicken = screen.getByRole('radio', { name: /chicken/i });
    expect(radioChicken).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /tofu/i })).toBeInTheDocument();

    // Close it again
    await userEvent.click(screen.getByRole('button', { name: /hide choices/i, expanded: true }));
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('renders safely when a slot response omits its options relation', async () => {
    const suggestionWithoutOptions = {
      ...suggestionWithSlots,
      meal: {
        ...suggestionWithSlots.meal,
        slots: [{ ...slotWithOptions, options: undefined }],
      },
    };
    renderWithProviders(
      <DayCard
        day={makeDay({ suggestions: [suggestionWithoutOptions] as DayPlan['suggestions'] })}
        isParent
        currentUserId="user-1"
        onAddMeal={() => {}}
        onApprove={() => {}}
        onRemove={() => {}}
        onUnapprove={() => {}}
      />,
    );

    await userEvent.click(getResolveBtn());

    expect(screen.getByText('Protein')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save choices/i })).toBeDisabled();
  });

  it('disables the "Save choices" button when not all slots are selected', async () => {
    renderWithProviders(
      <DayCard
        day={makeDay({ suggestions: [suggestionWithSlots] as DayPlan['suggestions'] })}
        isParent
        currentUserId="user-1"
        onAddMeal={() => {}}
        onApprove={() => {}}
        onRemove={() => {}}
        onUnapprove={() => {}}
        onResolveChoices={() => Promise.resolve()}
      />,
    );

    await userEvent.click(getResolveBtn());
    // No radio selected → Save button should be disabled
    const saveBtn = screen.getByRole('button', { name: /save choices/i });
    expect(saveBtn).toBeDisabled();

    // After selecting a radio, Save becomes enabled
    await userEvent.click(screen.getByRole('radio', { name: /chicken/i }));
    expect(screen.getByRole('button', { name: /save choices/i })).not.toBeDisabled();
  });

  it('calls onResolveChoices with slotId/optionId selections when submitted', async () => {
    const onResolveChoices = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <DayCard
        day={makeDay({ suggestions: [suggestionWithSlots] as DayPlan['suggestions'] })}
        isParent
        currentUserId="user-1"
        onAddMeal={() => {}}
        onApprove={() => {}}
        onRemove={() => {}}
        onUnapprove={() => {}}
        onResolveChoices={onResolveChoices}
      />,
    );

    await userEvent.click(getResolveBtn());
    await userEvent.click(screen.getByRole('radio', { name: /chicken/i }));
    await userEvent.click(screen.getByRole('button', { name: /save choices/i }));

    await waitFor(() => expect(onResolveChoices).toHaveBeenCalledTimes(1));
    expect(onResolveChoices).toHaveBeenCalledWith('s-1', [
      { slotId: 'slot-1', optionId: 'opt-chicken' },
    ]);
  });

  it('shows the resolver error message when onResolveChoices rejects', async () => {
    const onResolveChoices = vi
      .fn()
      .mockRejectedValue(new Error('Network error'));
    renderWithProviders(
      <DayCard
        day={makeDay({ suggestions: [suggestionWithSlots] as DayPlan['suggestions'] })}
        isParent
        currentUserId="user-1"
        onAddMeal={() => {}}
        onApprove={() => {}}
        onRemove={() => {}}
        onUnapprove={() => {}}
        onResolveChoices={onResolveChoices}
      />,
    );

    await userEvent.click(getResolveBtn());
    await userEvent.click(screen.getByRole('radio', { name: /chicken/i }));
    await userEvent.click(screen.getByRole('button', { name: /save choices/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/network error/i);
  });

  it('disables "Save choices" while submission is in flight', async () => {
    let resolve: () => void;
    const onResolveChoices = vi.fn(
      () => new Promise<void>(r => { resolve = r; }),
    );
    renderWithProviders(
      <DayCard
        day={makeDay({ suggestions: [suggestionWithSlots] as DayPlan['suggestions'] })}
        isParent
        currentUserId="user-1"
        onAddMeal={() => {}}
        onApprove={() => {}}
        onRemove={() => {}}
        onUnapprove={() => {}}
        onResolveChoices={onResolveChoices}
      />,
    );

    await userEvent.click(getResolveBtn());
    await userEvent.click(screen.getByRole('radio', { name: /chicken/i }));
    await userEvent.click(screen.getByRole('button', { name: /save choices/i }));

    // While resolving, the button shows "Saving…" and is disabled
    const savingBtn = await screen.findByRole('button', { name: /saving/i });
    expect(savingBtn).toBeDisabled();
    resolve!();
  });

  it('shows choice summary pills for a suggestion with resolved (snapshotted) choices', () => {
    renderWithProviders(
      <DayCard
        day={
          makeDay({
            suggestions: [suggestionWithResolvedChoices] as DayPlan['suggestions'],
          })
        }
        isParent
        currentUserId="user-1"
        onAddMeal={() => {}}
        onApprove={() => {}}
        onRemove={() => {}}
        onUnapprove={() => {}}
      />,
    );

    // The choice summary container has aria-label="Selected meal choices"
    const summary = screen.getByLabelText(/selected meal choices/i);
    expect(summary).toBeInTheDocument();
    expect(summary).toHaveTextContent('Protein: Chicken');
  });

  it('does NOT show the resolver button for an approved suggestion with slots', () => {
    const approvedWithSlots = {
      ...suggestionWithResolvedChoices,
      approved: true,
    };
    renderWithProviders(
      <DayCard
        day={makeDay({ suggestions: [approvedWithSlots] as DayPlan['suggestions'] })}
        isParent
        currentUserId="user-1"
        onAddMeal={() => {}}
        onApprove={() => {}}
        onRemove={() => {}}
        onUnapprove={() => {}}
      />,
    );
    expect(queryResolveBtn()).toBeNull();
  });

  it('does NOT block approval for a meal with no slots (non-configurable)', () => {
    renderWithProviders(
      <DayCard
        day={makeDay({ suggestions: [baseSuggestion] as DayPlan['suggestions'] })}
        isParent
        currentUserId="user-1"
        onAddMeal={() => {}}
        onApprove={() => {}}
        onRemove={() => {}}
        onUnapprove={() => {}}
      />,
    );
    // baseSuggestion has no slots → approval should not be disabled
    const approveBtn = screen.getByRole('button', { name: 'Approve suggestion' });
    expect(approveBtn).not.toBeDisabled();
  });

  it('shows additive ingredient summary in the resolver when an option has ingredients', async () => {
    const slotWithIngredient = {
      ...slotWithOptions,
      options: [
        {
          id: 'opt-chicken',
          slotId: 'slot-1',
          name: 'Chicken',
          position: 0,
          ingredients: [
            {
              id: 'oi-1',
              optionId: 'opt-chicken',
              name: 'chicken breast',
              quantity: '200',
              unit: 'g',
              category: null,
              position: 0,
            },
          ],
        },
      ],
    };
    const suggestionWithIngredients = {
      ...baseSuggestion,
      meal: {
        ...baseSuggestion.meal,
        slots: [slotWithIngredient],
      },
      choices: [],
    };

    renderWithProviders(
      <DayCard
        day={
          makeDay({
            suggestions: [suggestionWithIngredients] as DayPlan['suggestions'],
          })
        }
        isParent
        currentUserId="user-1"
        onAddMeal={() => {}}
        onApprove={() => {}}
        onRemove={() => {}}
        onUnapprove={() => {}}
      />,
    );

    // Open the resolver so the ingredient summary is visible
    await userEvent.click(getResolveBtn());
    // The additive summary "Adds: 200 g chicken breast" is shown under the option label
    expect(await screen.findByText(/adds: 200 g chicken breast/i)).toBeInTheDocument();
  });
});
