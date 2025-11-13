# Apache Arrow 性能测试项目

基于 Apache Arrow + Arquero 构建的前端数据分析性能测试项目，展示两种典型场景：
1. **广告日报表分析**（密集数据）- 全字段列式存储
2. **用户-SKU互动日志分析**（稀疏数据）- 主干列 + JSON扩展列

## 特点

- **纯前端分析**：一次加载数据，所有聚合计算在浏览器完成
- **高性能**：使用Apache Arrow列式格式 + Arquero向量化计算
- **交互式探索**：支持动态筛选、多维度聚合、下钻分析
- **内存优化**：稀疏数据采用懒加载策略，仅按需解析扩展属性

## 快速开始

### 前置要求

确保已创建外部网络和Traefik代理：
```bash
# 检查网络是否存在
docker network ls | grep lprintf

# 如果不存在，创建网络
docker network create lprintf
```

### 1. 生成测试数据

```bash
cd data
uv run --with pyarrow --with numpy generate_data.py
```

这将生成：
- `ad_report.arrow` - 30,000条广告日报表记录（~2MB）
- `user_sku_logs.arrow` - 100,000条用户-SKU互动日志（~5.5MB）

### 2. 使用Docker Compose启动（通过Traefik代理）

```bash
# 构建并启动所有服务
docker compose up --build

# 或者后台运行
docker compose up -d --build
```

启动后通过Traefik代理访问：
- **前端应用**：https://arrow.127.0.0.1.sslip.io
- **后端API**（通过前端nginx代理）：https://arrow.127.0.0.1.sslip.io/api/

注意：
- 使用Traefik代理，无端口冲突
- 自动HTTPS（通过127.0.0.1.sslip.io）
- 如需使用自定义域名，设置环境变量：`DOMAIN=your-domain.com`

### 3. 开发模式

#### 方式一：Docker 热重载（推荐）

使用 `compose.dev.yml` 避免频繁重新构建镜像：

```bash
# 首次构建镜像
docker compose build

# 使用开发模式启动（支持代码热重载）
docker compose -f compose.yml -f compose.dev.yml up

# 前端开发流程：
# 1. 修改前端代码后，在本地构建
cd frontend
npm run build

# 2. 刷新浏览器即可看到更新（无需重建镜像）

# 后端开发流程：
# 1. 修改后端代码
# 2. uvicorn 会自动检测变化并重新加载（无需重启容器）
```

**开发模式特性**：
- ✅ **后端热重载**：代码变更自动生效（通过 `--reload` 参数）
- ✅ **前端快速更新**：挂载本地 `dist` 目录，只需 `npm run build` 即可
- ✅ **无需重建镜像**：大幅提升开发效率
- ✅ **通过Traefik访问**：https://arrow.127.0.0.1.sslip.io
- ✅ **开发路由**：https://arrow-dev.127.0.0.1.sslip.io（用于API测试）
- ✅ **FastAPI文档**：https://arrow.127.0.0.1.sslip.io/docs

**API 测试**：

```bash
# 使用测试脚本验证 API
python test-api.py

# 或访问文档页面
# https://arrow.127.0.0.1.sslip.io/docs
```

#### 方式二：本地原生开发

```bash
# 终端1 - 后端
cd backend
uv run --with fastapi --with uvicorn --with pyarrow uvicorn main:app --reload --port 8000

# 终端2 - 前端
cd frontend
npm install  # 或 pnpm install
npm run dev

# 前端开发服务器运行在 http://localhost:5173
# API请求会自动代理到后端 http://localhost:8000
```

## 项目结构

```
demo/arrow/
├── backend/              # FastAPI后端
│   ├── main.py          # 主应用，提供Arrow格式API
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/            # React前端
│   ├── src/
│   │   ├── pages/
│   │   │   ├── AdReport.tsx          # 广告日报表分析
│   │   │   └── UserSkuLogs.tsx       # 用户-SKU日志分析
│   │   ├── utils/
│   │   │   └── arrow.ts              # Arrow数据处理工具
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── Dockerfile
│   └── nginx.conf
├── data/                # 数据生成
│   ├── generate_data.py # 数据生成脚本
│   ├── ad_report.arrow  # 生成的广告数据
│   └── user_sku_logs.arrow  # 生成的日志数据
├── compose.yml          # Docker编排配置
└── README.md
```

## 技术栈

### 后端
- **FastAPI** - 现代Python Web框架
- **PyArrow** - Apache Arrow Python实现
- **uvicorn** - ASGI服务器

### 前端
- **React 18** - UI框架
- **Apache Arrow JS** - Arrow数据处理
- **Arquero** - 类SQL的数据操作库
- **ECharts** - 数据可视化
- **Ant Design** - UI组件库
- **Vite** - 构建工具

## API端点

### GET /api/ad-report
获取广告日报表数据（Arrow格式）

**参数：**
- `start_date` - 开始日期
- `end_date` - 结束日期
- `advertiser_id` - 广告主ID
- `campaign_type` - 计划类型

### GET /api/user-sku-logs
获取用户-SKU互动日志（Arrow格式）

**参数：**
- `start_time` - 开始时间
- `end_time` - 结束时间
- `event_type` - 事件类型（view/cart_add/purchase）
- `limit` - 限制返回记录数

### GET /api/stats
获取数据统计信息

## 性能优化策略

### 广告日报表（密集数据）
1. ✅ Arrow IPC格式传输，比JSON小70%+
2. ✅ 全量数据前端缓存，避免重复请求
3. ✅ Arquero向量化计算，毫秒级响应
4. ✅ 虚拟滚动表格，仅渲染可视区域

### 用户-SKU日志（稀疏数据）
1. ✅ 主干字段列式存储，扩展属性JSON字符串
2. ✅ 聚合计算仅基于主干字段，不解析JSON
3. ✅ 扩展属性懒加载，点击明细时按需解析
4. ✅ 后端支持limit参数，控制数据规模

## 清理

```bash
# 停止并删除容器
docker compose down

# 删除生成的数据文件
rm data/*.arrow
```

## 扩展建议

1. **增大数据规模**：修改 `data/generate_data.py` 中的参数
2. **添加压缩**：后端启用Brotli/Gzip压缩
3. **IndexedDB缓存**：前端持久化缓存数据
4. **WebWorker**：将数据处理移至Worker线程
5. **流式加载**：超大数据集采用分块流式加载

## 参考文档

- [Apache Arrow](https://arrow.apache.org/)
- [Arquero](https://uwdata.github.io/arquero/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [性能测试方案说明](./纯前端apache-arrow性能测试.md)
