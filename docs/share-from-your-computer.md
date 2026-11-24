# Give students access from your computer

For a few lessons, without renting a server: run Cuadrilo on your computer and open it to students through a tunnel ([ngrok](https://ngrok.com)). For permanent use, install it on a server instead ([guide](../deploy/INSTALL.md)).

It works only while your computer is on and both commands below are running.

## One-time setup

1. Install Cuadrilo as in the [quick start](../README.md#quick-start) and create a teacher.
2. Create a free ngrok account, install ngrok and add your token: `ngrok config add-authtoken YOUR_TOKEN`.
3. In the ngrok dashboard claim your free static domain (it looks like `your-name.ngrok-free.app`).
4. In `.env` (copy `.env.example` if you have no `.env` yet) set that domain:

   ```bash
   SHARE_HOSTS=your-name.ngrok-free.app
   PUBLIC_URL=https://your-name.ngrok-free.app
   ```

## Every time

In the project folder, in two terminal windows:

```bash
npm run share
```

```bash
ngrok http --url=your-name.ngrok-free.app 4173
```

Send students `https://your-name.ngrok-free.app`. They sign in with the login and password you gave them in the app ("Estudiantes"). The same address, plus `/mcp`, connects an [AI assistant](ai-assistants.md).

To stop, press Ctrl+C in both windows.

## Good to know

- **Use port 4173** (`npm run share`), never the one of `npm run dev`: the dev server serves the project's files, including the database.
- After changing `.env` or the code, stop and start `npm run share` again.
- The data stays on your computer in `./data`. Back it up: it is the only copy.
- The free ngrok plan may show students a warning page on the first visit; they press the button to go on.
- The traffic passes through ngrok. For real classes with real students, a server of your own is the better choice.
