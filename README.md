# Ecom API

REST API for an online store: product catalogue, customer accounts, and orders with stock control. Built with **Node.js, Express 5, TypeScript and PostgreSQL**.

It powers the [Ecommerce storefront](https://github.com/sheelasaivenkatareddy/Ecommerce).

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Product catalogue** with search, category and price filters, sorting and pagination
- **Customer accounts** with bcrypt password hashing and JWT authentication
- **Server-side pricing**: order totals always come from the catalogue, never from the client
- **Safe stock handling**: stock is checked and reserved inside a database transaction, so items cannot be oversold
- **Order lifecycle**: pending → confirmed → shipped → delivered, and cancellations return items to stock
- **Delivery and payment rules**: free delivery over ₹999 (₹49 below), Cash on Delivery
- **Admin tools**: create, update and archive products; move orders through fulfilment
- **Zero-setup demo mode**: without `DATABASE_URL`, the API runs on an in-memory PostgreSQL emulation with seeded data
- Request validation with Zod, consistent JSON errors, security headers with Helmet, and CORS
- 24 integration tests (Vitest + Supertest), plus linting and strict type checks

## Tech stack

| Area | Technology |
| --- | --- |
| Runtime | Node.js 20+, TypeScript |
| Web framework | Express 5 |
| Database | PostgreSQL via node-postgres; pg-mem for demo mode and tests |
| Authentication | JSON Web Tokens, bcrypt |
| Validation | Zod |
| Testing | Vitest, Supertest |
| Tooling | ESLint |

## Getting started

You need **Node.js 20.12 or newer**.

### Quick start (demo database)

```bash
git clone https://github.com/sheelasaivenkatareddy/Ecom.git
cd Ecom
npm install
npm run dev
```

The API runs at `http://localhost:4000` with 14 demo products. Demo data resets whenever the server restarts.
Admin sign-in: `admin@ecom.dev` / `Admin@12345` (change it with `ADMIN_EMAIL` and `ADMIN_PASSWORD`).

### With PostgreSQL

```bash
docker compose up -d       # PostgreSQL 17 on localhost:5432
cp .env.example .env       # then set DATABASE_URL and JWT_SECRET (see below)
npm run db:setup           # creates the tables and demo data
npm run dev
```

For the Docker database, use `DATABASE_URL=postgres://ecom:ecom@localhost:5432/ecom`.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `4000` | Port the API listens on |
| `DATABASE_URL` | *(empty)* | PostgreSQL connection string. Empty means the in-memory demo database |
| `JWT_SECRET` | dev-only value | Secret for signing tokens, at least 32 characters. **Required in production** |
| `JWT_EXPIRES_IN` | `7d` | How long a sign-in lasts |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated origins allowed to call the API from a browser |
| `ADMIN_EMAIL` | `admin@ecom.dev` | Admin account created by the seed step |
| `ADMIN_PASSWORD` | `Admin@12345` | Password for that admin account |

## API reference

- All responses are JSON. Errors look like `{ "error": { "message": "...", "details": [...] } }`.
- Amounts are integers in **paise** (₹1 = 100 paise), so `34900` means ₹349.
- Authenticated routes need an `Authorization: Bearer <token>` header. Get a token from register or login.

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | Health check |
| `POST` | `/api/auth/register` | Public | Create a customer account |
| `POST` | `/api/auth/login` | Public | Sign in and receive a token |
| `GET` | `/api/auth/me` | Signed in | The current user |
| `GET` | `/api/categories` | Public | Categories with product counts |
| `GET` | `/api/products` | Public | List products. Query: `q`, `category`, `minPrice`, `maxPrice`, `featured`, `sort` (`newest`, `price_asc`, `price_desc`, `name`), `page`, `limit` |
| `GET` | `/api/products/:slug` | Public | Product details |
| `POST` | `/api/products` | Admin | Create a product |
| `PATCH` | `/api/products/:id` | Admin | Update a product |
| `DELETE` | `/api/products/:id` | Admin | Archive a product (past orders keep their history) |
| `GET` | `/api/orders` | Signed in | Your orders. Admins can add `?scope=all` |
| `POST` | `/api/orders` | Signed in | Place an order |
| `GET` | `/api/orders/:id` | Signed in | Order details (owner or admin) |
| `POST` | `/api/orders/:id/cancel` | Signed in | Cancel a pending order |
| `PATCH` | `/api/orders/:id/status` | Admin | Change an order's status |

### Example: place an order

```bash
curl -X POST http://localhost:4000/api/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [{ "productId": 12, "quantity": 2 }],
    "shipping": {
      "name": "Ravi Kumar", "phone": "9876543210", "address": "12 MG Road, Indiranagar",
      "city": "Bengaluru", "state": "Karnataka", "pincode": "560038"
    }
  }'
```

```json
{
  "order": {
    "id": 1,
    "status": "pending",
    "paymentMethod": "cod",
    "subtotalPaise": 69800,
    "shippingPaise": 4900,
    "totalPaise": 74700,
    "itemCount": 2,
    "items": [
      { "productId": 12, "name": "Ceramic Coffee Mug 350 ml", "unitPricePaise": 34900, "quantity": 2, "lineTotalPaise": 69800 }
    ]
  }
}
```

(The real response also includes the delivery address, product images and timestamps.)

## Project structure

```
src/
├── app.ts              Express app: middleware and routes
├── server.ts           Starts the HTTP server
├── config.ts           Environment variables, validated with Zod
├── db/                 Connection, schema, seed data and setup script
├── middleware/         Authentication and error handling
├── modules/
│   ├── auth/           Register, sign in, current user
│   ├── products/       Catalogue and product management
│   └── orders/         Checkout, order history and status changes
└── lib/                Error, money and slug helpers
tests/                  Integration tests
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the API with auto-reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled API |
| `npm run db:setup` | Create tables and demo data in PostgreSQL |
| `npm test` | Run the test suite |
| `npm run lint` | Lint the code |
| `npm run typecheck` | Type-check without building |

## Testing

```bash
npm test
```

Each test starts the app on a fresh, seeded in-memory database. The tests cover authentication, catalogue queries, admin product management, checkout pricing, stock reservation, access control between customers, and order status changes.

## Credits

Product photos are from [Unsplash](https://unsplash.com).

## License

[MIT](LICENSE)
