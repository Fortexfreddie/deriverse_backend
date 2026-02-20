import { prisma } from '../config/db';
import { WalletPerformance } from '../types/index';
import { COINGECKO_ID_MAP } from '../config/constants';

export class PnlService {
    // simple in‑memory cache for price lookups, keyed by market name
    // expires after CACHE_TTL_MS milliseconds
    private priceCache: { timestamp: number; prices: Record<string, number> } | null = null;
    private readonly CACHE_TTL_MS = 60_000; // 1 minute

    /**
     * Fetches live prices using the CoinGecko ID map.  Uses a short-lived cache
     * so that repeated calls during a short interval don't hammer the external
     * API (avoids Render/Coingecko rate limits).
     */
    private async getMultiplePrices(marketNames: string[]): Promise<Record<string, number>> {
        const now = Date.now();
        if (this.priceCache && now - this.priceCache.timestamp < this.CACHE_TTL_MS) {
            console.log('Using cached price map');
            return this.priceCache.prices;
        }

        const uniqueNames = [...new Set(marketNames)];
        const cgIds = uniqueNames.map(name => COINGECKO_ID_MAP[name]).filter(Boolean);

        if (cgIds.length === 0) return {};

        try {
            const idsQuery = cgIds.join(',');
            const apiKey = process.env.COINGECKO_API_KEY;

            // simple retry in case Render/hosted env gets throttled
            let res: Response;
            let attempt = 0;
            const maxAttempts = 3;
            while (true) {
                attempt++;
                const url = apiKey
                    ? `https://api.coingecko.com/api/v3/simple/price?ids=${idsQuery}&vs_currencies=usd&x_cg_demo_api_key=${apiKey}`
                    : `https://api.coingecko.com/api/v3/simple/price?ids=${idsQuery}&vs_currencies=usd`;
                res = await fetch(url);
                if (res.ok || attempt >= maxAttempts) break;

                const text = await res.text();
                console.warn(`Coingecko request failed (status=${res.status}); retrying attempt ${attempt}/${maxAttempts}. body=${text}`);
                // back off a bit before retrying
                await new Promise(r => setTimeout(r, 500 * attempt));
            }

            if (!res.ok) {
                const body = await res.text().catch(() => '<unreadable>');
                console.error(
                    `Price API returned non-ok status ${res.status}, body=${body} -- falling back to cost basis`
                );
                return {};
            }

            const json: any = await res.json();

            const prices: Record<string, number> = {};
            uniqueNames.forEach(name => {
                const cgId = COINGECKO_ID_MAP[name];
                if (cgId && json[cgId]) {
                    prices[name] = Number(json[cgId].usd);
                }
            });

            // update cache
            this.priceCache = {
                timestamp: Date.now(),
                prices: { ...prices }
            };

            return prices;
        } catch (err) {
            console.error("Price API Error, using dynamic fallbacks instead of static 100:", err);
            // if we have stale cache, return it instead of an empty object
            if (this.priceCache) {
                console.warn('Returning stale cached prices due to fetch error');
                return this.priceCache.prices;
            }
            return {};
        }
    }

    async getWalletPerformance(walletAddress: string): Promise<WalletPerformance[]> {
        const fills = await prisma.fill.findMany({
            where: { position: { walletAddress } },
            include: { position: true },
            orderBy: { timestamp: 'asc' }
        });

        if (fills.length === 0) return [];

        const groups: Record<string, { fills: any[]; position: any }> = {};
        const marketNames: string[] = [];

        for (const f of fills) {
            const pid = f.positionId;
            if (!groups[pid]) {
                groups[pid] = { fills: [], position: f.position };
                marketNames.push(f.position.market);
            }
            groups[pid].fills.push(f);
        }

        const livePrices = await this.getMultiplePrices(marketNames);
        const performance: WalletPerformance[] = [];

        for (const [pid, data] of Object.entries(groups)) {
            const isSpot = data.fills[0].tradeType === 'SPOT';
            let currentInventory = 0;
            let avgCostBasis = Number(data.fills[0].price);
            let realized = 0;
            let totalFees = 0;

            for (const f of data.fills) {
                const price = Number(f.price);
                const size = Number(f.size);
                totalFees += Number(f.fee || 0);

                // --- SEED LOGIC ---
                // Reset cost basis when inventory is depleted and we see an exit fill
                if (currentInventory === 0 && !f.isEntry) {
                    avgCostBasis = price;
                }

                if (isSpot) {
                    if (f.side === 'BUY') {
                        const totalCost = (currentInventory * avgCostBasis) + (price * size);
                        currentInventory += size;
                        avgCostBasis = totalCost / currentInventory;
                    } else {
                        realized += (price - avgCostBasis) * size;
                        currentInventory -= size;
                    }
                } else {
                    // For Perps, `isEntry` determines if we are adding to position
                    const pnlDirection = data.position.side === 'LONG' ? 1 : -1;

                    if (f.isEntry) {
                        // Entry: Add to inventory, update weighted average price
                        const totalCost = (currentInventory * avgCostBasis) + (price * size);
                        currentInventory += size;
                        if (currentInventory > 0) avgCostBasis = totalCost / currentInventory;
                    } else {
                        // Exit: Realize PnL based on (Exit Price - Entry Price) * Size * Direction
                        realized += (price - avgCostBasis) * size * pnlDirection;
                        currentInventory -= size;
                    }
                }
            }

            const marketName = data.position.market;

            // --- DYNAMIC FALLBACK FIX ---
            // If livePrices is missing, use avgCostBasis as the current price.
            // This ensures Unrealized PnL is 0 instead of showing a fake "100.00" profit.
            const currentPrice = livePrices[marketName] || avgCostBasis;

            const pnlFactor = (!isSpot && data.position.side === 'SHORT') ? -1 : 1;
            // FIX: Use Absolute Inventory to prevent PnL flipping
            const absInventory = Math.abs(currentInventory);
            const unrealized = (currentPrice - avgCostBasis) * absInventory * pnlFactor;

            if (absInventory > 1e-9 || Math.abs(realized) > 1e-4) {
                performance.push({
                    positionId: pid,
                    market: marketName,
                    side: isSpot ? 'LONG' : (data.position.side as any),
                    entry: Number(avgCostBasis.toFixed(4)),
                    current: Number(currentPrice.toFixed(4)),
                    size: Number(absInventory.toFixed(4)),
                    unrealized: Number(unrealized.toFixed(2)),
                    realized: Number(realized.toFixed(2)),
                    fees: Number(totalFees.toFixed(4))
                });
            }
        }
        return performance;
    }
}