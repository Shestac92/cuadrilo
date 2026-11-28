import { type AppSettings, updateSettingsInput } from '@cuadrilo/shared/api';
import { DEFAULT_THEME, isThemeId } from '@cuadrilo/shared/themes';
import { Router } from 'express';

import { requireTeacher } from './auth';
import * as db from './db';
import { parseBody, wrap } from './http';
import { emitToEveryone } from './live';

/**
 * The platform's settings: the same for everyone, kept in the table app_settings
 * (key → text) and changed by any teacher. A missing or unknown value (a theme
 * that has since been removed) reads as the default, so a stored value never
 * breaks the page.
 */
export function getSettings(): AppSettings {
  const theme = db.getSetting('theme');
  return { theme: isThemeId(theme) ? theme : DEFAULT_THEME };
}

/** /api/settings, for teachers; students get the settings through /api/config. */
export function settingsRouter(): Router {
  const router = Router();
  router.use(requireTeacher);

  router.get(
    '/',
    wrap((_req, res) => {
      res.json(getSettings());
    }),
  );

  // Only the settings sent change. Every open page learns the new settings at once (the theme changes
  // there without a reload).
  router.patch(
    '/',
    wrap((req, res) => {
      const input = parseBody(updateSettingsInput, req, res);
      if (!input) return;
      if (input.theme !== undefined) db.setSetting('theme', input.theme);
      const settings = getSettings();
      emitToEveryone('settings', settings);
      res.json(settings);
    }),
  );

  return router;
}
