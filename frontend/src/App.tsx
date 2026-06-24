import { useState, useEffect } from 'react';
import './index.css';
import SignalCard from './components/SignalCard';
import OutcomeCard from './components/OutcomeCard';
import WeightsPanel from './components/WeightsPanel';
import StatsBar from './components/StatsBar';

const API_BASE = 'http://localhost:3001';

// Fallback mock data so UI looks populated even without backend
const MOCK_SIGNALS = [
  { id: 1, type: 'bullish', token: 'MEME_A', address: 'MemeA11111111111111111111111111111111111111', description: 'Strong structural data and smart money accumulation detected. Address growth +900%, volume surge +900%.', timestamp: new Date().toISOString(), score_initial: 98 },
  { id: 2, type: 'bullish', token: 'HIDDEN_GEM', address: 'Gem44444444444444444444444444444444444444', description: 'Tiny market cap ($1M) with explosive volume spike. 3 smart wallets entered simultaneously.', timestamp: new Date(Date.now() - 3600000).toISOString(), score_initial: 76 },
  { id: 3, type: 'bullish', token: 'SOL_DOGE', address: 'SolDoge555555555555555555555555555555555', description: 'New meme with rapid community growth. Whale wallet accumulated $800K in the last 24h.', timestamp: new Date(Date.now() - 7200000).toISOString(), score_initial: 85 },
  { id: 4, type: 'bearish', token: 'RISK_TOKEN', address: 'Risk666666666666666666666666666666666666', description: 'Liquidity draining fast. Smart money exiting. Dev wallet shows suspicious activity.', timestamp: new Date(Date.now() - 10800000).toISOString(), score_initial: 42 },
  { id: 5, type: 'bullish', token: 'ALPHA_AI', address: 'Alpha777777777777777777777777777777777777', description: 'AI narrative trending on CT. 5 top wallets entered within 2 hours. Volume up 1200%.', timestamp: new Date(Date.now() - 1800000).toISOString(), score_initial: 91 },
];

const MOCK_OUTCOMES = [
  { id: 1, signal_id: 1, token: 'MEME_A', address: 'MemeA1111...', alpha_return: 22.5, price_change: 28.3, volume_change: 45.2, liquidity_change: 8.1, smart_money_change: 'continues', result_classification: 'WIN' as const, signal_score: 88, timestamp: new Date().toISOString() },
  { id: 2, signal_id: 2, token: 'HIDDEN_GEM', address: 'Gem4444...', alpha_return: -2.1, price_change: 1.5, volume_change: -12.3, liquidity_change: -1.8, smart_money_change: 'continues', result_classification: 'NEUTRAL' as const, signal_score: 35, timestamp: new Date().toISOString() },
  { id: 3, signal_id: 3, token: 'OLD_PUMP', address: 'Old3333...', alpha_return: -15.2, price_change: -18.7, volume_change: -60.1, liquidity_change: -25.4, smart_money_change: 'exited', result_classification: 'LOSE' as const, signal_score: 12, timestamp: new Date().toISOString() },
];

const MOCK_WEIGHTS = [
  { dimension: 'address_growth', weight: 30.4 },
  { dimension: 'volume_growth', weight: 20.4 },
  { dimension: 'whale_buying', weight: 20.4 },
  { dimension: 'smart_money', weight: 20.4 },
  { dimension: 'market_cap', weight: 10.4 },
];

type TabKey = 'signals' | 'backtest' | 'weights';

function App() {
  const [signals, setSignals] = useState(MOCK_SIGNALS);
  const [outcomes, setOutcomes] = useState(MOCK_OUTCOMES);
  const [weights, setWeights] = useState(MOCK_WEIGHTS);
  const [activeTab, setActiveTab] = useState<TabKey>('signals');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [sigRes, outRes, wRes] = await Promise.all([
          fetch(`${API_BASE}/api/signals`),
          fetch(`${API_BASE}/api/outcomes`),
          fetch(`${API_BASE}/api/weights`),
        ]);
        if (sigRes.ok) {
          const d = await sigRes.json();
          if (d.length > 0) setSignals(d);
        }
        if (outRes.ok) {
          const d = await outRes.json();
          if (d.length > 0) setOutcomes(d);
        }
        if (wRes.ok) {
          const d = await wRes.json();
          if (d.length > 0) setWeights(d);
        }
      } catch {
        // Fallback to mock data silently
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Compute stats
  const totalSignals = signals.length;
  const wins = outcomes.filter(o => o.result_classification === 'WIN').length;
  const winRate = outcomes.length > 0 ? (wins / outcomes.length) * 100 : 0;
  const avgScore = outcomes.length > 0
    ? outcomes.reduce((s, o) => s + o.signal_score, 0) / outcomes.length
    : 0;
  const totalWeight = weights.reduce((s, w) => s + w.weight, 0);

  const tabs: { key: TabKey; label: string; emoji: string }[] = [
    { key: 'signals', label: 'Signals', emoji: '📡' },
    { key: 'backtest', label: 'Backtest Review', emoji: '🔬' },
    { key: 'weights', label: 'Engine Weights', emoji: '⚙️' },
  ];

  return (
    <>
      {/* Background Orbs */}
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />
      <div className="bg-orb bg-orb-3" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <header className="mb-10 fade-in-up">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl shadow-lg shadow-indigo-500/30">
                📡
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-white via-indigo-200 to-purple-300 bg-clip-text text-transparent">
                  Crypto Alpha Radar
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">AI-Powered Opportunity Discovery Engine</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-600/20 to-indigo-600/20 border border-indigo-500/30 text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Solana
              </span>
              <span className="text-[10px] text-slate-600">
                {loading ? 'Loading...' : 'Live'}
              </span>
            </div>
          </div>
        </header>

        {/* Stats Bar */}
        <StatsBar
          totalSignals={totalSignals}
          winRate={winRate}
          avgScore={avgScore}
          totalWeight={totalWeight}
        />

        {/* Tabs */}
        <div className="flex gap-1 mb-8 p-1 bg-white/5 rounded-xl w-fit backdrop-blur-sm border border-white/5 fade-in-up" style={{ animationDelay: '0.3s' }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 flex items-center gap-2
                ${activeTab === tab.key
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
            >
              <span>{tab.emoji}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'signals' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {signals.map((sig, i) => (
              <SignalCard key={sig.id} {...sig} index={i} />
            ))}
          </div>
        )}

        {activeTab === 'backtest' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {outcomes.map((out, i) => (
              <OutcomeCard key={out.id} {...out} index={i} />
            ))}
          </div>
        )}

        {activeTab === 'weights' && (
          <div className="max-w-2xl">
            <WeightsPanel weights={weights} />
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 pb-8 text-center fade-in-up" style={{ animationDelay: '0.5s' }}>
          <p className="text-[10px] text-slate-600">
            Crypto Alpha Radar v1.0 · Solana Network · Built for Researchers & Fund Managers
          </p>
        </footer>
      </div>
    </>
  );
}

export default App;
