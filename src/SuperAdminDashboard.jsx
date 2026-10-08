import React, { useEffect, useState } from 'react';
import { Table, Card, Statistic, Space, Tag } from 'antd';

const API_ROOT = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';
const request = (path, options = {}) => fetch(`${API_ROOT}${path}`, { ...options, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + localStorage.getItem('guestqr_access_token') } }).then(async (response) => { if (!response.ok) throw new Error('Platform request failed'); return response.json(); });

export default function SuperAdminDashboard() {
  const [hotels, setHotels] = useState([]); const [analytics, setAnalytics] = useState({});
  useEffect(() => { Promise.all([request('/platform/hotels'), request('/platform/analytics')]).then(([hotelResult, analyticsResult]) => { setHotels(hotelResult.hotels); setAnalytics(analyticsResult); }).catch(() => {}); }, []);
  return <main style={{ padding: 24 }}><h1>GuestQR platform administration</h1><Space wrap><Card><Statistic title="Hotels" value={analytics.hotels || 0} /></Card><Card><Statistic title="Active hotels" value={analytics.activeHotels || 0} /></Card><Card><Statistic title="Orders" value={analytics.orders || 0} /></Card><Card><Statistic title="Reviews" value={analytics.reviews || 0} /></Card></Space><Card title="Hotels" style={{ marginTop: 24 }}><Table rowKey="id" dataSource={hotels} columns={[{ title: 'Hotel', dataIndex: 'name' }, { title: 'Status', dataIndex: 'status', render: (value) => <Tag>{value}</Tag> }, { title: 'Plan', dataIndex: 'subscriptionPlan' }, { title: 'Subscription', dataIndex: 'subscriptionStatus' }]} /></Card></main>;
}
