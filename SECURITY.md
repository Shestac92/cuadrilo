# Security policy

## Reporting a vulnerability

**Do not open a public issue.** On GitHub open the **Security** tab → **Report a vulnerability**. Only the maintainer sees the report. If the button is missing, open an issue that says only "I have a security report", and a private channel will be arranged.

Please include what the problem is and what an attacker could do, the steps to reproduce, the version and how Cuadrilo is run, and whether you want to be credited.

Do not test against someone else's installation or touch other people's data.

## What to expect

Cuadrilo is maintained by one person in their free time: no response time is promised, but reports are read, confirmed problems are fixed by seriousness, and you are told when a fix is out and credited unless you prefer not.

Only the latest release gets security fixes. Update with [deploy/INSTALL.md](deploy/INSTALL.md#update-the-platform).

## Scope

In scope: the code in this repository (sign-in and sessions, access between teachers and students, the API, the MCP server and OAuth, file upload) and the files in `deploy/`. How they are meant to protect an installation: [Security](docs/security.md).

Out of scope: problems in the operating system, Caddy, Node.js or other programs Cuadrilo only uses, and installations that do not follow the install guide (for example without HTTPS).

## If you run Cuadrilo

Follow the [install guide](deploy/INSTALL.md) (HTTPS, firewall, a service user without a shell, `.env` readable only by it), update when a release announces a security fix, back up `data/` before updating, and never expose `npm run dev` to the internet: it serves the repository's files, including the database.
