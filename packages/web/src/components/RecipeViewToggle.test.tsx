import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecipeViewToggle from './RecipeViewToggle';

describe('RecipeViewToggle', () => {
  it('renders a labelled group with List and Grid buttons', () => {
    render(<RecipeViewToggle value="list" onChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Recipe view' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'List' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grid' })).toBeInTheDocument();
  });

  it('marks the active mode with aria-pressed', () => {
    render(<RecipeViewToggle value="grid" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('reports the chosen mode via onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RecipeViewToggle value="list" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Grid' }));
    expect(onChange).toHaveBeenCalledWith('grid');
  });
});
