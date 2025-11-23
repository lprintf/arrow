# 百万数据全栈性能测试

以广告投放场景为例，实现百万级稠密和百万（代表亿级）稀疏数据的低成本存储、传输、计算，实现极端需求最多3秒响应，普通需求毫秒级响应。

## 项目简介

基于 Apache Arrow + Arquero 构建的全栈数据分析性能测试项目，展示两种典型场景：

1. **稠密数据场景（百万级）**：广告日报表分析
   - 62万+条记录，13个月历史数据
   - 全字段列式存储（Apache Arrow IPC格式）
   - 分片加载：默认加载最后1个月（1.6万条，1.9MB），占总数据2.5%
   - 按需加载：根据日期范围动态加载对应月份
   - 性能：初始加载<100ms，全量加载1-3秒

2. **稀疏数据场景（代亿级）**：用户-SKU互动日志分析
   - 50万条记录，模拟能代表亿级数据的百万稀疏数据
   - 主干列 + JSON扩展列混合存储
   - 懒加载策略：仅按需解析扩展属性
   - 性能：聚合计算毫秒级响应

## 核心特点

- **低成本存储**：Arrow列式压缩，比JSON小70%+
- **高效传输**：分片加载，减少97%初始传输量
- **极速计算**：Arquero向量化计算，前端毫秒级聚合
- **智能缓存**：已加载数据缓存，避免重复请求
- **渐进增强**：支持从单月到全年的渐进式数据加载

## 快速开始

### 前置要求

确保已创建外部网关网络：
```bash
# 检查网络是否存在
docker network ls | grep gateway

# 如果不存在，创建网络
docker network create gateway-http
docker network create gateway-https
```

### 1. 生成测试数据

```bash
cd data
uv run --with pyarrow --with numpy generate_data.py
```

这将生成：
- `ad_report.arrow` - 30,000条广告日报表记录（~2MB）
- `user_sku_logs.arrow` - 100,000条用户-SKU互动日志（~5.5MB）

### 2. 选择部署模式

项目已优化为 HTTP 和 HTTPS 独立部署结构：

#### HTTP 部署（本地开发/测试）

```bash
# 进入 HTTP 部署目录
cd http

# 启动生产环境
./start.sh

# 或启动开发环境（支持热重载）
./dev.sh
```

访问地址：
- 生产环境：`http://arrow.${DOMAIN}`（需要 OIDC 认证）
- 开发环境：`http://arrow-dev.${DOMAIN}`（绕过认证，可访问 /docs）

详见 [http/README.md](./http/README.md)

#### HTTPS 部署（生产环境/网关集成）

```bash
# 进入 HTTPS 部署目录
cd https

# 启动生产环境
./start.sh

# 或启动开发环境
./dev.sh
```

访问地址：
- 生产环境：`https://arrow.${DOMAIN}`（需要 OIDC 认证）
- 开发环境：`https://arrow-dev.${DOMAIN}`（直连后端，绕过认证）

详见 [https/README.md](./https/README.md)

### 3. 开发模式

推荐使用 HTTP 部署的开发模式，支持代码热重载和绕过认证：

```bash
cd http
./dev.sh
```

开发特性：
- ✅ **后端热重载**：代码变更自动生效
- ✅ **前端快速更新**：只需重新构建，无需重启容器
- ✅ **绕过认证**：开发环境自动注入测试用户
- ✅ **API 文档访问**：可访问 `/docs` 和 `/redoc`

前端开发流程：
```bash
cd frontend
pnpm run build
# 刷新浏览器即可看到更新
```

后端修改会自动热重载，无需手动操作。

详见 [http/dev.md](./http/dev.md)

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
├── http/                # HTTP 部署配置
│   ├── docker-compose.yml
│   ├── compose.dev.yml
│   └── *.sh             # 部署脚本
├── https/               # HTTPS 部署配置
│   ├── docker-compose.yml
│   ├── compose.dev.yml
│   └── *.sh             # 部署脚本
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

## 性能指标

### 稠密数据场景（百万级）

| 操作 | 数据量 | 文件大小 | 响应时间 | 说明 |
|------|--------|---------|---------|------|
| 初始加载 | 1.6万条 | 1.9 MB | <100ms | 默认加载最后1个月 |
| 加载近3月 | 23万条 | 26.7 MB | 200-500ms | 自动按需加载 |
| 全量加载 | 62万条 | 72 MB | 1-3s | 极端场景 |
| 数据聚合 | 任意规模 | - | 毫秒级 | Arquero向量化计算 |
| 图表渲染 | 任意规模 | - | 毫秒级 | ECharts增量渲染 |

**性能提升**：
- 初始加载时间减少 **95%**（vs 全量加载）
- 内存占用减少 **96%**（vs 全量加载）
- 网络传输减少 **97%**（vs 全量加载）

### 稀疏数据场景（代亿级）

| 操作 | 数据量 | 响应时间 | 说明 |
|------|--------|---------|------|
| 列表查询 | 50万条 | <200ms | 仅加载主干列 |
| 聚合统计 | 50万条 | 毫秒级 | 基于主干列向量化计算 |
| 明细查看 | 按需 | 毫秒级 | 懒加载JSON扩展属性 |

**优化策略**：
- 主干列采用Arrow列式存储，扩展属性存为JSON字符串
- 聚合计算不解析JSON，仅基于主干字段
- 扩展属性懒加载，点击明细时按需解析

## 性能优化策略

### 稠密数据场景优化
1. ✅ **分片加载**：按月分片，默认只加载最后1个月（2.5%数据）
2. ✅ **智能缓存**：已加载月份缓存，避免重复请求
3. ✅ **按需加载**：选择日期范围时自动加载对应月份
4. ✅ **Arrow IPC格式**：列式压缩传输，比JSON小70%+
5. ✅ **Arquero向量化计算**：前端聚合毫秒级响应
6. ✅ **虚拟滚动表格**：仅渲染可视区域，支持25,000条数据流畅滚动

### 稀疏数据场景优化
1. ✅ **主干字段列式存储**：高频查询字段使用Arrow列式格式
2. ✅ **扩展属性JSON存储**：稀疏字段存为JSON字符串，节省空间
3. ✅ **聚合计算仅基于主干字段**：不解析JSON，保证毫秒级响应
4. ✅ **懒加载扩展属性**：点击明细时按需解析JSON
5. ✅ **后端limit参数**：控制数据规模，避免过度传输

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
