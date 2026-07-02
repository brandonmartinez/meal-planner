import { render, screen } from '@testing-library/react';
import LastCookedBadge from './LastCookedBadge';

describe('LastCookedBadge', () => {
  it('renders the times-cooked count with a multiplication sign', () => {
    render(<LastCookedBadge timesCooked={3} lastCookedOn="2026-06-15" />);
    expect(screen.getByText('Cooked 3\u00d7')).toBeInTheDocument();
  });

  it('exposes the last-cooked date via an accessible label', () => {
    render(<LastCookedBadge timesCooked={2} lastCookedOn="2026-06-15" />);
    expect(
      screen.getByLabelText('Cooked 2 times — last on 2026-06-15'),
    ).toBeInTheDocument();
  });

  it('uses a singular label for a single cook', () => {
    render(<LastCookedBadge timesCooked={1} lastCookedOn="2026-06-15" />);
    expect(
      screen.getByLabelText('Cooked 1 time — last on 2026-06-15'),
    ).toBeInTheDocument();
  });

  it('omits the date from the label when lastCookedOn is null', () => {
    render(<LastCookedBadge timesCooked={4} lastCookedOn={null} />);
    expect(screen.getByLabelText('Cooked 4 times')).toBeInTheDocument();
  });

  it('renders nothing when the meal has never been cooked (empty history)', () => {
    const { container } = render(
      <LastCookedBadge timesCooked={0} lastCookedOn={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
