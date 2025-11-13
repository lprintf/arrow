# Arrow Demo 开发模式说明

## 开发模式 vs 生产模式

### 生产模式（默认）
- 在 Docker 中构建前端代码
- 适合部署到生产环境
- 使用方式：`docker compose up`

### 开发模式
- 本地构建前端代码，Docker 只运行 nginx
- 支持热重载（后端代码挂载）
- 可以访问 FastAPI 文档（/docs, /redoc）
- 使用方式：`docker compose -f compose.yml -f compose.dev.yml up`

## 开发模式使用步骤

### 1. 本地构建前端

```bash
cd frontend
pnpm install  # 或 npm install
pnpm run build  # 或 npm run build
```

这将在 `frontend/dist` 目录生成构建产物。

### 2. 启动开发环境

```bash
cd ..  # 回到 demo/arrow 目录
docker compose -f compose.yml -f compose.dev.yml up
```

### 3. 访问应用

- 主应用: https://arrow.127.0.0.1.sslip.io
- 开发直连（无中间件）: https://arrow-dev.127.0.0.1.sslip.io
- FastAPI 文档: https://arrow.127.0.0.1.sslip.io/docs

### 4. 前端热更新

当你修改前端代码后：

```bash
cd frontend
pnpm run build
```

刷新浏览器即可看到更新（nginx 会自动读取新的 dist 文件）。

### 5. 后端热重载

后端代码已经挂载到容器中，修改后会自动重载（uvicorn --reload）。

## 配置文件说明

- `Dockerfile`: 生产模式构建配置（多阶段构建）
- `nginx.conf.template`: 生产模式 nginx 配置
- `nginx.dev.conf.template`: 开发模式 nginx 配置（额外代理 /docs 路径）
- `compose.yml`: 基础 docker compose 配置
- `compose.dev.yml`: 开发模式覆盖配置（挂载卷、热重载）

## 架构参考

本配置参考了 `app/nano` 的开发模式架构，提供了：
- 本地构建 + 容器运行的灵活性
- 前后端代码热更新能力
- 生产/开发环境分离
