'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';

interface LabelStudioEmbedProps {
  taskId: string;
  verificationId: string;
  field: string;
  onAnnotationComplete?: (annotation: any) => void;
}

/**
 * Embedded Label Studio annotation interface
 * This component embeds Label Studio via iframe for seamless annotation
 */
export function LabelStudioEmbed({
  taskId,
  verificationId,
  field,
  onAnnotationComplete,
}: LabelStudioEmbedProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Set up message listener for Label Studio events
    const handleMessage = (event: MessageEvent) => {
      // Verify origin (adjust for your Label Studio URL)
      if (!event.origin.includes('localhost:8080')) {
        return;
      }

      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

        // Handle annotation completion
        if (data.type === 'annotation:completed' || data.type === 'annotation:submitted') {
          console.log('Annotation completed:', data);
          if (onAnnotationComplete) {
            onAnnotationComplete(data);
          }
        }

        // Handle iframe loaded
        if (data.type === 'iframe:loaded') {
          setLoading(false);
        }
      } catch (err) {
        console.error('Error parsing message from Label Studio:', err);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [onAnnotationComplete]);

  const labelStudioUrl = process.env.NEXT_PUBLIC_LABEL_STUDIO_URL || 'http://localhost:8080';
  const iframeSrc = `${labelStudioUrl}/tasks/${taskId}?embed=true`;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>
          Annotate: {field}
          <span className="text-sm text-muted-foreground ml-2">
            (Verification: {verificationId})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <div className="relative">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-sm text-muted-foreground">Loading annotation interface...</p>
                </div>
              </div>
            )}
            <iframe
              ref={iframeRef}
              src={iframeSrc}
              className="w-full border rounded-lg"
              style={{ minHeight: '800px', height: '80vh' }}
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setError('Failed to load Label Studio. Please check if Label Studio is running.');
              }}
              title="Label Studio Annotation Interface"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
