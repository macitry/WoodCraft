import type { ServerProgress } from '../api/modelApi';

interface ProgressBarProps {
  progress: ServerProgress;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ progress }) => {
  const hasTotal = progress.total > 0;
  const pct = hasTotal
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  const phaseLabel: Record<string, string> = {
    warming: '预热中',
    generating: '生成 CAD 模型',
    idle: '就绪',
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Spinner */}
      <div className="w-10 h-10 border-2 border-wood-400 border-t-transparent rounded-full animate-spin" />

      {/* Label */}
      <div className="text-sm text-neutral-300">
        {phaseLabel[progress.phase] || progress.phase}
        {progress.config_total > 0 && (
          <span className="text-neutral-500 ml-1">
            ({progress.config}/{progress.config_total})
          </span>
        )}
      </div>

      {/* Part name */}
      {progress.part && progress.part !== 'done' && (
        <div className="text-xs text-neutral-500 font-mono">
          {progress.part}
        </div>
      )}

      {/* Progress bar + percentage */}
      {hasTotal && (
        <>
          <div className="w-48 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-wood-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(pct, 2)}%` }}
            />
          </div>
          <div className="text-xs text-neutral-500 font-mono tabular-nums">
            {pct}%
          </div>
        </>
      )}
    </div>
  );
};

export default ProgressBar;
