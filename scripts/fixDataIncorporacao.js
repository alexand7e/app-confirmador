require('dotenv').config();
const { Pool } = require('pg');

async function fixDataIncorporacao() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        console.log('🔧 Corrigindo datas de incorporação...\n');

        // Primeiro, vamos identificar os participantes que foram importados hoje (os 14 novos)
        const todayImports = await pool.query(`
            SELECT COUNT(*) as novos_hoje
            FROM participantes_importados 
            WHERE DATE(carimbo_data_hora) = CURRENT_DATE;
        `);

        console.log(`📊 Participantes importados hoje: ${todayImports.rows[0].novos_hoje}`);

        // Atualizar data_incorporacao para usar a data do carimbo_data_hora para participantes antigos
        const updateOldParticipants = await pool.query(`
            UPDATE participantes_importados 
            SET data_incorporacao = DATE(carimbo_data_hora)
            WHERE carimbo_data_hora IS NOT NULL 
            AND DATE(carimbo_data_hora) != CURRENT_DATE;
        `);

        console.log(`✅ Atualizados ${updateOldParticipants.rowCount} participantes antigos com data_incorporacao baseada no carimbo_data_hora`);

        // Manter data_incorporacao como hoje apenas para os participantes importados hoje
        const updateTodayParticipants = await pool.query(`
            UPDATE participantes_importados 
            SET data_incorporacao = CURRENT_DATE
            WHERE DATE(carimbo_data_hora) = CURRENT_DATE;
        `);

        console.log(`✅ Mantidos ${updateTodayParticipants.rowCount} participantes de hoje com data_incorporacao = hoje`);

        // Para participantes sem carimbo_data_hora, vamos definir uma data antiga
        const updateNullTimestamp = await pool.query(`
            UPDATE participantes_importados 
            SET data_incorporacao = '2025-09-01'::date
            WHERE carimbo_data_hora IS NULL;
        `);

        console.log(`✅ Atualizados ${updateNullTimestamp.rowCount} participantes sem carimbo com data_incorporacao = 2025-09-01`);

        // Verificar resultado final
        const finalStats = await pool.query(`
            SELECT 
                DATE(data_incorporacao) as data_incorporacao,
                COUNT(*) as quantidade
            FROM participantes_importados
            GROUP BY DATE(data_incorporacao)
            ORDER BY data_incorporacao DESC;
        `);

        console.log('\n📅 Distribuição final por data de incorporação:');
        finalStats.rows.forEach(row => {
            const isToday = row.data_incorporacao.toDateString() === new Date().toDateString();
            const marker = isToday ? '🆕' : '📅';
            console.log(`  ${marker} ${row.data_incorporacao.toISOString().split('T')[0]}: ${row.quantidade} participantes`);
        });

        // Mostrar os participantes de hoje (os 14 novos)
        const todayParticipants = await pool.query(`
            SELECT nome, projeto_extensao, carimbo_data_hora
            FROM participantes_importados 
            WHERE DATE(data_incorporacao) = CURRENT_DATE
            ORDER BY carimbo_data_hora DESC;
        `);

        console.log('\n🆕 Participantes importados hoje (novos):');
        todayParticipants.rows.forEach((row, index) => {
            console.log(`  ${index + 1}. ${row.nome} | Projeto: ${row.projeto_extensao || 'N/A'} | Carimbo: ${row.carimbo_data_hora}`);
        });

        console.log('\n✅ Correção concluída! Agora você pode usar o filtro "Hoje (Novos)" para encontrar os 14 participantes importados hoje.');

    } catch (error) {
        console.error('❌ Erro ao corrigir datas:', error);
    } finally {
        await pool.end();
    }
}

fixDataIncorporacao();