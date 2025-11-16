# FitGirl Games Tracker

A full-stack web application that scrapes and tracks game repacks from FitGirl Repacks, enriched with metadata from the IGDB (Internet Game Database) API.

## 🎮 Overview

This project automatically fetches game repack information from FitGirl Repacks website (all 6000+ games) and enhances it with additional game data including cover images, release years, and other metadata from IGDB. The scraper automatically detects the total number of pages, ensuring it always gets the complete library even as new games are added. The application provides a clean, modern interface to browse and search through available game repacks.

## ✨ Features

- **Complete Game Library**: Automatically detects and scrapes all pages from FitGirl Repacks (6000+ games)
- **Automated Web Scraping**: Extracts game titles, links, and metadata from FitGirl Repacks A-Z page
- **IGDB Integration**: Enriches game data with cover art, release dates, and metadata from IGDB API
- **Smart Caching**: Preserves IGDB data to avoid re-fetching, updates only new games
- **RESTful API**: Express-based backend with CORS support for flexible frontend integration
- **Modern UI**: React-based frontend with Vite, featuring year filters and wishlist functionality
- **Persistent Storage**: JSON-based database for storing scraped game information
- **Wishlist System**: Save favorite games with installation and completion tracking

## 🛠️ Tech Stack

### Backend (Server)
- **Node.js** with Express.js
- **Axios** for HTTP requests
- **Cheerio** for HTML parsing and web scraping
- **CORS** for cross-origin resource sharing
- **dotenv** for environment variable management

### Frontend (Client)
- **React 18** for UI components
- **Vite** for build tooling and development server
- **Lucide React** for icons
- Modern JavaScript (ES6+)

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- IGDB API credentials (Client ID and Client Secret)

## 🚀 Installation

### 1. Clone the repository
```bash
git clone https://github.com/PacificSilent/fitgirl-games-tracker.git
cd fitgirl-games-tracker
```

### 2. Set up the Server

```bash
cd server
npm install
```

Create a `.env` file in the server directory:
```env
PORT=4000
IGDB_CLIENT_ID=your_client_id_here
IGDB_CLIENT_SECRET=your_client_secret_here
```

To get IGDB credentials:
1. Register at [Twitch Developers](https://dev.twitch.tv/)
2. Create an application
3. Copy your Client ID and Client Secret

### 3. Set up the Client

```bash
cd ../client
npm install
```

Create a `.env` file in the client directory:
```env
VITE_API_URL=http://localhost:4000
```

## 🎯 Usage

### First Time Setup - Run the Scraper

Before starting the server, populate the database:

```bash
cd server
npm run scrape
```

This will automatically detect all pages, scrape them, and enrich with IGDB data (~15-30 minutes).

See `server/SCRAPER-GUIDE.md` for detailed instructions.

### Development Mode

**Start the server:**
```bash
cd server
npm run dev
```
The API will be available at `http://localhost:4000`

**Start the client:**
```bash
cd client
npm run dev
```
The frontend will be available at `http://localhost:5173`

### Production Mode

**Build the client:**
```bash
cd client
npm run build
```

**Start the server:**
```bash
cd server
npm start
```

### Available Scripts

**Server:**
- `npm start` - Start the API server
- `npm run dev` - Start with auto-reload
- `npm run scrape` - Run complete scraper (auto-detects all pages)

**Client:**
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## 📡 API Endpoints

- `GET /api/games` - Retrieve all games with IGDB metadata
  - Optional: `?limit=100` - Limit number of results
- `GET /api/health` - Check server status

## 🗂️ Project Structure

```
fitgirl-games-tracker/
├── client/                    # React frontend
│   ├── src/
│   │   ├── App.jsx           # Main React component
│   │   ├── config.js         # API configuration
│   │   └── styles.css        # Styling
│   ├── package.json          # Client dependencies
│   └── vite.config.js        # Vite configuration
├── server/                    # Express backend
│   ├── index.js              # Main API server
│   ├── new-scraper.js        # Complete scraper (auto-detects pages)
│   ├── test-scraper.js       # Testing tool
│   ├── db.json               # Game database (~6000 games)
│   ├── SCRAPER-GUIDE.md      # Detailed scraper docs
│   └── package.json          # Server dependencies
└── README.md                  # This file
```

## 🔧 Configuration

### Server Configuration
- `PORT`: Server port (default: 4000)
- `IGDB_CLIENT_ID`: Your IGDB API client ID
- `IGDB_CLIENT_SECRET`: Your IGDB API client secret

### Client Configuration
- `VITE_API_URL`: Backend API URL

## 📝 How It Works

1. **Page Detection**: Automatically detects the total number of pages on FitGirl Repacks A-Z listing
2. **Scraping**: Fetches all detected pages and extracts game data using Cheerio
3. **Data Extraction**: Parses game titles, slugs, and direct links from the list
4. **Data Enrichment**: Queries IGDB API to fetch cover images and release years for each game
5. **Smart Caching**: Preserves existing IGDB data, only fetches for new games
6. **Storage**: Saves all data to `db.json` for fast access
7. **API Serving**: Express server loads data from db.json and serves via REST API
8. **Display**: React frontend with year filters, wishlist, and modern UI

## ⚠️ Legal Notice

This project is for educational purposes only. Please respect the terms of service of FitGirl Repacks and IGDB. Always ensure you have the right to access and use the data you're scraping.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- [FitGirl Repacks](https://fitgirl-repacks.site/) for game repack information
- [IGDB](https://www.igdb.com/) for game metadata and cover art
- All open-source libraries used in this project
