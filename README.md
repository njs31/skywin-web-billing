# Skywin Agri Super Market — POS Billing

POS billing software for **SKYWIN BIOTECH / AGRI SUPER MARKET** (Kumbakonam). Built with Next.js, PostgreSQL, and Drizzle ORM.

## Features

### Billing (like MARG ERP)
- **Retail & Wholesale POS** — toggle billing mode, separate rates, invoice prefixes
- **GST Invoices** — CGST/SGST, HSN, line & bill discounts, print + WhatsApp share
- **Customer ledger** — retail, wholesale, farmer types; credit limit; party-wise outstanding
- **Sales returns** — credit notes with automatic stock restoration

### Purchase & Inventory
- **Purchase entry & book** — supplier-wise inward stock
- **Stock status** — valuation, reorder alerts, low-stock highlighting
- **Stock adjustment** — manual corrections without fake transactions
- **Near expiry** — products expiring within 90 days
- **Categories** — Seeds, Fertilizers, Pesticides, Machinery, Irrigation, etc.

### Accounts
- **Receipts** — collect from customers against credit sales
- **Payments** — pay suppliers against purchase outstanding
- **Outstanding report** — debtors & creditors summary

### Reports
- Sale book, purchase book
- Product-wise & party-wise sales
- Daily summary with gross profit
- Gross profit & margin (MTD)

### System
- **Settings** — business details, GSTIN, operator name, invoice prefix
- **1,015 products** seeded from Excel with opening stock
- **37 suppliers** from purchase records

## Tech Stack

- Next.js 16 (App Router, Server Actions)
- PostgreSQL + Drizzle ORM
- Tailwind CSS + shadcn-style UI components
- Docker (local Postgres + Cloud Run deployment)

## Local Setup

### 1. Start PostgreSQL

```bash
docker compose up -d
```

### 2. Environment

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Default local `DATABASE_URL`:

```
postgresql://skywin:skywin@localhost:5432/skywin_bill
```

### 3. Install & migrate

```bash
npm install
npm run db:push
```

### 4. Seed from Excel

Place `COMPANY WISE PURCHASE.xlsx` and `PRODUCT WISE PURCHASE.xlsx` in the project root, then:

```bash
npm run db:seed
```

This imports 37 suppliers and 1,015 products with opening stock.

### 5. Run dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## GCP Deployment (Cloud Run + Cloud SQL)

### 1. Create Cloud SQL PostgreSQL instance

```bash
gcloud sql instances create skywin-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=asia-south1

gcloud sql databases create skywin_bill --instance=skywin-db
gcloud sql users create skywin --instance=skywin-db --password=YOUR_PASSWORD
```

### 2. Store database URL in Secret Manager

```bash
echo -n "postgresql://skywin:YOUR_PASSWORD@/skywin_bill?host=/cloudsql/PROJECT:asia-south1:skywin-db" | \
  gcloud secrets create skywin-database-url --data-file=-
```

### 3. Deploy with Cloud Build

```bash
gcloud builds submit --config cloudbuild.yaml
```

Or build and deploy manually:

```bash
docker build -t gcr.io/PROJECT_ID/skywin-bill .
docker push gcr.io/PROJECT_ID/skywin-bill
gcloud run deploy skywin-bill \
  --image gcr.io/PROJECT_ID/skywin-bill \
  --region asia-south1 \
  --add-cloudsql-instances PROJECT:asia-south1:skywin-db \
  --set-secrets DATABASE_URL=skywin-database-url:latest
```

### 4. Run migrations and seed on Cloud SQL

Connect via Cloud SQL Auth Proxy, then run `npm run db:push` and `npm run db:seed`.

## Business Details

| Field | Value |
|-------|-------|
| Business | SKYWIN BIOTECH — AGRI SUPER MARKET |
| Address | No.171/E2-A, Komalavallipettai, Karaikal Road, Kumbakonam-612401 |
| Phone | 9942499929 |
| GSTIN | 33AJBPM9217B2ZM |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run db:push` | Push schema to database |
| `npm run db:seed` | Import Excel data |
| `npm run db:studio` | Open Drizzle Studio |
# skywin-web-billing
