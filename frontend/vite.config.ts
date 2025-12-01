import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
        manualChunks: {
          // React 核心
          react: ['react', 'react-dom', 'react/jsx-runtime'],
          // React Router
          router: ['react-router-dom'],
          // Ant Design 核心（不含图标）
          'antd-core': ['antd'],
          // Ant Design 图标单独打包
          'antd-icons': ['@ant-design/icons'],
          // 数据处理库（Arrow 和 Arquero 比较大）
          'data-processing': ['apache-arrow', 'arquero'],
          // 图表库
          charts: ['echarts', 'echarts-for-react'],
          // 工具库
          utils: ['dayjs']
        },
      },
    },
    // 启用更激进的代码分割
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // 生产环境移除 console
        drop_debugger: true,
        pure_funcs: ['console.log']
      }
    }
  },
})
