// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  beforeEach(() => {
    // happy-dom 20 may not expose localStorage — LocaleProvider tolerates that.
    try {
      globalThis.localStorage?.clear();
    } catch { /* noop */ }
  });

  it('renders the landing page at / and not authenticated Layout', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <PublicApp />
      </MemoryRouter>
    );

    expect(screen.getByText('Knowledge, empowers.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Student Login' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Welcome Back')).not.toBeInTheDocument();

    // Codeword activity is retired — no banner, no lookup link anywhere.
    expect(screen.queryByRole('region', { name: 'The Forgery Files' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /codeword/i })).not.toBeInTheDocument();

    const courses = document.getElementById('courses');
    expect(courses).not.toBeNull();
  });

  it('links both course cards to their syllabus pages', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <PublicApp />
      </MemoryRouter>
    );

    const physicsLink = screen.getByRole('link', { name: 'See the year unit by unit' });
    expect(physicsLink).toHaveAttribute('href', '/syllabus/physics');
    const forensicsLink = screen.getByRole('link', { name: 'Open the case file: units & details' });
    expect(forensicsLink).toHaveAttribute('href', '/syllabus/forensics');
  });

  it('switches the landing page to Spanish via the header toggle', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <PublicApp />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Switch language / Cambiar idioma' }));

    expect(screen.getByText('Reglas de la Clase')).toBeInTheDocument();
    expect(screen.getAllByText('Acceso de Estudiantes').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Student Login')).not.toBeInTheDocument();
    // Toggle now offers the way back to English.
    expect(screen.getByRole('button', { name: /cambiar idioma|switch language/i })).toHaveTextContent('English');
  });

  it('redirects the legacy /es route to / in Spanish', async () => {
    render(
      <MemoryRouter initialEntries={['/es']}>
        <PublicApp />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Reglas de la Clase')).toBeInTheDocument();
    });
  });

  it('renders the Honors / CP Physics syllabus at /syllabus/physics', async () => {
    render(
      <MemoryRouter initialEntries={['/syllabus/physics']}>
        <PublicApp />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Honors / CP Physics' })).toBeInTheDocument();
    // All six OpenSciEd units render with their anchoring phenomena.
    expect(screen.getByText('Energy Flow from Earth’s Systems')).toBeInTheDocument();
    expect(screen.getByText('Stars & the Big Bang')).toBeInTheDocument();
    expect(screen.getAllByText('Anchoring phenomenon').length).toBe(6);
    // Language toggle is available on the page.
    expect(screen.getByRole('button', { name: 'Switch language / Cambiar idioma' })).toBeInTheDocument();
    // No raw i18n keys leak into the DOM.
    expect(screen.queryByText(/public\.syllabus/)).not.toBeInTheDocument();
  });

  it('renders the Forensic Science syllabus at /syllabus/forensics in Spanish', async () => {
    render(
      <MemoryRouter initialEntries={['/syllabus/forensics']}>
        <PublicApp />
      </MemoryRouter>
    );

    // Toggle to Spanish first.
    fireEvent.click(await screen.findByRole('button', { name: 'Switch language / Cambiar idioma' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Forensic Science' })).toBeInTheDocument();
    expect(screen.getByText('Análisis de Huellas Dactilares')).toBeInTheDocument();
    expect(screen.getByText('Toxicología, Armas de Fuego y Reconstrucción del Crimen')).toBeInTheDocument();
    expect(screen.getByText('¿Preguntas?')).toBeInTheDocument();
    expect(screen.queryByText(/public\.syllabus/)).not.toBeInTheDocument();
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
