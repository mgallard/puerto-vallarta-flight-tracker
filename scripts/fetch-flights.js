/**
 * Puerto Vallarta Flight Tracker - FlightAware AeroAPI (v4) Fetcher
 * 
 * Fetches daily flight arrivals and departures from FlightAware AeroAPI
 * and saves to data/flights.json
 * 
 * Usage: AEROAPI_KEY=your_key node scripts/fetch-flights.js
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Configuration
const CONFIG = {
    apiKey: process.env.AEROAPI_KEY,
    airportId: 'MMPR', // Puerto Vallarta ICAO code
    baseUrl: 'https://aeroapi.flightaware.com/aeroapi',
    outputPath: path.join(__dirname, '..', 'data', 'flights.json'),
    timezone: 'America/Mexico_City'
};

// Main function
async function main() {
    console.log('🛫 Puerto Vallarta Flight Tracker - FlightAware AeroAPI');
    console.log('='.repeat(55));
    
    // Validate API key
    if (!CONFIG.apiKey) {
        console.error('❌ Error: AEROAPI_KEY environment variable is not set');
        process.exit(1);
    }

    try {
        console.log(`\n📡 Fetching flights for airport: ${CONFIG.airportId}`);
        
        // FlightAware AeroAPI /airports/{id}/flights endpoint
        // This returns scheduled and actual arrivals/departures
        const url = `${CONFIG.baseUrl}/airports/${CONFIG.airportId}/flights?max_pages=5`;
        
        const response = await fetch(url, {
            headers: {
                'x-apikey': CONFIG.apiKey,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request failed: ${response.status} ${response.statusText}\n${errorText}`);
        }

        const data = await response.json();

        // Process data
        const flightData = {
            lastUpdated: new Date().toISOString(),
            airport: {
                code: 'PVR',
                icao: CONFIG.airportId,
                name: 'Gustavo Díaz Ordaz International Airport',
                city: 'Puerto Vallarta',
                timezone: CONFIG.timezone
            },
            arrivals: processFlights([
                ...(data.arrivals || []),
                ...(data.scheduled_arrivals || [])
            ], 'arrival'),
            departures: processFlights([
                ...(data.departures || []),
                ...(data.scheduled_departures || [])
            ], 'departure')
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

// Process FlightAware AeroAPI flight objects into our clean format
function processFlights(flights, type) {
    if (!Array.isArray(flights)) return [];
    
    // Get today's date in Mexico timezone for filtering (ISO YYYY-MM-DD)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: CONFIG.timezone });
    
    const processed = flights
        .map(flight => {
            const isArrival = type === 'arrival';
            
            // Map status
            let status = 'Scheduled';
            if (flight.cancelled) {
                status = 'Cancelled';
            } else if (flight.diverted) {
                status = 'Diverted';
            } else if (isArrival) {
                // Arrival: Landed if actual_on exists, En Route if it has left origin (actual_off)
                if (flight.actual_on) status = 'Landed';
                else if (flight.actual_off) status = 'En Route';
                else status = 'Scheduled';
            } else {
                // Departure: Departed only if actual_off exists
                if (flight.actual_off) status = 'Departed';
                else status = 'Scheduled';
            }

            return {
                flightNumber: flight.ident_iata || flight.ident || '—',
                airline: flight.operator_name || flight.operator || '—',
                airlineCode: flight.operator || '',
                
                // Origin/Destination
                origin: isArrival ? (flight.origin?.name || flight.origin?.city || 'Unknown') : null,
                originCode: isArrival ? (flight.origin?.code_iata || flight.origin?.code || '') : null,
                destination: !isArrival ? (flight.destination?.name || flight.destination?.city || 'Unknown') : null,
                destinationCode: !isArrival ? (flight.destination?.code_iata || flight.destination?.code || '') : null,
                
                // Times (using scheduled_on for arrivals, scheduled_off for departures)
                scheduled: isArrival ? (flight.scheduled_on || flight.scheduled_at) : (flight.scheduled_off || flight.scheduled_at),
                estimated: isArrival ? (flight.estimated_on || flight.estimated_at) : (flight.estimated_off || flight.estimated_at),
                actual: isArrival ? (flight.actual_on || flight.actual_at) : (flight.actual_off || flight.actual_at),
                
                status: status,
                terminal: isArrival ? (flight.arrival_terminal || null) : (flight.departure_terminal || null),
                gate: isArrival ? (flight.arrival_gate || null) : (flight.departure_gate || null)
            };
        })
        .filter(flight => {
            // Only keep flights scheduled for today (in local timezone)
            if (!flight.scheduled) return false;
            try {
                const date = new Date(flight.scheduled);
                const flightLocalDate = date.toLocaleDateString('en-CA', { timeZone: CONFIG.timezone });
                return flightLocalDate === today;
            } catch (e) {
                return false;
            }
        });

    // Deduplicate by flight number
    const uniqueFlights = [];
    const seen = new Set();
    
    // Sort by status priority (Landed/Departed > En Route > Scheduled) then by time
    // to keep the most "active" record if duplicates exist
    processed.sort((a, b) => {
        const statusOrder = { 'Landed': 3, 'Departed': 3, 'En Route': 2, 'Scheduled': 1, 'Cancelled': 0 };
        const statusDiff = (statusOrder[b.status] || 0) - (statusOrder[a.status] || 0);
        if (statusDiff !== 0) return statusDiff;
        
        const timeA = new Date(a.scheduled).getTime();
        const timeB = new Date(b.scheduled).getTime();
        return timeA - timeB;
    });

    for (const flight of processed) {
        if (!seen.has(flight.flightNumber)) {
            seen.add(flight.flightNumber);
            uniqueFlights.push(flight);
        }
    }

    // Final sort by time for the JSON
    return uniqueFlights.sort((a, b) => {
        const timeA = new Date(a.scheduled).getTime();
        const timeB = new Date(b.scheduled).getTime();
        return timeA - timeB;
    });
}

// Save flight data to JSON file
async function saveFlightData(data) {
    const dir = path.dirname(CONFIG.outputPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG.outputPath, JSON.stringify(data, null, 2));
}

// Save empty data structure on error
async function saveEmptyData() {
    const emptyData = {
        lastUpdated: new Date().toISOString(),
        airport: {
            code: 'PVR',
            icao: CONFIG.airportId,
            name: 'Gustavo Díaz Ordaz International Airport',
            city: 'Puerto Vallarta',
            timezone: CONFIG.timezone
        },
        arrivals: [],
        departures: [],
        error: 'Failed to fetch flight data. Will retry on next scheduled run.'
    };
    
    await saveFlightData(emptyData);
}

// Run
main();
