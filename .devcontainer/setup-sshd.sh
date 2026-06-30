#!/usr/bin/env bash
set -euo pipefail

ssh_user="${DEVCONTAINER_SSH_USER:-}"

if [[ -z "${ssh_user}" ]]; then
  for candidate in node vscode codespace "$(awk -F ':' '$3 == 1000 { print $1; exit }' /etc/passwd)"; do
    if [[ -n "${candidate}" ]] && id -u "${candidate}" >/dev/null 2>&1; then
      ssh_user="${candidate}"
      break
    fi
  done
fi

if [[ -z "${ssh_user}" || "${ssh_user}" == "root" ]]; then
  echo "No non-root SSH user found. Set DEVCONTAINER_SSH_USER to a non-root user." >&2
  exit 1
fi

ssh_home="$(getent passwd "${ssh_user}" | cut -d: -f6)"
authorized_keys_source="${DEVCONTAINER_AUTHORIZED_KEYS:-/workspace/.devcontainer/ssh/authorized_keys}"

sudo_if() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

sudo_if mkdir -p "${ssh_home}/.ssh"

if [[ -s "${authorized_keys_source}" ]]; then
  sudo_if cp "${authorized_keys_source}" "${ssh_home}/.ssh/authorized_keys"
  sudo_if chown "${ssh_user}:${ssh_user}" "${ssh_home}/.ssh/authorized_keys"
  sudo_if chmod 600 "${ssh_home}/.ssh/authorized_keys"
else
  sudo_if rm -f "${ssh_home}/.ssh/authorized_keys"
  echo "No SSH authorized_keys file found at ${authorized_keys_source}; SSH login remains disabled."
fi

sudo_if chown "${ssh_user}:${ssh_user}" "${ssh_home}/.ssh"
sudo_if chmod 700 "${ssh_home}/.ssh"

sudo_if mkdir -p /etc/ssh/sshd_config.d
sudo_if tee /etc/ssh/sshd_config.d/99-meal-planner-hardening.conf >/dev/null <<EOF
Port 2222
ListenAddress 0.0.0.0
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
AuthenticationMethods publickey
PermitRootLogin no
AllowUsers ${ssh_user}
EOF

sudo_if sed -i -E \
  -e 's/^#?[[:space:]]*PermitRootLogin[[:space:]].*/PermitRootLogin no/' \
  -e 's/^#?[[:space:]]*PasswordAuthentication[[:space:]].*/PasswordAuthentication no/' \
  -e 's/^#?[[:space:]]*KbdInteractiveAuthentication[[:space:]].*/KbdInteractiveAuthentication no/' \
  -e 's/^#?[[:space:]]*ChallengeResponseAuthentication[[:space:]].*/ChallengeResponseAuthentication no/' \
  -e 's/^#?[[:space:]]*PubkeyAuthentication[[:space:]].*/PubkeyAuthentication yes/' \
  /etc/ssh/sshd_config

sudo_if service ssh restart

echo "SSH is hardened for key-based login as ${ssh_user} on localhost:2222."
