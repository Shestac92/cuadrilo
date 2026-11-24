# Security

- **CSRF.** No token. A state-changing request is rejected unless it comes from our own origin (`isSameOrigin` in `server/src/security.ts`: `Sec-Fetch-Site` is not `same-site` / `cross-site` and `Origin` equals `Host`; stricter than SameSite). Sign-in and sign-out included; socket.io connections are checked the same way. The session cookie is `HttpOnly`, `SameSite=Lax` (`Secure` in production). A token used to be sent too and was removed: it was derived from the cookie, so after a sign-in in another tab every save got 403 until a reload.
- **helmet** with defaults, except `Referrer-Policy: strict-origin-when-cross-origin` (without a Referer YouTube shows Error 153) and a CSP of only `base-uri`, `object-src` and `frame-ancestors`, since the server serves only the API.
- **JSON body limit:** 1 MB.
- **Downloads from external links** (an OAuth client's description, `upload_media_from_url`) go only through `server/src/publicFetch.ts`: https, no login in the link, public addresses only. The address is checked at connect time, so DNS rebinding does not pass; redirects are followed manually and each hop checked; time and size are limited. `ALLOW_LOCAL_FETCH=1` allows http to `127.0.0.1` in tests.

**Behind a proxy** (Caddy, nginx): keep the `Host` header, pass WebSocket for `/socket.io` and pass `X-Forwarded-For`. `deploy/Caddyfile` does this; in dev Vite does (`changeOrigin: false`).
