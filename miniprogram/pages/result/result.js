const api = require('../../utils/api');

Page({
  data: {
    userId: '',
    cardData: null,
    loading: true,
    destroyed: false,
    isFlipped: false,
    showProfessionalAnalysis: false,
    errorMsg: ''
  },

  // Touch tracking state
  touchState: {
    startX: 0,
    startY: 0,
    startTime: 0,
    isMoving: false
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

  onTouchStart(e) {
    if (this.data.destroyed) return;
    const touch = e.touches[0];
    this.touchState = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: e.timeStamp,
      isMoving: true
    };
  },

  onTouchMove(e) {
    // Future: Add visual feedback (e.g. card tilt)
  },

  onTouchEnd(e) {
    if (this.data.destroyed || !this.touchState.isMoving) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - this.touchState.startX;
    const deltaY = touch.clientY - this.touchState.startY;
    const deltaTime = e.timeStamp - this.touchState.startTime;

    const dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Tap detection (short time, short distance)
    if (deltaTime < 300 && dist < 10) {
      this.onFlipCard();
      return;
    }

    // Swipe detection (distance > 50px)
    if (dist > 50) {
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        // Vertical Swipe
        if (deltaY < 0) {
          // Swipe Up -> Burn (Fire rises)
          this.triggerDestroy('burn');
        } else {
          // Swipe Down -> Tear (Tearing down)
          this.triggerDestroy('tear');
        }
      } else {
        // Horizontal Swipe -> Crush/Explode
        this.triggerDestroy('crush');
      }
    }

    this.touchState.isMoving = false;
  },

  onFlipCard() {
    if (this.data.destroyed) return;
    this.setData({
      isFlipped: !this.data.isFlipped
    });
  },

  onToggleAnalysis(e) {
    // Prevent event bubbling to avoid flipping the card
    // Note: catchtap is used in wxml, but good to be aware
    this.setData({
      showProfessionalAnalysis: !this.data.showProfessionalAnalysis
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

  // 🔥 燃烧 (随机火星扩散 + 边缘粒子 + 灰烬)
  runBurnAnimation(rect) {
    const ctx = this.animationCtx;
    const canvas = this.animationCanvas;
    // Logical dimensions
    const width = canvas.width / this.dpr;
    const height = canvas.height / this.dpr;

    const { left: cardX, top: cardY, width: cardW, height: cardH } = rect;

    // 1. Snapshot of the card
    const cardImage = this.createCardImage(cardW, cardH);

    // 2. State Initialization
    let holes = []; // {x, y, r, growthRate}
    let particles = []; // {x, y, vx, vy, life, size, color, type}

    // Initial Ignition
    const spawnHole = () => ({
      x: Math.random() * cardW,
      y: Math.random() * cardH,
      r: 0,
      growth: 0.3 + Math.random() * 0.5
    });

    const initialPoints = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < initialPoints; i++) holes.push(spawnHole());

    let startTime = Date.now();
    const MAX_DURATION = 4000;
    const FADE_OUT_DURATION = 500;

    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const isBurning = elapsed < MAX_DURATION;

      // Clear
      ctx.clearRect(0, 0, width, height);

      // --- Logic Update ---
      if (isBurning) {
        // Grow holes
        holes.forEach(h => {
          h.r += h.growth + (Math.random() - 0.2) * 0.5;
        });

        // Spawn new holes
        if (elapsed < 3000 && Math.random() < 0.05) holes.push(spawnHole());

        // Spawn Particles
        holes.forEach(h => this.spawnParticles(h, cardW, cardH, cardX, cardY, particles));
      }

      // Update Particles
      this.updateParticles(particles, isBurning, now);

      // --- Drawing ---
      ctx.save();
      ctx.translate(cardX, cardY);

      // Fade out card residue
      let cardAlpha = isBurning ? 1 : Math.max(0, 1 - (elapsed - MAX_DURATION) / FADE_OUT_DURATION);

      if (cardAlpha > 0) {
        ctx.globalAlpha = cardAlpha;

        // Layer 1: Card
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(cardImage, 0, 0, cardW, cardH);

        // Layer 2: Glowing Edge (source-atop)
        ctx.globalCompositeOperation = 'source-atop';
        holes.forEach(h => {
          if (h.r <= 0) return;
          const g = ctx.createRadialGradient(h.x, h.y, h.r, h.x, h.y, h.r + 30);
          g.addColorStop(0, 'rgba(255, 100, 0, 0.9)');
          g.addColorStop(0.3, 'rgba(100, 20, 0, 0.8)');
          g.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(h.x, h.y, h.r + 30, 0, Math.PI * 2);
          ctx.fill();
        });

        // Layer 3: Cut holes (destination-out)
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 1; // Force full transparency for the cut
        ctx.fillStyle = 'black';
        holes.forEach(h => {
          if (h.r <= 0) return;
          ctx.beginPath();
          ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      ctx.restore();

      // Layer 4: Particles
      this.drawParticles(ctx, particles);

      // Loop or Finish
      const hardStop = elapsed > (MAX_DURATION + FADE_OUT_DURATION + 1000);
      if (!hardStop && (isBurning || particles.length > 0 || cardAlpha > 0)) {
        canvas.requestAnimationFrame(animate);
      } else {
        this.finishDestroy();
      }
    };
    animate();
  },

  spawnParticles(hole, cardW, cardH, cardX, cardY, particles) {
    const circumference = 2 * Math.PI * hole.r;
    if (Math.random() >= 0.4) return;

    const count = Math.ceil(circumference / 50);
    for (let k = 0; k < count; k++) {
      if (Math.random() > 0.2) continue;

      const angle = Math.random() * Math.PI * 2;
      const edgeX = hole.x + Math.cos(angle) * hole.r;
      const edgeY = hole.y + Math.sin(angle) * hole.r;

      if (edgeX > -10 && edgeX < cardW + 10 && edgeY > -10 && edgeY < cardH + 10) {
        const pX = cardX + edgeX;
        const pY = cardY + edgeY;

        particles.push({
          type: 'spark',
          x: pX, y: pY,
          vx: (Math.random() - 0.5) * 2,
          vy: -1 - Math.random() * 3,
          life: 0.5 + Math.random() * 0.5,
          size: 1 + Math.random() * 3,
          color: `255, ${Math.floor(Math.random() * 200)}, 0`
        });

        if (Math.random() < 0.2) {
          particles.push({
            type: 'ash',
            x: pX, y: pY,
            vx: (Math.random() - 0.5) * 1,
            vy: -0.5 - Math.random() * 1.5,
            life: 1.0 + Math.random(),
            size: 2 + Math.random() * 2,
            color: '80, 80, 80'
          });
        }
      }
    }
  },

  updateParticles(particles, isBurning, now) {
    const decay = isBurning ? 0.02 : 0.05;
    for (let i = particles.length - 1; i >= 0; i--) {
      let p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= decay;

      if (p.type === 'spark') {
        p.vy *= 0.95; p.size *= 0.95;
      } else if (p.type === 'ash') {
        p.x += Math.sin(now / 200 + p.y * 0.01) * 0.5;
        p.alpha = p.life;
      }
      if (p.life <= 0 || p.size <= 0.1) particles.splice(i, 1);
    }
  },

  drawParticles(ctx, particles) {
    ctx.globalCompositeOperation = 'source-over';
    particles.forEach(p => {
      const alpha = Math.max(0, p.life);
      ctx.fillStyle = `rgba(${p.color}, ${alpha})`;
      if (p.type === 'spark') {
        ctx.shadowBlur = 5;
        ctx.shadowColor = `rgba(${p.color}, ${alpha})`;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.shadowBlur = 0;
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
    const offscreen = wx.createOffscreenCanvas({ type: '2d', width: width, height: height });
    const ctx = offscreen.getContext('2d');

    // 1. 计算 rpx 转换比例
    // CSS 中 .card-container width: 80%
    // width (px) = windowWidth * 0.8
    // 1rpx = windowWidth / 750
    // => 1rpx = (width / 0.8) / 750 px
    const rpx = (val) => val * (width / 0.8 / 750);

    const borderW = rpx(4);
    const radius = rpx(20);
    const padding = rpx(40);

    // 2. 绘制卡片容器 (背景 & 边框)
    // 根据翻转状态设置背景色
    ctx.fillStyle = this.data.isFlipped ? '#F0FFF0' : '#FFFFFF';

    // 绘制圆角矩形背景
    this.drawRoundRect(ctx, 0, 0, width, height, radius);
    ctx.fill();

    // 绘制边框
    ctx.strokeStyle = '#00FFCC';
    ctx.lineWidth = borderW;
    this.drawRoundRect(ctx, 0, 0, width, height, radius);
    ctx.stroke();

    const cardData = this.data.cardData || {};

    // 3. 绘制内容
    if (this.data.isFlipped) {
      // ==================== 背面 (Back) ====================

      // --- Header Area ---
      // Flex: space-between. Left: Toggle Btn, Right: Tag
      const headerY = padding;

      // Fixed Heights based on WXSS font + padding
      // Tag: 28rpx font + 10rpx top + 10rpx bottom = 48rpx
      const tagH = rpx(48);
      // Toggle: 24rpx font + 10rpx top + 10rpx bottom = 44rpx
      const toggleH = rpx(44);

      // Max header height for layout
      const headerHeight = Math.max(tagH, toggleH);

      // 1. Toggle Button (Left)
      // WXSS: padding: 10rpx 24rpx, border: 1rpx solid #00FFCC, radius: 30rpx
      // Font: 24rpx bold #1B262C, BG: rgba(0, 255, 204, 0.3)
      const toggleText = this.data.showProfessionalAnalysis ? '返回简略' : '深度分析';
      ctx.font = `bold ${rpx(24)}px sans-serif`;
      const toggleMetrics = ctx.measureText(toggleText);
      const togglePaddingX = rpx(24);
      const toggleW = toggleMetrics.width + togglePaddingX * 2;

      // Center Toggle Button vertically relative to the tallest element (Tag)
      const toggleY = headerY + (headerHeight - toggleH) / 2;

      ctx.fillStyle = 'rgba(0, 255, 204, 0.3)';
      // Radius should not exceed half height
      this.drawRoundRect(ctx, padding, toggleY, toggleW, toggleH, toggleH / 2);
      ctx.fill();
      ctx.lineWidth = rpx(1);
      ctx.strokeStyle = '#00FFCC';
      ctx.stroke(); // border

      ctx.fillStyle = '#1B262C';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Adjust text Y to be exactly center of button
      ctx.fillText(toggleText, padding + toggleW / 2, toggleY + toggleH / 2);

      // 2. Tag (Right)
      // WXSS: padding: 10rpx 20rpx, BG: #00FFCC, radius: 10rpx
      // Font: 28rpx bold #1B262C
      const tagText = this.data.showProfessionalAnalysis ? '专业解读' : 'Mood Lab 建议';
      ctx.font = `bold ${rpx(28)}px sans-serif`;
      const tagMetrics = ctx.measureText(tagText);
      const tagPaddingX = rpx(20);
      const tagW = tagMetrics.width + tagPaddingX * 2;

      // Align right
      const tagX = width - padding - tagW;
      // Center Tag vertically (though it is the tallest, so it's just headerY)
      const tagY = headerY + (headerHeight - tagH) / 2;

      ctx.fillStyle = '#00FFCC';
      this.drawRoundRect(ctx, tagX, tagY, tagW, tagH, rpx(10));
      ctx.fill();

      ctx.fillStyle = '#1B262C';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tagText, tagX + tagW / 2, tagY + tagH / 2);

      // --- Body Area ---
      // margin: 20rpx 0
      const bodyMarginTop = rpx(20);
      const bodyY = headerY + headerHeight + bodyMarginTop;
      const footerH = rpx(60); // Estimate footer height (quote area)
      const bodyH = height - bodyY - footerH - padding; // Remaining height

      // Save context for clipping
      ctx.save();
      ctx.beginPath();
      ctx.rect(padding, bodyY, width - padding * 2, bodyH);
      ctx.clip();

      if (this.data.showProfessionalAnalysis) {
        // --- Professional Analysis ---
        // Font: 28rpx #444, line-height 1.8
        const analysisText = cardData.professional_analysis || '暂无深度分析内容。';
        ctx.font = `${rpx(28)}px sans-serif`;
        ctx.fillStyle = '#444444';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const lineHeight = rpx(28) * 1.8;
        this.wrapText(ctx, analysisText, padding, bodyY, width - padding * 2, lineHeight);

      } else {
        // --- Suggestion List ---
        // CSS .card-body { justify-content: center; } -> Vertically centered

        const suggestions = cardData.suggestions || [];
        ctx.font = `${rpx(30)}px sans-serif`;
        const lineHeight = rpx(30) * 1.5;
        const itemSpacing = rpx(20);

        // 1. Calculate total height first
        let totalContentH = 0;
        const suggestionsLayout = suggestions.map(item => {
          const textX = padding + rpx(30);
          const maxW = width - textX - padding;
          const lines = this.getWrappedLines(ctx, item, maxW);
          const h = lines.length * lineHeight;
          totalContentH += h;
          return { item, lines, h };
        });

        if (suggestions.length > 0) {
          totalContentH += (suggestions.length - 1) * itemSpacing;
        }

        // 2. Determine start Y for centering
        // bodyY is the top of the body area
        // bodyH is the height of the body area
        let currentY = bodyY + (bodyH - totalContentH) / 2;

        // Ensure we don't start above bodyY (if content is too long)
        if (currentY < bodyY) currentY = bodyY;

        // 3. Draw
        suggestionsLayout.forEach((layout, index) => {
          // Draw Bullet
          ctx.fillStyle = '#00FFCC';
          ctx.font = `bold ${rpx(30)}px sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText('•', padding, currentY);

          // Draw Text
          ctx.fillStyle = '#555555';
          ctx.font = `${rpx(30)}px sans-serif`;

          const textX = padding + rpx(30);

          layout.lines.forEach(line => {
            ctx.fillText(line, textX, currentY);
            currentY += lineHeight;
          });

          if (index < suggestions.length - 1) {
            currentY += itemSpacing;
          }
        });
      }

      ctx.restore();

    } else {
      // ==================== 正面 (Front) ====================

      // 1. Tag (Top Right)
      const tagText = cardData.mood_tag || '焦虑';
      ctx.font = `bold ${rpx(28)}px sans-serif`;
      const tagMetrics = ctx.measureText(tagText);
      const tagPaddingX = rpx(20);
      const tagPaddingY = rpx(10);
      const tagW = tagMetrics.width + tagPaddingX * 2;
      const tagH = rpx(28) + tagPaddingY * 2;

      const tagX = width - padding - tagW;
      const tagY = padding;

      ctx.fillStyle = '#00FFCC';
      this.drawRoundRect(ctx, tagX, tagY, tagW, tagH, rpx(10));
      ctx.fill();

      ctx.fillStyle = '#1B262C';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tagText, tagX + tagW / 2, tagY + tagH / 2);

      // 2. Encouragement (Center)
      // Font: 40rpx bold #333, line-height 1.4
      const mainText = cardData.encouragement || '暂无内容';
      ctx.font = `bold ${rpx(40)}px sans-serif`;
      ctx.fillStyle = '#333333';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const lineHeight = rpx(40) * 1.4;
      // Calculate total height of text to center it vertically
      const maxW = width - padding * 2;
      const lines = this.getWrappedLines(ctx, mainText, maxW);
      const totalTextH = lines.length * lineHeight;

      let startY = (height - totalTextH) / 2;

      lines.forEach(line => {
        ctx.fillText(line, width / 2, startY + lineHeight / 2); // textBaseline middle
        startY += lineHeight;
      });

      // 3. Hint (Below text)
      // Font: 24rpx #999, margin-top 20rpx
      ctx.font = `${rpx(24)}px sans-serif`;
      ctx.fillStyle = '#999999';
      ctx.fillText('👆 点击翻转查看建议', width / 2, startY + rpx(20));
    }

    // ==================== Footer (Common) ====================
    // Font: 24rpx italic #999
    const quote = `“${cardData.healing_quote || ''}”`;
    ctx.fillStyle = '#999999';
    ctx.font = `italic ${rpx(24)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(quote, width / 2, height - padding / 2);

    return offscreen;
  },

  // Helper: Wrap text and draw
  // Returns the next Y position
  wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const lines = this.getWrappedLines(ctx, text, maxWidth);
    lines.forEach(line => {
      ctx.fillText(line, x, y);
      y += lineHeight;
    });
    return y;
  },

  // Helper: Get lines array
  getWrappedLines(ctx, text, maxWidth) {
    const words = String(text).split('');
    let lines = [];
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const testLine = currentLine + word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine !== '') {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);
    return lines;
  }
});
