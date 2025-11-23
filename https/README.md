# Arrow HTTPS 部署

HTTPS 部署配置，使用 `gateway-https` 网络和 TLS 加密，适合生产环境。

## 快速开始

### 生产环境

```bash
./start.sh
```

访问地址：`https://arrow.${DOMAIN}`（需要 OIDC 认证）

### 开发环境（Overlay 模式）

```bash
./dev.sh
```

访问地址：
- 生产环境：`https://arrow.${DOMAIN}`（OIDC 认证）
- 开发环境：`https://arrow-dev.${DOMAIN}`（直连后端，绕过认证）

## 环境变量

编辑 `.env` 文件配置：

```bash
COMPOSE_PROJECT_NAME=arrow-https
DOMAIN=moondeity.dpdns.org
```

## 服务说明

### 生产环境

- **backend**: FastAPI 后端服务，提供 Arrow 格式 API
- **frontend**: Nginx 静态文件服务器，代理 API 请求到后端

### 开发环境（Overlay 模式）

开发模式使用 **overlay** 配置，在同一个容器中启用开发特性：

- **backend**:
  - 生产路由：通过 `frontend` 访问，经过 OIDC 认证
  - 开发路由：`https://arrow-dev.${DOMAIN}` 直连后端，绕过认证
  - 启用热重载：`--reload` 参数

- **frontend**: 挂载本地构建产物和开发配置

## 开发模式对比

| 特性 | HTTP 独立容器模式 | HTTPS Overlay 模式 |
|------|-----------------|-------------------|
| 容器数量 | 4个（backend, frontend, backend-dev, frontend-dev） | 2个（backend, frontend）|
| 生产访问 | 与开发隔离 | 同时可用 |
| 开发访问 | `http://arrow-dev.${DOMAIN}` | `https://arrow-dev.${DOMAIN}` |
| TLS | 否 | 是 |
| 资源占用 | 较高 | 较低 |
| 适用场景 | 本地开发 | 生产调试 |

详见 [dev.md](./dev.md)

## 常用命令

```bash
# 查看日志
docker compose logs -f

# 查看特定服务日志（开发环境）
docker compose -f docker-compose.yml -f compose.dev.yml logs -f backend

# 停止服务
./stop.sh

# 停止开发环境
./dev-stop.sh

# 重建镜像
docker compose build

# 清理数据
docker compose down -v
```

## 网络配置

使用外部网络 `gateway-https`，需要预先创建：

```bash
docker network create gateway-https
```

## Traefik 路由

### 生产环境

- **Host**: `arrow.${DOMAIN}`
- **EntryPoint**: `websecure` (HTTPS)
- **TLS**: 启用
- **Middlewares**: `strip-user-headers@file`, `oidc-auth@file`

### 开发环境（直连后端）

- **Host**: `arrow-dev.${DOMAIN}`
- **EntryPoint**: `websecure` (HTTPS)
- **TLS**: 启用
- **Middlewares**: `strip-user-headers@file`（不使用 OIDC 认证）
- **Service**: `arrow-backend-dev-svc`（直接路由到后端 8000 端口）

## 故障排查

### 问题：HTTPS 证书错误

检查 Traefik 证书配置：
```bash
docker logs traefik | grep arrow
```

### 问题：OIDC 认证失败

检查 OIDC 中间件配置：
```bash
cat /opt/traefik/dynamic-config/middlewares.yml | grep oidc
```

### 问题：开发路由无法访问

检查是否使用了 `compose.dev.yml`：
```bash
docker compose -f docker-compose.yml -f compose.dev.yml ps
```

检查后端标签：
```bash
docker inspect arrow-https-backend | grep -A 10 Labels
```
