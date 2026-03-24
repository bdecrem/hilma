#!/bin/sh
# BORE installer — https://bore.cx
# Usage: curl -sSf https://bore.cx/install | sh

set -e

REPO="bdecrem/hilma"
INSTALL_DIR="$HOME/.bore/bin"
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

BINARY="bore-${os}-${arch}"
URL="${BASE_URL}/${BINARY}.gz"

echo "bore: installing ${os}/${arch}..."

# Create install directory
mkdir -p "$INSTALL_DIR"

# Download and decompress
if command -v curl >/dev/null 2>&1; then
  curl -sSfL "$URL" | gunzip > "$INSTALL_DIR/bore"
elif command -v wget >/dev/null 2>&1; then
  wget -qO- "$URL" | gunzip > "$INSTALL_DIR/bore"
else
  echo "Error: curl or wget required"
  exit 1
fi

chmod +x "$INSTALL_DIR/bore"

echo "bore: installed to $INSTALL_DIR/bore"

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

    EXPORT_LINE="export PATH=\"\$HOME/.bore/bin:\$PATH\""

    if [ -f "$RC" ] && grep -qF '.bore/bin' "$RC" 2>/dev/null; then
      : # already added
    else
      echo "" >> "$RC"
      echo "# bore tunnel" >> "$RC"
      echo "$EXPORT_LINE" >> "$RC"
      echo "bore: added $INSTALL_DIR to PATH in $RC"
    fi
    ;;
esac

echo ""
echo "  bore installed successfully!"
echo ""
echo "  Quick start (foreground):"
echo "    bore http 3000"
echo ""
echo "  Always-on (starts on boot):"
echo "    bore daemon install --port 3000"
echo "    bore daemon start"
echo ""
echo "  More: bore --help"
echo ""
