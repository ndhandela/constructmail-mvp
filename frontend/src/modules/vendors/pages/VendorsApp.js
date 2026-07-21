import React, { useState, useEffect, useCallback, useContext } from 'react';
import VendorListTable from '../components/VendorListTable';
import VendorSearch from '../components/VendorSearch';
import AddVendorForm from '../components/AddVendorForm';
import CSVImport from '../components/CSVImport';
import VendorExport from '../components/VendorExport';
import { ProjectContext, ALL_PROJECTS } from '../../../contexts/ProjectContext';
import ModuleLockedNotice, { isModuleLocked } from '../../../components/ModuleLockedNotice';
import '../styles/VendorsApp.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function VendorsApp({ user, userId, onLogout }) {
  const vendorsLocked = isModuleLocked(user?.active_modules, 'vendors');
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [showAddSection, setShowAddSection] = useState(false);
  const [hasMarketplaceLicense, setHasMarketplaceLicense] = useState(false);
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

  const { currentProjectId } = useContext(ProjectContext);

  const searchVendors = useCallback(async () => {
      setLoading(true);
      setSearchError('');
      try {
        const queryParams = new URLSearchParams({
          ...filters,
          limit: pagination.limit,
          offset: pagination.offset
        });
        if (userId) queryParams.set('userId', userId);
        if (currentProjectId && currentProjectId !== ALL_PROJECTS) {
          queryParams.set('project_id', currentProjectId);
        }

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
          setSearchError(data.detail || 'Could not load vendors.');
          setVendors([]);
        }
      } catch (err) {
        console.error('Fetch vendors error:', err);
        setSearchError('Network error. Try again.');
      } finally {
        setLoading(false);
      }
    }, [filters, pagination.limit, pagination.offset, currentProjectId, userId]);

  useEffect(() => {
    if (!vendorsLocked) searchVendors();
  }, [filters, pagination.offset, currentProjectId, searchVendors, vendorsLocked]);

  useEffect(() => {
    const checkMarketplaceLicense = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/marketplace/listings?userId=${userId}`);
        setHasMarketplaceLicense(res.status !== 403);
      } catch {
        setHasMarketplaceLicense(false);
      }
    };
    if (userId && !vendorsLocked) checkMarketplaceLicense();
  }, [userId, vendorsLocked]);

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

  const handleVendorAdded = () => {
      setShowAddSection(false);
      searchVendors();
    };

  return (
    <div className="vendors-app">
      {/* ── Connect link — standalone, top-right, above the page content,
           matching the Clash page's positioning ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 24px 0' }}>
        <a href="/connect" style={{ textDecoration: 'none' }}>
          <button style={{ background: '#D97706', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', fontWeight: '600', fontSize: '0.82rem', cursor: 'pointer' }}>
            ⚡ Connect
          </button>
        </a>
      </div>

      <div className="vendors-hero">
        <div className="vendors-badge">POMAR VENDORS · INTELLIGENCE</div>
        <h1>Contractor & Supplier Intelligence</h1>
        <p>Find trusted contractors and suppliers in your network. View ratings, insurance status, and real GC feedback.</p>
      </div>

      <div className="vendors-container">
        {vendorsLocked ? (
          <ModuleLockedNotice moduleName="Vendors" companyName={user?.company} />
        ) : (
          <>
            {/* Header with Search and Add Button */}
            <div className="vendors-top-bar">
              <div className="vendors-top-left">
                <VendorSearch
                  filters={filters}
                  onFilterChange={handleFilterChange}
                  loading={loading}
                />
              </div>
              <div className="vendors-top-right">
                <VendorExport filters={filters} userId={userId} />
                {!showAddSection && (
                  <button
                    className="add-vendor-btn"
                    onClick={() => setShowAddSection(true)}
                  >
                    ➕ Add Vendor
                  </button>
                )}
              </div>
            </div>

            {/* Add Vendor Section */}
            {showAddSection && (
              <div className="add-vendor-section">
                <div className="add-vendor-header">
                  <h3>Add Vendors to Your Network</h3>
                  <button
                    className="close-add-btn"
                    onClick={() => setShowAddSection(false)}
                  >
                    ✕
                  </button>
                </div>

                <div className="add-vendor-options">
                  <AddVendorForm
                    userId={userId}
                    projectId={currentProjectId !== ALL_PROJECTS ? currentProjectId : null}
                    onVendorAdded={handleVendorAdded}
                  />
                  <div className="divider">OR</div>
                  <CSVImport
                    userId={userId}
                    projectId={currentProjectId !== ALL_PROJECTS ? currentProjectId : null}
                    onImportComplete={handleVendorAdded}
                  />
                </div>
              </div>
            )}

            {/* Vendors List */}
            {searchError ? (
              <div className="vendors-search-error">{searchError}</div>
            ) : (
              <VendorListTable
                vendors={vendors}
                loading={loading}
                pagination={pagination}
                onNextPage={handleNextPage}
                onPrevPage={handlePrevPage}
                userId={userId}
                onVendorUpdated={searchVendors}
                hasMarketplaceLicense={hasMarketplaceLicense}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}