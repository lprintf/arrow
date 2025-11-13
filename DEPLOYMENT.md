# 部署指南

## Traefik 代理方式部署

本项目采用 Traefik 作为反向代理，实现 HTTPS 访问和服务发现。

### 架构说明

#### 生产模式架构

```
┌─────────────────────────────────────────────────────┐
│                   Traefik 代理                       │
│         (https://arrow.127.0.0.1.sslip.io)          │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
         ┌─────────────────┐
         │  Frontend (Nginx)│
         │     Port 80      │
         └────────┬─────────┘
                  │
                  │ /api/* 代理
                  ▼
         ┌─────────────────┐
         │  Backend (FastAPI)│
         │     Port 8000    │
         └─────────────────┘
```

#### 开发模式架构

开发模式下提供**两个 Traefik 路由**：

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

**路由说明：**

1. **生产路由** (`arrow.127.0.0.1.sslip.io`)
   - 通过 Frontend Nginx 访问
   - 包含所有中间件（如有认证需求）
   - 支持 API 和文档接口
   - 模拟生产环境

2. **开发路由** (`arrow-dev.127.0.0.1.sslip.io`)
   - 直接连接到 Backend，绕过 Frontend
   - **无任何中间件**
   - 用于 API 测试脚本
   - 仅在开发模式下可用

### 配置详解

#### 1. compose.yml（生产模式）

```yaml
services:
  backend:
    # 无端口映射，仅在内部网络访问
    networks:
      - lprintf

  frontend:
    labels:
      # 启用 Traefik
      - "traefik.enable=true"
      # 路由规则：匹配域名
      - "traefik.http.routers.arrow.rule=Host(`arrow.${DOMAIN:-127.0.0.1.sslip.io}`)"
      # 使用 websecure 入口点（HTTPS）
      - "traefik.http.routers.arrow.entrypoints=websecure"
      # 启用 TLS
      - "traefik.http.routers.arrow.tls=true"
      # 负载均衡器端口
      - "traefik.http.services.arrow-svc.loadbalancer.server.port=80"
    networks:
      - lprintf

networks:
  lprintf:
    external: true  # 使用外部网络
```

**特点：**
- ✅ 无端口映射，避免端口冲突
- ✅ 自动 HTTPS（通过 Traefik + sslip.io）
- ✅ 服务发现（通过 Docker labels）
- ✅ 后端不对外暴露，仅通过前端 nginx 代理访问

#### 2. compose.dev.yml（开发模式）

```yaml
services:
  backend:
    # 热重载
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
    volumes:
      # 挂载代码目录
      - ./backend/main.py:/app/main.py:ro
    labels:
      # 开发路由：直连后端，无中间件
      - "traefik.enable=true"
      - "traefik.http.routers.arrow-dev.rule=Host(`arrow-dev.${DOMAIN:-127.0.0.1.sslip.io}`)"
      - "traefik.http.routers.arrow-dev.entrypoints=websecure"
      - "traefik.http.routers.arrow-dev.tls=true"
      - "traefik.http.routers.arrow-dev.service=arrow-backend-dev-svc"
      - "traefik.http.services.arrow-backend-dev-svc.loadbalancer.server.port=8000"

  frontend:
    volumes:
      # 挂载构建产物，无需重建镜像
      - ./frontend/dist:/usr/share/nginx/html:ro
      # 挂载开发模式 nginx 配置（包含 /docs 和 /redoc 代理）
      - ./frontend/nginx.dev.conf:/etc/nginx/conf.d/default.conf:ro
```

**特点：**
- ✅ 后端代码热重载
- ✅ 前端只需 `npm run build` 即可更新
- ✅ 开发路由直连后端，方便测试
- ✅ 生产路由保持完整，模拟生产环境
- ✅ 同一个后端容器，两个入口

#### 3. nginx.dev.conf（开发模式 Nginx 配置）

开发模式下，Nginx 额外代理 FastAPI 文档接口：

```nginx
# 开发模式：代理 FastAPI 文档接口
location ~ ^/(docs|redoc|openapi.json)$ {
    proxy_pass http://backend:8000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 启动步骤

#### 生产模式

```bash
cd /home/lprintf/workspace/omni-server/demo/arrow

# 启动
docker compose up -d --build

# 查看状态
docker compose ps

# 查看日志
docker compose logs -f

# 访问
# https://arrow.127.0.0.1.sslip.io
```

#### 开发模式

```bash
# 首次构建
docker compose build

# 启动开发模式
docker compose -f compose.yml -f compose.dev.yml up

# 前端开发：修改代码后
cd frontend && npm run build

# 后端开发：保存文件后自动重载
# 查看重载日志
docker compose logs -f backend
```

### 访问地址

#### 生产模式

- **前端应用**: https://arrow.127.0.0.1.sslip.io
- **后端API**（通过前端nginx代理）: https://arrow.127.0.0.1.sslip.io/api/

#### 开发模式

- **生产路由（前端 + API）**: https://arrow.127.0.0.1.sslip.io
- **开发路由（仅后端）**: https://arrow-dev.127.0.0.1.sslip.io
- **Swagger UI**: https://arrow.127.0.0.1.sslip.io/docs
- **ReDoc**: https://arrow.127.0.0.1.sslip.io/redoc
- **OpenAPI Schema**: https://arrow.127.0.0.1.sslip.io/openapi.json

#### 自定义域名

设置环境变量 `DOMAIN=your-domain.com`，访问：
- 生产: https://arrow.your-domain.com
- 开发: https://arrow-dev.your-domain.com

### 开发模式 API 测试

#### 使用测试脚本

项目提供了 `test-api.py` 测试脚本，用于验证开发路由的 API 接口。

**基本用法：**

```bash
# 使用默认配置（arrow-dev.127.0.0.1.sslip.io）
python test-api.py

# 指定其他开发环境 URL
python test-api.py --base-url https://arrow-dev.mydomain.com
```

**测试内容：**
- ✅ 健康检查端点
- ✅ 统计信息端点
- ✅ 广告日报表 API（包含各种筛选参数）
- ✅ 用户-SKU日志 API（包含事件类型和时间筛选）

**示例输出：**

```
======================================
Apache Arrow 性能测试 API 测试
======================================
目标URL: https://arrow-dev.127.0.0.1.sslip.io

======================================
1. 测试健康检查
======================================
状态码: 200
响应: {'service': 'Arrow Performance Test API', 'status': 'ok', ...}
✓ 健康检查通过

======================================
2. 测试统计信息
======================================
状态码: 200

广告日报表:
  - 总记录数: 30000
  - 文件大小: 2.02 MB

用户-SKU日志:
  - 总记录数: 100000
  - 文件大小: 5.58 MB

✓ 统计信息获取成功

...

======================================
✓ 所有测试通过！
======================================
```

#### 使用 httpx 脚本

如果需要编写自定义测试脚本，参考以下示例：

```python
import httpx
import asyncio

async def test_arrow_api():
    async with httpx.AsyncClient(verify=False) as client:
        # 使用开发路由
        response = await client.get(
            "https://arrow-dev.127.0.0.1.sslip.io/api/stats"
        )
        print(response.json())

asyncio.run(test_arrow_api())
```

#### 开发路由优势

开发路由方案的优点：
1. **无需额外容器**：使用 Traefik 路由，不需要启动单独的 backend-dev 容器
2. **配置简洁**：只需添加几行 labels 配置
3. **资源高效**：同一个 backend 容器，两个入口
4. **职责清晰**：
   - 生产路由：测试完整的中间件流程
   - 开发路由：快速 API 测试，无中间件干扰

### 网络配置

项目使用外部网络 `lprintf`，需要预先创建：

```bash
# 检查网络
docker network ls | grep lprintf

# 创建网络（如果不存在）
docker network create lprintf
```

### 故障排查

#### 无法访问 https://arrow.127.0.0.1.sslip.io

1. **检查 Traefik 是否运行**
   ```bash
   docker ps | grep traefik
   ```

2. **检查容器状态**
   ```bash
   docker compose ps
   ```

3. **检查网络连接**
   ```bash
   docker network inspect lprintf
   ```

4. **查看 Traefik 日志**
   ```bash
   docker logs <traefik-container-id>
   ```

5. **检查容器是否在正确的网络**
   ```bash
   docker inspect arrow-frontend-1 | grep -A 10 Networks
   ```

#### 后端健康检查失败

```bash
# 查看后端日志
docker compose logs backend

# 进入后端容器检查
docker compose exec backend curl http://localhost:8000/
```

#### 前端无法连接后端

```bash
# 检查 nginx 配置
docker compose exec frontend cat /etc/nginx/conf.d/default.conf

# 测试后端连接
docker compose exec frontend curl http://backend:8000/
```

### 自定义配置

#### 修改域名

```bash
# 方法1：环境变量
export DOMAIN=myapp.example.com
docker compose up -d

# 方法2：.env 文件
echo "DOMAIN=myapp.example.com" > .env
docker compose up -d
```

#### 添加认证中间件

在 `compose.yml` 中添加中间件：

```yaml
frontend:
  labels:
    - "traefik.http.routers.arrow.middlewares=auth@file"
```

### 性能优化

1. **启用 Gzip 压缩**（nginx.conf 已配置）
2. **缓存静态资源**（nginx.conf 已配置）
3. **使用 CDN**：将前端资源部署到 CDN
4. **数据库优化**：项目使用静态文件，无需优化
5. **水平扩展**：通过 Traefik 负载均衡器扩展多个前端实例

### 监控和日志

```bash
# 实时日志
docker compose logs -f

# 查看特定服务日志
docker compose logs -f backend
docker compose logs -f frontend

# 导出日志
docker compose logs > arrow.log
```

### 备份和恢复

```bash
# 备份数据文件
tar -czf arrow-data-backup.tar.gz data/*.arrow

# 恢复
tar -xzf arrow-data-backup.tar.gz
```

### 卸载

```bash
# 停止服务
docker compose down

# 删除镜像
docker compose down --rmi all

# 删除数据（可选）
rm -rf data/*.arrow
```
