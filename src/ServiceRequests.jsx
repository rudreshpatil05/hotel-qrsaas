import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const API_ROOT = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';
const SOCKET_ROOT = API_ROOT.replace(/\/api\/v1$/, '');
const categories = ['HOUSEKEEPING', 'MAINTENANCE', 'LAUNDRY', 'CONCIERGE', 'WAKE_UP_CALL', 'OTHER'];

export default function ServiceRequests() {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const token = localStorage.getItem('guestqr_access_token');
  const hotelId = localStorage.getItem('guestqr_hotel_id');
  useEffect(() => {
    if (!token || !hotelId) { setError('Staff login and hotel context are required.'); return undefined; }
    const load = () => fetch(`${API_ROOT}/hotels/${hotelId}/service-requests`, { headers: { authorization: `Bearer ${token}` } }).then((response) => response.json()).then((data) => setRequests(data.requests || []));
    load().catch((nextError) => setError(nextError.message));
    const socket = io(SOCKET_ROOT, { auth: { token } }); socket.on('service-request-created', load); socket.on('service-request-updated', load);
    return () => socket.disconnect();
  }, [hotelId, token]);
  const update = async (request, status) => {
    const response = await fetch(`${API_ROOT}/hotels/${hotelId}/service-requests/${request.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ status, ...(status === 'REJECTED' ? { rejectionReason: 'Unable to fulfil request' } : {}) }) });
    if (response.ok) setRequests((current) => current.map((item) => item.id === request.id ? { ...item, status } : item));
  };
  if (error) return <main className="kitchen-error">{error}</main>;
  return <main className="service-queue"><header><h1>Service requests</h1><span>Hotel-scoped live queue</span></header><div className="service-request-grid">{requests.map((request) => <article key={request.id}><span className="service-category">{request.category}</span><h3>{request.roomOrTable}</h3><p>{request.description}</p><small>{request.status} · {new Date(request.createdAt).toLocaleTimeString()}</small><div>{request.status === 'PENDING' && <><button onClick={() => update(request, 'ACCEPTED')}>Accept</button><button onClick={() => update(request, 'REJECTED')}>Reject</button></>}{request.status === 'ACCEPTED' && <button onClick={() => update(request, 'IN_PROGRESS')}>Start</button>}{request.status === 'IN_PROGRESS' && <button onClick={() => update(request, 'COMPLETED')}>Complete</button>}</div></article>)}</div></main>;
}
