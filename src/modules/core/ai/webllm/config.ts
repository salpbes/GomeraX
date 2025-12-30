/**
 * WebLLM Engine Configuration
 * Central configuration for the local AI model
 */

/**
 * Model identifier for WebLLM
 */
export const MODEL_ID = "Qwen3-0.6B-q4f32_1-MLC";

/**
 * Maximum number of conversation pairs to keep in history
 * (each pair = 1 user message + 1 assistant message)
 */
export const MAX_HISTORY_PAIRS = 10;

/**
 * Context window size for the model
 */
export const CONTEXT_WINDOW_SIZE = 32000;

/**
 * Maximum tokens for generation
 */
export const MAX_TOKENS = {
  chat: 8192,
  stream: 4096,
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
 */
export const ENABLE_THINKING = {
  chat: true,
  stream: false,
};

/**
 * Model display information
 */
export const MODEL_INFO = {
  id: MODEL_ID,
  name: "Qwen3-0.6B",
  size: "~1.2GB",
  description:
    "Advanced reasoning model with visible thinking process (100% local, privacy-preserving)",
} as const;
