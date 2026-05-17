import { Route, Routes, useLocation } from 'react-router-dom';
import RedirectIfAuthenticated from '../components/RedirectIfAuthenticated';
import ProtectedRoute from '../components/ProtectedRoute';
import Home from '../pages/Home';
import Dashboard from '../pages/Dashboard';
import LoginRedirect from '../pages/LoginRedirect';
import TermsOfService from '../pages/TermsOfService';
import PrivacyPolicy from '../pages/PrivacyPolicy';
import Footer from '../components/Footer';
import Navbar from '../components/Navbar';
import ScrollToTop from '../components/ScrollToTop';

const ROUTES_WITHOUT_NAVBAR = new Set(['/', '/login']);

export default function AppRoutes() {
  const location = useLocation();
  const showNavbar = !ROUTES_WITHOUT_NAVBAR.has(location.pathname);

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {showNavbar && <Navbar />}
      <ScrollToTop />

      <main className="flex-grow">
        <Routes>
          <Route path="/" element={<RedirectIfAuthenticated><Home /></RedirectIfAuthenticated>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/login" element={<LoginRedirect />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        </Routes>
      </main>

      <Footer />
    </div>
  );
}
