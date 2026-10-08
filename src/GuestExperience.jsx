import React, { useEffect, useMemo, useState } from 'react';

const API_ROOT = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';
const sessionKey = 'guestqr_guest_session';

function api(path, options = {}) {
  const token = sessionStorage.getItem(sessionKey);
  return fetch(`${API_ROOT}${path}`, { ...options, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } })
    .then(async (response) => {
      if (!response.ok) throw new Error((await response.json()).error?.message || 'Unable to load hotel');
      return response.status === 204 ? null : response.json();
    });
}

const formatMoney = (cents, currency) => `${currency} ${(cents / 100).toFixed(2)}`;

export default function GuestExperience() {
  const [context, setContext] = useState(null);
  const [menu, setMenu] = useState({ categories: [], items: [] });
  const [cart, setCart] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [vegetarian, setVegetarian] = useState('all');
  const [selected, setSelected] = useState(null);
  const [checkout, setCheckout] = useState(false);
  const [order, setOrder] = useState(null);
  const [billing, setBilling] = useState(null);
  const [serviceRequests, setServiceRequests] = useState([]);
  const [content, setContent] = useState([]);
  const [guide, setGuide] = useState([]);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [error, setError] = useState('');
  const identifier = useMemo(() => window.location.pathname.match(/^\/qr\/(.+)$/)?.[1] || new URLSearchParams(window.location.search).get('qr'), []);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      try {
        if (!identifier && !sessionStorage.getItem(sessionKey)) return setError('Scan an active hotel QR code to continue.');
        if (identifier) {
          const session = await api(`/public/qr/${encodeURIComponent(identifier)}`);
          sessionStorage.setItem(sessionKey, session.guestSessionToken);
        }
        const [nextContext, nextMenu] = await Promise.all([api('/guest/context'), api('/guest/menu')]);
        if (!cancelled) {
          setContext(nextContext); setMenu(nextMenu);
          const [contentResult, guideResult] = await Promise.all([api('/guest/content'), api('/guest/local-guide')]);
          setContent(contentResult.content || []); setGuide(guideResult.items || []);
          api('/guest/service-requests').then((data) => setServiceRequests(data.requests || [])).catch(() => {});
          api('/guest/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventType: 'PAGE_VIEW' }) }).catch(() => {});
        }
      } catch (nextError) { if (!cancelled) setError(nextError.message); }
    };
    start();
    return () => { cancelled = true; };
  }, [identifier]);

  const visibleItems = useMemo(() => menu.items.filter((item) => {
    const text = `${item.name} ${item.description || ''}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (category === 'all' || item.categoryId === category) && (vegetarian === 'all' || item.vegetarian === (vegetarian === 'veg'));
  }), [menu.items, query, category, vegetarian]);

  const addToCart = (item, quantity, customizations, specialInstructions) => {
    api('/guest/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventType: 'ADD_TO_CART', metadata: { menuItemId: item.id } }) }).catch(() => {});
    setCart((current) => [...current, { item, quantity, customizations, specialInstructions, key: `${item.id}-${Date.now()}` }]);
    setSelected(null);
  };
  const cartSubtotal = cart.reduce((sum, line) => sum + line.item.priceCents * line.quantity, 0);
  const cartGst = cart.reduce((sum, line) => sum + Math.round(line.item.priceCents * line.quantity * line.item.gstRateBps / 10000), 0);

  if (error) return <main className="guest-state"><span className="guest-logo-mark">G</span><h1>GuestQR</h1><p>{error}</p></main>;
  if (!context) return <main className="guest-state"><p>Loading your hotel experience…</p></main>;
  const { hotel, qr, location } = context;

  const loadBilling = async () => { try { setBilling(await api('/guest/billing')); } catch (billingError) { setError(billingError.message); } };
  return <div className="guest-pwa" style={{ '--guest-primary': hotel.primaryColor, '--guest-secondary': hotel.secondaryColor }}>
    <header className="guest-pwa-header">{hotel.logoUrl ? <img src={hotel.logoUrl} alt={`${hotel.name} logo`} /> : <span className="guest-logo-mark">G</span>}<div><strong>{hotel.name}</strong><small>{location ? `Room ${location.roomNumber}` : qr.targetLabel || qr.type.replace('_', ' ')}</small></div><button className="guest-cart-button" onClick={loadBilling}>Billing</button><button className="guest-cart-button" onClick={() => setCheckout(true)}>Cart {cart.length ? `(${cart.reduce((sum, line) => sum + line.quantity, 0)})` : ''}</button></header>
    <main>
      <section className="guest-welcome"><p className="eyebrow">WELCOME TO</p><h1>{hotel.name}</h1><p>{location?.name || qr.label || 'Your hotel experience, all in one place.'}</p></section>
      <section id="guest-menu" className="guest-menu"><div className="section-heading"><h2>Menu</h2><span className="open-now">● Available now</span></div><div className="guest-menu-controls"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search dishes..." /><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{menu.categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><select value={vegetarian} onChange={(event) => setVegetarian(event.target.value)}><option value="all">All items</option><option value="veg">Vegetarian</option><option value="nonveg">Non-vegetarian</option></select></div><div className="guest-menu-grid">{visibleItems.map((item) => <article key={item.id} onClick={() => api('/guest/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventType: 'PRODUCT_VIEW', metadata: { menuItemId: item.id } }) }).catch(() => {})}>{item.imageUrl && <img src={item.imageUrl} alt="" />}<div><h3>{item.name}</h3><p>{item.description}</p><small>{item.preparationMinutes} min · GST {(item.gstRateBps / 100).toFixed(2)}%</small></div><strong>{formatMoney(item.priceCents, hotel.currency)}<button onClick={() => setSelected(item)}>+ Add</button></strong></article>)}</div>{!visibleItems.length && <p className="empty-state">No dishes match your filters.</p>}</section>
      <section className="guest-services"><div className="section-heading"><h2>Services</h2><button className="add-button" onClick={() => setServiceOpen(true)}>Request help</button></div>{serviceRequests.slice(0, 4).map((request) => <article className="service-tracker" key={request.id}><b>{request.category}</b><span>{request.status.replace('_', ' ')}</span><p>{request.description}</p></article>)}</section>
      {content.length > 0 && <section className="guest-services"><div className="section-heading"><h2>Hotel information</h2></div>{content.slice(0, 6).map((item) => <article className="service-tracker" key={item.id}><b>{item.type.replace('_', ' ')}</b><p>{item.text}</p></article>)}</section>}
      {guide.length > 0 && <section className="guest-services"><div className="section-heading"><h2>Local guide</h2></div>{guide.slice(0, 6).map((item) => <article className="service-tracker" key={item.id}><b>{item.type.replace('_', ' ')}</b><p>{item.text}</p></article>)}</section>}
    </main>
    <footer className="guest-footer">Secure guest session · prices and taxes confirmed at checkout</footer>
    {selected && <ItemDialog item={selected} currency={hotel.currency} onClose={() => setSelected(null)} onAdd={addToCart} />}
    {checkout && <CheckoutDialog cart={cart} currency={hotel.currency} location={location} subtotal={cartSubtotal} gst={cartGst} onClose={() => setCheckout(false)} onRemove={(key) => setCart((current) => current.filter((line) => line.key !== key))} onSubmit={async (details) => { const result = await api('/guest/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...details, items: cart.map((line) => ({ menuItemId: line.item.id, quantity: line.quantity, customizations: line.customizations, specialInstructions: line.specialInstructions })) }) }); setOrder(result.order); setCart([]); setCheckout(false); }} />}
    {order && <OrderResult order={order} currency={hotel.currency} onClose={() => setOrder(null)} onPaid={(nextOrder) => setOrder({ ...order, ...nextOrder })} />}
    {billing && <BillingDialog billing={billing} currency={hotel.currency} onClose={() => setBilling(null)} />}
    {serviceOpen && <ServiceDialog location={location} onClose={() => setServiceOpen(false)} onCreated={(request) => { setServiceRequests((current) => [request, ...current]); setServiceOpen(false); }} />}
  </div>;
}

function OrderResult({ order, currency, onClose, onPaid }) {
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState('');
  const pay = async () => {
    setPaying(true); setMessage('');
    try {
      const idempotencyKey = `${order.orderNumber}-${crypto.randomUUID()}`;
      const result = await api('/guest/payments/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderNumber: order.orderNumber, idempotencyKey }) });
      if (!window.Razorpay) await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.onload = resolve; script.onerror = () => reject(new Error('Unable to load payment checkout')); document.body.appendChild(script); });
      const checkout = new window.Razorpay({ key: result.payment.keyId, amount: result.payment.amountCents, currency: result.payment.currency, name: 'GuestQR', order_id: result.payment.gatewayOrderId, handler: async (response) => { const verified = await api('/guest/payments/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ razorpayOrderId: response.razorpay_order_id, razorpayPaymentId: response.razorpay_payment_id, razorpaySignature: response.razorpay_signature, idempotencyKey }) }); onPaid(verified.order); }, modal: { ondismiss: () => setPaying(false) } });
      checkout.open();
    } catch (paymentError) { setMessage(paymentError.message); setPaying(false); }
  };
  return <div className="overlay"><div className="item-modal modal-content"><h2>Order received</h2><p>Your order <strong>{order.orderNumber}</strong> is {order.status.replace('_', ' ').toLowerCase()}.</p><p>Total confirmed by hotel: {formatMoney(order.totalCents, currency)}</p>{order.status === 'PENDING_PAYMENT' && <button className="primary-button" disabled={paying} onClick={pay}>{paying ? 'Opening secure checkout…' : 'Pay online'}</button>}<a href={`${API_ROOT}/guest/invoices/${encodeURIComponent(order.invoiceNumber)}/pdf`} target="_blank" rel="noreferrer">View invoice PDF</a>{message && <p className="error-text">{message}</p>}<button className="primary-button" onClick={onClose}>Done</button></div></div>;
}

function BillingDialog({ billing, currency, onClose }) {
  return <div className="overlay"><div className="item-modal modal-content"><button className="close-button" onClick={onClose}>×</button><h2>Digital billing</h2><p>Outstanding: <strong>{formatMoney(billing.outstandingCents, currency)}</strong></p>{billing.invoices.map((invoice) => <article key={invoice.invoiceNumber}><b>{invoice.invoiceNumber}</b><p>{invoice.status} · {formatMoney(invoice.paidCents, currency)} paid of {formatMoney(invoice.totalCents, currency)}</p><a href={`${API_ROOT}/guest/invoices/${encodeURIComponent(invoice.invoiceNumber)}/pdf`} target="_blank" rel="noreferrer">Download invoice PDF</a></article>)}</div></div>;
}

function ServiceDialog({ location, onClose, onCreated }) {
  const [form, setForm] = useState({ category: 'HOUSEKEEPING', description: '', roomOrTable: location ? `Room ${location.roomNumber}` : '' });
  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  return <div className="overlay"><div className="item-modal modal-content"><button className="close-button" onClick={onClose}>×</button><h2>Request hotel service</h2><label>Category<select name="category" value={form.category} onChange={update}><option>HOUSEKEEPING</option><option>MAINTENANCE</option><option>LAUNDRY</option><option>CONCIERGE</option><option>WAKE_UP_CALL</option><option>OTHER</option></select></label><label>Room/table<input name="roomOrTable" value={form.roomOrTable} onChange={update} /></label><label>Description<textarea name="description" value={form.description} onChange={update} /></label><button className="primary-button" disabled={!form.description.trim() || !form.roomOrTable.trim()} onClick={async () => { const result = await api('/guest/service-requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) }); onCreated(result.request); }}>Send request</button></div></div>;
}

function ItemDialog({ item, currency, onClose, onAdd }) {
  const [quantity, setQuantity] = useState(1);
  const [customizations, setCustomizations] = useState({});
  const [notes, setNotes] = useState('');
  const options = item.customizationSchema?.options || [];
  return <div className="overlay"><div className="item-modal modal-content"><button className="close-button" onClick={onClose}>×</button><h2>{item.name}</h2><p>{item.description}</p><strong>{formatMoney(item.priceCents, currency)}</strong>{options.map((option) => <label key={option.key}>{option.label}<select value={customizations[option.key] || ''} onChange={(event) => setCustomizations({ ...customizations, [option.key]: event.target.value })}><option value="">Choose</option>{(option.values || []).map((value) => <option value={value} key={value}>{value}</option>)}</select></label>)}<label>Special instructions<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} /></label><div className="quantity"><button onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button>{quantity}<button onClick={() => setQuantity(quantity + 1)}>+</button></div><button className="primary-button" onClick={() => onAdd(item, quantity, customizations, notes)}>Add to cart</button></div></div>;
}

function CheckoutDialog({ cart, currency, location, subtotal, gst, onClose, onRemove, onSubmit }) {
  const [details, setDetails] = useState({ guestName: '', guestPhone: '', deliveryLocation: location ? `Room ${location.roomNumber}` : '', paymentMethod: 'PAY_AT_HOTEL', guestNote: '' });
  const update = (event) => setDetails({ ...details, [event.target.name]: event.target.value });
  return <div className="overlay"><div className="item-modal modal-content"><button className="close-button" onClick={onClose}>×</button><h2>Your order</h2>{cart.map((line) => <p key={line.key}>{line.quantity} × {line.item.name} <button onClick={() => onRemove(line.key)}>Remove</button></p>)}<p>Subtotal: {formatMoney(subtotal, currency)}</p><p>GST: {formatMoney(gst, currency)}</p><h3>Total: {formatMoney(subtotal + gst, currency)}</h3>{['guestName', 'guestPhone', 'deliveryLocation'].map((name) => <label key={name}>{name === 'guestName' ? 'Guest name' : name === 'guestPhone' ? 'Phone' : 'Room/table or delivery location'}<input name={name} value={details[name]} onChange={update} required /></label>)}<label>Payment method<select name="paymentMethod" value={details.paymentMethod} onChange={update}><option value="PAY_AT_HOTEL">Pay at hotel</option><option value="ONLINE">Online (gateway later)</option></select></label><label>Order instructions<textarea name="guestNote" value={details.guestNote} onChange={update} /></label><button className="primary-button" disabled={!cart.length} onClick={() => onSubmit(details)}>Place order</button></div></div>;
}
