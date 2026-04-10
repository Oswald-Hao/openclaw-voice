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

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WHISPER_DIR="$HOME/.local/bin"
MODEL_DIR="$HOME/.config/openclaw-voice"
MODEL_PATH="$MODEL_DIR/ggml-base.bin"

# ── Functions ──────────────────────────────────────────────

build_whisper_from_source() {
  info "Building whisper.cpp from source..."
  if ! command -v git &>/dev/null; then
    error "git is required to clone whisper.cpp. Install git first."
  fi
  if ! command -v gcc &>/dev/null; then
    error "gcc is required to build whisper.cpp. Install build-essential first."
  fi

  local WHISPER_BUILD_DIR
  WHISPER_BUILD_DIR=$(mktemp -d)
  info "Cloning whisper.cpp into $WHISPER_BUILD_DIR ..."
  git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git "$WHISPER_BUILD_DIR"
  cd "$WHISPER_BUILD_DIR"

  info "Compiling (this takes a few minutes)..."
  make -j"$(nproc)" main

  cp main "$WHISPER_DIR/whisper-cpp"
  chmod +x "$WHISPER_DIR/whisper-cpp"

  cd "$SCRIPT_DIR"
  rm -rf "$WHISPER_BUILD_DIR"
  info "whisper.cpp built and installed to $WHISPER_DIR/whisper-cpp"
}

# ── Detect package manager ─────────────────────────────────

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

# ── 1. System dependencies ─────────────────────────────────

info "Installing system dependencies..."

case $PKG_MANAGER in
  apt)  $PKG_INSTALL sox xdotool mpv alsa-utils curl ffmpeg git build-essential 2>/dev/null || warn "Some packages may already be installed" ;;
  dnf)  $PKG_INSTALL sox xdotool mpv alsa-utils curl ffmpeg git gcc gcc-c++ make 2>/dev/null || warn "Some packages may already be installed" ;;
  pacman) $PKG_INSTALL sox xdotool mpv alsa-utils curl ffmpeg git base-devel 2>/dev/null || warn "Some packages may already be installed" ;;
esac

# ── 2. Wayland: ydotool ────────────────────────────────────

if [ "$XDG_SESSION_TYPE" = "wayland" ]; then
  info "Wayland detected, installing ydotool..."
  case $PKG_MANAGER in
    apt)    $PKG_INSTALL ydotool ;;
    dnf)    $PKG_INSTALL ydotool ;;
    pacman) $PKG_INSTALL ydotool ;;
  esac
fi

# ── 3. whisper.cpp ─────────────────────────────────────────

info "Installing whisper.cpp..."
mkdir -p "$WHISPER_DIR"

if command -v whisper-cpp &>/dev/null || [ -f "$WHISPER_DIR/whisper-cpp" ]; then
  info "whisper.cpp already installed."
else
  build_whisper_from_source
fi

# ── 4. Whisper model ───────────────────────────────────────

mkdir -p "$MODEL_DIR"

if [ -f "$MODEL_PATH" ]; then
  info "Whisper model already exists at $MODEL_PATH"
else
  info "Downloading Whisper base model (~150MB)..."
  curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin" \
    -o "$MODEL_PATH"
  info "Model downloaded to $MODEL_PATH"
fi

# ── 5. Node.js deps ───────────────────────────────────────

info "Installing Node.js dependencies..."
cd "$SCRIPT_DIR"

if command -v npm &>/dev/null; then
  npm install
else
  error "npm not found. Please install Node.js first."
fi

# ── 6. Build TypeScript ────────────────────────────────────

info "Building TypeScript..."
npx tsc

# ── 7. Add whisper-cpp to PATH ─────────────────────────────

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

# ── Done ───────────────────────────────────────────────────

echo ""
info "Installation complete!"
echo ""
echo "Usage:"
echo "  npm start              Start OpenClaw Voice"
echo "  Ctrl+Alt+V             Toggle mode (command/typing/off)"
echo ""
echo "Prerequisites:"
echo "  Install OpenClaw:      curl -fsSL https://get.openclaw.ai | bash"
echo "  Start OpenClaw gateway: openclaw gateway run --port 18789"
echo ""
echo "Optional:"
echo "  systemctl --user enable openclaw-voice   Enable auto-start"
echo ""
