/**
 * TRADER PROFILE SERVICE
 * Analyzes the last 5+ trades to identify trader archetypes and generate coaching "nudges"
 * Turns the journal into a leveling system for trader evolution
 */

import { prisma } from '../config/db';

type TraderArchetype = 
  | 'The Early Seller'
  | 'The Dip Chaser'
  | 'The Hold Master'
  | 'The Revenge Trader'
  | 'The Streaky Trader'
  | 'The Risk Manager'
  | 'The FOMO Gambler';

type TraderProfile = {
  profile: TraderArchetype;
  strength: string;
  weakness: string;
  nudge: string;
  winRate: number;
  avgHoldTime: number;
};

export class TraderProfileService {
  async analyzeTraderProfile(walletAddress: string): Promise<TraderProfile> {
    const recentTrades = await prisma.position.findMany({
      where: { walletAddress, status: 'CLOSED' },
      orderBy: { closedAt: 'desc' },
      take: 20 // Increase sample size for better profiling
      // Removed unnecessary include: { fills: true }
    });

    if (recentTrades.length === 0) {
      return {
        profile: 'The Dip Chaser',
        strength: 'Building track record',
        weakness: 'Insufficient data',
        nudge: 'After 5 trades, I will analyze your style.',
        winRate: 0,
        avgHoldTime: 0
      };
    }

    // 1. Calculate Metrics
    const profitableTrades = recentTrades.filter(t => (t.realizedPnl ?? 0) > 0).length;
    const winRate = (profitableTrades / recentTrades.length) * 100;

    const totalHoldTime = recentTrades.reduce((sum, t) => {
      if (t.closedAt && t.createdAt) {
        const duration = t.closedAt.getTime() - t.createdAt.getTime();
        return sum + Math.max(0, duration) / (1000 * 60);
      }
      return sum;
    }, 0);
    const avgHoldTime = totalHoldTime / recentTrades.length;

    // 2. Behavioral Flags
    const earlyExits = recentTrades.filter(t => {
        const hold = (t.closedAt?.getTime() ?? 0) - (t.createdAt?.getTime() ?? 0);
        return hold > 0 && hold < (30 * 60 * 1000); // Under 30 mins
    }).length;

    const fomoBuys = recentTrades.filter(t => t.emotion === 'FOMO' || t.aiBias === 'FOMO').length;
    const largeLosses = recentTrades.filter(t => (t.realizedPnl ?? 0) < -100).length;
    const bigWin = recentTrades.some(t => (t.realizedPnl ?? 0) > 500);


    // 3. The Scoring System for Archetypes
    // Assign points to behaviors. Highest score wins.
    
    // Declare variables to satisfy TS scope
    let profile: TraderArchetype = 'The Hold Master';
    let strength = 'Patient position management';
    let weakness = 'Over-holding losing trades';
    let nudge = 'Your holding power is strong. Set tighter stop losses to protect capital.';

    const scores: Record<string, number> = {
        'The Revenge Trader': (largeLosses * 2),
        'The FOMO Gambler': (fomoBuys * 1.5),
        'The Early Seller': (earlyExits * 1),
        'The Risk Manager': (winRate > 60 && !largeLosses ? 3 : 0),
        'The Streaky Trader': (bigWin ? 2 : 0),
        'The Hold Master': 1 // Default baseline score
    };

    // Find the archetype with the highest score
    const winningArchetype = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b)[0] as TraderArchetype;
    
    // Map Strategy
    profile = winningArchetype;
    
    switch (profile) {
        case 'The Revenge Trader':
            strength = 'Persistence';
            weakness = 'Trading emotionally after losses';
            nudge = `After a loss, sit out ${Math.ceil(avgHoldTime * 2)} minutes. Do not chase the market.`;
            break;
        case 'The FOMO Gambler':
            strength = 'Market awareness';
            weakness = 'Entering on green candles without a plan';
            nudge = 'Wait 2 minutes before clicking Buy. If the entry is still valid then, take it.';
            break;
        case 'The Early Seller':
            strength = 'Risk aversion';
            weakness = 'Cutting winners too soon';
            nudge = 'You are exiting too early. Move your stop loss to break-even and let the trade hit its target.';
            break;
        case 'The Risk Manager':
            strength = 'Emotional discipline';
            weakness = 'Conservative sizing';
            nudge = 'Your win rate is elite. Consider increasing your position size slightly on A+ setups.';
            break;
        case 'The Streaky Trader':
            strength = 'High upside potential';
            weakness = 'Profit inconsistency';
            nudge = 'Nice win! Now stick to the same process to prove it wasn\'t a fluke.';
            break;
        case 'The Hold Master':
        default:
            strength = 'Patient position management';
            weakness = 'Over-holding losing trades';
            nudge = 'Your holding power is strong. Set tighter stop losses to protect capital.';
            break;
    }

    return {
      profile,
      strength,
      weakness,
      nudge,
      winRate: Math.round(winRate * 10) / 10,
      avgHoldTime: Math.round(avgHoldTime * 10) / 10
    };
  }

  // Helper for one-off nudges
  generateNudge(profile: TraderArchetype): string {
    const nudges: Record<string, string[]> = {
      'The Early Seller': ['Let winners run.', 'Fear is closing your trades, not strategy.'],
      'The Dip Chaser': ['Wait for the floor.', 'Don\'t catch falling knives.'],
      'The Hold Master': ['Take profit at targets.', 'Don\'t let a winner turn into a loser.'],
      'The Revenge Trader': ['Walk away for 30 mins.', 'The market doesn\'t owe you anything.'],
      'The FOMO Gambler': ['Plan the trade, trade the plan.', 'If you missed the entry, wait for the next one.'],
      'The Risk Manager': ['Excellent discipline.', 'Consistency is the holy grail.'],
      'The Streaky Trader': ['Focus on process, not PnL.', 'Avoid the post-win overconfidence trap.']
    };

    const options = nudges[profile] || ['Keep trading consistently.'];
    return options[Math.floor(Math.random() * options.length)] ?? 'Keep trading consistently.';
  }
}

export default new TraderProfileService();