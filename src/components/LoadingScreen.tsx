import logo from "../assets/logo.png";

const LoadingScreen = () => (
  <div className="loading-screen" role="status" aria-live="polite">
    <div className="loading-screen__logo">
      <img src={logo} alt="Clear View" />
      <span className="loading-screen__ring" aria-hidden="true" />
    </div>
    <p className="loading-screen__message">Loading your workspace…</p>
  </div>
);

export default LoadingScreen;
