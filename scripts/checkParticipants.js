#!/usr/bin/env node

const { participantesQueries } = require('../src/database/queries');

async function checkParticipants() {
    try {
        console.log('=== VERIFICAÇÃO DE PARTICIPANTES ===\n');
        
        // Contar total de participantes
        const totalResult = await participantesQueries.countParticipantes();
        const total = totalResult.rows[0].count;
        
        console.log(`Total de participantes no banco: ${total}`);
        
        // Buscar participantes sem rota
        const semRotaResult = await participantesQueries.findWithoutRoute();
        console.log(`Participantes sem rota: ${semRotaResult.rows.length}`);
        
        if (semRotaResult.rows.length > 0) {
            console.log('\nParticipantes sem rota:');
            semRotaResult.rows.forEach((p, index) => {
                console.log(`${index + 1}. ${p.nome} - CPF: ${p.cpf} - Tel: ${p.telefone}`);
            });
        }
        
        // Verificar últimos registros importados
        console.log('\n=== ÚLTIMOS 10 PARTICIPANTES ===');
        const query = `
            SELECT id, nome, telefone, carimbo_data_hora 
            FROM participantes_importados 
            ORDER BY id DESC 
            LIMIT 10
        `;
        
        const { pool } = require('../src/database/connection');
        const ultimosResult = await pool.query(query);
        
        ultimosResult.rows.forEach((p, index) => {
            console.log(`${index + 1}. ID: ${p.id} - ${p.nome} - Tel: ${p.telefone} - Data: ${p.carimbo_data_hora}`);
        });
        
        process.exit(0);
        
    } catch (error) {
        console.error('Erro ao verificar participantes:', error);
        process.exit(1);
    }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
    checkParticipants();
}

module.exports = { checkParticipants };