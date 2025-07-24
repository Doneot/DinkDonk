import { Routes, Route, useLocation } from "react-router-dom";
import RedirectIfAuthenticated from "./RedirectIfAuthenticated";
import ProtectedRoute from "./ProtectedRoute";
import Home from "../pages/Home";
import Dashboard from "../pages/Dashboard";
import LoginRedirect from "../pages/LoginRedirect";
import TermsOfService from "../pages/TermsOfService";
import PrivacyPolicy from "../pages/PrivacyPolicy";
import Footer from "./Footer";
import Navbar from "./Navbar";
import ScrollToTop from "./ScrollToTop";

const Layout = () => {

  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      {location.pathname !== "/" && location.pathname !== "/login" && <Navbar />}
      <ScrollToTop />

      <main className="flex-grow">
        <Routes>
          <Route
            path="/"
            element={
              <RedirectIfAuthenticated>
                <Home />
              </RedirectIfAuthenticated>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginRedirect />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        </Routes>
      </main>

      <Footer />
    </div>
  );
};

export default Layout;
