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

  // -------------------------------------------------------------------------
  // Lifecycle & Initialization
  // -------------------------------------------------------------------------

  onLoad(options) {
    if (options.userId) {
      this.setData({ userId: options.userId });
      this.generateCard();
    }
    // Canvas context references
    this.animationCanvas = null;
    this.animationCtx = null;
    this.dpr = 1;
    this.canvasReady = false;
  },

  onReady() {
    // 提前初始化 Canvas，确保节点可用
    this.initAnimationCanvas();
  },

  initAnimationCanvas() {
    const query = wx.createSelectorQuery();
    query.select('#destroyCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (res[0] && res[0].node) {
          this.animationCanvas = res[0].node;
          this.animationCtx = this.animationCanvas.getContext('2d');

          this.dpr = wx.getSystemInfoSync().pixelRatio;
          this.animationCanvas.width = res[0].width * this.dpr;
          this.animationCanvas.height = res[0].height * this.dpr;
          this.animationCtx.scale(this.dpr, this.dpr);

          this.canvasReady = true;
          console.log('[Canvas] Initialized successfully');
        } else {
          console.error('[Canvas] Init failed, retry in 500ms');
          setTimeout(() => {
            this.initAnimationCanvas();
          }, 500);
        }
      });
  },

  // -------------------------------------------------------------------------
  // Data & API
  // -------------------------------------------------------------------------

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

      // 降级策略：如果请求失败（如超时），使用模拟数据
      const mockData = {
        mood_tag: '焦虑 (离线)',
        encouragement: '服务器暂时无法连接，但别担心。深呼吸，试着直接粉碎这张卡片吧。',
        suggestions: [
          '检查 backend 服务是否启动 (port 8000)',
          '检查开发者工具是否开启不校验域名',
          '享受当下的宁静'
        ],
        healing_quote: '即使网络断连，生活也要继续前行。'
      };

      wx.showToast({
        title: '网络超时，启用离线模式',
        icon: 'none',
        duration: 3000
      });

      this.setData({
        loading: false,
        cardData: mockData,
        errorMsg: ''
      });
    }
  },

  // -------------------------------------------------------------------------
  // Interaction Handlers
  // -------------------------------------------------------------------------

  onFlipCard() {
    if (this.data.destroyed) return;
    this.setData({
      isFlipped: !this.data.isFlipped
    });
  },

  onTear() {
    this.triggerDestroy('tear');
  },

  onBurn() {
    this.triggerDestroy('burn');
  },

  onCrush() {
    this.triggerDestroy('crush');
  },

  // -------------------------------------------------------------------------
  // Destruction Logic (Controller)
  // -------------------------------------------------------------------------

  triggerDestroy(type) {
    if (this.data.destroyed) return;
    if (!this.canvasReady) {
      wx.showToast({ title: '资源加载中...', icon: 'loading' });
      // Try init again just in case
      this.initAnimationCanvas();
      return;
    }

    // 1. 获取卡片 DOM 位置
    const query = wx.createSelectorQuery();
    query.select('.card-container').boundingClientRect(rect => {
      if (!rect) {
        console.error('Cannot find card container rect');
        return;
      }

      // 2. 震动反馈
      wx.vibrateLong();

      // 3. 准备 Canvas 内容 (绘制静态卡片到 Canvas 上)
      // 此时 Canvas 还是 visibility: hidden，但内容会保留
      this.prepareCanvasForAnimation(rect, () => {
        // 4. 切换状态：隐藏 DOM 卡片，显示 Canvas
        this.setData({ destroyed: true }, () => {
          // 5. 执行具体动画
          setTimeout(() => {
            try {
              if (type === 'burn') {
                this.runBurnAnimation(rect);
              } else if (type === 'tear') {
                this.runTearAnimation(rect);
              } else {
                this.runExplosionAnimation(rect);
              }
            } catch (err) {
              console.error('[Animation Error]:', err);
              this.finishDestroy();
            }
          }, 50); // 给一点时间让 visibility 切换生效
        });
      });
    }).exec();
  },

  prepareCanvasForAnimation(rect, callback) {
    if (!this.animationCtx) return;

    const ctx = this.animationCtx;
    const canvas = this.animationCanvas;

    // 清空 Canvas
    const width = canvas.width / this.dpr;
    const height = canvas.height / this.dpr;
    ctx.clearRect(0, 0, width, height);

    // 计算卡片在 Canvas 中的位置 (应该居中)
    // 注意：rect.left/top 是相对于视口的，Canvas 也是全屏 absolute top:0 left:0
    // 所以直接用 rect 的坐标即可

    // 生成卡片图像
    const cardImage = this.createCardImage(rect.width, rect.height);

    // 绘制到 Canvas 上
    // 我们需要在动画开始前，Canvas 上就有一张"假"卡片，位置与 DOM 卡片完全重合
    // rect 是 .card-container 的位置
    // .card-container 居中，rect.left 应该是 (windowWidth - cardWidth) / 2

    ctx.drawImage(cardImage, rect.left, rect.top, rect.width, rect.height);

    if (callback) callback();
  },

  finishDestroy() {
    // 动画结束后的处理
    setTimeout(() => {
      wx.showToast({
        title: '焦虑已粉碎',
        icon: 'success',
        duration: 2000
      });
      // 可以在这里跳转页面或重置
    }, 500);
  },

  // -------------------------------------------------------------------------
  // Animation Implementations
  // -------------------------------------------------------------------------

  // 🔥 燃烧 (自底而上，化为灰烬)
  runBurnAnimation(rect) {
    const DURATION = 3000;
    const ctx = this.animationCtx;
    const canvas = this.animationCanvas;
    const width = canvas.width / this.dpr;
    const height = canvas.height / this.dpr;

    const cardX = rect.left;
    const cardY = rect.top;
    const cardW = rect.width;
    const cardH = rect.height;

    // 重新生成一张图用于每一帧绘制 (因为我们要 clearRect)
    const cardImage = this.createCardImage(cardW, cardH);

    let startTime = Date.now();
    const particles = [];
    const burnHoles = [];

    // 初始燃烧点
    for (let i = 0; i < 4; i++) {
      burnHoles.push({
        x: Math.random() * cardW,
        y: cardH * 0.9 + Math.random() * (cardH * 0.1),
        r: 0,
        speed: 0.3 + Math.random() * 0.4
      });
    }

    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / DURATION, 1);

      ctx.clearRect(0, 0, width, height);

      ctx.save();
      ctx.translate(cardX, cardY);

      // 1. 绘制被烧了一部分的卡片
      // 使用 destination-out 来挖洞
      // 但 Canvas 没有图层组的概念，直接 destination-out 会把整个 canvas 擦除
      // 解决方案：先在一个离屏 canvas 上画卡片 + 挖洞，然后画到主 canvas

      // 简易方案：先画卡片，再用 destination-out 画黑洞 (背景是透明的，所以会变成透明)
      // 注意：这会把背景也擦掉，如果 Canvas 下面有东西的话。这里 Canvas 下面是背景色，所以会露出背景色。
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(cardImage, 0, 0, cardW, cardH);

      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';

      burnHoles.forEach(hole => {
        const currentR = hole.r + (elapsed * 0.2 * hole.speed);
        ctx.beginPath();
        ctx.arc(hole.x, hole.y, currentR, 0, Math.PI * 2);
        ctx.fill();

        // 产生粒子逻辑 (略微简化以保证性能)
        if (progress < 1.0 && Math.random() < 0.3) {
          const angle = Math.random() * Math.PI * 2;
          const px = hole.x + Math.cos(angle) * currentR;
          const py = hole.y + Math.sin(angle) * currentR;
          // 转为全局坐标添加粒子
          particles.push({
            type: 'fire',
            x: px + cardX,
            y: py + cardY,
            vx: (Math.random() - 0.5) * 1,
            vy: -Math.random() * 3,
            size: Math.random() * 6 + 3,
            life: 0.8,
            colorR: 255, colorG: Math.floor(Math.random() * 200), colorB: 0
          });
        }
      });

      ctx.restore();

      // 2. 绘制粒子 (在全局坐标系)
      ctx.globalCompositeOperation = 'source-over'; // 恢复正常混合模式

      // 绘制粒子逻辑...
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= 0.03;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        p.x += p.vx;
        p.y += p.vy;

        if (p.type === 'fire') {
          p.size *= 0.92;
          ctx.fillStyle = `rgba(${p.colorR}, ${p.colorG}, ${p.colorB}, ${p.life})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 动态添加新的燃烧点
      if (Math.random() < 0.05 && progress < 0.8) {
        const parent = burnHoles[Math.floor(Math.random() * burnHoles.length)];
        burnHoles.push({
          x: parent.x + (Math.random() - 0.5) * 100,
          y: parent.y + (Math.random() - 0.5) * 100,
          r: 0,
          speed: 0.3 + Math.random() * 0.3
        });
      }

      if (progress < 1.0 || particles.length > 0) {
        canvas.requestAnimationFrame(animate);
      } else {
        this.finishDestroy();
      }
    };
    animate();
  },

  // ✂️ 撕碎 (碎纸机效果)
  runTearAnimation(rect) {
    const ctx = this.animationCtx;
    const canvas = this.animationCanvas;
    const width = canvas.width / this.dpr;
    const height = canvas.height / this.dpr;

    const cardX = rect.left;
    const cardY = rect.top;
    const cardW = rect.width;
    const cardH = rect.height;

    // 准备卡片图片
    const cardImage = this.createCardImage(cardW, cardH);

    const stripCount = 20;
    const stripW = cardW / stripCount;
    const strips = [];

    for (let i = 0; i < stripCount; i++) {
      strips.push({
        id: i,
        // 每个条带对应卡片图片的裁剪区域：sx, sy, sw, sh
        sx: i * stripW,
        sy: 0,
        sw: stripW,
        sh: cardH,
        // 当前绘制位置 (相对于 cardX, cardY)
        dx: i * stripW,
        dy: 0,
        vx: (Math.random() - 0.5) * 5,
        vy: 2 + Math.random() * 5,
        angle: 0,
        vr: (Math.random() - 0.5) * 0.1,
        dropDelay: i * 20 + Math.random() * 200 // 左边先掉还是右边先掉？随机一点
      });
    }

    let startTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;

      ctx.clearRect(0, 0, width, height);

      let activeStrips = 0;

      strips.forEach(strip => {
        // 检查延迟
        if (elapsed > strip.dropDelay) {
          strip.dy += strip.vy;
          strip.dx += strip.vx;
          strip.angle += strip.vr;
          strip.vy += 0.5; // 重力
        }

        // 只要还在屏幕内就算 active
        // 简单判断：dy < height
        if (cardY + strip.dy < height) {
          activeStrips++;
        }

        ctx.save();
        // 移动到条带的中心点进行旋转
        const absoluteX = cardX + strip.dx + stripW / 2;
        const absoluteY = cardY + strip.dy + cardH / 2;

        ctx.translate(absoluteX, absoluteY);
        ctx.rotate(strip.angle);

        // 绘制裁剪的卡片部分
        // drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
        // 注意：dx, dy 是相对于 translate 后的原点。原点在条带中心。
        // 条带宽高是 stripW, cardH
        ctx.drawImage(
          cardImage,
          strip.sx, strip.sy, strip.sw, strip.sh,
          -stripW / 2, -cardH / 2, strip.sw, strip.sh
        );

        ctx.restore();
      });

      if (activeStrips > 0) {
        canvas.requestAnimationFrame(animate);
      } else {
        this.finishDestroy();
      }
    };
    animate();
  },

  // 💥 粉碎 (爆炸)
  runExplosionAnimation(rect) {
    const ctx = this.animationCtx;
    const canvas = this.animationCanvas;
    const width = canvas.width / this.dpr;
    const height = canvas.height / this.dpr;

    const cardX = rect.left;
    const cardY = rect.top;
    const cardW = rect.width;
    const cardH = rect.height;

    // 爆炸粒子
    const particles = [];
    const particleCount = 100;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: cardX + cardW / 2,
        y: cardY + cardH / 2,
        vx: (Math.random() - 0.5) * 30,
        vy: (Math.random() - 0.5) * 30,
        size: Math.random() * 5 + 2,
        color: Math.random() > 0.5 ? '#FFF' : '#00FFCC',
        alpha: 1
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      let active = 0;
      particles.forEach(p => {
        if (p.alpha > 0) {
          active++;
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.5;
          p.alpha -= 0.02;

          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1;

      if (active > 0) {
        canvas.requestAnimationFrame(animate);
      } else {
        this.finishDestroy();
      }
    };
    animate();
  },

  // -------------------------------------------------------------------------
  // Canvas Helpers
  // -------------------------------------------------------------------------

  drawRoundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.arcTo(x + width, y, x + width, y + radius, radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    ctx.lineTo(x + radius, y + height);
    ctx.arcTo(x, y + height, x, y + height - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  },

  // 绘制卡片内容到离屏 Canvas (高度还原 CSS 样式)
  createCardImage(width, height) {
    // 使用离屏 Canvas 或 临时 Canvas
    const offscreen = wx.createOffscreenCanvas({ type: '2d', width: width, height: height });
    const ctx = offscreen.getContext('2d');

    // 确保比例正确
    // CSS: border 4rpx solid #00FFCC
    // 假设 750rpx 设计稿，width 对应实际 px
    const scale = width / 300; // 粗略基准

    const borderW = 2;
    const radius = 10;
    const padding = 20;

    // 1. 背景
    ctx.fillStyle = '#FFFFFF';
    // 阴影无法在离屏 canvas 完美呈现，通常作为纹理时不需要阴影，阴影由主 Canvas 控制或忽略
    this.drawRoundRect(ctx, 0, 0, width, height, radius);
    ctx.fill();

    // 2. 边框
    ctx.strokeStyle = '#00FFCC';
    ctx.lineWidth = borderW;
    this.drawRoundRect(ctx, 0, 0, width, height, radius);
    ctx.stroke();

    const cardData = this.data.cardData || {};

    // 根据翻转状态绘制
    if (this.data.isFlipped) {
      // --- 背面 ---
      const tagText = "Mood Lab 建议";
      ctx.font = `bold ${14 * scale}px sans-serif`;
      const tagMetrics = ctx.measureText(tagText);
      const tagH = 24 * scale;
      const tagW = tagMetrics.width + 20 * scale;

      // Tag
      ctx.fillStyle = '#00FFCC';
      this.drawRoundRect(ctx, width - padding - tagW, padding, tagW, tagH, 4);
      ctx.fill();

      ctx.fillStyle = '#1B262C';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tagText, width - padding - tagW + tagW / 2, padding + tagH / 2);

      // Suggestions
      ctx.fillStyle = '#555555';
      ctx.font = `${14 * scale}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      let currentY = padding + tagH + 20 * scale;
      const suggestions = cardData.suggestions || [];

      suggestions.forEach(item => {
        ctx.fillStyle = '#00FFCC';
        ctx.fillText('•', padding, currentY);
        ctx.fillStyle = '#555555';

        // 简易换行
        const textX = padding + 15 * scale;
        const maxW = width - textX - padding;
        const words = String(item).split('');
        let line = '';
        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n];
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxW && n > 0) {
            ctx.fillText(line, textX, currentY);
            line = words[n];
            currentY += 18 * scale;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line, textX, currentY);
        currentY += 24 * scale;
      });

    } else {
      // --- 正面 ---
      const tagText = cardData.mood_tag || '焦虑';
      ctx.font = `bold ${14 * scale}px sans-serif`;
      const tagMetrics = ctx.measureText(tagText);
      const tagH = 24 * scale;
      const tagW = tagMetrics.width + 20 * scale;

      // Tag
      ctx.fillStyle = '#00FFCC';
      this.drawRoundRect(ctx, width - padding - tagW, padding, tagW, tagH, 4);
      ctx.fill();

      ctx.fillStyle = '#1B262C';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tagText, width - padding - tagW + tagW / 2, padding + tagH / 2);

      // Encouragement
      ctx.fillStyle = '#333333';
      ctx.font = `bold ${20 * scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const text = cardData.encouragement || '暂无内容';
      // 简单换行处理
      const maxW = width - padding * 2;
      const words = String(text).split('');
      let line = '';
      let lines = [];
      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n];
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxW && n > 0) {
          lines.push(line);
          line = words[n];
        } else {
          line = testLine;
        }
      }
      lines.push(line);

      let textY = height / 2 - (lines.length - 1) * 15 * scale;
      lines.forEach(l => {
        ctx.fillText(l, width / 2, textY);
        textY += 30 * scale;
      });

      // Hint
      ctx.fillStyle = '#999999';
      ctx.font = `${12 * scale}px sans-serif`;
      ctx.fillText('👆 点击翻转查看建议', width / 2, textY + 10 * scale);
    }

    // Footer Quote
    const quote = `“${cardData.healing_quote || ''}”`;
    ctx.fillStyle = '#999999';
    ctx.font = `italic ${12 * scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(quote, width / 2, height - padding / 2);

    return offscreen;
  }
});
