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

  async onSend(e) {
    const content = e.detail.content;
    if (!content) return;

    const newMsg = { role: 'user', content };
    this.setData({
      messages: [...this.data.messages, newMsg],
      loading: true
    });

    try {
      const res = await api.chat(this.data.userId, content, this.data.mode);

      let aiContent = '';
      if (res.choices && res.choices.length > 0) {
        aiContent = res.choices[0].message.content;
      } else {
        aiContent = '抱歉，我好像走神了...';
      }

      this.setData({
        messages: [...this.data.messages, { role: 'assistant', content: aiContent }],
        loading: false
      });

      this.scrollToBottom();

    } catch (err) {
      console.error('[Chat Error]:', err);
      this.setData({
        loading: false
      });

      let title = '网络出小差了';
      if (err.errMsg && err.errMsg.includes('url not in domain list')) {
        title = '请在详情中关闭域名校验';
      } else if (err.errMsg) {
        title += ': ' + err.errMsg;
      }

      wx.showToast({
        title: title,
        icon: 'none',
        duration: 3000
      });
    }
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
