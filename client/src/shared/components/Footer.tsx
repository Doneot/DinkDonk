import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="bg-transparent border-t border-seam-soft mt-auto">
      <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between font-mono text-xs uppercase tracking-wider text-ink-faint gap-4">
        <div>© {new Date().getFullYear()} DinkDonk. All rights reserved.</div>
        <div className="flex space-x-6">
          <Link to="/terms-of-service" className="text-ink-faint hover:text-ink transition">
            Terms of Service
          </Link>
          <Link to="/privacy-policy" className="text-ink-faint hover:text-ink transition">
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
