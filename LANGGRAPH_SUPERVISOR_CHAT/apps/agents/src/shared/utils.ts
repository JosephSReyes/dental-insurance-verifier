import { ChatOllama } from "@langchain/ollama";
import { DEFAULT_MODEL } from "./config.js";

/**
 * Centralized model loading function
 * Connects to Ollama API using OLLAMA_SERVICE_MODEL.
 *
 * @param modelName - Ignored, kept for compatibility
 * @param temperature - Temperature setting (default: 0 for deterministic)
 * @returns Configured ChatOllama instance
 */
export async function loadChatModel(
  modelName: string = DEFAULT_MODEL,
  temperature: number = 0
) {
  // Auto-detect Docker environment
  const isDocker = process.env.DOCKER_CONTAINER === "true";
  const baseUrl = isDocker
    ? "http://host.docker.internal:11434"
    : process.env.OLLAMA_SERVICE_URL || "http://localhost:11434";

  const model = process.env.OLLAMA_SERVICE_MODEL || "";

  console.log(`[LOAD_MODEL] Connecting to Ollama at ${baseUrl}`);
  console.log(`[LOAD_MODEL] Model: ${model}`);

  return new ChatOllama({
    model: model,
    baseUrl: baseUrl,
    temperature: temperature,
  });
}