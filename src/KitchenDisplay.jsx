import React, { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';

const API_ROOT = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';
const SOCKET_ROOT = API_ROOT.replace(/\/api\/v1$/, '');
const columns = [
  ['PENDING_PAYMENT', 'New orders'], ['CONFIRMED', 'Pending'], ['ACCEPTED', 'Accepted'],
  ['PREPARING', 'Preparing'], ['READY', 'Ready'], ['DELIVERED', 'Completed']
];

export default function KitchenDisplay() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const token = localStorage.getItem('guestqr_access_token');
  const hotelId = localStorage.getItem('guestqr_hotel_id');
  useEffect(() => {
    if (!token || !hotelId) { setError('Staff login and hotel context are required.'); return undefined; }
    fetch(`${API_ROOT}/hotels/${hotelId}/orders`, { headers: { authorization: `Bearer ${token}` } }).then((response) => response.json()).then((data) => setOrders(data.orders || [])).catch((nextError) => setError(nextError.message));
    const socket = io(SOCKET_ROOT, { auth: { token } });
    const refresh = () => fetch(`${API_ROOT}/hotels/${hotelId}/orders`, { headers: { authorization: `Bearer ${token}` } }).then((response) => response.json()).then((data) => setOrders(data.orders || []));
    socket.on('order-created', refresh); socket.on('order-status-updated', refresh);
    return () => socket.disconnect();
  }, [hotelId, token]);
  const grouped = useMemo(() => new Map(columns.map(([status]) => [status, orders.filter((order) => order.status === status)])), [orders]);
  const move = async (order, status) => {
    const response = await fetch(`${API_ROOT}/hotels/${hotelId}/orders/${order.orderNumber}/status`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ status }) });
    if (response.ok) setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status } : item));
  };
  if (error) return <main className="kitchen-error">{error}</main>;
  return <main className="kitchen-display"><header><h1>Kitchen Display</h1><span>Live hotel order queue</span></header><div className="kitchen-columns">{columns.map(([status, label]) => <section key={status}><h2>{label}<b>{grouped.get(status)?.length || 0}</b></h2>{grouped.get(status)?.map((order) => <article className="kitchen-order" key={order.id}><div className="kitchen-order-head"><strong>{order.orderNumber}</strong><em>{order.deliveryLocation}</em></div>{(order.OrderItems || order.orderItems || []).map((item) => <p key={item.id}>{item.quantity} × {item.nameSnapshot}<small>{item.specialInstructions || (item.customizations ? JSON.stringify(item.customizations) : '')}</small></p>)}<footer><span>{Math.round((Date.now() - new Date(order.createdAt).getTime()) / 60000)} min</span>{status === 'PENDING_PAYMENT' && <button onClick={() => move(order, 'CONFIRMED')}>Confirm</button>}{status === 'CONFIRMED' && <button onClick={() => move(order, 'ACCEPTED')}>Accept</button>}{status === 'ACCEPTED' && <button onClick={() => move(order, 'PREPARING')}>Start</button>}{status === 'PREPARING' && <button onClick={() => move(order, 'READY')}>Ready</button>}{status === 'READY' && <button onClick={() => move(order, 'DELIVERED')}>Complete</button>}</footer></article>)}</section>)}</div></main>;
}
