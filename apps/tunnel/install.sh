#!/bin/sh
# TUNN3L installer — https://tunn3l.sh
# Usage: curl -sSf https://tunn3l.sh/install | sh

set -e

REPO="bdecrem/hilma"
INSTALL_DIR="$HOME/.tunn3l/bin"
BASE_URL="https://github.com/$REPO/releases/latest/download"

# Detect OS
OS="$(uname -s)"
case "$OS" in
  Darwin) os="darwin" ;;
  Linux)  os="linux" ;;
  *)
    echo "Error: unsupported OS: $OS"
    exit 1
    ;;
esac

# Detect architecture
ARCH="$(uname -m)"
case "$ARCH" in
  arm64|aarch64) arch="arm64" ;;
  x86_64|amd64)  arch="x64" ;;
  *)
    echo "Error: unsupported architecture: $ARCH"
    exit 1
    ;;
esac

BINARY="tunn3l-${os}-${arch}"
URL="${BASE_URL}/${BINARY}.gz"

echo "tunn3l: installing ${os}/${arch}..."

# Create install directory
mkdir -p "$INSTALL_DIR"

# Download and decompress
if command -v curl >/dev/null 2>&1; then
  curl -sSfL "$URL" | gunzip > "$INSTALL_DIR/tunn3l"
elif command -v wget >/dev/null 2>&1; then
  wget -qO- "$URL" | gunzip > "$INSTALL_DIR/tunn3l"
else
  echo "Error: curl or wget required"
  exit 1
fi

chmod +x "$INSTALL_DIR/tunn3l"

echo "tunn3l: installed to $INSTALL_DIR/tunn3l"

# Generate config with API key and device ID if not present
CONFIG_FILE="$HOME/.tunn3l/config.json"
if [ ! -f "$CONFIG_FILE" ]; then
  API_KEY="tk_$(od -An -tx1 -N16 /dev/urandom | tr -d ' \n')"
  DEVICE_ID="dv_$(od -An -tx1 -N12 /dev/urandom | tr -d ' \n')"
  cat > "$CONFIG_FILE" <<CONF
{
  "api_key": "$API_KEY",
  "device_id": "$DEVICE_ID"
}
CONF
  echo "tunn3l: API key generated"
  echo "tunn3l: device ID generated"
else
  # Existing config — ensure device_id is present
  # The CLI will auto-generate device_id on first run if missing,
  # but we also handle it here for completeness
  if ! grep -q '"device_id"' "$CONFIG_FILE" 2>/dev/null; then
    DEVICE_ID="dv_$(od -An -tx1 -N12 /dev/urandom | tr -d ' \n')"
    # Use node to safely merge into existing JSON (preserves all fields)
    if command -v node >/dev/null 2>&1; then
      node -e "
        const fs = require('fs');
        const cfg = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
        cfg.device_id = '$DEVICE_ID';
        fs.writeFileSync('$CONFIG_FILE', JSON.stringify(cfg, null, 2) + '\n');
      " 2>/dev/null && echo "tunn3l: device ID generated"
    else
      # Fallback: use sed (less safe but works for simple configs)
      sed -i.bak 's/}$/,\n  "device_id": "'"$DEVICE_ID"'"\n}/' "$CONFIG_FILE" && rm -f "${CONFIG_FILE}.bak"
      echo "tunn3l: device ID generated"
    fi
  fi
  echo "tunn3l: existing config preserved"
fi

# Check if already in PATH
case ":$PATH:" in
  *":$INSTALL_DIR:"*)
    ;;
  *)
    # Detect shell config file
    SHELL_NAME="$(basename "$SHELL")"
    case "$SHELL_NAME" in
      zsh)  RC="$HOME/.zshrc" ;;
      bash) RC="$HOME/.bashrc" ;;
      fish) RC="$HOME/.config/fish/config.fish" ;;
      *)    RC="$HOME/.profile" ;;
    esac

    EXPORT_LINE="export PATH=\"\$HOME/.tunn3l/bin:\$PATH\""

    if [ -f "$RC" ] && grep -qF '.tunn3l/bin' "$RC" 2>/dev/null; then
      : # already added
    else
      echo "" >> "$RC"
      echo "# tunn3l tunnel" >> "$RC"
      echo "$EXPORT_LINE" >> "$RC"
      echo "tunn3l: added $INSTALL_DIR to PATH in $RC"
    fi
    ;;
esac

echo ""
echo "  tunn3l installed successfully!"
echo ""
echo "  HTTP tunnel:"
echo "    tunn3l http 3000"
echo ""
echo "  SSH tunnel (requires Remote Login enabled):"
echo "    tunn3l ssh"
echo ""
echo "  Always-on (starts on boot):"
echo "    tunn3l daemon install --port 3000"
echo "    tunn3l daemon start"
echo ""
echo "  More: tunn3l --help"
echo ""
