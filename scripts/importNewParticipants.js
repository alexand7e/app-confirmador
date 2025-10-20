#!/usr/bin/env node

const path = require('path');
const importService = require('../src/services/importService');

// Configuração do arquivo JSON
const JSON_FILE_PATH = path.resolve(__dirname, '..', 'tableConvert.com_0oretq.json');

async function main() {
    try {
        console.log('=== IMPORTAÇÃO DE NOVOS PARTICIPANTES ===\n');
        console.log(`Arquivo: ${JSON_FILE_PATH}`);
        console.log('Iniciando processo de importação...\n');

        // Executar importação
        const stats = await importService.importFromJson(JSON_FILE_PATH);

        console.log('\n=== PROCESSO CONCLUÍDO ===');
        
        if (stats.imported > 0) {
            console.log(`✅ ${stats.imported} novos participantes foram importados com sucesso!`);
        }
        
        if (stats.duplicates > 0) {
            console.log(`⚠️  ${stats.duplicates} registros foram ignorados por já existirem no banco de dados.`);
        }
        
        if (stats.errors > 0) {
            console.log(`❌ ${stats.errors} registros apresentaram erros e não foram importados.`);
        }

        // Código de saída baseado no resultado
        if (stats.errors > 0) {
            process.exit(1); // Saída com erro se houve problemas
        } else {
            process.exit(0); // Saída normal
        }

    } catch (error) {
        console.error('\n❌ ERRO FATAL:', error.message);
        console.error('\nDetalhes do erro:', error);
        process.exit(1);
    }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
    main();
}

module.exports = { main };