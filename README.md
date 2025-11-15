# Zid Retention Engine – Honey Store Edition

A Zid Partner App that helps honey-store merchants turn first-time buyers into repeat customers through smart customer segmentation and automated reorder reminders.

## Features

- **Smart Customer Segmentation**: Automatically categorizes customers as NEW, ACTIVE, AT_RISK, CHURNED, or VIP
- **Honey Product Reorder Reminders**: Configurable reminder system based on product consumption times
- **Automated Messaging**: Scheduled reminder engine that sends messages when customers are likely to need reorders
- **Merchant Dashboard**: Clean, modern UI for viewing customer segments and configuring product settings

## Prerequisites

- Node.js 14+ 
- npm or yarn
- Zid Partner App credentials (Client ID, Client Secret)

## Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

3. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

4. Update `.env` with your Zid OAuth credentials:
```
PORT=3000
ZID_CLIENT_ID=your_client_id_here
ZID_CLIENT_SECRET=your_client_secret_here
ZID_AUTH_URL=https://oauth.zid.sa/oauth/authorize
ZID_TOKEN_URL=https://oauth.zid.sa/oauth/token
ZID_REDIRECT_URI=http://localhost:3000/callback
ZID_API_BASE_URL=https://api.zid.sa/v1
```

## Usage

1. Start the server:
```bash
npm start
```

2. Install the app for a merchant:
   - Navigate to `http://localhost:3000/install`
   - This will redirect to Zid OAuth authorization
   - After authorization, tokens will be stored automatically

3. Access the dashboard:
   - Navigate to `http://localhost:3000/dashboard`
   - Enter your Store ID
   - Click "مزامنة العملاء" to sync customer data
   - Configure honey product settings
   - View customer segments and manage reminders

## API Endpoints

### OAuth
- `GET /install` - Redirect to Zid OAuth authorization
- `GET /callback` - OAuth callback handler
- `GET /test-api?store_id=X` - Test API connection

### Dashboard
- `GET /dashboard/customers?store_id=X` - Get customer segmentation data
- `GET /dashboard/products?store_id=X` - Get products with settings
- `POST /settings/product/:id` - Update product reminder settings
- `POST /api/sync-customers` - Trigger customer data sync

### Reminders
- `POST /simulate/send-reminders` - Manually send pending reminders
- `POST /api/calculate-reminders` - Calculate reminders from orders
- `GET /api/reminders?store_id=X` - Get all reminders

## Customer Segmentation Rules

- **NEW**: 1 order, last order within 7 days
- **ACTIVE**: 2+ orders, last order within 30 days
- **AT_RISK**: Last order 31-60 days ago
- **CHURNED**: Last order more than 60 days ago
- **VIP**: 5+ orders OR total spent ≥ 500 SAR

## Reminder Calculation

For each honey product order:
- Base reminder date = order_date + avg_days_to_finish - offset_days
- If quantity ≥ 2: adjusted_days = avg_days_to_finish × 1.5

## Database

The app uses SQLite for simplicity. The database file (`retention.db`) is created automatically on first run.

Tables:
- `merchants` - Store OAuth tokens
- `customers` - Customer data and segments
- `product_settings` - Honey product configuration
- `reminders` - Scheduled reminder messages

## Development

This app was built for a 7-hour hackathon. For production use, consider:
- Adding proper error handling and logging
- Implementing actual SMS/WhatsApp integration
- Adding authentication for dashboard access
- Using a production database (PostgreSQL, MySQL)
- Adding rate limiting and security measures

## License

ISC

