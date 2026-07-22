import React, { useState, useRef, useEffect, memo } from 'react';
import '../styles/VendorSearch.css';

const TRADES = [
  'Electrical',
  'Plumbing',
  'HVAC',
  'Concrete',
  'Steel',
  'Framing',
  'Roofing',
  'Painting',
  'Drywall',
  'Flooring',
  'Masonry',
  'Excavation'
];

const INSURANCE_STATUS = [
  { value: '', label: 'All Insurance Status' },
  { value: 'verified', label: 'Verified' },
  { value: 'pending', label: 'Pending' },
  { value: 'not_verified', label: 'Not Verified' }
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'reviews', label: 'Most Reviews' }
];

function VendorSearchComponent({ filters, onFilterChange, loading }) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const [cityInput, setCityInput] = useState(filters.city);
  const [expandFilters, setExpandFilters] = useState(false);
  const debounceTimer = useRef(null);

  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  useEffect(() => {
    setCityInput(filters.city);
  }, [filters.city]);

  // Debounce both free-text fields (search + city) so typing doesn't fire
  // an API request per keystroke.
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      if (searchInput !== filters.search || cityInput !== filters.city) {
        onFilterChange({ ...filters, search: searchInput, city: cityInput });
      }
    }, 300);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchInput, cityInput, filters, onFilterChange]);

  const handleFilterChange = (field, value) => {
    onFilterChange({ ...filters, [field]: value });
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setCityInput('');
    onFilterChange({
      search: '',
      trade: '',
      city: '',
      min_rating: '',
      insurance_status: '',
      sort: 'newest'
    });
  };

  const isFiltered = searchInput || filters.trade || cityInput || filters.insurance_status || filters.min_rating;

  return (
    <div className="vendor-search">
      <div className="search-bar-compact">
        <input
          type="text"
          placeholder="Search vendors..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="search-input-compact"
          disabled={loading}
        />
        <button 
          className="filter-toggle-compact"
          onClick={() => setExpandFilters(!expandFilters)}
        >
          🔧 More Filters
        </button>
      </div>

      {expandFilters && (
        <div className="filters-panel-compact">
          <div className="filters-grid-compact">
            <div className="filter-group-compact">
              <label>Trade</label>
              <select
                value={filters.trade}
                onChange={(e) => handleFilterChange('trade', e.target.value)}
                disabled={loading}
              >
                <option value="">All Trades</option>
                {TRADES.map(trade => (
                  <option key={trade} value={trade}>{trade}</option>
                ))}
              </select>
            </div>

            <div className="filter-group-compact">
              <label>City</label>
              {/* Free text, not a fixed dropdown — vendors can be anywhere
                  (was previously hardcoded to 5 TX cities with no "All
                  Cities" option, which silently defaulted every search to
                  city=Dallas and hid vendors added with any other city,
                  e.g. Hyderabad). */}
              <input
                type="text"
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                placeholder="All Cities"
                disabled={loading}
              />
            </div>

            <div className="filter-group-compact">
              <label>Insurance</label>
              <select
                value={filters.insurance_status}
                onChange={(e) => handleFilterChange('insurance_status', e.target.value)}
                disabled={loading}
              >
                {INSURANCE_STATUS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="filter-group-compact">
              <label>Min Rating</label>
              <select
                value={filters.min_rating}
                onChange={(e) => handleFilterChange('min_rating', e.target.value)}
                disabled={loading}
              >
                <option value="">All Ratings</option>
                <option value="4">4+ Stars</option>
                <option value="3">3+ Stars</option>
                <option value="2">2+ Stars</option>
                <option value="1">1+ Stars</option>
              </select>
            </div>

            <div className="filter-group-compact">
              <label>Sort By</label>
              <select
                value={filters.sort}
                onChange={(e) => handleFilterChange('sort', e.target.value)}
                disabled={loading}
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {isFiltered && (
            <button 
              className="clear-filters-btn-compact"
              onClick={handleClearFilters}
              disabled={loading}
            >
              Clear Filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(VendorSearchComponent);