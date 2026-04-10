# OpenClaw Voice

Voice-driven AI Agent powered by OpenClaw CLI. Speak commands or dictate text directly into any window.

## Features

- **Voice Command Mode**: Speak → OpenClaw executes → TTS reads the response
- **Voice Typing Mode**: Speak → Text injected into the currently focused window
- **Hotkey Switching**: `Ctrl+Alt+V` cycles through command/typing/off modes
- **Local STT**: Whisper.cpp runs locally, no cloud dependency for speech recognition
- **Free TTS**: Edge-TTS provides natural-sounding voice output at no cost

## Quick Start

```bash
# Clone and install
git clone <repo-url> openclaw-voice
cd openclaw-voice
chmod +x install.sh
./install.sh

# Run
npm start
```

## Requirements

- Linux (X11 or Wayland)
- Node.js 18+
- Microphone
- Audio output

### System Dependencies (installed by `install.sh`)

| Dependency | Purpose |
|---|---|
| whisper.cpp | Local speech-to-text |
| sox / arecord | Microphone recording |
| xdotool (X11) / ydotool (Wayland) | Text injection |
| mpv | Audio playback |
| ffmpeg | Audio format conversion |

## Configuration

Edit `config.yaml` or `~/.config/openclaw-voice/config.yaml`:

```yaml
stt:
  whisper_bin: "whisper-cpp"
  model: "~/.config/openclaw-voice/ggml-base.bin"
  language: "auto"          # auto-detect language

tts:
  enabled: true
  voice: "zh-CN-XiaoxiaoNeural"
  player: "mpv"

audio:
  sample_rate: 16000
  silence_threshold: 0.01   # VAD energy threshold
  silence_duration: 1500    # ms of silence before stopping

mode:
  default: "command"        # command | typing
```

## Usage

1. **Start**: `npm start`
2. **Toggle mode**: Press `Ctrl+Alt+V` (or type `v` + Enter in terminal)
3. **Voice commands**: Say things like "check CPU count", "open terminal"
4. **Voice typing**: Switch to typing mode, then speak to type

### Mode Switching

- **Hotkey**: `Ctrl+Alt+V` cycles: command → typing → off → command
- **Voice**: Say "进入打字模式" or "switch to typing" to switch modes

## Auto-start (systemd)

```bash
# Copy service file
mkdir -p ~/.config/systemd/user
cp systemd/openclaw-voice.service ~/.config/systemd/user/

# Enable and start
systemctl --user enable openclaw-voice
systemctl --user start openclaw-voice

# Check status
systemctl --user status openclaw-voice
```

## Architecture

```
Microphone → arecord/sox → VAD (energy threshold)
  → whisper.cpp → text
  → [Command Mode] openclaw-cli → edge-tts → mpv
  → [Typing Mode]  xdotool/ydotool → focused window
```

## License

MIT
