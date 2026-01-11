import React, { useEffect, useMemo, useState, useRef, useCallback, memo } from "react";
import { ExternalLink, Heart, Search, X } from "lucide-react";
import { API_URL, DEFAULT_IMAGE } from "./config";

const ITEMS_PER_PAGE = 200; // Número de juegos a cargar por vez (muy aumentado)
const INITIAL_ITEMS = 200; // Número de juegos iniciales (muy aumentado)

// Componente GameCard memoizado para evitar re-renders innecesarios
const GameCard = memo(({ game, inWishlist, onToggleWishlist, setCardRef }) => {
  const imgSrc = game.image || DEFAULT_IMAGE;
  
  return (
    <article 
      key={game.id}
      ref={(el) => setCardRef(game.id, el)}
      className="card card-with-background card-enter"
      style={{
        backgroundImage: `url(${imgSrc})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className="card-overlay"></div>
      <button
        className={
          inWishlist ? "heart-button heart-button-active" : "heart-button"
        }
        type="button"
        onClick={() => onToggleWishlist(game)}
        aria-label={
          inWishlist ? "Remove from wishlist" : "Add to wishlist"
        }
      >
        <Heart className="heart-icon" />
      </button>
      <div className="card-content">
        <h3 className="card-title">{game.title}</h3>
        <p className="card-meta">
          {game.year ? game.year : "Unknown year"}
        </p>
        <a
          href={game.link || `https://fitgirl-repacks.site/${game.slug}/`}
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
});

GameCard.displayName = 'GameCard';

// Componente WishlistCard memoizado
const WishlistCard = memo(({ game, onToggleWishlist, onToggleInstalled, onToggleFinished, setCardRef }) => {
  const imgSrc = game.image || DEFAULT_IMAGE;
  
  return (
    <article 
      key={game.id}
      ref={(el) => setCardRef(`wishlist-${game.id}`, el)}
      className="card card-compact card-with-background card-enter"
      style={{
        backgroundImage: `url(${imgSrc})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className="card-overlay"></div>
      <button
        className="heart-button heart-button-active"
        type="button"
        onClick={() => onToggleWishlist(game)}
        aria-label="Remove from wishlist"
      >
        <Heart className="heart-icon" />
      </button>
      <div className="card-content">
        <h3 className="card-title">{game.title}</h3>
        <p className="card-meta">
          {game.year ? game.year : "Unknown year"}
        </p>
        <a
          href={game.link || `https://fitgirl-repacks.site/${game.slug}/`}
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
              onChange={() => onToggleInstalled(game.id)}
            />
            <span>Installed</span>
          </label>
          <label className="flag-label">
            <input
              type="checkbox"
              checked={!!game.finished}
              onChange={() => onToggleFinished(game.id)}
            />
            <span>Finished</span>
          </label>
        </div>
      </div>
    </article>
  );
});

WishlistCard.displayName = 'WishlistCard';

// Hook para animaciones de entrada
function useCardAnimation(dependencies = []) {
  const cardRefs = useRef(new Map());
  const observerRef = useRef(null);
  
  useEffect(() => {
    // Crear observer si no existe
    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              // Sin delay - aparición inmediata para mejor performance
              entry.target.classList.add('card-visible');
              entry.target.classList.remove('card-enter');
              
              // Remover card-visible después de la animación para que hover funcione
              setTimeout(() => {
                entry.target.classList.remove('card-visible');
              }, 250); // Duración de la animación
              
              observerRef.current.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.1, rootMargin: '50px' }
      );
    }

    // Observar todas las cards actuales
    cardRefs.current.forEach((card) => {
      if (card && card.classList.contains('card-enter')) {
        observerRef.current.observe(card);
      }
    });

    return () => {
      if (observerRef.current) {
        cardRefs.current.forEach((card) => {
          if (card) {
            observerRef.current.unobserve(card);
          }
        });
      }
    };
  }, dependencies);

  const setCardRef = useCallback((id, element) => {
    if (element) {
      cardRefs.current.set(id, element);
      // Observar inmediatamente si tiene la clase card-enter
      if (observerRef.current && element.classList.contains('card-enter')) {
        observerRef.current.observe(element);
      }
    } else {
      cardRefs.current.delete(id);
    }
  }, []);

  return setCardRef;
}

function App() {
  const setCardRef = useCardAnimation();
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
  const [searchQuery, setSearchQuery] = useState("");
  const [displayedGamesCount, setDisplayedGamesCount] = useState(INITIAL_ITEMS);
  const [displayedWishlistCount, setDisplayedWishlistCount] = useState(INITIAL_ITEMS);

  // Función para normalizar texto para búsqueda flexible
  const normalizeText = useCallback((text) => {
    if (!text) return "";
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^a-z0-9\s]/g, " ") // Remove special characters
      .replace(/\s+/g, " ") // Normalize spaces
      .trim();
  }, []);

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
    let filtered = games;

    // Apply search filter (always search in ALL games)
    if (searchQuery.trim()) {
      const normalizedQuery = normalizeText(searchQuery);
      filtered = filtered.filter((game) => {
        const normalizedTitle = normalizeText(game.title);
        return normalizedTitle.includes(normalizedQuery);
      });
      // When searching, ignore year filter - return all matching results
      return filtered;
    }

    // Apply year filter only when NOT searching
    if (yearFilter === "all") return filtered;
    if (yearFilter === "no-year") {
      return filtered.filter((g) => !g.year);
    }
    const numericYear = Number(yearFilter);
    return filtered.filter((g) => g.year === numericYear);
  }, [games, yearFilter, searchQuery, normalizeText]);

  const toggleWishlist = useCallback((game) => {
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
          link: game.link,
          image: game.image,
          year: game.year,
          installed: false,
          finished: false,
        },
      ];
    });
  }, []);

  const toggleInstalled = useCallback((id) => {
    setWishlist((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, installed: !item.installed } : item
      )
    );
  }, []);

  const clearWishlist = useCallback(() => {
    setWishlist([]);
  }, []);

  const toggleFinished = useCallback((id) => {
    setWishlist((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, finished: !item.finished } : item
      )
    );
  }, []);

  // Scroll listener para cargar más juegos de forma anticipada
  useEffect(() => {
    const handleScroll = () => {
      // Calcular si estamos cerca del final
      const scrollHeight = document.documentElement.scrollHeight;
      const scrollTop = document.documentElement.scrollTop;
      const clientHeight = document.documentElement.clientHeight;
      
      // Cargar más cuando estemos a 3000px del final (extremadamente anticipado)
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      
      if (distanceFromBottom < 3000) {
        if (view === "games" && displayedGamesCount < filteredGames.length) {
          setDisplayedGamesCount((prev) => 
            Math.min(prev + ITEMS_PER_PAGE, filteredGames.length)
          );
        } else if (view === "wishlist" && displayedWishlistCount < wishlist.length) {
          setDisplayedWishlistCount((prev) => 
            Math.min(prev + ITEMS_PER_PAGE, wishlist.length)
          );
        }
      }
    };

    // Throttle para no ejecutar demasiado frecuentemente
    let ticking = false;
    const scrollListener = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', scrollListener);
    
    // Ejecutar una vez al montar para cargar inicial si es necesario
    handleScroll();

    return () => {
      window.removeEventListener('scroll', scrollListener);
    };
  }, [view, displayedGamesCount, displayedWishlistCount, filteredGames.length, wishlist.length]);

  // Reset counter cuando cambia el filtro, la búsqueda o la vista
  useEffect(() => {
    setDisplayedGamesCount(INITIAL_ITEMS);
  }, [yearFilter, searchQuery]);

  useEffect(() => {
    if (view === "games") {
      setDisplayedGamesCount(INITIAL_ITEMS);
    } else {
      setDisplayedWishlistCount(INITIAL_ITEMS);
    }
  }, [view]);

  // Obtener solo los juegos que se deben mostrar
  const displayedGames = useMemo(() => {
    return filteredGames.slice(0, displayedGamesCount);
  }, [filteredGames, displayedGamesCount]);

  const displayedWishlist = useMemo(() => {
    return wishlist.slice(0, displayedWishlistCount);
  }, [wishlist, displayedWishlistCount]);

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">FitGirl Games Tracker</h1>
        
        <div className="header-controls">
          <nav className="app-nav">
            <button
              type="button"
              className={
                view === "games" ? "nav-button nav-button-active" : "nav-button"
              }
              onClick={() => setView("games")}
            >
              Games
              <span className="nav-badge">{games.length}</span>
            </button>
            <button
              type="button"
              className={
                view === "wishlist" ? "nav-button nav-button-active" : "nav-button"
              }
              onClick={() => setView("wishlist")}
            >
              Wishlist
              <span className="nav-badge">{wishlist.length}</span>
            </button>
          </nav>
        </div>
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
              {/* Search bar */}
              <div className="search-container">
                <div className="search-input-wrapper">
                  <Search className="search-icon" size={18} />
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Search games by title..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      className="search-clear-button"
                      onClick={() => setSearchQuery("")}
                      aria-label="Clear search"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                {searchQuery && (
                  <div className="search-results-info">
                    {filteredGames.length} game{filteredGames.length !== 1 ? 's' : ''} found
                  </div>
                )}
              </div>
              
              {/* Year filters carousel */}
              {yearOptions.years.length > 0 && (
                <div className="year-filters-container">
                  <div className="year-filters-carousel">
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
                </div>
              )}
              <div className="grid">
                {displayedGames.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    inWishlist={wishlistIds.has(game.id)}
                    onToggleWishlist={toggleWishlist}
                    setCardRef={setCardRef}
                  />
                ))}
              </div>
              
              {/* Indicador de carga */}
              {displayedGamesCount < filteredGames.length && (
                <div style={{ height: '20px', margin: '2rem 0' }}>
                  <div className="status status-loading">
                    <div className="spinner" />
                    <span>Loading more games...</span>
                  </div>
                </div>
              )}
              
              {displayedGamesCount >= filteredGames.length && filteredGames.length > INITIAL_ITEMS && (
                <div style={{ textAlign: 'center', margin: '2rem 0', color: '#9ca3af', fontSize: '0.9rem' }}>
                  ✓ All {filteredGames.length} games loaded
                </div>
              )}
            </section>
          )}

          {view === "wishlist" && (
            <section className="section section-wishlist">
              {wishlist.length > 0 && (
                <div className="wishlist-controls">
                  <button
                    type="button"
                    className="clear-wishlist-button"
                    onClick={clearWishlist}
                  >
                    Clear all
                  </button>
                </div>
              )}
              {wishlist.length === 0 && (
                <div className="status status-empty">
                  <span>
                    You haven't added any games to your wishlist yet.
                  </span>
                </div>
              )}
              {wishlist.length > 0 && (
                <>
                  <div className="grid">
                    {displayedWishlist.map((game) => (
                      <WishlistCard
                        key={game.id}
                        game={game}
                        onToggleWishlist={toggleWishlist}
                        onToggleInstalled={toggleInstalled}
                        onToggleFinished={toggleFinished}
                        setCardRef={setCardRef}
                      />
                    ))}
                  </div>
                
                {/* Indicador de carga en wishlist */}
                {displayedWishlistCount < wishlist.length && (
                  <div style={{ height: '20px', margin: '2rem 0' }}>
                    <div className="status status-loading">
                      <div className="spinner" />
                      <span>Loading more games...</span>
                    </div>
                  </div>
                )}
                
                {displayedWishlistCount >= wishlist.length && wishlist.length > INITIAL_ITEMS && (
                  <div style={{ textAlign: 'center', margin: '2rem 0', color: '#9ca3af', fontSize: '0.9rem' }}>
                    ✓ All {wishlist.length} games loaded
                  </div>
                )}
              </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default App;
