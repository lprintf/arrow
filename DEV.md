# 百万数据全栈性能测试 - 开发者指南

## 开发模式架构

本项目参考 `app/nano` 的开发调试配置，通过 Traefik labels 实现双路由架构：

### 路由架构

```
┌────────────────────────────────────────────────────────────┐
│                        Traefik 代理                         │
└────────────┬───────────────────────────────────┬───────────┘
             │                                   │
             │ 生产路由                          │ 开发路由
             │ arrow.127.0.0.1.sslip.io          │ arrow-dev.127.0.0.1.sslip.io
             ▼                                   ▼
    ┌─────────────────┐                 ┌─────────────────┐
    │ Frontend (Nginx)│                 │  Backend        │
    │  - /             │                 │  (直连)         │
    │  - /api/*  ────►│                 │  Port 8000      │
    │  - /docs*  ────►│────────────────►│                 │
    │  - /redoc* ────►│                 │  无中间件       │
    └─────────────────┘                 └─────────────────┘
             │
             │ /api/* 代理
             ▼
    ┌─────────────────┐
    │  Backend        │
    │  Port 8000      │
    └─────────────────┘
```

### 访问地址

#### 生产路由（模拟生产环境）
- **前端应用**: https://arrow.127.0.0.1.sslip.io
- **API**: https://arrow.127.0.0.1.sslip.io/api/
- **文档**: https://arrow.127.0.0.1.sslip.io/docs

#### 开发路由（用于API测试）
- **直连后端**: https://arrow-dev.127.0.0.1.sslip.io
- **API**: https://arrow-dev.127.0.0.1.sslip.io/api/
- **文档**: https://arrow-dev.127.0.0.1.sslip.io/docs

## 开发实践

### 1. 启动开发模式

```bash
# 首次构建
docker compose build

# 启动开发模式
docker compose -f compose.yml -f compose.dev.yml up

# 后台运行
docker compose -f compose.yml -f compose.dev.yml up -d
```

### 2. 前端开发

```bash
cd frontend

# 修改代码后构建
pnpm run build

# 刷新浏览器即可看到更新
```

### 3. 后端开发

后端代码修改后会自动热重载，无需重启容器。

查看重载日志：
```bash
docker compose logs -f backend
```

### 4. API 测试

#### 使用测试脚本（推荐）

```bash
# 测试开发路由
python test-api.py

# 自定义URL
python test-api.py --base-url https://arrow-dev.mydomain.com
```

#### 使用 curl

```bash
# 通过开发路由测试
curl -k https://arrow-dev.127.0.0.1.sslip.io/api/stats

# 通过生产路由测试
curl -k https://arrow.127.0.0.1.sslip.io/api/stats
```

#### 使用 httpx 脚本

```python
import httpx
import asyncio

async def test():
    async with httpx.AsyncClient(verify=False) as client:
        # 使用开发路由
        r = await client.get("https://arrow-dev.127.0.0.1.sslip.io/api/stats")
        print(r.json())

asyncio.run(test())
```

## 配置说明

### compose.dev.yml 关键配置

```yaml
services:
  backend:
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
    volumes:
      - ./backend/main.py:/app/main.py:ro  # 热重载
    labels:
      # 开发路由：直连后端，无中间件
      - "traefik.http.routers.arrow-dev.rule=Host(`arrow-dev.${DOMAIN:-127.0.0.1.sslip.io}`)"
      - "traefik.http.routers.arrow-dev.service=arrow-backend-dev-svc"
      - "traefik.http.services.arrow-backend-dev-svc.loadbalancer.server.port=8000"

  frontend:
    volumes:
      - ./frontend/dist:/usr/share/nginx/html:ro
      - ./frontend/nginx.dev.conf:/etc/nginx/conf.d/default.conf:ro
```

### nginx.dev.conf 关键配置

```nginx
# 开发模式：代理 FastAPI 文档接口
location ~ ^/(docs|redoc|openapi.json)$ {
    proxy_pass http://backend:8000;
    ...
}
```

## 开发技巧

### 1. 快速重启服务

```bash
# 仅重启后端
docker compose restart backend

# 仅重启前端
docker compose restart frontend
```

### 2. 查看实时日志

```bash
# 所有服务
docker compose logs -f

# 特定服务
docker compose logs -f backend
docker compose logs -f frontend
```

### 3. 进入容器调试

```bash
# 进入后端容器
docker compose exec backend sh

# 测试内部连接
docker compose exec backend curl http://localhost:8000/api/stats
```

### 4. 清理和重建

```bash
# 停止并删除容器
docker compose down

# 重建镜像
docker compose build --no-cache

# 重新启动
docker compose -f compose.yml -f compose.dev.yml up -d
```

## 性能分析

### 1. 测试数据传输

```bash
# 测试 Arrow 数据大小
curl -k https://arrow-dev.127.0.0.1.sslip.io/api/ad-report \
  -o /tmp/ad-report.arrow \
  -w "Downloaded: %{size_download} bytes in %{time_total}s\n"
```

### 2. 浏览器性能分析

1. 打开浏览器开发者工具
2. 访问 https://arrow.127.0.0.1.sslip.io
3. 在 Network 面板查看：
   - 数据传输大小
   - 加载时间
   - Arrow vs JSON 对比
4. 在 Performance 面板分析：
   - 前端计算耗时
   - 渲染性能

## 故障排查

### 开发路由无法访问

```bash
# 1. 检查 Traefik 配置
docker compose -f compose.yml -f compose.dev.yml config | grep arrow-dev

# 2. 检查容器状态
docker compose ps

# 3. 检查后端日志
docker compose logs backend

# 4. 测试容器内部访问
docker compose exec backend curl http://localhost:8000/
```

### 热重载不工作

```bash
# 1. 确认使用了 compose.dev.yml
docker compose -f compose.yml -f compose.dev.yml up

# 2. 检查卷挂载
docker compose exec backend ls -la /app/

# 3. 查看 uvicorn 日志
docker compose logs -f backend
```

### 前端更新不生效

```bash
# 1. 确认构建成功
cd frontend && npm run build

# 2. 检查 dist 目录
ls -la frontend/dist

# 3. 重启前端容器
docker compose restart frontend

# 4. 清除浏览器缓存
# Ctrl+Shift+R 或 Cmd+Shift+R
```

## 参考资料

- [开发者注意事项](../../docs/开发者注意事项.md)
- [app/nano 示例项目](../../app/nano/)
- [DEPLOYMENT.md](./DEPLOYMENT.md) - 完整部署指南
- [README.md](./README.md) - 项目概述
