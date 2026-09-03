// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PublicApp from '../../components/public/PublicApp';

vi.mock('../../lib/firebase', () => ({
  auth: {},
  googleProvider: {},
}));

vi.mock('../../components/PortalLogo', () => ({
  default: () => <svg data-testid="portal-logo" />,
}));

describe('PublicApp routing', () => {
  it('renders the landing page at / and not authenticated Layout', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <PublicApp />
      </MemoryRouter>
    );

    expect(screen.getByText('Knowledge, empowers.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Student Login' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Welcome Back')).not.toBeInTheDocument();
  });

  it('renders the Spanish landing page at /es', () => {
    render(
      <MemoryRouter initialEntries={['/es']}>
        <PublicApp />
      </MemoryRouter>
    );

    expect(screen.getByText('Reglas de la Clase')).toBeInTheDocument();
    expect(screen.getAllByText('Acceso de Estudiantes').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Student Login')).not.toBeInTheDocument();
    const esToggle = screen.getByText('English').closest('a');
    expect(esToggle).toHaveAttribute('href', '/');
  });

  it('renders GoogleLogin at /login', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <PublicApp />
      </MemoryRouter>
    );

    expect(screen.getByText('Welcome Back')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in with Google/i })).toBeInTheDocument();
  });
});
