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
            百万数据全栈性能测试
          </div>
          <Menu theme="dark" mode="horizontal" defaultSelectedKeys={['ad-report']} style={{ flex: 1, minWidth: 0 }}>
            <Menu.Item key="ad-report">
              <Link to="/">稠密数据场景（百万级）</Link>
            </Menu.Item>
            <Menu.Item key="user-sku-logs">
              <Link to="/user-sku-logs">稀疏数据场景（代亿级）</Link>
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
