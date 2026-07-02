import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import TokenField from './TokenField';

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
    <TokenField
      label="Tags"
      values={values}
      onChange={next => {
        setValues(next);
        onChangeSpy?.(next);
      }}
      suggestions={suggestions}
    />
  );
}

describe('TokenField', () => {
  it('adds a token when Enter is pressed', async () => {
    const onChange = vi.fn();
    render(<Harness onChangeSpy={onChange} />);

    const input = screen.getByRole('combobox', { name: 'Tags' });
    await userEvent.type(input, 'Weeknight{Enter}');

    expect(onChange).toHaveBeenLastCalledWith(['Weeknight']);
    // The value renders as a removable pill.
    expect(screen.getByRole('button', { name: 'Remove Weeknight' })).toBeInTheDocument();
    // The draft input is cleared after adding.
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('adds a token when the Add button is clicked', async () => {
    const onChange = vi.fn();
    render(<Harness onChangeSpy={onChange} />);

    await userEvent.type(screen.getByRole('combobox', { name: 'Tags' }), 'Vegetarian');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onChange).toHaveBeenLastCalledWith(['Vegetarian']);
  });

  it('removes a token when its ✕ button is clicked', async () => {
    const onChange = vi.fn();
    render(<Harness initial={['Weeknight', 'Vegetarian']} onChangeSpy={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Remove Weeknight' }));

    expect(onChange).toHaveBeenLastCalledWith(['Vegetarian']);
    expect(screen.queryByRole('button', { name: 'Remove Weeknight' })).not.toBeInTheDocument();
  });

  it('dedupes case-insensitively so a repeated name is not added twice', async () => {
    const onChange = vi.fn();
    render(<Harness initial={['Weeknight']} onChangeSpy={onChange} />);

    await userEvent.type(screen.getByRole('combobox', { name: 'Tags' }), 'weeknight{Enter}');

    // No onChange fires because the (case-insensitive) value already exists.
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button', { name: /Remove weeknight/i })).toHaveLength(1);
  });

  it('offers datalist suggestions excluding already-selected values', () => {
    const { container } = render(
      <Harness initial={['Weeknight']} suggestions={['Weeknight', 'Vegetarian', 'Quick']} />,
    );

    const options = Array.from(container.querySelectorAll('datalist option')).map(
      o => (o as HTMLOptionElement).value,
    );
    // "Weeknight" is already a pill, so it is not offered again.
    expect(options).toEqual(['Vegetarian', 'Quick']);
  });

  it('renders no pill list when there are no values', () => {
    render(<Harness />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('does not add an empty/whitespace-only token', async () => {
    const onChange = vi.fn();
    render(<Harness onChangeSpy={onChange} />);

    await userEvent.type(screen.getByRole('combobox', { name: 'Tags' }), '   {Enter}');

    expect(onChange).not.toHaveBeenCalled();
  });
});
