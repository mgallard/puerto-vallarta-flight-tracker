// Puerto Vallarta Flight Tracker - Versión en Español
// Carga y muestra datos de vuelos desde JSON en caché

(function() {
    'use strict';

    // Estado
    let flightData = null;
    let currentTab = 'arrivals';

    // Elementos DOM
    const tabButtons = document.querySelectorAll('.tab-btn');
    const flightTbody = document.getElementById('flight-tbody');
    const cityHeader = document.getElementById('city-header');
    const updateTimeEl = document.getElementById('update-time');
    const flightDateEl = document.getElementById('flight-date');

    // Inicializar
    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        setupTabs();
        await loadFlightData();
    }

    // Navegación de pestañas
    function setupTabs() {
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                if (tab === currentTab) return;

                // Actualizar estado activo
                tabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Actualizar encabezado
                cityHeader.textContent = tab === 'arrivals' ? 'Origen' : 'Destino';

                // Cambiar pestaña
                currentTab = tab;
                renderFlights();
            });
        });
    }

    // Cargar datos de vuelos desde archivo JSON
    async function loadFlightData() {
        try {
            const response = await fetch('data/flights.json?' + Date.now());
            if (!response.ok) throw new Error('Error al cargar datos de vuelos');
            
            flightData = await response.json();
            
            // Actualizar hora de última actualización
            if (flightData.lastUpdated) {
                const date = new Date(flightData.lastUpdated);
                updateTimeEl.textContent = formatDateTime(date);
                flightDateEl.textContent = formatDate(date);
            } else {
                updateTimeEl.textContent = 'No disponible';
                flightDateEl.textContent = 'Hoy';
            }

            renderFlights();
        } catch (error) {
            console.error('Error al cargar datos de vuelos:', error);
            showError('No se pudo cargar la información de vuelos. Intente más tarde.');
        }
    }

    // Renderizar tabla de vuelos
    function renderFlights() {
        if (!flightData) return;

        const flights = currentTab === 'arrivals' 
            ? flightData.arrivals 
            : flightData.departures;

        if (!flights || flights.length === 0) {
            showEmpty();
            return;
        }

        // Ordenar por hora
        const sortedFlights = [...flights].sort((a, b) => {
            const timeA = new Date(a.scheduled || a.estimated || 0).getTime();
            const timeB = new Date(b.scheduled || b.estimated || 0).getTime();
            return timeA - timeB;
        });

        // Construir filas de tabla
        const rows = sortedFlights.map(flight => createFlightRow(flight)).join('');
        flightTbody.innerHTML = rows;
    }

    // Crear una fila de vuelo
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
        const statusText = translateStatus(status);

        return `
            <tr>
                <td><span class="flight-time">${time}</span></td>
                <td><span class="flight-number">${escapeHtml(flightNumber)}</span></td>
                <td><span class="airline-name">${escapeHtml(airline)}</span></td>
                <td>
                    <span class="city-name">${escapeHtml(city)}</span>
                    ${cityCode ? `<span class="city-code">(${escapeHtml(cityCode)})</span>` : ''}
                </td>
                <td><span class="status-badge ${statusClass}">${escapeHtml(statusText)}</span></td>
            </tr>
        `;
    }

    // Obtener clase CSS para el estado
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

    // Traducir estado al español
    function translateStatus(status) {
        if (!status) return 'Programado';
        
        const translations = {
            'scheduled': 'Programado',
            'active': 'En vuelo',
            'landed': 'Aterrizó',
            'cancelled': 'Cancelado',
            'canceled': 'Cancelado',
            'delayed': 'Retrasado',
            'diverted': 'Desviado',
            'departed': 'Despegó',
            'on time': 'A tiempo',
            'on-time': 'A tiempo',
            'en route': 'En vuelo',
            'en-route': 'En vuelo',
            'incident': 'Incidente'
        };
        
        const key = status.toLowerCase();
        return translations[key] || status;
    }

    // Formatear hora desde cadena ISO o cadena de hora
    function formatTime(timeStr) {
        if (!timeStr) return '—';
        
        try {
            // Si ya es una cadena de hora como "14:30", devolver tal cual
            if (/^\d{2}:\d{2}$/.test(timeStr)) {
                return timeStr;
            }
            
            // Parsear cadena de fecha ISO
            const date = new Date(timeStr);
            if (isNaN(date.getTime())) return timeStr;
            
            return date.toLocaleTimeString('es-MX', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: 'America/Mexico_City'
            });
        } catch {
            return timeStr;
        }
    }

    // Formatear fecha para mostrar
    function formatDate(date) {
        return date.toLocaleDateString('es-MX', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'America/Mexico_City'
        });
    }

    // Formatear fecha y hora para última actualización
    function formatDateTime(date) {
        return date.toLocaleString('es-MX', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/Mexico_City'
        }) + ' (México)';
    }

    // Mostrar estado vacío
    function showEmpty() {
        const tabName = currentTab === 'arrivals' ? 'llegadas' : 'salidas';
        flightTbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="5">
                    <div class="empty-icon">✈️</div>
                    <div>No hay ${tabName} programadas para hoy</div>
                </td>
            </tr>
        `;
    }

    // Mostrar estado de error
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

    // Escapar HTML para prevenir XSS
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
})();
