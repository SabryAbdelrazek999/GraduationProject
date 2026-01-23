# Docker Setup Guide for ZAP Web Scanner

This guide explains how to run ZAP Web Scanner with Docker Desktop.

## Prerequisites

- Docker Desktop installed and running
- Docker Compose (included with Docker Desktop)

## Quick Start

### Production Build

1. **Build and run the container:**
   ```bash
   docker-compose up --build
   ```

2. **Access the application:**
   Open your browser and navigate to `http://localhost:5000`

### Development Mode

For development with hot-reload:

```bash
docker-compose -f docker-compose.dev.yml up --build
```

The application will reload automatically as you make changes.

## Usage

### Start the application:
```bash
docker-compose up
```

### Stop the application:
```bash
docker-compose down
```

### View logs:
```bash
docker-compose logs -f
```

### Rebuild the image:
```bash
docker-compose up --build
```

## Environment Variables

By default, the application uses:
- `NODE_ENV=production` (or `development` in dev mode)
- `PORT=5000`

For PostgreSQL database support, uncomment the `postgres` service in `docker-compose.yml` and set:
- `DATABASE_URL=postgresql://scanner:scannerpass@postgres:5432/zap_scanner`

## Architecture

The Docker setup uses a multi-stage build for efficiency:

1. **Builder Stage:** Compiles TypeScript and builds the React frontend
2. **Production Stage:** Runs the optimized application with only production dependencies

## Notes

- The application uses in-memory storage by default (data is not persisted between container restarts)
- To enable PostgreSQL persistence, uncomment the database service in `docker-compose.yml`
- Volume mounts exclude `node_modules` to avoid conflicts between host and container
- The container properly handles signals (SIGTERM/SIGINT) for graceful shutdown

## Troubleshooting

**Port already in use:**
```bash
docker-compose down  # Stop existing container
docker-compose up    # Start again
```

**Clear Docker cache:**
```bash
docker-compose down --volumes  # Remove volumes
docker system prune            # Clean up unused images/containers
docker-compose up --build      # Rebuild from scratch
```

**View container logs:**
```bash
docker-compose logs app -f
```
