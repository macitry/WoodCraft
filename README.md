# WoodCraft - 家具设计平台

基于 Web 的 3D 家具设计与可视化工具，支持参数化建模、物料清单生成和工程图纸导出。

## 技术栈

- **前端框架**: React 19 + TypeScript
- **构建工具**: Vite 8
- **3D 渲染**: Three.js + React Three Fiber + Drei
- **状态管理**: Zustand
- **HTTP 客户端**: Axios
- **样式方案**: Tailwind CSS 4

## 环境要求

- [Node.js](https://nodejs.org/) >= 18
- npm >= 9（或 pnpm / yarn）

## 快速启动

```bash
# 1. 克隆项目
git clone git@github.com:macitry/WoodCraft.git
cd WoodCraft

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

浏览器访问 http://localhost:5173 即可看到应用。

## 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器（HMR 热更新） |
| `npm run build` | TypeScript 类型检查 + 生产构建 |
| `npm run preview` | 预览生产构建产物 |
| `npm run lint` | 运行 Oxlint 代码检查 |

## 项目结构

```
WoodCraft/
├── public/               # 静态资源
├── src/
│   ├── api/              # API 接口层
│   ├── app/              # 应用入口
│   ├── components/       # UI 组件
│   │   ├── FurnitureTree.tsx      # 家具结构树
│   │   ├── MaterialSelector.tsx   # 材质选择器
│   │   ├── ModelInfo.tsx          # 模型信息面板
│   │   ├── ParameterPanel.tsx     # 参数调节面板
│   │   ├── TabletopPlan.tsx       # 台面平面图
│   │   └── Toolbar.tsx            # 工具栏
│   ├── mock/             # Mock 示例数据
│   ├── store/            # Zustand 状态管理
│   ├── types/            # TypeScript 类型定义
│   └── viewer/           # 3D 查看器
│       ├── CameraController.tsx    # 相机控制
│       ├── FurnitureViewer.tsx     # 家具查看器
│       ├── Lighting.tsx            # 光照系统
│       ├── ModelLoader.tsx         # 模型加载器
│       └── Scene.tsx               # 3D 场景
└── output/               # 导出文件（STEP、STL）
```
