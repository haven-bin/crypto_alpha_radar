import Database from 'better-sqlite3';
import path from 'path';

// Connect to SQLite database (creates it if it doesn't exist)
const dbPath = path.resolve(__dirname, '../../radar.db');
const db = new Database(dbPath);

// Initialize database schema
export function initDB() {
    // Enable WAL mode for better performance
    db.pragma('journal_mode = WAL');

    // 1. signal_table: Stores the daily generated opportunities
    db.exec(`
        CREATE TABLE IF NOT EXISTS signal_table (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,          -- e.g., 'bullish', 'bearish'
            token TEXT NOT NULL,         -- Token symbol
            address TEXT NOT NULL,       -- Token address
            description TEXT,            -- Reason for signal
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            score_initial REAL NOT NULL  -- Initial Alpha Score
        )
    `);

    // 2. outcome_table: Stores the 48h review results
    db.exec(`
        CREATE TABLE IF NOT EXISTS outcome_table (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            signal_id INTEGER NOT NULL,
            alpha_return REAL,           -- Excess return over market
            price_change REAL,           -- Price change %
            volume_change REAL,          -- Volume change %
            liquidity_change REAL,       -- Liquidity change %
            smart_money_change TEXT,     -- e.g., 'continues', 'exited'
            result_classification TEXT,  -- 'WIN', 'LOSE', 'NEUTRAL'
            signal_score REAL,           -- Advanced Signal Score (0-100)
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(signal_id) REFERENCES signal_table(id)
        )
    `);

    // 3. weights_table: Dynamic multipliers for Opportunity Engine
    db.exec(`
        CREATE TABLE IF NOT EXISTS weights_table (
            dimension TEXT PRIMARY KEY,
            weight REAL NOT NULL
        )
    `);

    // Seed initial weights if table is empty
    const count = db.prepare('SELECT COUNT(*) as count FROM weights_table').get() as { count: number };
    if (count.count === 0) {
        const stmt = db.prepare('INSERT INTO weights_table (dimension, weight) VALUES (?, ?)');
        db.transaction(() => {
            stmt.run('address_growth', 30);
            stmt.run('volume_growth', 20);
            stmt.run('whale_buying', 20);
            stmt.run('smart_money', 20);
            stmt.run('market_cap', 10);
        })();
        console.log('✅ Initial weights seeded.');
    }
}

export default db;
