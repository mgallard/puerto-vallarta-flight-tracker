/**
 * Puerto Vallarta Flight Tracker - FlightAware Scraper
 * 
 * Scrapes daily flight arrivals and departures from FlightAware
 * and saves to data/flights.json
 * 
 * Usage: node scripts/fetch-flights.js
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Configuration
const CONFIG = {
    airportCode: 'PVR',
    icaoCode: 'MMPR', // Puerto Vallarta ICAO code
    outputPath: path.join(__dirname, '..', 'data', 'flights.json'),
    timezone: 'America/Mexico_City',
    flightAwareBaseUrl: 'https://flightaware.com/live/airport'
};

// Main function
async function main() {
    console.log('🛫 Puerto Vallarta Flight Tracker - FlightAware Scraper');
    console.log('='.repeat(55));
    
    let browser;
    
    try {
        // Launch browser
        console.log('\n🌐 Launching browser...');
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ]
        });

        // Fetch arrivals and departures
        console.log(`\n📡 Scraping flights for airport: ${CONFIG.airportCode} (${CONFIG.icaoCode})`);
        
        const [arrivals, departures] = await Promise.all([
            scrapeFlights(browser, 'arrivals'),
            scrapeFlights(browser, 'departures')
        ]);

        // Structure the data
        const flightData = {
            lastUpdated: new Date().toISOString(),
            airport: {
                code: CONFIG.airportCode,
                name: 'Gustavo Díaz Ordaz International Airport',
                city: 'Puerto Vallarta',
                timezone: CONFIG.timezone
            },
            arrivals: arrivals,
            departures: departures
        };

        // Save to file
        await saveFlightData(flightData);

        // Summary
        console.log('\n✅ Scraping complete!');
        console.log(`   Arrivals: ${flightData.arrivals.length} flights`);
        console.log(`   Departures: ${flightData.departures.length} flights`);
        console.log(`   Saved to: ${CONFIG.outputPath}`);

    } catch (error) {
        console.error('\n❌ Error scraping flight data:', error.message);
        
        // Create empty data file on error so the site doesn't break
        await saveEmptyData();
        process.exit(1);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Scrape flights from FlightAware
async function scrapeFlights(browser, type) {
    const url = `${CONFIG.flightAwareBaseUrl}/${CONFIG.icaoCode}/${type}`;
    console.log(`   Scraping ${type}: ${url}`);
    
    const page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    try {
        // Navigate to page with timeout
        await page.goto(url, { 
            waitUntil: 'networkidle2',
            timeout: 60000 
        });
        
        // Wait for the flight table to load
        await page.waitForSelector('table.prettyTable', { timeout: 30000 });
        
        // Extract flight data from the table
        const flights = await page.evaluate((flightType) => {
            const results = [];
            const table = document.querySelector('table.prettyTable');
            
            if (!table) return results;
            
            const rows = table.querySelectorAll('tbody tr');
            
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 5) return;
                
                // FlightAware table structure varies, but typically:
                // For arrivals: Flight, Origin, Departure, Arrival, Status
                // For departures: Flight, Destination, Departure, Arrival, Status
                
                const flightLink = row.querySelector('td a[href*="/live/flight/"]');
                const flightNumber = flightLink ? flightLink.textContent.trim() : '';
                
                if (!flightNumber) return;
                
                // Get airline from flight number (first 2-3 letters)
                const airlineCode = flightNumber.match(/^[A-Z]{2,3}/)?.[0] || '';
                
                // Get origin/destination (second column typically)
                const locationCell = cells[1];
                const locationLink = locationCell?.querySelector('a');
                const locationText = locationLink ? locationLink.textContent.trim() : locationCell?.textContent.trim() || '';
                const locationCode = locationLink?.href?.match(/airport\/([A-Z]{3,4})/)?.[1] || '';
                
                // Get times - look for time patterns
                const timePattern = /(\d{1,2}:\d{2})\s*(AM|PM)?/gi;
                const allText = row.textContent;
                const times = allText.match(timePattern) || [];
                
                // Get status
                const statusCell = cells[cells.length - 1];
                let status = statusCell?.textContent.trim() || 'Scheduled';
                
                // Clean up status
                if (status.toLowerCase().includes('landed')) status = 'Landed';
                else if (status.toLowerCase().includes('en route') || status.toLowerCase().includes('in air')) status = 'En Route';
                else if (status.toLowerCase().includes('scheduled')) status = 'Scheduled';
                else if (status.toLowerCase().includes('cancelled') || status.toLowerCase().includes('canceled')) status = 'Cancelled';
                else if (status.toLowerCase().includes('delayed')) status = 'Delayed';
                else if (status.toLowerCase().includes('departed')) status = 'Departed';
                
                const flight = {
                    flightNumber: flightNumber,
                    airline: airlineCode, // Will be enriched later if possible
                    airlineCode: airlineCode,
                    scheduled: times[0] || null,
                    status: status
                };
                
                if (flightType === 'arrivals') {
                    flight.origin = locationText;
                    flight.originCode = locationCode;
                    flight.destination = null;
                    flight.destinationCode = null;
                } else {
                    flight.origin = null;
                    flight.originCode = null;
                    flight.destination = locationText;
                    flight.destinationCode = locationCode;
                }
                
                results.push(flight);
            });
            
            return results;
        }, type);
        
        // Enrich airline names
        const enrichedFlights = flights.map(flight => ({
            ...flight,
            airline: getAirlineName(flight.airlineCode)
        }));
        
        return enrichedFlights;
        
    } finally {
        await page.close();
    }
}

// Map airline codes to names
function getAirlineName(code) {
    const airlines = {
        'AA': 'American Airlines',
        'DL': 'Delta Air Lines',
        'UA': 'United Airlines',
        'WN': 'Southwest Airlines',
        'AS': 'Alaska Airlines',
        'B6': 'JetBlue Airways',
        'NK': 'Spirit Airlines',
        'F9': 'Frontier Airlines',
        'AM': 'Aeromexico',
        '5D': 'AeroMexico Connect',
        'Y4': 'Volaris',
        'VB': 'VivaAerobus',
        'AC': 'Air Canada',
        'WS': 'WestJet',
        'TS': 'Air Transat',
        'PD': 'Porter Airlines',
        'SY': 'Sun Country Airlines',
        'G4': 'Allegiant Air',
        'MX': 'Mexicana',
        'BA': 'British Airways',
        'AF': 'Air France',
        'KL': 'KLM',
        'LH': 'Lufthansa',
        'VS': 'Virgin Atlantic',
        'IB': 'Iberia',
        'AV': 'Avianca',
        'CM': 'Copa Airlines',
        'LA': 'LATAM Airlines',
        'EK': 'Emirates',
        'QR': 'Qatar Airways',
        'JL': 'Japan Airlines',
        'NH': 'ANA',
        'KE': 'Korean Air',
        'OZ': 'Asiana Airlines',
        'CX': 'Cathay Pacific',
        'SQ': 'Singapore Airlines',
        'QF': 'Qantas',
        'NZ': 'Air New Zealand',
        'HA': 'Hawaiian Airlines',
        'AY': 'Finnair',
        'SK': 'SAS',
        'LX': 'Swiss International',
        'OS': 'Austrian Airlines',
        'SN': 'Brussels Airlines',
        'TP': 'TAP Portugal',
        'EI': 'Aer Lingus',
        'TK': 'Turkish Airlines',
        'MS': 'EgyptAir',
        'ET': 'Ethiopian Airlines',
        'SA': 'South African Airways',
        'QS': 'SmartWings',
        '4O': 'Interjet'
    };
    
    return airlines[code] || code;
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
