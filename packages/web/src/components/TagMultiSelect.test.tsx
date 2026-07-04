import { fireEvent, render, screen } from '@testing-library/react';
import TagMultiSelect from './TagMultiSelect';

const OPTIONS = ['Weeknight', 'Vegan', 'Spicy', 'Quick'];

function renderSelect(values: string[] = [], onChange = () => {}) {
  return render(
    <TagMultiSelect
      options={OPTIONS}
      values={values}
      onChange={onChange}
      label="Filter by tag"
    />,
  );
}

describe('TagMultiSelect', () => {
  it('renders the combobox input', () => {
    renderSelect();
    expect(screen.getByRole('combobox', { name: 'Filter by tag' })).toBeInTheDocument();
  });

  it('shows options in a listbox when focused', () => {
    renderSelect();
    const input = screen.getByRole('combobox', { name: 'Filter by tag' });
    fireEvent.focus(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Weeknight' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Vegan' })).toBeInTheDocument();
  });

  it('hides the listbox when blurred', () => {
    renderSelect();
    const input = screen.getByRole('combobox', { name: 'Filter by tag' });
    fireEvent.focus(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.blur(input);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('calls onChange with the selected option value', () => {
    const onChange = vi.fn();
    render(
      <TagMultiSelect options={OPTIONS} values={[]} onChange={onChange} label="Filter by tag" />,
    );
    const input = screen.getByRole('combobox', { name: 'Filter by tag' });
    fireEvent.focus(input);
    fireEvent.pointerDown(screen.getByRole('option', { name: 'Weeknight' }));
    expect(onChange).toHaveBeenCalledWith(['Weeknight']);
  });

  it('renders selected values as removable chips', () => {
    renderSelect(['Weeknight', 'Vegan']);
    expect(screen.getByRole('button', { name: 'Remove Weeknight' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Vegan' })).toBeInTheDocument();
  });

  it('removes a chip when its remove button is clicked', () => {
    const onChange = vi.fn();
    render(
      <TagMultiSelect
        options={OPTIONS}
        values={['Weeknight', 'Vegan']}
        onChange={onChange}
        label="Filter by tag"
      />,
    );
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Remove Weeknight' }));
    expect(onChange).toHaveBeenCalledWith(['Vegan']);
  });

  it('excludes already-selected options from the dropdown', () => {
    renderSelect(['Weeknight']);
    const input = screen.getByRole('combobox', { name: 'Filter by tag' });
    fireEvent.focus(input);
    expect(screen.queryByRole('option', { name: 'Weeknight' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Vegan' })).toBeInTheDocument();
  });

  it('filters options by typed text', () => {
    renderSelect();
    const input = screen.getByRole('combobox', { name: 'Filter by tag' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'sp' } });
    expect(screen.getByRole('option', { name: 'Spicy' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Weeknight' })).not.toBeInTheDocument();
  });

  it('shows a placeholder when no options remain to select', () => {
    renderSelect(OPTIONS);
    const input = screen.getByRole('combobox', { name: 'Filter by tag' });
    fireEvent.focus(input);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows "No options match" when filter text has no results', () => {
    renderSelect();
    const input = screen.getByRole('combobox', { name: 'Filter by tag' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'xyz' } });
    expect(screen.getByText('No options match')).toBeInTheDocument();
  });

  it('removes the last chip on Backspace when input is empty', () => {
    const onChange = vi.fn();
    render(
      <TagMultiSelect
        options={OPTIONS}
        values={['Weeknight', 'Vegan']}
        onChange={onChange}
        label="Filter by tag"
      />,
    );
    const input = screen.getByRole('combobox', { name: 'Filter by tag' });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onChange).toHaveBeenCalledWith(['Weeknight']);
  });

  it('does not remove a chip on Backspace when input has text', () => {
    const onChange = vi.fn();
    render(
      <TagMultiSelect
        options={OPTIONS}
        values={['Weeknight']}
        onChange={onChange}
        label="Filter by tag"
      />,
    );
    const input = screen.getByRole('combobox', { name: 'Filter by tag' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'sp' } });
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
