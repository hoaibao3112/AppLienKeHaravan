# Haravan OAuth Demo (Node + Express)

This is a minimal example app demonstrating OAuth 2.0 flow with Haravan Partners API.

Features:
- Home form to enter `API Key`, `Secret Key`, and `shop` (e.g. `myshop.myharavan.com`)
- Redirects user to Haravan authorization URL
- Handles callback at `/auth/callback`, exchanges `code` for `access_token`
- Displays `access_token` and fetches `/admin/shop.json` to show shop info

Requirements
- Node.js 16+ recommended

Quick start

1. Copy `.env.example` to `.env` and fill values (optional; you can also enter values in the form):

```bash
cp .env.example .env
# edit .env
```

2. Install dependencies and run:

```bash
npm install
npm start
```

3. Open `http://localhost:3000` in your browser and enter credentials and shop.

Notes
- Default redirect URI: `http://localhost:3000/auth/callback` (change `REDIRECT_URI` if needed)
- Scopes requested: `read_products,read_orders,read_customers`
- Basic error handling is included for missing params and failed token/shop requests.
