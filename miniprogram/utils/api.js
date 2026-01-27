const BASE_URL = 'http://127.0.0.1:8000/api';

const request = (url, method, data, timeout = 60000) => {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + url,
      method: method,
      data: data,
      timeout: timeout, // 增加超时设置
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
  chat: (userId, content, mode = 'concise') => request('/chat', 'POST', { user_id: userId, content: content, mode: mode }),
  
  chatStream: (userId, content, mode = 'concise', callbacks) => {
    const { onChunk, onComplete, onError } = callbacks;
    const requestTask = wx.request({
      url: BASE_URL + '/chat',
      method: 'POST',
      enableChunked: true,
      data: { user_id: userId, content: content, mode: mode },
      header: {
        'content-type': 'application/json'
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (onComplete) onComplete();
        } else {
          if (onError) onError({ error: 'Request failed', statusCode: res.statusCode });
        }
      },
      fail(err) {
        if (onError) onError(err);
      }
    });

    // Try to use TextDecoder if available
    let decoder;
    try {
        decoder = new TextDecoder('utf-8');
    } catch (e) {
        console.warn('TextDecoder not supported, falling back to simple decode');
    }

    requestTask.onChunkReceived((res) => {
      let text = '';
      if (decoder) {
        text = decoder.decode(res.data, { stream: true });
      } else {
        // Fallback for older environments (might have issues with split multibyte chars)
        const uint8Arr = new Uint8Array(res.data);
        // Avoid stack overflow on large chunks
        if (uint8Arr.length < 10000) {
            try {
                text = decodeURIComponent(escape(String.fromCharCode(...uint8Arr)));
            } catch (e) {
                console.error('Decode error', e);
            }
        } else {
             console.error('Chunk too large for fallback decoder');
        }
      }
      
      if (text && onChunk) {
          onChunk(text);
      }
    });

    return requestTask;
  },

  generateCard: (userId) => request('/generate_card', 'POST', { user_id: userId }, 120000), // 生成卡片可能较慢，设置 120秒超时
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
