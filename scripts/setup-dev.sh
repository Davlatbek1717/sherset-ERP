#!/usr/bin/env bash
# Linux / macOS dev environment setup (Docker yo'q)
set -euo pipefail

echo "== Moysklad Clone — Dev environment setup =="

OS="$(uname -s)"

# ── Detect package manager ────────────────────────────────────
if [[ "$OS" == "Darwin" ]]; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "!! Install Homebrew first: https://brew.sh"
    exit 1
  fi
  PM="brew"
elif [[ "$OS" == "Linux" ]]; then
  if command -v apt-get >/dev/null 2>&1; then
    PM="apt"
  elif command -v dnf >/dev/null 2>&1; then
    PM="dnf"
  else
    echo "!! Unsupported Linux distro. Install manually: postgresql-16, redis, minio, mailhog"
    exit 1
  fi
else
  echo "!! Unsupported OS: $OS"
  exit 1
fi

install_pkg() {
  case "$PM" in
    brew) brew install "$@" ;;
    apt) sudo apt-get update -qq && sudo apt-get install -y "$@" ;;
    dnf) sudo dnf install -y "$@" ;;
  esac
}

# ── Node.js via nvm ────────────────────────────────────────────
if ! command -v nvm >/dev/null 2>&1; then
  echo "Installing nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
  # shellcheck disable=SC1090
  source "$HOME/.nvm/nvm.sh"
fi
nvm install 20.11.0
nvm use 20.11.0

# ── pnpm via corepack ─────────────────────────────────────────
corepack enable
corepack prepare pnpm@9.15.0 --activate

# ── PostgreSQL 16 ─────────────────────────────────────────────
if ! command -v psql >/dev/null 2>&1; then
  echo "Installing PostgreSQL 16..."
  if [[ "$PM" == "brew" ]]; then
    brew install postgresql@16
    brew services start postgresql@16
  elif [[ "$PM" == "apt" ]]; then
    sudo apt-get install -y postgresql-16
    sudo systemctl enable --now postgresql
  elif [[ "$PM" == "dnf" ]]; then
    sudo dnf install -y postgresql16-server postgresql16
    sudo postgresql-setup --initdb
    sudo systemctl enable --now postgresql-16
  fi
fi

# ── Redis 7 ───────────────────────────────────────────────────
if ! command -v redis-server >/dev/null 2>&1; then
  echo "Installing Redis 7..."
  install_pkg redis
  if [[ "$PM" == "brew" ]]; then
    brew services start redis
  else
    sudo systemctl enable --now redis
  fi
fi

# ── MinIO ─────────────────────────────────────────────────────
if ! command -v minio >/dev/null 2>&1; then
  echo "Installing MinIO..."
  mkdir -p ./bin
  if [[ "$OS" == "Darwin" ]]; then
    curl -sSL https://dl.min.io/server/minio/release/darwin-amd64/minio -o ./bin/minio
  else
    curl -sSL https://dl.min.io/server/minio/release/linux-amd64/minio -o ./bin/minio
  fi
  chmod +x ./bin/minio
fi

# ── Mailhog ───────────────────────────────────────────────────
if [[ ! -x ./bin/mailhog ]]; then
  echo "Installing Mailhog..."
  mkdir -p ./bin
  if [[ "$OS" == "Darwin" ]]; then
    curl -sSL https://github.com/mailhog/MailHog/releases/download/v1.0.1/MailHog_darwin_amd64 -o ./bin/mailhog
  else
    curl -sSL https://github.com/mailhog/MailHog/releases/download/v1.0.1/MailHog_linux_amd64 -o ./bin/mailhog
  fi
  chmod +x ./bin/mailhog
fi

# ── .env from template ────────────────────────────────────────
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "[OK] Created .env — edit with your values"
fi

# ── Create dev database ───────────────────────────────────────
echo ""
echo "Creating dev database..."
createdb moysklad_dev 2>/dev/null || echo "  (already exists)"

# ── Install deps + setup ──────────────────────────────────────
pnpm install

echo ""
echo "== Next manual steps =="
echo "1. Start MinIO in a separate terminal:  ./bin/minio server ./data/minio --console-address :9001"
echo "2. Start Mailhog in a separate terminal: ./bin/mailhog"
echo "3. pnpm db:migrate"
echo "4. pnpm db:seed"
echo "5. pnpm dev"
echo ""
echo "[DONE]"
