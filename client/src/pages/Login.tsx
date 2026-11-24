import { Alert, Anchor, Button, Center, Paper, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';

import { ApiError } from '../api';
import { useAuth } from '../auth';
import { BrandLogo } from '../components/BrandLogo';
import { t } from '../i18n';

/**
 * Sign-in. Shown at any address while signed out; after signing in the same
 * address opens. Accounts are given by the teacher: no sign-up, no reset.
 */
export default function Login() {
  const { login, expired } = useAuth();
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await login(loginValue.trim(), password);
    } catch (err) {
      // The server's message (wrong credentials, too many attempts) or no connection at all.
      setError(err instanceof ApiError && err.code ? err.message : t('common.networkError'));
      setBusy(false);
    }
  };

  return (
    <Center mih="100vh" p="md" bg="var(--app-login-bg, var(--bg))">
      <Paper component="form" onSubmit={submit} className="card-edge" p="xl" w="100%" maw={380}>
        <Stack gap="md">
          <BrandLogo large />
          {expired && !error && (
            <Alert color="yellow" variant="light">
              {t('login.sessionExpired')}
            </Alert>
          )}
          <TextInput
            label={t('login.login')}
            value={loginValue}
            onChange={(e) => setLoginValue(e.currentTarget.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
          />
          <PasswordInput
            label={t('login.password')}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            autoComplete="current-password"
            required
            error={error}
          />
          <Button type="submit" loading={busy} fullWidth>
            {t('login.submit')}
          </Button>
          <Text size="sm" c="dimmed" ta="center">
            {t('login.forgot')}
          </Text>
          <Text size="sm" ta="center">
            <Anchor component={Link} to="/privacy">
              {t('privacy.link')}
            </Anchor>
          </Text>
        </Stack>
      </Paper>
    </Center>
  );
}
