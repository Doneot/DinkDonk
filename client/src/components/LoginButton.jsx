const LoginButton = () => {
  const handleLogin = () => {
    window.location.href = "/api/auth/discord";
  };

  return (
    <button
      onClick={handleLogin}
      className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-500 transition"
    >
      Login with Discord
    </button>
  );
};

export default LoginButton;
