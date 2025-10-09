const { Pool } = require('pg');

// Configuração do pool de conexão PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false
    } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Função para testar a conexão
const testConnection = async () => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        client.release();
        console.log('✅ Conexão com PostgreSQL estabelecida com sucesso!');
        console.log('🕐 Timestamp do servidor:', result.rows[0].now);
        return true;
    } catch (error) {
        console.error('❌ Erro ao conectar com PostgreSQL:', error.message);
        throw error;
    }
};

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('🔄 Fechando pool de conexões...');
    await pool.end();
    console.log('✅ Pool de conexões fechado');
    process.exit(0);
});

module.exports = {
    pool,
    testConnection
};