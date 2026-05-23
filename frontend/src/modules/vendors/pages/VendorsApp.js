import React, { useState, useEffect, useCallback } from 'react';
import VendorList from '../components/VendorList';
import VendorSearch from '../components/VendorSearch';
import '../styles/VendorsApp.css';
import CSVImport from '../components/CSVImport';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function VendorsApp({ user, userId, onLogout }) {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    trade: '',
    city: 'Dallas',
    min_rating: '',
    insurance_status: '',
    sort: 'newest'
  });
  const [pagination, setPagination] = useState({
    offset: 0,
    limit: 20,
    total: 0
  });

  const searchVendors = useCallback(async (filtersToUse) => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        ...filtersToUse,
        limit: pagination.limit,
        offset: pagination.offset
      });

      const response = await fetch(
        `${API_BASE_URL}/api/vendors?${queryParams}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('admin_token') || ''}`
          }
        }
      );

      const data = await response.json();

      if (data.success) {
        setVendors(data.vendors);
        setPagination(prev => ({ ...prev, total: data.total }));
      } else {
        console.error('Search error:', data.error);
      }
    } catch (err) {
      console.error('Fetch vendors error:', err);
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, pagination.offset]);

  useEffect(() => {
    searchVendors(filters);
  }, [filters, pagination.offset, searchVendors]);

  const handleFilterChange = useCallback((newFilters) => {
    setFilters(newFilters);
    setPagination(prev => ({ ...prev, offset: 0 }));
  }, []);

  const handleNextPage = useCallback(() => {
    setPagination(prev => ({
      ...prev,
      offset: prev.offset + prev.limit
    }));
  }, []);

  const handlePrevPage = useCallback(() => {
    setPagination(prev => ({
      ...prev,
      offset: Math.max(0, prev.offset - prev.limit)
    }));
  }, []);

  return (
    <div className="vendors-app">
      <div className="vendors-hero">
        <div className="vendors-badge">POMAR VENDORS · INTELLIGENCE</div>
        <h1>Contractor & Supplier Intelligence</h1>
        <p>Find trusted contractors and suppliers in your network. View ratings, insurance status, and real GC feedback.</p>
      </div>

      <div className="vendors-container">
        <CSVImport userId={userId} onImportComplete={() => searchVendors()} />
        
        <VendorSearch 
          filters={filters}
          onFilterChange={handleFilterChange}
          loading={loading}
        />
        </div>

      <div className="vendors-container">
        <VendorSearch 
          filters={filters}
          onFilterChange={handleFilterChange}
          loading={loading}
        />

        <VendorList 
          vendors={vendors}
          loading={loading}
          pagination={pagination}
          onNextPage={handleNextPage}
          onPrevPage={handlePrevPage}
        />
      </div>
    </div>
  );
}