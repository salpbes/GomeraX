/**
 * Tool Executor - Executes tool calls against BIM actions
 *
 * MCP-Inspired: Separates tool execution from AI inference.
 * This executor can be used by any strategy (hybrid or function-calling).
 */

import type { ToolCall, ToolResult, IToolExecutor } from "./types";
import type { AIBimActions } from "../AIBimActions";
import type { ConversationContext } from "../ConversationContext";

/**
 * IFC element type mapping from natural language to IFC types
 */
export const ELEMENT_TYPE_MAP: Record<string, string> = {
  wall: "IFCWALL",
  walls: "IFCWALL",
  door: "IFCDOOR",
  doors: "IFCDOOR",
  window: "IFCWINDOW",
  windows: "IFCWINDOW",
  slab: "IFCSLAB",
  slabs: "IFCSLAB",
  floor: "IFCSLAB",
  floors: "IFCSLAB",
  column: "IFCCOLUMN",
  columns: "IFCCOLUMN",
  pillar: "IFCCOLUMN",
  pillars: "IFCCOLUMN",
  beam: "IFCBEAM",
  beams: "IFCBEAM",
  stair: "IFCSTAIR",
  stairs: "IFCSTAIR",
  staircase: "IFCSTAIR",
  roof: "IFCROOF",
  roofs: "IFCROOF",
  furniture: "IFCFURNISHINGELEMENT",
  pipe: "IFCPIPESEGMENT",
  pipes: "IFCPIPESEGMENT",
  duct: "IFCDUCTSEGMENT",
  ducts: "IFCDUCTSEGMENT",
  member: "IFCMEMBER",
  members: "IFCMEMBER",
};

/**
 * Tool Executor for BIM operations
 */
export class ToolExecutor implements IToolExecutor {
  private actions: AIBimActions;
  private context: ConversationContext;

  constructor(actions: AIBimActions, context: ConversationContext) {
    this.actions = actions;
    this.context = context;
  }

  /**
   * Execute a tool call
   */
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const { name, arguments: args } = toolCall;

    console.log(`[ToolExecutor] Executing: ${name}`, args);

    try {
      switch (name) {
        case "selectElements":
          return await this.executeSelectElements(args);
        case "hideElements":
          return await this.executeHideElements(args);
        case "showElements":
          return await this.executeShowElements(args);
        case "isolateElements":
          return await this.executeIsolateElements(args);
        case "zoomToElements":
          return await this.executeZoomToElements(args);
        case "countElements":
          return await this.executeCountElements(args);
        case "resetView":
          return await this.executeResetView();
        case "clearSelection":
          return await this.executeClearSelection();
        case "hideEverything":
          return await this.executeHideEverything();
        case "colorByType":
          return await this.executeColorByType();
        case "addClippingPlane":
          return await this.executeAddClippingPlane();
        case "fitView":
          return await this.executeFitView();
        case "setView":
          return await this.executeSetView(args);
        case "zoom":
          return await this.executeZoom(args);
        case "runClashDetection":
          return await this.executeRunClashDetection();
        case "clearClashDetection":
          return await this.executeClearClashDetection();
        case "getClashSummary":
          return await this.executeGetClashSummary();
        default:
          return {
            success: false,
            message: `Unknown tool: ${name}`,
            error: "UNKNOWN_TOOL",
          };
      }
    } catch (error) {
      console.error(`[ToolExecutor] Error executing ${name}:`, error);
      return {
        success: false,
        message: `Error executing ${name}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    const validTools = [
      "selectElements",
      "hideElements",
      "showElements",
      "isolateElements",
      "zoomToElements",
      "countElements",
      "resetView",
      "clearSelection",
      "hideEverything",
      "colorByType",
      "addClippingPlane",
      "fitView",
      "setView",
      "zoom",
      "runClashDetection",
      "clearClashDetection",
      "getClashSummary",
    ];
    return validTools.includes(name);
  }

  /**
   * Get all available tool names
   */
  getToolNames(): string[] {
    return [
      "selectElements",
      "hideElements",
      "showElements",
      "isolateElements",
      "zoomToElements",
      "countElements",
      "resetView",
      "clearSelection",
      "hideEverything",
      "colorByType",
      "addClippingPlane",
      "fitView",
      "setView",
      "zoom",
      "runClashDetection",
      "clearClashDetection",
      "getClashSummary",
    ];
  }

  // ─────────────────────────────────────────────────────────────
  // Tool implementations
  // ─────────────────────────────────────────────────────────────

  private async executeSelectElements(
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const types = args.elementTypes as string[];
    let totalCount = 0;
    const countMap = new Map<string, number>();

    for (const type of types) {
      const count = await this.actions.selectByType(type);
      totalCount += count;
      if (count > 0) countMap.set(type, count);
    }

    this.context.setLastSelection(types, totalCount, new Map());

    if (totalCount === 0) {
      return {
        success: true,
        message: `No ${types.join(", ")} found in the model.`,
        data: { count: 0 },
      };
    }

    const typeDetails = Array.from(countMap.entries())
      .map(
        ([type, count]) =>
          `${count} ${type.replace("IFC", "").toLowerCase()}${count !== 1 ? "s" : ""}`
      )
      .join(", ");

    return {
      success: true,
      message: `Selected ${typeDetails}.`,
      data: { count: totalCount, types: Object.fromEntries(countMap) },
    };
  }

  private async executeHideElements(
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const types = args.elementTypes as string[];
    let totalCount = 0;

    for (const type of types) {
      const count = await this.actions.setVisibilityByType(type, false);
      totalCount += count;
    }

    if (totalCount === 0) {
      return {
        success: true,
        message: `No ${types.join(", ")} found to hide.`,
        data: { count: 0 },
      };
    }

    return {
      success: true,
      message: `Hidden ${totalCount} element${totalCount !== 1 ? "s" : ""}.`,
      data: { count: totalCount },
    };
  }

  private async executeShowElements(
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const types = args.elementTypes as string[];
    let totalCount = 0;

    for (const type of types) {
      const count = await this.actions.setVisibilityByType(type, true);
      totalCount += count;
    }

    if (totalCount === 0) {
      return {
        success: true,
        message: `No ${types.join(", ")} found to show.`,
        data: { count: 0 },
      };
    }

    return {
      success: true,
      message: `Shown ${totalCount} element${totalCount !== 1 ? "s" : ""}.`,
      data: { count: totalCount },
    };
  }

  private async executeIsolateElements(
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const types = args.elementTypes as string[];
    let totalCount = 0;

    for (const type of types) {
      const count = await this.actions.isolateByType(type);
      totalCount += count;
    }

    if (totalCount === 0) {
      return {
        success: true,
        message: `No ${types.join(", ")} found to isolate.`,
        data: { count: 0 },
      };
    }

    return {
      success: true,
      message: `Isolated ${totalCount} element${totalCount !== 1 ? "s" : ""}.`,
      data: { count: totalCount },
    };
  }

  private async executeZoomToElements(
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const types = args.elementTypes as string[];
    let totalCount = 0;

    for (const type of types) {
      const count = await this.actions.zoomToType(type);
      totalCount += count;
    }

    if (totalCount === 0) {
      return {
        success: true,
        message: `No ${types.join(", ")} found to zoom to.`,
        data: { count: 0 },
      };
    }

    return {
      success: true,
      message: `Zoomed to ${totalCount} element${totalCount !== 1 ? "s" : ""}.`,
      data: { count: totalCount },
    };
  }

  private async executeCountElements(
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const types = args.elementTypes as string[];
    const counts = new Map<string, number>();

    for (const type of types) {
      const idsByModel = await this.actions.getIdsByType(type);
      let count = 0;
      for (const ids of idsByModel.values()) {
        count += ids.size;
      }
      if (count > 0) counts.set(type, count);
    }

    if (counts.size === 0) {
      return {
        success: true,
        message: `No ${types.join(", ")} found in the model.`,
        data: { count: 0 },
      };
    }

    const details = Array.from(counts.entries())
      .map(
        ([type, count]) =>
          `${count} ${type.replace("IFC", "").toLowerCase()}${count !== 1 ? "s" : ""}`
      )
      .join(", ");

    return {
      success: true,
      message: `Found ${details} in the model.`,
      data: {
        count: Array.from(counts.values()).reduce((a, b) => a + b, 0),
        types: Object.fromEntries(counts),
      },
    };
  }

  private async executeResetView(): Promise<ToolResult> {
    await this.actions.resetView();
    this.context.clear();
    return {
      success: true,
      message: "View reset. Everything is visible and selection is cleared.",
    };
  }

  private async executeClearSelection(): Promise<ToolResult> {
    await this.actions.clearSelection();
    this.context.setLastSelection([], 0, new Map());
    return {
      success: true,
      message: "Selection cleared.",
    };
  }

  private async executeHideEverything(): Promise<ToolResult> {
    await this.actions.hideEverything();
    return {
      success: true,
      message: "All elements hidden.",
    };
  }

  private async executeColorByType(): Promise<ToolResult> {
    await this.actions.colorByType();
    return {
      success: true,
      message: "Color splash view toggled.",
    };
  }

  private async executeAddClippingPlane(): Promise<ToolResult> {
    await this.actions.addClippingPlane();
    return {
      success: true,
      message: "Clipping plane added.",
    };
  }

  private async executeFitView(): Promise<ToolResult> {
    await this.actions.fitAll();
    return {
      success: true,
      message: "View fitted to entire model.",
    };
  }

  private async executeSetView(
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const view = args.view as
      | "top"
      | "front"
      | "back"
      | "left"
      | "right"
      | "iso";
    await this.actions.setStandardView(view);
    return {
      success: true,
      message: `Switched to ${view} view.`,
    };
  }

  private async executeZoom(args: Record<string, unknown>): Promise<ToolResult> {
    const direction = args.direction as "in" | "out";
    const delta = direction === "in" ? 2 : -2;
    await this.actions.zoom(delta);
    return {
      success: true,
      message: `Zoomed ${direction}.`,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Clash Detection tool implementations
  // ─────────────────────────────────────────────────────────────

  private async executeRunClashDetection(): Promise<ToolResult> {
    const result = await this.actions.runClashDetection();
    return {
      success: true,
      message: result,
    };
  }

  private async executeClearClashDetection(): Promise<ToolResult> {
    this.actions.clearClashDetection();
    return {
      success: true,
      message: "Clash detection results cleared.",
    };
  }

  private async executeGetClashSummary(): Promise<ToolResult> {
    const summary = this.actions.getClashSummary();
    return {
      success: true,
      message: summary,
    };
  }
}
