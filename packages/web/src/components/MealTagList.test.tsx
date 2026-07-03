import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import MealTagList from './MealTagList';
import type { Tag } from '../api/taxonomy';

function tag(id: string, name: string): Tag {
  return { id, name, familyId: 'f-1' };
}

describe('MealTagList', () => {
  it('renders tags as pills', () => {
    render(<MealTagList tags={[tag('t-1', 'Weeknight')]} />);

    const region = screen.getByLabelText('Tags');
    const pills = within(region).getAllByText(/Weeknight/);
    expect(pills.map(p => p.textContent)).toEqual(['Weeknight']);
  });

  it('caps the visible pills and collapses the rest into a +N chip', () => {
    render(
      <MealTagList
        tags={[
          tag('t-1', 'A'),
          tag('t-2', 'B'),
          tag('t-3', 'C'),
          tag('t-4', 'D'),
          tag('t-5', 'E'),
        ]}
        max={3}
      />,
    );

    // Only the first three names are visible…
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.queryByText('D')).not.toBeInTheDocument();
    expect(screen.queryByText('E')).not.toBeInTheDocument();
    // …and the overflow is announced as "+2" with an accessible label.
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByLabelText('2 more')).toBeInTheDocument();
  });

  it('renders nothing when there are no tags', () => {
    const { container } = render(<MealTagList tags={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reserves a placeholder row when asked, even with no pills', () => {
    const { container } = render(<MealTagList tags={[]} reserveHeight />);
    // A spacer div is rendered so sibling cards stay aligned.
    expect(container.firstChild).not.toBeNull();
    expect(screen.queryByLabelText('Tags')).not.toBeInTheDocument();
  });

  it('color-codes tag pills', () => {
    render(<MealTagList tags={[tag('t-1', 'Weeknight')]} />);
    expect(screen.getByText('Weeknight').className).toContain('text-blue-700');
  });

  it('renders pills as non-interactive elements (no buttons or links)', () => {
    render(<MealTagList tags={[tag('t-1', 'Weeknight')]} />);
    const region = screen.getByLabelText('Tags');
    expect(within(region).queryByRole('button')).not.toBeInTheDocument();
    expect(within(region).queryByRole('link')).not.toBeInTheDocument();
  });
});
