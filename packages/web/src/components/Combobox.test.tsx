import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import Combobox from './Combobox';

/** Controlled harness so we can assert on the emitted value array. */
function Harness({
  initial = [],
  suggestions = [],
  onChangeSpy,
}: {
  initial?: string[];
  suggestions?: string[];
  onChangeSpy?: (v: string[]) => void;
}) {
  const [values, setValues] = useState<string[]>(initial);
  return (
    <Combobox
      label="Collections"
      values={values}
      onChange={next => {
        setValues(next);
        onChangeSpy?.(next);
      }}
      suggestions={suggestions}
      placeholder="Add to a collection…"
    />
  );
}

describe('Combobox', () => {
  it('renders label and input with no pills when empty', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Collections')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('adds a token when Enter is pressed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChangeSpy={onChange} />);

    const input = screen.getByRole('combobox');
    await user.type(input, 'Garden{Enter}');

    expect(onChange).toHaveBeenLastCalledWith(['Garden']);
    expect(screen.getByRole('button', { name: 'Remove Garden' })).toBeInTheDocument();
    // Draft input cleared after adding.
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('adds a token when the Add button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChangeSpy={onChange} />);

    await user.type(screen.getByRole('combobox'), 'Quick Meals');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onChange).toHaveBeenLastCalledWith(['Quick Meals']);
  });

  it('removes a token when its ✕ button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={['Garden', 'Weeknight']} onChangeSpy={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Remove Garden' }));

    expect(onChange).toHaveBeenLastCalledWith(['Weeknight']);
    expect(screen.queryByRole('button', { name: 'Remove Garden' })).not.toBeInTheDocument();
  });

  it('selects an existing suggestion from the dropdown via pointer', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Harness suggestions={['Garden', 'Weeknight', 'Quick']} onChangeSpy={onChange} />,
    );

    await user.type(screen.getByRole('combobox'), 'Gar');
    // Option should be visible in the listbox.
    const option = screen.getByRole('option', { name: 'Garden' });
    // Use pointerDown (matching the component's onPointerDown handler) so blur
    // doesn't fire and close the list before selection.
    fireEvent.pointerDown(option);

    expect(onChange).toHaveBeenLastCalledWith(['Garden']);
    // Dropdown closes after selection.
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('creates a new token not present in suggestions (create-on-assign)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Harness suggestions={['Garden', 'Weeknight']} onChangeSpy={onChange} />,
    );

    const input = screen.getByRole('combobox');
    await user.type(input, 'Brand New Collection{Enter}');

    expect(onChange).toHaveBeenLastCalledWith(['Brand New Collection']);
  });

  it('dedupes case-insensitively and does not add a repeated name', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={['Garden']} onChangeSpy={onChange} />);

    await user.type(screen.getByRole('combobox'), 'garden{Enter}');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button', { name: /Remove garden/i })).toHaveLength(1);
  });

  it('does not add an empty or whitespace-only token', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChangeSpy={onChange} />);

    await user.type(screen.getByRole('combobox'), '   {Enter}');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('filters suggestions to exclude already-selected values', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={['Garden']}
        suggestions={['Garden', 'Weeknight', 'Quick']}
      />,
    );

    // 'e' is in both 'Garden' and 'Weeknight', so the text-filter alone would
    // show both — but 'Garden' is already selected, so it must be excluded.
    await user.type(screen.getByRole('combobox'), 'e');

    // The listbox should be open; Garden is already selected so not offered.
    const options = screen.getAllByRole('option').map(o => o.textContent);
    expect(options).not.toContain('Garden');
    expect(options).toContain('Weeknight');
  });

  it('navigates suggestions with ArrowDown and selects with Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Harness suggestions={['Garden', 'Weeknight']} onChangeSpy={onChange} />,
    );

    const input = screen.getByRole('combobox');
    await user.type(input, 'a');

    // Move to first option.
    await user.keyboard('{ArrowDown}');
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    // Confirm the highlighted option.
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalled();
  });

  it('dismisses the dropdown on Escape without adding a token', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness suggestions={['Garden', 'Weeknight']} onChangeSpy={onChange} />);

    await user.type(screen.getByRole('combobox'), 'G');
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders pills with accessible remove buttons for initial values', () => {
    render(<Harness initial={['Garden', 'Weeknight']} />);

    expect(screen.getByRole('button', { name: 'Remove Garden' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Weeknight' })).toBeInTheDocument();
  });
});
