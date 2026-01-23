# ZAP Web Scanner - Setup Guide

Complete guide to download, install, and run the ZAP Web Scanner application.

## Prerequisites

Choose ONE of these setups:

### Option 1: Docker Desktop (Easiest - Recommended)
- **Docker Desktop** installed and running
  - Download from: https://www.docker.com/products/docker-desktop
  - Available for Windows, Mac, and Linux

### Option 2: Local Development
- **Node.js 20+** LTS
  - Download from: https://nodejs.org/
- **npm** (included with Node.js)

## Step 1: Download the Project

### Option A: Download as ZIP
1. Click the Code button on the repository
2. Select "Download ZIP"
3. Extract the ZIP file to your desired location

### Option B: Clone with Git
```bash
git clone <repository-url> zap-scanner
cd zap-scanner
```

## Step 2: Installation

### With Docker Desktop (Recommended)

**No installation needed!** Docker handles everything.

Skip to "Running the Application" section below.

### With Local Node.js

1. **Install dependencies:**
   ```bash
   npm install
   ```

   This downloads all required packages (~500MB) to `node_modules/` folder.

2. **Verify installation:**
   ```bash
   npm --version
   node --version
   ```

## Step 3: Running the Application

### Option A: Docker Desktop (Easiest)

**Production Mode:**
```bash
docker-compose up --build
```

**Development Mode (with auto-reload):**
```bash
docker-compose -f docker-compose.dev.yml up --build
```

Then open: `http://localhost:5000`

Stop with: `Ctrl+C`

### Option B: Local Development

**Start the development server:**
```bash
npm run dev
```

Then open: `http://localhost:5000`

Stop with: `Ctrl+C`

### Option C: Local Production Build

**Build the project:**
```bash
npm run build
```

**Start the production server:**
```bash
npm start
```

Then open: `http://localhost:5000`

## What Gets Downloaded

### With npm install (~500MB):
- React and frontend libraries (150MB)
- Express and backend libraries (50MB)
- Build tools and development dependencies (300MB)

### With Docker:
- Node.js runtime (350MB)
- All npm packages (built into Docker image)
- Total Docker image: ~600-700MB

## Quick Reference

| Task | Command |
|------|---------|
| **Docker: Run production** | `docker-compose up --build` |
| **Docker: Run development** | `docker-compose -f docker-compose.dev.yml up --build` |
| **Docker: Stop** | `Ctrl+C` |
| **Local: Install dependencies** | `npm install` |
| **Local: Run development** | `npm run dev` |
| **Local: Build production** | `npm run build` |
| **Local: Run production** | `npm start` |

## Troubleshooting

### Port 5000 already in use

**Docker:**
```bash
docker-compose down
docker-compose up --build
```

**Local:**
```bash
# Windows: Find and kill process on port 5000
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Mac/Linux:
lsof -ti:5000 | xargs kill -9
npm run dev
```

### Dependencies won't install

**Clear cache and retry:**
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Docker image build fails

```bash
docker-compose down -v
docker system prune
docker-compose up --build
```

### Changes not showing up

Make sure you're in the right mode:
- **Development:** Changes auto-reload
- **Production build:** Need to rebuild (`npm run build`)

## Using the Application

1. Navigate to `http://localhost:5000` in your browser
2. Go to **"Scan Now"** page
3. Enter a target URL (e.g., `https://example.com`)
4. Click **"Start Scan"** button
5. Wait for scan to complete
6. View vulnerabilities, download reports, or schedule more scans

## Project Structure After Download

```
zap-scanner/
├── client/           # React frontend code
├── server/           # Node.js backend code
├── shared/           # Shared types and schemas
├── script/           # Build scripts
├── package.json      # Project dependencies
├── Dockerfile        # Docker configuration
├── docker-compose.yml
├── docker-compose.dev.yml
├── SETUP.md          # This file
├── DOCKER_SETUP.md   # Detailed Docker guide
└── README.md         # Project overview
```

## Environment Variables (Optional)

Create a `.env` file in the project root:

```env
NODE_ENV=production
PORT=5000
```

See `.env.example` for all available options.

## Next Steps

- Check **DOCKER_SETUP.md** for advanced Docker configuration
- Read **README.md** for feature overview
- Visit Scan Now page to test the scanner
- View Reports page to see scan history

## Support

If you encounter issues:

1. **Check existing logs:**
   - Docker: `docker-compose logs`
   - Local: Check terminal output

2. **Verify prerequisites:**
   - Docker Desktop running (if using Docker)
   - Port 5000 not in use
   - Sufficient disk space (~1GB)

3. **Clear and retry:**
   - Docker: `docker system prune && docker-compose up --build`
   - Local: `npm cache clean --force && npm install && npm run dev`
