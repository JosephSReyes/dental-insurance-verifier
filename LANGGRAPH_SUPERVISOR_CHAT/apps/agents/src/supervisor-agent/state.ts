// Re-export the unified workflow state for backward compatibility
export {
  WorkflowState as AgentStateAnnotation,
  InputState as InputStateAnnotation,
  OutputState as OutputStateAnnotation,
  type WorkflowStateType,
  type InputStateType,
  type OutputStateType
} from "../shared/workflow-state.js";