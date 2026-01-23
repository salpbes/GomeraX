/**
 * Manages conversation history and context for the AI assistant
 * Enables context-aware responses and follow-up queries
 */
export class ConversationContext {
  private history: ConversationEntry[] = [];
  private lastSelection: LastSelection | null = null;
  private lastAction: LastAction | null = null;
  private sessionStartTime: number = Date.now();
  private maxHistorySize: number = 20;

  /**
   * Adds a new conversation entry to the history
   */
  public addEntry(query: string, response: string, metadata: EntryMetadata): void {
    this.history.push({
      query,
      response,
      metadata,
      timestamp: Date.now(),
    });

    // Keep history size manageable
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * Records the last selection made by the user
   */
  public setLastSelection(elementTypes: string[], count: number, ids: Map<string, Set<number>>): void {
    this.lastSelection = {
      elementTypes,
      count,
      ids,
      timestamp: Date.now(),
    };
  }

  /**
   * Records the last action performed
   */
  public setLastAction(action: string, elementTypes: string[], count: number): void {
    this.lastAction = {
      action,
      elementTypes,
      count,
      timestamp: Date.now(),
    };
  }

  /**
   * Gets the last selection if it's still fresh (within 2 minutes)
   */
  public getLastSelection(): LastSelection | null {
    if (!this.lastSelection) return null;
    
    const age = Date.now() - this.lastSelection.timestamp;
    const maxAge = 2 * 60 * 1000; // 2 minutes
    
    return age < maxAge ? this.lastSelection : null;
  }

  /**
   * Gets the last action performed
   */
  public getLastAction(): LastAction | null {
    if (!this.lastAction) return null;
    
    const age = Date.now() - this.lastAction.timestamp;
    const maxAge = 2 * 60 * 1000; // 2 minutes
    
    return age < maxAge ? this.lastAction : null;
  }

  /**
   * Gets the recent conversation history (last N entries)
   */
  public getRecentHistory(count: number = 5): ConversationEntry[] {
    return this.history.slice(-count);
  }

  /**
   * Gets the most recent query
   */
  public getLastQuery(): string | null {
    return this.history.length > 0 ? this.history[this.history.length - 1].query : null;
  }

  /**
   * Clears the conversation context
   */
  public clear(): void {
    this.history = [];
    this.lastSelection = null;
    this.lastAction = null;
    this.sessionStartTime = Date.now();
  }

  /**
   * Gets session statistics
   */
  public getStats(): SessionStats {
    return {
      sessionDuration: Date.now() - this.sessionStartTime,
      totalQueries: this.history.length,
      recentQueries: this.getRecentHistory().map(e => e.query),
    };
  }

  /**
   * Resolves contextual references in a query
   * e.g., "them", "those", "it", "these", "where are they"
   */
  public resolveContextualReferences(query: string): ResolvedQuery {
    const lowerQuery = query.toLowerCase().trim();
    let resolved = query;
    let usedContext = false;
    const contextInfo: string[] = [];

    // Pronouns that refer to previous selection/action
    const pronouns = ['them', 'those', 'these', 'it', 'that', 'they'];
    const hasPronoun = pronouns.some(p => lowerQuery.includes(p));
    
    // Location-based follow-ups that need element type context
    const locationQueries = ['where are', 'which floor', 'what floor', 'located', 'distribution'];
    const isLocationQuery = locationQueries.some(q => lowerQuery.includes(q));

    if (hasPronoun || isLocationQuery) {
      const lastAction = this.getLastAction();
      const lastSelection = this.getLastSelection();

      if (lastSelection && lastSelection.elementTypes.length > 0) {
        // Replace pronouns with actual element types
        const types = lastSelection.elementTypes.join(' and ');
        const ifcTypes = lastSelection.elementTypes.map(t => 
          t.startsWith('IFC') ? t : `IFC${t.toUpperCase()}`
        );
        
        // Handle location queries: "where are they?" -> "getElementDistribution for IFCWINDOW"
        if (isLocationQuery && (hasPronoun || lowerQuery.match(/^where\s*(are)?\s*(they|the|located)?$/))) {
          resolved = `element distribution for ${types}`;
          usedContext = true;
          contextInfo.push(`Location of ${types} from previous query`);
        } else {
          // Standard pronoun replacement
          pronouns.forEach(pronoun => {
            const regex = new RegExp(`\\b${pronoun}\\b`, 'gi');
            if (regex.test(resolved)) {
              resolved = resolved.replace(regex, types);
              usedContext = true;
              contextInfo.push(`Referring to ${types} from previous selection`);
            }
          });
        }
      } else if (lastAction && lastAction.elementTypes.length > 0) {
        // Fallback to last action
        const types = lastAction.elementTypes.join(' and ');
        
        // Handle location queries
        if (isLocationQuery && (hasPronoun || lowerQuery.match(/^where\s*(are)?\s*(they|the|located)?$/))) {
          resolved = `element distribution for ${types}`;
          usedContext = true;
          contextInfo.push(`Location of ${types} from previous action`);
        } else {
          pronouns.forEach(pronoun => {
            const regex = new RegExp(`\\b${pronoun}\\b`, 'gi');
            if (regex.test(resolved)) {
              resolved = resolved.replace(regex, types);
              usedContext = true;
              contextInfo.push(`Referring to ${types} from previous action`);
            }
          });
        }
      }
    }

    // Handle "more" or "again" - repeat last action
    if ((lowerQuery.includes('more') || lowerQuery.includes('again')) && this.lastAction) {
      if (lowerQuery === 'more' || lowerQuery === 'again' || lowerQuery === 'do it again') {
        resolved = `${this.lastAction.action} ${this.lastAction.elementTypes.join(' and ')}`;
        usedContext = true;
        contextInfo.push(`Repeating last action: ${this.lastAction.action}`);
      }
    }

    // Handle "also" - add to previous selection
    if (lowerQuery.includes('also') && this.lastSelection) {
      // e.g., "also select doors" -> "select walls and doors"
      const actionMatch = lowerQuery.match(/also\s+(select|show|hide|isolate)\s+(.+)/);
      if (actionMatch) {
        const [, action, newType] = actionMatch;
        const existingTypes = this.lastSelection.elementTypes.join(' and ');
        resolved = `${action} ${existingTypes} and ${newType}`;
        usedContext = true;
        contextInfo.push(`Adding to previous selection`);
      }
    }

    // Handle "unhide" with context
    if ((lowerQuery.includes('unhide') || lowerQuery.includes('show')) && 
        (lowerQuery.includes('them') || lowerQuery.includes('those') || lowerQuery.includes('it')) && 
        this.lastAction && this.lastAction.action === 'hide') {
      const types = this.lastAction.elementTypes.join(' and ');
      resolved = `show ${types}`;
      usedContext = true;
      contextInfo.push(`Unhiding previously hidden ${types}`);
    }

    // Handle "unisolate" or "show all" after isolate
    if ((lowerQuery.includes('unisolate') || lowerQuery.includes('show all') || lowerQuery.includes('show everything')) && 
        this.lastAction && this.lastAction.action === 'isolate') {
      resolved = 'reset view';
      usedContext = true;
      contextInfo.push(`Reverting isolation`);
    }

    return {
      original: query,
      resolved,
      usedContext,
      contextInfo,
    };
  }

  /**
   * Suggests possible actions based on context
   */
  public getSuggestions(): string[] {
    const suggestions: string[] = [];
    const lastSelection = this.getLastSelection();
    const lastAction = this.getLastAction();

    if (lastSelection && lastSelection.count > 0) {
      const types = lastSelection.elementTypes.join(' and ');
      suggestions.push(`Hide them (${types})`);
      suggestions.push(`Zoom to them`);
      suggestions.push(`Isolate them`);
      suggestions.push(`Count them`);
    }

    if (lastAction) {
      if (lastAction.action === 'hide') {
        const types = lastAction.elementTypes.join(' and ');
        suggestions.push(`Unhide them (${types})`);
      }
      
      if (lastAction.action === 'isolate') {
        suggestions.push('Unisolate (show all)');
      }
    }

    if (this.history.length > 0) {
      suggestions.push('Reset view');
      suggestions.push('Clear selection');
    }

    return suggestions;
  }
}

// Type definitions
export interface ConversationEntry {
  query: string;
  response: string;
  metadata: EntryMetadata;
  timestamp: number;
}

export interface EntryMetadata {
  action?: string;
  elementTypes?: string[];
  count?: number;
  isAI: boolean;
  executionTime?: number;
}

export interface LastSelection {
  elementTypes: string[];
  count: number;
  ids: Map<string, Set<number>>;
  timestamp: number;
}

export interface LastAction {
  action: string;
  elementTypes: string[];
  count: number;
  timestamp: number;
}

export interface SessionStats {
  sessionDuration: number;
  totalQueries: number;
  recentQueries: string[];
}

export interface ResolvedQuery {
  original: string;
  resolved: string;
  usedContext: boolean;
  contextInfo: string[];
}
