import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

interface VerificationContextProps {
  officeContext?: {
    officeKey: string;
    officeName: string;
  };
  portalContext?: {
    portalType: string;
    portalVersion?: string;
  };
  showTooltip?: boolean;
}

export function VerificationContextBadges({
  officeContext,
  portalContext,
  showTooltip = true
}: VerificationContextProps) {
  return (
    <div className="flex gap-2 items-center flex-wrap">
      {officeContext && (
        <Badge variant="default" className="font-mono">
          🏢 Office: {officeContext.officeName}
        </Badge>
      )}

      {portalContext && (
        <Badge variant="secondary" className="font-mono">
          🔌 Portal: {portalContext.portalVersion || portalContext.portalType}
        </Badge>
      )}

      {showTooltip && (officeContext || portalContext) && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-sm">
                <strong>Training Isolation:</strong> Feedback you provide will only train
                the AI for this specific office and portal combination. This ensures
                each office gets customized extraction patterns.
              </p>
              {officeContext && (
                <p className="text-xs mt-2 text-muted-foreground">
                  Office Key: {officeContext.officeKey}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
