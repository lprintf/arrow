import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { Layout, Menu } from 'antd'
import AdReport from './pages/AdReport'
import UserSkuLogs from './pages/UserSkuLogs'

const { Header, Content } = Layout

function App() {
  return (
    <BrowserRouter>
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ color: 'white', fontSize: '20px', fontWeight: 'bold', marginRight: '40px' }}>
            Apache Arrow 性能测试
          </div>
          <Menu theme="dark" mode="horizontal" defaultSelectedKeys={['ad-report']} style={{ flex: 1, minWidth: 0 }}>
            <Menu.Item key="ad-report">
              <Link to="/">广告日报表分析</Link>
            </Menu.Item>
            <Menu.Item key="user-sku-logs">
              <Link to="/user-sku-logs">用户-SKU互动日志</Link>
            </Menu.Item>
          </Menu>
        </Header>
        <Content style={{ padding: '24px', background: '#f0f2f5' }}>
          <Routes>
            <Route path="/" element={<AdReport />} />
            <Route path="/user-sku-logs" element={<UserSkuLogs />} />
          </Routes>
        </Content>
      </Layout>
    </BrowserRouter>
  )
}

export default App
