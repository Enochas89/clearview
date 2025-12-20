const funFacts = [
  "Syncing your project feed...",
  "Fetching the newest change orders...",
  "Gathering daily updates...",
  "Preparing your workspace...",
  "Loading team activity..."
];

const getRandomFact = () => funFacts[Math.floor(Math.random() * funFacts.length)];

export const AppLoadingScreen = ({ message }: { message?: string }) => {
  const fallback = getRandomFact();

  return (
    <div className="loading-screen">
      <div className="loading-screen__glow" />
      <div className="loading-screen__card">
        <div className="loading-screen__spinner">
          <div />
          <div />
          <div />
        </div>
        <div className="loading-screen__text">
          <p className="loading-screen__title">{message ?? fallback}</p>
          <p className="loading-screen__subtitle">Hang tight — we’re getting things ready for you.</p>
        </div>
      </div>
    </div>
  );
};

export default AppLoadingScreen;
