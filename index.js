const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files (HTML, CSS, JS)

const db = new sqlite3.Database('healthcare.db');

// API to fetch infection data
app.get('/api/infections', (req, res) => {
    const { state, hospital, infectionType } = req.query;

    let query = 'SELECT * FROM infections WHERE 1=1';
    const params = [];

    if (state) {
        query += ' AND state = ?';
        params.push(state);
    }

    if (hospital) {
        query += ' AND hospital_id = ?';
        params.push(hospital);
    }

    if (infectionType) {
        query += ' AND measure_name = ?';
        params.push(infectionType);
    }

    db.all(query, params, (err, rows) => {
        if (err) {
            console.error(err.message);
            res.status(500).json({ error: 'Database query failed' });
        } else {
            res.json(rows);
        }
    });
});

// Serve the D3 visualization
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
