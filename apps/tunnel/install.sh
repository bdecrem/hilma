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
