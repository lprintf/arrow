# Apache Arrow 性能测试项目 - 总结

## 项目概述

这是一个完整的 Apache Arrow 前端性能测试项目，展示了两种典型的数据分析场景：

1. **广告日报表分析**（密集数据）- 30,000条记录
2. **用户-SKU互动日志分析**（稀疏数据）- 100,000条记录

## 核心特性

### 技术架构
- ✅ Apache Arrow IPC 格式传输（比 JSON 小 70%+）
- ✅ Arquero 前端向量化计算（毫秒级响应）
- ✅ FastAPI 后端（纯数据搬运，零计算）
- ✅ Traefik 代理部署（HTTPS + 服务发现）

### 开发体验
- ✅ 双路由架构（生产路由 + 开发路由）
- ✅ 后端热重载（保存即生效）
- ✅ 前端快速更新（build 即可）
- ✅ 完整的 API 测试工具

### 性能优化
- ✅ 稀疏数据：主干列 + JSON 扩展属性
- ✅ 懒加载：扩展属性按需解析
- ✅ 虚拟滚动：大数据表格优化
- ✅ 前端缓存：一次加载，多次使用

## 项目结构

```
demo/arrow/
├── backend/              # FastAPI 后端
│   ├── main.py          # API 实现（273 行）
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/            # React 前端
│   ├── src/
│   │   ├── pages/
│   │   │   ├── AdReport.tsx      # 广告分析（247 行）
│   │   │   └── UserSkuLogs.tsx   # 日志分析（335 行）
│   │   ├── utils/arrow.ts        # Arrow 工具
│   │   └── App.tsx
│   ├── nginx.conf                # 生产配置
│   ├── nginx.dev.conf            # 开发配置（支持 /docs）
│   └── package.json
├── data/
│   ├── generate_data.py          # 数据生成（164 行）
│   ├── ad_report.arrow          # 2.1MB
│   └── user_sku_logs.arrow      # 5.6MB
├── compose.yml                   # 生产部署
├── compose.dev.yml              # 开发模式
├── test-api.py                  # API 测试脚本（191 行）
├── DEV.md                       # 开发者指南
├── DEPLOYMENT.md                # 部署详解
├── QUICKSTART.md                # 快速开始
└── README.md                    # 项目概述
```

## 快速开始

### 1. 生成数据
```bash
cd data
uv run --with pyarrow --with numpy generate_data.py
```

### 2. 启动项目

**生产模式：**
```bash
docker compose up -d --build
# 访问 https://arrow.127.0.0.1.sslip.io
```

**开发模式：**
```bash
docker compose -f compose.yml -f compose.dev.yml up
# 生产路由：https://arrow.127.0.0.1.sslip.io
# 开发路由：https://arrow-dev.127.0.0.1.sslip.io
# API 文档：https://arrow.127.0.0.1.sslip.io/docs
```

### 3. 测试 API
```bash
python test-api.py
```

## 部署架构

### 生产模式
```
Traefik → Frontend (Nginx) → Backend (FastAPI)
```

### 开发模式
```
Traefik ┬→ Frontend (Nginx) → Backend (FastAPI)  [生产路由]
        └→ Backend (FastAPI)                      [开发路由，无中间件]
```

## 访问地址

| 模式 | 路由类型 | 地址 | 说明 |
|------|---------|------|------|
| 生产 | 前端 | https://arrow.127.0.0.1.sslip.io | 完整应用 |
| 开发 | 生产路由 | https://arrow.127.0.0.1.sslip.io | 模拟生产环境 |
| 开发 | 开发路由 | https://arrow-dev.127.0.0.1.sslip.io | 直连后端 |
| 开发 | API 文档 | https://arrow.127.0.0.1.sslip.io/docs | Swagger UI |

## API 端点

### 统计信息
- `GET /` - 健康检查
- `GET /api/stats` - 数据统计信息

### 广告日报表
- `GET /api/ad-report` - 获取数据
  - `start_date`: 开始日期
  - `end_date`: 结束日期
  - `advertiser_id`: 广告主 ID
  - `campaign_type`: 计划类型

### 用户-SKU 日志
- `GET /api/user-sku-logs` - 获取数据
  - `start_time`: 开始时间
  - `end_time`: 结束时间
  - `event_type`: 事件类型
  - `limit`: 限制记录数

## 开发工作流

### 后端开发
1. 修改 `backend/main.py`
2. 保存文件（自动重载）
3. 查看日志：`docker compose logs -f backend`

### 前端开发
1. 修改 `frontend/src/**/*.tsx`
2. 构建：`cd frontend && npm run build`
3. 刷新浏览器

### API 测试
1. 运行测试：`python test-api.py`
2. 访问文档：https://arrow.127.0.0.1.sslip.io/docs
3. 使用开发路由：https://arrow-dev.127.0.0.1.sslip.io

## 性能指标

### 数据规模
- 广告日报表：30,000 行 × 9 列 = 270,000 数据点
- 用户-SKU 日志：100,000 行 × 5 列 = 500,000 数据点

### 传输效率
- Arrow IPC 格式：2-6 MB
- JSON 格式（预估）：6-18 MB
- 压缩比：~70% 节省

### 前端性能
- 数据加载：一次性
- 聚合计算：毫秒级（Arquero 向量化）
- 表格渲染：虚拟滚动（仅渲染可见行）
- 内存占用：TypedArray（无对象膨胀）

## 最佳实践

### 数据建模
- ✅ 密集数据：全字段列式存储
- ✅ 稀疏数据：主干列 + JSON 扩展属性
- ✅ 懒加载：仅在需要时解析 JSON

### 前端策略
- ✅ 一次加载，多次使用
- ✅ 所有聚合在浏览器完成
- ✅ 避免重复请求后端

### 后端策略
- ✅ 只负责数据搬运
- ✅ 不做聚合计算
- ✅ 返回原始数据 + 简单过滤

## 参考文档

- [DEV.md](./DEV.md) - 开发者完整指南
- [DEPLOYMENT.md](./DEPLOYMENT.md) - 部署架构详解
- [QUICKSTART.md](./QUICKSTART.md) - 快速开始指南
- [README.md](./README.md) - 项目概述
- [纯前端apache-arrow性能测试.md](./纯前端apache-arrow性能测试.md) - 方案设计

## 扩展方向

1. **增大数据规模**：修改生成脚本参数
2. **添加压缩**：后端启用 Brotli/Gzip
3. **IndexedDB 缓存**：前端持久化数据
4. **WebWorker**：将计算移至 Worker 线程
5. **流式加载**：超大数据集分块传输
6. **实时更新**：WebSocket 推送增量数据

## 致谢

本项目参考了以下最佳实践：
- [Apache Arrow 官方文档](https://arrow.apache.org/)
- [Arquero 数据处理库](https://uwdata.github.io/arquero/)
- [FastAPI 最佳实践](https://fastapi.tiangolo.com/)
- [app/nano 示例项目](../../app/nano/)
