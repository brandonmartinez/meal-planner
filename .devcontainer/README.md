# Devcontainer SSH access

The devcontainer includes an SSH server for local agents and terminals. SSH is
published on `localhost:2222`, uses public-key authentication only, and disables
root login.

## Provide your public key

Create a local, untracked authorized keys file before rebuilding or restarting
the devcontainer:

```sh
mkdir -p .devcontainer/ssh
cp ~/.ssh/id_ed25519.pub .devcontainer/ssh/authorized_keys
chmod 700 .devcontainer/ssh
chmod 600 .devcontainer/ssh/authorized_keys
```

Only public keys belong in `.devcontainer/ssh/authorized_keys`. Never copy
private keys, tokens, `.env*` files, generated host keys, or personal secrets
into the repo. The `.devcontainer/ssh/` directory is gitignored.

## Connect and run the app

Rebuild or restart the devcontainer after adding your key, then connect:

```sh
ssh -p 2222 node@localhost
pnpm dev
```

The default SSH user is `node`. If your image uses a different non-root user,
set `DEVCONTAINER_SSH_USER` for the `app` service before rebuilding.

The existing forwarded application ports remain available:

- API: `http://localhost:3001`
- Web: `http://localhost:5173`
- PostgreSQL: `localhost:5432`
