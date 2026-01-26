const BASE_URL = 'http://127.0.0.1:8000/api';

const request = (url, method, data) => {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + url,
      method: method,
      data: data,
      header: {
        'content-type': 'application/json'
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(res.data || { error: 'Request failed' });
        }
      },
      fail(err) {
        reject(err);
      }
    });
  });
};

const api = {
  chat: (userId, content) => request('/chat', 'POST', { user_id: userId, content: content }),
  generateCard: (userId) => request('/generate_card', 'POST', { user_id: userId }),
  logError: (message, context = {}) => {
    // Fire and forget log request
    wx.request({
      url: BASE_URL + '/log',
      method: 'POST',
      data: {
        level: 'error',
        message: message,
        context: context
      }
    });
  },
  logInfo: (message, context = {}) => {
    wx.request({
      url: BASE_URL + '/log',
      method: 'POST',
      data: {
        level: 'info',
        message: message,
        context: context
      }
    });
  }
};

module.exports = api;
