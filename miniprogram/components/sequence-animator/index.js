Component({
  properties: {
    // Width in rpx
    width: {
      type: Number,
      value: 300
    },
    // Height in rpx
    height: {
      type: Number,
      value: 300
    },
    // Force placeholder mode
    usePlaceholder: {
      type: Boolean,
      value: false
    },
    placeholderColor: {
      type: String,
      value: '#CCCCCC'
    },
    placeholderText: {
      type: String,
      value: 'Animation'
    },
    // Sequence configuration object from assets.js
    sequenceConfig: {
      type: Object,
      value: null
    },
    // Auto play on load
    autoPlay: {
      type: Boolean,
      value: true
    }
  },

  data: {
    isPlaying: false,
    currentFrame: 0,
    canvasNode: null,
    canvasCtx: null,
    dpr: 1
  },

  lifetimes: {
    ready() {
      if (!this.data.usePlaceholder && this.data.sequenceConfig) {
        this._initCanvas();
      }
    },
    detached() {
      this.stop();
    }
  },

  observers: {
    'sequenceConfig, usePlaceholder': function(config, usePlaceholder) {
      if (!usePlaceholder && config && !this.data.canvasNode) {
        // If switching from placeholder to canvas, init canvas
        this._initCanvas();
      }
    }
  },

  methods: {
    _initCanvas() {
      const query = this.createSelectorQuery();
      query.select('#animatorCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0] || !res[0].node) return;
          
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const dpr = wx.getSystemInfoSync().pixelRatio;
          
          this.setData({
            canvasNode: canvas,
            canvasCtx: ctx,
            dpr: dpr
          });

          canvas.width = res[0].width * dpr;
          canvas.height = res[0].height * dpr;
          ctx.scale(dpr, dpr);

          if (this.data.autoPlay) {
            this.play();
          }
        });
    },

    play() {
      if (this.data.usePlaceholder || !this.data.sequenceConfig || !this.data.canvasCtx) return;
      if (this.data.isPlaying) return;

      this.setData({ isPlaying: true });
      this._animate();
    },

    stop() {
      this.setData({ isPlaying: false });
      if (this._timer) {
        clearTimeout(this._timer);
        this._timer = null;
      }
    },

    _animate() {
      if (!this.data.isPlaying) return;

      const config = this.data.sequenceConfig;
      const { baseUrl, prefix, suffix, startFrame, endFrame, fps, loop } = config;
      
      let frameIndex = this.data.currentFrame;
      if (frameIndex < startFrame || frameIndex > endFrame) {
        frameIndex = startFrame;
      }

      const framePath = `${baseUrl}${prefix}${frameIndex}${suffix}`;
      
      // Load and draw image
      const img = this.data.canvasNode.createImage();
      img.src = framePath;
      img.onload = () => {
        if (!this.data.isPlaying) return;
        
        const ctx = this.data.canvasCtx;
        // Clear previous frame? Not strictly necessary if frames are opaque and same size, 
        // but good for transparency.
        const width = this.data.width; // rpx? No, canvas drawing uses px. 
        // Wait, the canvas size was set in px based on CSS size. 
        // We should draw to fill the canvas.
        // The canvas logical size (CSS) is what we want to draw into.
        // But we scaled the context by DPR.
        // Let's just drawImage covering the whole canvas area (unscaled by DPR logic because we scaled context).
        // Actually, we need the CSS width/height in px.
        // We can get it from the canvas node size (before dpr).
        
        // Simpler: Just clearRect(0,0, canvas.width/dpr, canvas.height/dpr)
        const cssWidth = this.data.canvasNode.width / this.data.dpr;
        const cssHeight = this.data.canvasNode.height / this.data.dpr;
        
        ctx.clearRect(0, 0, cssWidth, cssHeight);
        ctx.drawImage(img, 0, 0, cssWidth, cssHeight);

        // Next frame logic
        frameIndex++;
        if (frameIndex > endFrame) {
          if (loop) {
            frameIndex = startFrame;
          } else {
            this.stop();
            this.triggerEvent('ended');
            return;
          }
        }

        this.data.currentFrame = frameIndex;

        // Schedule next frame
        const interval = 1000 / fps;
        this._timer = setTimeout(() => {
          this._animate();
        }, interval);
      };
      
      img.onerror = (err) => {
        console.error('Frame load error:', framePath, err);
        // Skip frame or stop? Let's try next frame.
        frameIndex++;
        this.data.currentFrame = frameIndex;
         const interval = 1000 / fps;
        this._timer = setTimeout(() => {
          this._animate();
        }, interval);
      }
    }
  }
});
