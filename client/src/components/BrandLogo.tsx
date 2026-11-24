import { Anchor, Text, Title } from '@mantine/core';
import { Link } from 'react-router';

import { t } from '../i18n';
import { PLATFORM_NAME } from '../platform';

/**
 * Platform name + tagline, the same block as on the sign-in page.
 * - name: `PLATFORM_NAME` (build-time env)
 * - line under it: `t('app.tagline')` (i18n: «Clases de español» / "English lessons")
 * `link`: clickable home (navbar); without it, plain text (login).
 */
export function BrandLogo({
  link,
  onNavigate,
  large,
}: {
  link?: boolean;
  onNavigate?: () => void;
  /** Login page: larger title. */
  large?: boolean;
}) {
  const body = (
    <div className="brand-logo">
      {large ? (
        <Title order={2}>{PLATFORM_NAME}</Title>
      ) : (
        <Text fw={700} lh={1.2} className="brand-logo-name">
          {PLATFORM_NAME}
        </Text>
      )}
      <Text c="dimmed" size={large ? undefined : 'sm'} lh={1.3}>
        {t('app.tagline')}
      </Text>
    </div>
  );

  if (!link) return body;
  return (
    <Anchor component={Link} to="/" underline="never" c="inherit" className="nav-logo" onClick={onNavigate}>
      {body}
    </Anchor>
  );
}
