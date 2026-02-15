# Deriverse Trading Analytics Backend

## Reviewer Quick Start
- **Interactive Docs**: `http://localhost:5000/api-docs`
- **Core Logic**: `src/services/blockchain.service.ts` (Decoding)
- **PnL Logic**: `src/services/pnl.service.ts` (Calculations)
- **AI Integration**: `src/services/ai.service.ts` (Psychology Audit)

> **A professional high-performance backend for analyzing Deriverse perpetual futures trading.**

This project provides a robust infrastructure for tracking, analyzing, and journaling trades on the Deriverse protocol (Solana). It uses event sourcing to fetch trade data directly from blockchain transaction logs, calculates institutional-grade PnL metrics, and integrates with AI providers (Gemini, OpenAI, DeepSeek) for trader psychology analysis.

---

## Project Aim

The goal of this backend is to provide:
1.  **Accurate PnL Tracking**: Real-time realized and unrealized PnL calculation via direct on-chain event sourcing, ensuring sub-cent accuracy that bypasses standard SDK lag.
2.  **Comprehensive Analytics**: Institutional-grade risk metrics (**Sharpe**, **Sortino**, **Profit Factor**), market performance breakdown, win rates, fee composition, and historical charts.
3.  **Trader Psychology (AI)**: Automated cognitive audit that identifies behavioral patterns (e.g., Revenge Trading, FOMO, Denial) and provides actionable "nudges" based on current market sentiment.
4.  **Hindsight Analysis**: "What-If" scenarios to calculate opportunity costs from early exits.

---

## Architecture

The system follows a clean **Controller-Service-Repository** architecture:

```mermaid
graph TD
    Client["Frontend / API Client"] -->|HTTP Requests| API["Express API"]
    API -->|Route Handler| Controller["Controllers"]
    Controller -->|Business Logic| Service["Services"]
    
    subgraph Services
        BlockchainService["Blockchain Service"]
        SyncService["Sync Service"]
        PnlService["PnL Service"]
        AnalyticsService["Analytics Service"]
        BehavioralService["Behavioral Service"]
        SentimentService["Sentiment Service"]
        JournalService["Journal Service"]
        TraderProfileService["Trader Profile Service"]
        AIService["AI Service"]
    end
    
    Service -->|RPC Calls| Solana["Solana Blockchain"]
    Service -->|Queries| DB[("PostgreSQL / Prisma")]
    Service -->|AI Prompts| AI["AI Provider (Gemini/OpenAI)"]
```

### Core Components
-   **BlockchainService**: Decodes raw Solana transaction logs into structured trade events using the Deriverse Engine IDL.
-   **SyncService**: Manages data persistence (PostgreSQL) and ensures data integrity (idempotent upserts). Includes "Auto-Coach" trigger.
-   **PnlService**: Fetches live prices and calculates unrealized PnL for open positions.
-   **AnalyticsService**: Aggregates comprehensive metrics (Sharpe/Sortino Ratios, Market Breakdown, Win Rate, Drawdown, Volume, Fees).
-   **BehavioralService**: Analyzes trade history for emotional patterns (Revenge Trading, FOMO).
-   **SentimentService**: Fetches news headlines and analyzes market sentiment.
-   **JournalService**: Orchestrates AI analysis, sentiment context, and trader profile updates.
-   **TraderProfileService**: Categorizes traders into archetypes based on behavior.
-   **AIService**: Wrapper for Generative AI providers (Gemini, DeepSeek).

---

## Getting Started

### Prerequisites
-   **Node.js** >= 18.x
-   **pnpm** (recommended) or npm
-   **PostgreSQL** database
-   **Solana RPC URL** (Devnet/Mainnet)

### 1. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/Fortexfreddie/deriverse_backend>
cd deriverse-backend
pnpm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory. You can copy the example:

```bash
cp .env.example .env
```

**Required Variables:**

```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://user:password@localhost:5432/deriverse_db?schema=public"
SOLANA_RPC_URL="https://api.devnet.solana.com"

# Deriverse Protocol Constants
PROGRAM_ID=Drvrseg8AQLP8B96DBGmHRjFGviFNYTkHueY9g3k27Gu
VERSION=14
```

**Optional AI Configuration:**

```env
AI_PROVIDER=gemini # or 'deepseek', 'openai'
GEMINI_API_KEY=your_key_here
DEEPSEEK_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
```

### 3. Database Setup

Using Prisma to initialize the database schema:

```bash
# Create/Migrate the database (Dev)
npx prisma migrate dev

# Reset database to clean state (useful for testing)
pnpm db:clean

# (Optional) Open Prisma Studio to view data
npx prisma studio
```

### 4. Start the Server

```bash
# Development mode (with hot-reload)
pnpm dev

# Production build
pnpm build
pnpm start
```

Server will start on `http://localhost:5000` (or your configured PORT).

Once the server is running, visit http://localhost:5000/api-docs to explore the interactive Swagger documentation and test the endpoints directly from your browser.

---

## Key Workflows

### 1. Syncing Trades
To populate the database, you must sync a wallet's history.

-   **Endpoint**: `POST /api/sync`
-   **Body**: `{ "walletAddress": "..." }`
-   **Process**: Fetches transaction signatures -> Decodes logs -> Upserts Positions & Fills.

### 2. Viewing Performance
Get a comprehensive dashboard of trading performance.

-   **Endpoint**: `GET /api/analytics/:wallet`
-   **Features**: Total PnL, Win Rate, Fees, Volume, Best/Worst Trades.

### 3. Journaling & Auto-Coaching
Annotate a trade manually or let the system auto-analyze it.

-   **Manual**: `PATCH /api/journal/:positionId` with notes/emotion.
-   **Auto-Coach**: When a trade closes on-chain, `SyncService` automatically triggers an AI analysis via `JournalService`.
-   **Result**: AI analyzes execution data vs. market context, detects biases (e.g., FOMO), and provides a "Nudge".

---

## Key Features (Institutional-Grade)
-   **Timestamp Integrity**: Decoupled from server time; relies purely on blockchain timestamps to prevent duration distortion.
-   **High-Fidelity PnL**: Accounts for all fees, funding payments, and partial fills.
-   **Zero "Dust"**: Floating-point precision handling ensures closed positions are cleanly zeroed out.
-   **Sentiment Awareness**: AI analysis includes real-time crypto news context to validate trade timing.

## API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **POST** | `/api/sync` | Sync trades from blockchain for a wallet |
| **GET** | `/api/dashboard/:wallet` | Live PnL for open positions |
| **GET** | `/api/trades/:wallet` | Paginated trade history with filters |
| **GET** | `/api/analytics/:wallet` | Comprehensive analytics (Win Rate, Fees, etc.) |
| **GET** | `/api/analytics/:wallet/historical-pnl` | Daily PnL chart data with drawdown |
| **GET** | `/api/analytics/:wallet/time-analysis` | Hourly/Daily performance breakdown |
| **PATCH** | `/api/journal/:positionId` | Update journal notes & trigger AI analysis |

---

## Utility Scripts

We provide several helper scripts in `src/scripts/` for testing and maintenance. Run them using `npx ts-node`:

-   `src/scripts/init-account.ts`: Initialize a new Deriverse trading account.
-   `src/scripts/run-sync.ts`: Manually run a sync for a hardcoded wallet.
-   `src/scripts/test-analytics.ts`: Verify analytics calculations against live data.
-   `src/scripts/test-behavior.ts`: Analyze behavioral patterns/audit.
-   `src/scripts/test-pnl.ts`: Calculate and display PnL table.
-   `src/scripts/test-sync-v2.ts`: Test incremental sync logic.
-   `src/scripts/fetch-my-trades.ts`: Debugging tool to print raw trade logs.
-   `src/scripts/run-journal-audit.ts`: Run a behavioral audit (uses BehavioralService).

---

## License

[ISC](LICENSE)
