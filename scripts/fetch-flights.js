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
                '--disable-gpu',
                '--window-size=1920,1080'
            ]
        });

        // Fetch arrivals and departures
        console.log(`\n📡 Scraping flights for airport: ${CONFIG.airportCode} (${CONFIG.icaoCode})`);
        
        // Run sequentially to be less suspicious and easier to debug
        console.log('   Starting arrivals scrape...');
        const arrivals = await scrapeFlights(browser, 'arrivals');
        
        // Small delay between scrapes
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('   Starting departures scrape...');
        const departures = await scrapeFlights(browser, 'departures');

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
    const page = await browser.newPage();
    
    // Set realistic headers
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    });
    
    // Set a modern User Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    try {
        console.log(`   Navigating to: ${url}`);
        
        // Navigate to page
        const response = await page.goto(url, { 
            waitUntil: 'networkidle2',
            timeout: 60000 
        });

        // Debug: Log page title
        const title = await page.title();
        console.log(`   Page Title: "${title}"`);

        // Check if we are being blocked
        if (title.includes('Access Denied') || title.includes('Attention Required') || title.includes('Cloudflare')) {
            console.warn(`   ⚠️ Warning: Detected bot protection page ("${title}")`);
            
            // Log a bit of the body to confirm
            const bodySnippet = await page.evaluate(() => document.body.innerText.substring(0, 200).replace(/\n/g, ' '));
            console.log(`   Body snippet: ${bodySnippet}...`);
            
            // If we are on a block page, we can't continue with this URL
            return [];
        }

        // Wait for the flight table or a "no flights" message
        try {
            // Try to wait for either the table or a known error message
            await Promise.race([
                page.waitForSelector('table.prettyTable', { timeout: 15000 }),
                page.waitForSelector('.noFlights', { timeout: 15000 }),
                page.waitForXPath("//td[contains(text(), 'No flights')]", { timeout: 15000 })
            ]);
        } catch (e) {
            console.warn('   ⚠️ Could not find table with .prettyTable selector, trying fallback...');
            
            // Check if ANY table exists
            const hasTable = await page.evaluate(() => document.querySelectorAll('table').length > 0);
            if (!hasTable) {
                console.error('   ❌ No tables found on page at all.');
                // Take a screenshot for debugging if we were in a local env, 
                // but in CI we just log the HTML structure
                const html = await page.evaluate(() => {
                    const tables = Array.from(document.querySelectorAll('table')).map(t => t.className);
                    return `Tables found: ${tables.length} (${tables.join(', ')})`;
                });
                console.log(`   ${html}`);
                return [];
            }
        }
        
        // Extract flight data from the table
        const flights = await page.evaluate((flightType) => {
            const results = [];
            // Try different table selectors
            const table = document.querySelector('table.prettyTable') || 
                          document.querySelector('table[id*="arrivals"]') || 
                          document.querySelector('table[id*="departures"]') ||
                          document.querySelector('table');
            
            if (!table) return results;
            
            const rows = table.querySelectorAll('tbody tr');
            if (rows.length === 0) return results;
            
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 3) return;
                
                // Flight number is usually in a link
                const flightLink = row.querySelector('td a[href*="/live/flight/"]');
                let flightNumber = flightLink ? flightLink.textContent.trim() : '';
                
                // If no link, try first column
                if (!flightNumber && cells[0]) {
                    flightNumber = cells[0].textContent.trim();
                }
                
                if (!flightNumber || flightNumber.length < 2) return;
                
                // Get airline from flight number (first 2-3 letters)
                const airlineCode = flightNumber.match(/^[A-Z]{2,3}/)?.[0] || '';
                
                // Location logic varies by type
                let locationText = '';
                let locationCode = '';
                
                if (flightType === 'arrivals') {
                    // Usually 2nd column for origin
                    const locCell = cells[1];
                    const locLink = locCell?.querySelector('a');
                    locationText = locLink ? locLink.textContent.trim() : locCell?.textContent.trim() || '';
                    locationCode = locLink?.href?.match(/airport\/([A-Z]{3,4})/)?.[1] || '';
                } else {
                    // Usually 2nd column for destination
                    const locCell = cells[1];
                    const locLink = locCell?.querySelector('a');
                    locationText = locLink ? locLink.textContent.trim() : locCell?.textContent.trim() || '';
                    locationCode = locLink?.href?.match(/airport\/([A-Z]{3,4})/)?.[1] || '';
                }
                
                // Get times - improved regex
                const timePattern = /(\d{1,2}:\d{2})\s*(AM|PM)?/gi;
                const rowText = row.innerText;
                const times = rowText.match(timePattern) || [];
                
                // Get status
                const statusCell = cells[cells.length - 1];
                let status = statusCell?.textContent.trim() || 'Scheduled';
                
                // Clean up status
                const s = status.toLowerCase();
                if (s.includes('landed')) status = 'Landed';
                else if (s.includes('en route') || s.includes('in air') || s.includes('active')) status = 'En Route';
                else if (s.includes('scheduled')) status = 'Scheduled';
                else if (s.includes('cancelled') || s.includes('canceled')) status = 'Cancelled';
                else if (s.includes('delayed')) status = 'Delayed';
                else if (s.includes('departed')) status = 'Departed';
                else if (s.includes('arrived')) status = 'Landed';
                
                const flight = {
                    flightNumber: flightNumber,
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
        
        console.log(`   Found ${enrichedFlights.length} flights for ${type}`);
        return enrichedFlights;
        
    } catch (e) {
        console.error(`   ❌ Error scraping ${type}:`, e.message);
        return [];
    } finally {
        await page.close();
    }
}

// Map airline codes to names
function getAirlineName(code) {
    if (!code) return 'Unknown';
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
    
    return airlines[code.toUpperCase()] || code;
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
