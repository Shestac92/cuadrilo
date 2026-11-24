# Installing the platform on a VPS

One platform per server: Node.js runs the backend as a systemd service, Caddy serves the built client, gets
a free HTTPS certificate and passes the API to the backend. Everything of the platform lives in one folder,
`/opt/cuadrilo` (code, settings in `.env`, data in `data/`).

The commands are for Debian / Ubuntu and are run as `root` over SSH. Copy a block, replace the words in
CAPITALS with your own values, paste it.

| Replace | With |
|---|---|
| `YOUR_DOMAIN` | your domain, without `https://` (for example `classes.example.com`) |
| `SERVER_IP` | the public IP address of the server |
| `Shestac92/cuadrilo` | the address of the repository on GitHub |
| `VERSION` | a release of the platform (for example `v0.1.0`), or `main` for the latest code |

## 0. What you need

- A **clean** VPS (Debian 12+ or Ubuntu 22.04+, 2 GB of memory is comfortable; less was not tried) with `root` access over SSH.
  Choose an image **without a control panel** (ispmanager, cPanel and the like): they come with their own web server
  that takes ports 80 and 443.
- **A domain of your own** (a few euros a year at any registrar). Do not use the technical name your hosting gives
  the server (`xxx.hosting.com`): the certificate authority limits certificates per domain, and such a domain is shared by
  all the clients of the hosting, so the limit is usually used up. A free subdomain from a service such as
  duckdns.org works for a test.
- Ports 22, 80 and 443 open (also in the hosting's own firewall, if it has one).

## 1. Point the domain at the server

In the DNS settings of the domain create a record:

| Name | Type | Value |
|---|---|---|
| your domain or subdomain | `A` | `SERVER_IP` |

Check that it is visible from outside (it can take from a few minutes to an hour). The command must print `SERVER_IP`:

```bash
dig +short YOUR_DOMAIN @1.1.1.1
```

Do not go on until it does: the certificate cannot be issued before. (No `dig`? `apt-get install -y dnsutils`.)

## 2. Connect to the server

```bash
ssh root@SERVER_IP
```

Everything below is run on the server.

## 3. Check that the web ports are free

```bash
ss -ltnp | grep -E ':(80|443|8080)\b'
```

It must print nothing. If it shows `nginx`, `apache2` or another web server and you do not need it, remove it
(here for Apache; use `nginx` instead of `apache2` for nginx):

```bash
systemctl disable --now apache2
apt-get purge -y apache2 && apt-get autoremove -y
```

If something stays on the ports (a panel brings its own services), reinstall the server with a clean image.

## 4. Install Node.js

The platform needs Node.js **22.13 or newer**.

```bash
apt-get update && apt-get install -y curl ca-certificates gnupg
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs build-essential
node -v
```

`node -v` prints a version starting with `v22.`.

## 5. Install Caddy

Caddy is not in the standard repositories of every system, so its official repository is added first:

```bash
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy
caddy version
```

## 6. The user and the folder

The platform runs under its own user without a login shell and keeps everything in one folder:

```bash
useradd --system --home-dir /opt/cuadrilo --shell /usr/sbin/nologin cuadrilo
mkdir -p /opt/cuadrilo/data
chown -R cuadrilo:cuadrilo /opt/cuadrilo
chmod 755 /opt/cuadrilo
chmod 700 /opt/cuadrilo/data
```

## 7. Download the platform

```bash
curl -L https://github.com/Shestac92/cuadrilo/archive/refs/tags/VERSION.tar.gz \
  | tar -xz --strip-components=1 -C /opt/cuadrilo
chown -R cuadrilo:cuadrilo /opt/cuadrilo
```

(For the latest code instead of a release: `.../archive/refs/heads/main.tar.gz`.)

## 8. Settings (`.env`)

Put your values in and run the command: it creates the file `/opt/cuadrilo/.env`. A value with spaces goes in
double quotes. Run it again with new values to change a setting (it rewrites the whole file). Every setting is explained in
`.env.example`.

```bash
cat > /opt/cuadrilo/.env <<'EOF'
NODE_ENV=production
PORT=8080
DATA_DIR=/opt/cuadrilo/data
PUBLIC_URL=https://YOUR_DOMAIN
APP_LANG=es
TRANSLATION_LANG=ru
PLATFORM_NAME="Name of your platform"
CONTROLLER_NAME="Teacher or school name"
CONTROLLER_CONTACT=teacher@example.com
HOST_NAME="Hosting company name"
HOSTING_COUNTRY="Country of the server"
EOF
chown cuadrilo:cuadrilo /opt/cuadrilo/.env
chmod 600 /opt/cuadrilo/.env
```

- `NODE_ENV=production` is required: it makes the login cookie secure (HTTPS only).
- `PUBLIC_URL` is without a slash at the end.
- `APP_LANG` is the interface language (`es` or `en`); `TRANSLATION_LANG` is the students' own language for the translator,
  and the dictionary of the pair must exist in `dictionaries/` (`es-ru.db` comes with the platform). Leave `TRANSLATION_LANG`
  out and there is no translator.
- `FAVICON` (optional) is your own icon of the browser tab: see "Your own tab icon" right below.
- `CONTROLLER_*`, `HOST_NAME`, `HOSTING_COUNTRY` (and the optional `TRANSFER_NOTE`) fill the privacy policy page.
- The client is built with these values (step 9): **after changing any of them, run step 9 again** and restart the service.

### Your own tab icon (optional)

Without it the platform shows its own icon. To use yours:

1. Make an icon at https://favicon.io (it can draw one from a text, a picture or an emoji). Download the **zip package** and take
   the file **`favicon.ico`** from it. Do not take `favicon-16x16.png` or `favicon-32x32.png`: they are too small and look blurred
   on screens with a sharp display; `favicon.ico` holds several sizes and the browser picks the right one.
2. Copy it to the data folder of the server. On your computer (not on the server):

   ```bash
   scp ~/Downloads/favicon_io/favicon.ico root@SERVER_IP:/opt/cuadrilo/data/favicon.ico
   ```

3. On the server, give the file to the platform's user and add the setting to `.env`:

   ```bash
   chown cuadrilo:cuadrilo /opt/cuadrilo/data/favicon.ico
   echo 'FAVICON=/opt/cuadrilo/data/favicon.ico' >> /opt/cuadrilo/.env
   ```

The icon is taken in when the client is built (step 9). The data folder is a good place for the file: updates leave it as it is and
a backup includes it. To change the icon later, replace the file and build the client again (the "Update" steps 3 and 4);
a browser keeps an old icon for a long time, a hard refresh (Ctrl+Shift+R) or a new tab shows the new one. `.png` and `.svg` files
work too, but `.ico` is the one to choose.

## 9. Install the dependencies and build the client

```bash
cd /opt/cuadrilo
runuser -u cuadrilo -- npm ci
runuser -u cuadrilo -- npm run build -w client
ls client/dist | head -3
```

A warning that a value of the privacy policy is missing means a line is absent from `.env`. The `ls` shows `index.html`.

## 10. The service

```bash
cp /opt/cuadrilo/deploy/cuadrilo.service /etc/systemd/system/cuadrilo.service
systemctl daemon-reload
systemctl enable --now cuadrilo
sleep 3
systemctl status cuadrilo --no-pager
curl -s http://127.0.0.1:8080/api/config
```

The status says `active (running)`; the last command prints something like `{"lang":"es","dictionary":true,"theme":"classic"}`.
If not: `journalctl -u cuadrilo -n 30 --no-pager`.

## 11. The firewall

The backend listens on port 8080 on all interfaces; only Caddy is meant to reach it. Close everything but SSH and the web:

```bash
apt-get install -y ufw
ufw allow 22/tcp
ufw allow 80,443/tcp
ufw enable
```

Allow SSH **before** `ufw enable`; if your SSH runs on another port, allow that port instead of 22.

## 12. HTTPS (Caddy)

```bash
sed 's/^DOMAIN /YOUR_DOMAIN /' /opt/cuadrilo/deploy/Caddyfile > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl enable --now caddy
systemctl restart caddy
sleep 30
curl -I https://YOUR_DOMAIN
```

`caddy validate` ends with `Valid configuration`; `curl` prints `HTTP/2 200`. The certificate is obtained by Caddy itself in
those seconds and renewed on its own. If it fails: `journalctl -u caddy -n 30 --no-pager`.

## 13. The first teacher

The password is shown once (only its hash is stored): save it.

```bash
cd /opt/cuadrilo
runuser -u cuadrilo -- npm run create-teacher -w server -- LOGIN
```

Open `https://YOUR_DOMAIN` and sign in with `LOGIN` and that password. The teacher adds the students in the app.

To let an AI assistant (Claude, ChatGPT) create lessons: in the app open **Asistentes IA** in the teacher's menu, copy the address `https://YOUR_DOMAIN/mcp` and add it as a custom connector (Claude: Settings → Connectors → Add custom connector; ChatGPT: Connectors). Details: [How to connect an assistant](../docs/ai-assistants.md#how-to-connect-an-assistant).

## 14. Check that it survives a reboot

```bash
reboot
```

Sign in again and:

```bash
systemctl is-active cuadrilo caddy
ss -ltnp | grep -E ':(80|443|8080)\b'
```

Both services are `active`; `caddy` holds 80 and 443, `node` holds 8080 (closed to the outside by the firewall).

---

## Back up the data and restore it

All that cannot be recreated is in `/opt/cuadrilo/data`: the database `lessons.db` (lessons, students, answers,
homework) and `media/` (pictures and audio). The code and the settings can be downloaded and written again, this folder cannot:
**keep a copy on your own computer**.

### Make a copy

The database keeps part of its data in side files while the service runs, so the service is stopped for a few
seconds for a consistent copy.

On the server:

```bash
systemctl stop cuadrilo
tar -czf /root/cuadrilo-data-$(date +%F).tar.gz -C /opt/cuadrilo data
systemctl start cuadrilo
ls -lh /root/cuadrilo-data-*.tar.gz
```

On your computer (not on the server):

```bash
scp root@SERVER_IP:/root/cuadrilo-data-*.tar.gz ~/Downloads/
```

Then delete the copy from the server so that old dumps do not pile up there:

```bash
rm /root/cuadrilo-data-*.tar.gz
```

The archive holds the students' personal data and password hashes: keep it only where you keep other private files.
Copy before every update (see below) and regularly (say, weekly) otherwise.

### Restore a copy (or move to another server)

Install the platform on the new server with steps 0–10 (a first start creates an empty `data/`), then put the copy in its place.

On your computer:

```bash
scp ~/Downloads/cuadrilo-data-DATE.tar.gz root@SERVER_IP:/root/
```

On the server:

```bash
systemctl stop cuadrilo
mv /opt/cuadrilo/data /opt/cuadrilo/data.old
tar -xzf /root/cuadrilo-data-DATE.tar.gz -C /opt/cuadrilo
chown -R cuadrilo:cuadrilo /opt/cuadrilo/data
chmod 700 /opt/cuadrilo/data
systemctl start cuadrilo
sleep 3
journalctl -u cuadrilo -n 20 --no-pager
```

The log has no errors. Sign in and look at a lesson with a picture. When everything is in place, clean up:

```bash
rm -rf /opt/cuadrilo/data.old /root/cuadrilo-data-DATE.tar.gz
```

Notes:

- A copy restores onto the same or a **newer** version of the platform (the database is brought up to date at the start).
  An older version refuses a database from a newer one: update the platform first.
- When you move to another domain, `PUBLIC_URL` in `.env` changes and the client is built again (step 9); the links
  students have and the connection of AI assistants change with the address.

---

## Update the platform

Updating takes a few minutes during which the platform is down (a good time is an evening). The settings (`.env`) and the data are not
in the downloaded archive, so they stay as they are.

**1. Stop and copy the data** (as in "Make a copy"; keep the file until the update is checked):

```bash
systemctl stop cuadrilo
tar -czf /root/cuadrilo-data-$(date +%F).tar.gz -C /opt/cuadrilo data
```

**2. Download the new version over the old one:**

```bash
curl -L https://github.com/Shestac92/cuadrilo/archive/refs/tags/VERSION.tar.gz \
  | tar -xz --strip-components=1 -C /opt/cuadrilo
chown -R cuadrilo:cuadrilo /opt/cuadrilo
```

**3. Dependencies and the client:**

```bash
cd /opt/cuadrilo
runuser -u cuadrilo -- npm ci
runuser -u cuadrilo -- npm run build -w client
```

**4. Start and check:**

```bash
systemctl start cuadrilo
sleep 3
journalctl -u cuadrilo -n 20 --no-pager
curl -s http://127.0.0.1:8080/api/config
```

The log has no errors (changes of the database are applied here, at the start), the last command prints JSON. Sign in
and look at a few lessons.

If the notes of the release say that `deploy/cuadrilo.service` or `deploy/Caddyfile` changed, put them in place again
(steps 10 and 12) and run `systemctl daemon-reload` / `systemctl restart caddy`.

**5. Clean up** when everything works (the copy on your own computer stays, see "Make a copy"):

```bash
rm /root/cuadrilo-data-*.tar.gz
```

Files that a new version dropped stay in the folder; they do no harm.

### Something went wrong: roll back

```bash
systemctl stop cuadrilo
mv /opt/cuadrilo/data /opt/cuadrilo/data.broken
tar -xzf /root/cuadrilo-data-DATE.tar.gz -C /opt/cuadrilo
```

Then download the **previous** version as in step 2 and do steps 3 and 4 (the data copy is from before the update, so the older
version accepts it). When it works, `rm -rf /opt/cuadrilo/data.broken`.

---

## Everyday commands

```bash
systemctl status cuadrilo caddy       # the state
journalctl -u cuadrilo -f             # the platform's log (Ctrl+C to leave)
journalctl -u caddy -n 50 --no-pager          # Caddy and the certificate
systemctl restart cuadrilo            # after a change of .env (and step 9 if it is a build-time value)
```

## If something goes wrong

| What you see | Why, and what to do |
|---|---|
| `curl` to `https://YOUR_DOMAIN` ends with a TLS error | the certificate is not issued yet: wait a minute, then `journalctl -u caddy -n 30 --no-pager` |
| Caddy log: `no valid A records` / validation points at another IP | the DNS record is wrong or not spread yet: `dig +short YOUR_DOMAIN @1.1.1.1` must print `SERVER_IP` (step 1) |
| Caddy log: `rateLimited ... too many certificates` | the domain is shared with many others (a hosting's technical name): use a domain of your own |
| Caddy does not start, port 80 or 443 busy | another web server runs (step 3) |
| the service restarts all the time | `journalctl -u cuadrilo -n 30 --no-pager`: the usual causes are a wrong path in `DATA_DIR`, a port taken by another program, a broken `.env` |
| `EACCES` during `npm ci` | the folder belongs to another user: `chown -R cuadrilo:cuadrilo /opt/cuadrilo` |
| `Missing script: "build"` | the client is built with `npm run build -w client`, not `npm run build` |
| the site does not open, Caddy is fine | the ports 80 and 443 are closed in the hosting's own firewall |
