/**
 * Structured Logging & Confidence Tracking Utilities
 * 
 * Provides standardized logging and confidence scoring for all nodes
 * in the multi-agent workflow system.
 */

export interface NodeExecutionLog {
  nodeName: string;
  nodeType: 'deterministic' | 'llm_based' | 'hybrid' | 'one_at_a_time' | 'parallel';
  startTime: string;
  endTime?: string;
  duration?: number;
  confidence: number;
  success: boolean;
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  errors?: string[];
  metadata?: Record<string, any>;
}

export interface WorkflowExecutionLog {
  workflowId: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  nodeExecutions: NodeExecutionLog[];
  overallConfidence?: number;
  success: boolean;
}

let currentWorkflowLog: WorkflowExecutionLog | null = null;

export function startWorkflowLog(workflowId: string): void {
  currentWorkflowLog = {
    workflowId,
    startTime: new Date().toISOString(),
    nodeExecutions: [],
    success: true
  };
  console.log(`[WORKFLOW_LOG] Starting workflow: ${workflowId}`);
}

export function endWorkflowLog(): WorkflowExecutionLog | null {
  if (!currentWorkflowLog) {
    console.warn('[WORKFLOW_LOG] No active workflow to end');
    return null;
  }
  
  currentWorkflowLog.endTime = new Date().toISOString();
  currentWorkflowLog.duration = 
    new Date(currentWorkflowLog.endTime).getTime() - 
    new Date(currentWorkflowLog.startTime).getTime();
  
  // Calculate overall confidence as weighted average
  const nodeConfidences = currentWorkflowLog.nodeExecutions
    .filter(n => n.success)
    .map(n => n.confidence);
  
  if (nodeConfidences.length > 0) {
    currentWorkflowLog.overallConfidence = 
      nodeConfidences.reduce((sum, c) => sum + c, 0) / nodeConfidences.length;
  }
  
  console.log(`[WORKFLOW_LOG] Workflow complete:`, {
    id: currentWorkflowLog.workflowId,
    duration: `${currentWorkflowLog.duration}ms`,
    overallConfidence: currentWorkflowLog.overallConfidence?.toFixed(2),
    success: currentWorkflowLog.success,
    totalNodes: currentWorkflowLog.nodeExecutions.length
  });
  
  const log = currentWorkflowLog;
  currentWorkflowLog = null;
  return log;
}

export function logNodeExecution(
  nodeName: string,
  nodeType: 'deterministic' | 'llm_based' | 'hybrid' | 'one_at_a_time' | 'parallel',
  confidence: number,
  options?: {
    inputs?: Record<string, any>;
    outputs?: Record<string, any>;
    errors?: string[];
    metadata?: Record<string, any>;
  }
): void {
  const log: NodeExecutionLog = {
    nodeName,
    nodeType,
    startTime: new Date().toISOString(),
    confidence,
    success: !options?.errors || options.errors.length === 0,
    ...options
  };
  
  log.endTime = new Date().toISOString();
  log.duration = 0; // Will be calculated by wrapper
  
  if (currentWorkflowLog) {
    currentWorkflowLog.nodeExecutions.push(log);
  }
  
  console.log(`[NODE_LOG] ${nodeName}:`, {
    type: nodeType,
    confidence: `${(confidence * 100).toFixed(0)}%`,
    success: log.success,
    errors: options?.errors?.length || 0
  });
}

/**
 * Wrapper function to add structured logging to any node function
 */
export function withStructuredLogging<T extends (...args: any[]) => Promise<any>>(
  nodeName: string,
  nodeType: 'deterministic' | 'llm_based' | 'hybrid' | 'one_at_a_time',
  nodeFunction: T,
  options?: {
    extractInputs?: (args: Parameters<T>) => Record<string, any>;
    extractOutputs?: (result: Awaited<ReturnType<T>>) => Record<string, any>;
    calculateConfidence?: (args: Parameters<T>, result: Awaited<ReturnType<T>>) => number;
  }
): T {
  return (async (...args: Parameters<T>) => {
    const startTime = Date.now();
    const inputs = options?.extractInputs?.(args) || {};
    
    try {
      console.log(`[${nodeName}] START - Type: ${nodeType}`);
      
      const result = await nodeFunction(...args);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      const outputs = options?.extractOutputs?.(result) || {};
      const confidence = options?.calculateConfidence?.(args, result) ?? 
        (nodeType === 'deterministic' ? 1.0 : 0.8);
      
      logNodeExecution(nodeName, nodeType, confidence, {
        inputs,
        outputs,
        metadata: { duration }
      });
      
      console.log(`[${nodeName}] END - Duration: ${duration}ms, Confidence: ${(confidence * 100).toFixed(0)}%`);
      
      return result;
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      logNodeExecution(nodeName, nodeType, 0, {
        inputs,
        errors: [error instanceof Error ? error.message : String(error)],
        metadata: { duration }
      });
      
      console.error(`[${nodeName}] ERROR - Duration: ${duration}ms:`, error);
      throw error;
    }
  }) as T;
}

/**
 * Export current workflow log for external analysis
 */
export function exportWorkflowLog(): WorkflowExecutionLog | null {
  return currentWorkflowLog ? { ...currentWorkflowLog } : null;
}

/**
 * Get summary statistics for current workflow
 */
export function getWorkflowStats(): {
  totalNodes: number;
  deterministicNodes: number;
  llmNodes: number;
  hybridNodes: number;
  averageConfidence: number;
  failedNodes: number;
} | null {
  if (!currentWorkflowLog) return null;
  
  const executions = currentWorkflowLog.nodeExecutions;
  
  return {
    totalNodes: executions.length,
    deterministicNodes: executions.filter(n => n.nodeType === 'deterministic').length,
    llmNodes: executions.filter(n => n.nodeType === 'llm_based').length,
    hybridNodes: executions.filter(n => n.nodeType === 'hybrid').length,
    averageConfidence: executions.length > 0
      ? executions.reduce((sum, n) => sum + n.confidence, 0) / executions.length
      : 0,
    failedNodes: executions.filter(n => !n.success).length
  };
}
