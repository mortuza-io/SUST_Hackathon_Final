# Super Agent

Super Agent is a full-stack liquidity and risk intelligence dashboard for mobile financial service agents. It monitors physical cash and provider balances, builds a 30-day transaction baseline, forecasts short-term liquidity pressure, and gives administrators a live view of agent health and operational alerts.

The project was built as a SUST hackathon prototype with separate agent and administrator experiences.

> Transaction history is generated locally for demonstration. The project is not connected to live bKash, Nagad, or Rocket APIs, and its analysis does not call an external AI service.

## Key features

- Agent registration and role-based login with hashed passwords and server-side sessions
- Persistent users, agents, balances, and transaction history in MongoDB
- 30-day cash-in, cash-out, transaction-volume, and peak-hour baselines
- Four-hour forecasts for physical cash, bKash, Nagad, and Rocket balances
- Healthy, Warning, and Critical risk classification with confidence scores
- Actionable liquidity analysis and refill recommendations
- Agent dashboard with balances, forecasts, summaries, and transaction search
- Admin dashboard with live metrics, prioritized alerts, filters, and agent details
- Real-time dashboard updates through Socket.IO
- Responsive React interface for desktop and mobile screens

## Tech stack

| Layer | Technologies |
| --- | --- |
| Frontend | React, Vite, Lucide React, Socket.IO Client |
| Backend | Node.js, Express, Express Session, Socket.IO |
| Database | MongoDB, Mongoose |
| Authentication | Session cookies, bcrypt password hashing |
| Intelligence | Historical baseline and provider-specific forecasting engine |

## Project structure

```text
.
|-- backend/
|   |-- config/          # MongoDB connection
|   |-- data/            # Baseline, forecasting, and analysis logic
|   |-- models/          # User and agent Mongoose models
|   |-- .env.example     # Environment variable template
|   `-- server.js        # Express API and Socket.IO server
|-- client/
|   |-- src/             # React application and styles
|   |-- index.html
|   `-- vite.config.js   # Development server and API proxy
`-- README.md
```

## Prerequisites

- Node.js `^20.19.0` or `>=22.12.0`
- npm
- MongoDB running locally or a MongoDB Atlas connection string

## Getting started

### 1. Clone the repository

```bash
git clone https://github.com/mortuza-io/SUST_Hackathon_Final.git
cd SUST_Hackathon_Final
```

### 2. Configure the backend

Copy the environment template:

```powershell
Copy-Item backend/.env.example backend/.env
```

On macOS or Linux:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your values:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB Atlas or local MongoDB connection string |
| `SESSION_SECRET` | Long random value used to sign sessions |
| `ADMIN_NAME` | Name of the initial administrator |
| `ADMIN_PHONE` | Phone number used for the initial administrator login |
| `ADMIN_PASSWORD` | Strong password for the initial administrator |
| `PORT` | Backend port; defaults to `3000` |

For local MongoDB, `MONGODB_URI` can be set to:

```text
mongodb://127.0.0.1:27017/superAgent
```

The administrator variables seed the first admin account only when no administrator exists in the database. Later admin logins are verified against the stored account.

### 3. Install dependencies

```bash
cd backend
npm install
cd ../client
npm install
cd ..
```

### 4. Start the application

Run the backend in one terminal:

```bash
cd backend
npm start
```

Run the frontend in a second terminal:

```bash
cd client
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite proxies API and Socket.IO traffic to the backend at `http://localhost:3000`.

## Application workflow

### Agent

1. Create an agent account with a name, district, phone number, and password.
2. Sign in to view physical cash and provider balances.
3. Review the 30-day baseline, four-hour forecasts, risk analysis, and recommendation.
4. Regenerate prototype transaction history to refresh balances and live analysis.

### Administrator

1. Start the backend once with the configured admin environment variables.
2. Select **Admin only** on the login screen and sign in with the seeded credentials.
3. Monitor platform metrics, liquidity alerts, agent status, and provider forecasts.
4. Search or filter agents and open an agent record for detailed analysis.

## API overview

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/register` | Public | Register an agent account |
| `POST` | `/api/login` | Public | Sign in as an agent or administrator |
| `POST` | `/api/admin/login` | Public | Compatibility endpoint for administrator login |
| `POST` | `/api/logout` | Session | End the current session |
| `GET` | `/api/analyze` | Agent | Get the signed-in agent's liquidity analysis |
| `POST` | `/api/transactions/regenerate` | Agent | Regenerate prototype history and analysis |
| `GET` | `/api/admin/overview` | Admin | Get platform metrics, alerts, and agents |
| `GET` | `/api/admin/agents/:id` | Admin | Get detailed intelligence for one agent |

Authenticated Socket.IO clients receive `admin:overview-updated` or `agent:analysis-updated` events when relevant data changes.

## Available scripts

### Backend

```bash
npm start
```

Starts the API with Nodemon.

### Frontend

```bash
npm run dev      # Start the Vite development server
npm run build    # Create a production build
npm run preview  # Preview the production build locally
```

## Prototype and production notes

- Registration and regeneration create simulated transaction history for demonstration.
- Forecasts are deterministic estimates based on historical baselines and recent transaction velocity; they are not financial advice.
- Replace every placeholder in `.env` before deployment and never commit that file.
- Use HTTPS, secure cookie settings, and a persistent session store in production.
- Restrict Socket.IO CORS to trusted frontend origins before public deployment.
- Host the production frontend separately or add static serving/reverse-proxy configuration; the backend currently exposes the API only.
- Add automated tests, request-rate controls, validation hardening, and production monitoring before a public deployment.
