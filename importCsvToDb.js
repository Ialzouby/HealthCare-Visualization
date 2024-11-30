const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const csv = require('csv-parser'); // Add this package if needed

const db = new sqlite3.Database('healthcare.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS infections (
        id INTEGER PRIMARY KEY,
        facility_id TEXT,
        hospital_id TEXT,
        address TEXT,
        city TEXT,
        state TEXT,
        zip_code TEXT,
        county_name TEXT,
        measure_name TEXT,
        compared_to_national TEXT,
        score REAL,
        start_date TEXT,
        end_date TEXT,
        original_address TEXT,
        lat REAL,
        lon REAL
    )`);

    const stmt = db.prepare(`INSERT INTO infections (
        facility_id, hospital_id, address, city, state, zip_code, county_name,
        measure_name, compared_to_national, score, start_date, end_date,
        original_address, lat, lon
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    fs.createReadStream('healthcare_data.csv')
        .pipe(csv())
        .on('data', (row) => {
            stmt.run(
                row.facility_id, row.hospital_id, row.address, row.city, row.state,
                row.zip_code, row.county_name, row.measure_name, row.compared_to_national,
                parseFloat(row.score), row.start_date, row.end_date, row.original_Address,
                parseFloat(row.lat), parseFloat(row.lon)
            );
        })
        .on('end', () => {
            console.log('CSV imported into the database.');
            stmt.finalize();
            db.close();
        });
});
