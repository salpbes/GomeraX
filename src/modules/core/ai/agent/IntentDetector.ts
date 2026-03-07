/**
 * Intent Detector - Detects BIM commands from natural language
 *
 * This module parses user input to detect actionable BIM commands.
 * Used by the Hybrid Strategy to execute actions alongside AI responses.
 *
 * When native function calling becomes available, this module can be
 * bypassed in favor of AI-generated tool calls.
 */

import type { ToolCall } from "./types";
import { ELEMENT_TYPE_MAP } from "./ToolExecutor";

/**
 * Detection result
 */
export interface DetectionResult {
  /** Whether an actionable command was detected */
  detected: boolean;
  /** The detected tool call (if any) */
  toolCall?: ToolCall;
  /** Confidence level (for future ML-based detection) */
  confidence?: number;
}

/**
 * Intent Detector class
 */
export class IntentDetector {
  /**
   * Detect actionable BIM commands from user input
   */
  detect(input: string): DetectionResult {
    const lowerInput = input.toLowerCase().trim();

    // Detect element types mentioned
    const detectedTypes = this.detectElementTypes(lowerInput);

    // Try to detect action + element type commands
    if (detectedTypes.length > 0) {
      // Select
      if (this.matchesAction(lowerInput, ["select"])) {
        return this.createResult("selectElements", { elementTypes: detectedTypes });
      }

      // Hide
      if (this.matchesAction(lowerInput, ["hide"])) {
        return this.createResult("hideElements", { elementTypes: detectedTypes });
      }

      // Show/Unhide
      if (this.matchesAction(lowerInput, ["show", "unhide"])) {
        return this.createResult("showElements", { elementTypes: detectedTypes });
      }

      // Isolate
      if (this.matchesAction(lowerInput, ["isolate"])) {
        return this.createResult("isolateElements", { elementTypes: detectedTypes });
      }

      // Zoom/Focus
      if (this.matchesAction(lowerInput, ["zoom", "focus"])) {
        return this.createResult("zoomToElements", { elementTypes: detectedTypes });
      }

      // Count
      if (this.matchesAction(lowerInput, ["count", "how many"])) {
        return this.createResult("countElements", { elementTypes: detectedTypes });
      }
    }

    // Non-element commands
    if (this.matchesAction(lowerInput, ["reset", "show everything", "reset view"])) {
      return this.createResult("resetView", {});
    }

    if (this.matchesAction(lowerInput, ["hide everything", "hide all"])) {
      return this.createResult("hideEverything", {});
    }

    if (this.matchesAction(lowerInput, ["clear selection", "deselect"])) {
      return this.createResult("clearSelection", {});
    }

    if (this.matchesAction(lowerInput, ["color by type", "show colors", "color splash"])) {
      return this.createResult("colorByType", {});
    }

    if (this.matchesAction(lowerInput, ["clash detection", "detect clashes", "find clashes", "run clash", "check clashes", "collision detection"])) {
      return this.createResult("runClashDetection", {});
    }

    if (this.matchesAction(lowerInput, ["clear clashes", "remove clashes", "hide clashes", "stop clash"])) {
      return this.createResult("clearClashDetection", {});
    }

    if (this.matchesAction(lowerInput, ["clash summary", "clash report", "how many clashes", "clash results"])) {
      return this.createResult("getClashSummary", {});
    }

    if (this.matchesAction(lowerInput, ["clip", "section", "cut"])) {
      return this.createResult("addClippingPlane", {});
    }

    if (this.matchesAction(lowerInput, ["fit view", "fit all", "fit to screen"])) {
      return this.createResult("fitView", {});
    }

    if (lowerInput.includes("zoom in")) {
      return this.createResult("zoom", { direction: "in" });
    }

    if (lowerInput.includes("zoom out")) {
      return this.createResult("zoom", { direction: "out" });
    }

    // View commands
    if (this.matchesAction(lowerInput, ["top view", "from top", "top down"])) {
      return this.createResult("setView", { view: "top" });
    }

    if (this.matchesAction(lowerInput, ["front view", "from front"])) {
      return this.createResult("setView", { view: "front" });
    }

    if (this.matchesAction(lowerInput, ["back view", "from back"])) {
      return this.createResult("setView", { view: "back" });
    }

    if (this.matchesAction(lowerInput, ["left view", "from left"])) {
      return this.createResult("setView", { view: "left" });
    }

    if (this.matchesAction(lowerInput, ["right view", "from right"])) {
      return this.createResult("setView", { view: "right" });
    }

    if (this.matchesAction(lowerInput, ["iso", "isometric"])) {
      return this.createResult("setView", { view: "iso" });
    }

    // No action detected
    return { detected: false };
  }

  /**
   * Detect element types in input
   */
  private detectElementTypes(input: string): string[] {
    const detected: string[] = [];

    for (const [keyword, ifcType] of Object.entries(ELEMENT_TYPE_MAP)) {
      // Use word boundary matching to avoid partial matches
      const regex = new RegExp(`\\b${keyword}\\b`, "i");
      if (regex.test(input) && !detected.includes(ifcType)) {
        detected.push(ifcType);
      }
    }

    return detected;
  }

  /**
   * Check if input matches any of the action keywords
   */
  private matchesAction(input: string, keywords: string[]): boolean {
    return keywords.some((keyword) => input.includes(keyword));
  }

  /**
   * Create a detection result with a tool call
   */
  private createResult(
    toolName: string,
    args: Record<string, unknown>
  ): DetectionResult {
    return {
      detected: true,
      toolCall: {
        name: toolName,
        arguments: args,
      },
      confidence: 1.0, // Rule-based = 100% confidence
    };
  }
}

/**
 * Default intent detector instance
 */
export const intentDetector = new IntentDetector();
