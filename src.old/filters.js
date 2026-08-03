let onChangeCallback = null;
let activeCountries = new Set();
let activeTags = new Set();
let activeBitrates = new Set();

let filterSidebar = null;
let filterCountries = null;
let filterTags = null;
let filterBitrates = null;

let _boundOutsideClick = null;

export function initFilters(stations, onChange) {
  filterSidebar = document.getElementById('filter-sidebar');
  filterCountries = document.getElementById('filter-countries');
  filterTags = document.getElementById('filter-tags');
  filterBitrates = document.getElementById('filter-bitrates');

  if (!filterSidebar) {
    console.warn('Filters: #filter-sidebar not found');
    return;
  }

  onChangeCallback = onChange;

  renderFilters(stations);

  // Checkbox change listeners (delegated)
  if (filterCountries) {
    filterCountries.addEventListener('change', onFilterChange);
  }
  if (filterTags) {
    filterTags.addEventListener('change', onFilterChange);
  }
  if (filterBitrates) {
    filterBitrates.addEventListener('change', onFilterChange);
  }

  // Close button
  const closeBtn = filterSidebar.querySelector('.close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeFilters);
  }

  // Click outside to close
  _boundOutsideClick = (e) => {
    if (filterSidebar.classList.contains('open')) {
      if (!filterSidebar.contains(e.target) && !e.target.closest('[data-open-filters]')) {
        closeFilters();
      }
    }
  };
  document.addEventListener('click', _boundOutsideClick);
}

export function openFilters() {
  if (filterSidebar) {
    filterSidebar.classList.add('open');
  }
}

export function closeFilters() {
  if (filterSidebar) {
    filterSidebar.classList.remove('open');
  }
}

export function getActiveFilters() {
  return {
    countries: Array.from(activeCountries),
    tags: Array.from(activeTags),
    bitrates: Array.from(activeBitrates)
  };
}

export function updateFilterOptions(stations) {
  // Preserve current active values
  const prevCountries = new Set(activeCountries);
  const prevTags = new Set(activeTags);
  const prevBitrates = new Set(activeBitrates);

  renderFilters(stations);

  // Re-check previously selected values that still exist
  restoreCheckboxState(filterCountries, prevCountries);
  restoreCheckboxState(filterTags, prevTags);
  restoreCheckboxState(filterBitrates, prevBitrates);

  // Update the active sets to only include values that are still present
  updateActiveSets();
}

export function setFiltersChangeCallback(cb) {
  onChangeCallback = cb;
}

// Internal functions

function renderFilters(stations) {
  // Compute country counts
  const countryCounts = {};
  const tagCounts = {};
  const bitrateCounts = {};

  for (const station of stations) {
    // Countries
    const country = station.country || 'Unknown';
    countryCounts[country] = (countryCounts[country] || 0) + 1;

    // Tags
    if (station.tags) {
      const tags = station.tags.split(',').map(t => t.trim()).filter(Boolean);
      for (const tag of tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }

    // Bitrates
    const bucket = getBitrateBucket(station.bitrate);
    bitrateCounts[bucket] = (bitrateCounts[bucket] || 0) + 1;
  }

  // Render each category (top 30, sorted by count)
  if (filterCountries) {
    renderCheckboxList(filterCountries, countryCounts, 'country', activeCountries, 30);
  }
  if (filterTags) {
    renderCheckboxList(filterTags, tagCounts, 'tag', activeTags, 30);
  }
  if (filterBitrates) {
    renderCheckboxList(filterBitrates, bitrateCounts, 'bitrate', activeBitrates, null, sortBitrateBuckets);
  }
}

function renderCheckboxList(container, counts, inputName, activeSet, limit = 30, sortFn) {
  const entries = Object.entries(counts);

  if (sortFn) {
    entries.sort(sortFn);
  } else {
    entries.sort((a, b) => b[1] - a[1]); // Sort by count descending
  }

  const topEntries = limit ? entries.slice(0, limit) : entries;

  container.innerHTML = '';

  const list = document.createElement('div');
  list.className = 'filter-list';

  for (const [label, count] of topEntries) {
    const item = document.createElement('label');
    item.className = 'filter-item';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = label;
    input.name = inputName;
    if (activeSet.has(label)) {
      input.checked = true;
    }

    const spanLabel = document.createElement('span');
    spanLabel.textContent = label;

    const spanCount = document.createElement('span');
    spanCount.className = 'filter-count';
    spanCount.textContent = `(${count})`;

    item.appendChild(input);
    item.appendChild(spanLabel);
    item.appendChild(spanCount);
    list.appendChild(item);
  }

  container.appendChild(list);
}

function onFilterChange(e) {
  const checkbox = e.target;
  if (checkbox.tagName !== 'INPUT' || checkbox.type !== 'checkbox') return;

  const value = checkbox.value;
  const name = checkbox.name;

  if (name === 'country') {
    toggleSet(activeCountries, value, checkbox.checked);
  } else if (name === 'tag') {
    toggleSet(activeTags, value, checkbox.checked);
  } else if (name === 'bitrate') {
    toggleSet(activeBitrates, value, checkbox.checked);
  }

  if (onChangeCallback) {
    onChangeCallback(getActiveFilters());
  }
}

function toggleSet(set, value, isChecked) {
  if (isChecked) {
    set.add(value);
  } else {
    set.delete(value);
  }
}

function updateActiveSets() {
  // Sync active sets with currently checked checkboxes
  activeCountries = collectCheckedValues(filterCountries);
  activeTags = collectCheckedValues(filterTags);
  activeBitrates = collectCheckedValues(filterBitrates);
}

function collectCheckedValues(container) {
  if (!container) return new Set();
  const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
  return new Set(Array.from(checkboxes).map(cb => cb.value));
}

function restoreCheckboxState(container, prevActive) {
  if (!container) return;
  const checkboxes = container.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(cb => {
    if (prevActive.has(cb.value)) {
      cb.checked = true;
    }
  });
}

function sortBitrateBuckets(a, b) {
  const order = ['0-64 kbps', '64-128 kbps', '128-192 kbps', '192-320 kbps', '320+ kbps', 'Unknown'];
  return order.indexOf(a[0]) - order.indexOf(b[0]);
}

function getBitrateBucket(bitrate) {
  const b = Number(bitrate) || 0;
  if (b === 0) return 'Unknown';
  if (b <= 64) return '0-64 kbps';
  if (b <= 128) return '64-128 kbps';
  if (b <= 192) return '128-192 kbps';
  if (b <= 320) return '192-320 kbps';
  return '320+ kbps';
}
