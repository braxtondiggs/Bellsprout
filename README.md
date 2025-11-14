# Brewery Digest

A NestJS-based newsletter application that aggregates craft brewery content from multiple sources (RSS feeds, social media, emails) and delivers personalized weekly digests to subscribers.

## 🍺 Features

- **Multi-Source Content Ingestion**
  - RSS feed parsing from brewery blogs
  - Social media scraping (Instagram, Facebook)
  - Email collection via Resend webhooks
  - OCR for image-based content

- **AI-Powered Content Processing**
  - LLM extraction using GPT-4o-mini (OpenAI)
  - Intelligent duplicate detection
  - Automated categorization (beer releases, events, updates)

- **Personalized Weekly Digests**
  - User brewery subscriptions
  - Beautiful MJML email templates
  - Scheduled delivery via cron jobs
  - Bounce handling and subscription management

- **Production-Ready Infrastructure**
  - PostgreSQL database with Prisma ORM
  - Redis for caching and BullMQ job queues
  - MinIO for S3-compatible object storage
  - Docker and Coolify deployment support

## 🚀 Quick Start

### Prerequisites

- Node.js 22+
- PostgreSQL 16+
- Redis 7+
- Docker (optional)

### Installation

```bash
# Install dependencies
npm install

# Start development services (PostgreSQL, Redis, MinIO)
npm run docker:up

# Generate Prisma Client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# (Optional) Seed database
npm run prisma:seed

# Start development server
npm start
```

The API will be available at `http://localhost:3000`

## 📝 Available Scripts

### Development
```bash
npm start              # Start development server
npm run dev            # Alias for start
npm run build          # Build for production
npm run start:prod     # Run production build
```

### Testing
```bash
npm test               # Run all tests
npm run test:watch     # Run tests in watch mode
npm run test:cov       # Run tests with coverage
npm run test:e2e       # Run end-to-end tests
npm run lint           # Lint all code
```

### Code Quality
```bash
npm run format         # Format all code with Prettier
npm run format:check   # Check code formatting
```

### Database (Prisma)
```bash
npm run prisma:generate        # Generate Prisma Client
npm run prisma:migrate         # Create and apply migrations (dev)
npm run prisma:migrate:deploy  # Apply migrations (production)
npm run prisma:seed            # Seed database
npm run prisma:studio          # Open Prisma Studio
```

### Docker
```bash
npm run docker:build   # Build Docker image
npm run docker:up      # Start development services
npm run docker:down    # Stop development services
npm run docker:logs    # View Docker logs
npm run docker:prod    # Start production stack
```

## 🏗️ Project Structure

```
.
├── apps/
│   ├── api/              # Main NestJS API application
│   │   └── src/
│   │       ├── app/
│   │       │   ├── auth/         # Authentication module
│   │       │   ├── users/        # User management
│   │       │   ├── breweries/    # Brewery CRUD
│   │       │   ├── content/      # Content ingestion & processing
│   │       │   ├── email/        # Email service (Resend)
│   │       │   └── digests/      # Weekly digest generation
│   │       ├── common/           # Shared utilities
│   │       └── main.ts
│   └── api-e2e/          # E2E tests
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── migrations/       # Database migrations
├── specs/                # Feature specifications
├── docker/               # Docker configuration
└── .github/
    └── workflows/        # CI/CD pipelines
```

## 🗄️ Database Schema

- **Users** - User accounts with JWT authentication
- **Breweries** - Craft brewery profiles with social links
- **UserBrewerySubscription** - User subscriptions to breweries
- **ContentItem** - Aggregated content from all sources
- **Digest** - Generated weekly email digests
- **DigestContent** - Link table for digest content items

## 🔧 Configuration

Copy `.env.example` to `.env` and configure:

### Required Environment Variables

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/brewery_digest"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Email (Resend)
RESEND_API_KEY=your_key_here
RESEND_FROM_EMAIL=noreply@yourdomain.com

# AI (OpenAI)
OPENAI_API_KEY=your_key_here

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Application
NODE_ENV=development
APP_BASE_URL=http://localhost:3000
```

See `.env.example` for all available configuration options.

## 🐳 Docker Deployment

### Development
```bash
docker-compose -f docker/docker-compose.yml up -d
```

## 🤖 Content Extraction

Uses GPT-4o-mini to extract structured data from brewery posts:
- Beer releases (name, style, ABV, release date)
- Events (name, date, location, description)
- General updates and announcements

## 🛠️ Tech Stack

- **Framework**: NestJS 11
- **Language**: TypeScript 5.9
- **Runtime**: Node.js 22
- **Database**: PostgreSQL 16 + Prisma ORM
- **Cache/Queue**: Redis 7 + BullMQ
- **Storage**: MinIO (S3-compatible)
- **Email**: Resend
- **AI**: OpenAI (GPT-4o-mini)
- **Web Scraping**: Playwright
- **Email Templates**: MJML + Handlebars
- **Monorepo**: Nx 22
- **Testing**: Jest 30
- **Deployment**: Docker + Coolify

## 📊 Nx Workspace

This is an Nx monorepo. Useful commands:

```bash
# Show project graph
npx nx graph

# Run tasks for specific project
npx nx serve api
npx nx build api
npx nx test api

# Run tasks for all projects
npx nx run-many -t test --all
npx nx run-many -t lint --all

# Show project details
npx nx show project api
```

## 📄 License

MIT

## 🔗 Links

- [Nx Documentation](https://nx.dev)
- [NestJS Documentation](https://docs.nestjs.com)
- [Prisma Documentation](https://www.prisma.io/docs)
- [OpenAI API](https://platform.openai.com/docs)
