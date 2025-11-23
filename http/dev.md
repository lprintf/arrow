# Arrow HTTP 开发模式

HTTP 开发模式提供快速的开发体验，支持代码热重载和绕过认证。

## 快速开始

```bash
./dev.sh
```

访问地址：
- 开发环境：`http://arrow-dev.${DOMAIN}`
- API 文档：`http://arrow-dev.${DOMAIN}/docs`
- API 交互文档：`http://arrow-dev.${DOMAIN}/redoc`

## 开发特性

### 后端热重载

修改 `backend/arrow_service/` 目录下的代码后，uvicorn 会自动检测并重新加载：

```bash
# 修改代码
vim ../backend/arrow_service/main.py

# 观察日志确认重载
docker compose -f docker-compose.yml -f compose.dev.yml logs -f backend-dev

# 看到类似输出表示成功：
# INFO:     Waiting for application startup.
# INFO:     Application startup complete.
```

### 前端快速更新

修改前端代码后，只需重新构建：

```bash
cd ../frontend
pnpm run build

# 刷新浏览器（Ctrl/Cmd + Shift + R 强制刷新缓存）
```

**工作原理**：
- `compose.dev.yml` 挂载了本地 `frontend/dist` 目录到容器
- 无需重建镜像，直接替换静态文件
- Nginx 立即提供新的构建文件

### 绕过认证

开发环境不使用 OIDC 中间件，可以直接访问所有 API：

```bash
# 直接访问 API（无需登录）
curl http://arrow-dev.${DOMAIN}/api/ad-report

# 访问 API 文档
open http://arrow-dev.${DOMAIN}/docs
```

## 开发流程

### 场景 1：修改后端 API

```bash
# 1. 修改代码
vim ../backend/arrow_service/main.py

# 2. 等待 1-2 秒，观察日志确认重载
docker compose -f docker-compose.yml -f compose.dev.yml logs -f backend-dev

# 3. 测试新的 API
curl http://arrow-dev.${DOMAIN}/api/your-endpoint
```

### 场景 2：修改前端 UI

```bash
# 1. 修改代码
vim ../frontend/src/pages/AdReport.tsx

# 2. 重新构建
cd ../frontend
pnpm run build

# 3. 刷新浏览器（强制刷新缓存）
# Ctrl/Cmd + Shift + R
```

### 场景 3：修改数据生成

```bash
# 1. 修改数据生成脚本
vim ../data/generate_data.py

# 2. 重新生成数据
cd ../data
uv run --with pyarrow --with numpy generate_data.py

# 3. 重启后端容器加载新数据
docker compose -f docker-compose.yml -f compose.dev.yml restart backend-dev

# 4. 刷新浏览器
```

## 配置说明

### compose.dev.yml

开发模式使用独立容器，不影响生产环境：

```yaml
services:
  backend-dev:
    command: uvicorn arrow_service.main:app --reload  # 热重载
    volumes:
      - ../backend/arrow_service:/app/arrow_service:ro  # 挂载代码
      - ../data:/app/data:ro  # 挂载数据

  frontend-dev:
    volumes:
      - ../frontend/dist:/usr/share/nginx/html:ro  # 挂载构建产物
      - ../frontend/nginx.dev.conf.template:/etc/nginx/templates/default.conf.template:ro
```

### Traefik 路由

开发路由绕过 OIDC 认证：

```yaml
labels:
  - traefik.http.routers.arrow-http-dev.rule=Host(`arrow-dev.${DOMAIN}`)
  - traefik.http.routers.arrow-http-dev.middlewares=strip-user-headers@file
  # 注意：不包含 oidc-auth@file 中间件
```

## 性能优化

### 自动构建前端

使用 Vite 的 watch 模式或 nodemon：

```bash
cd ../frontend

# 方式一：Vite build --watch
pnpm run build -- --watch

# 方式二：使用 nodemon
pnpm install -g nodemon
nodemon --watch src --exec "pnpm run build"
```

### 选择性重启

只重启需要的服务：

```bash
# 只重启后端
docker compose -f docker-compose.yml -f compose.dev.yml restart backend-dev

# 只重启前端
docker compose -f docker-compose.yml -f compose.dev.yml restart frontend-dev
```

## 故障排查

### 问题：后端修改后没有重载

**症状**：修改代码但 API 行为未变化

**排查步骤**：
```bash
# 1. 检查容器是否使用了开发配置
docker inspect arrow-http-backend-dev | grep -A 5 "Mounts"

# 2. 确认 uvicorn 是否启用了 --reload
docker exec arrow-http-backend-dev ps aux | grep uvicorn

# 3. 查看日志
docker compose -f docker-compose.yml -f compose.dev.yml logs backend-dev
```

**解决方法**：
```bash
# 确保使用了 compose.dev.yml
docker compose -f docker-compose.yml -f compose.dev.yml restart backend-dev
```

### 问题：前端构建后浏览器看不到变化

**症状**：`pnpm run build` 成功但浏览器显示旧内容

**排查步骤**：
```bash
# 1. 检查 dist 目录是否更新
ls -lh ../frontend/dist/assets/

# 2. 检查容器挂载
docker exec arrow-http-frontend-dev ls -lh /usr/share/nginx/html/assets/

# 3. 检查浏览器缓存
# 使用 Ctrl/Cmd + Shift + R 强制刷新
```

**解决方法**：
```bash
# 清除浏览器缓存或使用无痕模式
# 或在 nginx 配置中禁用缓存（仅开发环境）
```

### 问题：API 文档访问不了

**症状**：`http://arrow-dev.${DOMAIN}/docs` 返回 404

**原因**：生产环境的 nginx 配置不包含 `/docs` 代理

**解决方法**：
```bash
# 确保使用了 compose.dev.yml 和 nginx.dev.conf.template
docker compose -f docker-compose.yml -f compose.dev.yml ps
docker exec arrow-http-frontend-dev cat /etc/nginx/conf.d/default.conf | grep docs
```

## 日志查看

```bash
# 查看所有开发环境日志
docker compose -f docker-compose.yml -f compose.dev.yml logs -f

# 只查看后端日志
docker compose -f docker-compose.yml -f compose.dev.yml logs -f backend-dev

# 只查看前端日志
docker compose -f docker-compose.yml -f compose.dev.yml logs -f frontend-dev

# 查看最近 50 行
docker compose -f docker-compose.yml -f compose.dev.yml logs --tail 50
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
