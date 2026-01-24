/**
 * Puerto Vallarta Flight Tracker - Data Fetcher
 * 
 * Fetches daily flight arrivals and departures from AviationStack API
 * and saves to data/flights.json
 * 
 * Usage: AVIATIONSTACK_API_KEY=your_key node scripts/fetch-flights.js
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Configuration
const CONFIG = {
    apiKey: process.env.AVIATIONSTACK_API_KEY,
    airportCode: 'PVR', // Puerto Vallarta International Airport
    baseUrl: 'http://api.aviationstack.com/v1', // Free tier is HTTP only
    outputPath: path.join(__dirname, '..', 'data', 'flights.json'),
    timezone: 'America/Mexico_City'
};

// Main function
async function main() {
    console.log('🛫 Puerto Vallarta Flight Tracker - Data Fetch');
    console.log('='.repeat(50));
    
    // Validate API key
    if (!CONFIG.apiKey) {
        console.error('❌ Error: AVIATIONSTACK_API_KEY environment variable is not set');
        console.log('Get your free API key at: https://aviationstack.com/');
        process.exit(1);
    }

    try {
        // Fetch arrivals and departures in parallel
        console.log(`\n📡 Fetching flights for airport: ${CONFIG.airportCode}`);
        
        const [arrivals, departures] = await Promise.all([
            fetchFlights('arr'),
            fetchFlights('dep')
        ]);

        // Process and structure the data
        const flightData = {
            lastUpdated: new Date().toISOString(),
            airport: {
                code: CONFIG.airportCode,
                name: 'Gustavo Díaz Ordaz International Airport',
                city: 'Puerto Vallarta',
                timezone: CONFIG.timezone
            },
            arrivals: processFlights(arrivals, 'arrival'),
            departures: processFlights(departures, 'departure')
        };

        // Save to file
        await saveFlightData(flightData);

        // Summary
        console.log('\n✅ Data fetch complete!');
        console.log(`   Arrivals: ${flightData.arrivals.length} flights`);
        console.log(`   Departures: ${flightData.departures.length} flights`);
        console.log(`   Saved to: ${CONFIG.outputPath}`);

    } catch (error) {
        console.error('\n❌ Error fetching flight data:', error.message);
        
        // Create empty data file on error so the site doesn't break
        await saveEmptyData();
        process.exit(1);
    }
}

// Fetch flights from AviationStack API
async function fetchFlights(type) {
    const endpoint = type === 'arr' ? 'flights' : 'flights';
    const param = type === 'arr' ? 'arr_iata' : 'dep_iata';
    
    const url = `${CONFIG.baseUrl}/${endpoint}?access_key=${CONFIG.apiKey}&${param}=${CONFIG.airportCode}`;
    
    console.log(`   Fetching ${type === 'arr' ? 'arrivals' : 'departures'}...`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Check for API errors
    if (data.error) {
        throw new Error(`API error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    
    return data.data || [];
}

// Process raw flight data into clean format
function processFlights(flights, type) {
    if (!Array.isArray(flights)) return [];
    
    // Get today's date in Mexico timezone
    const today = new Date().toLocaleDateString('en-CA', { timeZone: CONFIG.timezone });
    
    return flights
        .filter(flight => {
            // Only include flights for today
            const flightDate = flight.flight_date;
            return flightDate === today;
        })
        .map(flight => {
            const isArrival = type === 'arrival';
            
            return {
                // Flight identification
                flightNumber: flight.flight?.iata || flight.flight?.icao || 'N/A',
                airline: flight.airline?.name || 'Unknown Airline',
                airlineCode: flight.airline?.iata || flight.airline?.icao || '',
                
                // Origin/Destination
                origin: isArrival ? (flight.departure?.airport || 'Unknown') : null,
                originCode: isArrival ? (flight.departure?.iata || '') : null,
                destination: !isArrival ? (flight.arrival?.airport || 'Unknown') : null,
                destinationCode: !isArrival ? (flight.arrival?.iata || '') : null,
                
                // Times
                scheduled: isArrival 
                    ? (flight.arrival?.scheduled || null)
                    : (flight.departure?.scheduled || null),
                estimated: isArrival
                    ? (flight.arrival?.estimated || null)
                    : (flight.departure?.estimated || null),
                actual: isArrival
                    ? (flight.arrival?.actual || null)
                    : (flight.departure?.actual || null),
                
                // Status
                status: normalizeStatus(flight.flight_status),
                
                // Additional info
                terminal: isArrival 
                    ? (flight.arrival?.terminal || null)
                    : (flight.departure?.terminal || null),
                gate: isArrival
                    ? (flight.arrival?.gate || null)
                    : (flight.departure?.gate || null)
            };
        })
        .filter(flight => flight.flightNumber !== 'N/A'); // Remove invalid entries
}

// Normalize flight status to consistent format
function normalizeStatus(status) {
    if (!status) return 'Scheduled';
    
    const statusMap = {
        'scheduled': 'Scheduled',
        'active': 'En Route',
        'landed': 'Landed',
        'cancelled': 'Cancelled',
        'incident': 'Incident',
        'diverted': 'Diverted',
        'delayed': 'Delayed'
    };
    
    const normalized = statusMap[status.toLowerCase()];
    return normalized || status.charAt(0).toUpperCase() + status.slice(1);
}

// Save flight data to JSON file
async function saveFlightData(data) {
    const dir = path.dirname(CONFIG.outputPath);
    
    // Ensure directory exists
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write formatted JSON
    fs.writeFileSync(CONFIG.outputPath, JSON.stringify(data, null, 2));
}

// Save empty data structure on error
async function saveEmptyData() {
    const emptyData = {
        lastUpdated: new Date().toISOString(),
        airport: {
            code: CONFIG.airportCode,
            name: 'Gustavo Díaz Ordaz International Airport',
            city: 'Puerto Vallarta',
            timezone: CONFIG.timezone
        },
        arrivals: [],
        departures: [],
        error: 'Failed to fetch flight data. Will retry on next scheduled run.'
    };
    
    await saveFlightData(emptyData);
    console.log('   Saved empty data file as fallback');
}

// Run
main();
