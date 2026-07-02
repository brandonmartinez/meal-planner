import { render, screen, fireEvent } from '@testing-library/react';
import { MealThumbnail } from './MealThumbnail';

describe('MealThumbnail', () => {
  it('renders an <img> with src/alt/lazy loading when a URL is provided', () => {
    render(
      <MealThumbnail src="https://cdn.example.com/tacos.jpg" alt="Tacos" className="h-10" />,
    );

    const img = screen.getByRole('img', { name: 'Tacos' });
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/tacos.jpg');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveClass('h-10');
  });

  it('renders nothing when src is null (graceful missing-image)', () => {
    const { container } = render(<MealThumbnail src={null} alt="Tacos" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when src is an empty string', () => {
    const { container } = render(<MealThumbnail src="" alt="Tacos" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('removes the image when it fails to load (broken URL onError)', () => {
    render(<MealThumbnail src="https://cdn.example.com/broken.jpg" alt="Tacos" />);

    const img = screen.getByRole('img', { name: 'Tacos' });
    fireEvent.error(img);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('retries rendering when the src changes after an error', () => {
    const { rerender } = render(
      <MealThumbnail src="https://cdn.example.com/broken.jpg" alt="Tacos" />,
    );

    fireEvent.error(screen.getByRole('img', { name: 'Tacos' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    rerender(<MealThumbnail src="https://cdn.example.com/fixed.jpg" alt="Tacos" />);

    const img = screen.getByRole('img', { name: 'Tacos' });
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/fixed.jpg');
  });
});
