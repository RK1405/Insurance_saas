import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import { ChangePassword, Login, Register } from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import { PolicyDetail, Policies } from './pages/Policies.jsx';
import ProductEditor from './pages/ProductEditor.jsx';
import Products from './pages/Products.jsx';
import QuoteDetail from './pages/QuoteDetail.jsx';
import Quotes from './pages/Quotes.jsx';
import RetailQuote from './pages/RetailQuote.jsx';
import Settings from './pages/Settings.jsx';
import SmeQuote from './pages/SmeQuote.jsx';

function Guard({ children, roles, line }) {
  const { user } = useAuth();
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  if (line && !user.lines.includes(line)) return <Navigate to="/settings/preferences" replace />;
  return children;
}

function Routed() {
  const { loading, user } = useAuth();
  if (loading) return <Loading />;
  if (!user) {
    return (
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  if (user.mustChangePassword) return <ChangePassword forced />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/quotes" element={<Quotes />} />
        <Route path="/underwriting" element={<Guard roles={['admin', 'underwriter']}><Quotes referredOnly /></Guard>} />
        <Route path="/quotes/new/retail" element={<Guard line="retail"><RetailQuote /></Guard>} />
        <Route path="/quotes/new/sme" element={<Guard line="sme"><SmeQuote /></Guard>} />
        <Route path="/quotes/:id" element={<QuoteDetail />} />
        <Route path="/policies" element={<Policies />} />
        <Route path="/policies/:id" element={<PolicyDetail />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/:id" element={<ProductEditor />} />
        <Route path="/settings/:tab?" element={<Settings />} />
        <Route path="/register" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routed />
    </AuthProvider>
  );
}
