import { lazy, Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';

import ProtectedRoute from '../modules/auth/components/ProtectedRoute';
import RedirectIfAuthenticated from '../modules/auth/components/RedirectIfAuthenticated';
import Footer from '../shared/components/Footer';
import Navbar from '../shared/components/Navbar';
import ScrollToTop from '../shared/components/ScrollToTop';

// Home used to be imported eagerly, so the landing page paid for
// react-router-dom/socket.io-client/axios/react-toastify in the same entry
// chunk as every other route even though it's the one page every visitor
// hits first and before any of those do anything - lazy-loading it here
// keeps that weight out of first paint the same way every other route
// already avoids it.
const Home = lazy(() => import('../pages/Home'));
const Dashboard = lazy(() => import('../pages/Dashboard'));
const Login = lazy(() => import('../pages/Login'));
const HowItWorks = lazy(() => import('../pages/HowItWorks'));
const TermsOfService = lazy(() => import('../pages/TermsOfService'));
const PrivacyPolicy = lazy(() => import('../pages/PrivacyPolicy'));
const NotFound = lazy(() => import('../pages/NotFound'));

const ROUTES_WITHOUT_NAVBAR = new Set(['/', '/login']);

const RouteFallback = () => (
  <div className="text-center mt-10 text-lg">Loading...</div>
);

export default function AppRoutes() {
  const location = useLocation();
  const showNavbar = !ROUTES_WITHOUT_NAVBAR.has(location.pathname);

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      {showNavbar && <Navbar />}
      <ScrollToTop />

      <main className="flex-grow">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<RedirectIfAuthenticated><Home /></RedirectIfAuthenticated>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route
              path="/login"
              element={
                <RedirectIfAuthenticated>
                  <Login />
                </RedirectIfAuthenticated>
              }
            />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>

      <Footer />
    </div>
  );
}
