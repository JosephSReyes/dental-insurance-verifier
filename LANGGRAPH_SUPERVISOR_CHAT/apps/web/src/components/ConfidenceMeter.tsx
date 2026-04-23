import { cn } from '@/lib/utils';

interface ConfidenceMeterProps {
  value: number; // 0-1
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function ConfidenceMeter({ value, size = 'sm', showLabel = true }: ConfidenceMeterProps) {
  const percentage = Math.round(value * 100);

  const getColor = (val: number) => {
    if (val >= 0.8) return 'bg-green-500';
    if (val >= 0.6) return 'bg-yellow-500';
    if (val >= 0.4) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getTextColor = (val: number) => {
    if (val >= 0.8) return 'text-green-700';
    if (val >= 0.6) return 'text-yellow-700';
    if (val >= 0.4) return 'text-orange-700';
    return 'text-red-700';
  };

  const heights = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3',
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={cn('h-full transition-all', getColor(value), heights[size])}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <span className={cn('text-xs font-medium', getTextColor(value))}>
          {percentage}%
        </span>
      )}
    </div>
  );
}
