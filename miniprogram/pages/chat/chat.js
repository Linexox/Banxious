const api = require('../../utils/api');
// const util = require('../../utils/util');

Page({
  data: {
    messages: [
      { role: 'assistant', content: '嗨！我是 Mood Lab 的研究员。这里很安全，你可以告诉我任何让你感到“蕉绿”的事情。' }
    ],
    userId: 'test_user_' + Date.now(), // 简单的用户ID生成
    loading: false,
    mode: 'concise', // 'concise' | 'professional'
    suggestions: [] // Add suggestions state
  },

  onLoad() {

  },

  onSuggestionTap(e) {
    const content = e.currentTarget.dataset.text;
    if (!content) return;

    // Construct event object to mimic chat-input send event
    const event = {
      detail: {
        content: content
      }
    };
    this.onSend(event);
  },

  onModeChange(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.mode) return;

    this.setData({ mode });
    wx.showToast({
      title: mode === 'professional' ? '已切换至专业模式' : '已切换至简洁模式',
      icon: 'none'
    });
  },

  onSend(e) {
    const content = e.detail.content;
    if (!content) return;

    const newMsg = { role: 'user', content };
    // Add placeholder for assistant immediately
    const assistantMsg = { role: 'assistant', content: '' };
    const currentMessages = [...this.data.messages, newMsg, assistantMsg];
    const assistantMsgIndex = currentMessages.length - 1;

    this.setData({
      messages: currentMessages,
      loading: true,
      suggestions: [] // Clear suggestions when sending new message
    });

    this.scrollToBottom();

    // Initialize streaming state
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
      },
      onError: (err) => {
        console.error('[Chat Error]:', err);
        this.networkFinished = true;
        this.setData({ loading: false });

        let title = '网络出小差了';
        if (err.errMsg && err.errMsg.includes('url not in domain list')) {
          title = '请在详情中关闭域名校验';
        } else if (err.errMsg) {
          title += ': ' + err.errMsg;
        } else if (err.error) {
          title += ': ' + err.error;
        }

        wx.showToast({
          title: title,
          icon: 'none',
          duration: 3000
        });
      }
    });
  },

  processStreamBuffer(msgIndex) {
    if (this.isTyping) return;
    this.isTyping = true;

    const typeNext = () => {
      if (this.streamBuffer.length === 0) {
        this.isTyping = false;
        // Only stop loading when network is done AND buffer is empty
        if (this.networkFinished) {
          this.setData({ loading: false });
        }
        return;
      }

      // Adaptive typing speed/chunk size
      let chunkSize = 1;
      if (this.streamBuffer.length > 50) chunkSize = 5;
      else if (this.streamBuffer.length > 20) chunkSize = 2;

      let chunk = this.streamBuffer.slice(0, chunkSize);
      this.streamBuffer = this.streamBuffer.slice(chunkSize);

      // Check for suggestions pattern in the chunk or accumulated content
      // Since chunking might split the pattern, we should probably check the full accumulated content in the buffer
      // But we are removing from buffer.
      // Better strategy: Append chunk to current message content, THEN check regex on the full content?
      // No, that would cause the raw pattern to flash on screen.

      // Alternative: Peek ahead in buffer?
      // Or simpler: Just append everything, and if we detect the start of the pattern, we stop "typing" and wait for the rest?

      // Let's try: append to a temporary "displayBuffer" and check regex.
      // Actually, the pattern is at the END. 
      // While streaming, we don't know if we are at the end until networkFinished is true.

      const currentContent = this.data.messages[msgIndex].content + chunk;

      // Detect suggestions block: |||SUGGESTIONS=...|||
      // Regex explanation:
      // \|\|\|\s*SUGGESTIONS\s* - Match start marker
      // (?:=|:)?\s* - Optional equals sign or colon
      // ([\s\S]*?) - Capture ANY content (non-greedy) until...
      // \s*\|\|\| - End marker
      const suggestionRegex = /\|\|\|\s*SUGGESTIONS\s*(?:=|:)?\s*([\s\S]*?)\s*\|\|\|/;
      const match = currentContent.match(suggestionRegex);

      let displayContent = currentContent;
      let foundSuggestions = null;

      if (match) {
        // Found something that looks like the suggestion block
        let rawSuggestions = match[1].trim();
        console.log('[Chat] Raw suggestions captured:', rawSuggestions);

        try {
          // Attempt 1: Standard JSON parse
          foundSuggestions = JSON.parse(rawSuggestions);
        } catch (e1) {
          console.warn('[Chat] Failed standard JSON parse, attempting repair...');

          // Attempt 2: Missing brackets? e.g. "A", "B"
          // Try wrapping in []
          try {
            foundSuggestions = JSON.parse(`[${rawSuggestions}]`);
          } catch (e2) {
            // Attempt 3: Missing opening quote? e.g. A", "B"
            // Or partial missing quotes.
            // Let's try to reconstruct from comma separated strings

            // Heuristic: Split by "," or ", "
            // But first, if it doesn't start with [, assume it's a list.
            if (!rawSuggestions.startsWith('[')) {
              // Check if it's like: Item 1, Item 2
              // Or: "Item 1", "Item 2"

              // Simple fallback: Split by double quote sequence ", "
              if (rawSuggestions.includes('", "')) {
                // It has quotes structure
                // Remove leading/trailing quotes if they exist partially
                let clean = rawSuggestions.replace(/^"?/, '').replace(/"?$/, '');
                foundSuggestions = clean.split('", "');
              } else {
                // No clear quote structure, maybe just text separated by commas?
                // Or maybe Chinese commas?
                // This is risky as it might split sentences. 
                // But for now, if we failed JSON, it's our best bet.
                // foundSuggestions = rawSuggestions.split(/,|，/); 

                // Actually, let's look at the user case:
                // 就是我试图表达想法...
                // It had no quotes at start.
                // So wrapping in ["..."] might work if we escape internal quotes?
                // Too complex.

                // Let's try wrapping in [" and "] if it failed previous attempts
                try {
                  foundSuggestions = JSON.parse(`["${rawSuggestions.replace(/", "/g, '", "')}"]`);
                } catch (e3) {
                  console.error('[Chat] All parsing attempts failed');
                }
              }
            }
          }
        }

        if (foundSuggestions && !Array.isArray(foundSuggestions)) {
          foundSuggestions = null; // Must be an array
        }

        // Remove from display content
        displayContent = currentContent.replace(match[0], '');
      } else {
        // Check for PARTIAL match at the end of string to prevent flashing
        // e.g. "|||SUG"
        const partialRegex = /\|\|\|\s*S?U?G?G?E?S?T?I?O?N?S?$/;
        if (partialRegex.test(currentContent)) {
          // We might be typing the tag. 
          // Don't update displayContent yet? 
          // Actually, updating is fine, we just might see "|||" briefly.
        }
      }

      // Update data
      if (foundSuggestions) {
        this.setData({
          [`messages[${msgIndex}].content`]: displayContent,
          suggestions: foundSuggestions
        });
        // Stop typing rest of the buffer if it was just the suggestions
        this.streamBuffer = '';
        this.isTyping = false;
        this.setData({ loading: false });
        this.scrollToBottom();
        return;
      } else {
        this.setData({
          [`messages[${msgIndex}].content`]: displayContent
        }, () => {
          this.scrollToBottom();
        });
      }

      // 30ms per update for smooth typewriter effect
      setTimeout(typeNext, 30);
    };

    typeNext();
  },

  scrollToBottom() {
    wx.createSelectorQuery().select('.chat-list').boundingClientRect(function (rect) {
      wx.pageScrollTo({
        scrollTop: rect.height,
        duration: 300
      })
    }).exec()
  },

  onGenerateCard() {
    console.log('Navigating to result page with userId:', this.data.userId);
    api.logInfo('User clicked Generate Card', { userId: this.data.userId });

    wx.navigateTo({
      url: `/pages/result/result?userId=${this.data.userId}`,
      success: () => {
        console.log('Navigate to result success');
        api.logInfo('Navigated to Result Page successfully');
      },
      fail: (err) => {
        console.error('Navigate to result failed', err);
        api.logError('Navigate to result failed', { err });
        wx.showToast({
          title: '跳转失败: ' + (err.errMsg || '未知错误'),
          icon: 'none',
          duration: 3000
        });
      }
    })
  }
})
