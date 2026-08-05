import { BrowserRouter, Routes, Route } from "react-router-dom";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div className="p-8 text-lg font-bold">AureStream</div>} />
        <Route path="/login" element={<div>登录</div>} />
      </Routes>
    </BrowserRouter>
  );
}
