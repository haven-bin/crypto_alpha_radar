import React from 'react';

interface StatsBarProps {
  totalSignals: number;
  winRate: number;
  avgScore: number;
  totalWeight: number;
}

const StatsBar: React.FC<StatsBarProps> = ({ totalSignals, winRate, avgScore, totalWeight }) => {
  const stats = [
    { emoji: '📡', label: 'Total Signals', value: totalSignals.toString(), color: 'text-indigo-400' },
    { emoji: '🎯', label: 'Win Rate', value: `${winRate.toFixed(1)}%`, color: winRate >= 60 ? 'text-emerald-400' : winRate >= 40 ? 'text-amber-400' : 'text-rose-400' },
    { emoji: '⚡', label: 'Avg Score', value: avgScore.toFixed(1), color: 'text-cyan-400' },
    { emoji: '⚖️', label: 'Weight Sum', value: totalWeight.toFixed(1), color: 'text-purple-400' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
      {stats.map((stat, i) => (
        <div
          key={stat.label}
          className="glass-card p-4 text-center fade-in-up"
          style={{ animationDelay: `${i * 0.08}s` }}
        >
          <span className="text-2xl block mb-1">{stat.emoji}</span>
          <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">{stat.label}</p>
        </div>
      ))}
    </div>
  );
};

export default StatsBar;
