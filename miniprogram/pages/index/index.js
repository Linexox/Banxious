// pages/index/index.js
const api = require('../../utils/api');

Page({
  data: {
    cats: [
      { id: 'cat1', color: '#8BC34A', name: 'Chill Cat' },
      { id: 'cat2', color: '#4CAF50', name: 'Listen Cat' },
      { id: 'cat3', color: '#009688', name: 'Wise Cat' }
    ],
    selectedCatId: null
  },

  onLoad() {
    // Optional: Pre-select the middle cat? Or none.
  },

  onSelectCat(e) {
    const catId = e.currentTarget.dataset.id;
    this.setData({ selectedCatId: catId });
    
    // Slight delay for visual feedback before navigation
    setTimeout(() => {
      this.navigateToChat(catId);
    }, 300);
  },

  navigateToChat(catId) {
    api.logInfo('User selected cat', { catId });

    wx.navigateTo({
      url: `/pages/chat/chat?catId=${catId}`,
      success: () => {
        // Reset selection when returning?
        // this.setData({ selectedCatId: null }); 
      },
      fail: (err) => {
        console.error('Navigation failed', err);
        wx.showToast({
          title: '跳转失败',
          icon: 'none'
        });
      }
    });
  }
})
