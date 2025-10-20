require('dotenv').config();
const { Pool } = require('pg');

async function checkDatesInDatabase() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        console.log('🔍 Verificando datas no banco de dados...\n');

        // Verificar estrutura da tabela
        const tableStructure = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'participantes_importados' 
            AND column_name IN ('carimbo_data_hora', 'data_incorporacao')
            ORDER BY column_name;
        `);

        console.log('📋 Estrutura das colunas de data:');
        tableStructure.rows.forEach(row => {
            console.log(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable}, default: ${row.column_default})`);
        });
        console.log('');

        // Verificar dados atuais
        const dateStats = await pool.query(`
            SELECT 
                COUNT(*) as total_participantes,
                COUNT(DISTINCT carimbo_data_hora) as datas_carimbo_unicas,
                COUNT(DISTINCT data_incorporacao) as datas_incorporacao_unicas,
                MIN(carimbo_data_hora) as primeira_data_carimbo,
                MAX(carimbo_data_hora) as ultima_data_carimbo,
                MIN(data_incorporacao) as primeira_data_incorporacao,
                MAX(data_incorporacao) as ultima_data_incorporacao
            FROM participantes_importados;
        `);

        const stats = dateStats.rows[0];
        console.log('📊 Estatísticas das datas:');
        console.log(`  Total de participantes: ${stats.total_participantes}`);
        console.log(`  Datas únicas em carimbo_data_hora: ${stats.datas_carimbo_unicas}`);
        console.log(`  Datas únicas em data_incorporacao: ${stats.datas_incorporacao_unicas}`);
        console.log(`  Primeira data carimbo: ${stats.primeira_data_carimbo}`);
        console.log(`  Última data carimbo: ${stats.ultima_data_carimbo}`);
        console.log(`  Primeira data incorporação: ${stats.primeira_data_incorporacao}`);
        console.log(`  Última data incorporação: ${stats.ultima_data_incorporacao}`);
        console.log('');

        // Verificar distribuição por data
        const dateDistribution = await pool.query(`
            SELECT 
                DATE(carimbo_data_hora) as data_carimbo,
                DATE(data_incorporacao) as data_incorporacao,
                COUNT(*) as quantidade
            FROM participantes_importados
            GROUP BY DATE(carimbo_data_hora), DATE(data_incorporacao)
            ORDER BY data_carimbo DESC, data_incorporacao DESC;
        `);

        console.log('📅 Distribuição por data:');
        dateDistribution.rows.forEach(row => {
            console.log(`  Carimbo: ${row.data_carimbo} | Incorporação: ${row.data_incorporacao} | Quantidade: ${row.quantidade}`);
        });
        console.log('');

        // Verificar participantes mais recentes
        const recentParticipants = await pool.query(`
            SELECT 
                nome,
                carimbo_data_hora,
                data_incorporacao,
                projeto_extensao
            FROM participantes_importados
            ORDER BY carimbo_data_hora DESC
            LIMIT 20;
        `);

        console.log('👥 20 participantes mais recentes por carimbo_data_hora:');
        recentParticipants.rows.forEach((row, index) => {
            console.log(`  ${index + 1}. ${row.nome} | Carimbo: ${row.carimbo_data_hora} | Incorporação: ${row.data_incorporacao} | Projeto: ${row.projeto_extensao}`);
        });

    } catch (error) {
        console.error('❌ Erro ao verificar datas:', error);
    } finally {
        await pool.end();
    }
}

checkDatesInDatabase();