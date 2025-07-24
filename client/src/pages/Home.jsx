import { Link } from "react-router-dom";

const Home = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh+100px)] bg-gradient-to-br from-indigo-600 to-purple-700 text-white px-4">
      <h1 className="text-4xl md:text-6xl font-bold mb-6 text-center">
        Stream Notifier Bot
      </h1>
      <p className="text-lg md:text-xl text-center max-w-xl mb-8">
        Get notified on Discord when your favorite streamers go live. Customize
        your stream notifications and manage everything from one dashboard.
      </p>
      <Link
        to="/login"
        className="bg-white text-purple-700 font-semibold px-6 py-3 rounded-xl shadow-md hover:scale-105 transition"
      >
        Start Now / Login with Discord
      </Link>
    </div>
  );
};

export default Home;
