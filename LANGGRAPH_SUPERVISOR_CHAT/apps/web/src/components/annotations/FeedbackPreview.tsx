'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  TrendingUp,
  Lightbulb,
  Search,
} from 'lucide-react';

interface FeedbackItem {
  field: string;
  pathQuality: string;
  correctPath?: string;
  searchEffectiveness?: string;
  betterSearchTerms?: string[];
  edgeCaseDescription?: string;
  portalNotes?: string;
}

interface FeedbackPreviewProps {
  verificationId: string;
  mapper?: string;
}

/**
 * Preview of feedback that will be used in future extractions
 * Shows how current annotations will improve the system
 */
export function FeedbackPreview({
  verificationId,
  mapper,
}: FeedbackPreviewProps) {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeedback();
  }, [verificationId, mapper]);

  const loadFeedback = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('verificationId', verificationId);
      if (mapper) params.append('mapper', mapper);

      const response = await fetch(`/api/label-studio/feedback-preview?${params.toString()}`);
      const data = await response.json();

      if (data.feedback) {
        setFeedback(data.feedback);
      }
    } catch (error) {
      console.error('Failed to load feedback preview:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Feedback Preview</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (feedback.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Feedback Preview</CardTitle>
          <CardDescription>No feedback annotations yet</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Once you annotate this verification in Label Studio, the feedback will appear here
              showing how it will improve future extractions.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Feedback Preview</CardTitle>
        <CardDescription>
          How these annotations will improve future extractions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {feedback.map((item, index) => (
          <div key={index} className="border-l-4 border-l-primary pl-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">{item.field}</span>
              {item.pathQuality === 'correct' && (
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Correct Path
                </Badge>
              )}
              {item.pathQuality === 'incorrect' && (
                <Badge variant="destructive">
                  <XCircle className="h-3 w-3 mr-1" />
                  Path Error
                </Badge>
              )}
              {item.pathQuality === 'partial' && (
                <Badge variant="secondary">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Partial Path
                </Badge>
              )}
            </div>

            {/* Path Correction */}
            {item.correctPath && (
              <div className="text-sm">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <TrendingUp className="h-3 w-3" />
                  <span>Future extractions will use:</span>
                </div>
                <code className="text-xs bg-secondary px-2 py-1 rounded">
                  {item.correctPath}
                </code>
              </div>
            )}

            {/* Search Strategy */}
            {item.searchEffectiveness && item.betterSearchTerms && (
              <div className="text-sm">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Search className="h-3 w-3" />
                  <span>Recommended search terms:</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {item.betterSearchTerms.map((term, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {term}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Edge Case */}
            {item.edgeCaseDescription && (
              <Alert className="mt-2">
                <Lightbulb className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <strong>Edge Case Documented:</strong> {item.edgeCaseDescription}
                </AlertDescription>
              </Alert>
            )}

            {/* Portal Notes */}
            {item.portalNotes && (
              <div className="text-xs text-muted-foreground">
                💡 Portal note: {item.portalNotes}
              </div>
            )}
          </div>
        ))}

        <div className="pt-4 border-t">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              These annotations will be automatically incorporated into future extractions via the
              enhanced RAG system, helping the LLM learn from your corrections.
            </AlertDescription>
          </Alert>
        </div>
      </CardContent>
    </Card>
  );
}
