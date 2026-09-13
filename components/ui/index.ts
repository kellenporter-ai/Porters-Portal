/**
 * components/ui — shadcn-style primitive barrel (ADR 2026-09-12-shadcn-portal-ui-convention).
 * Import primitives from here: `import { Button, Card, Badge } from '../components/ui';`
 */
export { Button } from './button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './button';

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './card';
export type {
  CardProps,
  CardHeaderProps,
  CardTitleProps,
  CardDescriptionProps,
  CardContentProps,
  CardFooterProps,
} from './card';

export { Badge } from './badge';
export type { BadgeProps, BadgeTone } from './badge';
