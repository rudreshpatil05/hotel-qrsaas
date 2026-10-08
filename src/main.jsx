import React, { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import AdminDashboard from './AdminDashboard.jsx';
import GuestExperience from './GuestExperience.jsx';
import KitchenDisplay from './KitchenDisplay.jsx';
import ServiceRequests from './ServiceRequests.jsx';
import SuperAdminDashboard from './SuperAdminDashboard.jsx';

const categories = ['All', 'Starters', 'Mains', 'Beverages', 'Desserts'];

const menuItems = [
  { id: 1, name: 'Tandoori Paneer Tikka', category: 'Starters', price: 325, description: 'Charred cottage cheese, peppers and onion with mint chutney.', tag: 'Chef’s pick', image: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=800&q=80', veg: true },
  { id: 2, name: 'Kurkuri Bhindi', category: 'Starters', price: 280, description: 'Crispy okra, amchur, chaat masala and yoghurt.', tag: 'Popular', image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80', veg: true },
  { id: 3, name: 'Butter Chicken', category: 'Mains', price: 495, description: 'Tandoor-roasted chicken in a silky tomato and fenugreek gravy.', tag: 'House favourite', image: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80', veg: false },
  { id: 4, name: 'Dal Makhani', category: 'Mains', price: 345, description: 'Slow-cooked black lentils finished with butter and cream.', tag: '', image: 'https://images.unsplash.com/photo-1626500155537-93690c24099f?auto=format&fit=crop&w=800&q=80', veg: true },
  { id: 5, name: 'Garlic Naan', category: 'Mains', price: 110, description: 'Clay oven bread brushed with garlic butter and coriander.', tag: '', image: 'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?auto=format&fit=crop&w=800&q=80', veg: true },
  { id: 6, name: 'Mango Lassi', category: 'Beverages', price: 180, description: 'Alphonso mango blended with chilled yoghurt and cardamom.', tag: 'Refreshing', image: 'https://images.unsplash.com/photo-1626200419199-391ae4be7a41?auto=format&fit=crop&w=800&q=80', veg: true },
  { id: 7, name: 'Masala Chai', category: 'Beverages', price: 95, description: 'Freshly brewed Assam tea with warming spices.', tag: '', image: 'https://images.unsplash.com/photo-1571934811356-5cc061b6821f?auto=format&fit=crop&w=800&q=80', veg: true },
  { id: 8, name: 'Gulab Jamun', category: 'Desserts', price: 210, description: 'Warm milk dumplings, rose syrup and vanilla ice cream.', tag: 'Must try', image: 'https://images.unsplash.com/photo-1605196560547-1f9c9c7b6d2c?auto=format&fit=crop&w=800&q=80', veg: true },
];

const formatPrice = (price) => `₹${price.toLocaleString('en-IN')}`;

function App() {
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);

  const filteredItems = useMemo(() => menuItems.filter((item) => {
    const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
    const matchesSearch = `${item.name} ${item.description}`.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  }), [activeCategory, search]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const serviceFee = cart.length ? 25 : 0;

  const addToCart = (item, quantity = 1, notes = '') => {
    setCart((current) => {
      const existing = current.find((entry) => entry.id === item.id && entry.notes === notes);
      if (existing) return current.map((entry) => entry === existing ? { ...entry, quantity: entry.quantity + quantity } : entry);
      return [...current, { ...item, quantity, notes }];
    });
    setSelectedItem(null);
  };

  const updateQuantity = (id, delta) => {
    setCart((current) => current.flatMap((item) => item.id === id
      ? (item.quantity + delta > 0 ? [{ ...item, quantity: item.quantity + delta }] : [])
      : [item]));
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">G</span><span>Guest<span className="brand-accent">QR</span></span></div>
        <div className="hotel-context"><span className="status-dot" /> The Fern Residency <span className="room-pill">Room 204</span></div>
        <button className="cart-button" onClick={() => setCheckoutOpen(true)} aria-label="Open cart">
          <span className="cart-icon">🛍</span><span className="cart-label">My order</span>{cartCount > 0 && <b>{cartCount}</b>}
        </button>
      </header>

      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">IN-ROOM DINING · 24/7</p>
            <h1>Good food,<br /><em>well rested.</em></h1>
            <p className="hero-copy">Thoughtfully prepared, delivered to your room.</p>
          </div>
          <div className="hero-stamp"><strong>30</strong><span>MIN<br />DELIVERY</span></div>
        </section>

        <section className="menu-section">
          <div className="section-heading"><div><p className="eyebrow">FROM OUR KITCHEN</p><h2>Today’s menu</h2></div><span className="open-now">● Kitchen open</span></div>
          <div className="search-wrap"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search dishes, drinks..." /></div>
          <div className="category-tabs">{categories.map((category) => <button className={activeCategory === category ? 'active' : ''} onClick={() => setActiveCategory(category)} key={category}>{category}</button>)}</div>
          <div className="menu-grid">
            {filteredItems.map((item) => <MenuCard item={item} key={item.id} onSelect={() => setSelectedItem(item)} onAdd={() => addToCart(item)} />)}
          </div>
          {!filteredItems.length && <div className="empty-state">No dishes found. Try a different search.</div>}
        </section>
      </main>

      {selectedItem && <ItemModal item={selectedItem} onClose={() => setSelectedItem(null)} onAdd={addToCart} />}
      {checkoutOpen && <CartDrawer cart={cart} subtotal={subtotal} serviceFee={serviceFee} updateQuantity={updateQuantity} onClose={() => setCheckoutOpen(false)} onCheckout={() => { setCheckoutOpen(false); setOrderPlaced(true); }} />}
      {orderPlaced && <OrderConfirmation onClose={() => setOrderPlaced(false)} />}
    </div>
  );
}

function Root() {
  if (window.location.pathname.startsWith('/kitchen')) return <KitchenDisplay />;
  if (window.location.pathname.startsWith('/staff/requests')) return <ServiceRequests />;
  if (window.location.pathname.startsWith('/admin')) return <AdminDashboard />;
  if (window.location.pathname.startsWith('/super-admin')) return <SuperAdminDashboard />;
  return <GuestExperience />;
}

function MenuCard({ item, onSelect, onAdd }) {
  return <article className="menu-card">
    <button className="card-image-button" onClick={onSelect}><img src={item.image} alt={item.name} /><span className={`diet-dot ${item.veg ? 'veg' : 'nonveg'}`} /></button>
    <div className="card-body"><div className="card-title-row"><h3>{item.name}</h3><span className="price">{formatPrice(item.price)}</span></div><p>{item.description}</p><div className="card-footer">{item.tag ? <span className="tag">{item.tag}</span> : <span /> }<button className="add-button" onClick={onAdd}>+ Add</button></div></div>
  </article>;
}

function ItemModal({ item, onClose, onAdd }) {
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  return <div className="overlay" onClick={onClose}><div className="item-modal" onClick={(event) => event.stopPropagation()}><button className="close-button" onClick={onClose}>×</button><img src={item.image} alt="" /><div className="modal-content"><div className="modal-title"><div><span className={`diet-dot ${item.veg ? 'veg' : 'nonveg'}`} /><h2>{item.name}</h2></div><strong>{formatPrice(item.price)}</strong></div><p>{item.description}</p><label>Special instructions <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="No onions, extra spicy..." /></label><div className="modal-actions"><div className="quantity"><button onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button><b>{quantity}</b><button onClick={() => setQuantity(quantity + 1)}>+</button></div><button className="primary-button" onClick={() => onAdd(item, quantity, notes)}>Add to order · {formatPrice(item.price * quantity)}</button></div></div></div></div>;
}

function CartDrawer({ cart, subtotal, serviceFee, updateQuantity, onClose, onCheckout }) {
  return <div className="overlay drawer-overlay" onClick={onClose}><aside className="cart-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-header"><div><p className="eyebrow">ROOM 204</p><h2>Your order</h2></div><button className="close-button" onClick={onClose}>×</button></div>{cart.length ? <><div className="cart-items">{cart.map((item) => <div className="cart-item" key={`${item.id}-${item.notes}`}><img src={item.image} alt="" /><div className="cart-item-info"><h3>{item.name}</h3><span>{formatPrice(item.price)}</span>{item.notes && <small>“{item.notes}”</small>}<div className="quantity"><button onClick={() => updateQuantity(item.id, -1)}>−</button><b>{item.quantity}</b><button onClick={() => updateQuantity(item.id, 1)}>+</button></div></div></div>)}</div><div className="bill"><div><span>Subtotal</span><b>{formatPrice(subtotal)}</b></div><div><span>Service charge</span><b>{formatPrice(serviceFee)}</b></div><div className="total"><span>Total</span><b>{formatPrice(subtotal + serviceFee)}</b></div></div><button className="primary-button full-width" onClick={onCheckout}>Proceed to checkout <span>→</span></button><p className="secure-note">🔒 You can pay securely at checkout</p></> : <div className="empty-cart"><span>🛍</span><h3>Your order is empty</h3><p>Add something delicious from our menu.</p><button className="primary-button" onClick={onClose}>Browse menu</button></div>}</aside></div>;
}

function OrderConfirmation({ onClose }) {
  return <div className="overlay"><div className="confirmation"><div className="success-icon">✓</div><p className="eyebrow">ORDER CONFIRMED</p><h2>Coming right up.</h2><p>Your order <strong>#FR2048</strong> has been sent to the kitchen. We’ll deliver it to Room 204 in approximately 30 minutes.</p><div className="order-status"><span className="status-line active" /><span className="status-line" /><span className="status-line" /><div><b>Order received</b><small>Just now · Kitchen is preparing your order</small></div></div><button className="primary-button full-width" onClick={onClose}>Back to menu</button></div></div>;
}

createRoot(document.getElementById('root')).render(<StrictMode><Root /></StrictMode>);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
