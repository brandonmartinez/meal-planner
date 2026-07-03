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

  it('renders pills BELOW the input row, not above', () => {
    render(<Harness initial={['Weeknight']} />);
    const input = screen.getByRole('combobox', { name: 'Tags' });
    const pillList = screen.getByRole('list');
    // DOCUMENT_POSITION_FOLLOWING (4) means pillList comes after input in DOM order.
    expect(input.compareDocumentPosition(pillList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('adds multiple tokens from a comma-separated string via Enter', async () => {
    const onChange = vi.fn();
    render(<Harness onChangeSpy={onChange} />);

    await userEvent.type(screen.getByRole('combobox', { name: 'Tags' }), 'alpha, beta{Enter}');

    expect(onChange).toHaveBeenLastCalledWith(['alpha', 'beta']);
    expect(screen.getByRole('button', { name: 'Remove alpha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove beta' })).toBeInTheDocument();
  });

  it('adds multiple tokens via Add button with comma-separated input', async () => {
    const onChange = vi.fn();
    render(<Harness onChangeSpy={onChange} />);

    await userEvent.type(screen.getByRole('combobox', { name: 'Tags' }), 'foo, bar, baz');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onChange).toHaveBeenLastCalledWith(['foo', 'bar', 'baz']);
  });

  it('does NOT split on spaces — multi-word value stays one token', async () => {
    const onChange = vi.fn();
    render(<Harness onChangeSpy={onChange} />);

    await userEvent.type(
      screen.getByRole('combobox', { name: 'Tags' }),
      'Easy Weekday Meals{Enter}',
    );

    expect(onChange).toHaveBeenLastCalledWith(['Easy Weekday Meals']);
  });

  it('splits "test1 test2, test3" into two tokens: "test1 test2" and "test3"', async () => {
    const onChange = vi.fn();
    render(<Harness onChangeSpy={onChange} />);

    await userEvent.type(
      screen.getByRole('combobox', { name: 'Tags' }),
      'test1 test2, test3{Enter}',
    );

    expect(onChange).toHaveBeenLastCalledWith(['test1 test2', 'test3']);
  });

  it('trims whitespace around comma-separated tokens', async () => {
    const onChange = vi.fn();
    render(<Harness onChangeSpy={onChange} />);

    await userEvent.type(
      screen.getByRole('combobox', { name: 'Tags' }),
      '  alpha  ,  beta  {Enter}',
    );

    expect(onChange).toHaveBeenLastCalledWith(['alpha', 'beta']);
  });

  it('dedupes comma-separated tokens against existing values case-insensitively', async () => {
    const onChange = vi.fn();
    render(<Harness initial={['Existing']} onChangeSpy={onChange} />);

    await userEvent.type(
      screen.getByRole('combobox', { name: 'Tags' }),
      'new1, existing{Enter}',
    );

    // 'existing' is a case-insensitive match for 'Existing' — only 'new1' is added.
    expect(onChange).toHaveBeenLastCalledWith(['Existing', 'new1']);
  });

  it('clears draft and fires no onChange when all comma segments are duplicates', async () => {
    const onChange = vi.fn();
    render(<Harness initial={['Alpha']} onChangeSpy={onChange} />);

    const input = screen.getByRole('combobox', { name: 'Tags' });
    await userEvent.type(input, 'alpha{Enter}');

    expect(onChange).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe('');
  });
});
