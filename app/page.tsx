import Generator from "@/components/Generator";

export default function Home() {
  return (
    <>
      <header className="site-header">
        <div className="inner">
          <h1>CRE Press Release Generator</h1>
          <div className="tag">Powered by juliechasen.com</div>
        </div>
      </header>
      <main>
        <Generator />
      </main>
      <footer className="footer-note">
        <p>
          No account required. Your image and text are used only to generate this
          draft and are not stored after your session ends.
        </p>
        <p className="footer-credit">
          Built by{" "}
          <a href="https://juliechasen.com" target="_blank" rel="noopener noreferrer">
            Julie Chasen
          </a>
          .
        </p>
      </footer>
    </>
  );
}
