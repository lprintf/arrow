# Arrow HTTP 部署

HTTP 部署配置，使用 `gateway-http` 网络，适合本地开发和测试。

## 快速开始

### 生产环境

```bash
./start.sh
```

访问地址：`http://arrow.${DOMAIN}`（需要 OIDC 认证）

### 开发环境

```bash
./dev.sh
```

访问地址：
- 开发环境：`http://arrow-dev.${DOMAIN}`（绕过认证）
- API 文档：`http://arrow-dev.${DOMAIN}/docs`

## 环境变量

编辑 `.env` 文件配置：

```bash
COMPOSE_PROJECT_NAME=arrow-http
DOMAIN=moondeity.dpdns.org
```

## 服务说明

### 生产环境

- **backend**: FastAPI 后端服务，提供 Arrow 格式 API
- **frontend**: Nginx 静态文件服务器，代理 API 请求到后端

### 开发环境

- **backend-dev**: 独立的开发后端容器，启用热重载
- **frontend-dev**: 独立的开发前端容器，挂载本地构建产物

## 开发特性

- ✅ **后端热重载**：修改 `backend/arrow_service/` 代码自动生效
- ✅ **前端快速更新**：在 `frontend/` 目录运行 `pnpm run build` 后刷新浏览器
- ✅ **绕过认证**：开发环境不需要 OIDC 登录
- ✅ **API 文档**：可访问 `/docs` 和 `/redoc`

详见 [dev.md](./dev.md)

## 常用命令

```bash
# 查看日志
docker compose logs -f

# 查看特定服务日志（开发环境）
docker compose -f docker-compose.yml -f compose.dev.yml logs -f backend-dev

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

使用外部网络 `gateway-http`，需要预先创建：

```bash
docker network create gateway-http
```

## Traefik 路由

### 生产环境

- **Host**: `arrow.${DOMAIN}`
- **EntryPoint**: `web` (HTTP)
- **Middlewares**: `strip-user-headers@file`, `oidc-auth@file`

### 开发环境

- **Host**: `arrow-dev.${DOMAIN}`
- **EntryPoint**: `web` (HTTP)
- **Middlewares**: `strip-user-headers@file`（不使用 OIDC 认证）

## 故障排查

### 问题：容器无法启动

检查网络是否存在：
```bash
docker network ls | grep gateway-http
```

### 问题：API 返回 404

检查 backend 容器是否运行：
```bash
docker compose ps
```

检查 nginx 配置：
```bash
docker exec arrow-http-frontend-dev cat /etc/nginx/conf.d/default.conf
```

### 问题：开发模式热重载不工作

检查代码挂载：
```bash
docker compose -f docker-compose.yml -f compose.dev.yml config
```
