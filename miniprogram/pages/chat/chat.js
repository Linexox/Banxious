const api = require('../../utils/api.js');
const { ASSETS } = require('../../utils/assets.js');
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
    showCardEntry: false,
    cardEntryDismissed: false,
    isTalking: false,
    isUserTyping: false,
    userCatUrl: ASSETS.avatars.user.src,
    typeStep: 0,
    assets: ASSETS
  },

  onLoad(options) {
    this.initUser();
    this.initMode();
    this.initWelcome();
  },

  initMode() {
    try {
        const mode = wx.getStorageSync('chatMode') || 'chat';
        this.setData({ mode });
    } catch (e) {
        console.error('Failed to load mode preference', e);
    }
  },

  onToggleMode() {
    const newMode = this.data.mode === 'chat' ? 'professional' : 'chat';
    
    // Add transition effect feedback if needed, but the switch UI will animate
    this.setData({ mode: newMode });
    
    // Persist preference
    try {
        wx.setStorageSync('chatMode', newMode);
        
        // Optional: Show toast to confirm switch
        wx.showToast({
            title: newMode === 'chat' ? '已切换：幽默模式' : '已切换：专业模式',
            icon: 'none',
            duration: 1500
        });
    } catch (e) {
        console.error('Failed to save mode preference', e);
    }
  },

  initUser() {
    const userId = (app.globalData && app.globalData.userId) || 'user_' + Date.now();
    
    // Save to globalData
    if (app.globalData) {
        app.globalData.userId = userId;
    }

    this.setData({
      userId: userId
    });
  },

  initWelcome() {
    // Initial welcome message if needed
    if (this.data.messages.length === 0) {
      this.addMessage('assistant', '你好！我是你的绿色香蕉猫，今天感觉怎么样？');
      this.setData({
        suggestions: ['感觉有点焦虑', '想聊聊最近的压力', '只是来看看']
      });
    }
  },

  onSend(e) {
    // Handle different event detail structures
    // 1. chat-input sends { content: 'text' }
    // 2. native input sends { value: 'text' }
    // 3. onSuggestionTap sends 'text' directly in e.detail
    let content = e.detail;
    
    if (typeof content === 'object') {
        content = content.content || content.value || '';
    }

    if (typeof content !== 'string' || !content.trim()) return;

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
    
    // Typing Animation Logic
    // Cycle: 1(0) -> 2(1) -> 3(2) -> 2(1) -> ...
    const sequence = this.data.assets.avatars.user.sequences.type;
    if (sequence && sequence.length >= 3) {
        const map = [0, 1, 2, 1]; // Maps step to frame index
        let step = this.data.typeStep + 1;
        if (step >= 4) step = 0;
        
        const frameIndex = map[step];
        const newUrl = sequence[frameIndex];
        
        this.setData({
            typeStep: step,
            userCatUrl: newUrl
        });
    }
    
    // Clear existing timer
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
    }
    
    // Set new timer to hide typing status after 1.5s of inactivity
    this.typingTimer = setTimeout(() => {
      this.setData({ 
          isUserTyping: false,
          userCatUrl: this.data.assets.avatars.user.src // Reset to idle
      });
    }, 1500);
  },

  onSuggestionTap(e) {
    const text = e.currentTarget.dataset.text;
    
    // Trigger typing animation for feedback
    this.onUserTyping();
    
    // Slight delay to allow animation to be seen before sending
    setTimeout(() => {
        this.onSend({ detail: text });
    }, 300);
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
    
    // Check if we should show card entry
    let showCardEntry = this.data.showCardEntry;
    // DEBUG: Threshold set to 10% for testing (original: 70)
    if (newProgress >= 10 && !this.data.cardEntryDismissed) {
        showCardEntry = true;
    }

    this.setData({
      messages: messages,
      loading: true,
      suggestions: [],
      progress: newProgress,
      showCardEntry: showCardEntry,
      isTalking: true // Start AI talking animation
    });

    this.scrollToBottom();

    // Stream Setup
    this.streamBuffer = '';
    this.isTyping = false;
    this.networkFinished = false;
    this.pendingBuffer = ''; // Initialize pending buffer to avoid "undefined" prefix

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
      if (this.data.userId) {
          wx.navigateTo({
              url: `/pages/result/result?userId=${this.data.userId}`
          });
      } else {
          console.error('Cannot navigate to result: userId is missing');
          wx.showToast({
              title: '用户ID丢失',
              icon: 'none'
          });
      }
  },

  onCloseCardEntry() {
      this.setData({
          showCardEntry: false,
          cardEntryDismissed: true
      });
  }
});
