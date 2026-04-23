'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, ExternalLink } from 'lucide-react';

interface AnnotationButtonProps {
  verificationId: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  showBadge?: boolean;
}

/**
 * Button to navigate to annotation page for a verification
 */
export function AnnotationButton({
  verificationId,
  variant = 'outline',
  size = 'sm',
  showBadge = false,
}: AnnotationButtonProps) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={() => router.push(`/annotate/${verificationId}`)}
        variant={variant}
        size={size}
      >
        <FileText className="h-4 w-4 mr-2" />
        Deep Annotation
      </Button>
      {showBadge && (
        <Badge variant="secondary" className="text-xs">
          Label Studio
        </Badge>
      )}
    </div>
  );
}

/**
 * Link to open Label Studio directly
 */
export function LabelStudioLink({ className }: { className?: string }) {
  const labelStudioUrl = process.env.NEXT_PUBLIC_LABEL_STUDIO_URL || 'http://localhost:8080';

  return (
    <Button
      onClick={() => window.open(labelStudioUrl, '_blank')}
      variant="ghost"
      size="sm"
      className={className}
    >
      <ExternalLink className="h-4 w-4 mr-2" />
      Open Label Studio
    </Button>
  );
}
