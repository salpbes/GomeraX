import type { ConversationContext } from './ConversationContext';

/**
 * Handles conversational AI responses beyond BIM commands
 * Provides natural language understanding and friendly responses
 */
export class ConversationalEngine {
  private modelStats: any = null;

  constructor(private context: ConversationContext) {}

  /**
   * Sets model statistics for context-aware responses
   */
  public setModelStats(stats: any): void {
    this.modelStats = stats;
  }

  /**
   * Checks if a query is conversational (not a BIM command)
   */
  public isConversational(query: string): boolean {
    const lower = query.toLowerCase().trim();
    
    // Greetings
    const greetings = ['hi', 'hello', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening'];
    if (greetings.some(g => lower === g || lower.startsWith(g + ' '))) return true;
    
    // Educational/explanatory questions
    const educationalKeywords = [
      'explain', 'what is', 'what are', 'tell me about', 'describe', 'definition of',
      'where', 'when', 'why', 'how do', 'how does', 'how can', 'how to',
      'use of', 'purpose of', 'benefit', 'advantage', 'importance'
    ];
    if (educationalKeywords.some(k => lower.includes(k))) {
      // But exclude BIM commands like "what are the walls"
      const bimActionWords = ['select', 'hide', 'show', 'zoom', 'isolate', 'count', 'the walls', 'the doors', 'the windows', 'the slabs', 'the columns'];
      if (!bimActionWords.some(w => lower.includes(w))) return true;
    }
    
    // Questions about the AI
    const aiQuestions = ['who are you', 'what are you', 'what can you do', 'how do you work', 'what is this'];
    if (aiQuestions.some(q => lower.includes(q))) return true;
    
    // Gratitude
    if (lower.match(/^(thanks|thank you|thx|ty)$/)) return true;
    
    // Status queries
    if (lower.includes('how are you') || lower.includes('are you there')) return true;
    
    // Model information queries
    if (lower.includes('model') && (lower.includes('what') || lower.includes('how many') || lower.includes('tell me'))) {
      return !lower.includes('hide') && !lower.includes('select') && !lower.includes('show');
    }
    
    // Capability queries
    if ((lower.includes('what') || lower.includes('how')) && 
        (lower.includes('can i') || lower.includes('should i') || lower.includes('do i'))) return true;
    
    return false;
  }

  /**
   * Generates a conversational response
   */
  public async getResponse(query: string): Promise<string> {
    const lower = query.toLowerCase().trim();

    // Greetings
    if (this.isGreeting(lower)) {
      return this.getGreetingResponse();
    }

    // Gratitude
    if (lower.match(/^(thanks|thank you|thx|ty|appreciate it)$/i)) {
      const responses = [
        "You're welcome! Happy to help with your BIM model.",
        "My pleasure! Let me know if you need anything else.",
        "Anytime! I'm here to make working with BIM models easier.",
        "Glad I could help! Feel free to ask me anything about the model."
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }

    // Status check
    if (lower.includes('how are you') || lower.includes('are you there')) {
      return "I'm doing great and ready to help! 🤖 I'm an AI assistant specialized in BIM models. Ask me to select, hide, zoom to elements, or just chat!";
    }

    // Identity questions
    if (lower.includes('who are you') || lower.includes('what are you')) {
      return "I'm your AI BIM Assistant! I'm powered by a local machine learning model (DistilBERT) that understands natural language. I can help you navigate and analyze IFC models through conversation. No data leaves your browser - I run entirely locally!";
    }

    // Capability questions
    if (lower.includes('what can you do') || (lower.includes('what') && lower.includes('can i'))) {
      const stats = this.context.getStats();
      const contextInfo = stats.totalQueries > 0 
        ? `\n\nYou've already asked me ${stats.totalQueries} question${stats.totalQueries > 1 ? 's' : ''} in this session!` 
        : '';
      
      return `I can help you work with BIM models in many ways:\n\n` +
        `🔍 **Selection & Visibility**\n` +
        `- Select, hide, show, or isolate elements by type\n` +
        `- Work with multiple types at once (e.g., "select walls and windows")\n\n` +
        `📐 **Navigation**\n` +
        `- Zoom to specific elements\n` +
        `- Switch between views (top, front, isometric)\n` +
        `- Add section cuts to explore the model\n\n` +
        `📊 **Analysis**\n` +
        `- Count elements of any type\n` +
        `- Get model statistics\n\n` +
        `💬 **Conversation**\n` +
        `- I remember context! Say "hide them" after selecting\n` +
        `- Ask me questions about the model\n` +
        `- Just chat - I'm friendly!${contextInfo}`;
    }

    // Model information
    if (lower.includes('how') && lower.includes('work')) {
      return "I use a hybrid approach:\n\n" +
        "1️⃣ **Fast Rules** - For common commands, I use pattern matching (instant!)\n" +
        "2️⃣ **AI Model** - For complex queries, I use DistilBERT to understand your intent\n" +
        "3️⃣ **Context Memory** - I remember our conversation to understand follow-ups\n\n" +
        "Everything runs locally in your browser - no server needed, no data shared!";
    }

    // Model statistics query
    if (this.modelStats && (lower.includes('about the model') || lower.includes('model info'))) {
      return this.getModelStatistics();
    }

    // Session statistics
    if (lower.includes('session') || lower.includes('history') || lower.includes('we talked')) {
      const stats = this.context.getStats();
      const duration = Math.floor(stats.sessionDuration / 60000); // minutes
      
      return `📊 **Session Stats**\n\n` +
        `⏱️ Duration: ${duration} minute${duration !== 1 ? 's' : ''}\n` +
        `💬 Total queries: ${stats.totalQueries}\n\n` +
        (stats.recentQueries.length > 0 
          ? `Recent commands:\n${stats.recentQueries.slice(-5).map(q => `• ${q}`).join('\n')}`
          : 'No recent commands yet.');
    }

    // BIM/IFC educational questions
    if (lower.includes('what is bim') || lower.includes('explain bim')) {
      return "**BIM (Building Information Modeling)** is a digital representation of physical and functional characteristics of a building.\n\n" +
        "🏗️ It's more than just 3D models - it includes:\n" +
        "• Geometry (shapes and spaces)\n" +
        "• Properties (materials, fire ratings, costs)\n" +
        "• Relationships (how elements connect)\n" +
        "• Lifecycle data (construction, maintenance)\n\n" +
        "I'm helping you explore an IFC file, which is the open standard for BIM data exchange!";
    }

    if (lower.includes('where') && lower.includes('use') && lower.includes('bim')) {
      return "**BIM is used throughout construction projects:**\n\n" +
        "📐 **Design Phase:**\n" +
        "• Architectural design & coordination\n" +
        "• Structural & MEP engineering\n" +
        "• Clash detection (avoiding conflicts)\n\n" +
        "🏗️ **Construction Phase:**\n" +
        "• Quantity takeoffs & cost estimation\n" +
        "• Construction sequencing (4D)\n" +
        "• Site coordination & logistics\n\n" +
        "🔧 **Operations Phase:**\n" +
        "• Facility management\n" +
        "• Maintenance planning\n" +
        "• Energy analysis\n\n" +
        "BIM improves collaboration, reduces errors, and saves time & money across the entire building lifecycle!";
    }

    if (lower.includes('what is ifc') || lower.includes('explain ifc')) {
      return "**IFC (Industry Foundation Classes)** is an open, neutral file format for BIM data.\n\n" +
        "📄 Think of it as a universal language that lets different software (Revit, ArchiCAD, etc.) share building information.\n\n" +
        "It contains:\n" +
        "• All building elements (walls, doors, etc.)\n" +
        "• Properties and metadata\n" +
        "• Spatial structure (buildings, floors, spaces)\n" +
        "• Relationships between elements\n\n" +
        "The model you're viewing is an IFC file!";
    }

    if ((lower.includes('what are') || lower.includes('what is')) && lower.includes('slab')) {
      return "**Slabs** are horizontal structural elements in a building - typically floors and ceilings.\n\n" +
        "In IFC models, they're represented as `IFCSLAB` entities. Want to see them? Try: 'Select all slabs' or 'How many slabs are there?'";
    }

    if ((lower.includes('what are') || lower.includes('what is')) && lower.includes('column')) {
      return "**Columns** are vertical structural elements that transfer loads from above to the foundation.\n\n" +
        "They're crucial for a building's stability. Try: 'Select all columns' or 'Zoom to columns' to see them!";
    }

    // Help with specific element types
    if (lower.includes('what types') || lower.includes('what elements')) {
      return "I understand these BIM element types:\n\n" +
        "🏗️ **Structural**: Walls, Columns, Beams, Slabs\n" +
        "🚪 **Openings**: Doors, Windows\n" +
        "🪜 **Circulation**: Stairs\n" +
        "🪑 **Furnishing**: Furniture\n" +
        "🔧 **MEP**: Pipes, Ducts\n" +
        "⚙️ **Other**: Members\n\n" +
        "Try commands like:\n" +
        "• 'Select all structural elements'\n" +
        "• 'Hide doors and windows'\n" +
        "• 'How many pipes are there?'";
    }

    // Confusion or unclear query
    if (lower.includes('confused') || lower.includes('don\'t understand') || lower.includes('not sure')) {
      return "No worries! Let me help clarify. Here are some examples:\n\n" +
        "🎯 **Simple**: 'Select walls'\n" +
        "🎯 **Multiple types**: 'Hide doors and windows'\n" +
        "🎯 **With context**: 'Select columns' → then 'zoom to them'\n" +
        "🎯 **Questions**: 'How many slabs are there?'\n\n" +
        "What would you like to do with the model?";
    }

    // Fallback - try to be helpful
    return this.getHelpfulFallback(query);
  }

  private isGreeting(query: string): boolean {
    const greetings = ['hi', 'hello', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening', 'sup', 'yo'];
    return greetings.some(g => query === g || query.startsWith(g + ' ') || query.startsWith(g + ','));
  }

  private getGreetingResponse(): string {
    const hour = new Date().getHours();
    let timeGreeting = 'Hello';
    
    if (hour < 12) timeGreeting = 'Good morning';
    else if (hour < 18) timeGreeting = 'Good afternoon';
    else timeGreeting = 'Good evening';

    const responses = [
      `${timeGreeting}! I'm your AI BIM Assistant. How can I help you explore the model today?`,
      `${timeGreeting}! 👋 Ready to help you navigate the BIM model. What would you like to do?`,
      `Hey there! I'm here to help with the IFC model. Want to select some elements or explore the structure?`,
      `${timeGreeting}! I can help you analyze, navigate, and understand your BIM model. Just ask!`
    ];

    return responses[Math.floor(Math.random() * responses.length)];
  }

  private getModelStatistics(): string {
    if (!this.modelStats) {
      return "Model statistics aren't available yet. Once you load a model, I can tell you all about it!";
    }

    // This would be populated with actual model data
    return `📊 **Current Model Overview**\n\n` +
      `This information will show model statistics once implemented:\n` +
      `- Total elements\n` +
      `- Breakdown by type\n` +
      `- Model properties\n` +
      `- File information`;
  }

  private getHelpfulFallback(query: string): string {
    const stats = this.context.getStats();
    
    // If they've been using it, give them advanced tips
    if (stats.totalQueries > 5) {
      return "I'm not quite sure what you mean by that. Try:\n\n" +
        "💡 **Pro Tips**:\n" +
        "- Combine actions: 'Select and zoom to all columns'\n" +
        "- Use pronouns: After selecting, say 'hide them'\n" +
        "- Ask questions: 'How many windows on level 2?'\n\n" +
        "What specific task are you trying to accomplish?";
    }

    // For new users, give basics
    return "I'm here to help with your BIM model! Try asking me to:\n\n" +
      "✨ 'Select all walls'\n" +
      "✨ 'Hide doors and windows'\n" +
      "✨ 'How many columns are there?'\n" +
      "✨ 'Zoom to stairs'\n" +
      "✨ 'Help' - for more options\n\n" +
      "What would you like to explore?";
  }
}
