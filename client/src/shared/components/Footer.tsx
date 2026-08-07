import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="bg-transparent border-t border-gray-200 mt-auto">
      <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between text-sm text-gray-600">
        <div className="mb-4 md:mb-0">
          © {new Date().getFullYear()} DinkDonk. All rights reserved.
        </div>
        <div className="flex space-x-6">
          <Link to="/terms-of-service" className="hover:text-black transition">
            Terms of Service
          </Link>
          <Link to="/privacy-policy" className="hover:text-black transition">
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
