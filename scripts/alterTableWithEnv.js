require('dotenv').config();
const { pool } = require('../src/database/connection');

async function alterTable() {
    let client;
    try {
        console.log('🔄 Conectando ao banco de dados...');
        console.log('📍 DATABASE_URL configurada:', process.env.DATABASE_URL ? 'Sim' : 'Não');
        
        client = await pool.connect();
        
        // Verificar se a coluna já existe
        const checkColumn = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'participantes_importados' 
            AND column_name = 'data_incorporacao'
        `);
        
        if (checkColumn.rows.length > 0) {
            console.log('✅ Coluna data_incorporacao já existe!');
            return;
        }
        
        console.log('🔧 Adicionando coluna data_incorporacao...');
        
        // Adicionar a coluna
        await client.query(`
            ALTER TABLE participantes_importados 
            ADD COLUMN data_incorporacao DATE DEFAULT CURRENT_DATE
        `);
        
        console.log('✅ Coluna data_incorporacao adicionada com sucesso!');
        
        // Atualizar registros existentes que não têm data_incorporacao
        const updateResult = await client.query(`
            UPDATE participantes_importados 
            SET data_incorporacao = COALESCE(carimbo_data_hora::DATE, CURRENT_DATE)
            WHERE data_incorporacao IS NULL
        `);
        
        console.log(`✅ ${updateResult.rowCount} registros atualizados com data_incorporacao!`);
        
    } catch (error) {
        console.error('❌ Erro ao alterar tabela:', error.message);
        throw error;
    } finally {
        if (client) {
            client.release();
        }
        await pool.end();
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    alterTable()
        .then(() => {
            console.log('🎉 Alteração concluída com sucesso!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { alterTable };