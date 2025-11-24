# Mayhomes Dashboard

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

A NestJS MVC application for managing and reporting on Bitrix24 Deals and Leads, integrated with Facebook Marketing API for campaign insights.

## Features

- **Bitrix24 Integration**: View and filter Deals and Leads from Bitrix24 CRM
- **Facebook Insights**: Track campaign expenses and performance from Facebook Marketing API
- **Advanced Filtering**: Filter by date range, stage, category, and search terms
- **Sorting**: Sort table columns in ascending or descending order
- **Pagination**: Navigate through large datasets with smart pagination
- **Reports**: Generate detailed and simple campaign reports combining Bitrix24 and Facebook data

## Tech Stack

- **Framework**: NestJS (Node.js)
- **View Engine**: Handlebars (HBS)
- **APIs**: Bitrix24 CRM API, Facebook Graph API (Marketing API)

## Project Setup

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Bitrix24 account with API access
- Facebook Developer account (optional, for Facebook Insights)

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables template
cp env.example .env

# Edit .env file with your credentials
# See env.example for required variables
```

### Environment Variables

Configure the following variables in `.env`:

**Bitrix24 Configuration:**
- `BITRIX24_WEBHOOK_URL`: Your Bitrix24 webhook URL
- `BITRIX24_DEAL_SELECT_FIELDS`: Comma-separated list of Deal fields to retrieve
- `BITRIX24_LEAD_SELECT_FIELDS`: Comma-separated list of Lead fields to retrieve

**Facebook Configuration (Optional):**
- `FACEBOOK_ACCESS_TOKEN`: Facebook Graph API access token
- `FACEBOOK_AD_ACCOUNT_ID`: Facebook Ad Account ID
- `FACEBOOK_APP_ID`: Facebook App ID
- `FACEBOOK_APP_SECRET`: Facebook App Secret

See `env.example` for detailed configuration and `FACEBOOK_SETUP.md` for Facebook API setup instructions.

## Running the Application

```bash
# Development mode
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

The application will be available at `http://localhost:3000`

## Project Structure

```
src/
├── app.module.ts          # Root module
├── main.ts                 # Application entry point
├── bitrix24/              # Bitrix24 API integration
├── deals/                 # Deals module (controller, service, DTO)
├── leads/                 # Leads module (controller, service, DTO)
├── reports/               # Reports module
├── facebook/              # Facebook API integration
└── common/                # Shared utilities and decorators

views/
├── layouts/               # Layout templates
├── deals/                 # Deal views
├── leads/                 # Lead views
└── reports/               # Report views
```

## API Endpoints

- `GET /` - Redirects to `/deals`
- `GET /deals` - List all deals with filtering and pagination
- `GET /leads` - List all leads with filtering and pagination
- `GET /reports` - Reports index page
- `GET /reports/campaigns` - Detailed campaign report
- `GET /reports/simple` - Simple campaign report

## Features Details

### Filtering
- Date range filtering (from/to dates)
- Stage filtering
- Category filtering
- Search by title/name

### Sorting
- Click column headers to sort
- Toggle between ascending and descending order
- Sort state preserved in URL parameters

### Pagination
- Smart pagination display (shows page 1, 2, current ±2, last 2)
- Direct page input for quick navigation
- Page size: 50 items per page (Bitrix24 default)

## Development

```bash
# Run tests
npm run test

# Run e2e tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
