import policies from 'virtual:privacy-policy';
import { Anchor, Container, SegmentedControl } from '@mantine/core';
import { Link, useSearchParams } from 'react-router';

import { lang, t } from '../i18n';
import { Markdown } from '../lesson/Markdown';

const codes = Object.keys(policies);

/** A language's name in that language ("Español"), from the browser's own data. */
function languageName(code: string): string {
  const name = new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
  return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
}

/**
 * The privacy policy at /privacy: public (signed out too), in every language there is
 * (docs/privacy.<code>.md), so a student reads it in their own: the interface language
 * first, another one with `?lang=` or the switch.
 */
export default function PrivacyPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('lang');
  const code = requested && requested in policies ? requested : codes.includes(lang) ? lang : codes[0];
  return (
    <Container size="sm" py="xl">
      <Anchor component={Link} to="/" size="sm">
        ← {t('privacy.back')}
      </Anchor>
      {codes.length > 1 && (
        <SegmentedControl
          mt="md"
          fullWidth
          aria-label={t('privacy.language')}
          value={code}
          onChange={(value) => setParams({ lang: value }, { replace: true })}
          data={codes.map((value) => ({ value, label: languageName(value) }))}
        />
      )}
      <div lang={code}>
        <Markdown source={policies[code] ?? ''} />
      </div>
    </Container>
  );
}
