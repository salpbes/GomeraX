/**
 * WebLLM Engine Configuration
 * Central configuration for the local AI model
 */

/**
 * Model identifier for WebLLM
 */
export const MODEL_ID = "Qwen3-8B-q4f16_1-MLC";

/**
 * Maximum number of conversation pairs to keep in history
 * (each pair = 1 user message + 1 assistant message)
 * Lower = faster prefill, Higher = more context memory
 */
export const MAX_HISTORY_PAIRS = 3;

/**
 * Context window size for the model
 * Lower = faster prefill, Higher = more context
 * 8192 is a good balance for responsiveness
 */
export const CONTEXT_WINDOW_SIZE = 8192;

/**
 * Maximum tokens for generation
 * Lower = faster responses, Higher = longer outputs
 */
export const MAX_TOKENS = {
  chat: 1024,      // For action responses
  stream: 2048,    // For conversational responses
  longForm: 4096,  // For detailed explanations (if needed)
};

/**
 * Temperature for generation (controls randomness)
 * Lower = more deterministic, Higher = more creative
 */
export const TEMPERATURE = 0.7;

/**
 * Log level for WebLLM
 */
export const LOG_LEVEL = "INFO" as const;

/**
 * Whether to enable thinking mode for Qwen3
 * When true, model outputs <think>...</think> tags with reasoning
 * Disabled for faster responses - thinking adds latency
 */
export const ENABLE_THINKING = {
  chat: true,
  stream: true,
};

/**
 * Model display information
 */
export const MODEL_INFO = {
  id: MODEL_ID,
  name: MODEL_ID,
  size: "~4.5GB",
  description:
    "Advanced reasoning model (100% local, privacy-preserving)",
} as const;
