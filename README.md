# ArchiveXM

<p align="center">
  <img src="logo.png" alt="ArchiveXM Logo" width="200"/>
</p>

**ArchiveXM** is a modern web-based SiriusXM streaming and archival application. Browse 700+ channels, listen live, explore the 5-hour DVR buffer, and download tracks with full metadata and cover art.

## Features

- 🔐 **Secure Authentication** - Store SiriusXM credentials securely
- 📻 **700+ Channels** - Browse all channels with artwork and descriptions
- 🎧 **Listen Live** - Stream any channel in real-time
- 📼 **DVR Buffer** - Access 5 hours of past content per channel
- ⬇️ **Download Tracks** - Download individual or bulk tracks with metadata
- 🎨 **Cover Art** - Automatic cover art embedding
- 🏷️ **Metadata Tagging** - Full ID3 tags (artist, title, album, etc.)
- 🎬 **Live Recording** - Record live streams with auto-track splitting

## Quick Start

### Prerequisites

- Docker and Docker Compose
- SiriusXM subscription with streaming access

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/ArchiveXM.git
cd ArchiveXM
```

2. Start the application:
```bash
docker-compose up -d
```

3. Open your browser to `http://localhost:8743`

4. Enter your SiriusXM credentials and configure download location

### Configuration

Edit `.env` file or environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `FRONTEND_PORT` | 8743 | Web UI port |
| `BACKEND_PORT` | 8742 | API port |
| `DOWNLOAD_PATH` | ./downloads | Local download directory |

### Ports

- **8743** - Web interface
- **8742** - Backend API

## Architecture

```
ArchiveXM/
├── backend/           # FastAPI Python backend
│   ├── services/      # Auth, API, HLS, Download services
│   ├── models/        # Database models
│   └── routers/       # API endpoints
├── frontend/          # React + Vite + TailwindCSS
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── services/
├── data/              # SQLite database, config
├── downloads/         # Downloaded tracks
└── docker-compose.yml
```

## Tech Stack

**Backend:**
- Python 3.11+
- FastAPI
- SQLAlchemy
- Playwright (for authentication)
- FFmpeg (audio processing)
- N_m3u8DL-RE (HLS downloading)

**Frontend:**
- React 18
- Vite
- TailwindCSS
- Lucide Icons
- React Router

## License

MIT License - See LICENSE file for details.

## Acknowledgments

- [N_m3u8DL-RE](https://github.com/nilaoda/N_m3u8DL-RE) - HLS downloader
- SiriusXM for providing the streaming service
