import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '@mantine/core/styles.css';

import App from './App';
import { AuthProvider } from './auth';
import { loadConfig } from './config';
import { lang } from './i18n';
import { PlatformThemeProvider } from './themes/PlatformThemeProvider';
// After Mantine's styles: app-specific styles may build on them.
import './styles.css';

// The client is built for one language and the server runs with its own
// APP_LANG: a mismatch means one of them was started with another value.
loadConfig()
  .then((config) => {
    if (config.lang !== lang) console.warn(`Interface built for "${lang}", server runs with APP_LANG=${config.lang}`);
  })
  .catch(() => {});

const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root element');

createRoot(root).render(
  <StrictMode>
    <PlatformThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </PlatformThemeProvider>
  </StrictMode>,
);
