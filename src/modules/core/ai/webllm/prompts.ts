import type { BIMContext } from "./types";

/**
 * Compact IFC element types (reduced tokens)
 */
const IFC_TYPES = `IFC types: IFCWALL, IFCDOOR, IFCWINDOW, IFCSLAB, IFCCOLUMN, IFCBEAM, IFCSTAIR, IFCROOF, IFCFURNITURE, IFCPIPE, IFCDUCT`;

/**
 * Compact system prompt for function calling mode
 * Optimized for minimal tokens while maintaining functionality
 */
const FUNCTION_CALLING_PROMPT = `You are AiDA, a BIM AI assistant.

ACTIONS - respond with [ACTION: func(args)]:
selectElements(["TYPE"]), hideElements(["TYPE"]), showElements(["TYPE"]), isolateElements(["TYPE"]), zoomToElements(["TYPE"]), countElements(["TYPE"]), colorByType(), resetView(), clearSelection(), setView("front"|"top"|"iso"), fitView(), zoom("in"|"out")

${IFC_TYPES}

Examples:
"hide doors" → [ACTION: hideElements(["IFCDOOR"])]
"select walls" → [ACTION: selectElements(["IFCWALL"])]
"color by type" → [ACTION: colorByType()]
"reset" → [ACTION: resetView()]
"hello" → Hi! I'm AiDA, how can I help with your BIM model?

For conversations, respond naturally. If asked to do something unavailable, say: "Sorry, this is outside my capabilities."`;

/**
 * Compact conversational prompt
 */
const CONVERSATIONAL_PROMPT = `You are AiDA, a BIM AI assistant. Be concise (1-3 sentences).
${IFC_TYPES}
If asked to do something unavailable (export, import, measure, create, edit), say: "Sorry, this is outside my capabilities."`;

/**
 * Build the BIM context section of the prompt
 */
function buildContextSection(bimContext: BIMContext): string {
  const parts: string[] = [];
  
  if (bimContext.totalElements !== undefined) {
    parts.push(`${bimContext.totalElements} elements`);
  }
  if (bimContext.selectedCount !== undefined && bimContext.selectedCount > 0) {
    parts.push(`${bimContext.selectedCount} selected`);
  }

  return parts.length > 0 ? `\n[Model: ${parts.join(', ')}]` : '';
}

/**
 * Build the complete system prompt with optional BIM context
 *
 * @param bimContext - Current state of the BIM model
 * @param enableFunctionCalling - Whether to include function calling instructions
 * @returns Complete system prompt string
 */
export function buildSystemPrompt(
  bimContext?: BIMContext,
  enableFunctionCalling: boolean = false
): string {
  let prompt = enableFunctionCalling
    ? FUNCTION_CALLING_PROMPT
    : CONVERSATIONAL_PROMPT;

  if (bimContext) {
    prompt += buildContextSection(bimContext);
  }

  return prompt;
}
