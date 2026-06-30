import { render, screen } from '@testing-library/react';
import DifficultyBadge from './DifficultyBadge';

describe('DifficultyBadge', () => {
  it('renders a label for each difficulty level', () => {
    const { rerender } = render(<DifficultyBadge difficulty="EASY" />);
    expect(screen.getByText('Easy')).toBeInTheDocument();

    rerender(<DifficultyBadge difficulty="MEDIUM" />);
    expect(screen.getByText('Medium')).toBeInTheDocument();

    rerender(<DifficultyBadge difficulty="HARD" />);
    expect(screen.getByText('Hard')).toBeInTheDocument();
  });

  it('exposes the difficulty via an accessible label', () => {
    render(<DifficultyBadge difficulty="HARD" />);
    expect(screen.getByLabelText('Difficulty: Hard')).toBeInTheDocument();
  });

  it('renders nothing when difficulty is null', () => {
    const { container } = render(<DifficultyBadge difficulty={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
