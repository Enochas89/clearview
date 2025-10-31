import "./App.css";
import { BrowserRouter } from "react-router-dom";
import { AuthGate } from "./app/AuthGate";
import { WorkspaceRouter } from "./app/WorkspaceRouter";

function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        {({ session, onSessionChange }) => (
          <WorkspaceRouter session={session} onSessionChange={onSessionChange} />
        )}
      </AuthGate>
    </BrowserRouter>
  );
}

export default App;
