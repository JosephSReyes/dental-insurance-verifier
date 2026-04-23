'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BookOpen, TrendingUp, AlertCircle } from 'lucide-react';

interface LearningIndicatorProps {
  field: string;
  mapper: string;
  officeId?: string;
  portalType?: string;
}

export function LearningIndicator({ field, mapper, officeId, portalType }: LearningIndicatorProps) {
  const [correctionCount, setCorrectionCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCorrectionCount() {
      try {
        const params = new URLSearchParams({
          mapper,
          field,
          ...(officeId && { officeId }),
          ...(portalType && { portalType }),
        });

        const response = await fetch(`/api/feedback/count?${params}`);
        const data = await response.json();
        setCorrectionCount(data.count || 0);
      } catch (error) {
        console.error('Failed to fetch correction count:', error);
        setCorrectionCount(0);
      } finally {
        setLoading(false);
      }
    }

    fetchCorrectionCount();
  }, [field, mapper, officeId, portalType]);

  if (loading) {
    return <span className="text-xs text-muted-foreground">...</span>;
  }

  if (correctionCount === null || correctionCount === 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-xs gap-1">
              <AlertCircle className="h-3 w-3" />
              New
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">No past corrections for this field yet.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const variant = correctionCount > 5 ? 'default' : correctionCount > 2 ? 'secondary' : 'outline';
  const icon = correctionCount > 5 ? TrendingUp : BookOpen;
  const Icon = icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={variant} className="text-xs gap-1">
            <Icon className="h-3 w-3" />
            {correctionCount}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs">
            <strong>{correctionCount} past correction{correctionCount !== 1 ? 's' : ''}</strong>{' '}
            for this field with this office and portal.
          </p>
          {correctionCount > 5 && (
            <p className="text-xs mt-1 text-muted-foreground">
              This is a frequently corrected field. Your feedback is valuable!
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
