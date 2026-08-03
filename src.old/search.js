let searchModal = null;
let searchInput = null;
let searchResults = null;
let allStations = [];
let filteredStations = [];
let selectedIndex = -1;
let onSelectCallback = null;
let backdropEl = null;

let _boundKeydown = null;
let _boundBackdropClick = null;
let _boundInputHandler = null;

export function initSearch(stations, onSelect) {
  searchModal = document.getElementById('search-modal');
  searchInput = document.getElementById('search-input');
  searchResults = document.getElementById('search-results');

  if (!searchModal || !searchInput || !searchResults) {
    console.warn('Search: required DOM elements not found');
    return;
  }

  onSelectCallback = onSelect;
  allStations = stations;
  filteredStations = [];
  selectedIndex = -1;

  // Find backdrop
  backdropEl = searchModal.querySelector('.search-backdrop');

  // Input event
  _boundInputHandler = handleInput;
  searchInput.addEventListener('input', _boundInputHandler);

  // Keydown on input
  _boundKeydown = onKeydown;
  searchInput.addEventListener('keydown', _boundKeydown);

  // Backdrop click → close
  if (backdropEl) {
    _boundBackdropClick = (e) => {
      if (e.target === backdropEl) {
        closeSearch();
      }
    };
    searchModal.addEventListener('click', _boundBackdropClick);
  }

  // Click on result items (delegated)
  searchResults.addEventListener('click', onResultClick);
}

export function openSearch() {
  if (!searchModal || !searchInput) return;
  searchModal.style.display = 'flex';
  searchInput.value = '';
  searchInput.focus();
  selectedIndex = -1;
  filteredStations = allStations.slice(0, 50); // Show first 50 initially
  renderResults();
}

export function closeSearch() {
  if (!searchModal) return;
  searchModal.style.display = 'none';
  if (searchInput) searchInput.value = '';
  selectedIndex = -1;
}

export function updateSearchStations(stations) {
  allStations = stations;
  // If search is open, re-run filter with current input
  if (searchModal && searchModal.style.display === 'flex') {
    handleInput();
  }
}

// Internal functions
function handleInput() {
  if (!searchInput) return;
  const query = searchInput.value.trim().toLowerCase();

  if (!query) {
    filteredStations = allStations.slice(0, 50);
  } else {
    filteredStations = allStations.filter(station => {
      const nameMatch = station.name && station.name.toLowerCase().includes(query);
      const countryMatch = station.country && station.country.toLowerCase().includes(query);
      const tagsMatch = station.tags && station.tags.toLowerCase().includes(query);
      return nameMatch || countryMatch || tagsMatch;
    }).slice(0, 50);
  }

  selectedIndex = -1;
  renderResults();
}

function renderResults() {
  if (!searchResults || !searchInput) return;
  searchResults.innerHTML = '';

  const query = searchInput.value.trim().toLowerCase();

  for (let i = 0; i < filteredStations.length; i++) {
    const station = filteredStations[i];
    const item = document.createElement('div');
    item.className = 'search-result-item';
    item.dataset.index = i;

    if (i === selectedIndex) {
      item.classList.add('selected');
    }

    // Build highlighted name
    const highlightedName = highlightMatch(station.name || 'Unknown', query);
    const flag = getCountryFlagEmoji(station.countrycode || '');

    // Line 1: Flag + name
    const line1 = document.createElement('div');
    line1.innerHTML = `${flag} ${highlightedName}`;
    line1.style.fontWeight = '600';
    item.appendChild(line1);

    // Line 2: Country + tags
    const line2 = document.createElement('div');
    line2.style.fontSize = '0.85em';
    line2.style.opacity = '0.7';
    const tagsText = station.tags ? station.tags.split(',').slice(0, 3).join(', ') : '';
    line2.textContent = [station.country, tagsText].filter(Boolean).join(' \u00B7 ');
    item.appendChild(line2);

    searchResults.appendChild(item);
  }

  if (filteredStations.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'search-result-item';
    empty.textContent = 'No stations found';
    empty.style.opacity = '0.5';
    empty.style.cursor = 'default';
    searchResults.appendChild(empty);
  }
}

function onResultClick(e) {
  const item = e.target.closest('.search-result-item');
  if (!item) return;
  const index = parseInt(item.dataset.index, 10);
  if (isNaN(index)) return;
  selectStation(index);
}

function onKeydown(e) {
  if (filteredStations.length === 0) return;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      navigateSelection(1);
      break;
    case 'ArrowUp':
      e.preventDefault();
      navigateSelection(-1);
      break;
    case 'Enter':
      e.preventDefault();
      if (selectedIndex >= 0) {
        selectStation(selectedIndex);
      } else if (filteredStations.length > 0) {
        selectStation(0);
      }
      break;
    case 'Escape':
      e.preventDefault();
      closeSearch();
      break;
  }
}

function navigateSelection(direction) {
  if (filteredStations.length === 0) return;

  if (selectedIndex === -1) {
    selectedIndex = direction > 0 ? 0 : filteredStations.length - 1;
  } else {
    selectedIndex += direction;
  }

  // Clamp
  if (selectedIndex < 0) selectedIndex = filteredStations.length - 1;
  if (selectedIndex >= filteredStations.length) selectedIndex = 0;

  // Update classes
  const items = searchResults.querySelectorAll('.search-result-item');
  items.forEach((el, i) => {
    if (i === selectedIndex) {
      el.classList.add('selected');
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      el.classList.remove('selected');
    }
  });
}

function selectStation(index) {
  if (index < 0 || index >= filteredStations.length) return;
  if (onSelectCallback) {
    onSelectCallback(filteredStations[index]);
  }
  closeSearch();
}

// Highlight matching portion of text with <mark> tags
function highlightMatch(text, query) {
  if (!query) return escapeHtml(text);
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query);
  if (idx === -1) return escapeHtml(text);

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);

  return `${escapeHtml(before)}<mark>${escapeHtml(match)}</mark>${highlightMatch(after, query)}`;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getCountryFlagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '';
  const code = countryCode.toUpperCase();
  // Convert to regional indicator symbols
  return String.fromCodePoint(code.charCodeAt(0) + 0x1F1A1, code.charCodeAt(1) + 0x1F1A1);
}
