# 快速开始指南

## 前置要求

确保已创建外部网络和运行Traefik代理：

```bash
# 检查网络是否存在
docker network ls | grep lprintf

# 如果不存在，创建网络
docker network create lprintf

# 确保Traefik代理正在运行
# 如果你的环境中还没有Traefik，可以参考项目文档配置
```

## 方式一：Docker Compose + Traefik代理（推荐）

这是推荐的生产部署方式，通过Traefik代理实现HTTPS访问，无端口冲突。

```bash
# 1. 进入项目目录
cd /home/lprintf/workspace/omni-server/demo/arrow

# 2. 确保数据文件已生成（如果还没有）
cd data && uv run --with pyarrow --with numpy generate_data.py && cd ..

# 3. 启动服务
docker compose up -d --build

# 4. 查看服务状态
docker compose ps

# 5. 查看日志
docker compose logs -f

# 6. 访问应用
# 前端: https://arrow.127.0.0.1.sslip.io
# 后端API（通过nginx代理）: https://arrow.127.0.0.1.sslip.io/api/
```

停止服务：
```bash
docker compose down
```

## 方式二：Docker 开发模式（热重载）

适合开发调试，支持代码热重载，无需频繁重建镜像。

```bash
# 1. 首次构建镜像
docker compose build

# 2. 使用开发模式启动
docker compose -f compose.yml -f compose.dev.yml up -d

# 3. 访问应用
# https://arrow.127.0.0.1.sslip.io
```

### 前端开发流程：

```bash
cd frontend

# 修改代码后，构建
npm run build
# 或使用 pnpm
pnpm build

# 刷新浏览器即可看到更新（无需重建Docker镜像）
```

### 后端开发流程：

```bash
# 修改 backend/main.py 后
# uvicorn 会自动检测变化并重新加载（无需重启容器）
# 查看日志确认重载：
docker compose logs -f backend
```

### API 测试：

```bash
# 使用测试脚本（推荐）
python test-api.py

# 访问 FastAPI 文档
# https://arrow.127.0.0.1.sslip.io/docs

# 使用开发路由直接测试 API
# https://arrow-dev.127.0.0.1.sslip.io/api/stats
```

## 方式三：本地开发模式（不使用Docker）

适合开发调试，支持热重载。

### 终端1：启动后端

```bash
cd /home/lprintf/workspace/omni-server/demo/arrow/backend

# 使用uv运行（推荐）
uv run --with fastapi --with uvicorn --with pyarrow uvicorn main:app --reload --port 8000

# 后端运行在 http://localhost:8000
```

### 终端2：启动前端

```bash
cd /home/lprintf/workspace/omni-server/demo/arrow/frontend

# 安装依赖（首次运行）
npm install
# 或使用 pnpm
pnpm install

# 启动开发服务器
npm run dev

# 前端运行在 http://localhost:5173
# API请求会自动代理到后端 http://localhost:8000
```

## 功能演示

### 1. 广告日报表分析（密集数据）

访问首页即可看到广告日报表分析界面，功能包括：

- 总览指标卡片：总曝光量、总点击量、点击率、ROI
- 每日趋势图：展示曝光、点击、转化、GMV的时间序列
- 计划类型分布饼图
- 交互式筛选：按计划类型、日期范围筛选
- 数据明细表格：支持分页和滚动查看

**性能特点**：
- 30,000条记录一次性加载（~2MB）
- 所有聚合计算在前端完成，毫秒级响应
- 支持任意维度重聚合，无需请求后端

### 2. 用户-SKU互动日志分析（稀疏数据）

点击顶部菜单"用户-SKU互动日志"进入，功能包括：

- 事件统计：View、Cart Add、Purchase数量
- 转化漏斗：浏览→加购率、加购→购买率、整体转化率
- 事件类型分布饼图
- 转化漏斗图
- Top 10 热门SKU列表
- 时间趋势图：按小时统计各类事件
- 数据明细表格：支持展开查看扩展属性（懒加载）

**性能特点**：
- 100,000条记录（~5.5MB）
- 主干字段列式分析，扩展属性按需解析
- 仅当点击展开行时才解析JSON，节省内存

## 数据说明

### 广告日报表
- 1000个广告计划 × 30天 = 30,000条记录
- 字段：日期、广告主ID、计划ID、计划类型、曝光量、点击量、花费、转化量、GMV

### 用户-SKU互动日志
- 100,000条事件记录
- 事件分布：View(70%)、Cart Add(20%)、Purchase(10%)
- 字段：时间戳、用户ID、SKU ID、事件类型、扩展属性(JSON)

## 重新生成数据

如果想修改数据规模或特征：

```bash
cd data

# 编辑 generate_data.py，修改参数
# 例如：num_campaigns=2000, num_days=60, num_events=1000000

# 重新生成
uv run --with pyarrow --with numpy generate_data.py

# 重启后端生效
```

## 性能测试建议

1. 使用浏览器开发者工具Network面板查看数据传输大小
2. 使用Performance面板分析前端计算性能
3. 在React DevTools Profiler中观察组件渲染性能
4. 对比JSON和Arrow格式的传输大小差异

## 故障排查

### 后端无法启动

- 检查端口是否被占用：`lsof -i :8000`
- 查看后端日志
- 确认数据文件存在：`ls -lh data/*.arrow`

### 前端无法连接后端

- 确认后端正在运行：`curl http://localhost:8000/`
- 检查CORS配置
- 查看浏览器控制台错误信息

### Docker Compose问题

- 查看容器状态：`docker compose ps`
- 查看容器日志：`docker compose logs backend` 或 `docker compose logs frontend`
- 重新构建：`docker compose build --no-cache`

## 扩展阅读

- [Apache Arrow](https://arrow.apache.org/)
- [Arquero文档](https://uwdata.github.io/arquero/)
- [FastAPI文档](https://fastapi.tiangolo.com/)
- [项目设计文档](./纯前端apache-arrow性能测试.md)
