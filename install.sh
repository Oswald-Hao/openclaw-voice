#!/bin/bash
set -e

echo "=== OpenClaw Voice - Installation Script ==="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Detect package manager
if command -v apt &>/dev/null; then
  PKG_MANAGER="apt"
  PKG_INSTALL="sudo apt install -y"
elif command -v dnf &>/dev/null; then
  PKG_MANAGER="dnf"
  PKG_INSTALL="sudo dnf install -y"
elif command -v pacman &>/dev/null; then
  PKG_MANAGER="pacman"
  PKG_INSTALL="sudo pacman -S --noconfirm"
else
  error "Unsupported package manager. Please install dependencies manually."
fi

# 1. Install system dependencies
info "Installing system dependencies..."

case $PKG_MANAGER in
  apt)
    $PKG_INSTALL sox xdotool mpv alsa-utils curl ffmpeg 2>/dev/null || warn "Some packages may already be installed"
    ;;
  dnf)
    $PKG_INSTALL sox xdotool mpv alsa-utils curl ffmpeg 2>/dev/null || warn "Some packages may already be installed"
    ;;
  pacman)
    $PKG_INSTALL sox xdotool mpv alsa-utils curl ffmpeg 2>/dev/null || warn "Some packages may already be installed"
    ;;
esac

# 2. Detect Wayland, install ydotool if needed
if [ "$XDG_SESSION_TYPE" = "wayland" ]; then
  info "Wayland detected, installing ydotool..."
  case $PKG_MANAGER in
    apt) $PKG_INSTALL ydotool ;;
    dnf) $PKG_INSTALL ydotool ;;
    pacman) $PKG_INSTALL ydotool ;;
  esac
fi

# 3. Install whisper.cpp
info "Installing whisper.cpp..."
WHISPER_DIR="$HOME/.local/bin"
mkdir -p "$WHISPER_DIR"

if ! command -v whisper-cpp &>/dev/null && [ ! -f "$WHISPER_DIR/whisper-cpp" ]; then
  # Detect architecture
  ARCH=$(uname -m)
  case $ARCH in
    x86_64)
      WHISPER_ARCH="x64"
      ;;
    aarch64)
      WHISPER_ARCH="arm64"
      ;;
    *)
      warn "Unsupported architecture $ARCH for pre-built binaries."
      warn "Please build whisper.cpp from source: https://github.com/ggerganov/whisper.cpp"
      WHISPER_ARCH=""
      ;;
  esac

  if [ -n "$WHISPER_ARCH" ]; then
    info "Downloading whisper.cpp for $ARCH..."
    # Download the main binary - adjust URL as needed for latest release
    WHISPER_URL="https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.5/whisper-cpp-linux-${WHISPER_ARCH}.tar.gz"
    TMP_DIR=$(mktemp -d)

    if curl -L "$WHISPER_URL" -o "$TMP_DIR/whisper-cpp.tar.gz" 2>/dev/null; then
      tar -xzf "$TMP_DIR/whisper-cpp.tar.gz" -C "$TMP_DIR"
      # Find and copy the binary
      BINARY=$(find "$TMP_DIR" -name "whisper-cpp" -o -name "main" | head -1)
      if [ -n "$BINARY" ]; then
        cp "$BINARY" "$WHISPER_DIR/whisper-cpp"
        chmod +x "$WHISPER_DIR/whisper-cpp"
        info "whisper.cpp installed to $WHISPER_DIR/whisper-cpp"
      else
        warn "Could not find whisper-cpp binary in archive."
        warn "Building from source instead..."
        build_whisper_from_source
      fi
      rm -rf "$TMP_DIR"
    else
      warn "Download failed. Building whisper.cpp from source..."
      rm -rf "$TMP_DIR"
      build_whisper_from_source
    fi
  fi
else
  info "whisper.cpp already installed."
fi

# 4. Download whisper model
MODEL_DIR="$HOME/.config/openclaw-voice"
MODEL_PATH="$MODEL_DIR/ggml-base.bin"

mkdir -p "$MODEL_DIR"

if [ ! -f "$MODEL_PATH" ]; then
  info "Downloading Whisper base model (~150MB)..."
  curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin" \
    -o "$MODEL_PATH"
  info "Model downloaded to $MODEL_PATH"
else
  info "Whisper model already exists at $MODEL_PATH"
fi

# 5. Install Node.js dependencies
info "Installing Node.js dependencies..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if command -v npm &>/dev/null; then
  npm install
else
  error "npm not found. Please install Node.js first."
fi

# 6. Build TypeScript
info "Building TypeScript..."
npx tsc

# 7. Add whisper-cpp to PATH if needed
if [ -f "$WHISPER_DIR/whisper-cpp" ]; then
  export PATH="$WHISPER_DIR:$PATH"
  SHELL_RC="$HOME/.bashrc"
  if [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
  fi

  if ! grep -q "$WHISPER_DIR" "$SHELL_RC" 2>/dev/null; then
    echo "" >> "$SHELL_RC"
    echo "# OpenClaw Voice - whisper.cpp" >> "$SHELL_RC"
    echo "export PATH=\"$WHISPER_DIR:\$PATH\"" >> "$SHELL_RC"
    info "Added $WHISPER_DIR to PATH in $SHELL_RC"
  fi
fi

echo ""
info "Installation complete!"
echo ""
echo "Usage:"
echo "  npm start              Start OpenClaw Voice"
echo "  Ctrl+Alt+V             Toggle mode (command/typing/off)"
echo ""
echo "Optional:"
echo "  systemctl --user enable openclaw-voice   Enable auto-start"
echo ""

build_whisper_from_source() {
  info "Building whisper.cpp from source..."
  WHISPER_BUILD_DIR=$(mktemp -d)
  git clone https://github.com/ggerganov/whisper.cpp.git "$WHISPER_BUILD_DIR"
  cd "$WHISPER_BUILD_DIR"
  make -j$(nproc)
  cp main "$WHISPER_DIR/whisper-cpp"
  chmod +x "$WHISPER_DIR/whisper-cpp"
  cd "$SCRIPT_DIR"
  rm -rf "$WHISPER_BUILD_DIR"
  info "whisper.cpp built and installed to $WHISPER_DIR/whisper-cpp"
}
