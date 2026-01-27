const api = require('../../utils/api');

Page({
  data: {
    userId: '',
    cardData: null,
    loading: true,
    destroyed: false,
    isDestroying: false, // Replaces 'destroyed' for UI visibility control
    interactionMode: 'none', // 'none', 'burn', 'tear', 'crush'
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

  // Animation/Interaction State
  animState: {
    cardRect: null, // {left, top, width, height}
    cardImage: null,
    rafId: null,
    // Burn specific
    burnHoles: [], // {x, y, r, growth}
    burnParticles: [],
    // Tear specific
    tearPath: [], // Array of points
    tearPolygons: [], // Array of polygons (points)
    tearShards: [], // Falling pieces
    // Crush specific
    crushCount: 0, // 0-4
    crushOffset: { x: 0, y: 0 },
    crushScale: 1,
    crushVelocity: { x: 0, y: 0 },
    isThrown: false
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
  // Interaction Handlers (Touch & Button)
  // -------------------------------------------------------------------------

  // DOM Card Touch (Only active before destroy mode)
  onFlipCard() {
    if (this.data.isDestroying || this.data.destroyed) return;
    this.setData({
      isFlipped: !this.data.isFlipped
    });
  },

  onToggleAnalysis() {
    this.setData({
      showProfessionalAnalysis: !this.data.showProfessionalAnalysis
    });
  },

  // Canvas Touch Handlers (Active during destroy mode)
  onCanvasTouchStart(e) {
    if (!this.data.isDestroying) return;
    const touch = e.touches[0];
    // Adjust touch coordinates to be relative to canvas/card if needed
    // But since canvas is full screen overlay, clientX/Y is fine usually
    // However, our logic might depend on card-relative coords.

    // Store global touch state
    this.touchState = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: e.timeStamp,
      isMoving: true,
      lastX: touch.clientX,
      lastY: touch.clientY
    };

    if (this.data.interactionMode === 'burn') {
      this.handleBurnTap(touch.clientX, touch.clientY);
    } else if (this.data.interactionMode === 'crush') {
      if (this.animState.crushCount < 4) {
        this.handleCrushTap();
      } else {
        // Prepare to drag
        this.animState.crushOffset.startX = this.animState.crushOffset.x;
        this.animState.crushOffset.startY = this.animState.crushOffset.y;
      }
    } else if (this.data.interactionMode === 'tear') {
      // Start a cut line
      this.animState.tearPath = [{ x: touch.clientX, y: touch.clientY }];
    }
  },

  onCanvasTouchMove(e) {
    if (!this.data.isDestroying || !this.touchState.isMoving) return;
    const touch = e.touches[0];

    if (this.data.interactionMode === 'crush' && this.animState.crushCount >= 4) {
      // Dragging the ball
      const dx = touch.clientX - this.touchState.startX;
      const dy = touch.clientY - this.touchState.startY;
      this.animState.crushOffset.x = this.animState.crushOffset.startX + dx;
      this.animState.crushOffset.y = this.animState.crushOffset.startY + dy;
      // Update last position for velocity calc
      this.touchState.lastX = touch.clientX;
      this.touchState.lastY = touch.clientY;
      this.touchState.lastTime = e.timeStamp;
    } else if (this.data.interactionMode === 'tear') {
      // Extend cut line
      this.animState.tearPath.push({ x: touch.clientX, y: touch.clientY });
      // Visual feedback handled in animation loop
    }
  },

  onCanvasTouchEnd(e) {
    if (!this.data.isDestroying) return;
    const touch = e.changedTouches[0];

    if (this.data.interactionMode === 'crush' && this.animState.crushCount >= 4) {
      // Throw logic
      const now = e.timeStamp;
      const dt = now - (this.touchState.lastTime || this.touchState.startTime);
      const dist = Math.sqrt(
        Math.pow(touch.clientX - this.touchState.lastX, 2) +
        Math.pow(touch.clientY - this.touchState.lastY, 2)
      );
      const speed = dist / (dt || 1); // px per ms

      if (speed > 0.5) { // Threshold to throw
        const angle = Math.atan2(
          touch.clientY - this.touchState.lastY,
          touch.clientX - this.touchState.lastX
        );
        this.animState.crushVelocity = {
          x: Math.cos(angle) * speed * 20, // Amplify
          y: Math.sin(angle) * speed * 20
        };
        this.animState.isThrown = true;
      }
    } else if (this.data.interactionMode === 'tear') {
      // Finalize cut
      this.animState.tearPath.push({ x: touch.clientX, y: touch.clientY });
      this.handleTearCut(this.animState.tearPath);
      this.animState.tearPath = []; // Clear
    }

    this.touchState.isMoving = false;
  },

  // Button Handlers
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
      this.initAnimationCanvas();
      return;
    }

    const query = wx.createSelectorQuery();
    query.select('.card-container').boundingClientRect(rect => {
      if (!rect) return;

      wx.vibrateShort();

      // Initialize Animation State
      this.animState = {
        cardRect: rect,
        cardImage: null, // Will be created in prepare
        rafId: null,
        burnHoles: [],
        burnParticles: [],
        tearPath: [],
        tearPolygons: [], // Start with one rect
        tearShards: [],
        crushCount: 0,
        crushOffset: { x: 0, y: 0 },
        crushScale: 1,
        crushVelocity: { x: 0, y: 0 },
        isThrown: false
      };

      // For tear mode, initial polygon is the card rect
      if (type === 'tear') {
        this.animState.tearPolygons = [[
          { x: rect.left, y: rect.top },
          { x: rect.left + rect.width, y: rect.top },
          { x: rect.left + rect.width, y: rect.top + rect.height },
          { x: rect.left, y: rect.top + rect.height }
        ]];
      }

      this.prepareCanvasForAnimation(rect, () => {
        this.setData({
          isDestroying: true,
          interactionMode: type
        }, () => {
          // Start the Loop
          if (type === 'burn') this.startBurnLoop();
          else if (type === 'crush') this.startCrushLoop();
          else if (type === 'tear') this.startTearLoop();
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

  // -------------------------------------------------------------------------
  // Burn Mode Implementation
  // -------------------------------------------------------------------------

  handleBurnTap(x, y) {
    const rect = this.animState.cardRect;
    // 检查是否点在卡片区域内 (扩大一点点击范围)
    if (x < rect.left - 20 || x > rect.left + rect.width + 20 ||
      y < rect.top - 20 || y > rect.top + rect.height + 20) {
      return;
    }

    // 添加新的燃烧点 (Global Coordinates)
    this.animState.burnHoles.push({
      x: x,
      y: y,
      r: 1, // 初始半径
      growth: 0.5 + Math.random() * 0.5, // 生长速度
      maxR: Math.max(rect.width, rect.height) * 1.5 // 最大半径限制
    });

    // 立即产生一些火星反馈 (增加数量和大小)
    for (let i = 0; i < 8; i++) {
      this.animState.burnParticles.push({
        type: 'spark',
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5,
        life: 0.5 + Math.random() * 0.5,
        size: 3 + Math.random() * 5, // Larger sparks
        color: `255, ${Math.floor(Math.random() * 200)}, 0`
      });
    }
  },

  startBurnLoop() {
    const ctx = this.animationCtx;
    const canvas = this.animationCanvas;
    const width = canvas.width / this.dpr;
    const height = canvas.height / this.dpr;
    const rect = this.animState.cardRect;

    // 确保卡片图片已生成
    if (!this.animState.cardImage) {
      this.animState.cardImage = this.createCardImage(rect.width, rect.height);
    }

    // Create an offscreen canvas for glow composition to avoid overlapping artifact
    if (!this.animState.glowCanvas) {
      const off = wx.createOffscreenCanvas({ type: '2d', width: width * this.dpr, height: height * this.dpr });
      this.animState.glowCanvas = off;
      this.animState.glowCtx = off.getContext('2d');
      this.animState.glowCtx.scale(this.dpr, this.dpr);
    }

    this.animState.burnStartTime = Date.now();

    const loop = () => {
      if (!this.data.isDestroying || this.data.interactionMode !== 'burn') return;

      // 1. Update State
      this.updateBurnState(rect);

      // 2. Draw Frame
      ctx.clearRect(0, 0, width, height);
      this.drawBurnFrame(ctx, width, height, rect);

      // 3. Check Completion
      const elapsed = Date.now() - this.animState.burnStartTime;
      if (this.checkBurnCompletion(rect, elapsed)) {
        // 稍微延迟结束，让用户看到最后的效果
        if (!this.finishingDestroy) {
          this.finishingDestroy = true;
          // Fade out effect
          let fadeAlpha = 1.0;
          const fadeLoop = () => {
            fadeAlpha -= 0.05; // 0.5s approx
            if (fadeAlpha <= 0) {
              ctx.clearRect(0, 0, width, height);
              this.finishDestroy();
              return;
            }
            ctx.clearRect(0, 0, width, height);
            // Pass alpha to drawBurnFrame to ensure holes are cut correctly
            this.drawBurnFrame(ctx, width, height, rect, fadeAlpha);
            canvas.requestAnimationFrame(fadeLoop);
          };
          canvas.requestAnimationFrame(fadeLoop);
          return; // Stop main loop
        }
      }

      if (!this.finishingDestroy) {
        this.animState.rafId = canvas.requestAnimationFrame(loop);
      }
    };

    this.animState.rafId = canvas.requestAnimationFrame(loop);
  },

  updateBurnState(rect) {
    const holes = this.animState.burnHoles;
    const particles = this.animState.burnParticles;

    // Grow holes
    holes.forEach(h => {
      if (h.r < h.maxR) {
        h.r += h.growth;
        // 随着半径变大，生长稍微变慢
        if (h.r > 50) h.growth *= 0.995;
      }

      // 在边缘产生粒子
      const circumference = 2 * Math.PI * h.r;
      // 每一帧产生的粒子数量与周长成正比，但要限制上限
      // Increase particle count for more intense fire (1.3x)
      const particleCount = Math.floor(circumference / 10 * 1.3);

      if (Math.random() < 0.4) {
        for (let i = 0; i < particleCount; i++) {
          if (Math.random() > 0.15) continue;

          const angle = Math.random() * Math.PI * 2;
          const px = h.x + Math.cos(angle) * h.r;
          const py = h.y + Math.sin(angle) * h.r;

          // 只有在卡片范围内的边缘才产生粒子
          if (px > rect.left && px < rect.left + rect.width &&
            py > rect.top && py < rect.top + rect.height) {

            const pType = Math.random();
            // 10% Ash, 40% Spark, 50% Flame
            if (pType < 0.1) {
              // Ash (Drift Left)
              particles.push({
                type: 'ash',
                x: px, y: py,
                vx: -1 - Math.random() * 2, // Drift Left
                vy: -0.5 - Math.random() * 1.5,
                life: 1.0 + Math.random(),
                size: 2 + Math.random() * 2,
                color: '80, 80, 80'
              });
            } else if (pType < 0.5) {
              // Spark
              particles.push({
                type: 'spark',
                x: px, y: py,
                vx: (Math.random() - 0.5) * 2,
                vy: -1 - Math.random() * 3, // Up
                life: 0.5 + Math.random() * 0.5,
                size: 1 + Math.random() * 2,
                color: `255, ${Math.floor(Math.random() * 200)}, 0`
              });
            } else {
              // Flame (Intense, Upward)
              particles.push({
                type: 'flame',
                x: px, y: py,
                vx: (Math.random() - 0.5) * 1,
                vy: -3 - Math.random() * 4, // Fast Up
                life: 0.3 + Math.random() * 0.4,
                size: (4 + Math.random() * 6) * 1.5, // 1.5x size
                color: `255, ${100 + Math.floor(Math.random() * 100)}, 0` // Orange/Yellow
              });
            }
          }
        }
      }
    });

    // Update Particles
    this.updateParticles(particles, true, Date.now());
  },

  drawBurnFrame(ctx, canvasW, canvasH, rect, opacity = 1.0) {
    const holes = this.animState.burnHoles;
    const particles = this.animState.burnParticles;
    const cardImage = this.animState.cardImage;

    ctx.save();

    // Layer 1: Card
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = opacity;
    ctx.drawImage(cardImage, rect.left, rect.top, rect.width, rect.height);

    // IMPORTANT: Reset alpha to 1.0 before cutting holes
    ctx.globalAlpha = 1.0;

    // Layer 2: Holes (Destination-Out) -> Dig holes in the card
    ctx.globalCompositeOperation = 'destination-out';
    holes.forEach(h => {
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // Layer 3: Edge Glow (Source-Atop) -> Only on card pixels
    // To prevent overlap accumulation, we draw all glows onto an offscreen canvas first
    // then draw that offscreen canvas onto the main canvas with source-atop.
    if (this.animState.glowCtx) {
      const gCtx = this.animState.glowCtx;
      gCtx.clearRect(0, 0, canvasW, canvasH);

      // Draw all glow circles to offscreen
      // Use 'lighter' to blend them nicely together into a unified fire ring?
      // Or just 'source-over' to have a flat color? 
      // User complained about "colors overlap and accumulate". 
      // If we use source-over, they will just merge into a flat shape.
      gCtx.globalCompositeOperation = 'source-over';

      holes.forEach(h => {
        const g = gCtx.createRadialGradient(h.x, h.y, h.r, h.x, h.y, h.r + 20);
        g.addColorStop(0, 'rgba(255, 60, 0, 0.9)');
        g.addColorStop(0.4, 'rgba(255, 120, 0, 0.6)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');

        gCtx.fillStyle = g;
        gCtx.beginPath();
        gCtx.arc(h.x, h.y, h.r + 20, 0, Math.PI * 2);
        gCtx.fill();
      });

      // Now draw the composed glow onto the main canvas
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = opacity;
      ctx.drawImage(this.animState.glowCanvas, 0, 0, canvasW, canvasH);
    } else {
      // Fallback if offscreen not available
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = opacity;
      holes.forEach(h => {
        const g = ctx.createRadialGradient(h.x, h.y, h.r, h.x, h.y, h.r + 15);
        g.addColorStop(0, 'rgba(255, 50, 0, 1)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r + 15, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    ctx.restore();

    // Layer 4: Particles (Overlay)
    // Draw flames with 'lighter' for intense look
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = opacity;
    particles.forEach(p => {
      if (p.type === 'ash') return; // Draw ash normally later

      const alpha = Math.max(0, p.life);
      ctx.fillStyle = `rgba(${p.color}, ${alpha})`;
      ctx.shadowBlur = p.type === 'flame' ? 10 : 5;
      ctx.shadowColor = `rgba(${p.color}, ${alpha})`;

      ctx.beginPath();
      if (p.type === 'flame') {
        // Draw flame shape (teardrop)
        ctx.moveTo(p.x, p.y - p.size);
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI);
        ctx.lineTo(p.x, p.y - p.size);
      } else {
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      }
      ctx.fill();
    });
    ctx.restore();

    // Draw Ash (Normal blend)
    ctx.save();
    ctx.globalAlpha = opacity;
    particles.forEach(p => {
      if (p.type !== 'ash') return;
      const alpha = Math.max(0, p.life);
      ctx.fillStyle = `rgba(${p.color}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  },

  checkBurnCompletion(rect, elapsed) {
    // 1. Time limit check (10s)
    if (elapsed && elapsed > 10000) {
      return true;
    }

    // 面积启发式算法
    // 计算所有洞的面积总和 (不考虑重叠，作为近似)
    // 如果总面积 > 卡片面积 * 1.5 (考虑重叠系数)，则认为烧完了

    let totalHoleArea = 0;
    this.animState.burnHoles.forEach(h => {
      totalHoleArea += Math.PI * h.r * h.r;
    });

    const cardArea = rect.width * rect.height;

    // 阈值：1.5倍卡片面积 (用户要求剩下面积 < 10%，即烧掉 90%。考虑到圆的重叠，1.5倍是个保守估计)
    // 可以根据体验调整
    return totalHoleArea > cardArea * 1.5;
  },

  // -------------------------------------------------------------------------
  // Crush Mode Implementation
  // -------------------------------------------------------------------------

  handleCrushTap() {
    if (this.animState.crushCount < 4) {
      this.animState.crushCount++;
      wx.vibrateShort();
    }
  },

  startCrushLoop() {
    const ctx = this.animationCtx;
    const canvas = this.animationCanvas;
    const width = canvas.width / this.dpr;
    const height = canvas.height / this.dpr;
    const rect = this.animState.cardRect;

    if (!this.animState.cardImage) {
      this.animState.cardImage = this.createCardImage(rect.width, rect.height);
    }

    // Initialize state vars
    this.animState.currentScale = 1;

    const loop = () => {
      if (!this.data.isDestroying || this.data.interactionMode !== 'crush') return;

      this.updateCrushState();

      ctx.clearRect(0, 0, width, height);
      this.drawCrushFrame(ctx, rect);

      // Check finish
      if (this.animState.isThrown && this.animState.currentScale < 0.2) {
        this.finishDestroy();
        return;
      }

      this.animState.rafId = canvas.requestAnimationFrame(loop);
    };
    this.animState.rafId = canvas.requestAnimationFrame(loop);
  },

  updateCrushState() {
    // 1. Handle Crumpling (Scale down based on count)
    const targetScales = [1.0, 0.8, 0.6, 0.4, 0.3];
    const target = targetScales[this.animState.crushCount];

    if (this.animState.isThrown) {
      // Move by velocity
      this.animState.crushOffset.x += this.animState.crushVelocity.x;
      this.animState.crushOffset.y += this.animState.crushVelocity.y;

      // Shrink as it goes "deep" into screen
      this.animState.currentScale *= 0.95;

      // Add some gravity?
      this.animState.crushVelocity.y += 1;

    } else {
      // Lerp to crumple state
      const diff = target - this.animState.currentScale;
      if (Math.abs(diff) > 0.001) {
        this.animState.currentScale += diff * 0.1;
      }
    }
  },

  drawCrushFrame(ctx, rect) {
    const scale = this.animState.currentScale;
    const offset = this.animState.crushOffset;

    const cx = rect.left + rect.width / 2 + offset.x;
    const cy = rect.top + rect.height / 2 + offset.y;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    // Draw Card centered at 0,0
    ctx.drawImage(
      this.animState.cardImage,
      -rect.width / 2, -rect.height / 2,
      rect.width, rect.height
    );

    // Draw "wrinkles" overlay if crumpled
    if (this.animState.crushCount > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(0, 0, 0, ${this.animState.crushCount * 0.1})`;
      ctx.fillRect(-rect.width / 2, -rect.height / 2, rect.width, rect.height);

      // Draw some random lines
      ctx.strokeStyle = `rgba(0,0,0, ${this.animState.crushCount * 0.15})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-rect.width / 3, -rect.height / 3);
      ctx.lineTo(rect.width / 3, rect.height / 4);
      ctx.moveTo(rect.width / 4, -rect.height / 2);
      ctx.lineTo(-rect.width / 4, rect.height / 3);
      ctx.stroke();
    }

    ctx.restore();
  },

  // -------------------------------------------------------------------------
  // Tear Mode Implementation
  // -------------------------------------------------------------------------

  handleTearCut(path) {
    if (path.length < 2) return;
    const p1 = path[0];
    const p2 = path[path.length - 1];

    // Check line length
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    if (dx * dx + dy * dy < 100) return; // Too short

    const newPolygons = [];
    let cutOccurred = false;

    // Try to cut each existing polygon
    this.animState.tearPolygons.forEach(poly => {
      const result = this.splitPolygon(poly, p1, p2);
      if (result) {
        cutOccurred = true;
        // Result has 2 polys. Identify smaller one to be shard.
        const area0 = this.getPolygonArea(result[0]);
        const area1 = this.getPolygonArea(result[1]);

        let shard, keep;
        if (area0 < area1) { shard = result[0]; keep = result[1]; }
        else { shard = result[1]; keep = result[0]; }

        // Add 'keep' back to main list
        newPolygons.push(keep);

        // Create shard object
        const center = this.getPolygonCenter(shard);
        // Velocity based on swipe direction (normal to cut?)
        // Or just gravity + random
        this.animState.tearShards.push({
          vertices: shard.map(v => ({ x: v.x - center.x, y: v.y - center.y })), // Relative
          x: center.x,
          y: center.y,
          originX: center.x, // Store original center for texture mapping
          originY: center.y,
          vx: (Math.random() - 0.5) * 5,
          vy: 2 + Math.random() * 5,
          angle: 0,
          vAngle: (Math.random() - 0.5) * 0.2
        });
        wx.vibrateShort();
      } else {
        newPolygons.push(poly);
      }
    });

    this.animState.tearPolygons = newPolygons;
  },

  startTearLoop() {
    const ctx = this.animationCtx;
    const canvas = this.animationCanvas;
    const width = canvas.width / this.dpr;
    const height = canvas.height / this.dpr;
    const rect = this.animState.cardRect;

    if (!this.animState.cardImage) {
      this.animState.cardImage = this.createCardImage(rect.width, rect.height);
    }

    const loop = () => {
      if (!this.data.isDestroying || this.data.interactionMode !== 'tear') return;

      this.updateTearState(height);

      ctx.clearRect(0, 0, width, height);
      this.drawTearFrame(ctx, rect);

      // Check remaining area
      let totalArea = 0;
      if (this.animState.tearPolygons.length > 0) {
        totalArea = this.animState.tearPolygons.reduce((sum, poly) => sum + this.getPolygonArea(poly), 0);
        const originalArea = rect.width * rect.height;

        if (totalArea < originalArea * 0.3) {
          // Convert remaining polygons to shards (Final Fall)
          this.animState.tearPolygons.forEach(poly => {
            const center = this.getPolygonCenter(poly);
            this.animState.tearShards.push({
              vertices: poly.map(v => ({ x: v.x - center.x, y: v.y - center.y })),
              x: center.x,
              y: center.y,
              originX: center.x,
              originY: center.y,
              vx: (Math.random() - 0.5) * 5,
              vy: 5 + Math.random() * 5,
              angle: 0,
              vAngle: (Math.random() - 0.5) * 0.2
            });
          });
          this.animState.tearPolygons = []; // Clear main polygons
        }
      }

      // Check finish condition: No polygons left AND no shards left on screen
      if (this.animState.tearPolygons.length === 0 && this.animState.tearShards.length === 0) {
        this.finishDestroy();
        return;
      }

      this.animState.rafId = canvas.requestAnimationFrame(loop);
    };
    this.animState.rafId = canvas.requestAnimationFrame(loop);
  },

  updateTearState(canvasHeight) {
    // Update shards
    for (let i = this.animState.tearShards.length - 1; i >= 0; i--) {
      const s = this.animState.tearShards[i];
      s.x += s.vx;
      s.y += s.vy;
      s.angle += s.vAngle;
      s.vy += 0.5; // Gravity

      // Remove if out of screen
      if (s.y > canvasHeight + 100) {
        this.animState.tearShards.splice(i, 1);
      }
    }
  },

  drawTearFrame(ctx, rect) {
    const cardImage = this.animState.cardImage;

    // 1. Draw remaining polygons
    this.animState.tearPolygons.forEach(poly => {
      ctx.save();
      // Clip to polygon
      ctx.beginPath();
      poly.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.clip();

      // Draw original card (it will only show inside clip)
      ctx.drawImage(cardImage, rect.left, rect.top, rect.width, rect.height);

      // Optional: Draw cut edge?
      // Hard to identify which edge is cut.
      ctx.restore();
    });

    // 2. Draw Shards
    this.animState.tearShards.forEach(s => {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);

      ctx.beginPath();
      s.vertices.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.clip();

      // Draw card texture on shard
      // s.originX/Y is where the shard's center was on the card originally.
      // In local context, (0,0) is s.x, s.y
      // We want to map the card image so that the point (originX, originY) on the card
      // aligns with (0,0) in current context.
      // Card top-left is at (rect.left, rect.top) in global space.
      // So relative to originX, originY: 
      // imageX = rect.left - originX
      // imageY = rect.top - originY
      if (s.originX !== undefined) {
        ctx.drawImage(cardImage, rect.left - s.originX, rect.top - s.originY, rect.width, rect.height);
      } else {
        // Fallback for old shards or error
        ctx.fillStyle = '#f0f0f0';
        ctx.fill();
      }

      // Optional: slight border for visibility
      // ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      // ctx.stroke();

      ctx.restore();
    });

    // 3. Draw Cut Line (Feedback)
    const path = this.animState.tearPath;
    if (path && path.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.stroke();
    }
  },

  // -------------------------------------------------------------------------
  // Geometry Helpers
  // -------------------------------------------------------------------------

  getPolygonArea(poly) {
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      let j = (i + 1) % poly.length;
      area += poly[i].x * poly[j].y;
      area -= poly[j].x * poly[i].y;
    }
    return Math.abs(area / 2);
  },

  getPolygonCenter(poly) {
    let x = 0, y = 0;
    poly.forEach(p => { x += p.x; y += p.y; });
    return { x: x / poly.length, y: y / poly.length };
  },

  // Split convex polygon by line p1-p2. Returns [poly1, poly2] or null.
  splitPolygon(poly, p1, p2) {
    const intersections = [];
    for (let i = 0; i < poly.length; i++) {
      const v1 = poly[i];
      const v2 = poly[(i + 1) % poly.length];
      const inter = this.getLineIntersection(v1, v2, p1, p2);
      if (inter) {
        intersections.push({ point: inter, index: i });
      }
    }

    if (intersections.length !== 2) return null; // Must intersect exactly twice

    const i1 = intersections[0];
    const i2 = intersections[1];

    // Ensure i1.index < i2.index for simpler logic
    // But indices are circular.
    // Let's just slice.
    // Poly 1: i1.point -> v[i1.index+1] ... v[i2.index] -> i2.point -> i1.point

    const poly1 = [i1.point];
    let idx = (i1.index + 1) % poly.length;
    while (idx !== (i2.index + 1) % poly.length) {
      poly1.push(poly[idx]);
      idx = (idx + 1) % poly.length;
    }
    poly1.push(i2.point);

    // Poly 2: i2.point -> v[i2.index+1] ... v[i1.index] -> i1.point -> i2.point
    const poly2 = [i2.point];
    idx = (i2.index + 1) % poly.length;
    while (idx !== (i1.index + 1) % poly.length) {
      poly2.push(poly[idx]);
      idx = (idx + 1) % poly.length;
    }
    poly2.push(i1.point);

    return [poly1, poly2];
  },

  getLineIntersection(p1, p2, p3, p4) {
    const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;

    const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    if (denom === 0) return null;

    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
    const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) { // Segment intersection
      // For p3-p4 (the cut line), we treat it as an infinite line? 
      // No, user draws a finite line.
      // But to cut effectively, we should probably extend the cut line to infinity 
      // OR require the user to cut THROUGH the polygon.
      // Let's assume infinite line for easier cutting?
      // User said "record start and end... form a straight line... split".
      // If the line is short and fully inside, it shouldn't split.
      // So strict segment intersection is correct. User must swipe ACROSS the edge.
      return {
        x: x1 + ua * (x2 - x1),
        y: y1 + ua * (y2 - y1)
      };
    }
    return null;
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
