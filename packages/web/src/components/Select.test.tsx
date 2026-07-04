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

  it('applies standard md padding by default', () => {
    render(
      <Select aria-label="md select">
        <option value="x">X</option>
      </Select>
    );
    const el = screen.getByRole('combobox');
    expect(el).toHaveClass('px-3');
    expect(el).toHaveClass('py-2');
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
    expect(el).toHaveClass('text-sm');
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

  it('accepts extra className for width or other overrides', () => {
    render(
      <Select aria-label="wide" className="w-full flex-1">
        <option value="x">X</option>
      </Select>
    );
    const el = screen.getByRole('combobox');
    expect(el).toHaveClass('w-full');
    expect(el).toHaveClass('flex-1');
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
