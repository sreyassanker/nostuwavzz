import {
  fetchStations,
  filterStations,
  getTopCountries,
  getTopTags,
  getBitrateBuckets
} from './api.js';
import {
  getFavorites,
  toggleFavorite,
  isFavorite,
  getLastPlayed,
  setLastPlayed
} from './storage.js';
import {
  initPlayer,
  playStation,
  togglePlay,
  setVolume,
  getCurrentStation,
  isPlayingNow,
  playNext,
  playPrev,
  pause
} from './player.js';
import { showToast } from './toast.js';
import { initMap, updateMapMarkers, highlightMapMarker } from './map.js';
import { initSearch, openSearch, closeSearch, updateSearchStations } from './search.js';
import {
  initFilters,
  openFilters,
  closeFilters,
  getActiveFilters,
  updateFilterOptions,
  setFiltersChangeCallback
} from './filters.js';

// ========================================
// State
// ========================================
let allStations = [];
let currentStations = [];
let favoritesOnly = false;
let activeStationUuid = null;
let sleepTimerId = null;

// ========================================
// DOM Refs
// ========================================
const gridEl = document.getElementById('station-grid');
const emptyStateEl = document.getElementById('empty-state');
const gridTitleEl = document.getElementById('grid-title');
const gridCountEl = document.getElementById('grid-count');
const playerStationEl = document.getElementById('player-station');
const playerMetaEl = document.getElementById('player-meta');
const btnPlay = document.getElementById('btn-play');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnFavorite = document.getElementById('btn-favorite');
const btnSleep = document.getElementById('btn-sleep');
const sleepMenu = document.getElementById('sleep-menu');
const volumeSlider = document.getElementById('volume');
const favoritesToggle = document.getElementById('favorites-toggle');
const filtersToggle = document.getElementById('filters-toggle');
const closeFiltersBtn = document.getElementById('close-filters');
const clearFiltersBtn = document.getElementById('clear-filters');
const searchModal = document.getElementById('search-modal');
const playerBar = document.getElementById('player-bar');

// ========================================
// Country Code -> Flag Emoji
// ========================================
function countryCodeToFlag(code) {
  if (!code || code.length !== 2) return '';
  const cc = code.toUpperCase();
  return String.fromCodePoint(0x1F1E6 + cc.charCodeAt(0) - 65)
       + String.fromCodePoint(0x1F1E6 + cc.charCodeAt(1) - 65);
}

// ========================================
// Grid Rendering
// ========================================
function renderGrid(stations) {
  if (!gridEl) return;

  // Clear grid
  gridEl.innerHTML = '';

  // Show/hide empty state
  if (stations.length === 0) {
    gridEl.style.display = 'none';
    if (emptyStateEl) emptyStateEl.style.display = 'flex';
    if (gridCountEl) gridCountEl.textContent = '0 stations';
    return;
  }

  gridEl.style.display = 'grid';
  if (emptyStateEl) emptyStateEl.style.display = 'none';
  if (gridCountEl) gridCountEl.textContent = `${stations.length} station${stations.length !== 1 ? 's' : ''}`;

  // Build cards
  for (const station of stations) {
    const card = document.createElement('div');
    card.className = 'station-card';
    if (station.stationuuid === activeStationUuid) {
      card.classList.add('station-card--active');
    }
    card.dataset.uuid = station.stationuuid;

    const flag = countryCodeToFlag(station.countrycode);
    const tags = station.tags
      ? station.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 3)
      : [];

    card.innerHTML = `
      <span class="station-card__flag">${flag}</span>
      <span class="station-card__name">${escapeHtml(station.name)}</span>
      <div class="station-card__tags">
        ${tags.map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('')}
      </div>
      <button class="station-card__play" title="Play">&#9654;</button>
    `;

    // Click card -> play
    card.addEventListener('click', (e) => {
      if (e.target.closest('.station-card__play')) {
        e.stopPropagation();
      }
      onStationClick(station);
    });

    gridEl.appendChild(card);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ========================================
// Highlight active card
// ========================================
function highlightCard(uuid) {
  activeStationUuid = uuid;
  if (!gridEl) return;
  const cards = gridEl.querySelectorAll('.station-card');
  cards.forEach(card => {
    if (card.dataset.uuid === uuid) {
      card.classList.add('station-card--active');
    } else {
      card.classList.remove('station-card--active');
    }
  });
}

// ========================================
// Player Bar Updates
// ========================================
function updatePlayerBar(station) {
  if (!station) return;

  if (playerStationEl) {
    playerStationEl.textContent = station.name || 'Unknown Station';
  }

  if (playerMetaEl) {
    const parts = [];
    if (station.country) parts.push(station.country);
    if (station.bitrate) parts.push(`${station.bitrate} kbps`);
    if (station.codec && station.codec !== 'UNKNOWN') parts.push(station.codec);
    playerMetaEl.textContent = parts.join(' · ');
  }

  updateFavoriteBtnState();
}

function updatePlayBtnState() {
  if (!btnPlay) return;
  btnPlay.innerHTML = isPlayingNow() ? '&#9208;' : '&#9654;';
}

function updateFavoriteBtnState() {
  if (!btnFavorite) return;
  const station = getCurrentStation();
  if (!station) {
    btnFavorite.classList.remove('player-btn--active');
    return;
  }
  if (isFavorite(station.stationuuid)) {
    btnFavorite.classList.add('player-btn--active');
  } else {
    btnFavorite.classList.remove('player-btn--active');
  }
}

function updateFavoritesCount() {
  const countEl = document.querySelector('.favorites-count');
  if (countEl) {
    countEl.textContent = getFavorites().size;
  }
}

// ========================================
// Station Click Handler
// ========================================
function onStationClick(station) {
  if (!station) return;

  playStation(station);
  setLastPlayed(station);
  updatePlayerBar(station);
  updatePlayBtnState();
  highlightCard(station.stationuuid);
  highlightMapMarker(station.stationuuid);
}

// ========================================
// Filters Change Handler
// ========================================
function onFiltersChange() {
  const filters = getActiveFilters();
  filters.favoritesOnly = favoritesOnly;
  filters.favoriteUuids = getFavorites();

  currentStations = filterStations(allStations, filters);

  renderGrid(currentStations);
  updateMapMarkers(currentStations);
  updateSearchStations(currentStations);

  // Update grid title
  if (gridTitleEl) {
    if (favoritesOnly) {
      gridTitleEl.textContent = 'Favorites';
    } else if (filters.query || filters.countries.length || filters.tags.length || filters.bitrates.length) {
      gridTitleEl.textContent = 'Filtered Stations';
    } else {
      gridTitleEl.textContent = 'All Stations';
    }
  }
}

// ========================================
// Loading State
// ========================================
function showLoadingState() {
  if (!gridEl) return;
  gridEl.style.display = 'none';
  if (emptyStateEl) {
    emptyStateEl.style.display = 'flex';
    emptyStateEl.innerHTML = `
      <div class="loading-spinner"></div>
      <p>Loading stations...</p>
    `;
  }
  if (gridCountEl) gridCountEl.textContent = '';
}

function showErrorState() {
  if (!gridEl) return;
  gridEl.style.display = 'none';
  if (emptyStateEl) {
    emptyStateEl.style.display = 'flex';
    emptyStateEl.innerHTML = `
      <p>Failed to load stations.</p>
      <button class="retry-btn" id="retry-load">Retry</button>
    `;
  }
  const retryBtn = document.getElementById('retry-load');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      loadStations();
    }, { once: true });
  }
  if (gridCountEl) gridCountEl.textContent = '';
}

// ========================================
// Load Stations
// ========================================
async function loadStations() {
  showLoadingState();

  try {
    const stations = await fetchStations();
    allStations = stations;
    currentStations = stations;

    renderGrid(stations);
    initMap('map', stations, onStationClick);
    initSearch(stations, onStationClick);
    initFilters(stations, onFiltersChange);
    updateFilterOptions(stations);

    // Restore last played (show in player bar, don't auto-play)
    const lastPlayed = getLastPlayed();
    if (lastPlayed) {
      updatePlayerBar(lastPlayed);
    }

    showToast(`${stations.length} stations loaded`);
  } catch (err) {
    console.error('Failed to load stations:', err);
    showToast('Failed to load stations', 'error');
    showErrorState();
  }
}

// ========================================
// Player Bar Events
// ========================================
function setupPlayerEvents() {
  // Play/Pause
  if (btnPlay) {
    btnPlay.addEventListener('click', () => {
      togglePlay();
      updatePlayBtnState();
    });
  }

  // Previous
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      playPrev(currentStations);
      const station = getCurrentStation();
      if (station) {
        setLastPlayed(station);
        updatePlayerBar(station);
        highlightCard(station.stationuuid);
        highlightMapMarker(station.stationuuid);
      }
    });
  }

  // Next
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      playNext(currentStations);
      const station = getCurrentStation();
      if (station) {
        setLastPlayed(station);
        updatePlayerBar(station);
        highlightCard(station.stationuuid);
        highlightMapMarker(station.stationuuid);
      }
    });
  }

  // Volume
  if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
      setVolume(e.target.value);
    });
    // Set initial volume
    setVolume(volumeSlider.value);
  }

  // Favorite toggle
  if (btnFavorite) {
    btnFavorite.addEventListener('click', () => {
      const station = getCurrentStation();
      if (!station) return;
      const isFav = toggleFavorite(station.stationuuid);
      updateFavoriteBtnState();
      updateFavoritesCount();
      showToast(isFav ? 'Added to favorites' : 'Removed from favorites');

      // Refresh grid if favorites filter is active
      if (favoritesOnly) {
        onFiltersChange();
      }
    });
  }

  // Sleep timer toggle
  if (btnSleep && sleepMenu) {
    btnSleep.addEventListener('click', (e) => {
      e.stopPropagation();
      sleepMenu.classList.toggle('sleep-menu--open');
    });

    // Close sleep menu on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.sleep-dropdown') && sleepMenu.classList.contains('sleep-menu--open')) {
        sleepMenu.classList.remove('sleep-menu--open');
      }
    });

    // Sleep timer buttons
    const sleepButtons = sleepMenu.querySelectorAll('button[data-min]');
    sleepButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const mins = parseInt(btn.dataset.min, 10);

        // Clear existing timer
        if (sleepTimerId) {
          clearTimeout(sleepTimerId);
          sleepTimerId = null;
        }

        if (mins > 0) {
          sleepTimerId = setTimeout(() => {
            pause();
            updatePlayBtnState();
            showToast(`Sleep timer \u2014 playback paused`);
            sleepTimerId = null;
          }, mins * 60000);
          showToast(`Sleep timer set for ${mins} min`);
        } else {
          showToast('Sleep timer off');
        }

        sleepMenu.classList.remove('sleep-menu--open');
      });
    });
  }
}

// ========================================
// Header Events
// ========================================
function setupHeaderEvents() {
  // Favorites toggle
  if (favoritesToggle) {
    favoritesToggle.addEventListener('click', () => {
      favoritesOnly = !favoritesOnly;
      favoritesToggle.classList.toggle('header-btn--active', favoritesOnly);
      onFiltersChange();
    });
  }

  // Filters toggle
  if (filtersToggle) {
    filtersToggle.addEventListener('click', () => {
      openFilters();
    });
  }

  // Close filters
  if (closeFiltersBtn) {
    closeFiltersBtn.addEventListener('click', () => {
      closeFilters();
    });
  }

  // Clear filters button (in empty state)
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      favoritesOnly = false;
      favoritesToggle.classList.remove('header-btn--active');
      onFiltersChange();
    });
  }
}

// ========================================
// Keyboard Shortcuts
// ========================================
function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + K -> open search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      openSearch();
      return;
    }

    // Escape -> close search, close filters
    if (e.key === 'Escape') {
      closeSearch();
      closeFilters();
      return;
    }
  });
}

// ========================================
// Audio Error Handling
// ========================================
function setupAudioErrorHandling() {
  initPlayer(
    () => {
      // Error callback
      showToast('Station unavailable', 'error');
      updatePlayBtnState();
      setTimeout(() => {
        playNext(currentStations);
        const station = getCurrentStation();
        if (station) {
          setLastPlayed(station);
          updatePlayerBar(station);
          highlightCard(station.stationuuid);
          highlightMapMarker(station.stationuuid);
          updatePlayBtnState();
        }
      }, 1500);
    },
    () => {
      // Ended callback
      updatePlayBtnState();
    }
  );
}

// ========================================
// Search modal keyboard handling
// ========================================
function setupSearchModal() {
  if (!searchModal) return;

  const backdrop = searchModal.querySelector('.search-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', () => {
      closeSearch();
    });
  }
}

// ========================================
// Startup
// ========================================
function startup() {
  updateFavoritesCount();
  setupPlayerEvents();
  setupHeaderEvents();
  setupKeyboard();
  setupAudioErrorHandling();
  setupSearchModal();
  loadStations();
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startup);
} else {
  startup();
}
