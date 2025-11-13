#!/bin/bash

# 测试脚本：验证Apache Arrow性能测试项目

echo "======================================"
echo "Apache Arrow 性能测试项目验证"
echo "======================================"

# 检查数据文件
echo ""
echo "1. 检查数据文件..."
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

# 检查后端文件
echo ""
echo "2. 检查后端文件..."
for file in backend/main.py backend/requirements.txt backend/Dockerfile; do
    if [ -f "$file" ]; then
        echo "✓ $file"
    else
        echo "✗ $file 缺失"
        exit 1
    fi
done

# 检查前端文件
echo ""
echo "3. 检查前端文件..."
for file in frontend/package.json frontend/vite.config.ts frontend/src/App.tsx frontend/src/pages/AdReport.tsx frontend/src/pages/UserSkuLogs.tsx; do
    if [ -f "$file" ]; then
        echo "✓ $file"
    else
        echo "✗ $file 缺失"
        exit 1
    fi
done

# 测试后端
echo ""
echo "4. 测试后端API..."
echo "启动后端服务（端口9999）..."
cd backend
uv run --with fastapi --with uvicorn --with pyarrow uvicorn main:app --host 127.0.0.1 --port 9999 > /tmp/arrow_test_backend.log 2>&1 &
BACKEND_PID=$!
cd ..

sleep 3

# 测试API
if curl -s -f http://127.0.0.1:9999/ > /dev/null; then
    echo "✓ 后端健康检查通过"
else
    echo "✗ 后端启动失败"
    cat /tmp/arrow_test_backend.log
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

if curl -s -f http://127.0.0.1:9999/api/stats > /dev/null; then
    echo "✓ 统计API正常"
    curl -s http://127.0.0.1:9999/api/stats | python3 -m json.tool | head -10
else
    echo "✗ API请求失败"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

# 清理
echo ""
echo "清理测试进程..."
kill $BACKEND_PID 2>/dev/null
sleep 1

echo ""
echo "======================================"
echo "✓ 所有检查通过！"
echo "======================================"
echo ""
echo "下一步："
echo "  1. 使用Docker Compose启动完整应用："
echo "     docker compose up --build"
echo ""
echo "  2. 或本地开发模式："
echo "     终端1: cd backend && uv run --with fastapi --with uvicorn --with pyarrow uvicorn main:app --reload"
echo "     终端2: cd frontend && npm install && npm run dev"
echo ""
