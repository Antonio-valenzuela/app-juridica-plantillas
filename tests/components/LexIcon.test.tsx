// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LexIcon } from '@/components/layout/LexIcon';

describe('LexIcon', () => {
  it('renders a local SVG icon without exposing font ligature names', () => {
    render(<LexIcon name="home" label="Inicio" />);

    const icon = screen.getByLabelText('Inicio');
    expect(icon.tagName.toLowerCase()).toBe('svg');
    expect(icon).not.toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByText('dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('home')).not.toBeInTheDocument();
  });
});
