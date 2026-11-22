# 🧊 Voxel Craft

> 一个基于 Web 的高性能、跨平台体素沙盒引擎。纯原生 JavaScript 打造，无重型游戏框架依赖。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Three.js](https://img.shields.io/badge/Three.js-r160-000000?logo=three.js)
![WebGL](https://img.shields.io/badge/WebGL-2.0-990000?logo=webgl)

<p align="center">
  <img src="https://expert1.de5.net/s6ckujp.jpg" alt="Voxel Craft 预览图" width="100%">
  <br>
</p>

---

## ✨ 核心特性

- 🚀 **极致性能优化**：采用 **Web Worker** 异步生成地形，结合 **贪心网格合并 (Greedy Meshing)** 技术，大幅降低 Draw Call 和顶点数量。
- 🎨 **高级渲染管线**：纯手工编写的 **GLSL Shader**，支持程序化生成的像素风纹理图集 (Procedural Atlas)、顶点环境光遮蔽 (AO) 以及距离指数雾 (Exponential Fog)。
- 📱 **全平台无缝适配**：
  - **桌面端**：原生 Pointer Lock API，流畅的 WASD + 鼠标视角控制。
  - **移动端**：定制化虚拟摇杆、多点触控支持、屏幕边缘防误触，以及专属的跳跃/飞行 UI。
- 🧠 **动态画质自适应**：内置 FPS 监控器，可根据设备性能自动降级/升级区块渲染半径 (Render Radius) 和设备像素比 (Device Pixel Ratio)，保证流畅度。
- 🌍 **程序化世界生成**：基于多层分形布朗运动 (FBM) 噪声，生成包含平原、山脉、洞穴、水体、树木和草丛的丰富地形。

---

## 🚀 快速开始

> ⚠️ **重要提示**：由于项目使用了 ES Modules (`import`) 和 Web Worker，**绝对不能直接双击 `index.html` 打开**（会因浏览器 CORS 策略被拦截）。必须通过本地 HTTP 服务器运行。

### 方式一：VS Code (推荐)
1. 安装 [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) 插件。
2. 在项目文件夹中右键点击 `index.html`。
3. 选择 **"Open with Live Server"**。

### 方式二：Python
在项目根目录打开终端，运行：
```bash
# Python 3
python -m http.server 8000
# 然后在浏览器访问 http://localhost:8000
```

### 方式三：Node.js (http-server)
```bash
npx http-server -p 8000
```

---

## 🎮 操作指南

### 🖥️ 桌面端 (Desktop)
| 按键 | 功能 |
| :--- | :--- |
| `W` / `A` / `S` / `D` | 移动 |
| `Space` | 跳跃 (地面) / 上升 (飞行模式) |
| `Shift` | 奔跑加速 |
| `鼠标左键` | 破坏方块 |
| `鼠标右键` | 放置方块 |
| `1` - `7` | 切换快捷栏方块 |
| `点击画面` | 锁定/释放鼠标指针 |

### 📱 移动端 (Mobile)
| 操作区域 | 功能 |
| :--- | :--- |
| **左下半区拖拽** | 虚拟摇杆移动 |
| **右半区拖拽** | 旋转视角 |
| **右半区轻点** | 破坏准星指向的方块 |
| **右半区长按** | 放置方块 |
| **右下角按钮** | 跳跃 / 飞行控制 |
| **右上角 ⚙️** | 打开设置面板 (调节速度、视野、飞行模式) |

---

## 📂 项目结构

```text
voxel-craft/
├── index.html      # 页面结构、UI 布局与 ES Module 入口
├── style.css       # 响应式样式、玻璃拟态 UI 与交互动画
└── script.js       # 核心游戏逻辑 (渲染、物理、输入、Worker 通信)
```

---

## ⚙️ 技术栈

- **渲染引擎**: [Three.js](https://threejs.org/) (r160)
- **语言**: Vanilla JavaScript (ES6+), GLSL
- **构建**: 无 (Zero-build, 纯原生运行)
- **资源**: 纯代码程序化生成 (无外部图片资源依赖)

---

## 🛣️ 未来计划 (Roadmap)

- [√] 💾 **本地存档系统**：使用 `IndexedDB` 保存和加载玩家修改的地形。
- [ ] 🌅 **昼夜循环系统**：动态改变天空盒颜色、雾效和光照方向。
- [ ] 🧱 **更多方块类型**：矿石、红石逻辑、玻璃等。
- [ ] 🔊 **音效系统**：添加破坏、放置、脚步声等 Web Audio API 音效。

---

## 👤 作者

**lil-lotus**
🔗 [GitHub]https://github.com/lil-lotus/3d-game/
💌 欢迎提交 Issue 或 Pull Request！

---

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。你可以自由地使用、修改和分发，但请保留原作者署名。

---
> Made with ❤️ and ☕ by **lil-lotus**
