import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import Layout from "./components/Layout"; // Create this to wrap UserMenu and routes

const App = () => {
  return (
    <AuthProvider>
      <SocketProvider>
        <Router>
          <Layout />
        </Router>
      </SocketProvider>
    </AuthProvider>
  );
};

export default App;
