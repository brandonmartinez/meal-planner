import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import MealTagList from './MealTagList';
import type { Tag, Category } from '../api/taxonomy';

function tag(id: string, name: string): Tag {
  return { id, name, familyId: 'f-1' };
}
function category(id: string, name: string): Category {
  return { id, name, familyId: 'f-1' };
}

describe('MealTagList', () => {
  it('renders tags before categories as pills', () => {
    render(
      <MealTagList
        tags={[tag('t-1', 'Weeknight')]}
        categories={[category('c-1', 'Dinner')]}
      />,
    );

    const region = screen.getByLabelText('Tags and categories');
    const pills = within(region).getAllByText(/Weeknight|Dinner/);
    expect(pills.map(p => p.textContent)).toEqual(['Weeknight', 'Dinner']);
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

  it('renders nothing when there are no tags or categories', () => {
    const { container } = render(<MealTagList tags={[]} categories={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reserves a placeholder row when asked, even with no pills', () => {
    const { container } = render(
      <MealTagList tags={[]} categories={[]} reserveHeight />,
    );
    // A spacer div is rendered so sibling cards stay aligned.
    expect(container.firstChild).not.toBeNull();
    expect(screen.queryByLabelText('Tags and categories')).not.toBeInTheDocument();
  });

  it('color-codes tags and categories differently', () => {
    render(
      <MealTagList tags={[tag('t-1', 'Weeknight')]} categories={[category('c-1', 'Dinner')]} />,
    );
    expect(screen.getByText('Weeknight').className).toContain('text-blue-700');
    expect(screen.getByText('Dinner').className).toContain('text-purple-700');
  });

  it('renders pills as non-interactive elements (no buttons or links)', () => {
    render(
      <MealTagList tags={[tag('t-1', 'Weeknight')]} categories={[category('c-1', 'Dinner')]} />,
    );
    const region = screen.getByLabelText('Tags and categories');
    expect(within(region).queryByRole('button')).not.toBeInTheDocument();
    expect(within(region).queryByRole('link')).not.toBeInTheDocument();
  });
});
