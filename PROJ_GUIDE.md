# 撕碎蕉绿应用开发文档

## 1. 项目概述

“撕碎蕉绿”是一款融合了AI对话与心理疏导的互动式应用。其核心体验在于：用户通过自然语言倾诉心情和故事，AI生成专业的心理分析和轻松的建议，并最终将建议生成一张可视化的“反焦虑卡片”。用户通过撕碎、踩烂、砸碎或点燃卡片的交互，象征性地将焦虑情绪释放，获得治愈感。

**核心体验流程**：
用户输入 → AI心理分析（详细/简洁模式）→ 生成反焦虑卡片 → 交互式销毁卡片 → 情绪释放。

## 2. 技术架构与文件管理

本项目采用**Python（后端）** 与**微信小程序（前端）** 分离的架构。

### 2.1 后端文件结构（Python）

遵循PEP 8等Python编码规范，规划清晰的代码结构。

```
/GreenBanana
    /backend
        /app
            __init__.py
            /api
                __init__.py
                views.py  # API路由入口
                /utils
                    __init__.py
                    deepseek_api.py  # DeepSeek API调用模块
                    psychology_knowledge.py  # 知识库处理模块
            /storage
                __init__.py
                conversation_storage.py  # 对话记录存储模型
            /templates
                __init__.py
                prompt_templates.py  # 提示词模板管理
        /config
            __init__.py
            settings.py  # 环境配置
        main.py  # 应用启动入口
        run.py  # uvicorn服务器配置
        pyproject.toml # uv项目配置文件
        uv.lock      # 依赖锁定文件
```

### 2.2 前端文件结构（微信小程序）

遵循微信小程序开发规范。

```
/GreenBanana
    /miniprogram
        app.js       # 小程序逻辑
        app.json     # 小程序公共设置
        app.wxss     # 小程序公共样式表
        project.config.json # 项目配置文件
        sitemap.json # 索引配置
        /pages
            /index   # 首页
                index.js
                index.wxml
                index.wxss
                index.json
            /chat    # 对话页
                chat.js
                chat.wxml
                chat.wxss
                chat.json
            /result  # 卡片展示与销毁页
                result.js
                result.wxml
                result.wxss
                result.json
        /components
            /chat-input
                index.js
                index.wxml
                index.wxss
                index.json
            /chat-message
                index.js
                index.wxml
                index.wxss
                index.json
            /card-machine
                index.js
                index.wxml
                index.wxss
                index.json
        /utils
            api.js   # 后端API调用封装
            util.js  # 工具函数
        /images      # 图片资源
```

## 3. 后端核心实现细节（Python）

### 3.1 LLM API集成 (智谱 GLM)

- **API服务商**：智谱AI (BigModel)
- **模型**：GLM-4.7 (支持 `thinking` 模式)
- **架构设计**：采用**策略模式 (Strategy Pattern)** 或 **抽象基类** 封装 LLM 调用接口，以实现 API 的便捷更换（如未来切换回 DeepSeek 或其他模型）。

- **调用示例**：
    ```json
    POST https://open.bigmodel.cn/api/paas/v4/chat/completions
    {
        "model": "glm-4.7",
        "messages": [...],
        "thinking": { "type": "enabled" }, // 启用深度思考
        "max_tokens": 65536,
        "temperature": 1.0
    }
    ```

- **核心模块规划**：
    - `llm_interface.py`: 定义通用的 `LLMClient` 抽象基类。
    - `zhipu_client.py`: 实现智谱 GLM 的具体调用逻辑。
    - `factory.py`: 根据配置动态加载具体的 LLM 客户端。

### 3.2 心理学知识库处理

- **格式**：TXT文件。
- **处理逻辑**：
    - 对知识库文本进行预处理（清洗、分段）。
    - 建立检索机制（如向量数据库），以便在对话中快速检索相关信息。
    - AI的回答将结合通用心理学知识和知识库中的特定内容。

### 3.3 提示词工程与对话管理

- **提示词模板** (`prompt_templates.py`)：
    - **标准模式**：引导AI进行深度思考，生成包含详细分析和建议的回答。
    - **简洁模式**：引导AI对标准回答进行总结，输出核心建议。

- **对话存储** (`conversation_storage.py`)：使用SQLAlchemy等ORM管理对话记录，便于生成卡片和回顾。

### 3.4 配置与运行

- **Web框架**：建议使用轻量级框架如Flask或FastAPI，以便快速开发。
- **服务器**：使用Uvicorn运行ASGI应用。

    ```python
    # run.py 示例
    import uvicorn
    from app import app

    if __name__ == "__main__":
        uvicorn.run(app, host="0.0.0.0", port=8000)
    ```

## 4. 前端设计与交互实现（微信小程序）

### 4.1 用户界面设计

- **核心隐喻**：
    - **Mood Lab (情绪实验室)**：整体界面营造一种轻松、实验性的氛围。
    - **Card Maker (制卡机)**：输入和生成过程模拟一台3D卡通风格的物理机器（类似面包机或复古打印机），拥有拉杆、插槽等拟物化元素，增加操作的趣味性和真实感。

- **核心界面流程**：
    1.  **Morning & Input (倾诉)**：
        -   **氛围**：温暖、明亮、安全。
        -   **元素**：悬浮的情绪气泡标签（如“有点焦虑”、“想吐槽”）、简洁的输入框、拟物化的“制卡机”。
        -   **交互**：用户输入故事或选择标签，拉动机器拉杆，“制卡机”吐出一张实体感强的卡片。
    2.  **Interaction & Ritual (仪式)**：
        -   **氛围**：深邃、沉浸（如深蓝/紫色背景），象征深夜或潜意识。
        -   **元素**：用户生成的“反焦虑卡片”（如“正常力卡”）、垃圾桶或虚空。
        -   **交互**：用户通过手势（滑动、点击）对卡片进行破坏（撕碎、燃烧），卡片碎片掉落或化为灰烬，伴随“烦恼已燃尽”等治愈文案。
    3.  **Analysis & Solution (治愈)**：
        -   **氛围**：理性、清新。
        -   **元素**：卡片式布局的“Reaction Card”，展示插画风格的心理分析和解决方案。
        -   **交互**：结构化展示“心理现象”与“解决方案”，支持翻转或展开查看详情。

### 4.2 反焦虑卡片动画

- **仪式感交互**：破坏卡片不仅仅是删除数据，而是一种心理释放的仪式。
    -   **撕碎 (Tear)**：手指划过屏幕，卡片跟随路径裂开，物理引擎模拟纸张撕裂的阻力感和碎片掉落。
    -   **燃烧 (Burn)**：点击点燃卡片，火焰从点击处蔓延，卡片逐渐卷曲、变黑、化为灰烬消散。
    -   **压碎 (Crush)**：长按屏幕，卡片在压力下变形、产生裂纹，最终破碎。
- **技术选型**：使用微信小程序的 **Canvas 2D** 接口实现高性能粒子动画。
- **实现参考**：
    ```javascript
    // 示例：获取Canvas上下文
    const query = wx.createSelectorQuery()
    query.select('#myCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        // 动画逻辑
      })
    ```

### 4.3 模式切换与API通信

- **简洁模式切换**：使用 `<switch>` 组件或自定义Toggle按钮。
- **API调用**：使用 `wx.request` 封装与后端的通信。
    - 需要在小程序后台配置服务器域名（开发环境可勾选“不校验合法域名”）。
    - 处理 `success`, `fail` 回调或使用 Promise 封装。

## 5. 产品UI/UX设计规范

### 5.1 视觉规范 (Visual Specifications)

- **设计理念 (Design Philosophy)**：
    - **Mood Lab (情绪实验室)**：不仅仅是一个工具，而是一个充满趣味和安全感的“实验室”。用户在这里“化验”自己的情绪，并“销毁”有害样本。
    - **Soft 3D & Tactile (软萌3D与触感)**：核心元素（如制卡机、卡片、按钮）采用轻拟物（Claymorphism）风格，强调材质的柔软和体积感，让人产生想“捏一捏”的冲动，从而降低心理防御。

- **色彩心理学应用 (Color System)**：
    - **Day Mode (倾诉态 - 温暖/安全)**：
        -   **背景**：奶油白 (`#FFFDF5`) 或 极淡的暖灰。
        -   **主色**：嫩芽绿 (`#B8E986`) 搭配 鹅黄 (`#F8E71C`)，象征新生与希望。
        -   **用途**：首页、输入、制卡过程。
    - **Night Mode (释放态 - 沉浸/私密)**：
        -   **背景**：深海蓝 (`#1B262C`) 或 虚空紫 (`#2D2039`)。
        -   **主色**：荧光绿 (`#00FFCC`) 或 火焰橙 (`#FF5722`)，在暗色背景中形成强烈视觉焦点。
        -   **用途**：卡片销毁、情绪释放环节。

- **排版与字体 (Typography)**：
    -   **原则**：圆润、亲和、无攻击性。
    -   **标题**：使用圆体字或加粗的无衬线字体，字间距稍大。
    -   **正文**：保证高可读性，行高建议 1.6 倍以上。

### 5.2 交互细节 (Interaction Details)

- **五感交互 (Sensory Design)**：
    -   **触觉 (Haptic)**：充分利用 Taptic Engine。
        -   *拉杆*：重锤反馈（Heavy Impact）。
        -   *撕碎*：随着手指滑动产生连续的轻微震动，模拟纸张纤维断裂的阻力感。
        -   *燃烧*：持续的微弱震动，模拟火焰燃烧的脉动。
    -   **听觉 (Sound)**：ASMR 级别的音效设计。
        -   *制卡机*：机械齿轮转动的“咔嚓”声、卡片弹出的“嗖”声。
        -   *销毁*：清脆的撕纸声、火焰燃烧的噼啪声、玻璃破碎声。

- **关键动画流程 (Core Animations)**：
    -   **制卡过程**：
        1.  用户向机器“投喂”文字（文字吸入动画）。
        2.  机器抖动、冒烟（处理中）。
        3.  卡片伴随弹跳动画弹出（Physics Bounce）。
    -   **模式切换**：
        -   从 Day 到 Night Mode 的过渡不应是生硬的跳转，而应是背景色的平滑渐变（Color Morphing），仿佛灯光突然调暗，聚光灯打在卡片上。

- **手势操作 (Gestures)**：
    -   **撕碎**：支持双指反向滑动（撕开）或单指划线（裁切）。
    -   **揉皱/压碎**：长按屏幕，画面随按压时间产生向内的扭曲变形（Mesh Distortion），松手后卡片回弹或破碎。

## 6. 开发与部署建议

- **编码规范**：Python代码遵循PEP 8规范，小程序遵循微信官方开发指南。
- **测试**：
    - 后端：单元测试、接口测试。
    - 前端：使用微信开发者工具进行真机调试和预览。
- **部署**：
    - **后端**：部署到支持 HTTPS 的云服务器（小程序强制要求 HTTPS）。
    - **前端**：在微信开发者工具中上传代码，提交审核并发布。
