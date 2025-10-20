#!/usr/bin/env node

const { pool } = require('../src/database/connection');

async function addDataIncorporacaoColumn() {
    try {
        console.log('Adicionando coluna data_incorporacao na tabela participantes_importados...');
        
        // Verificar se a coluna já existe
        const checkColumnQuery = `
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'participantes_importados' 
            AND column_name = 'data_incorporacao'
        `;
        
        const checkResult = await pool.query(checkColumnQuery);
        
        if (checkResult.rows.length > 0) {
            console.log('✅ Coluna data_incorporacao já existe na tabela.');
            return;
        }
        
        // Adicionar a coluna
        const alterTableQuery = `
            ALTER TABLE participantes_importados 
            ADD COLUMN data_incorporacao DATE DEFAULT CURRENT_DATE
        `;
        
        await pool.query(alterTableQuery);
        
        console.log('✅ Coluna data_incorporacao adicionada com sucesso!');
        
        // Atualizar registros existentes com a data atual
        const updateExistingQuery = `
            UPDATE participantes_importados 
            SET data_incorporacao = CURRENT_DATE 
            WHERE data_incorporacao IS NULL
        `;
        
        const updateResult = await pool.query(updateExistingQuery);
        
        console.log(`✅ ${updateResult.rowCount} registros existentes atualizados com a data atual.`);
        
    } catch (error) {
        console.error('❌ Erro ao adicionar coluna:', error);
        throw error;
    }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
    addDataIncorporacaoColumn()
        .then(() => {
            console.log('Script executado com sucesso!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { addDataIncorporacaoColumn };