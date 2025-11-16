import React, { useEffect, useMemo, useState } from "react";
import { ExternalLink, Heart } from "lucide-react";
import { API_URL, DEFAULT_IMAGE } from "./config";

function App() {
  const [games, setGames] = useState([]);
  const [wishlist, setWishlist] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("wishlist");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item) => ({
        ...item,
        installed: !!item.installed,
        finished: !!item.finished,
      }));
    } catch (e) {
      return [];
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("games");
  const [yearFilter, setYearFilter] = useState("all");

  useEffect(() => {
    async function loadGames() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(API_URL + "/api/games");
        if (!response.ok) {
          throw new Error("Error loading games");
        }
        const data = await response.json();
        setGames(data);
      } catch (err) {
        setError(err.message || "Unexpected error");
      } finally {
        setLoading(false);
      }
    }
    loadGames();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("wishlist", JSON.stringify(wishlist));
    } catch (e) {}
  }, [wishlist]);

  const wishlistIds = useMemo(() => new Set(wishlist.map((g) => g.id)), [wishlist]);

  const yearOptions = useMemo(() => {
    const yearsSet = new Set();
    let hasNoYear = false;
    for (const game of games) {
      if (typeof game.year === "number" && !Number.isNaN(game.year)) {
        yearsSet.add(game.year);
      } else {
        hasNoYear = true;
      }
    }
    const years = Array.from(yearsSet).sort((a, b) => b - a);
    return { years, hasNoYear };
  }, [games]);

  const filteredGames = useMemo(() => {
    if (yearFilter === "all") return games;
    if (yearFilter === "no-year") {
      return games.filter((g) => !g.year);
    }
    const numericYear = Number(yearFilter);
    return games.filter((g) => g.year === numericYear);
  }, [games, yearFilter]);

  function toggleWishlist(game) {
    setWishlist((prev) => {
      const exists = prev.find((item) => item.id === game.id);
      if (exists) {
        return prev.filter((item) => item.id !== game.id);
      }
      return [
        ...prev,
        {
          id: game.id,
          slug: game.slug,
          title: game.title,
          spoilerTitle: game.spoilerTitle,
          image: game.image,
          year: game.year,
          installed: false,
          finished: false,
        },
      ];
    });
  }

  function toggleInstalled(id) {
    setWishlist((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, installed: !item.installed } : item
      )
    );
  }

  function clearWishlist() {
    setWishlist([]);
  }

  function toggleFinished(id) {
    setWishlist((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, finished: !item.finished } : item
      )
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1 className="app-title">FitGirl Games Tracker</h1>
          <p className="app-subtitle">
            Explore the latest FitGirl updates and mark your wishlist.
          </p>
        </div>
        <div className="app-badges">
          <span className="badge badge-soft">
            Games loaded
            <strong>{games.length}</strong>
          </span>
          <span className="badge badge-accent">
            Wishlist
            <strong>{wishlist.length}</strong>
          </span>
        </div>
        <nav className="app-nav">
          <button
            type="button"
            className={
              view === "games" ? "nav-button nav-button-active" : "nav-button"
            }
            onClick={() => setView("games")}
          >
            Games
          </button>
          <button
            type="button"
            className={
              view === "wishlist" ? "nav-button nav-button-active" : "nav-button"
            }
            onClick={() => setView("wishlist")}
          >
            Wishlist
          </button>
        </nav>
      </header>

      {loading && (
        <div className="status status-loading">
          <div className="spinner" />
          <span>Loading games...</span>
        </div>
      )}

      {!loading && error && (
        <div className="status status-error">
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && (
        <>
          {view === "games" && (
            <section className="section">
              <div className="section-header">
                <h2 className="section-title">Games list</h2>
              </div>
              {yearOptions.years.length > 0 && (
                <div className="year-filters">
                  <button
                    type="button"
                    className={
                      yearFilter === "all"
                        ? "year-filter-button year-filter-button-active"
                        : "year-filter-button"
                    }
                    onClick={() => setYearFilter("all")}
                  >
                    All
                  </button>
                  {yearOptions.years.map((year) => (
                    <button
                      key={year}
                      type="button"
                      className={
                        yearFilter === String(year)
                          ? "year-filter-button year-filter-button-active"
                          : "year-filter-button"
                      }
                      onClick={() => setYearFilter(String(year))}
                    >
                      {year}
                    </button>
                  ))}
                  {yearOptions.hasNoYear && (
                    <button
                      type="button"
                      className={
                        yearFilter === "no-year"
                          ? "year-filter-button year-filter-button-active"
                          : "year-filter-button"
                      }
                      onClick={() => setYearFilter("no-year")}
                    >
                      No year
                    </button>
                  )}
                </div>
              )}
              <div className="grid">
                {filteredGames.map((game) => {
                  const inWishlist = wishlistIds.has(game.id);
                  const imgSrc = game.image || DEFAULT_IMAGE;
                  return (
                    <article key={game.id} className="card">
                      <button
                        className={
                          inWishlist ? "heart-button heart-button-active" : "heart-button"
                        }
                        type="button"
                        onClick={() => toggleWishlist(game)}
                        aria-label={
                          inWishlist ? "Remove from wishlist" : "Add to wishlist"
                        }
                      >
                        <Heart className="heart-icon" />
                      </button>
                      <div className="card-image">
                        <img src={imgSrc} alt={game.title} loading="lazy" />
                      </div>
                      <div className="card-body">
                        <h3 className="card-title">{game.title}</h3>
                        <p className="card-meta">
                          {game.year ? game.year : "Unknown year"}
                        </p>
                        <a
                          href={`https://fitgirl-repacks.site/${game.id}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="repack-link-button"
                          aria-label={"Open repack for " + game.title}
                        >
                          <ExternalLink className="repack-link-icon" />
                          <span className="repack-link-text">View repack</span>
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
              {yearOptions.years.length > 0 && (
                <div className="year-filters" style={{ marginTop: "2rem" }}>
                  <button
                    type="button"
                    className={
                      yearFilter === "all"
                        ? "year-filter-button year-filter-button-active"
                        : "year-filter-button"
                    }
                    onClick={() => setYearFilter("all")}
                  >
                    All
                  </button>
                  {yearOptions.years.map((year) => (
                    <button
                      key={year}
                      type="button"
                      className={
                        yearFilter === String(year)
                          ? "year-filter-button year-filter-button-active"
                          : "year-filter-button"
                      }
                      onClick={() => setYearFilter(String(year))}
                    >
                      {year}
                    </button>
                  ))}
                  {yearOptions.hasNoYear && (
                    <button
                      type="button"
                      className={
                        yearFilter === "no-year"
                          ? "year-filter-button year-filter-button-active"
                          : "year-filter-button"
                      }
                      onClick={() => setYearFilter("no-year")}
                    >
                      No year
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          {view === "wishlist" && (
            <section className="section section-wishlist">
              <div className="section-header section-header-with-actions">
                <div>
                  <h2 className="section-title">My wishlist</h2>
                  <p className="section-subtitle">
                    Your list of games marked.
                  </p>
                </div>
                {wishlist.length > 0 && (
                  <button
                    type="button"
                    className="clear-wishlist-button"
                    onClick={clearWishlist}
                  >
                    Clear wishlist
                  </button>
                )}
              </div>
              {wishlist.length === 0 && (
                <div className="status status-empty">
                  <span>
                    You haven't added any games to your wishlist yet.
                  </span>
                </div>
              )}
              {wishlist.length > 0 && (
                <div className="grid">
                  {wishlist.map((game) => (
                    <article key={game.id} className="card card-compact">
                      <button
                        className="heart-button heart-button-active"
                        type="button"
                        onClick={() => toggleWishlist(game)}
                        aria-label="Remove from wishlist"
                      >
                        <Heart className="heart-icon" />
                      </button>
                      <div className="card-image">
                        <img
                          src={game.image || DEFAULT_IMAGE}
                          alt={game.title}
                          loading="lazy"
                        />
                      </div>
                      <div className="card-body">
                        <h3 className="card-title">{game.title}</h3>
                        <p className="card-meta">
                          {game.year ? game.year : "Unknown year"}
                        </p>
                        <a
                          href={`https://fitgirl-repacks.site/${game.id}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="repack-link-button"
                          aria-label={"Open repack for " + game.title}
                        >
                          <ExternalLink className="repack-link-icon" />
                          <span className="repack-link-text">View repack</span>
                        </a>
                        <div className="card-flags">
                          <label className="flag-label">
                            <input
                              type="checkbox"
                              checked={!!game.installed}
                              onChange={() => toggleInstalled(game.id)}
                            />
                            <span>Installed</span>
                          </label>
                          <label className="flag-label">
                            <input
                              type="checkbox"
                              checked={!!game.finished}
                              onChange={() => toggleFinished(game.id)}
                            />
                            <span>Finished</span>
                          </label>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default App;
