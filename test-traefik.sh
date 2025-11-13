#!/bin/bash

# 测试脚本：验证Apache Arrow性能测试项目（Traefik代理模式）

echo "======================================"
echo "Apache Arrow 性能测试项目验证"
echo "（使用 Traefik 代理）"
echo "======================================"

# 检查 lprintf 网络
echo ""
echo "1. 检查 Docker 网络..."
if docker network ls | grep -q lprintf; then
    echo "✓ lprintf 网络存在"
else
    echo "✗ lprintf 网络不存在，正在创建..."
    docker network create lprintf
    if [ $? -eq 0 ]; then
        echo "✓ lprintf 网络创建成功"
    else
        echo "✗ 创建失败，请手动执行: docker network create lprintf"
        exit 1
    fi
fi

# 检查数据文件
echo ""
echo "2. 检查数据文件..."
if [ -f "data/ad_report.arrow" ]; then
    echo "✓ ad_report.arrow 存在 ($(du -h data/ad_report.arrow | cut -f1))"
else
    echo "✗ ad_report.arrow 不存在，请先运行: cd data && uv run --with pyarrow --with numpy generate_data.py"
    exit 1
fi

if [ -f "data/user_sku_logs.arrow" ]; then
    echo "✓ user_sku_logs.arrow 存在 ($(du -h data/user_sku_logs.arrow | cut -f1))"
else
    echo "✗ user_sku_logs.arrow 不存在"
    exit 1
fi

# 检查配置文件
echo ""
echo "3. 检查 Docker Compose 配置..."
for file in compose.yml compose.dev.yml backend/Dockerfile frontend/Dockerfile frontend/nginx.conf; do
    if [ -f "$file" ]; then
        echo "✓ $file"
    else
        echo "✗ $file 缺失"
        exit 1
    fi
done

# 检查 Traefik 标签配置
echo ""
echo "4. 检查 Traefik 配置..."
if grep -q "traefik.enable=true" compose.yml; then
    echo "✓ Traefik 标签已配置"
else
    echo "✗ Traefik 标签未配置"
    exit 1
fi

if grep -q "arrow.127.0.0.1.sslip.io" compose.yml; then
    echo "✓ 域名配置正确: arrow.127.0.0.1.sslip.io"
else
    echo "⚠ 未找到默认域名配置"
fi

echo ""
echo "======================================"
echo "✓ 所有检查通过！"
echo "======================================"
echo ""
echo "下一步："
echo ""
echo "  1. 启动应用（生产模式）："
echo "     docker compose up -d --build"
echo ""
echo "  2. 启动应用（开发模式，支持热重载）："
echo "     docker compose -f compose.yml -f compose.dev.yml up --build"
echo ""
echo "  3. 访问应用："
echo "     https://arrow.127.0.0.1.sslip.io"
echo ""
echo "  4. 查看服务状态："
echo "     docker compose ps"
echo ""
echo "  5. 查看日志："
echo "     docker compose logs -f"
echo ""
echo "  6. 停止服务："
echo "     docker compose down"
echo ""
