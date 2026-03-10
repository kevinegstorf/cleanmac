# CleanMac

A native macOS desktop app for managing storage, cleaning caches, finding large files, and monitoring system resources. Built with Tauri 2, React, and Rust.

## Features

- **Dashboard** — Real-time disk & memory usage with donut charts, CPU info, auto-refresh every 30s
- **Cache Cleaner** — Scan and clean system caches, browser caches, Xcode DerivedData, npm/pnpm stores, Homebrew cache, logs, Trash, Docker
- **Large Files** — Find the biggest files in Downloads, Documents & Desktop with configurable size filter (10MB–1GB)
- **Processes** — Top 20 processes by memory usage with CPU stats

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 8
- [Rust](https://www.rust-lang.org/tools/install) (via rustup)
- Xcode Command Line Tools (`xcode-select --install`)

## Setup

```bash
# Clone the repo
git clone https://github.com/kevinegstorf/cleanmac.git
cd cleanmac

# Install frontend dependencies
pnpm install
```

## Development

```bash
# Start the Tauri dev app (compiles Rust + starts Vite dev server)
pnpm tauri dev
```

This opens the native app window with hot-reload for the frontend. Rust changes require a recompile (happens automatically on save).

## Build

```bash
# Build a production .app bundle
pnpm tauri build
```

The output will be in `src-tauri/target/release/bundle/`:
- `.app` — macOS application
- `.dmg` — disk image for distribution

## Project Structure

```
cleanmac/
├── src/                    # React frontend
│   ├── components/         # UI components (Dashboard, CacheCleaner, LargeFiles, Processes, Sidebar, ConfirmDialog)
│   ├── hooks/              # Custom hooks for Tauri IPC calls
│   ├── App.tsx             # Root component with page routing
│   ├── App.css             # Tailwind theme + global styles
│   └── main.tsx            # React entry point
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── lib.rs          # Tauri command handlers
│   │   ├── system.rs       # System info, file scanning, deletion logic
│   │   └── main.rs         # App bootstrap
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri app config (window size, app ID, bundle settings)
├── package.json            # Frontend dependencies & scripts
├── vite.config.ts          # Vite config (port 1420)
└── index.html              # HTML entry point
```

## Tech Stack

| Layer    | Technology                          |
| -------- | ----------------------------------- |
| Frontend | React 19, TypeScript, Tailwind v4   |
| Charts   | Recharts                            |
| Icons    | Lucide React                        |
| Desktop  | Tauri 2                             |
| Backend  | Rust, sysinfo                       |
| Build    | Vite 7, Cargo                       |

## Scripts

| Command           | Description                               |
| ----------------- | ----------------------------------------- |
| `pnpm dev`        | Start Vite dev server only (no Tauri)     |
| `pnpm build`      | Build frontend for production             |
| `pnpm tauri dev`  | Start full Tauri app in dev mode          |
| `pnpm tauri build`| Build production app bundle               |
