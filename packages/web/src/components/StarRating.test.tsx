import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StarRating from './StarRating';

describe('StarRating', () => {
  it('renders 5 star radio buttons', () => {
    render(<StarRating value={0} onChange={vi.fn()} />);
    expect(screen.getAllByRole('radio')).toHaveLength(5);
  });

  it('renders a radiogroup with the default label', () => {
    render(<StarRating value={0} onChange={vi.fn()} />);
    expect(screen.getByRole('radiogroup', { name: 'Rating' })).toBeInTheDocument();
  });

  it('renders a radiogroup with a custom label', () => {
    render(<StarRating value={0} onChange={vi.fn()} label="My Rating" />);
    expect(screen.getByRole('radiogroup', { name: 'My Rating' })).toBeInTheDocument();
  });

  it('marks the correct star as checked and the rest as unchecked', () => {
    render(<StarRating value={3} onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: '1 star' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: '2 stars' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: '3 stars' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '4 stars' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: '5 stars' })).toHaveAttribute('aria-checked', 'false');
  });

  it('marks no star as checked when value is 0', () => {
    render(<StarRating value={0} onChange={vi.fn()} />);
    screen.getAllByRole('radio').forEach(star =>
      expect(star).toHaveAttribute('aria-checked', 'false'),
    );
  });

  it('calls onChange with the clicked star value', async () => {
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: '4 stars' }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('calls onChange with 0 when clicking the currently-active star (clear)', async () => {
    const onChange = vi.fn();
    render(<StarRating value={3} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: '3 stars' }));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('calls onChange with a different value when clicking a non-active star', async () => {
    const onChange = vi.fn();
    render(<StarRating value={3} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: '5 stars' }));
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('moves forward with ArrowRight', () => {
    const onChange = vi.fn();
    render(<StarRating value={2} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: '2 stars' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('moves backward with ArrowLeft', () => {
    const onChange = vi.fn();
    render(<StarRating value={3} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: '3 stars' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('does not exceed 5 with ArrowRight at the max', () => {
    const onChange = vi.fn();
    render(<StarRating value={5} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: '5 stars' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('clears to 0 with ArrowLeft at 1', () => {
    const onChange = vi.fn();
    render(<StarRating value={1} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: '1 star' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith(0);
  });
});
