// app.js
App({
  onLaunch() {
    // Load Custom Font via Backend Static File (Workaround for Simulator)
    wx.loadFontFace({
      family: 'XiangJiaoFont',
      source: 'url("http://127.0.0.1:8000/static/fonts/XiangJiao.ttf")',
      global: true, 
      success: (res) => {
        console.log('[Font] Loaded successfully', res);
      },
      fail: (err) => {
        console.error('[Font] Load failed', err);
        // Fallback: try local path if remote fails (e.g. on real device without vpn)
        // But local path often fails in simulator.
      }
    });

    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 登录
    wx.login({
      success: res => {
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
      }
    })
  },
  globalData: {
    userInfo: null
  }
})
