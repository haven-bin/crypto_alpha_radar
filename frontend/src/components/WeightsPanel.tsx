import React from 'react';

interface Weight {
  dimension: string;
  weight: number;
}

interface WeightsPanelProps {
  weights: Weight[];
}

const dimLabels: Record<string, { label: string; emoji: string; color: string }> = {
  address_growth: { label: 'Address Growth', emoji: '📈', color: 'from-emerald-500 to-green-400' },
  volume_growth: { label: 'Volume Growth', emoji: '📊', color: 'from-cyan-500 to-blue-400' },
  whale_buying: { label: 'Whale Buying', emoji: '🐋', color: 'from-purple-500 to-indigo-400' },
  smart_money: { label: 'Smart Money', emoji: '🧠', color: 'from-amber-500 to-yellow-400' },
  market_cap: { label: 'Market Cap Factor', emoji: '💎', color: 'from-rose-500 to-pink-400' },
};

const WeightsPanel: React.FC<WeightsPanelProps> = ({ weights }) => {
  const maxWeight = Math.max(...weights.map(w => w.weight), 1);

  return (
    <div className="glass-card p-6 fade-in-up">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl">⚙️</span>
        <div>
          <h2 className="text-lg font-bold text-white">Engine Weights</h2>
          <p className="text-xs text-slate-500">Dynamic weights updated by the 48h backtest loop</p>
        </div>
      </div>

      <div className="space-y-4">
        {weights.map((w, i) => {
          const dim = dimLabels[w.dimension] || { label: w.dimension, emoji: '📌', color: 'from-slate-500 to-slate-400' };
          const pct = (w.weight / maxWeight) * 100;

          return (
            <div key={w.dimension} className="fade-in-up" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{dim.emoji}</span>
                  <span className="text-sm font-medium text-slate-300">{dim.label}</span>
                </div>
                <span className="text-sm font-bold text-white">{w.weight.toFixed(1)}</span>
              </div>
              <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${dim.color} bar-fill-animate`}
                  style={{ width: `${pct}%`, animationDelay: `${i * 0.15 + 0.2}s` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Total Weight Sum */}
      <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
        <span className="text-xs text-slate-500 uppercase tracking-wider">Total Weight Sum</span>
        <span className="text-lg font-black text-indigo-400">
          {weights.reduce((sum, w) => sum + w.weight, 0).toFixed(1)}
        </span>
      </div>
    </div>
  );
};

export default WeightsPanel;
