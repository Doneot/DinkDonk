import { Link } from "react-router-dom";

const NotFound = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <h1 className="text-4xl font-bold text-gray-800 mb-3">Page not found</h1>
      <p className="text-gray-600 mb-6 max-w-md">
        The page you're looking for doesn't exist or may have moved.
      </p>
      <Link
        to="/"
        className="bg-indigo-600 text-white font-semibold px-6 py-3 rounded-xl shadow-md hover:bg-indigo-500 transition"
      >
        Back to home
      </Link>
    </div>
  );
};

export default NotFound;
