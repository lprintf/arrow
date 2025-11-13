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

FROM nginx:1.25-alpine

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["/docker-entrypoint.sh", "nginx", "-g", "daemon off;"]
