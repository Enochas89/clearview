import "./App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthGate } from "./app/AuthGate";
import { WorkspaceRouter } from "./app/WorkspaceRouter";
import ChangeOrderResponsePage from "./features/change-orders/ChangeOrderResponsePage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/change-order/respond" element={<ChangeOrderResponsePage />} />
        <Route
          path="/*"
          element={
            <AuthGate>
              {({ session, onSessionChange }) => (
                <WorkspaceRouter session={session} onSessionChange={onSessionChange} />
              )}
            </AuthGate>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
