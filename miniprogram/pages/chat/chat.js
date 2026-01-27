const api = require('../../utils/api');
// const util = require('../../utils/util');

Page({
  data: {
    messages: [
      { role: 'assistant', content: '嗨！我是 Mood Lab 的研究员。这里很安全，你可以告诉我任何让你感到“蕉绿”的事情。' }
    ],
    userId: 'test_user_' + Date.now(), // 简单的用户ID生成
    loading: false,
    mode: 'concise' // 'concise' | 'professional'
  },

  onLoad() {

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
      loading: true
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

      const chunk = this.streamBuffer.slice(0, chunkSize);
      this.streamBuffer = this.streamBuffer.slice(chunkSize);

      const currentContent = this.data.messages[msgIndex].content;
      this.setData({
        [`messages[${msgIndex}].content`]: currentContent + chunk
      }, () => {
        // Scroll only if close to bottom? Or always?
        // Always scroll for now to follow cursor
        this.scrollToBottom();
      });

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
