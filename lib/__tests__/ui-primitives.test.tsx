// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

describe('Button', () => {
  it('renders a button with default primary variant classes', () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain('bg-[var(--accent)]');
  });

  it('applies variant and size class overrides', () => {
    render(
      <Button variant="outline" size="sm">
        Cancel
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Cancel' });
    expect(btn.className).toContain('border-[var(--border-accent)]');
    expect(btn.className).toContain('h-8');
  });

  it('merges extra className via cn()', () => {
    render(<Button className="my-extra">Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' }).className).toContain('my-extra');
  });

  it('forwards ref to the underlying button element', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('is disabled when disabled prop is set', () => {
    render(<Button disabled>Nope</Button>);
    expect(screen.getByRole('button', { name: 'Nope' })).toBeDisabled();
  });
});

describe('Card', () => {
  it('renders card with semantic subcomponents', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Unit 3</CardTitle>
          <CardDescription>Kinematics overview</CardDescription>
        </CardHeader>
        <CardContent>Body content</CardContent>
        <CardFooter>
          <Button>Continue</Button>
        </CardFooter>
      </Card>,
    );
    expect(screen.getByText('Unit 3').tagName).toBe('H3');
    expect(screen.getByText('Kinematics overview')).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });
});

describe('Badge', () => {
  it('renders with default neutral tone', () => {
    render(<Badge>Active</Badge>);
    const badge = screen.getByText('Active');
    expect(badge.tagName).toBe('SPAN');
    expect(badge.className).toContain('rounded-full');
  });

  it('applies tone-specific classes', () => {
    render(<Badge tone="success">Passed</Badge>);
    expect(screen.getByText('Passed').className).toContain('text-emerald-700');
  });

  it('light-mode dual-class pattern: light shade + dark variant for every tone', () => {
    render(
      <>
        <Badge tone="accent">A</Badge>
        <Badge tone="warning">W</Badge>
        <Badge tone="error">E</Badge>
        <Badge tone="info">I</Badge>
      </>,
    );
    for (const label of ['A', 'W', 'E', 'I']) {
      const cls = screen.getByText(label).className;
      expect(cls).toMatch(/text-\w+-(600|700)\s/);
      expect(cls).toContain('dark:text-');
    }
  });
});
