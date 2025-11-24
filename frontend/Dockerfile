FROM node:20-alpine AS build

WORKDIR /app

# Copy dependency files for better caching
COPY package.json ./

# Install dependencies
RUN npm install

# Copy configuration files
COPY tsconfig.json tsconfig.node.json vite.config.ts index.html ./

# Copy source code and assets
COPY src ./src

# Build application
RUN npm run build

FROM nginx:1.27-alpine

# nginx 配置通过 docker-compose volume 挂载到 /etc/nginx/templates/default.conf.template

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
