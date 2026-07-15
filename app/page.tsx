import Generator from "@/components/Generator";

export default function Home() {
  return (
    <>
      <header className="site-header">
        <div className="inner">
          <h1>CRE Press Release Generator</h1>
          <div className="tag">Free · Powered by CRE Northstar</div>
        </div>
      </header>
      <main>
        <Generator />
      </main>
      <footer className="footer-note">
        Free forever. No account required. Your image and text are used only to
        generate this draft and are not stored after your session ends.
      </footer>
    </>
  );
}
