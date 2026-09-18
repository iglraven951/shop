/**
 * DiscoveryShop Chatbot Widget - Real-time AI Assistant
 *
 * Provides Socket.IO client for real-time communication with the chatbot backend.
 * Features:
 * - Real-time messaging with typing indicators
 * - JWT token authentication
 * - Session and conversation management
 * - Message persistence
 * - Error handling and reconnection
 */

class ChatbotWidget {
  constructor(options = {}) {
    // Configuration
    this.socketUrl = options.socketUrl || "http://localhost:5000";
    this.namespace = "/chatbot";
    // SECURITY: Tokens are now in httpOnly cookies, sent automatically with credentials
    this.token = options.token || null;
    this.containerId = options.containerId || "chatbot-widget";

    // State
    this.socket = null;
    this.sessionId = null;
    this.conversationId = null;
    this.isConnected = false;
    this.isTyping = false;
    this.messages = [];

    // DOM Elements
    this.container = null;
    this.messagesContainer = null;
    this.inputElement = null;
    this.sendButton = null;
    this.statusIndicator = null;

    // Event callbacks
    this.onMessage = options.onMessage || null;
    this.onConnect = options.onConnect || null;
    this.onDisconnect = options.onDisconnect || null;
    this.onError = options.onError || null;

    // Initialize
    this.init();
  }

  /**
   * Initialize the chatbot widget
   */
  init() {
    console.log("[Chatbot] Initializing widget...");

    // Create or get container
    this.setupDOM();

    // Connect to WebSocket
    this.connect();
  }

  /**
   * Setup DOM elements for the widget
   */
  setupDOM() {
    // Get or create container
    this.container = document.getElementById(this.containerId);
    if (!this.container) {
      console.warn(
        `[Chatbot] Container with ID "${this.containerId}" not found. Creating new one.`
      );
      this.container = document.createElement("div");
      this.container.id = this.containerId;
      this.container.style.position = "fixed";
      this.container.style.bottom = "20px";
      this.container.style.right = "20px";
      this.container.style.width = "400px";
      this.container.style.height = "600px";
      this.container.style.zIndex = "9999";
      document.body.appendChild(this.container);
    }

    // Create widget HTML
    this.container.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        height: 100%;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #f1f5f9;
      ">
        <!-- Header -->
        <div style="
          padding: 1rem;
          background: rgba(99, 102, 241, 0.1);
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
        ">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 1.5rem;">🤖</span>
            <div>
              <div style="font-weight: 700; font-size: 0.95rem;">DiscoveryShop AI</div>
              <div style="font-size: 0.75rem; color: #cbd5e1;">
                <span id="chatbot-status" style="display: inline-block; width: 8px; height: 8px; background: #ef4444; border-radius: 50%; margin-right: 0.25rem;"></span>
                Conectando...
              </div>
            </div>
          </div>
          <button id="chatbot-close" style="
            background: none;
            border: none;
            color: #f1f5f9;
            font-size: 1.2rem;
            cursor: pointer;
            padding: 0;
          ">×</button>
        </div>

        <!-- Messages -->
        <div id="chatbot-messages" style="
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          background: rgba(15, 23, 42, 0.5);
        ">
          <div style="
            padding: 0.75rem 0.95rem;
            background: rgba(99, 102, 241, 0.18);
            border: 1px solid rgba(99, 102, 241, 0.15);
            border-radius: 10px;
            font-size: 0.88rem;
            line-height: 1.4;
            align-self: flex-start;
            max-width: 85%;
            color: #f1f5f9;
          ">
            ¡Hola! 👋 Soy tu asistente de DiscoveryShop. ¿Cómo puedo ayudarte hoy?
          </div>
        </div>

        <!-- Input -->
        <div style="
          padding: 1rem;
          border-top: 1px solid rgba(148, 163, 184, 0.1);
          display: flex;
          gap: 0.5rem;
        ">
          <input
            id="chatbot-input"
            type="text"
            placeholder="Escribe tu pregunta..."
            style="
              flex: 1;
              padding: 0.65rem 0.95rem;
              background: rgba(15, 23, 42, 0.7);
              border: 1px solid rgba(148, 163, 184, 0.12);
              color: #f1f5f9;
              border-radius: 10px;
              outline: none;
              font-size: 0.9rem;
              font-family: inherit;
            "
          />
          <button
            id="chatbot-send"
            style="
              padding: 0.65rem 1.1rem;
              background: #6366f1;
              color: white;
              border: none;
              border-radius: 10px;
              cursor: pointer;
              font-weight: 700;
              transition: all 0.25s ease;
              font-family: inherit;
            "
          >
            Enviar
          </button>
        </div>
      </div>
    `;

    // Get references to elements
    this.messagesContainer = document.getElementById("chatbot-messages");
    this.inputElement = document.getElementById("chatbot-input");
    this.sendButton = document.getElementById("chatbot-send");
    this.statusIndicator = document.getElementById("chatbot-status");
    const closeButton = document.getElementById("chatbot-close");

    // Event listeners
    this.sendButton.addEventListener("click", () => this.sendMessage());
    this.inputElement.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.sendMessage();
    });

    this.inputElement.addEventListener("input", () => {
      // Typing indicator could be implemented here
    });

    closeButton.addEventListener("click", () => this.close());

    console.log("[Chatbot] DOM setup complete");
  }

  /**
   * Connect to WebSocket server
   */
  connect() {
    console.log(`[Chatbot] Connecting to ${this.socketUrl}${this.namespace}...`);

    // Check if Socket.IO is available
    if (typeof io === "undefined") {
      console.error("[Chatbot] Socket.IO library not loaded");
      this.showError(
        "Error de conexión",
        "Socket.IO no está disponible. Por favor, carga la librería."
      );
      return;
    }

    // Create Socket.IO connection
    const query = this.token ? { token: this.token } : {};

    this.socket = io(this.socketUrl, {
      namespace: this.namespace,
      query: query,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    // Connection events
    this.socket.on("connect", () => this.onSocketConnect());
    this.socket.on("disconnect", () => this.onSocketDisconnect());
    this.socket.on("error", (error) => this.onSocketError(error));

    // Chatbot events
    this.socket.on("connection_established", (data) =>
      this.onConnectionEstablished(data)
    );
    this.socket.on("bot_response", (data) => this.onBotResponse(data));
    this.socket.on("bot_typing", (data) => this.onBotTyping(data));
    this.socket.on("conversation_started", (data) =>
      this.onConversationStarted(data)
    );
    this.socket.on("conversation_closed", (data) =>
      this.onConversationClosed(data)
    );
    this.socket.on("user_typing", (data) => this.onUserTyping(data));
    this.socket.on("error", (error) => this.onServerError(error));
    this.socket.on("connection_error", (error) =>
      this.onConnectionError(error)
    );

    console.log("[Chatbot] Socket.IO connection initiated");
  }

  /**
   * Socket connected
   */
  onSocketConnect() {
    console.log("[Chatbot] Socket connected");
    this.isConnected = true;
    this.updateStatus("connected");
  }

  /**
   * Socket disconnected
   */
  onSocketDisconnect() {
    console.log("[Chatbot] Socket disconnected");
    this.isConnected = false;
    this.updateStatus("disconnected");

    if (this.onDisconnect) {
      this.onDisconnect();
    }
  }

  /**
   * Socket error
   */
  onSocketError(error) {
    console.error("[Chatbot] Socket error:", error);
    this.updateStatus("error");

    if (this.onError) {
      this.onError(error);
    }
  }

  /**
   * Connection established - session created
   */
  onConnectionEstablished(data) {
    console.log("[Chatbot] Connection established:", data);

    this.sessionId = data.session_id;
    this.updateStatus("connected");

    // Add welcome message
    this.addMessage(data.message, "bot");

    if (this.onConnect) {
      this.onConnect(data);
    }
  }

  /**
   * Bot response received
   */
  onBotResponse(data) {
    console.log("[Chatbot] Bot response:", data);

    this.conversationId = data.conversation_id;
    this.messages.push(data);

    // Add bot message to UI
    this.addMessage(data.text, "bot", {
      confidence: data.confidence,
      suggestions: data.suggestions,
    });

    // Stop typing indicator
    this.setTypingIndicator(false);

    if (this.onMessage) {
      this.onMessage({
        type: "bot",
        text: data.text,
        data: data,
      });
    }
  }

  /**
   * Bot is typing
   */
  onBotTyping(data) {
    if (data.is_typing) {
      this.setTypingIndicator(true);
    } else {
      this.setTypingIndicator(false);
    }
  }

  /**
   * Conversation started
   */
  onConversationStarted(data) {
    console.log("[Chatbot] Conversation started:", data);
    this.conversationId = data.conversation_id;

    this.addMessage(`Conversación iniciada: ${data.title}`, "system");
  }

  /**
   * Conversation closed
   */
  onConversationClosed(data) {
    console.log("[Chatbot] Conversation closed:", data);

    this.addMessage(data.message, "system");
    this.conversationId = null;
  }

  /**
   * User typing
   */
  onUserTyping(data) {
    console.log("[Chatbot] User typing:", data);
    // Could display other users typing here in multiplayer scenarios
  }

  /**
   * Server error
   */
  onServerError(error) {
    console.error("[Chatbot] Server error:", error);
    this.showError("Error", error.message || "Unknown error");

    if (this.onError) {
      this.onError(error);
    }
  }

  /**
   * Connection error
   */
  onConnectionError(error) {
    console.error("[Chatbot] Connection error:", error);
    this.showError(
      "Error de conexión",
      error.error || "No se pudo conectar con el servidor"
    );
  }

  /**
   * Send message to bot
   */
  sendMessage() {
    const text = this.inputElement.value.trim();

    if (!text) {
      return;
    }

    if (!this.isConnected) {
      this.showError("Error", "No estás conectado con el chatbot");
      return;
    }

    // Add user message to UI
    this.addMessage(text, "user");

    // Send to server
    this.socket.emit("message", {
      text: text,
      conversation_id: this.conversationId,
    });

    // Clear input
    this.inputElement.value = "";

    // Show typing indicator
    this.setTypingIndicator(true);

    if (this.onMessage) {
      this.onMessage({
        type: "user",
        text: text,
      });
    }
  }

  /**
   * Add message to UI
   */
  addMessage(text, sender = "bot", metadata = {}) {
    const messageDiv = document.createElement("div");

    const isUser = sender === "user";
    const isBot = sender === "bot";
    const isSystem = sender === "system";

    // Determine styles
    let backgroundColor = "rgba(99, 102, 241, 0.18)";
    let borderColor = "rgba(99, 102, 241, 0.15)";
    let textColor = "#f1f5f9";
    let alignment = "flex-start";

    if (isUser) {
      backgroundColor = "linear-gradient(135deg, #6366f1, #4f46e5)";
      borderColor = "transparent";
      textColor = "white";
      alignment = "flex-end";
    } else if (isSystem) {
      backgroundColor = "rgba(148, 163, 184, 0.1)";
      borderColor = "rgba(148, 163, 184, 0.15)";
      textColor = "#cbd5e1";
      alignment = "center";
    }

    messageDiv.style.cssText = `
      padding: 0.75rem 0.95rem;
      background: ${backgroundColor};
      border: 1px solid ${borderColor};
      border-radius: 10px;
      font-size: 0.88rem;
      line-height: 1.4;
      align-self: ${alignment};
      max-width: 85%;
      color: ${textColor};
      word-wrap: break-word;
      box-shadow: ${isUser ? "0 2px 8px rgba(99, 102, 241, 0.2)" : "none"};
    `;

    messageDiv.innerHTML = text;

    // Add suggestions if available
    if (isBot && metadata.suggestions && metadata.suggestions.length > 0) {
      const suggestionsDiv = document.createElement("div");
      suggestionsDiv.style.cssText = `
        margin-top: 0.5rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      `;

      metadata.suggestions.forEach((suggestion) => {
        const suggestionBtn = document.createElement("button");
        suggestionBtn.style.cssText = `
          padding: 0.4rem 0.6rem;
          background: rgba(99, 102, 241, 0.3);
          border: 1px solid rgba(99, 102, 241, 0.5);
          color: #f1f5f9;
          border-radius: 6px;
          font-size: 0.8rem;
          cursor: pointer;
          text-align: left;
          transition: all 0.2s ease;
          font-family: inherit;
        `;
        suggestionBtn.textContent = suggestion;
        suggestionBtn.onmouseover = () => {
          suggestionBtn.style.background = "rgba(99, 102, 241, 0.5)";
        };
        suggestionBtn.onmouseout = () => {
          suggestionBtn.style.background = "rgba(99, 102, 241, 0.3)";
        };
        suggestionBtn.onclick = () => {
          this.inputElement.value = suggestion;
          this.sendMessage();
        };

        suggestionsDiv.appendChild(suggestionBtn);
      });

      messageDiv.appendChild(suggestionsDiv);
    }

    // Add confidence indicator for bot messages
    if (isBot && metadata.confidence) {
      const confidenceDiv = document.createElement("div");
      confidenceDiv.style.cssText = `
        margin-top: 0.25rem;
        font-size: 0.7rem;
        opacity: 0.7;
      `;
      confidenceDiv.textContent = `Confianza: ${metadata.confidence}%`;
      messageDiv.appendChild(confidenceDiv);
    }

    this.messages.push({
      text: text,
      sender: sender,
      timestamp: new Date(),
    });

    this.messagesContainer.appendChild(messageDiv);

    // Auto-scroll to bottom
    setTimeout(() => {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }, 0);
  }

  /**
   * Show typing indicator
   */
  setTypingIndicator(show) {
    if (show === this.isTyping) {
      return;
    }

    this.isTyping = show;

    const existingIndicator = document.getElementById("chatbot-typing-indicator");
    if (existingIndicator) {
      existingIndicator.remove();
    }

    if (show) {
      const typingDiv = document.createElement("div");
      typingDiv.id = "chatbot-typing-indicator";
      typingDiv.style.cssText = `
        padding: 0.75rem 0.95rem;
        background: rgba(99, 102, 241, 0.18);
        border: 1px solid rgba(99, 102, 241, 0.15);
        border-radius: 10px;
        align-self: flex-start;
        display: flex;
        gap: 0.25rem;
      `;

      // Typing animation
      for (let i = 0; i < 3; i++) {
        const dot = document.createElement("div");
        dot.style.cssText = `
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(99, 102, 241, 0.5);
          animation: bounce 1.4s infinite;
          animation-delay: ${i * 0.2}s;
        `;
        typingDiv.appendChild(dot);
      }

      // Add animation style if not exists
      if (!document.getElementById("chatbot-typing-style")) {
        const style = document.createElement("style");
        style.id = "chatbot-typing-style";
        style.textContent = `
          @keyframes bounce {
            0%, 80%, 100% {
              opacity: 0.3;
              transform: translateY(0);
            }
            40% {
              opacity: 1;
              transform: translateY(-8px);
            }
          }
        `;
        document.head.appendChild(style);
      }

      this.messagesContainer.appendChild(typingDiv);
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  /**
   * Update connection status indicator
   */
  updateStatus(status) {
    if (!this.statusIndicator) return;

    let color = "#ef4444"; // red
    let text = "Desconectado";

    switch (status) {
      case "connected":
        color = "#10b981"; // green
        text = "Conectado";
        break;
      case "disconnected":
        color = "#ef4444"; // red
        text = "Desconectado";
        break;
      case "error":
        color = "#f59e0b"; // amber
        text = "Error";
        break;
      default:
        color = "#6b7280"; // gray
        text = "Conectando...";
    }

    this.statusIndicator.style.background = color;
    this.statusIndicator.parentElement.textContent =
      text + this.statusIndicator.outerHTML;
  }

  /**
   * Show error message
   */
  showError(title, message) {
    console.error(`[Chatbot] ${title}: ${message}`);
    this.addMessage(`❌ ${title}: ${message}`, "system");
  }

  /**
   * Close widget
   */
  close() {
    if (this.socket) {
      this.socket.disconnect();
    }

    if (this.container) {
      this.container.style.display = "none";
    }
  }

  /**
   * Show widget
   */
  show() {
    if (this.container) {
      this.container.style.display = "flex";
    }
  }

  /**
   * SECURITY: Auth tokens are now handled via httpOnly cookies
   * This method is deprecated and no longer needed
   * @deprecated Use httpOnly cookies instead
   */
  getTokenFromLocalStorage() {
    console.warn('⚠️  getTokenFromLocalStorage() is deprecated. Tokens use httpOnly cookies.');
    return null;
  }

  /**
   * Set token
   */
  setToken(token) {
    this.token = token;
    if (this.socket) {
      this.socket.disconnect();
      this.connect();
    }
  }

  /**
   * Get conversation history
   */
  getMessages() {
    return this.messages.slice();
  }

  /**
   * Clear conversation
   */
  clearMessages() {
    this.messages = [];
    this.messagesContainer.innerHTML = `
      <div style="
        padding: 0.75rem 0.95rem;
        background: rgba(99, 102, 241, 0.18);
        border: 1px solid rgba(99, 102, 241, 0.15);
        border-radius: 10px;
        font-size: 0.88rem;
        line-height: 1.4;
        align-self: flex-start;
        max-width: 85%;
        color: #f1f5f9;
      ">
        ¡Hola! 👋 ¿Cómo puedo ayudarte?
      </div>
    `;
  }
}

// Export for use
if (typeof window !== "undefined") {
  window.ChatbotWidget = ChatbotWidget;
}
