# Arrow HTTPS 开发模式（Overlay）

HTTPS 开发模式使用 **overlay** 配置，在生产容器上叠加开发特性，支持同时访问生产和开发环境。

## 快速开始

```bash
./dev.sh
```

访问地址：
- **生产环境**：`https://arrow.${DOMAIN}`（OIDC 认证）
- **开发环境**：`https://arrow-dev.${DOMAIN}`（直连后端，绕过认证，可访问 /docs）

## Overlay 模式说明

与 HTTP 部署的**独立容器模式**不同，HTTPS 使用 **overlay 模式**：

### 独立容器模式 (HTTP)
```
生产环境：backend + frontend
开发环境：backend-dev + frontend-dev（独立容器）
```

### Overlay 模式 (HTTPS)
```
同一组容器：backend + frontend
├── 生产路由：https://arrow.${DOMAIN} → frontend → backend (OIDC)
└── 开发路由：https://arrow-dev.${DOMAIN} → backend (直连)
```

**优势**：
- ✅ 资源占用更低（只需 2 个容器）
- ✅ 可同时测试生产和开发环境
- ✅ 更接近真实生产环境

**劣势**：
- ❌ 后端重启会影响生产路由
- ❌ 无法完全隔离开发和生产环境

## 开发特性

### 后端热重载

`compose.dev.yml` 覆盖后端启动命令，启用热重载：

```yaml
services:
  backend:
    command: uvicorn arrow_service.main:app --reload
    volumes:
      - ../backend/arrow_service:/app/arrow_service:ro
    labels:
      # 添加开发路由（直连后端）
      - traefik.http.routers.arrow-dev.rule=Host(`arrow-dev.${DOMAIN}`)
```

修改代码后自动重载：

```bash
# 修改代码
vim ../backend/arrow_service/main.py

# 观察日志确认重载
docker compose -f docker-compose.yml -f compose.dev.yml logs -f backend
```

### 前端快速更新

挂载本地构建产物：

```bash
cd ../frontend
pnpm run build

# 刷新浏览器
```

### 双路由访问

同时支持生产和开发路由：

```bash
# 生产路由（经过 OIDC 认证）
curl https://arrow.${DOMAIN}/api/ad-report

# 开发路由（直连后端，绕过认证）
curl https://arrow-dev.${DOMAIN}/api/ad-report

# API 文档（仅开发路由）
open https://arrow-dev.${DOMAIN}/docs
```

## 开发流程

### 场景 1：调试 OIDC 集成

同时测试带认证和不带认证的访问：

```bash
# 1. 启动开发环境
./dev.sh

# 2. 测试生产路由（需要登录）
open https://arrow.${DOMAIN}

# 3. 测试开发路由（绕过认证）
open https://arrow-dev.${DOMAIN}

# 4. 对比两者行为差异
```

### 场景 2：修改后端 API

```bash
# 1. 修改代码
vim ../backend/arrow_service/main.py

# 2. 等待 1-2 秒，观察日志确认重载
docker compose -f docker-compose.yml -f compose.dev.yml logs -f backend

# 3. 测试新的 API（使用开发路由）
curl https://arrow-dev.${DOMAIN}/api/your-endpoint

# 4. 验证生产路由也能正常工作
curl https://arrow.${DOMAIN}/api/your-endpoint
```

### 场景 3：修改前端 UI

```bash
# 1. 修改代码
vim ../frontend/src/pages/AdReport.tsx

# 2. 重新构建
cd ../frontend
pnpm run build

# 3. 刷新浏览器测试生产路由
open https://arrow.${DOMAIN}

# 4. 刷新浏览器测试开发路由
open https://arrow-dev.${DOMAIN}
```

## 配置说明

### compose.dev.yml（Overlay 模式）

```yaml
services:
  backend:
    # 覆盖启动命令
    command: uvicorn arrow_service.main:app --reload

    # 挂载代码目录
    volumes:
      - ../backend/arrow_service:/app/arrow_service:ro

    # 添加开发路由标签
    labels:
      - traefik.enable=true
      - traefik.http.routers.arrow-dev.rule=Host(`arrow-dev.${DOMAIN}`)
      - traefik.http.routers.arrow-dev.entrypoints=websecure
      - traefik.http.routers.arrow-dev.tls=true
      - traefik.http.routers.arrow-dev.middlewares=strip-user-headers@file
      - traefik.http.routers.arrow-dev.service=arrow-backend-dev-svc
      - traefik.http.services.arrow-backend-dev-svc.loadbalancer.server.port=8000

  frontend:
    # 挂载本地构建产物
    volumes:
      - ../frontend/dist:/usr/share/nginx/html:ro
      - ../frontend/nginx.dev.conf.template:/etc/nginx/templates/default.conf.template:ro
```

### Traefik 路由配置

**生产路由**（由 `docker-compose.yml` 定义）：
```
https://arrow.${DOMAIN} → frontend:80 → backend:8000
                         ↑
                    OIDC 认证
```

**开发路由**（由 `compose.dev.yml` 添加）：
```
https://arrow-dev.${DOMAIN} → backend:8000
                              ↑
                        直连（绕过 OIDC）
```

## 性能优化

### 使用监听工具自动构建

```bash
cd ../frontend
pnpm run build -- --watch
```

### 只重启后端

```bash
docker compose -f docker-compose.yml -f compose.dev.yml restart backend
```

## 故障排查

### 问题：开发路由访问后端失败

**症状**：`https://arrow-dev.${DOMAIN}` 返回 502

**排查步骤**：
```bash
# 1. 检查后端容器状态
docker compose -f docker-compose.yml -f compose.dev.yml ps

# 2. 检查后端日志
docker compose -f docker-compose.yml -f compose.dev.yml logs backend

# 3. 检查 Traefik 路由
docker logs traefik | grep arrow-dev
```

**解决方法**：
```bash
# 重启后端
docker compose -f docker-compose.yml -f compose.dev.yml restart backend
```

### 问题：生产路由和开发路由行为不一致

**原因**：
- 生产路由经过 frontend nginx 代理
- 开发路由直连 backend

**验证方法**：
```bash
# 对比请求头
curl -v https://arrow.${DOMAIN}/api/ad-report
curl -v https://arrow-dev.${DOMAIN}/api/ad-report
```

### 问题：后端重启影响生产访问

**症状**：修改代码触发重载时，生产路由也暂时不可用

**解决方法**：
- 这是 overlay 模式的预期行为
- 如需完全隔离，请使用 HTTP 部署的独立容器模式
- 重载时间通常 < 2 秒，影响较小

## 日志查看

```bash
# 查看所有日志
docker compose -f docker-compose.yml -f compose.dev.yml logs -f

# 只查看后端日志
docker compose -f docker-compose.yml -f compose.dev.yml logs -f backend

# 只查看前端日志
docker compose -f docker-compose.yml -f compose.dev.yml logs -f frontend

# 过滤 arrow-dev 路由的日志
docker compose -f docker-compose.yml -f compose.dev.yml logs -f backend | grep arrow-dev
```

## 停止开发环境

```bash
./dev-stop.sh

# 或手动执行
docker compose -f docker-compose.yml -f compose.dev.yml down
```

## 切换到生产环境

```bash
# 停止开发环境
./dev-stop.sh

# 启动生产环境
./start.sh
```

## HTTP vs HTTPS 开发模式对比

| 特性 | HTTP (独立容器) | HTTPS (Overlay) |
|------|----------------|-----------------|
| 容器数量 | 4 | 2 |
| 生产隔离 | ✅ 完全隔离 | ❌ 共享后端 |
| 资源占用 | 较高 | 较低 |
| 同时测试 | ❌ | ✅ |
| TLS | ❌ | ✅ |
| 推荐场景 | 本地快速开发 | 生产环境调试 |

根据需求选择合适的部署模式：
- 快速开发、不关心 OIDC → 使用 HTTP
- 需要测试 OIDC 集成 → 使用 HTTPS
- 需要完全隔离开发和生产 → 使用 HTTP
