// pages/index/index.js
const api = require('../../utils/api');
const { ASSETS } = require('../../utils/assets');

Page({
  data: {
    cats: [
      { id: 'cat1', color: '#8BC34A', name: 'Chill Cat' },
      { id: 'cat2', color: '#4CAF50', name: 'Listen Cat' },
      { id: 'cat3', color: '#009688', name: 'Wise Cat' }
    ],
    selectedCatId: null,
    
    // Animation State
    isAnimating: false,
    catPos: { left: 0, top: 0 },
    catScale: 1,
    walkingCatUrl: ASSETS.avatars.cat.src,
    walkStep: 0
  },

  onLoad() {
    // Optional: Pre-select the middle cat? Or none.
  },

  onSelectCat(e) {
    if (this.data.isAnimating) return;

    const catId = e.currentTarget.dataset.id;
    this.setData({ selectedCatId: catId });
    
    // Trigger Walking Animation
    const query = wx.createSelectorQuery();
    query.select(`.cat-item[data-id="${catId}"]`).boundingClientRect();
    query.exec((res) => {
      if (res[0]) {
        const rect = res[0];
        const sysInfo = wx.getSystemInfoSync();
        const catSizePx = (sysInfo.windowWidth / 750) * 200; // 200rpx to px
        
        const startLeft = rect.left + rect.width/2 - catSizePx/2;
        const startTop = rect.top + rect.height/2 - catSizePx/2;

        this.startWalkingAnimation(catId, startLeft, startTop, catSizePx, sysInfo);
      } else {
        // Fallback if rect not found
        this.navigateToChat(catId);
      }
    });
  },

  startWalkingAnimation(catId, startLeft, startTop, catSize, sysInfo) {
    this.setData({
        isAnimating: true,
        catPos: { left: startLeft, top: startTop },
        catScale: 1.0, // Start at normal size
        walkingCatUrl: ASSETS.avatars.cat.src
    });

    // Start walking loop (Frame 1-2-3-2)
    this.walkInterval = setInterval(() => {
        const map = [0, 1, 2, 1];
        let step = this.data.walkStep + 1;
        if (step >= 4) step = 0;
        
        const seq = ASSETS.avatars.cat.sequences.run;
        if (seq && seq.length >= 3) {
            this.setData({
                walkStep: step,
                walkingCatUrl: seq[map[step]]
            });
        }
    }, 200); // Change frame every 200ms

    // Phase 1: Move to Center & Scale Up (Wait 50ms to ensure initial render)
    setTimeout(() => {
        const centerLeft = sysInfo.windowWidth / 2 - catSize / 2;
        const centerTop = sysInfo.windowHeight / 2 - catSize / 2;
        
        this.setData({
            catPos: { left: centerLeft, top: centerTop },
            catScale: 1.5 // Zoom In
        });
        
        // Phase 2: Move to Bottom Left & Scale Down (After 1.2s)
        setTimeout(() => {
            const endLeft = 20; // 20px padding from left
            const endTop = sysInfo.windowHeight - catSize; // Bottom aligned
            
            this.setData({
                catPos: { left: endLeft, top: endTop },
                catScale: 1.0 // Zoom Out to normal
            });
            
            // Finish: Navigate (After another 1.2s)
            setTimeout(() => {
                clearInterval(this.walkInterval);
                this.navigateToChat(catId);
                // Reset state logic is handled by page unmount usually, 
                // but if we come back, we might want to reset.
                setTimeout(() => {
                    this.setData({ isAnimating: false });
                }, 500);
            }, 1200);
            
        }, 1200); // Allow time for CSS transition (1s)
        
    }, 50);
  },

  navigateToChat(catId) {
    api.logInfo('User selected cat', { catId });

    wx.navigateTo({
      url: `/pages/chat/chat?catId=${catId}`,
      fail: (err) => {
        console.error('Navigation failed', err);
        wx.showToast({
          title: '跳转失败',
          icon: 'none'
        });
      }
    });
  },

  onUnload() {
      if (this.walkInterval) {
          clearInterval(this.walkInterval);
      }
  }
})
