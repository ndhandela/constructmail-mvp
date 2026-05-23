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

const CITIES = [
  'Dallas',
  'Houston',
  'Austin',
  'San Antonio',
  'Fort Worth'
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
  const [expandFilters, setExpandFilters] = useState(false);
  const debounceTimer = useRef(null);

  // Update local state when filters prop changes (from outside)
  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  // Debounce search input
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      if (searchInput !== filters.search) {
        onFilterChange({ ...filters, search: searchInput });
      }
    }, 300);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchInput, filters, onFilterChange]);

  const handleFilterChange = (field, value) => {
    onFilterChange({ ...filters, [field]: value });
  };

  const handleClearFilters = () => {
    setSearchInput('');
    onFilterChange({
      search: '',
      trade: '',
      city: 'Dallas',
      min_rating: '',
      insurance_status: '',
      sort: 'newest'
    });
  };

  const isFiltered = searchInput || filters.trade || filters.insurance_status || filters.min_rating;

  return (
    <div className="vendor-search">
      <div className="search-bar">
        <input
          type="text"
          placeholder="Search vendors by name or trade..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="search-input"
          disabled={loading}
        />
        <button 
          className="filter-toggle"
          onClick={() => setExpandFilters(!expandFilters)}
        >
          🔧 Filters
        </button>
      </div>

      {expandFilters && (
        <div className="filters-panel">
          <div className="filters-grid">
            <div className="filter-group">
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

            <div className="filter-group">
              <label>City</label>
              <select
                value={filters.city}
                onChange={(e) => handleFilterChange('city', e.target.value)}
                disabled={loading}
              >
                {CITIES.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
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

            <div className="filter-group">
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

            <div className="filter-group">
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
              className="clear-filters-btn"
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