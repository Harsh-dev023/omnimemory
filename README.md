<div align="center">

# 🧠 OmniMemory

### **Privacy-First, 100% Offline Ambient System Context Engine for Developers**

[![Local-First](https://img.shields.io/badge/Local--First-100%25-059669?style=for-the-badge&logo=sqlite&logoColor=white)](https://github.com/)
[![Privacy Guarantee](https://img.shields.io/badge/Privacy-Zero%20Cloud-2563EB?style=for-the-badge&logo=shield&logoColor=white)](https://github.com/)
[![Query Latency](https://img.shields.io/badge/Latency-44ms%20Median-EA580C?style=for-the-badge&logo=speedtest&logoColor=white)](https://github.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://github.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-9333EA?style=for-the-badge)](https://opensource.org/licenses/MIT)

<br/>

**OmniMemory** captures terminal output and active screen text, scrubs secrets and credentials directly in RAM using Shannon Entropy and regex guards, and indexes snippets into a single-file hybrid vector/full-text database (`sqlite-vec` + `FTS5`) for instant natural language retrieval via a global hotkey.

[Features](#-key-features) • [Architecture](#-system-architecture) • [Benchmarks](#-benchmark-performance) • [Quickstart](#-quickstart) • [Shell Hooks](#-shell-integration) • [CLI Reference](#-cli-command-reference)

</div>

---

## ⚡ Key Features

- **🛡️ 100% Local & Zero Cloud Guarantee**: All operations (OCR, secret scrubbing, ONNX vector embeddings, and full-text search) execute strictly on-device. No telemetry, no external API keys, zero outbound network traffic.
- **🔐 In-RAM Secret Redactor**: Multi-layer security pipeline using regex detection and Shannon Entropy analysis strips JWTs, AWS credentials, database connection strings, bearer tokens, and high-entropy passwords before writing to disk or embedding.
- **⚡ Hybrid Reciprocal Rank Fusion (RRF)**: Combines exact keyword matches (`SQLite FTS5 BM25`) with dense semantic vector similarity (`sqlite-vec` + `bge-small-en-v1.5`) via rank fusion:
  $$\text{RRF}(d) = \frac{1}{60 + r_{\text{FTS}}(d)} + \frac{1}{60 + r_{\text{Vector}}(d)}$$
- **🖼️ Smart Frame Differencing**: Background screen daemon computes 64-bit perceptual hashes (`dHash`). OCR runs only when window state changes, maintaining near-zero idle CPU consumption.
- **⌨️ Universal Hotkey & TUI**: Instant launcher overlay triggered via global shortcut (`Cmd+Shift+Space`) with immediate copy-to-clipboard functionality.
- **🛠️ Self-Maintaining**: Built-in automated retention cleaner, SQLite incremental vacuuming, and OS-native background daemon registration (`launchd` on macOS, `systemd` on Linux).

---

## 📐 System Architecture

```text
                               ┌───────────────────────────┐
                               │     Capture Sources       │
                               │  Terminal PTY / Screen    │
                               └─────────────┬─────────────┘
                                             │
                                             ▼
                               ┌───────────────────────────┐
                               │   In-RAM Secret Redactor  │
                               │ Regex + Shannon Entropy   │
                               └─────────────┬─────────────┘
                                             │ [Clean Text]
                        ┌────────────────────┴────────────────────┐
                        ▼                                         ▼
         ┌───────────────────────────┐             ┌───────────────────────────┐
         │     Local ONNX Runtime    │             │       SQLite Engine       │
         │  (bge-small-en-v1.5)      │             │  ┌─────────────────────┐  │
         └─────────────┬─────────────┘             │  │ MemoryChunk (Table) │  │
                       │ [384-dim Vector]          │  └─────────────────────┘  │
                       └──────────────────────────►│  │ MemoryFTS (FTS5)    │  │
                                                   │  └─────────────────────┘  │
                                                   │  │ MemoryVector (vec0) │  │
                                                   │  └─────────────────────┘  │
                                                   └─────────────┬─────────────┘
                                                                 │
                                                                 ▼
                                                   ┌───────────────────────────┐
                                                   │    RRF Hybrid Search      │
                                                   │  Reciprocal Rank Fusion   │
                                                   └─────────────┬─────────────┘
                                                                 │
                                                                 ▼
                                                   ┌───────────────────────────┐
                                                   │ Interactive TUI Search UI │
                                                   │  Hotkey: Cmd+Shift+Space  │
                                                   └───────────────────────────┘
```

---

## 📊 Benchmark Performance

Stress-tested on an Apple Silicon M-series chip with **10,000 synthetic records** containing 384-dimensional dense vectors and SQLite FTS5 index rows:

| Metric | Result | Target Benchmark | Status |
| :--- | :--- | :--- | :--- |
| **Ingestion Throughput** | **68,065 vectors/sec** | > 5,000 / sec | 🚀 Ultra Fast |
| **Database File Size** | **17.66 MB** | < 50.0 MB | 🟢 Extremely Compact |
| **Peak Memory Footprint (RSS)** | **565 MB** | < 1,024 MB | 🟢 Stable |
| **Median Query Latency (p50)** | **44.67 ms** | < 50.0 ms | ⚡ Instantaneous |
| **p95 Query Latency** | **47.88 ms** | < 100.0 ms | ⚡ Consistent |
| **p99 Query Latency** | **140.63 ms** | < 250.0 ms | 🟢 Excellent |

Run benchmarks locally:
```bash
npm run benchmark
```

---

## 🚀 Quickstart

### Prerequisites
- Node.js 18+
- macOS or Linux

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/omnimemory.git
cd omnimemory

# Install dependencies
npm install

# Run automated tests
npm test
```

### Starting the Ingestion Engine

#### Mode A: Interactive Ambient Terminal Session
Launch your default shell inside OmniMemory's terminal listener. All inputs and outputs are indexed in real time:
```bash
npm run start:daemon -- --terminal
```

#### Mode B: Background Daemon (Screen & Hotkey)
```bash
npm run start:daemon
```

---

## 🔍 Retrieval & Search

Run a query directly from your command line:
```bash
npm run cli -- "docker container connection error"
```

Or open the interactive terminal search prompt:
```bash
npm run cli
```

---

## 🖥️ Shell Integration

To passively record regular terminal history into OmniMemory in the background without launching embedded sessions:

### Zsh Integration (`~/.zshrc`)
```bash
# --- OmniMemory Zsh Integration ---
_omnimemory_preexec() {
  _OMNI_CMD="$1"
}

_omnimemory_precmd() {
  local exit_code=$?
  if [ -n "$_OMNI_CMD" ]; then
    local cwd="$(pwd)"
    local last_cmd="$_OMNI_CMD"
    unset _OMNI_CMD

    local payload=$(cat <<EOF
{
  "command": $(printf '%s' "$last_cmd" | jq -R -s .),
  "output": "",
  "cwd": $(printf '%s' "$cwd" | jq -R -s .),
  "exitCode": $exit_code,
  "shell": "zsh"
}
EOF
)
    ( echo "$payload" | nc -w 1 127.0.0.1 48291 >/dev/null 2>&1 & )
  fi
}

autoload -Uz add-zsh-hook
add-zsh-hook preexec _omnimemory_preexec
add-zsh-hook precmd _omnimemory_precmd
```

### Bash Integration (`~/.bashrc`)
```bash
# --- OmniMemory Bash Integration ---
_omnimemory_prompt_command() {
  local exit_code=$?
  local last_cmd=$(history 1 | sed 's/^[ ]*[0-9]*[ ]*//')
  local cwd="$(pwd)"

  if [ -n "$last_cmd" ] && [ "$last_cmd" != "$_OMNI_LAST_LOGGED" ]; then
    _OMNI_LAST_LOGGED="$last_cmd"
    local payload=$(cat <<EOF
{
  "command": $(printf '%s' "$last_cmd" | jq -R -s .),
  "output": "",
  "cwd": $(printf '%s' "$cwd" | jq -R -s .),
  "exitCode": $exit_code,
  "shell": "bash"
}
EOF
)
    ( echo "$payload" | nc -w 1 127.0.0.1 48291 >/dev/null 2>&1 & )
  fi
}

PROMPT_COMMAND="_omnimemory_prompt_command;$PROMPT_COMMAND"
```

---

## ⚙️ CLI Command Reference

| Command | Action |
| :--- | :--- |
| `npm run cli` | Launches interactive prompt with clipboard copy |
| `npm run cli -- "<query>"` | Runs instant hybrid RRF search on query |
| `npm run cli -- service install` | Installs background daemon service (`launchd` / `systemd`) |
| `npm run cli -- service uninstall` | Stops and removes background system service |
| `npm run cli -- config get [key]` | Displays active settings or specific config key |
| `npm run cli -- config set <key> <val>` | Updates configuration key in `~/.config/omnimemory/config.json` |
| `npm run cli -- prune` | Manually runs retention cleanup and SQLite incremental vacuum |

---

## 🔧 Configuration

Settings are stored at `~/.config/omnimemory/config.json`:

```json
{
  "retentionDays": 30,
  "entropyThreshold": 4.5,
  "customSecretRegexes": [],
  "blacklistedApps": [
    "1Password",
    "Bitwarden",
    "Keychain Access",
    "Signal"
  ],
  "hotkey": "CommandOrControl+Shift+Space"
}
```

---

## 🧪 Verification & Testing

```bash
# Unit & Integration Tests (Redactor, Schema, RRF Search)
npm test

# 10,000 Vector Ingestion & Query Latency Benchmark
npm run benchmark
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
