// Puerto Vallarta Flight Tracker
// Loads and displays flight data from cached JSON

(function() {
    'use strict';

    // State
    let flightData = null;
    let currentTab = 'arrivals';

    // DOM Elements
    const tabButtons = document.querySelectorAll('.tab-btn');
    const flightTbody = document.getElementById('flight-tbody');
    const cityHeader = document.getElementById('city-header');
    const updateTimeEl = document.getElementById('update-time');
    const flightDateEl = document.getElementById('flight-date');

    // Initialize
    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        setupTabs();
        await loadFlightData();
    }

    // Tab Navigation
    function setupTabs() {
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                if (tab === currentTab) return;

                // Update active state
                tabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update header
                cityHeader.textContent = tab === 'arrivals' ? 'From' : 'To';

                // Switch tab
                currentTab = tab;
                renderFlights();
            });
        });
    }

    // Load flight data from JSON file
    async function loadFlightData() {
        try {
            const response = await fetch('data/flights.json?' + Date.now());
            if (!response.ok) throw new Error('Failed to load flight data');
            
            flightData = await response.json();
            
            // Update last updated time
            if (flightData.lastUpdated) {
                const date = new Date(flightData.lastUpdated);
                updateTimeEl.textContent = formatDateTime(date);
                flightDateEl.textContent = formatDate(date);
            } else {
                updateTimeEl.textContent = 'Not available';
                flightDateEl.textContent = 'Today';
            }

            renderFlights();
        } catch (error) {
            console.error('Error loading flight data:', error);
            showError('Unable to load flight information. Please try again later.');
        }
    }

    // Render flight table
    function renderFlights() {
        if (!flightData) return;

        const flights = currentTab === 'arrivals' 
            ? flightData.arrivals 
            : flightData.departures;

        if (!flights || flights.length === 0) {
            showEmpty();
            return;
        }

        // Sort by time
        const sortedFlights = [...flights].sort((a, b) => {
            const timeA = new Date(a.scheduled || a.estimated || 0).getTime();
            const timeB = new Date(b.scheduled || b.estimated || 0).getTime();
            return timeA - timeB;
        });

        // Build table rows
        const rows = sortedFlights.map(flight => createFlightRow(flight)).join('');
        flightTbody.innerHTML = rows;
    }

    // Create a single flight row
    function createFlightRow(flight) {
        const time = formatTime(flight.scheduled);
        const flightNumber = flight.flightNumber || flight.flight_iata || '—';
        const airline = flight.airline || '—';
        const city = currentTab === 'arrivals' 
            ? (flight.origin || flight.departure_city || '—')
            : (flight.destination || flight.arrival_city || '—');
        const cityCode = currentTab === 'arrivals'
            ? (flight.originCode || flight.departure_iata || '')
            : (flight.destinationCode || flight.arrival_iata || '');
        const status = flight.status || 'Scheduled';
        const statusClass = getStatusClass(status);

        return `
            <tr>
                <td><span class="flight-time">${time}</span></td>
                <td><span class="flight-number">${escapeHtml(flightNumber)}</span></td>
                <td><span class="airline-name">${escapeHtml(airline)}</span></td>
                <td>
                    <span class="city-name">${escapeHtml(city)}</span>
                    ${cityCode ? `<span class="city-code">(${escapeHtml(cityCode)})</span>` : ''}
                </td>
                <td><span class="status-badge ${statusClass}">${escapeHtml(formatStatus(status))}</span></td>
            </tr>
        `;
    }

    // Get CSS class for status
    function getStatusClass(status) {
        if (!status) return 'status-scheduled';
        
        const s = status.toLowerCase();
        
        if (s.includes('cancel')) return 'status-cancelled';
        if (s.includes('delay')) return 'status-delayed';
        if (s.includes('land')) return 'status-landed';
        if (s.includes('depart')) return 'status-departed';
        if (s.includes('active') || s.includes('en route') || s.includes('en-route')) return 'status-active';
        if (s.includes('on time') || s.includes('on-time')) return 'status-ontime';
        if (s.includes('scheduled')) return 'status-scheduled';
        
        return 'status-scheduled';
    }

    // Format status text for display
    function formatStatus(status) {
        if (!status) return 'Scheduled';
        
        // Capitalize first letter of each word
        return status.replace(/\b\w/g, l => l.toUpperCase());
    }

    // Format time from ISO string or time string
    function formatTime(timeStr) {
        if (!timeStr) return '—';
        
        try {
            // If it's already a time string like "14:30", return as-is
            if (/^\d{2}:\d{2}$/.test(timeStr)) {
                return timeStr;
            }
            
            // Parse ISO date string
            const date = new Date(timeStr);
            if (isNaN(date.getTime())) return timeStr;
            
            return date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: 'America/Mexico_City'
            });
        } catch {
            return timeStr;
        }
    }

    // Format date for display
    function formatDate(date) {
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'America/Mexico_City'
        });
    }

    // Format date and time for last updated
    function formatDateTime(date) {
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/Mexico_City'
        }) + ' (Mexico)';
    }

    // Show empty state
    function showEmpty() {
        flightTbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="5">
                    <div class="empty-icon">✈️</div>
                    <div>No ${currentTab} scheduled for today</div>
                </td>
            </tr>
        `;
    }

    // Show error state
    function showError(message) {
        flightTbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="5">
                    <div class="empty-icon">⚠️</div>
                    <div>${escapeHtml(message)}</div>
                </td>
            </tr>
        `;
    }

    // Escape HTML to prevent XSS
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
})();
