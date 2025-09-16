/**
 * StreamingChatWidgetV2 - A customizable chat widget that connects via Server-Sent Events
 * @version 1.0.7
 */
(function(window) {
  'use strict';

  // Load dependencies
  if (!window.DOMPurify) {
    console.error('StreamingChatWidgetV2 requires DOMPurify. Please include it in your page.');
    return;
  }
  
  if (!window.marked) {
    console.error('StreamingChatWidgetV2 requires marked.js. Please include it in your page.');
    return;
  }

  // Default configuration
  const DEFAULT_CONFIG = {
    chatId: '', // Required - identifies which assistant to use
    sessionEndpointUrl: '', // Required - URL for backend to initialize session
    backendStreamUrl: '', // Required - URL for backend to stream messages
    theme: {
      primaryColor: '#2563eb',     // Main theme color (button, header, etc)
      secondaryColor: '#1e40af',   // Secondary color (user avatar)
      userMessageBg: '#dbeafe',    // User message background
      userMessageText: '#1e40af',  // User message text
      botMessageBg: '#f3f4f6',     // Bot message background
      botMessageText: '#1f2937',   // Bot message text
      systemMessageBg: '#f3f4f6',  // System message background
      systemMessageText: '#4b5563' // System message text
    },
    size: {
      width: '380px',      // Widget width
      height: '550px',     // Widget height
      buttonSize: '60px'   // Chat button size
    },
    position: {
      bottom: '20px',      // Distance from bottom
      right: '20px'        // Distance from right
    },
    text: {
      headerTitle: 'Chat Support',
      welcomeMessage: 'Welcome! How can I help you today?',
      inputPlaceholder: 'Type your message...',
      connectionError: 'Connection error. Please try again later.',
      sendError: 'Failed to send message. Please try again.'
    },
    icons: {
      // Default chat button icon
      chatButton: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
      // Default user avatar icon
      userAvatar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="7" r="4"></circle><path d="M12 11c-2.21 0-4 1.79-4 4v5h8v-5c0-2.21-1.79-4-4-4z"></path></svg>',
      // Default bot avatar icon
      botAvatar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="5"></circle><path d="M20 21v-2a7 7 0 0 0-14 0v2"></path></svg>',
      // Default send button icon
      sendButton: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>'
    },
    predefinedQuestions: {
      enabled: false,
      position: 'top', // 'top', 'bottom', or 'welcome'
      style: 'button', // 'button' or 'pill'
      questions: [
        // Examples:
        // { text: "What are your business hours?", value: "What are your business hours?" },
        // { text: "How do I reset my password?", value: "I need help resetting my password" }
      ],
      buttonColor: '#3b82f6',  // Background color
      textColor: '#ffffff',    // Text color
      hoverColor: '#2563eb',   // Color on hover
      hideAfterSelection: false // Whether to hide buttons after a selection
    },
    sanitization: {
      input: 'basic', // 'none', 'basic', or 'strict'
      output: true    // Whether to sanitize received messages
    }
  };

  /**
   * StreamingChatWidgetV2 class - Creates and manages the chat widget
   */
  class StreamingChatWidgetV2 {
    /**
     * Create a new chat widget
     * @param {Object} config - Configuration options
     */
    constructor(config) {
      // Validate required fields
      if (!config || !config.chatId) {
        console.error('StreamingChatWidgetV2: chatId is required.');
        return;
      }
      if (!config.sessionEndpointUrl) {
        console.error('StreamingChatWidgetV2: sessionEndpointUrl is required.');
        return;
      }
      if (!config.backendStreamUrl) {
        console.error('StreamingChatWidgetV2: backendStreamUrl is required.');
        return;
      }

      // Merge configurations - deep merge custom config with defaults
      this.config = this._mergeConfig(DEFAULT_CONFIG, config);

      // Initialize state
      this.sessionToken = null;
      this.assistantId = null;
      this.isSessionInitialized = false;

      this.streamState = {
        currentBotMessage: null,
        activeMessageContent: '',
        isStreaming: false, // Indicates if currently processing an SSE stream
        typingIndicator: null,
        sendingSpinner: null,
        toolStatusShown: false, // Track if tool status message is currently displayed
        toolStatusMessages: [] // Array to keep track of tool status messages for cleanup
      };

      // Container for DOM elements
      this.elements = {};

      // Set up dependencies
      this._setupDependencies();

      // Create unique namespace for this widget instance
      this.namespace = 'sse-chat-v2-' + Math.random().toString(36).substr(2, 9);

      // Initialize the widget (UI only)
      this._initUI();
    }

    /**
     * Initialize the widget UI
     * @private
     */
    _initUI() {
      // Create widget elements
      this._createWidgetElements();

      // Inject CSS styles
      this._injectStyles();

      // Attach event listeners
      this._attachEventListeners();

      // Create predefined question buttons if enabled
      if (this.config.predefinedQuestions.enabled) {
        this._createPredefinedButtons();
      }
    }

    /**
     * Initialize session with the backend.
     * Makes an HTTP request to get a session token and assistant ID.
     * This should be called before sending any messages.
     */
    async initSession() {
        if (this.isSessionInitialized) {
            // console.log('Session already initialized.');
            return;
        }
        if (!this.config.chatId || !this.config.sessionEndpointUrl) {
            console.error('StreamingChatWidgetV2: Cannot init session. Missing chatId or sessionEndpointUrl in config.');
            this._addMessage('system', 'Chat initialization failed: Configuration error.');
            return;
        }

        try {
            this._addMessage('system', 'Initializing chat session...'); // Inform user
            const response = await fetch(this.config.sessionEndpointUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ chatid: this.config.chatId }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ detail: response.statusText }));
                throw new Error(errData.detail || `HTTP error ${response.status}`);
            }

            const data = await response.json();
            this.sessionToken = data.session_token;
            this.assistantId = data.assistant_id;
            this.isSessionInitialized = true;

            // console.log('Session initialized. Token:', this.sessionToken, 'Assistant ID:', this.assistantId);
            this._addMessage('system', 'Chat session started.'); // Clear "Initializing..."
            // Enable input or other UI elements now that session is ready
        } catch (error) {
            console.error('Error initiating chat session:', error);
            this._addMessage('system', 'Failed to start chat session: ' + error.message);
            this.isSessionInitialized = false; // Ensure it's marked as not initialized
        }
    }

    /**
     * Handles Server-Sent Events from the backend.
     * @param {string} eventName - The name of the SSE event.
     * @param {object} data - The parsed data from the SSE event.
     * @private
     */
    _handleStreamEvent(eventName, data) {
        // console.log('SSE Event:', eventName, data);

        // Handle tool processing steps
        if (eventName === 'thread.run.step.delta' && data.delta && data.delta.step_details && data.delta.step_details.tool_calls) {
            // Assistant is using tools (file_search, code_interpreter, etc.)
            const tool_calls = data.delta.step_details.tool_calls;
            tool_calls.forEach(tool_call => {
                if (tool_call.type === 'file_search' && !this.streamState.toolStatusShown) {
                    this._addMessage('system', '🔍 Searching knowledge base...');
                    this.streamState.toolStatusShown = true;
                } else if (tool_call.type === 'code_interpreter' && !this.streamState.toolStatusShown) {
                    this._addMessage('system', '⚡ Processing with code execution...');
                    this.streamState.toolStatusShown = true;
                }
            });
        } else if (eventName === 'thread.run.step.completed' && this.streamState.toolStatusShown) {
            // Tool processing completed, ready for response
            this._addMessage('system', '✨ Generating response...');
            // Remove the status message after a short delay
            setTimeout(() => {
                this._removeToolStatusMessages();
            }, 2000);
        }
        // Handle message content
        else if (eventName === 'thread.message.delta') {
            // Remove any tool status messages before showing content
            this._removeToolStatusMessages();

            if (!this.streamState.currentBotMessage && this.elements.chatMessages) {
                // Create a new bot message bubble if one isn't active
                this._addMessage('bot', ''); // Add an empty bot message, content will be filled
                const lastBotMessageContainer = this.elements.chatMessages.querySelector(`.${this.namespace}-bot-message-container:last-child`);
                if (lastBotMessageContainer) {
                    this.streamState.currentBotMessage = lastBotMessageContainer.querySelector(`.${this.namespace}-bot-message`);
                }
            }

            // Parse the actual message content from OpenAI's structure
            if (this.streamState.currentBotMessage && data.delta && data.delta.content) {
                data.delta.content.forEach(contentPart => {
                    if (contentPart.type === 'text' && contentPart.text && contentPart.text.value) {
                        this.streamState.activeMessageContent += contentPart.text.value;

                        // Immediate render for streaming effect - render raw text immediately
                        const plainText = this.streamState.activeMessageContent.trim();
                        this.streamState.currentBotMessage.textContent = plainText;

                        // Scroll to bottom to show latest content
                        this._scrollToBottom();
                    }
                });
            }
        } else if (eventName === 'thread.run.completed') {
             if (this.streamState.currentBotMessage && this.streamState.activeMessageContent) {
                // Now parse and render the complete message
                let htmlContent = marked.parse(this.streamState.activeMessageContent);
                this.streamState.currentBotMessage.innerHTML = DOMPurify.sanitize(htmlContent, {
                    ADD_TAGS: ['iframe', 'video', 'source'],
                    ALLOW_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'ul', 'ol', 'li', 'br', 'img', 'pre', 'code', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'span'],
                    ALLOW_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'style', 'controls', 'autoplay', 'loop', 'muted', 'poster', 'preload', 'width', 'height', 'type', 'frameborder', 'allowfullscreen', 'allow'],
                    ADD_ATTR: ['target', 'rel']
                });

                // YouTube embed logic
                const youtubeEmbedDiv = document.createElement('div');
                youtubeEmbedDiv.innerHTML = this.streamState.currentBotMessage.innerHTML;

                youtubeEmbedDiv.querySelectorAll('a').forEach(link => {
                    try {
                        const url = new URL(link.href);
                        let videoId = null;

                        if (url.hostname === 'www.youtube.com' || url.hostname === 'youtube.com') {
                            if (url.pathname === '/watch') {
                                videoId = url.searchParams.get('v');
                            } else if (url.pathname.startsWith('/embed/')) {
                                videoId = url.pathname.substring('/embed/'.length);
                            }
                        } else if (url.hostname === 'youtu.be') {
                            videoId = url.pathname.substring(1);
                        }

                        if (videoId) {
                            const iframe = document.createElement('iframe');
                            iframe.setAttribute('src', `https://www.youtube.com/embed/${videoId}`);
                            iframe.setAttribute('width', '100%');
                            const parentWidth = this.streamState.currentBotMessage.offsetWidth || 300;
                            iframe.setAttribute('height', `${Math.round(parentWidth * 9 / 16)}`);
                            iframe.setAttribute('frameborder', '0');
                            iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
                            iframe.setAttribute('allowfullscreen', '');

                            link.parentNode.replaceChild(iframe, link);
                        }
                    } catch (e) {
                        console.warn("Could not process link for YouTube embed:", link.href, e);
                    }
                });

                this.streamState.currentBotMessage.innerHTML = youtubeEmbedDiv.innerHTML;
                this._scrollToBottom();
             }
            this.streamState.isStreaming = false;
            this._removeTypingIndicator();
            this.streamState.currentBotMessage = null;
            this.streamState.activeMessageContent = '';
        } else if (eventName === 'thread.run.failed' || eventName === 'error') {
            this._addMessage('system', `Error: ${data.error || data.detail || 'An unknown error occurred.'}`);
            this.streamState.isStreaming = false;
            this._removeTypingIndicator();
            this.streamState.currentBotMessage = null;
            this.streamState.activeMessageContent = '';
        } else if (eventName === 'stream_end') {
            this.streamState.isStreaming = false;
            this._removeTypingIndicator();
            if (this.streamState.currentBotMessage && this.streamState.activeMessageContent === '') {
                // Optional: remove empty bot message bubble if stream ended abruptly
            }
            this.streamState.currentBotMessage = null;
            this.streamState.activeMessageContent = '';
        }
    }

    /**
     * Fetches and processes the SSE stream from the backend.
     * @param {string} messageText - The user's message.
     * @private
     */
    async _streamResponseFromServer(messageText) {
        if (!this.isSessionInitialized || !this.sessionToken) {
            this._addMessage('system', 'Session not initialized. Please try again.');
            this._removeSendingSpinner();
            return;
        }
        if (!this.config.backendStreamUrl) {
            console.error('StreamingChatWidgetV2: backendStreamUrl is not configured.');
            this._addMessage('system', 'Chat stream endpoint not configured.');
            this._removeSendingSpinner();
            return;
        }

        this.streamState.isStreaming = true;
        this.streamState.activeMessageContent = '';
        this.streamState.currentBotMessage = null;
        this._showTypingIndicator();

        try {
            const response = await fetch(this.config.backendStreamUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_token: this.sessionToken,
                    message: messageText
                })
            });

            this._removeSendingSpinner();

            if (!response.ok || !response.body) {
                const errorData = await response.json().catch(() => ({ detail: response.statusText }));
                this._addMessage('system', `Error: ${errorData.detail || 'Failed to connect to stream'}`);
                this.streamState.isStreaming = false;
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) {
                    if(this.streamState.isStreaming) {
                        this._handleStreamEvent('stream_end', { message: 'Stream closed by server.' });
                    }
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                let boundary = buffer.indexOf('\n\n');

                while (boundary !== -1) {
                    const rawSseEvent = buffer.substring(0, boundary);
                    buffer = buffer.substring(boundary + 2);

                    let eventName = 'message';
                    let eventDataLines = [];

                    rawSseEvent.split('\n').forEach(line => {
                        if (line.startsWith('event:')) {
                            eventName = line.substring('event:'.length).trim();
                        } else if (line.startsWith('data:')) {
                            eventDataLines.push(line.substring('data:'.length).trim());
                        }
                    });

                    const eventData = eventDataLines.join('');

                    if (eventData) {
                        // Handle [DONE] signal for stream end
                        if (eventData === '[DONE]') {
                            this._handleStreamEvent('stream_end', { message: 'Stream ended by server.' });
                            continue;
                        }

                        try {
                            const parsedData = JSON.parse(eventData);
                            this._handleStreamEvent(eventName, parsedData);
                        } catch (e) {
                            console.error('Error parsing SSE data:', eventData, e);
                            // Potentially add a system message about malformed data
                        }
                    }
                    boundary = buffer.indexOf('\n\n');
                }
            }
        } catch (error) {
            console.error('Streaming fetch error:', error);
            this._addMessage('system', 'Connection error during streaming.');
            this.streamState.isStreaming = false;
            this._removeTypingIndicator();
            this._removeSendingSpinner();
        }
    }

    /**
     * Set up marked and DOMPurify for message formatting
     * @private
     */
    _setupDependencies() {
      marked.setOptions({
        gfm: true,
        breaks: true,
        sanitize: false,
        highlight: function(code, lang) {
          return code;
        },
      });
    }

    /**
     * Darken a hex color by a percentage
     * @param {string} hex - Hex color code
     * @param {number} percent - Percentage to darken (0-100)
     * @returns {string} - Darkened hex color
     * @private
     */
    _darkenColor(hex, percent) {
      hex = hex.replace(/^#/, '');
      let r = parseInt(hex.substring(0, 2), 16);
      let g = parseInt(hex.substring(2, 4), 16);
      let b = parseInt(hex.substring(4, 6), 16);
      r = Math.floor(r * (100 - percent) / 100);
      g = Math.floor(g * (100 - percent) / 100);
      b = Math.floor(b * (100 - percent) / 100);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    /**
     * Deep merge two objects
     * @param {Object} defaults - Default configuration
     * @param {Object} custom - User configuration
     * @returns {Object} - Merged configuration
     * @private
     */
    _mergeConfig(defaults, custom) {
      const merged = JSON.parse(JSON.stringify(defaults));

      for (const key in custom) {
        if (custom.hasOwnProperty(key)) {
          if (typeof custom[key] === 'object' && custom[key] !== null &&
              typeof merged[key] === 'object' && merged[key] !== null &&
              !Array.isArray(custom[key])) {
            merged[key] = this._mergeConfig(merged[key], custom[key]);
          } else {
            merged[key] = custom[key];
          }
        }
      }

      return merged;
    }

    /**
     * Check if a string is a URL
     * @param {string} str - The string to check
     * @returns {boolean} - Whether the string is a URL
     * @private
     */
    _isUrl(str) {
      try {
        return str.startsWith('http://') ||
               str.startsWith('https://') ||
               str.startsWith('data:') ||
               /^(www\.)[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)$/i.test(str);
      } catch (e) {
        return false;
      }
    }

    /**
     * Check if a string is a valid JSON object with icon config
     * @param {string} str - The string to check
     * @returns {object|null} - The parsed object or null if not valid
     * @private
     */
    _parseIconConfig(str) {
      try {
        const config = JSON.parse(str);
        if (config && typeof config === 'object' && config.url) {
          return config;
        }
        return null;
      } catch (e) {
        return null;
      }
    }

    /**
     * Create element for icon (SVG code or image URL)
     * @param {string} iconContent - SVG code, image URL, or JSON config
     * @param {string} size - Icon size (e.g., '24px')
     * @returns {string} - HTML for the icon
     * @private
     */
    _createIconElement(iconContent, size = null) {
      if (!iconContent) return '';

      const iconConfig = this._parseIconConfig(iconContent);

      if (iconConfig) {
        const width = iconConfig.size || size || '24';
        const height = iconConfig.size || size || '24';
        let styles = `max-width: 100%; height: auto;`;
        return `<img src="${iconConfig.url}" width="${width}" height="${height}" alt="Icon" style="${styles}">`;
      }

      if (this._isUrl(iconContent)) {
        const width = size || '24';
        const height = size || '24';
        return `<img src="${iconContent}" width="${width}" height="${height}" alt="Icon" style="max-width: 100%; height: auto;">`;
      }

      return iconContent;
    }

    /**
     * Create all widget DOM elements
     * @private
     */
    _createWidgetElements() {
      // Create chat button
      const chatButton = document.createElement('button');
      chatButton.id = `${this.namespace}-button`;
      chatButton.className = `${this.namespace}-button`;
      chatButton.innerHTML = this._createIconElement(this.config.icons.chatButton);
      document.body.appendChild(chatButton);
      this.elements.chatButton = chatButton;

      // Create chat panel
      const chatPanel = document.createElement('div');
      chatPanel.id = `${this.namespace}-panel`;
      chatPanel.className = `${this.namespace}-panel`;
      document.body.appendChild(chatPanel);
      this.elements.chatPanel = chatPanel;

      // Create header
      const chatHeader = document.createElement('div');
      chatHeader.className = `${this.namespace}-header`;

      const headerTitle = document.createElement('div');
      headerTitle.textContent = this.config.text.headerTitle;

      const closeButton = document.createElement('div');
      closeButton.className = `${this.namespace}-close`;
      closeButton.innerHTML = '&times;';

      chatHeader.appendChild(headerTitle);
      chatHeader.appendChild(closeButton);
      chatPanel.appendChild(chatHeader);
      this.elements.chatHeader = chatHeader;
      this.elements.closeButton = closeButton;

      // Create messages container
      const chatMessages = document.createElement('div');
      chatMessages.className = `${this.namespace}-messages`;
      chatPanel.appendChild(chatMessages);
      this.elements.chatMessages = chatMessages;

      // Add welcome message
      if (this.config.text.welcomeMessage) {
        const welcomeWrapper = document.createElement('div');
        welcomeWrapper.className = `${this.namespace}-message-with-avatar ${this.namespace}-bot-message-container`;

        const botAvatar = document.createElement('div');
        botAvatar.className = `${this.namespace}-avatar ${this.namespace}-bot-avatar`;
        botAvatar.innerHTML = this._createIconElement(this.config.icons.botAvatar);

        const welcomeMsg = document.createElement('div');
        welcomeMsg.className = `${this.namespace}-message ${this.namespace}-bot-message`;
        welcomeMsg.textContent = this.config.text.welcomeMessage;

        welcomeWrapper.appendChild(botAvatar);
        welcomeWrapper.appendChild(welcomeMsg);
        chatMessages.appendChild(welcomeWrapper);
      }

      // Create input container
      const inputContainer = document.createElement('div');
      inputContainer.className = `${this.namespace}-input-container`;

      const chatInput = document.createElement('input');
      chatInput.type = 'text';
      chatInput.className = `${this.namespace}-input`;
      chatInput.placeholder = this.config.text.inputPlaceholder;

      const sendButton = document.createElement('button');
      sendButton.className = `${this.namespace}-send-button`;
      sendButton.innerHTML = this._createIconElement(this.config.icons.sendButton);

      inputContainer.appendChild(chatInput);
      inputContainer.appendChild(sendButton);
      chatPanel.appendChild(inputContainer);

      // Create "powered by" element
      const poweredBy = document.createElement('div');
      poweredBy.className = `${this.namespace}-powered-by`;
      poweredBy.innerHTML = 'powered by <a href="https://www.fxrsoft.com" target="_blank">fxrsoft</a>';
      chatPanel.appendChild(poweredBy);

      this.elements.inputContainer = inputContainer;
      this.elements.chatInput = chatInput;
      this.elements.sendButton = sendButton;
      this.elements.poweredBy = poweredBy;
    }

    /**
     * Create predefined question buttons
     * @private
     */
    _createPredefinedButtons() {
      if (!this.config.predefinedQuestions.enabled ||
          !this.config.predefinedQuestions.questions ||
          this.config.predefinedQuestions.questions.length === 0) {
        return;
      }

      // Create container for buttons
      const container = document.createElement('div');
      container.className = `${this.namespace}-predefined-container`;
      container.classList.add(`${this.namespace}-predefined-${this.config.predefinedQuestions.position}`);

      // Create each button
      this.config.predefinedQuestions.questions.forEach(question => {
        const button = document.createElement('button');
        button.className = `${this.namespace}-predefined-button`;
        button.classList.add(`${this.namespace}-predefined-${this.config.predefinedQuestions.style}`);
        const questionText = question.text && typeof question.text === 'object'
            ? ''
            : String(question.text || '');

        button.textContent = questionText;

        // Add click handler
        button.addEventListener('click', () => {
          let value = question.value || question.text;

          if (typeof value === 'object') {
            value = questionText;
          }

          this._handlePredefinedQuestion(value);
        });

        container.appendChild(button);
      });

      // Add to DOM based on position
      if (this.config.predefinedQuestions.position === 'top') {
        this.elements.chatMessages.insertBefore(container, this.elements.chatMessages.firstChild);
      } else if (this.config.predefinedQuestions.position === 'bottom') {
        this.elements.chatPanel.insertBefore(container, this.elements.inputContainer);
      } else if (this.config.predefinedQuestions.position === 'welcome') {
        container.classList.remove(`${this.namespace}-predefined-welcome`);
        container.classList.add(`${this.namespace}-predefined-top`);
        this.elements.chatMessages.insertBefore(container, this.elements.chatMessages.firstChild);

        const firstMsg = this.elements.chatMessages.querySelector(`.${this.namespace}-bot-message-container`);
        if (firstMsg) {
          container.classList.remove(`${this.namespace}-predefined-top`);
          container.classList.add(`${this.namespace}-predefined-welcome`);
          this.elements.chatMessages.insertBefore(container, firstMsg.nextSibling);
        }
      }

      this.elements.predefinedContainer = container;
    }

    /**
     * Handle predefined question click
     * @param {string|object} questionText - The question text/value to send
     * @private
     */
    async _handlePredefinedQuestion(questionText) {
      const messageText = typeof questionText === 'object' ?
        (questionText.toString && questionText.toString() !== '[object Object]' ? questionText.toString() : '') :
        String(questionText || '');

      await this.sendMessage(messageText);

      // Hide buttons if configured
      if (this.config.predefinedQuestions.hideAfterSelection && this.elements.predefinedContainer) {
        this.elements.predefinedContainer.style.display = 'none';
      }
    }

    /**
     * Generate and inject CSS styles
     * @private
     */
    _injectStyles() {
      const { theme, size, position } = this.config;
      const ns = this.namespace;

      // Handle special icon styling if configured
      let buttonBgColor = theme.primaryColor;

      // Check if we have custom icon styles for chat button
      if (this.config.iconStyles && this.config.iconStyles.chatButton) {
        const btnStyles = this.config.iconStyles.chatButton;

        // If transparent background is requested, override background color
        if (btnStyles.transparent) {
          buttonBgColor = 'transparent';
        }
        // Or if specific background color is provided
        else if (btnStyles.backgroundColor) {
          buttonBgColor = btnStyles.backgroundColor;
        }
      }

      // Create CSS with dynamic properties from config
      const css = `
        /* Chat Widget Styles */
        .${ns}-button {
          position: fixed;
          bottom: ${position.bottom};
          right: ${position.right};
          width: ${size.buttonSize};
          height: ${size.buttonSize};
          border-radius: 50%;
          background-color: ${buttonBgColor};
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 10px rgba(0,0,0,0.2);
          z-index: 9999;
          transition: transform 0.2s;
        }

        .${ns}-button:hover {
          transform: scale(1.05);
        }

        .${ns}-panel {
          position: fixed;
          bottom: calc(${position.bottom} + 80px);
          right: ${position.right};
          width: ${size.width};
          height: ${size.height};
          background: white;
          border-radius: 10px;
          box-shadow: 0 5px 15px rgba(0,0,0,0.2);
          display: none;
          flex-direction: column;
          overflow: hidden;
          z-index: 9998;
        }

        .${ns}-header {
          background: ${theme.primaryColor};
          color: white;
          padding: 15px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-weight: bold;
        }

        .${ns}-close {
          cursor: pointer;
          font-size: 20px;
        }

        .${ns}-messages {
          flex: 1;
          padding: 15px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        .${ns}-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .${ns}-bot-avatar {
          background-color: ${theme.primaryColor};
          margin-right: 10px;
        }

        .${ns}-user-avatar {
          background-color: ${theme.secondaryColor};
          margin-left: 10px;
        }

        .${ns}-message-with-avatar {
          display: flex;
          align-items: flex-start;
          max-width: 85%;
          margin-bottom: 10px;
          gap: 16px;
        }

        .${ns}-bot-message-container {
          align-self: flex-start;
        }

        .${ns}-user-message-container {
          align-self: flex-end;
          flex-direction: row-reverse;
          gap: 20px;
        }

        .${ns}-message {
          max-width: 100%;
          margin-bottom: 0;
          padding: 10px 15px;
          border-radius: 18px;
          overflow-wrap: break-word;
          overflow: hidden;
        }

        .${ns}-message p {
          margin: 0 0 10px 0;
        }

        .${ns}-message p:last-child {
          margin-bottom: 0;
        }

        .${ns}-system-message {
          align-self: center;
          background-color: ${theme.systemMessageBg};
          color: ${theme.systemMessageText};
          text-align: center;
          border-radius: 8px;
          padding: 8px 12px;
          margin: 10px 0;
          font-size: 0.875rem;
          max-width: 85%;
        }

        .${ns}-connected-status {
          color: #10b981;
          font-weight: 500;
          animation: fadeIn 0.3s ease-in;
        }

        @keyframes fadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }

        .${ns}-user-message {
          align-self: flex-end;
          background-color: ${theme.userMessageBg};
          color: ${theme.userMessageText};
          border-radius: 18px 18px 0 18px;
        }

        .${ns}-bot-message {
          align-self: flex-start;
          background-color: ${theme.botMessageBg};
          color: ${theme.botMessageText};
          border-radius: 18px 18px 18px 0;
        }

        .${ns}-input-container {
          display: flex;
          padding: 10px;
          border-top: 1px solid #e5e7eb;
        }

        .${ns}-input {
          flex: 1;
          padding: 10px 15px;
          border-radius: 24px;
          border: 1px solid #d1d5db;
          margin-right: 10px;
          outline: none;
          font-size: 16px;
        }

        .${ns}-input:focus {
          border-color: ${theme.primaryColor};
        }

        .${ns}-send-button {
          background: ${theme.primaryColor};
          color: white;
          border: none;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .${ns}-send-button:hover {
          background: ${this._darkenColor(theme.primaryColor, 10)};
        }

        /* Typing indicator */
        .${ns}-typing-indicator {
          display: flex;
          align-items: center;
          margin-bottom: 10px;
          align-self: flex-start;
        }

        .${ns}-typing-indicator span {
          height: 8px;
          width: 8px;
          background-color: #6b7280;
          border-radius: 50%;
          display: inline-block;
          margin-right: 2px;
          animation: ${ns}-typing 1.4s infinite both;
        }

        .${ns}-typing-indicator span:nth-child(2) {
          animation-delay: 0.2s;
        }

        .${ns}-typing-indicator span:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes ${ns}-typing {
          0% { transform: translateY(0px); }
          30% { transform: translateY(-5px); }
          60%, 100% { transform: translateY(0px); }
        }

        /* Sending spinner */
        .${ns}-sending-spinner {
          display: flex;
          align-items: center;
          align-self: flex-end;
          margin: 8px 20px 8px 0;
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .${ns}-sending-spinner.${ns}-active {
          opacity: 1;
        }

        .${ns}-sending-spinner-dots {
          display: flex;
        }

        .${ns}-sending-spinner-dots span {
          height: 8px;
          width: 8px;
          background-color: ${theme.primaryColor};
          border-radius: 50%;
          margin-right: 4px;
          animation: ${ns}-sending-pulse 1.5s infinite ease-in-out both;
        }

        .${ns}-sending-spinner-dots span:nth-child(2) {
          animation-delay: 0.2s;
        }

        .${ns}-sending-spinner-dots span:nth-child(3) {
          animation-delay: 0.4s;
          margin-right: 0;
        }

        @keyframes ${ns}-sending-pulse {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.6; }
          40% { transform: scale(1.2); opacity: 1; }
        }

        /* Predefined questions */
        .${ns}-predefined-container {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 10px 15px;
        }

        .${ns}-predefined-top {
          border-bottom: 1px solid rgba(0,0,0,0.1);
        }

        .${ns}-predefined-bottom {
          border-top: 1px solid rgba(0,0,0,0.1);
        }

        .${ns}-predefined-welcome {
          margin-top: 5px;
          margin-bottom: 10px;
          background-color: rgba(0,0,0,0.02);
          border-radius: 10px;
        }

        .${ns}-predefined-button {
          border: none;
          padding: 8px 16px;
          font-size: ${this.config.predefinedQuestions.fontSize || '14px'};
          cursor: pointer;
          transition: background-color 0.2s;
          ${this.config.predefinedQuestions.allowTextWrapping ?
            'white-space: normal; ' :
            'white-space: nowrap; text-overflow: ellipsis; overflow: hidden; max-width: 200px;'}
          background-color: ${this.config.predefinedQuestions.buttonColor};
          color: ${this.config.predefinedQuestions.textColor};
        }

        .${ns}-predefined-button:hover {
          background-color: ${this.config.predefinedQuestions.hoverColor};
        }

        .${ns}-predefined-button {
          border-radius: 16px;
        }

        .${ns}-predefined-pill {
          border-radius: 24px;
        }

        /* Powered by section */
        .${ns}-powered-by {
          text-align: center;
          font-size: 12px;
          color: #9ca3af;
          padding: 5px 0;
          border-top: 1px solid #e5e7eb;
        }

        .${ns}-powered-by a {
          color: ${theme.primaryColor};
          text-decoration: none;
        }

        .${ns}-powered-by a:hover {
          text-decoration: underline;
        }

        /* Markdown formatting for messages */
        .${ns}-message a {
          color: ${theme.primaryColor};
          text-decoration: none;
        }
        .${ns}-message a:hover {
          text-decoration: underline;
        }
        .${ns}-message code {
          font-family: monospace;
          background-color: rgba(0,0,0,0.05);
          padding: 2px 4px;
          border-radius: 4px;
        }
        .${ns}-message pre {
          background-color: rgba(0,0,0,0.05);
          padding: 10px;
          border-radius: 4px;
          overflow-x: auto;
        }

        /* Image formatting for messages */
        .${ns}-message img {
          max-width: 100%;
          height: auto;
          border-radius: 4px;
          margin: 4px 0;
          display: block;
        }

        /* Responsive styles for small screens (less than 800px width) */
        @media (max-width: 800px) {
          .${ns}-panel {
            width: calc(100% - 20px);
            max-width: 100%;
            right: 10px;
            left: 10px;
            height: 70vh;
            max-height: 550px;
            bottom: 70px;
          }

          .${ns}-button {
            width: 50px;
            height: 50px;
            bottom: 10px;
            right: 10px;
          }

          .${ns}-messages {
            max-height: calc(70vh - 120px);
          }

          .${ns}-input-container {
            padding: 8px;
          }

          .${ns}-input {
            padding: 8px 12px;
            font-size: 14px;
          }

          .${ns}-message-with-avatar {
            max-width: 95%;
          }

          .${ns}-predefined-container {
            padding: 8px;
            gap: 5px;
          }

          .${ns}-predefined-button {
            padding: 6px 12px;
            font-size: 13px;
          }
        }
      `;

      // Create and append style element
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    }

    /**
     * Attach event listeners to widget elements
     * @private
     */
    _attachEventListeners() {
      // Toggle chat panel when chat button is clicked
      this.elements.chatButton.addEventListener('click', () => {
        this.toggleChat();
      });

      // Close chat panel when close button is clicked
      this.elements.closeButton.addEventListener('click', () => {
        this.hideChat();
      });

      // Send message when send button is clicked
      this.elements.sendButton.addEventListener('click', () => {
        this.sendMessage();
      });

      // Send message when Enter key is pressed in input
      this.elements.chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.sendMessage();
        }
      });
    }

    /**
     * Destroy the widget and clean up
     * Remove all DOM elements and event listeners
     */
    destroy() {
      // No connection to close, session is HTTP based.

      // Remove all DOM elements
      Object.values(this.elements).forEach(element => {
        if (element && element.parentNode) {
          element.parentNode.removeChild(element);
        }
      });

      // Remove any style elements that were created for this widget
      const styleElements = document.querySelectorAll('style');
      styleElements.forEach(style => {
        if (style.textContent && style.textContent.includes(this.namespace)) {
          style.parentNode.removeChild(style);
        }
      });

      // Clear elements object
      this.elements = {};

      // Clear stream state
      this.streamState = {
        currentBotMessage: null,
        activeMessageContent: '',
        isStreaming: false,
        typingIndicator: null,
        sendingSpinner: null
      };
    }

    /**
     * Update an existing message's content
     * @param {string} type - Message type ('bot', 'user', or 'system')
     * @param {string} content - Updated message content
     * @private
     */
    _updateMessage(type, content) {
      // Only support updating bot messages for now
      if (type !== 'bot' || !this.streamState.currentBotMessage) {
        return;
      }

      // Find the message content element within the message container
      const messageEl = this.streamState.currentBotMessage.querySelector(`.${this.namespace}-bot-message`);
      if (!messageEl) {
        return;
      }

      // Update the content
      if (this.config.sanitization.output) {
        const rawHtml = marked.parse(content);
        const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
          ALLOW_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'ul', 'ol', 'li', 'br', 'img', 'pre', 'code', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'span'],
          ALLOW_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'style'],
          ADD_ATTR: ['target', 'rel']
        });
        messageEl.innerHTML = sanitizedHtml;
      } else {
        messageEl.innerHTML = marked.parse(content);
      }

      // Scroll to bottom
      this._scrollToBottom();
    }

    /**
     * Show sending spinner
     * @private
     */
    _showSendingSpinner() {
      // Remove existing spinner if any
      this._removeSendingSpinner();

      // Create spinner container
      const spinner = document.createElement('div');
      spinner.className = `${this.namespace}-sending-spinner`;

      // Add dots for animation
      const dots = document.createElement('div');
      dots.className = `${this.namespace}-sending-spinner-dots`;

      for (let i = 0; i < 3; i++) {
        const dot = document.createElement('span');
        dots.appendChild(dot);
      }

      spinner.appendChild(dots);
      this.elements.chatMessages.appendChild(spinner);

      // Store reference
      this.streamState.sendingSpinner = spinner;

      // Add active class after a small delay to enable transition
      setTimeout(() => {
        if (spinner && spinner.parentNode) {
          spinner.classList.add(`${this.namespace}-active`);
        }
      }, 10);
    }

    /**
     * Remove sending spinner
     * @private
     */
    _removeSendingSpinner() {
      if (this.streamState.sendingSpinner && this.streamState.sendingSpinner.parentNode) {
        this.streamState.sendingSpinner.parentNode.removeChild(this.streamState.sendingSpinner);
        this.streamState.sendingSpinner = null;
      }
    }

    /**
     * Show typing indicator
     * @private
     */
    _showTypingIndicator() {
      // If already showing, return
      if (this.streamState.typingIndicator && this.streamState.typingIndicator.parentNode) {
        return;
      }

      // Create typing indicator container
      const typingIndicator = document.createElement('div');
      typingIndicator.className = `${this.namespace}-typing-indicator`;

      // Add 3 dots for animation
      for (let i = 0; i < 3; i++) {
        const dot = document.createElement('span');
        typingIndicator.appendChild(dot);
      }

      this.elements.chatMessages.appendChild(typingIndicator);

      // Store reference
      this.streamState.typingIndicator = typingIndicator;

      // Scroll to bottom
      this._scrollToBottom();
    }

    /**
     * Remove typing indicator
     * @private
     */
    _removeTypingIndicator() {
      if (this.streamState.typingIndicator && this.streamState.typingIndicator.parentNode) {
        this.streamState.typingIndicator.parentNode.removeChild(this.streamState.typingIndicator);
        this.streamState.typingIndicator = null;
      }
    }

    /**
     * Remove all tool status messages
     * @private
     */
    _removeToolStatusMessages() {
      if (this.streamState.toolStatusMessages) {
        this.streamState.toolStatusMessages.forEach(msg => {
          if (msg && msg.parentNode) {
            msg.parentNode.removeChild(msg);
          }
        });
        this.streamState.toolStatusMessages = [];
      }
      this.streamState.toolStatusShown = false;
    }

    /**
     * Add a message to the chat
     * @param {string} type - Message type ('bot', 'user', or 'system')
     * @param {string} content - Message content
     * @private
     */
    _addMessage(type, content) {
      // Ensure messages container exists before adding
      if (!this.elements.chatMessages) return;
      // Create message element based on type
      if (type === 'system') {
        const systemMsg = document.createElement('div');
        systemMsg.className = `${this.namespace}-system-message`;
        systemMsg.textContent = content;
        this.elements.chatMessages.appendChild(systemMsg);

        // Track tool status messages for cleanup
        if (content.startsWith('🔍') || content.startsWith('⚡') || content.startsWith('✨')) {
          if (!this.streamState.toolStatusMessages) {
            this.streamState.toolStatusMessages = [];
          }
          this.streamState.toolStatusMessages.push(systemMsg);
        }

        // Auto-hide specific system messages after 3 seconds
        if (content === 'Initializing chat session...' || content === 'Chat session started.' || content === 'Initializing session before sending...') {
          setTimeout(() => {
            if (systemMsg && systemMsg.parentNode) {
              systemMsg.parentNode.removeChild(systemMsg);
            }
          }, 3000);
        }
      } else if (type === 'user') {
        const wrapper = document.createElement('div');
        wrapper.className = `${this.namespace}-message-with-avatar ${this.namespace}-user-message-container`;

        const avatar = document.createElement('div');
        avatar.className = `${this.namespace}-avatar ${this.namespace}-user-avatar`;
        avatar.innerHTML = this._createIconElement(this.config.icons.userAvatar);

        const message = document.createElement('div');
        message.className = `${this.namespace}-message ${this.namespace}-user-message`;
        message.textContent = content;

        wrapper.appendChild(avatar);
        wrapper.appendChild(message);
        this.elements.chatMessages.appendChild(wrapper);
      } else if (type === 'bot') {
        const wrapper = document.createElement('div');
        wrapper.className = `${this.namespace}-message-with-avatar ${this.namespace}-bot-message-container`;

        const avatar = document.createElement('div');
        avatar.className = `${this.namespace}-avatar ${this.namespace}-bot-avatar`;
        avatar.innerHTML = this._createIconElement(this.config.icons.botAvatar);

        const message = document.createElement('div');
        message.className = `${this.namespace}-message ${this.namespace}-bot-message`;

        // If content is markdown, process it
        if (this.config.sanitization.output) {
          // Convert markdown to HTML and sanitize
          const rawHtml = marked.parse(content);
          const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
            ADD_TAGS: ['iframe', 'video', 'source'],
            ALLOW_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'ul', 'ol', 'li', 'br', 'img', 'pre', 'code', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'span'],
            ALLOW_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'style', 'controls', 'autoplay', 'loop', 'muted', 'poster', 'preload', 'width', 'height', 'type', 'frameborder', 'allowfullscreen', 'allow'],
            ADD_ATTR: ['target', 'rel']
          });
          message.innerHTML = sanitizedHtml;
        } else {
          message.innerHTML = marked.parse(content);
        }

        wrapper.appendChild(avatar);
        wrapper.appendChild(message);
        this.elements.chatMessages.appendChild(wrapper);
      }

      // Scroll to bottom
      this._scrollToBottom();
    }

    /**
     * Scroll the messages container to the bottom
     * @private
     */
    _scrollToBottom() {
      if (this.elements.chatMessages) {
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
      }
    }

    /**
     * Send a message
     * Public method that can be called externally
     * @param {string} [text] - Optional message text (if not provided, get from input)
     */
    async sendMessage(text) {
      // Get text from input if not provided
      let messageText = text;
      if (!messageText) {
        messageText = this.elements.chatInput.value.trim();

        if (!messageText) {
          return; // Don't send empty messages
        }

        // Clear input
        this.elements.chatInput.value = '';
      }

      // Add user message to chat UI first
      this._addMessage('user', messageText);

      // Ensure session is initialized
      if (!this.isSessionInitialized) {
        this._addMessage('system', 'Initializing session before sending...');
        await this.initSession(); // Wait for session to initialize
        if (!this.isSessionInitialized) {
          this._addMessage('system', 'Session initialization failed. Cannot send message.');
          this._removeSendingSpinner();
          return;
        }
      }

      // Show sending spinner (if not already shown by _addMessage or similar)
      this._showSendingSpinner();

      // Call the streaming method
      this._streamResponseFromServer(messageText);
    }

    /**
     * Toggle chat panel visibility
     * Public method that can be called externally
     */
    toggleChat() {
      const panel = this.elements.chatPanel;

      if (panel.style.display === 'flex') {
        this.hideChat();
      } else {
        this.showChat();
      }
    }

    /**
     * Show chat panel
     * Public method that can be called externally
     */
    showChat() {
      const panel = this.elements.chatPanel;
      panel.style.display = 'flex';

      // Focus input
      setTimeout(() => {
        if (this.elements.chatInput) {
          this.elements.chatInput.focus();
        }
      }, 100);

      // Scroll to bottom
      this._scrollToBottom();
    }

    /**
     * Hide chat panel
     * Public method that can be called externally
     */
    hideChat() {
      const panel = this.elements.chatPanel;
      panel.style.display = 'none';
    }

    /**
     * Register event listener
     * Public method to add custom event listeners
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    on(event, callback) {
      // Event handling not implemented yet
      console.log(`Event '${event}' registered but handling not implemented yet`);
    }
  }

  // Expose to window
  window.StreamingChatWidgetV2 = StreamingChatWidgetV2;

})(window);
