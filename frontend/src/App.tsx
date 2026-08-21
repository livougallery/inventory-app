import { Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Dashboard />} />
      {/* Fallback for dashboard */}
      <Route path="*" element={<div className="p-8">Coming soon...</div>} />
    </Routes>
  );
}

export default App;
