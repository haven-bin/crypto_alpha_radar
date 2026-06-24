import express from 'express';
import cors from 'cors';
import db, { initDB } from './db';

// Initialize the database and ensure tables exist
initDB();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;

// API to get all generated signals
app.get('/api/signals', (req, res) => {
    try {
        const stmt = db.prepare('SELECT * FROM signal_table ORDER BY timestamp DESC LIMIT 50');
        const signals = stmt.all();
        res.json(signals);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch signals' });
    }
});

// API to get outcomes (for backtesting review)
app.get('/api/outcomes', (req, res) => {
    try {
        const stmt = db.prepare(`
            SELECT o.*, s.token, s.address 
            FROM outcome_table o
            JOIN signal_table s ON o.signal_id = s.id
            ORDER BY o.timestamp DESC LIMIT 50
        `);
        const outcomes = stmt.all();
        res.json(outcomes);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch outcomes' });
    }
});

// API to get current engine weights
app.get('/api/weights', (req, res) => {
    try {
        const stmt = db.prepare('SELECT * FROM weights_table');
        const weights = stmt.all();
        res.json(weights);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch weights' });
    }
});

app.listen(PORT, () => {
    console.log(`📡 Alpha Radar API running on http://localhost:${PORT}`);
});
