import React from 'react';

interface SignalCardProps {
  id: number;
  type: string;
  token: string;
  address: string;
  description: string;
  timestamp: string;
  score_initial: number;
  index: number;
}

function getScoreColor(score: number) {
  if (score >= 80) return { ring: '#34d399', text: 'text-emerald-400', border: 'border-emerald-500/30', glow: 'shadow-emerald-500/20' };
  if (score >= 60) return { ring: '#fbbf24', text: 'text-amber-400', border: 'border-amber-500/30', glow: 'shadow-amber-500/20' };
  return { ring: '#f87171', text: 'text-rose-400', border: 'border-rose-500/30', glow: 'shadow-rose-500/20' };
}

function truncateAddress(addr: string) {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const SignalCard: React.FC<SignalCardProps> = ({ type, token, address, description, timestamp, score_initial, index }) => {
  const colors = getScoreColor(score_initial);
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score_initial / 100) * circumference;
  const borderGradient = type === 'bullish'
    ? 'from-emerald-500 via-emerald-400 to-cyan-400'
    : 'from-rose-500 via-rose-400 to-orange-400';

  return (
    <div
      className={`glass-card-hover p-5 relative overflow-hidden fade-in-up`}
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      {/* Top gradient border */}
      <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${borderGradient}`} />

      <div className="flex items-start justify-between gap-4">
        {/* Left: Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider
              ${type === 'bullish' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
              {type === 'bullish' ? '🟢 Bullish' : '🔴 Bearish'}
            </span>
            <span className="text-[10px] text-slate-500">{timeAgo(timestamp)}</span>
          </div>

          <h3 className="text-xl font-bold text-white mb-1 tracking-tight">{token}</h3>
          <p className="text-[11px] text-slate-500 font-mono mb-3">{truncateAddress(address)}</p>
          <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{description}</p>
        </div>

        {/* Right: Score Ring */}
        <div className="relative flex-shrink-0 w-24 h-24">
          <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
            <circle
              cx="50" cy="50" r="40"
              fill="none"
              stroke={colors.ring}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="score-ring-animate"
              style={{ animationDelay: `${index * 0.1 + 0.3}s` }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-black ${colors.text} score-number-animate`}
              style={{ animationDelay: `${index * 0.1 + 0.5}s` }}>
              {score_initial}
            </span>
            <span className="text-[9px] text-slate-500 uppercase tracking-widest">Score</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignalCard;
