import { render, screen } from '@testing-library/react';
import Select from './Select';

describe('Select', () => {
  it('renders children as options', () => {
    render(
      <Select aria-label="test select">
        <option value="a">Option A</option>
        <option value="b">Option B</option>
      </Select>
    );
    expect(screen.getByRole('combobox', { name: 'test select' })).toBeInTheDocument();
    expect(screen.getByText('Option A')).toBeInTheDocument();
  });

  it('wraps the select in a relative container for chevron positioning', () => {
    render(
      <Select aria-label="wrapper test">
        <option value="x">X</option>
      </Select>
    );
    const el = screen.getByRole('combobox');
    expect(el.parentElement).toHaveClass('relative');
  });

  it('applies appearance-none to remove the native browser arrow', () => {
    render(
      <Select aria-label="appearance test">
        <option value="x">X</option>
      </Select>
    );
    expect(screen.getByRole('combobox')).toHaveClass('appearance-none');
  });

  it('renders a chevron SVG icon for the custom dropdown affordance', () => {
    render(
      <Select aria-label="chevron test">
        <option value="x">X</option>
      </Select>
    );
    const el = screen.getByRole('combobox');
    const chevron = el.parentElement?.querySelector('svg');
    expect(chevron).toBeInTheDocument();
    expect(chevron?.closest('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('applies base visual classes (bg, border, rounded) to the select', () => {
    render(
      <Select aria-label="base classes">
        <option value="x">X</option>
      </Select>
    );
    const el = screen.getByRole('combobox');
    expect(el).toHaveClass('bg-white');
    expect(el).toHaveClass('border');
    expect(el).toHaveClass('rounded');
    expect(el).toHaveClass('w-full');
  });

  it('applies standard md padding by default', () => {
    render(
      <Select aria-label="md select">
        <option value="x">X</option>
      </Select>
    );
    const el = screen.getByRole('combobox');
    expect(el).toHaveClass('px-3');
    expect(el).toHaveClass('py-2');
    expect(el).toHaveClass('pr-8');
  });

  it('applies sm size classes when selectSize="sm"', () => {
    render(
      <Select aria-label="sm select" selectSize="sm">
        <option value="x">X</option>
      </Select>
    );
    const el = screen.getByRole('combobox');
    expect(el).toHaveClass('px-2');
    expect(el).toHaveClass('py-1');
    expect(el).toHaveClass('h-9');
    expect(el).toHaveClass('text-sm');
    expect(el).toHaveClass('pr-8');
  });

  it('passes value through to the underlying select', () => {
    render(
      <Select aria-label="value test" value="b" onChange={() => {}}>
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>
    );
    expect(screen.getByRole('combobox')).toHaveValue('b');
  });

  it('is disabled when the disabled prop is set', () => {
    render(
      <Select aria-label="disabled select" disabled>
        <option value="x">X</option>
      </Select>
    );
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('places layout className overrides on the wrapper, not the select', () => {
    render(
      <Select aria-label="wide" className="w-full flex-1">
        <option value="x">X</option>
      </Select>
    );
    const el = screen.getByRole('combobox');
    // Layout classes go to the wrapper div
    expect(el.parentElement).toHaveClass('w-full');
    expect(el.parentElement).toHaveClass('flex-1');
    // The select itself still has w-full from SELECT_CLASSES
    expect(el).toHaveClass('w-full');
  });

  it('includes base focus ring classes', () => {
    render(
      <Select aria-label="focus ring">
        <option value="x">X</option>
      </Select>
    );
    const el = screen.getByRole('combobox');
    expect(el).toHaveClass('focus:ring-2');
    expect(el).toHaveClass('focus:ring-blue-500');
  });
});
