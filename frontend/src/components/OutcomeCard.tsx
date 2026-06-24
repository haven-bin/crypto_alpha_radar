import React from 'react';

interface OutcomeCardProps {
  id: number;
  signal_id: number;
  token: string;
  address: string;
  alpha_return: number;
  price_change: number;
  volume_change: number;
  liquidity_change: number;
  smart_money_change: string;
  result_classification: 'WIN' | 'LOSE' | 'NEUTRAL';
  signal_score: number;
  timestamp: string;
  index: number;
}

const badgeStyles: Record<string, { bg: string; text: string; emoji: string }> = {
  WIN: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', emoji: '🟢' },
  LOSE: { bg: 'bg-rose-500/20', text: 'text-rose-400', emoji: '🔴' },
  NEUTRAL: { bg: 'bg-amber-500/20', text: 'text-amber-400', emoji: '🟡' },
};

const StatBar: React.FC<{ label: string; value: number; max: number; color: string; delay: number }> = ({ label, value, max, color, delay }) => {
  const width = Math.min(Math.abs(value) / max * 100, 100);
  const isNeg = value < 0;

  return (
    <div className="mb-2">
      <div className="flex justify-between text-[10px] mb-1">
        <span className="text-slate-400">{label}</span>
        <span className={isNeg ? 'text-rose-400' : 'text-emerald-400'}>
          {isNeg ? '' : '+'}{value.toFixed(1)}%
        </span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bar-fill-animate ${color}`}
          style={{ width: `${width}%`, animationDelay: `${delay}s` }}
        />
      </div>
    </div>
  );
};

const OutcomeCard: React.FC<OutcomeCardProps> = ({
  token, alpha_return, price_change, volume_change,
  liquidity_change, smart_money_change, result_classification, signal_score, index
}) => {
  const badge = badgeStyles[result_classification] || badgeStyles.NEUTRAL;
  const baseDelay = index * 0.1;

  return (
    <div className="glass-card-hover p-5 fade-in-up" style={{ animationDelay: `${baseDelay}s` }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white">{token}</h3>
          <span className="text-[10px] text-slate-500">Smart Money: {smart_money_change}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${badge.bg} ${badge.text}`}>
            {badge.emoji} {result_classification}
          </span>
        </div>
      </div>

      <StatBar label="Alpha Return" value={alpha_return} max={30} color="bg-gradient-to-r from-indigo-500 to-purple-500" delay={baseDelay + 0.2} />
      <StatBar label="Price Change" value={price_change} max={30} color="bg-gradient-to-r from-emerald-500 to-cyan-500" delay={baseDelay + 0.3} />
      <StatBar label="Volume Change" value={volume_change} max={100} color="bg-gradient-to-r from-amber-500 to-orange-500" delay={baseDelay + 0.4} />
      <StatBar label="Liquidity" value={liquidity_change} max={20} color="bg-gradient-to-r from-sky-500 to-blue-500" delay={baseDelay + 0.5} />

      {/* Signal Score Mini Bar */}
      <div className="mt-4 pt-3 border-t border-white/5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">Signal Score</span>
          <span className="text-sm font-bold text-indigo-400">{signal_score.toFixed(0)}/100</span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden mt-1.5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bar-fill-animate"
            style={{ width: `${signal_score}%`, animationDelay: `${baseDelay + 0.6}s` }}
          />
        </div>
      </div>
    </div>
  );
};

export default OutcomeCard;
