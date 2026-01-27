const api = require('../../utils/api.js');
const app = getApp();

Page({
  data: {
    messages: [],
    loading: false,
    toView: '',
    userInput: '',
    userId: '',
    mode: 'chat', // 'chat' or 'card'
    suggestions: [],
    progress: 0,
    isTalking: false,
    isUserTyping: false
  },

  onLoad(options) {
    this.setData({
      userId: (app.globalData && app.globalData.userId) || 'user_' + Date.now()
    });
    
    // Initial welcome message if needed
    if (this.data.messages.length === 0) {
      this.addMessage('assistant', '你好！我是你的绿色香蕉猫，今天感觉怎么样？');
      this.setData({
        suggestions: ['感觉有点焦虑', '想聊聊最近的压力', '只是来看看']
      });
    }
  },

  onSend(e) {
    const content = e.detail.value || e.detail;
    if (!content || !content.trim()) return;

    this.addMessage('user', content);
    
    // Clear suggestions
    this.setData({ suggestions: [], isUserTyping: false });
    
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
    }

    this.processChat(content);
  },

  onUserTyping(e) {
    if (!this.data.isUserTyping) {
      this.setData({ isUserTyping: true });
    }
    
    // Clear existing timer
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
    }
    
    // Set new timer to hide typing status after 1.5s of inactivity
    this.typingTimer = setTimeout(() => {
      this.setData({ isUserTyping: false });
    }, 1500);
  },

  onSuggestionTap(e) {
    const text = e.currentTarget.dataset.text;
    this.onSend({ detail: text });
  },

  addMessage(role, content) {
    const messages = this.data.messages;
    messages.push({ role, content });
    this.setData({ messages });
    this.scrollToBottom();
  },

  processChat(content) {
    const messages = this.data.messages;
    // Add placeholder for AI
    messages.push({ role: 'assistant', content: '' });
    const assistantMsgIndex = messages.length - 1;
    
    // Update Progress (Mock logic: +10% per turn, max 100%)
    let newProgress = this.data.progress + 10;
    if (newProgress > 100) newProgress = 100;

    this.setData({
      messages: messages,
      loading: true,
      suggestions: [],
      progress: newProgress,
      isTalking: true // Start AI talking animation
    });

    this.scrollToBottom();

    // Stream Setup
    this.streamBuffer = '';
    this.isTyping = false;
    this.networkFinished = false;

    api.chatStream(this.data.userId, content, this.data.mode, {
      onChunk: (text) => {
        this.streamBuffer += text;
        this.processStreamBuffer(assistantMsgIndex);
      },
      onComplete: () => {
        this.networkFinished = true;
        this.processStreamBuffer(assistantMsgIndex);
        this.setData({ isTalking: false }); // Stop AI talking
        
        // If progress is full, maybe show completion toast?
        if (newProgress >= 100) {
           // TODO: Handle completion logic
        }
      },
      onError: (err) => {
        console.error('[Chat Error]:', err);
        this.networkFinished = true;
        this.setData({ loading: false, isTalking: false });
      }
    });
  },

  processStreamBuffer(msgIndex) {
    if (this.isTyping) return;
    this.isTyping = true;
    
    const TAG_S = '|||SUGGESTIONS=';
    const TAG_NO_S = '|||SUGGESTION=';

    const processNextChar = () => {
      if (this.streamBuffer.length > 0) {
        const char = this.streamBuffer[0];
        this.streamBuffer = this.streamBuffer.slice(1);
        
        if (this.isParsingSuggestions) {
            this.suggestionText += char;
            
            // Check for closing tag |||
            if (this.suggestionText.endsWith('|||')) {
                // Found closing tag!
                // Remove the trailing |||
                this.suggestionText = this.suggestionText.slice(0, -3);
                this.isParsingSuggestions = false;
                // Trigger processing
                this.checkSuggestions(this.suggestionText, true);
                this.suggestionText = '';
                this.pendingBuffer = ''; 
            }
        } else {
            const potential = this.pendingBuffer + char;
            
            if (potential === TAG_S || potential === TAG_NO_S) {
                // Full match! Switch mode
                this.isParsingSuggestions = true;
                this.pendingBuffer = ''; // Consumed the tag
                this.suggestionText = '';
            } else if (TAG_S.startsWith(potential) || TAG_NO_S.startsWith(potential)) {
                // It is a valid prefix, hold it
                this.pendingBuffer = potential;
            } else {
                // Not a match. Flush pending buffer + char to UI
                const contentToFlush = this.pendingBuffer + char;
                this.pendingBuffer = '';
                
                const messages = this.data.messages;
                messages[msgIndex].content += contentToFlush;
                
                this.setData({
                  messages,
                  loading: false 
                });
                this.scrollToBottom();
            }
        }

        // Adaptive speed
        let delay = 30;
        if (this.streamBuffer.length > 50) delay = 10;
        else if (this.streamBuffer.length > 20) delay = 20;

        setTimeout(processNextChar, delay);
      } else {
        this.isTyping = false;
        if (!this.networkFinished) {
           // Wait for more chunks
        } else {
           // Finished completely
           
           // 1. Flush any remaining pending buffer that wasn't a delimiter
           if (this.pendingBuffer) {
               const messages = this.data.messages;
               messages[msgIndex].content += this.pendingBuffer;
               this.pendingBuffer = '';
               this.setData({ messages });
           }

           // 2. Process suggestions if any (if stream ended abruptly)
           if (this.suggestionText) {
               // If we were parsing, try to extract whatever we got
               // But usually we expect ||| at end. 
               // If network finished and we are still parsing, maybe the closing tag was missing?
               this.checkSuggestions(this.suggestionText, true);
           } else {
               // Fallback: Check content if no delimiter was found (old format)
               this.checkSuggestions(this.data.messages[msgIndex].content);
           }
        }
      }
    };

    processNextChar();
  },

  scrollToBottom() {
    // Force reset toView to trigger scroll even if id hasn't changed
    this.setData({ toView: '' }, () => {
       this.setData({ toView: 'bottom' });
    });
  },

  checkSuggestions(content, isRawData = false) {
    let suggestions = [];
    
    if (isRawData) {
        // Content is the raw suggestion text after delimiter
        try {
            // Try parsing as JSON first
            suggestions = JSON.parse(content);
        } catch (e) {
            console.warn('Failed to parse suggestions as JSON:', content);
            // Fallback: simple split if it looks like [a, b]
            const match = content.match(/\[(.*?)\]/);
            if (match && match[1]) {
                suggestions = match[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
            } else {
                // Last resort: split by newline or pipe if JSON fails?
                // Assuming it's JSON or bracketed list based on backend
            }
        }
    } else {
        // Robust check for marker or bracketed list
        let found = false;
        
        // 1. Try marker match |||SUGGESTION(S)=...|||
        const markerRegex = /\|\|\|SUGGESTIONS?=(.*?)\|\|\|/s;
        const match = content.match(markerRegex);
        
        if (match && match[1]) {
             let raw = match[1];
             try {
                 suggestions = JSON.parse(raw);
             } catch (e) {
                 // Try loose parsing
                 const m = raw.match(/\[(.*?)\]/);
                 if (m && m[1]) {
                    suggestions = m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
                 }
             }
             
             // Remove from message
             const messages = this.data.messages;
             const lastMsg = messages[messages.length - 1];
             lastMsg.content = lastMsg.content.replace(markerRegex, '').trim();
             this.setData({ messages });
             found = true;
        }

        if (!found) {
            // 2. Fallback to just [ ... ]
            const bracketMatch = content.match(/\[(.*?)\]/);
            if (bracketMatch && bracketMatch[1]) {
                let raw = bracketMatch[1];
                suggestions = raw.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
                
                // Remove from message if found in content mode
                const messages = this.data.messages;
                const lastMsg = messages[messages.length - 1];
                lastMsg.content = lastMsg.content.replace(/\[.*?\]/, '').trim();
                this.setData({ messages });
            }
        }
    }

    // Filter and Set
    if (Array.isArray(suggestions)) {
        suggestions = suggestions.filter(s => s);
        if (suggestions.length > 0) {
            this.setData({ 
                suggestions 
            }, () => {
                this.scrollToBottom();
            });
        }
    }
  },

  onGenerateCard() {
      // Navigate to Result Page
      wx.navigateTo({
          url: '/pages/result/result'
      });
  }
});
