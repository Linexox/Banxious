const api = require('../../utils/api');

Page({
  data: {
    userId: '',
    cardData: null,
    loading: true,
    destroyed: false,
    isFlipped: false,
    errorMsg: ''
  },

  onLoad(options) {
    if (options.userId) {
      this.setData({ userId: options.userId });
      this.generateCard();
    }
  },

  async generateCard() {
    this.setData({
      loading: true,
      errorMsg: ''
    });

    try {
      const res = await api.generateCard(this.data.userId);
      this.setData({
        cardData: res,
        loading: false
      });
    } catch (err) {
      console.error('[Generate Card Error]:', err);
      api.logError('Generate Card Error', { err });

      let title = '生成卡片失败';
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
      this.setData({
        loading: false,
        errorMsg: title
      });
    }
  },

  onFlipCard() {
    if (this.data.destroyed) return;
    this.setData({
      isFlipped: !this.data.isFlipped
    });
  },

  onDestroy() {
    if (this.data.destroyed) return;

    // 简单的销毁动画逻辑
    wx.vibrateLong(); // 震动
    this.setData({ destroyed: true });

    setTimeout(() => {
      wx.showToast({
        title: '蕉绿已粉碎',
        icon: 'success'
      });
    }, 1000);

    setTimeout(() => {
      wx.reLaunch({
        url: '/pages/index/index',
      });
    }, 2500);
  }
})
