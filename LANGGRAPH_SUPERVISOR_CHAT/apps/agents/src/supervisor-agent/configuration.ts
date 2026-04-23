import { Annotation } from "@langchain/langgraph";
import { SUPERVISOR_SYSTEM_PROMPT } from "./prompts.js";
import { DEFAULT_MODEL } from "../shared/config.js";

/**
 * Configuration for the supervisor agent.
 * Uses centralized AI model configuration (NO hardcoded models!)
 */
export const AgentConfigurationAnnotation = Annotation.Root({
  /**
   * The language model to use for the supervisor.
   */
  model: Annotation<string>,

  /**
   * System prompt template for the supervisor.
   */
  systemPromptTemplate: Annotation<string>,

  /**
   * Maximum number of recursive graph iterations allowed.
   * Each dental code takes ~7 steps (extract→find→count→decide→validate).
   * Default 100 allows ~14 procedures with complex related codes.
   */
  recursionLimit: Annotation<number>,
});

/**
 * Ensure default configuration is set.
 * Uses DEFAULT_MODEL from centralized configuration
 */
export function ensureAgentConfiguration(config: any) {
  const configurable = config.configurable ?? {};
  return {
    model: configurable.model ?? DEFAULT_MODEL,
    systemPromptTemplate: configurable.systemPromptTemplate ?? SUPERVISOR_SYSTEM_PROMPT,
    recursionLimit: configurable.recursionLimit ?? 100,
  };
}