// pages/index/index.js
const api = require('../../utils/api');

Page({
  data: {

  },
  onStart() {
    console.log('Attempting to navigate to chat page...');
    api.logInfo('User clicked Start Chatting', { timestamp: Date.now() });

    wx.navigateTo({
      url: '/pages/chat/chat',
      success: () => {
        console.log('Navigation success');
        api.logInfo('Navigated to Chat Page successfully');
      },
      fail: (err) => {
        console.error('Navigation failed', err);
        api.logError('Failed to navigate to Chat Page', { error: err });
        wx.showToast({
          title: '跳转失败: ' + err.errMsg,
          icon: 'none',
          duration: 3000
        });
      }
    })
  }
})
