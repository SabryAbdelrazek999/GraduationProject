# ZAP OWASP Scanner - Web Vulnerability Security Tool

## Overview

ZAP OWASP Scanner is a professional-grade web vulnerability scanning application that helps security researchers and developers identify and fix security issues in web applications. The tool detects common vulnerabilities including XSS, SQL Injection, CSRF, security misconfigurations, and other issues from the OWASP Top 10.

The application provides a comprehensive dashboard for monitoring security scans, scheduling automated scans, generating reports, and managing security settings. It features a clean, developer-tool-inspired interface designed for clarity and efficiency.

## User Preferences

Preferred communication style: Simple, everyday language.
Build approach: Incremental - add features one at a time.

## Recent Changes (December 1, 2025)

### Google OAuth Authentication - COMPLETED
- ✅ Google OAuth 2.0 integration with passport-google-oauth20
- ✅ Users can now sign in with Google (gmail) account
- ✅ Automatic user account creation on first Google login
- ✅ Stores user email and avatar from Google profile
- ✅ Google login button added to Login page
- ✅ OAuth credentials conditional - won't crash if not provided
- **⏳ Pending:** User to provide GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET

### Scheduling Frequency Categorization - COMPLETED  
- ✅ Updated schema with frequency options: daily, weekly, monthly, quarterly, annually
- ✅ Organized frequencies into two categories:
  - Regular: Daily, Weekly, Monthly
  - Extended: Quarterly, Annually
- ✅ Updated Scheduling UI to display categorized frequency options
- ✅ Frequency badges show user-friendly labels in schedule list

### Authentication System - COMPLETED
- ✅ PostgreSQL database created with Replit integration
- ✅ User authentication endpoints: `/api/auth/login`, `/api/auth/signup`, `/api/auth/me`, `/api/auth/logout`
- ✅ Login/Signup pages with proper form validation
- ✅ AuthProvider context with useAuth hook for route protection
- ✅ Session management with express-session (userId stored in session)
- ✅ User-based data isolation: userId added to scans and scheduledScans tables
- ✅ Protected routes: Unauthenticated users redirect to login

### Schema Updates
- Scans now include userId field for user isolation
- ScheduledScans now include userId field for user isolation
- Settings already had userId field
- Users table now supports OAuth:
  - googleId (unique): Google OAuth ID
  - email: User email from Google or signup
  - avatar: Profile picture from Google
  - password: Optional for OAuth users

## System Architecture

### Frontend Architecture

**Technology Stack:**
- **Framework:** React 18+ with TypeScript
- **Routing:** Wouter (lightweight client-side routing)
- **State Management:** TanStack Query (React Query) for server state
- **UI Components:** Radix UI primitives with shadcn/ui component system
- **Styling:** Tailwind CSS with CSS variables for theming
- **Build Tool:** Vite

**Design System:**
- Follows a "Design System with Developer Tool Patterns" approach
- Typography uses Inter for UI elements and JetBrains Mono for technical data
- Implements consistent spacing primitives (2, 4, 6, 8, 12, 16 Tailwind units)
- Fixed sidebar layout (256px) with flexible main content area
- Dark mode enabled by default with light mode support

**Component Structure:**
- Reusable UI components in `client/src/components/ui/` (shadcn/ui)
- Custom application components in `client/src/components/`
- Page components in `client/src/pages/`
- Centralized utilities in `client/src/lib/`

**Key Pages:**
- Home - Overview dashboard with recent activity
- Dashboard - Comprehensive analytics with charts and statistics
- Scan Now - Interface for initiating new scans
- Scheduling - Automated scan configuration with frequency options
- Reports - Scan history and vulnerability reports
- Settings - Application configuration and API key management
- About/FAQ - Documentation and help pages

### Backend Architecture

**Technology Stack:**
- **Runtime:** Node.js with TypeScript
- **Framework:** Express.js
- **Database ORM:** Drizzle ORM
- **Database:** PostgreSQL (via Neon serverless)
- **Session Management:** express-session with MemoryStore
- **Authentication:** Passport.js with local strategy and Google OAuth 2.0
- **Build:** esbuild for server bundling

**API Design:**
- RESTful API structure under `/api/*` routes
- JSON request/response format
- Error handling with appropriate HTTP status codes
- Request logging middleware for debugging

**Key API Endpoints:**
- `/api/auth/signup` - Create new user account
- `/api/auth/login` - Authenticate user
- `/api/auth/me` - Get current user
- `/api/auth/logout` - End user session
- `/api/auth/google` - Initiate Google OAuth flow
- `/api/auth/google/callback` - Google OAuth callback (requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
- `/api/stats` - Dashboard statistics
- `/api/dashboard` - Comprehensive dashboard data
- `/api/scans` - Scan CRUD operations (user-filtered)
- `/api/vulnerabilities` - Vulnerability data by scan
- `/api/schedules` - Scheduled scan management (now supports daily/weekly/monthly/quarterly/annually)
- `/api/settings` - User settings and API keys

### Data Architecture

**Database Schema (Drizzle ORM with PostgreSQL):**

1. **users table:**
   - Authentication and user management
   - Supports both email/password and Google OAuth
   - Stores avatar and email from OAuth providers

2. **scans table:**
   - Scan metadata (URL, type, status, timestamps)
   - Vulnerability counts by severity (critical, high, medium, low)
   - Status tracking (pending, running, completed)

3. **vulnerabilities table:**
   - Detailed vulnerability information
   - Foreign key relationship to scans
   - Severity classification and remediation guidance

4. **scheduledScans table:**
   - Automated scan configuration
   - Frequency options: daily, weekly, monthly, quarterly, annually
   - Timing settings with next/last run tracking
   - Active/inactive status

5. **settings table:**
   - User preferences
   - Scan depth configuration
   - Notification settings

**Storage Strategy:**
- In-memory storage implementation (MemStorage class) for development
- Database storage designed for PostgreSQL production deployment
- IStorage interface allows for storage backend flexibility

### Security Features

**Authentication:**
- Email/password authentication with session management
- Google OAuth 2.0 for convenient Gmail-based sign-in
- Session-based authentication with express-session
- Secure cookie handling (httpOnly, secure in production)

**Data Isolation:**
- User-based data isolation across all tables
- User can only access their own scans, schedules, and settings
- Authenticated routes require active session

**Authorization:**
- Protected routes with middleware
- Automatic redirect to login for unauthorized access

### Development Workflow

**Build Process:**
- Client build via Vite (outputs to `dist/public`)
- Server build via esbuild (outputs to `dist`)
- Dependency bundling optimization for cold start performance
- TypeScript compilation with strict mode

**Development Mode:**
- Vite dev server with HMR
- Express server with live reload
- Replit-specific plugins for development tooling
- Source map support for debugging

**Production Mode:**
- Optimized client bundle
- Server bundle with selective dependency inclusion
- Static file serving from `dist/public`
- Environment-based configuration

## External Dependencies

### Core Dependencies

**Frontend:**
- @tanstack/react-query - Server state management and caching
- wouter - Lightweight routing solution
- @radix-ui/* - Headless UI component primitives
- tailwindcss - Utility-first CSS framework
- recharts - Data visualization and charting
- axios - HTTP client for API requests
- class-variance-authority - Component variant styling
- date-fns - Date manipulation utilities

**Backend:**
- express - Web application framework
- drizzle-orm - TypeScript ORM for database operations
- @neondatabase/serverless - Neon PostgreSQL serverless driver
- cheerio - Server-side HTML parsing for vulnerability detection
- express-session - Session middleware
- passport - Authentication middleware
- passport-google-oauth20 - Google OAuth 2.0 strategy
- passport-local - Email/password authentication strategy
- zod - Runtime type validation
- nanoid/uuid - Unique ID generation

**Development Tools:**
- vite - Frontend build tool and dev server
- esbuild - Fast JavaScript bundler for server
- tsx - TypeScript execution for development
- drizzle-kit - Database migration tool
- @replit/* plugins - Replit development environment integration

### Database

**Provider:** Neon Serverless PostgreSQL
- Connection via `@neondatabase/serverless` driver
- Connection string from `DATABASE_URL` environment variable
- Schema migrations managed by Drizzle Kit

### Styling System

**Theming:**
- CSS custom properties for color system
- Dark mode as default with light mode support
- Consistent border radius and spacing scales
- Shadow and elevation system

**Fonts:**
- Google Fonts: Inter (UI), JetBrains Mono (code/technical)
- Font loading via preconnect for performance

### Build & Deployment

**Build Script (script/build.ts):**
- Selective dependency bundling for server (allowlist approach)
- External dependencies for faster cold starts
- Coordinated client and server builds
- Clean dist output directory

**Environment Configuration:**
- `NODE_ENV` for environment detection
- `DATABASE_URL` for database connection
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for Google OAuth
- Development vs production mode switching
- Replit-specific environment variables

### Docker Support

**Docker Configuration:**
- Multi-stage Dockerfile for optimized production builds
- Separate development and production compose files
- Production image uses Alpine Linux for minimal size
- Includes dumb-init for proper signal handling
- Node.js 20 LTS runtime

**Docker Compose Files:**
- `docker-compose.yml` - Production deployment with single app container
- `docker-compose.dev.yml` - Development mode with hot-reload and volume mounts
- Automatic rebuilding on compose up

**Running with Docker:**
```bash
# Production
docker-compose up --build

# Development
docker-compose -f docker-compose.dev.yml up --build

# Access on http://localhost:5000
```

**Docker Notes:**
- Application uses in-memory storage by default
- PostgreSQL can be enabled in compose file
- Port 5000 exposed for web access
- See DOCKER_SETUP.md for detailed instructions
