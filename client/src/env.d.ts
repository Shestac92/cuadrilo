/** The interface language the client was built with (vite.config.ts, APP_LANG). */
/** The platform's name the client was built with (vite.config.ts, PLATFORM_NAME). */
declare const __PLATFORM_NAME__: string;
/** The interface language the client was built with (vite.config.ts, APP_LANG). */
declare const __APP_LANG__: 'es' | 'en';

/** The privacy policy in every language there is (docs/privacy.<code>.md): code → text, placeholders filled (vite.config.ts). */
declare module 'virtual:privacy-policy' {
  const policies: Record<string, string>;
  export default policies;
}
