import React, { useEffect, useMemo, useState } from 'react';
import { App as AntApp, Avatar, Button, Card, Descriptions, Form, Input, Layout, Menu, message, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import { ApartmentOutlined, AuditOutlined, ControlOutlined, HomeOutlined, TeamOutlined } from '@ant-design/icons';

const { Header, Sider, Content } = Layout;
const API_ROOT = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

function request(path, options = {}) {
  const token = localStorage.getItem('guestqr_access_token');
  return fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
  }).then(async (response) => {
    if (!response.ok) throw new Error((await response.json()).error?.message || 'Request failed');
    return response.status === 204 ? null : response.json();
  });
}

function AdminDashboard() {
  const [section, setSection] = useState('overview');
  const [hotel, setHotel] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [staff, setStaff] = useState([]);
  const [managedMenuItems, setManagedMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [content, setContent] = useState([]);
  const [guide, setGuide] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const load = async () => {
    setLoading(true);
    try {
      const [hotelResult] = await Promise.all([request('/hotels/me')]);
      setHotel(hotelResult.hotel);
      if (hotelResult.hotel?.id) {
        const [roomResult, staffResult, menuResult, categoryResult, contentResult, guideResult, analyticsResult, reviewResult] = await Promise.all([
          request(`/hotels/${hotelResult.hotel.id}/rooms`),
          request(`/hotels/${hotelResult.hotel.id}/staff`),
          request(`/hotels/${hotelResult.hotel.id}/menu/items`),
          request(`/hotels/${hotelResult.hotel.id}/menu/categories`),
          request(`/hotels/${hotelResult.hotel.id}/content`),
          request(`/hotels/${hotelResult.hotel.id}/local-guide`),
          request(`/hotels/${hotelResult.hotel.id}/analytics`),
          request(`/hotels/${hotelResult.hotel.id}/reviews`)
        ]);
        setRooms(roomResult.rooms);
        setStaff(staffResult.staff);
        setManagedMenuItems(menuResult.items);
        setCategories(categoryResult.categories);
        setContent(contentResult.content);
        setGuide(guideResult.items);
        setAnalytics(analyticsResult);
        setReviews(reviewResult.reviews);
      }
    } catch (error) {
      messageApi.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const roomColumns = useMemo(() => [
    { title: 'Room', dataIndex: 'roomNumber' },
    { title: 'Name', dataIndex: 'name', render: (value) => value || '—' },
    { title: 'Floor', dataIndex: 'floor', render: (value) => value || '—' },
    { title: 'Status', dataIndex: 'status', render: (value) => <Tag color={value === 'ACTIVE' ? 'green' : 'default'}>{value}</Tag> }
  ], []);
  const staffColumns = useMemo(() => [
    { title: 'Email', dataIndex: 'email' },
    { title: 'Role', dataIndex: 'role' },
    { title: 'Department', dataIndex: 'department', render: (value) => value || '—' },
    { title: 'Status', dataIndex: 'active', render: (value) => <Tag color={value ? 'green' : 'red'}>{value ? 'Active' : 'Inactive'}</Tag> }
  ], []);

  const menuItems = [
    { key: 'overview', icon: <HomeOutlined />, label: 'Overview' },
    { key: 'profile', icon: <ApartmentOutlined />, label: 'Hotel profile' },
    { key: 'rooms', icon: <ControlOutlined />, label: 'Rooms' },
    { key: 'staff', icon: <TeamOutlined />, label: 'Staff & permissions' },
    { key: 'menu', icon: <ControlOutlined />, label: 'Menu' },
    { key: 'content', icon: <ApartmentOutlined />, label: 'Hotel CMS' },
    { key: 'guide', icon: <ApartmentOutlined />, label: 'Local guide' },
    { key: 'wifi', icon: <ControlOutlined />, label: 'WiFi integration' },
    { key: 'analytics', icon: <AuditOutlined />, label: 'Analytics & reports' },
    { key: 'reviews', icon: <AuditOutlined />, label: 'Reviews' },
    { key: 'audit', icon: <AuditOutlined />, label: 'Activity' }
  ];

  return <AntApp>{contextHolder}<Layout style={{ minHeight: '100vh' }}>
    <Sider breakpoint="lg" collapsedWidth="0"><div className="admin-logo">Guest<span>QR</span></div><Menu theme="dark" selectedKeys={[section]} items={menuItems} onClick={({ key }) => setSection(key)} /></Sider>
    <Layout><Header className="admin-header"><Typography.Title level={4} style={{ color: 'white', margin: 0 }}>{hotel?.name || 'Hotel administration'}</Typography.Title><Space><Avatar>{hotel?.name?.[0] || 'H'}</Avatar><Button ghost onClick={() => localStorage.removeItem('guestqr_access_token')}>Sign out</Button></Space></Header>
      <Content style={{ padding: 24 }}><Typography.Title level={2}>{menuItems.find((item) => item.key === section)?.label}</Typography.Title>
        {section === 'overview' && <Space wrap size="large"><Card><Statistic title="Rooms" value={rooms.length} /></Card><Card><Statistic title="Staff" value={staff.length} /></Card><Card><Statistic title="Active rooms" value={rooms.filter((room) => room.status === 'ACTIVE').length} /></Card></Space>}
        {section === 'profile' && <Card loading={loading}><Descriptions bordered column={1}><Descriptions.Item label="Hotel name">{hotel?.name}</Descriptions.Item><Descriptions.Item label="Slug">{hotel?.slug}</Descriptions.Item><Descriptions.Item label="Timezone">{hotel?.timezone}</Descriptions.Item><Descriptions.Item label="Currency">{hotel?.currency}</Descriptions.Item><Descriptions.Item label="Language">{hotel?.language}</Descriptions.Item><Descriptions.Item label="GST">{hotel?.gstNumber || 'Not configured'}</Descriptions.Item></Descriptions></Card>}
        {section === 'rooms' && <Card extra={<Button type="primary">Add room</Button>}><Table rowKey="id" loading={loading} columns={roomColumns} dataSource={rooms} /></Card>}
        {section === 'staff' && <Card extra={<Button type="primary">Add staff</Button>}><Table rowKey="id" loading={loading} columns={staffColumns} dataSource={staff} /></Card>}
        {section === 'menu' && <Card extra={<Button type="primary" onClick={async () => {
          if (!hotel?.id || !categories[0]) return messageApi.warning('Create a category first');
          await request(`/hotels/${hotel.id}/menu/items`, { method: 'POST', body: JSON.stringify({ categoryId: categories[0].id, name: 'New menu item', priceCents: 0, gstRateBps: 0, preparationMinutes: 20, vegetarian: true }) });
          await load();
        }}>Add menu item</Button>}><Table rowKey="id" loading={loading} columns={[
          { title: 'Item', dataIndex: 'name' }, { title: 'Price', dataIndex: 'priceCents', render: (value) => `${hotel?.currency || ''} ${(value / 100).toFixed(2)}` },
          { title: 'GST', dataIndex: 'gstRateBps', render: (value) => `${(value / 100).toFixed(2)}%` }, { title: 'Prep', dataIndex: 'preparationMinutes', render: (value) => `${value} min` },
          { title: 'Available', dataIndex: 'active', render: (value) => <Tag color={value ? 'green' : 'default'}>{value ? 'Yes' : 'No'}</Tag> }
        ]} dataSource={managedMenuItems} /></Card>}
        {section === 'content' && <Card extra={<Button type="primary" onClick={async () => {
          if (!hotel?.id) return;
          await request(`/hotels/${hotel.id}/content`, { method: 'POST', body: JSON.stringify({ type: 'HOTEL_INFORMATION', slug: `hotel-information-${Date.now()}`, translations: { en: 'New hotel information', hi: 'नई होटल जानकारी' } }) });
          await load();
        }}>Add content</Button>}><Table rowKey="id" loading={loading} columns={[
          { title: 'Type', dataIndex: 'type' }, { title: 'Slug', dataIndex: 'slug' },
          { title: 'Languages', dataIndex: 'translations', render: (value) => Object.keys(value || {}).join(', ') },
          { title: 'Active', dataIndex: 'active', render: (value) => <Tag color={value ? 'green' : 'default'}>{value ? 'Yes' : 'No'}</Tag> }
        ]} dataSource={content} /></Card>}
        {section === 'guide' && <Card extra={<Button type="primary" onClick={async () => {
          if (!hotel?.id) return;
          await request(`/hotels/${hotel.id}/local-guide`, { method: 'POST', body: JSON.stringify({ type: 'ATTRACTION', slug: `attraction-${Date.now()}`, translations: { en: 'New attraction', hi: 'नया आकर्षण' } }) });
          await load();
        }}>Add guide item</Button>}><Table rowKey="id" loading={loading} columns={[
          { title: 'Type', dataIndex: 'type' }, { title: 'Slug', dataIndex: 'slug' },
          { title: 'Languages', dataIndex: 'translations', render: (value) => Object.keys(value || {}).join(', ') },
          { title: 'Active', dataIndex: 'active', render: (value) => <Tag color={value ? 'green' : 'default'}>{value ? 'Yes' : 'No'}</Tag> }
        ]} dataSource={guide} /></Card>}
        {section === 'wifi' && <Card><Typography.Paragraph>WiFi authentication and disconnection are delegated to the configured hotel controller. Configure provider, guest/staff/premium SSIDs and bandwidth through the tenant API.</Typography.Paragraph><Typography.Text code>PUT /hotels/{hotel?.id}/wifi/settings</Typography.Text></Card>}
        {section === 'analytics' && <Space wrap>{Object.entries(analytics?.metrics || {}).map(([key, value]) => <Card key={key}><Statistic title={key.replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (letter) => letter.toUpperCase())} value={typeof value === 'number' && value < 1 ? `${(value * 100).toFixed(1)}%` : value} /></Card>)}</Space>}
        {section === 'reviews' && <Card><Table rowKey="id" dataSource={reviews} columns={[{ title: 'Rating', dataIndex: 'rating' }, { title: 'Type', dataIndex: 'targetType' }, { title: 'Comment', dataIndex: 'comment' }, { title: 'Response', dataIndex: 'response', render: (value) => value || 'Not responded' }]} /></Card>}
        {section === 'audit' && <Card><Typography.Paragraph>Administrative activity is recorded per hotel in the audit log API.</Typography.Paragraph></Card>}
      </Content>
    </Layout>
  </Layout></AntApp>;
}

export default AdminDashboard;
